// NOTA FISCAL — emissão de NFS-e direto no Emissor Nacional (Sefin Nacional)
//
// O escritório é ME/EPP do Simples Nacional em Petrolina/PE. Desde 1º/11/2026
// (Res. CGSN 140/2018, art. 59, § 1º, na redação da Res. CGSN 191/2026), o
// Simples emite obrigatoriamente pelo Emissor Nacional, e esta função faz
// isso sem intermediário: monta a DPS (leiaute 1.01), assina com o certificado
// A1 do escritório e envia à API do governo, que devolve a NFS-e na hora.
//
// Ações (POST, corpo JSON com "acao"):
//   diagnostico — confere o certificado e pergunta ao governo como está o
//                 convênio de Petrolina. Primeira coisa a rodar.
//   emitir      — emite a nota de um recebimento.
//   conferir    — para nota que ficou "enviando" (caiu a conexão no meio):
//                 pergunta ao governo se a nota saiu e recupera o XML.
//   cancelar    — registra o evento de cancelamento (só o titular).
//
// Segredos (Supabase → Edge Functions → Secrets), nunca no código:
//   NFSE_CERT_PFX_B64  — o arquivo .pfx do certificado A1, em base64
//   NFSE_CERT_SENHA    — a senha do .pfx
//
// Referências: esquemas XSD 1.01 e Anexo I (regras de negócio) da
// documentação técnica em gov.br/nfse.

import { createClient } from 'jsr:@supabase/supabase-js@2';
// deno-lint-ignore-file no-explicit-any
import forgeMod from 'npm:node-forge@1.3.1';
// a biblioteca não traz tipos; tratamos como 'any'
const forge: any = forgeMod;

const VER_APLIC = 'sistema-bsa-1.0';
const NS_NFSE = 'http://www.sped.fazenda.gov.br/nfse';
const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const BASE = {
  1: 'https://sefin.nfse.gov.br/SefinNacional',
  2: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional',
} as const;

// ------------------------------------------------------------------ XML
// Montamos o XML já na forma canônica (C14N): sem declarações repetidas,
// atributos na ordem certa e toda tag fechada por extenso. Assim o texto que
// é assinado é exatamente o texto que vai no arquivo, sem depender de
// biblioteca de canonicalização.
export type No = [string, Record<string, string> | null, (No | string)[] | string];

const escTexto = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escAttr = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');

export function xml(n: No, nsHerdado?: string): string {
  const [nome, attrs, filhos] = n;
  const pares = Object.entries(attrs || {});
  // C14N: a declaração de namespace vem antes dos demais atributos,
  // e os atributos comuns em ordem alfabética.
  const ns = pares.filter(([k]) => k === 'xmlns');
  const outros = pares.filter(([k]) => k !== 'xmlns').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  if (nsHerdado && !ns.length) ns.push(['xmlns', nsHerdado]);
  const a = [...ns, ...outros].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  const corpo = typeof filhos === 'string' ? escTexto(filhos) : filhos.map((f) => typeof f === 'string' ? escTexto(f) : xml(f)).join('');
  return `<${nome}${a}>${corpo}</${nome}>`;
}

// Elemento só entra se tiver valor.
const el = (nome: string, v: unknown): No[] =>
  v === null || v === undefined || v === '' ? [] : [[nome, null, String(v)]];

// Texto livre: o leiaute não aceita espaço sobrando nem caractere de controle.
export const limpa = (s: unknown, max: number) => String(s ?? '')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  .replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n')
  .trim().slice(0, max).trim();
const dig = (s: unknown) => String(s ?? '').replace(/\D/g, '');
export const dec2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

// ------------------------------------------------------------ certificado
export type Cert = { chave: any; certPem: string; cadeiaPem: string;
  chavePem: string; certB64: string; titular: string; cnpj: string; validade: Date; inicio: Date };

