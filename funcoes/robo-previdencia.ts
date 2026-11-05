// ROBÔ DA PREVIDÊNCIA — base de conhecimento do módulo Previdenciário
// Roda no Supabase Edge Functions, agendado por pg_cron (segunda, 7h de Brasília, uma chamada por fonte).
// Lê quatro fontes oficiais e põe o que achar na fila prev_atualizacao, como SUGESTÃO:
//   1. Diário Oficial da União (in.gov.br) — instruções normativas do INSS, portarias
//      DIRBEN, portarias interministeriais (reajuste, mínimo, teto), leis, decretos e MPs;
//   2. Banco Nacional de Precedentes do CNJ (Pangea) — temas e súmulas do STF, STJ, TNU,
//      TRF1 e TRF5 criados ou atualizados desde a última rodada;
//   3. IBGE (SIDRA, tabela 1736) — INPC mensal ainda ausente da tabela de índices;
//   4. Notícias do CJF — decisões da TNU.
// Nada aqui muda a biblioteca nem as tabelas de cálculo: quem decide é o titular, na tela.
// Cada achado tem uma chave única, então rodar de novo não duplica nada.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Leitura = { achados: Achado[]; lidos: number; vistos?: Record<string, unknown>[] };
type Achado = {
  chave: string; fonte: string; tipo: string; titulo: string; resumo?: string | null;
  link?: string | null; data?: string | null; afeta_tabela?: boolean; norma_chave?: string | null;
  dados?: Record<string, unknown>;
};

const UA = { 'User-Agent': 'Mozilla/5.0 (robo-previdencia; escritorio)', Accept: 'text/html,application/json,*/*', 'Accept-Language': 'pt-BR,pt;q=0.9' };
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const semTag = (s: unknown) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const brIso = (s: string) => { const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function comPrazo(url: string, init: RequestInit = {}, ms = 60000): Promise<Response> {
  for (let tentativa = 1; ; tentativa++) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try {
      const r = await fetch(url, { ...init, signal: c.signal, headers: { ...UA, ...(init.headers || {}) } });
      if (r.status >= 500 && tentativa < 3) { await espera(3000 * tentativa); continue; }
      return r;
    } catch (e) { if (tentativa >= 3) throw e; await espera(3000 * tentativa); }
    finally { clearTimeout(t); }
  }
}

// ------------------------------------------------------------------ 1. DOU
// A busca do DOU devolve a página com os resultados num JSON embutido (até 50 por página).
// Filtrar pelo tipo de ato tira editais, extratos, licitações e atos de pessoal.
const DOU_BUSCAS: [string, string][] = [
  ['INSS', 'Instrução Normativa'],
  ['DIRBEN', ''],
  ['"Previdência Social"', 'Portaria Interministerial'],
  ['"Previdência Social"', 'Portaria Conjunta'],
  ['"salários de contribuição"', 'Portaria'],
  ['"Previdência Social"', 'Lei'],
  ['"Previdência Social"', 'Lei Complementar'],
  ['"Previdência Social"', 'Medida Provisória'],
  ['"Previdência Social"', 'Decreto'],
  ['"Previdência Social"', 'Emenda Constitucional'],
  ['"Conselho de Recursos da Previdência Social"', 'Resolução'],
];
const ORGAOS_OK = /Previd[êe]ncia Social|Seguro Social|Atos do Poder (Legislativo|Executivo)|Presid[êe]ncia da Rep[úu]blica|Congresso Nacional|Minist[ée]rio da Fazenda/i;
const PESSOAL = /\b(nomear|exonerar|dispensar|designar|cargo comissionado|CCE|FCE|afastamento do pa[ií]s|cess[aã]o de servidor|licita[cç]|preg[aã]o|extrato de contrato|substitut[oa] eventual|lota[cç][aã]o|di[aá]rias|conselheir[oa]s?\b|delegar compet|processo administrativo disciplinar|abono de perman)/i;
const BENEFICIO = /benef[ií]cio|aposentadoria|pens[aã]o|segurad|sal[aá]rio[- ]de[- ]contribui|reajust|teto|sal[aá]rio m[ií]nimo|per[ií]cia|BPC|LOAS|CNIS|requerimento|tempo de contribui|aux[ií]lio|reclus[aã]o|maternidade|atualiza[cç][aã]o|recurso|8\.213|8\.212|3\.048|103\/2019/i;
// o que pode mudar mínimo, teto, limite da reclusão ou cota do salário-família. As portarias
// mensais de "fatores de atualização" não entram aqui: seguem o INPC, que vem do IBGE.
const TABELA = /reajust|sal[aá]rio m[ií]nimo|limite m[aá]ximo|\bteto\b|aux[ií]lio-reclus[aã]o|cota do sal[aá]rio-fam[ií]lia|INTERMINISTERIAL MPS\/MF/i;
const TIPO_NORMA: Record<string, string> = {
  'Instrução Normativa': 'instrucao_normativa', 'Portaria': 'portaria', 'Portaria Interministerial': 'portaria',
  'Portaria Conjunta': 'portaria', 'Lei': 'lei', 'Lei Complementar': 'lei_complementar', 'Medida Provisória': 'medida_provisoria',
  'Decreto': 'decreto', 'Emenda Constitucional': 'emenda', 'Resolução': 'outro',
};