export function lerCertificado(pfxB64: string, senha: string): Cert {
  const der = forge.util.decode64(pfxB64.replace(/\s+/g, ''));
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, senha);
  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ].filter((b: any) => b.key);
  if (!chaves.length) throw new Error('o .pfx não tem chave privada');
  const chave = chaves[0].key;
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])
    .map((b: any) => b.cert).filter(Boolean);
  // O certificado do escritório é o que tem a mesma chave pública da chave privada;
  // os outros são da cadeia (autoridades certificadoras).
  const meu = certs.find((c: any) => c.publicKey.n.equals(chave.n));
  if (!meu) throw new Error('o .pfx não tem o certificado da chave privada');
  const cadeia = certs.filter((c: any) => c !== meu);
  const certPem = forge.pki.certificateToPem(meu);
  const cn = String(meu.subject.getField('CN')?.value ?? '');
  return {
    chave, certPem,
    cadeiaPem: certPem + cadeia.map((c: any) => forge.pki.certificateToPem(c)).join(''),
    // PKCS#8 ("BEGIN PRIVATE KEY"): o TLS do Deno 2 (rustls) não aceita mais a
    // chave no formato antigo PKCS#1 ("BEGIN RSA PRIVATE KEY").
    chavePem: forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(chave))),
    certB64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(meu)).getBytes()),
    titular: cn, cnpj: (cn.match(/(\d{14})\s*$/) || [])[1] || '',
    validade: meu.validity.notAfter, inicio: meu.validity.notBefore,
  };
}

// Assinatura XMLDSig envelopada (RSA-SHA1 + C14N), a mesma usada pelo
// Emissor Nacional e pelas bibliotecas que já emitem em produção.
export function assinar(raiz: No, alvo: No, id: string, cert: Cert, ns: string): string {
  const sha1b64 = (s: string) => {
    const md = forge.md.sha1.create(); md.update(s, 'utf8');
    return forge.util.encode64(md.digest().getBytes());
  };
  const digest = sha1b64(xml(alvo, ns));
  const signedInfo: No = ['SignedInfo', null, [
    ['CanonicalizationMethod', { Algorithm: C14N }, []],
    ['SignatureMethod', { Algorithm: NS_DSIG + 'rsa-sha1' }, []],
    ['Reference', { URI: '#' + id }, [
      ['Transforms', null, [
        ['Transform', { Algorithm: NS_DSIG + 'enveloped-signature' }, []],
        ['Transform', { Algorithm: C14N }, []],
      ]],
      ['DigestMethod', { Algorithm: NS_DSIG + 'sha1' }, []],
      ['DigestValue', null, digest],
    ]],
  ]];
  const md = forge.md.sha1.create(); md.update(xml(signedInfo, NS_DSIG), 'utf8');
  const valor = forge.util.encode64(cert.chave.sign(md));
  const assinatura: No = ['Signature', { xmlns: NS_DSIG }, [
    signedInfo,
    ['SignatureValue', null, valor],
    ['KeyInfo', null, [['X509Data', null, [['X509Certificate', null, cert.certB64]]]]],
  ]];
  (raiz[2] as No[]).push(assinatura);
  return '<?xml version="1.0" encoding="UTF-8"?>' + xml(raiz);
}

// ------------------------------------------------------------ DPS
export type Tomador = { doc: string; nome: string; email?: string; fone?: string;
  end?: { cMun: string; cep: string; lgr: string; nro: string; cpl?: string; bairro: string } };
export type DadosDps = {
  ambiente: 1 | 2; serie: string; numero: number; cnpj: string; codMunicipio: string;
  competencia: string; dhEmi: string; codTribNac: string; codNbs?: string | null;
  descricao: string; valor: number; regApTribSN: number; pTotTribSN: number;
  issRetido: boolean; aliquotaIss?: number | null; tomador: Tomador;
  im?: string | null; infCompl?: string;
};