async function lerDou(desde: string): Promise<Leitura> {
  const dmy = (d: string) => d.split('-').reverse().join('-');   // o DOU quer dd-mm-aaaa
  const janela = `exactDate=personalizado&publishFrom=${dmy(desde)}&publishTo=${dmy(iso(new Date()))}&delta=50`;   // 50 é o máximo que o DOU aceita por página
  const vistos = new Map<string, Achado>(); let lidos = 0;
  const umaBusca = async ([q, art]: [string, string]) => {
    const u = `https://www.in.gov.br/consulta/-/buscar/dou?q=${encodeURIComponent(q)}&s=do1&${janela}&sortType=1` + (art ? `&artType=${encodeURIComponent(art)}` : '');
    const r = await comPrazo(u, {}, 90000);
    if (!r.ok) throw new Error(`DOU ${r.status}`);
    const h = await r.text();
    const m = h.match(/BuscaDouPortlet_params"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) throw new Error('DOU: página sem resultados legíveis (o site pode ter mudado)');
    const arr = (JSON.parse(m[1]).jsonArray || []) as any[];
    lidos += arr.length;
    for (const x of arr) {
      const titulo = semTag(x.title), texto = semTag(x.content), org = String(x.hierarchyStr || '');
      if (art && x.artType !== art) continue;
      if (!ORGAOS_OK.test(org)) continue;
      if (PESSOAL.test(texto) && !/instru[cç][aã]o normativa|lei|decreto/i.test(String(x.artType))) continue;
      if (!art && !BENEFICIO.test(texto + ' ' + titulo)) continue;
      const chave = 'dou-' + x.urlTitle;
      if (vistos.has(chave)) continue;
      vistos.set(chave, {
        chave, fonte: 'dou', tipo: 'norma', titulo, resumo: texto.slice(0, 600),
        link: 'https://www.in.gov.br/web/dou/-/' + x.urlTitle, data: brIso(x.pubDate),
        afeta_tabela: TABELA.test(titulo + ' ' + texto),
        dados: { categoria: 'publicacao', tipo: TIPO_NORMA[x.artType] || 'outro', orgao: org.split('/').slice(-1)[0], ato: x.artType, edicao: x.editionNumber, pagina: x.numberPage },
      });
    }
  };
  // três buscas por vez, com pausa entre elas, para não parecer rajada ao DOU
  const falhas: string[] = [];
  for (let i = 0; i < DOU_BUSCAS.length; i += 3) {
    const r = await Promise.allSettled(DOU_BUSCAS.slice(i, i + 3).map(umaBusca));
    r.forEach((x: any) => x.status === 'rejected' && falhas.push(String(x.reason?.message || x.reason)));
    await espera(1000);
  }
  if (falhas.length === DOU_BUSCAS.length) throw new Error(falhas[0]);
  return { achados: [...vistos.values()], lidos };
}

// ------------------------------------------------------------------ 2. CNJ (Pangea/BNP)
const CNJ_TERMOS = ['previdenciário', 'INSS', 'aposentadoria', 'segurado', 'pensão por morte', 'auxílio-doença',
  'incapacidade temporária', 'auxílio-acidente', 'benefício assistencial', 'salário-maternidade', 'auxílio-reclusão',
  'tempo especial', 'atividade rural', 'Regime Geral'];
const CNJ_ORGAOS = ['STF', 'STJ', 'TNU', 'TRF01', 'TRF05'];
const CNJ_TIPOS = ['SUM', 'SV', 'RG', 'ADI', 'ADC', 'ADO', 'ADPF', 'IAC', 'SIRDR', 'RR', 'CT', 'IRDR', 'PUIL', 'NT'];
// fora do escopo: custeio e tributação (contribuição patronal), regimes próprios
const CNJ_FORA = /cota patronal|contribui[cç][aã]o previdenci[aá]ria (patronal|sobre|incidente)|tribut|compensa[cç][aã]o|imposto|PIS|COFINS|regime pr[oó]prio|servidor p[uú]blico (estatut|federal|estadual|municipal)|militar/i;
const CNJ_TIPO: Record<string, string> = { RG: 'tema_stf', ADI: 'acao_controle', ADC: 'acao_controle', ADO: 'acao_controle', ADPF: 'acao_controle', SV: 'sumula_vinculante', RR: 'tema_stj', CT: 'controversia', PUIL: 'tema_tnu', IRDR: 'irdr', SIRDR: 'irdr', IAC: 'iac', NT: 'nota_tecnica' };
const chaveCnj = (x: any) => String(x.id || `${x.orgao}-${x.tipo}-${x.nr}`).toLowerCase();

// Uma "assinatura" por tema (resumo numérico de situação + tese). O robô guarda a última que viu em
// prev_cnj_visto e só põe na fila o tema novo ou o que mudou de assinatura: o CNJ
// reprocessa lotes inteiros de temas antigos, e a data de atualização sozinha não serve.
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const dmY = (isoD: string) => isoD.split('-').reverse().join('/');   // o filtro do CNJ só aceita dd/mm/aaaa

async function lerCnj(db: any, desde: string): Promise<Leitura> {
  const itens = new Map<string, any>(); let lidos = 0;
  const umaBusca = async (termo: string) => {
    for (let pagina = 1; pagina <= 10; pagina++) {
      const filtro = { buscaGeral: termo, todasPalavras: '', quaisquerPalavras: '', semPalavras: '', trechoExato: '',
        atualizacaoDesde: dmY(desde), atualizacaoAte: '', cancelados: true, ordenacao: 'Text', nr: '', pagina, tamanhoPagina: 50,
        orgaos: CNJ_ORGAOS, tipos: CNJ_TIPOS };
      const r = await comPrazo('https://pangeabnp.pdpj.jus.br/api/v1/precedentes', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ filtro }) });
      if (!r.ok) throw new Error(`CNJ ${r.status}`);
      const j = await r.json(); const rs = (j.resultados || []) as any[]; lidos += rs.length;
      for (const x of rs) {
        const questao = semTag(x.questao), tese = semTag(x.tese);
        if (CNJ_FORA.test(questao + ' ' + tese)) continue;
        itens.set(chaveCnj(x), { x, questao, tese, assinatura: semTag(x.situacao) + '|' + tese });
      }
      if (rs.length < 50 || pagina * 50 >= (j.total || 0)) break;
    }
  };
  const res: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < CNJ_TERMOS.length; i += 5) res.push(...await Promise.allSettled(CNJ_TERMOS.slice(i, i + 5).map(umaBusca)));
  const falhas = res.filter((r) => r.status === 'rejected').map((r: any) => String(r.reason?.message || r.reason));
  if (falhas.length === CNJ_TERMOS.length) throw new Error(falhas[0]);

  const chaves = [...itens.keys()], antes = new Map<string, { assinatura: string; situacao: string | null }>();
  for (let i = 0; i < chaves.length; i += 200) {
    const { data } = await db.from('prev_cnj_visto').select('chave,assinatura,situacao').in('chave', chaves.slice(i, i + 200));
    (data || []).forEach((v: any) => antes.set(v.chave, v));
  }
  const achados: Achado[] = [], vistos: any[] = [];
  // sem foto nenhuma (primeira vez), só fotografa: senão a fila receberia o banco inteiro
  const primeiraFoto = antes.size === 0 && itens.size > 50;
  for (const [nchave, { x, questao, tese, assinatura }] of itens) {
    const anterior = antes.get(nchave), assin = hash(assinatura);
    if (anterior?.assinatura === assin) continue;
    vistos.push({ chave: nchave, assinatura: assin, situacao: semTag(x.situacao) || null, visto_em: new Date().toISOString() });
    if (primeiraFoto) continue;
    const situacaoAntes = anterior ? anterior.situacao : null;
    const rotulo = x.tipo === 'SUM' ? `Súmula ${x.nr} do ${x.orgao}` : x.tipo === 'SV' ? `Súmula Vinculante ${x.nr}`
      : x.tipo === 'RG' ? `Tema ${x.nr} do STF` : x.tipo === 'RR' ? `Tema ${x.nr} do STJ`
      : x.tipo === 'PUIL' ? `Tema ${x.nr} da TNU` : `${x.tipo} ${x.nr} — ${x.orgao}`;
    const mudou = anterior === undefined ? 'novo no banco do CNJ'
      : situacaoAntes !== semTag(x.situacao) ? `situação: ${situacaoAntes || '—'} → ${semTag(x.situacao)}` : 'tese alterada';
    const link = x.processosParadigma?.[0]?.link || 'https://pangeabnp.pdpj.jus.br/';
    achados.push({
      chave: `cnj-${nchave}@${assin}`, fonte: 'cnj', tipo: 'jurisprudencia',
      titulo: `${rotulo} (${mudou}): ${questao || tese}`.slice(0, 300),
      resumo: [semTag(x.situacao) && `Situação: ${semTag(x.situacao)}`, tese && `Tese: ${tese}`, !tese && questao && `Questão: ${questao}`].filter(Boolean).join('\n'),
      link, data: brIso(x.ultimaAtualizacao) || iso(new Date()), norma_chave: nchave,
      dados: { categoria: 'jurisprudencia', tipo: x.tipo === 'SUM' ? `sumula_${String(x.orgao).toLowerCase()}` : (CNJ_TIPO[x.tipo] || 'outro'),
        numero: x.tipo === 'SUM' ? `Súmula ${x.nr}` : `Tema ${x.nr}`, orgao: x.orgao, questao, tese, situacao: semTag(x.situacao),
        mudou, historico: (x.historico || []).slice(0, 6) },
    });
  }
  // a foto (vistos) só é gravada na rodada, depois que a fila aceitar os achados
  return { achados, lidos, vistos };
}

// ------------------------------------------------------------------ 3. IBGE (INPC)
async function lerInpc(db: any): Promise<{ achados: Achado[]; lidos: number }> {
  const r = await comPrazo('https://apisidra.ibge.gov.br/values/t/1736/n1/all/v/44/p/last%206');
  if (!r.ok) throw new Error(`IBGE ${r.status}`);
  const linhas = ((await r.json()) as any[]).slice(1).filter((x) => /^-?\d/.test(String(x.V)));
  const comps = linhas.map((x) => `${String(x.D3C).slice(0, 4)}-${String(x.D3C).slice(4, 6)}-01`);
  const { data: ja } = await db.from('prev_indice').select('competencia').in('competencia', comps);
  const tem = new Set((ja || []).map((x: any) => x.competencia));
  const achados = linhas.filter((x, i) => !tem.has(comps[i])).map((x) => {
    const comp = `${String(x.D3C).slice(0, 4)}-${String(x.D3C).slice(4, 6)}-01`;
    return { chave: 'inpc-' + comp.slice(0, 7), fonte: 'ibge', tipo: 'indice', titulo: `INPC de ${x.D3N}: ${String(x.V).replace('.', ',')}%`,
      resumo: 'Variação mensal do INPC divulgada pelo IBGE (SIDRA, tabela 1736). Aprovar inclui o mês na tabela de índices usada na correção e no reajuste.',
      link: 'https://sidra.ibge.gov.br/tabela/1736', data: comp, afeta_tabela: true,
      dados: { competencia: comp, inpc: Number(x.V) } } as Achado;
  });
  return { achados, lidos: linhas.length };
}