export function idDps(d: Pick<DadosDps, 'codMunicipio' | 'cnpj' | 'serie' | 'numero'>) {
  return 'DPS' + d.codMunicipio.padStart(7, '0') + '2' + d.cnpj.padStart(14, '0') +
    d.serie.padStart(5, '0') + String(d.numero).padStart(15, '0');
}

export function montarDps(d: DadosDps): { raiz: No; inf: No; id: string } {
  const id = idDps(d);
  const t = d.tomador;
  const docTom = t.doc.length === 14 ? 'CNPJ' : 'CPF';
  const toma: No = ['toma', null, [
    [docTom, null, t.doc],
    ['xNome', null, limpa(t.nome, 300)],
    ...(t.end ? [['end', null, [
      ['endNac', null, [['cMun', null, t.end.cMun], ['CEP', null, t.end.cep]]],
      ['xLgr', null, limpa(t.end.lgr, 255)],
      ['nro', null, limpa(t.end.nro, 60)],
      ...el('xCpl', limpa(t.end.cpl, 156)),
      ['xBairro', null, limpa(t.end.bairro, 60)],
    ]] as No] : []),
    ...el('fone', t.fone),
    ...el('email', t.email),
  ]];
  const inf: No = ['infDPS', { Id: id }, [
    ['tpAmb', null, String(d.ambiente)],
    ['dhEmi', null, d.dhEmi],
    ['verAplic', null, VER_APLIC],
    ['serie', null, d.serie],
    ['nDPS', null, String(d.numero)],
    ['dCompet', null, d.competencia],
    ['tpEmit', null, '1'],
    ['cLocEmi', null, d.codMunicipio],
    ['prest', null, [
      ['CNPJ', null, d.cnpj],
      // IM só se o escritório estiver no cadastro nacional (CNC) de Petrolina (E0116/E0120)
      ...el('IM', d.im),
      ['regTrib', null, [
        ['opSimpNac', null, '3'],                      // ME/EPP
        ['regApTribSN', null, String(d.regApTribSN)],  // 1 = tudo pelo Simples
        ['regEspTrib', null, '0'],                     // obrigatório 0 com regApTribSN = 1
      ]],
    ]],
    toma,
    ['serv', null, [
      ['locPrest', null, [['cLocPrestacao', null, d.codMunicipio]]],
      ['cServ', null, [
        ['cTribNac', null, d.codTribNac],
        ['xDescServ', null, limpa(d.descricao, 1000)],   // regra de negócio: até 1000
        ...el('cNBS', d.codNbs),
      ]],
      ...(d.infCompl ? [['infoCompl', null, [['xInfComp', null, limpa(d.infCompl, 2000)]]] as No] : []),
    ]],
    ['valores', null, [
      ['vServPrest', null, [['vServ', null, dec2(d.valor)]]],
      ['trib', null, [
        ['tribMun', null, [
          ['tribISSQN', null, '1'],
          ['tpRetISSQN', null, d.issRetido ? '2' : '1'],
          // Anexo I: para ME/EPP no Simples, a alíquota só é informada quando o
          // tomador retém o ISS; sem retenção, informá-la é rejeição.
          ...(d.issRetido ? el('pAliq', dec2(Number(d.aliquotaIss))) : []),
        ]],
        // ME/EPP: indTotTrib é proibido; usa-se o percentual aproximado do Simples.
        ['totTrib', null, [['pTotTribSN', null, dec2(d.pTotTribSN)]]],
      ]],
    ]],
    // Grupo IBS/CBS (reforma tributária): para o Simples só é obrigatório a
    // partir de 2027 (Anexo I). Fica de fora até lá.
  ]];
  const raiz: No = ['DPS', { xmlns: NS_NFSE, versao: '1.01' }, [inf]];
  return { raiz, inf, id };
}

export function montarCancelamento(o: { ambiente: 1 | 2; cnpj: string; chave: string;
  dhEvento: string; codigo: '1' | '2' | '9'; motivo: string }) {
  const id = 'PRE' + o.chave + '101101';
  const inf: No = ['infPedReg', { Id: id }, [
    ['tpAmb', null, String(o.ambiente)],
    ['verAplic', null, VER_APLIC],
    ['dhEvento', null, o.dhEvento],
    ['CNPJAutor', null, o.cnpj],
    ['chNFSe', null, o.chave],
    ['e101101', null, [
      ['xDesc', null, 'Cancelamento de NFS-e'],
      ['cMotivo', null, o.codigo],
      ['xMotivo', null, limpa(o.motivo, 255)],
    ]],
  ]];
  const raiz: No = ['pedRegEvento', { xmlns: NS_NFSE, versao: '1.01' }, [inf]];
  return { raiz, inf, id };
}

// Hora de Brasília (sem horário de verão desde 2019), um minuto atrás para não
// cair em "data de emissão no futuro" por diferença de relógio.
export function agoraBrasilia(): string {
  const d = new Date(Date.now() - 60_000 - 3 * 3600_000);
  return d.toISOString().slice(0, 19) + '-03:00';
}

// ------------------------------------------------------------ transporte
async function gzipB64(s: string): Promise<string> {
  const z = new Response(new Blob([new TextEncoder().encode(s)]).stream()
    .pipeThrough(new CompressionStream('gzip')));
  const b = new Uint8Array(await z.arrayBuffer());
  let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzipB64(b64: string): Promise<string> {
  const bin = atob(b64); const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const z = new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip')));
  return await z.text();
}

// A API do governo exige TLS mútuo: a conexão se identifica com o mesmo
// certificado A1. O Deno faz isso com createHttpClient; se o ambiente não
// tiver essa função, cai para o módulo https do Node.
export async function chamarSefin(cert: Cert, ambiente: 1 | 2, metodo: string, caminho: string,
  corpo?: unknown, baseUrl?: string): Promise<{ status: number; json: any; texto: string }> {
  const url = (baseUrl || BASE[ambiente]) + caminho;
  const body = corpo === undefined ? undefined : JSON.stringify(corpo);
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  // deno-lint-ignore no-explicit-any
  const D = Deno as any;
  if (typeof D.createHttpClient === 'function') {
    const client = D.createHttpClient({ cert: cert.cadeiaPem, key: cert.chavePem });
    try {
      // deno-lint-ignore no-explicit-any
      const r = await fetch(url, { method: metodo, headers, body, client } as any);
      const texto = await r.text();
      let json: any = null; try { json = JSON.parse(texto); } catch { /* não-JSON */ }
      return { status: r.status, json, texto };
    } finally { client.close(); }
  }
  const https = await import('node:https');
  return await new Promise((ok, falha) => {
    const u = new URL(url);
    const req = https.request({ method: metodo, hostname: u.hostname, port: u.port || 443,
      path: u.pathname + u.search, headers, cert: cert.cadeiaPem, key: cert.chavePem, timeout: 60_000 },
    (res) => {
      let texto = ''; res.setEncoding('utf8');
      res.on('data', (c: string) => texto += c);
      res.on('end', () => { let json: any = null; try { json = JSON.parse(texto); } catch { /* */ }
        ok({ status: res.statusCode || 0, json, texto }); });
    });
    req.on('timeout', () => req.destroy(new Error('o governo não respondeu em 60s')));
    req.on('error', falha);
    if (body) req.write(body);
    req.end();
  });
}

// A API varia a caixa das chaves (idDps / idDPS); lemos sem ligar para isso.
function pega(o: any, nome: string): any {
  if (!o || typeof o !== 'object') return undefined;
  const k = Object.keys(o).find((x) => x.toLowerCase() === nome.toLowerCase());
  return k ? o[k] : undefined;
}
function errosDe(r: { status: number; json: any; texto: string }) {
  const lista = pega(r.json, 'erros') || pega(r.json, 'erro') || [];
  const arr = Array.isArray(lista) ? lista : [lista];
  const out = arr.filter(Boolean).map((e: any) => ({
    codigo: String(pega(e, 'codigo') ?? ''), descricao: String(pega(e, 'descricao') ?? pega(e, 'mensagem') ?? ''),
    complemento: String(pega(e, 'complemento') ?? ''),
  }));
  return out.length ? out : [{ codigo: String(r.status), descricao: r.texto.slice(0, 500) || 'resposta vazia', complemento: '' }];
}
const tag = (x: string, nome: string) => (x.match(new RegExp(`<${nome}>([^<]*)</${nome}>`)) || [])[1] || null;

// ------------------------------------------------------------ endereço
// O leiaute pede o código IBGE do município do tomador; o cadastro guarda o
// CEP, e o ViaCEP devolve o código. Sem endereço completo, a nota sai sem
// endereço do tomador (é opcional).
async function enderecoTomador(c: any): Promise<Tomador['end'] | undefined> {
  const cep = dig(c.cep);
  if (cep.length !== 8 || !c.endereco) return undefined;
  let via: any = null;
  try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); if (r.ok) via = await r.json(); } catch { /* */ }
  if (!via?.ibge || via.erro) return undefined;
  const txt = String(c.endereco);
  const m = txt.match(/^(.*?)[,\s]+(?:n[º°o.]*\s*)?(\d+[A-Za-z]?|s\/?n)\b[,\s-]*(.*)$/i);
  const lgr = limpa(m ? m[1] : txt, 255) || via.logradouro;
  const bairro = limpa(c.bairro, 60) || via.bairro;
  if (!lgr || !bairro) return undefined;
  return { cMun: String(via.ibge), cep, lgr, nro: m ? m[2].toUpperCase().replace('SN', 'S/N') : 'S/N',
    cpl: m ? limpa(m[3], 156) : '', bairro };
}