// ------------------------------------------------------------------ 4. CJF (notícias da TNU)
const CJF_PREV = /previd|INSS|aposentad|benef[ií]cio|segurad|pens[aã]o|aux[ií]lio|rural|incapacidade|BPC|LOAS/i;
async function lerCjf(desde: string): Promise<{ achados: Achado[]; lidos: number }> {
  const r = await comPrazo('https://www.cjf.jus.br/cjf/noticias/RSS');
  if (!r.ok) throw new Error(`CJF ${r.status}`);
  const x = await r.text();
  const itens = [...x.matchAll(/<item[\s\S]*?<\/item>/g)].map((m) => m[0]);
  const tag = (s: string, t: string) => semTag((s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, ''));
  const achados: Achado[] = [];
  for (const it of itens) {
    const titulo = tag(it, 'title'), desc = tag(it, 'description'), link = tag(it, 'link'), data = (tag(it, 'dc:date') || tag(it, 'pubDate')).slice(0, 10);
    if (!/TNU|Turma Nacional/i.test(titulo + ' ' + desc) || !CJF_PREV.test(titulo + ' ' + desc)) continue;
    if (data && /^\d{4}-\d{2}-\d{2}$/.test(data) && data < desde) continue;
    achados.push({ chave: 'cjf-' + link.replace(/^https?:\/\/[^/]+/, ''), fonte: 'cjf', tipo: 'noticia', titulo, resumo: desc.slice(0, 600), link,
      data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null, dados: { categoria: 'jurisprudencia', tipo: 'noticia_tnu', orgao: 'TNU' } });
  }
  return { achados, lidos: itens.length };
}