// ------------------------------------------------------------ servidor
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

function certificado(): Cert {
  const pfx = Deno.env.get('NFSE_CERT_PFX_B64'), senha = Deno.env.get('NFSE_CERT_SENHA');
  if (!pfx || senha === undefined) throw new Error('certificado não instalado: faltam os segredos NFSE_CERT_PFX_B64 e NFSE_CERT_SENHA');
  return lerCertificado(pfx, senha);
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resp({ erro: 'use POST' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: quem } = await db.auth.getUser(token);
  if (!quem?.user) return resp({ erro: 'entre no sistema de novo' }, 401);
  const { data: eu } = await db.from('usuario').select('id, escritorio_id, perfil')
    .eq('id', quem.user.id).maybeSingle();
  if (!eu || !['titular', 'administrativo'].includes(eu.perfil)) return resp({ erro: 'sem acesso ao financeiro' }, 403);

  const p = await req.json().catch(() => ({}));
  const { data: cfg } = await db.from('nfse_config').select('*').eq('escritorio_id', eu.escritorio_id).maybeSingle();
  if (!cfg) return resp({ erro: 'configure a nota fiscal em Configurações antes de emitir' }, 400);
  const amb = (Number(cfg.ambiente) === 1 ? 1 : 2) as 1 | 2;

  let cert: Cert;
  try { cert = certificado(); } catch (e) { return resp({ erro: String((e as Error).message) }, 500); }

  try {
    // ---------------------------------------------------- diagnóstico
    if (p.acao === 'diagnostico') {
      const conv = await chamarSefin(cert, amb, 'GET', `/parametros_municipais/${cfg.cod_municipio}/convenio`)
        .catch((e) => ({ status: 0, json: null, texto: String(e?.message || e) }));
      return resp({
        ambiente: amb === 1 ? 'produção' : 'produção restrita (teste)',
        certificado: { titular: cert.titular, cnpj: cert.cnpj, valido_ate: cert.validade.toISOString().slice(0, 10),
          confere_com_cadastro: cert.cnpj === dig(cfg.cnpj), vencido: cert.validade < new Date() },
        convenio: { status_http: conv.status, resposta: conv.json ?? conv.texto.slice(0, 800) },
      });
    }

    // ---------------------------------------------------- emitir
    if (p.acao === 'emitir') {
      if (cert.validade < new Date()) return resp({ erro: 'o certificado digital venceu' }, 400);
      if (cert.cnpj && cert.cnpj !== dig(cfg.cnpj)) return resp({ erro: 'o certificado é de outro CNPJ' }, 400);

      const valor = Math.round(Number(p.valor_servico) * 100) / 100;
      if (!(valor > 0)) return resp({ erro: 'valor da nota inválido' }, 400);
      const comp = String(p.competencia || '');
      const dhEmi = agoraBrasilia();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(comp) || comp > dhEmi.slice(0, 10))
        return resp({ erro: 'a competência não pode ser depois de hoje' }, 400);
      const descricao = limpa(p.descricao, 2000);
      if (!descricao) return resp({ erro: 'falta a descrição do serviço' }, 400);
      if (descricao.length > 1000) return resp({ erro: 'a descrição passa de 1000 caracteres; encurte' }, 400);
      const retido = !!p.iss_retido;
      if (retido && !(Number(cfg.aliquota_iss_sn) >= 1.8))
        return resp({ erro: 'com ISS retido, informe em Configurações a alíquota de ISS do Simples (mínimo 2%)' }, 400);

      // parceria: a nota sai pela parte do escritório (total menos repasse,
      // art. 15, § 9º, EAOAB) ou — quando o parceiro não emite nota — pelo total.
      let parceiro: any = null;
      if (p.parceiro_id) {
        const { data } = await db.from('parceiro').select('id, nome, escritorio, razao_social, cnpj')
          .eq('id', p.parceiro_id).eq('escritorio_id', eu.escritorio_id).maybeSingle();
        if (!data) return resp({ erro: 'parceiro não encontrado' }, 400);
        const tot = Number(p.valor_total_recebido), rep = Number(p.valor_parceria);
        if (!(tot > 0) || !(rep > 0) || rep >= tot)
          return resp({ erro: 'na parceria, confira o total recebido e o valor repassado' }, 400);
        const peloTotal = !!p.nota_total;
        if (peloTotal ? Math.abs(tot - valor) > 0.005 : Math.abs(tot - rep - valor) > 0.005)
          return resp({ erro: peloTotal ? 'na nota pelo total, o valor da nota deve ser o total recebido'
            : 'na parceria, o valor da nota deve ser o total recebido menos o repasse' }, 400);
        // o CNPJ do parceiro só entra na descrição quando a nota exclui a parte dele
        if (!peloTotal && dig(data.cnpj).length !== 14) return resp({ erro: 'cadastre o CNPJ do parceiro antes' }, 400);
        parceiro = data;
      }

      const { data: cli } = await db.from('cliente')
        .select('id, nome, tipo, cpf_cnpj, email, telefone, whatsapp, endereco, bairro, cidade, uf, cep')
        .eq('id', p.cliente_id).eq('escritorio_id', eu.escritorio_id).maybeSingle();
      if (!cli) return resp({ erro: 'escolha o cliente (tomador)' }, 400);
      const doc = dig(cli.cpf_cnpj);
      if (doc.length !== 11 && doc.length !== 14) return resp({ erro: 'o cliente está sem CPF/CNPJ válido no cadastro' }, 400);
      const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(cli.email || '').trim()) ? String(cli.email).trim().slice(0, 80) : undefined;
      const fone = dig(cli.telefone || cli.whatsapp);
      const tomador: Tomador = { doc, nome: cli.nome, email, fone: fone.length >= 6 ? fone.slice(-20) : undefined,
        end: await enderecoTomador(cli) };
      // Anexo I: tomador empresa (E0235) e nota com ISS retido (E0237) exigem endereço.
      if (!tomador.end && (doc.length === 14 || retido))
        return resp({ erro: 'para cliente empresa (ou com ISS retido) a nota exige o endereço completo do tomador: logradouro com número, bairro e CEP no cadastro' }, 400);

      if (p.lancamento_id) {
        const { data: ja } = await db.from('nota_fiscal').select('id, situacao')
          .eq('lancamento_id', p.lancamento_id).eq('ambiente', amb).in('situacao', ['emitida', 'enviando']).limit(1);
        if (ja?.length && !p.mesmo_assim) return resp({ erro: 'este recebimento já tem nota', nota_id: ja[0].id }, 409);
      }

      const { data: numero, error: en } = await db.rpc('nfse_reservar_numero', { p_escritorio: eu.escritorio_id, p_ambiente: amb });
      if (en || !numero) return resp({ erro: 'não consegui reservar o número da DPS: ' + (en?.message || '') }, 500);

      const dados: DadosDps = { ambiente: amb, serie: String(cfg.serie), numero: Number(numero), cnpj: dig(cfg.cnpj),
        codMunicipio: cfg.cod_municipio, competencia: comp, dhEmi, codTribNac: cfg.cod_trib_nac, codNbs: cfg.cod_nbs,
        descricao, valor, regApTribSN: Number(cfg.reg_ap_trib_sn), pTotTribSN: Number(cfg.p_tot_trib_sn),
        issRetido: retido, aliquotaIss: cfg.aliquota_iss_sn, tomador, im: dig(cfg.inscricao_municipal) || null,
        infCompl: 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Dispensada a retenção de IRRF (IN SRF 765/2007) e de PIS/COFINS/CSLL (Lei 10.833/2003, art. 32).' };
      const { raiz, inf, id } = montarDps(dados);
      const xmlDps = assinar(raiz, inf, id, cert, NS_NFSE);

      const { data: nota, error: ei } = await db.from('nota_fiscal').insert({
        escritorio_id: eu.escritorio_id, lancamento_id: p.lancamento_id || null, cliente_id: cli.id,
        caso_id: p.caso_id || null, parceiro_id: parceiro?.id || null, ambiente: amb, serie: dados.serie,
        numero_dps: dados.numero, id_dps: id, competencia: comp, valor_servico: valor,
        valor_total_recebido: parceiro ? Number(p.valor_total_recebido) : null,
        valor_parceria: parceiro ? Number(p.valor_parceria) : null, iss_retido: retido, descricao,
        tomador, situacao: 'enviando', xml_dps: xmlDps, criado_por: eu.id,
      }).select('id').single();
      if (ei) return resp({ erro: 'não consegui registrar a nota: ' + ei.message }, 500);

      let r;
      try {
        r = await chamarSefin(cert, amb, 'POST', '/nfse', { dpsXmlGZipB64: await gzipB64(xmlDps) });
      } catch (e) {
        return resp({ nota_id: nota.id, situacao: 'enviando',
          aviso: 'A conexão com o governo caiu antes da resposta. Use "Conferir" em alguns minutos: se a nota saiu, ela aparece.',
          detalhe: String((e as Error).message) });
      }
      return resp(await registrarResposta(db, nota.id, r));
    }

    // ---------------------------------------------------- conferir
    if (p.acao === 'conferir') {
      const { data: n } = await db.from('nota_fiscal').select('*').eq('id', p.nota_id)
        .eq('escritorio_id', eu.escritorio_id).maybeSingle();
      if (!n) return resp({ erro: 'nota não encontrada' }, 404);
      const r = await chamarSefin(cert, n.ambiente, 'GET', `/dps/${n.id_dps}`);
      const chave = pega(r.json, 'chaveAcesso');
      if (r.status === 404 || !chave) {
        if (n.situacao === 'enviando') {
          await db.from('nota_fiscal').update({ situacao: 'rejeitada',
            erros: [{ codigo: 'nao-gerada', descricao: 'O governo não tem nota para esta DPS. Pode emitir de novo.', complemento: '' }] }).eq('id', n.id);
        }
        return resp({ nota_id: n.id, situacao: n.situacao === 'enviando' ? 'rejeitada' : n.situacao, aviso: 'o governo não tem nota para esta DPS' });
      }
      const rn = await chamarSefin(cert, n.ambiente, 'GET', `/nfse/${chave}`);
      return resp(await registrarResposta(db, n.id, { ...rn, json: { ...(rn.json || {}), chaveAcesso: chave } }));
    }

    // ---------------------------------------------------- cancelar
    if (p.acao === 'cancelar') {
      if (eu.perfil !== 'titular') return resp({ erro: 'só o titular cancela nota' }, 403);
      const { data: n } = await db.from('nota_fiscal').select('*').eq('id', p.nota_id)
        .eq('escritorio_id', eu.escritorio_id).maybeSingle();
      if (!n || n.situacao !== 'emitida' || !n.chave_acesso) return resp({ erro: 'só nota emitida pode ser cancelada' }, 400);
      const codigo = ['1', '2', '9'].includes(String(p.codigo)) ? String(p.codigo) as '1' | '2' | '9' : '1';
      const motivo = limpa(p.motivo, 255);
      if (motivo.length < 15) return resp({ erro: 'explique o motivo com pelo menos 15 letras' }, 400);
      const { raiz, inf, id } = montarCancelamento({ ambiente: n.ambiente, cnpj: dig(cfg.cnpj), chave: n.chave_acesso,
        dhEvento: agoraBrasilia(), codigo, motivo });
      const xmlEvt = assinar(raiz, inf, id, cert, NS_NFSE);
      const r = await chamarSefin(cert, n.ambiente, 'POST', `/nfse/${n.chave_acesso}/eventos`,
        { pedidoRegistroEventoXmlGZipB64: await gzipB64(xmlEvt) });
      if (r.status >= 200 && r.status < 300) {
        await db.from('nota_fiscal').update({ situacao: 'cancelada', cancelada_em: new Date().toISOString(),
          motivo_cancelamento: motivo }).eq('id', n.id);
        return resp({ nota_id: n.id, situacao: 'cancelada' });
      }
      return resp({ erro: 'o governo recusou o cancelamento', erros: errosDe(r) }, 400);
    }

    return resp({ erro: 'ação desconhecida' }, 400);
  } catch (e) {
    return resp({ erro: 'falha: ' + String((e as Error)?.message || e) }, 500);
  }
});