// ------------------------------------------------------------------ rodada
// Uma fonte por chamada (?fonte=dou|cnj|ibge|cjf): cada leitura cabe folgada no limite de
// tempo das funções. O agendamento chama as quatro, uma depois da outra, na segunda de
// manhã; o botão "Rodar agora" da tela faz o mesmo.
const FONTES: Record<string, (db: any, desde: string) => Promise<Leitura>> = {
  dou: (_db, d) => lerDou(d), cnj: (db, d) => lerCnj(db, d), ibge: (db) => lerInpc(db), cjf: (_db, d) => lerCjf(d),
};
// sem rodada anterior que tenha dado certo: quanto voltar. O CNJ e a TNU só uma semana,
// porque a foto inicial dos temas já cobre o que havia antes.
const PRIMEIRA_VEZ: Record<string, number> = { dou: 30, cnj: 8, ibge: 0, cjf: 8 };

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const responde = (j: unknown, status = 200) => new Response(JSON.stringify(j), { headers: cors, status });

  let corpo: any = {}; if (req.method === 'POST') { try { corpo = await req.json(); } catch { /* sem corpo */ } }
  const fonte = String(new URL(req.url).searchParams.get('fonte') || corpo.fonte || '');
  if (!FONTES[fonte]) return responde({ ok: false, erro: 'informe a fonte: ' + Object.keys(FONTES).join(', ') }, 400);

  // rodadas que ficaram abertas (a função foi interrompida) são encerradas como falha
  await db.from('prev_robo_execucao').update({ terminado_em: new Date().toISOString(), ok: false })
    .is('terminado_em', null).lt('iniciado_em', new Date(Date.now() - 10 * 6e4).toISOString());

  // Busca desde a última rodada em que ESTA fonte deu certo, com um dia de folga.
  const { data: hist } = await db.from('prev_robo_execucao').select('iniciado_em,resumo').eq('ok', true)
    .order('iniciado_em', { ascending: false }).limit(60);
  const h = (hist || []).find((x: any) => x.resumo?.[fonte] && !x.resumo[fonte].erro);
  const base = h ? new Date(h.iniciado_em).getTime() - 864e5 : Date.now() - PRIMEIRA_VEZ[fonte] * 864e5;
  const desde = iso(new Date(base));

  const { data: exec } = await db.from('prev_robo_execucao').insert({ resumo: { fonte, desde } }).select('id').single();
  const resumo: Record<string, any> = { fonte, desde };
  let novos = 0, ok = true;
  try {
    const { achados, lidos, vistos } = await FONTES[fonte](db, desde);
    if (achados.length) {
      // na biblioteca já? então é atualização de algo que temos
      const nchaves = [...new Set(achados.map((a) => a.norma_chave).filter(Boolean))] as string[];
      const naBase = new Set<string>();
      for (let i = 0; i < nchaves.length; i += 200) {
        const { data } = await db.from('prev_norma').select('chave').in('chave', nchaves.slice(i, i + 200));
        (data || []).forEach((x: any) => naBase.add(x.chave));
      }
      const linhas = achados.map((a) => ({ ...a, norma_chave: a.norma_chave && naBase.has(a.norma_chave) ? a.norma_chave : null,
        dados: { ...(a.dados || {}), chave_norma: a.norma_chave || null, ja_na_base: !!(a.norma_chave && naBase.has(a.norma_chave)) } }));
      for (let i = 0; i < linhas.length; i += 200) {
        const { data, error } = await db.from('prev_atualizacao').upsert(linhas.slice(i, i + 200), { onConflict: 'chave', ignoreDuplicates: true }).select('id');
        if (error) throw error;
        novos += (data || []).length;
      }
    }
    for (let i = 0; vistos && i < vistos.length; i += 500) {
      const { error } = await db.from('prev_cnj_visto').upsert(vistos.slice(i, i + 500), { onConflict: 'chave' });
      if (error) throw error;
    }
    resumo[fonte] = { lidos, achados: achados.length, novos };
  } catch (e) { ok = false; resumo[fonte] = { erro: String((e as Error)?.message || e) }; }
  if (exec) await db.from('prev_robo_execucao').update({ terminado_em: new Date().toISOString(), ok, novos, resumo }).eq('id', exec.id);
  return responde({ ok, novos, resumo }, ok ? 200 : 502);
});