// Grava o que o governo respondeu à DPS (gerou a nota ou rejeitou).
async function registrarResposta(db: any, notaId: string, r: { status: number; json: any; texto: string }) {
  const b64 = pega(r.json, 'nfseXmlGZipB64');
  const chave = pega(r.json, 'chaveAcesso');
  if (r.status >= 200 && r.status < 300 && b64) {
    const xmlNfse = await gunzipB64(b64);
    const numero = tag(xmlNfse, 'nNFSe');
    const dh = tag(xmlNfse, 'dhProc') || pega(r.json, 'dataHoraProcessamento') || new Date().toISOString();
    const chaveFinal = chave || ((xmlNfse.match(/Id="NFS(\d{50})"/) || [])[1]) || null;
    await db.from('nota_fiscal').update({ situacao: 'emitida', chave_acesso: chaveFinal, numero_nfse: numero,
      emitida_em: dh, xml_nfse: xmlNfse, erros: pega(r.json, 'alertas') || null }).eq('id', notaId);
    return { nota_id: notaId, situacao: 'emitida', numero_nfse: numero, chave_acesso: chaveFinal,
      alertas: pega(r.json, 'alertas') || [] };
  }
  const erros = errosDe(r);
  await db.from('nota_fiscal').update({ situacao: 'rejeitada', erros }).eq('id', notaId);
  return { nota_id: notaId, situacao: 'rejeitada', erros };
}
