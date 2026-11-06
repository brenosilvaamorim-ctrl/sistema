// CONECTOR DO ESCRITÓRIO PARA O CLAUDE (servidor MCP, só leitura)
//
// Deixa o Claude (claude.ai e Claude Desktop, como "conector personalizado") consultar
// o sistema: buscar clientes e casos, ver o caso inteiro, a análise previdenciária, os
// prazos, a base de normas, e abrir os PDFs guardados. NADA é gravado: toda ferramenta
// só lê. Cada chamada fica registrada no histórico (entidade 'mcp').
//
// Protocolo: MCP por "Streamable HTTP", sem sessão (cada POST é respondido sozinho, em
// JSON). Escrito à mão para não depender de biblioteca: initialize, tools/list,
// tools/call e ping.
//
// Acesso: o conector manda "Authorization: Bearer <MCP_TOKEN>" em toda chamada (no
// claude.ai: Adicionar conector personalizado → Sem login → Cabeçalhos da requisição).
// Sem o token certo, nada responde. Trocar o segredo MCP_TOKEN corta o acesso na hora.
// Na função, "Verify JWT" fica DESLIGADO: quem confere o acesso é o próprio código.
//
// Segredos: MCP_TOKEN (obrigatório) e MCP_ESCRITORIO_ID (opcional; sem ele, usa o único
// escritório do banco). SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o Supabase preenche.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26'];
const SERVIDOR = { name: 'escritorio-breno-amorim', title: 'Sistema do escritório', version: '1.0.0' };
const INSTRUCOES = `Sistema do escritório Breno S. Amorim Advocacia (Petrolina/PE). Só leitura.
Comece por "buscar" (nome do cliente, CPF, título do caso ou número do processo) para achar os ids.
"ver_caso" traz o caso inteiro: cliente, processos e movimentações, prazos, intimações, fatos, documentos e minutas.
"ver_analise_previdenciaria" traz os vínculos do CNIS, o tempo, as pendências, as simulações salvas e o que foi lido dos documentos do INSS.
"abrir_documento" devolve o PDF guardado (CNIS, processo administrativo, PPP) para você ler.
Datas vêm em dd/mm/aaaa. Ao citar documento, diga a página. Este conector não grava nada: o que precisar mudar, oriente o advogado a fazer no sistema.`;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let ESC: string | null = Deno.env.get('MCP_ESCRITORIO_ID') || null;
async function escritorio(): Promise<string> {
  if (ESC) return ESC;
  const { data, error } = await db.from('escritorio').select('id').limit(2);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('nenhum escritório no banco');
  if (data.length > 1) throw new Error('há mais de um escritório: configure o segredo MCP_ESCRITORIO_ID');
  return (ESC = data[0].id);
}

// ------------------------------------------------------------------ utilidades
const br = (s?: string | null) => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const hojeRecife = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const maisDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const soDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '');
const corta = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const dinheiro = (v: unknown) => v == null ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uuidOk = (s: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s ?? ''));
const like = (s: string) => '%' + s.replace(/[%_,()]/g, ' ').trim() + '%';
function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

/* Contagem de tempo igual à da tela (mês comercial de 30 dias, sem contar duas vezes o concomitante). */
const fimMes = (iso: string) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
function diff(ini: string, fim: string) {
  let [y1, m1, d1] = ini.split('-').map(Number); let [y2, m2, d2] = fim.split('-').map(Number);
  if (fim === fimMes(fim)) d2 = 30;
  if (d1 > 30) d1 = 30;
  let a = y2 - y1, m = m2 - m1, d = d2 - d1 + 1;
  if (d < 0) { m -= 1; d += 30; }
  if (d >= 30) { m += 1; d -= 30; }
  if (m < 0) { a -= 1; m += 12; }
  if (m >= 12) { a += 1; m -= 12; }
  return { a, m, d };
}
function soma(l: { a: number; m: number; d: number }[]) {
  let a = 0, m = 0, d = 0; for (const t of l) { a += t.a; m += t.m; d += t.d; }
  m += Math.floor(d / 30); d %= 30; a += Math.floor(m / 12); m %= 12; return { a, m, d };
}
function uniao(ps: { inicio: string; fim: string }[]) {
  const s = ps.filter(p => p.inicio && p.fim && p.fim >= p.inicio).map(p => ({ ...p })).sort((x, y) => x.inicio.localeCompare(y.inicio));
  const u: { inicio: string; fim: string }[] = [];
  for (const p of s) { const ult = u[u.length - 1]; if (ult && p.inicio <= maisDias(ult.fim, 1)) { if (p.fim > ult.fim) ult.fim = p.fim; } else u.push(p); }
  return u;
}
const tempoTxt = (t: { a: number; m: number; d: number }) => `${t.a}a ${t.m}m ${t.d}d`;
function faixas(comps: string[]) {
  const ms = [...new Set(comps)].sort().map(c => { const [y, m] = c.split('-').map(Number); return y * 12 + m - 1; });
  const out: string[] = []; const f = (n: number) => String(n % 12 + 1).padStart(2, '0') + '/' + Math.floor(n / 12);
  for (let i = 0; i < ms.length; ) { let j = i; while (j + 1 < ms.length && ms[j + 1] === ms[j] + 1) j++; out.push(i === j ? f(ms[i]) : f(ms[i]) + ' a ' + f(ms[j])); i = j + 1; }
  return out.join(', ');
}

// ------------------------------------------------------------------ ferramentas
type Args = Record<string, any>;
type Conteudo = { type: string; [k: string]: unknown };
interface Ferramenta { name: string; title: string; description: string; inputSchema: Record<string, unknown>; run: (a: Args) => Promise<string | Conteudo[]> }
const so = (props: Record<string, unknown>, req: string[] = []) => ({ type: 'object', properties: props, required: req, additionalProperties: false });

const FERRAMENTAS: Ferramenta[] = [
  {
    name: 'buscar', title: 'Buscar clientes, casos e processos',
    description: 'Procura por nome do cliente, CPF/CNPJ, título do caso ou número do processo (CNJ). Devolve os ids para as outras ferramentas.',
    inputSchema: so({ termo: { type: 'string', description: 'nome, CPF, título do caso ou número do processo' },
                      incluir_encerrados: { type: 'boolean', description: 'incluir casos encerrados (padrão: sim)' } }, ['termo']),
    async run({ termo, incluir_encerrados = true }) {
      const esc = await escritorio(), t = String(termo || '').trim(), dig = soDigitos(t);
      if (t.length < 2) return 'Informe ao menos 2 caracteres.';
      const linhas: string[] = [];
      const cliFiltro = dig.length >= 11 ? `cpf_cnpj.ilike.%${dig.slice(0, 3)}%${dig.slice(-2)}%,nome.ilike.${like(t)}` : `nome.ilike.${like(t)}`;
      const clientes = ok(await db.from('cliente').select('id,nome,cpf_cnpj,cidade,uf').eq('escritorio_id', esc).or(cliFiltro).limit(15)) as any[];
      const cliIds = clientes.map(c => c.id);
      let q = db.from('caso').select('id,titulo,area,encerrado_em,resultado,cliente:cliente_id(nome),atualizado_em').eq('escritorio_id', esc)
        .or(`titulo.ilike.${like(t)}` + (cliIds.length ? `,cliente_id.in.(${cliIds.join(',')})` : '')).order('atualizado_em', { ascending: false }).limit(25);
      if (!incluir_encerrados) q = q.is('encerrado_em', null);
      const casos = ok(await q) as any[];
      const procs = dig.length >= 7 ? ok(await db.from('processo').select('id,numero_cnj,numero_formatado,tribunal_sigla,classe,caso_id').eq('escritorio_id', esc)
        .ilike('numero_cnj', '%' + dig + '%').limit(10)) as any[] : [];
      if (clientes.length) { linhas.push('CLIENTES'); for (const c of clientes) linhas.push(`- ${c.nome} · ${c.cpf_cnpj || 'sem CPF'} · ${[c.cidade, c.uf].filter(Boolean).join('/')} · cliente_id ${c.id}`); }
      if (casos.length) { linhas.push('CASOS'); for (const c of casos) linhas.push(`- ${c.titulo} · ${c.cliente?.nome || 'sem cliente'} · ${c.area || 'área —'}${c.encerrado_em ? ' · ENCERRADO ' + br(c.encerrado_em) + (c.resultado ? ' (' + c.resultado + ')' : '') : ''} · caso_id ${c.id}`); }
      if (procs.length) { linhas.push('PROCESSOS'); for (const p of procs) linhas.push(`- ${p.numero_formatado || p.numero_cnj} · ${p.tribunal_sigla || ''} ${p.classe || ''} · caso_id ${p.caso_id || '—'}`); }
      const analises = casos.length ? ok(await db.from('prev_analise').select('id,caso_id,data_base,situacao').in('caso_id', casos.map(c => c.id))) as any[] : [];
      if (analises.length) { linhas.push('ANÁLISES PREVIDENCIÁRIAS'); for (const a of analises) linhas.push(`- caso_id ${a.caso_id} · situação ${a.situacao} · data-base ${br(a.data_base)} · analise_id ${a.id}`); }
      return linhas.length ? linhas.join('\n') : `Nada encontrado para "${t}".`;
    },
  },
  {
    name: 'ver_caso', title: 'Ver o caso inteiro',
    description: 'Tudo do caso: cliente, descrição, processos com as últimas movimentações, prazos, agenda, intimações, fatos, documentos (checklist, arquivos e textos lidos), minutas e análises previdenciárias.',
    inputSchema: so({ caso_id: { type: 'string', description: 'id do caso (use "buscar")' },
                      movimentacoes: { type: 'integer', description: 'quantas movimentações por processo (padrão 15)' } }, ['caso_id']),
    async run({ caso_id, movimentacoes = 15 }) {
      if (!uuidOk(caso_id)) return 'caso_id inválido: use "buscar".';
      const esc = await escritorio();
      const c = (ok(await db.from('caso').select('*, cliente:cliente_id(*)').eq('id', caso_id).eq('escritorio_id', esc).limit(1)) as any[])[0];
      if (!c) return 'Caso não encontrado.';
      const [procs, prazos, eventos, intim, fatos, cdocs, docs, textos, minutas, analises] = await Promise.all([
        db.from('processo').select('*').eq('caso_id', caso_id),
        db.from('prazo').select('descricao,providencia,data_fatal,situacao,fatal,cumprido_em,trecho_origem').eq('caso_id', caso_id).order('data_fatal', { ascending: false }).limit(30),
        db.from('evento').select('tipo,titulo,inicio,local,situacao').eq('caso_id', caso_id).order('inicio', { ascending: false }).limit(20),
        db.from('intimacao').select('data_disponibilizacao,tipo_comunicacao,orgao,texto,situacao').eq('caso_id', caso_id).order('data_disponibilizacao', { ascending: false }).limit(8),
        db.from('fato').select('data,descricao,prova,trecho,pagina').eq('caso_id', caso_id).order('ordem'),
        db.from('caso_documento').select('descricao,obs,recebido_em').eq('caso_id', caso_id).order('ordem'),
        db.from('documento').select('id,titulo,tipo,drive_file_id,storage_path,criado_em').eq('caso_id', caso_id).order('criado_em'),
        db.from('doc_texto').select('id,arquivo,tipo,texto').eq('caso_id', caso_id),
        db.from('minuta').select('tipo,status,teses,criado_em').eq('caso_id', caso_id).order('criado_em', { ascending: false }).limit(10),
        db.from('prev_analise').select('id,data_base,situacao').eq('caso_id', caso_id),
      ]);
      const cli = c.cliente || {}, L: string[] = [];
      L.push(`CASO: ${c.titulo}  (caso_id ${c.id})`);
      L.push(`Área: ${c.area || '—'} · polo: ${c.polo || '—'} · lado do cliente: ${c.cliente_lado || '—'} · valor da causa: ${dinheiro(c.valor_causa)}`);
      if (c.encerrado_em) L.push(`Encerrado em ${br(c.encerrado_em)} · resultado: ${c.resultado || '—'}`);
      if (c.prescricao_em) L.push(`Prescrição: ${br(c.prescricao_em)}${c.prescricao_obs ? ' — ' + c.prescricao_obs : ''}`);
      if (c.data_ciencia_ato) L.push(`Ciência do ato: ${br(c.data_ciencia_ato)}`);
      if (c.descricao) L.push(`Descrição: ${c.descricao}`);
      if (c.observacoes) L.push(`Observações: ${c.observacoes}`);
      if (c.dados && Object.keys(c.dados).length) L.push(`Dados do caso: ${JSON.stringify(c.dados)}`);
      if (c.viabilidade && Object.keys(c.viabilidade).length) L.push(`Viabilidade: ${JSON.stringify(c.viabilidade)}`);
      L.push('', `CLIENTE: ${cli.nome || '—'} · ${cli.tipo || ''} · CPF/CNPJ ${cli.cpf_cnpj || '—'} · RG ${cli.rg || '—'} · nascimento ${br(cli.nascimento)} · ${cli.estado_civil || ''} · ${cli.profissao || ''}`);
      L.push(`Endereço: ${[cli.endereco, cli.bairro, cli.cidade && cli.uf ? cli.cidade + '/' + cli.uf : cli.cidade, cli.cep].filter(Boolean).join(', ') || '—'} · telefone ${cli.whatsapp || cli.telefone || '—'} · e-mail ${cli.email || '—'}`);
      if (cli.observacoes) L.push(`Obs. do cliente: ${cli.observacoes}`);
      const ps = ok(procs) as any[];
      for (const p of ps) {
        L.push('', `PROCESSO ${p.numero_formatado || p.numero_cnj} · ${p.tribunal_sigla || ''} ${p.grau || ''} · ${p.orgao || ''}`);
        L.push(`Classe: ${p.classe || '—'} · assunto: ${p.assunto || '—'} · fase: ${p.fase} · ajuizado ${br(p.data_ajuizamento)} · valor ${dinheiro(p.valor_causa)}${p.segredo_justica ? ' · SEGREDO DE JUSTIÇA' : ''}`);
        if (p.parte_ativa || p.parte_passiva) L.push(`Partes: ${p.parte_ativa || '—'} × ${p.parte_passiva || '—'}`);
        if (p.aguardando_ate) L.push(`Aguardando até ${br(p.aguardando_ate)}: ${p.aguardando_obs || ''}`);
        const movs = ok(await db.from('movimentacao').select('data,descricao,complementos').eq('processo_id', p.id).order('data', { ascending: false }).limit(Math.min(60, Math.max(1, movimentacoes)))) as any[];
        for (const m of movs) L.push(`  ${br(m.data)} — ${corta(m.descricao, 200)}${m.complementos ? ' ' + corta(JSON.stringify(m.complementos), 160) : ''}`);
      }
      const pz = ok(prazos) as any[];
      if (pz.length) { L.push('', 'PRAZOS'); for (const z of pz) L.push(`- ${br(z.data_fatal)} · ${z.situacao}${z.cumprido_em ? ' (cumprido ' + br(z.cumprido_em) + ')' : ''} · ${z.descricao}${z.providencia ? ' → ' + z.providencia : ''}`); }
      const ev = ok(eventos) as any[];
      if (ev.length) { L.push('', 'AGENDA'); for (const e of ev) L.push(`- ${br(e.inicio)} ${String(e.inicio).slice(11, 16)} · ${e.tipo} · ${e.titulo}${e.local ? ' · ' + e.local : ''} · ${e.situacao}`); }
      const it = ok(intim) as any[];
      if (it.length) { L.push('', 'INTIMAÇÕES (mais recentes)'); for (const i of it) L.push(`- ${br(i.data_disponibilizacao)} · ${i.tipo_comunicacao || ''} · ${i.orgao || ''} · ${i.situacao}\n  ${corta(i.texto, 1500)}`); }
      const ft = ok(fatos) as any[];
      if (ft.length) { L.push('', 'FATOS'); for (const f of ft) L.push(`- ${br(f.data)} · ${f.descricao}${f.prova ? ' · prova: ' + f.prova : ''}${f.pagina ? ' · p. ' + f.pagina : ''}${f.trecho ? ' · "' + corta(f.trecho, 200) + '"' : ''}`); }
      const cd = ok(cdocs) as any[];
      if (cd.length) { L.push('', 'DOCUMENTOS PEDIDOS AO CLIENTE'); for (const d of cd) L.push(`- ${d.descricao}: ${d.recebido_em ? 'recebido ' + br(d.recebido_em) : 'ainda não chegou'}${d.obs ? ' (' + d.obs + ')' : ''}`); }
      const dc = ok(docs) as any[];
      if (dc.length) { L.push('', 'ARQUIVOS DO CASO'); for (const d of dc) L.push(`- ${d.titulo} · ${d.tipo || ''}${d.drive_file_id ? ' · no Google Drive, id ' + d.drive_file_id : ''}`); }
      const tx = ok(textos) as any[];
      if (tx.length) { L.push('', 'TEXTOS LIDOS DOS DOCUMENTOS (use "ler_texto" para o texto inteiro)'); for (const d of tx) L.push(`- ${d.arquivo} · ${d.tipo || ''} · ${String(d.texto || '').length} caracteres · texto_id ${d.id}`); }
      const mn = ok(minutas) as any[];
      if (mn.length) { L.push('', 'MINUTAS'); for (const m of mn) L.push(`- ${br(m.criado_em)} · ${m.tipo} · ${m.status}${m.teses?.length ? ' · teses: ' + m.teses.join('; ') : ''}`); }
      const an = ok(analises) as any[];
      if (an.length) { L.push('', 'ANÁLISE PREVIDENCIÁRIA'); for (const a of an) L.push(`- situação ${a.situacao} · data-base ${br(a.data_base)} · analise_id ${a.id} (use "ver_analise_previdenciaria")`); }
      return L.join('\n');
    },
  },
  {
    name: 'ver_analise_previdenciaria', title: 'Ver a análise previdenciária',
    description: 'A análise do RGPS: dados do segurado, vínculos do CNIS (com o que foi corrigido à mão), tempo bruto, lacunas, pendências, simulações salvas e o que foi lido do processo administrativo, PPP e laudos (requerimentos, motivo do indeferimento, ciência, tempo apurado pelo INSS, períodos não computados).',
    inputSchema: so({ analise_id: { type: 'string', description: 'id da análise' }, caso_id: { type: 'string', description: 'ou o id do caso' } }),
    async run({ analise_id, caso_id }) {
      const esc = await escritorio();
      let q = db.from('prev_analise').select('*, cliente:cliente_id(nome,cpf_cnpj,nascimento), caso:caso_id(titulo)').eq('escritorio_id', esc);
      if (uuidOk(analise_id)) q = q.eq('id', analise_id); else if (uuidOk(caso_id)) q = q.eq('caso_id', caso_id); else return 'Informe analise_id ou caso_id.';
      const a = (ok(await q.order('atualizado_em', { ascending: false }).limit(1)) as any[])[0];
      if (!a) return 'Análise não encontrada.';
      const [vinc, pend, sims, docs] = await Promise.all([
        db.from('prev_vinculo').select('*').eq('analise_id', a.id).order('inicio'),
        db.from('prev_pendencia').select('codigo,descricao,providencia,competencias,origem,resolvida,resolucao,vinculo_id').eq('analise_id', a.id),
        db.from('prev_simulacao').select('criado_em,data_base,melhor,rmi,resultado').eq('analise_id', a.id).order('criado_em', { ascending: false }).limit(3),
        db.from('prev_documento').select('id,tipo,nome,paginas,status,erro,lido,lido_em').eq('analise_id', a.id).order('criado_em'),
      ]);
      const rem = [] as any[];
      for (let i = 0; ; i += 1000) { const r = ok(await db.from('prev_remuneracao').select('vinculo_id,competencia,valor').eq('analise_id', a.id).range(i, i + 999)) as any[]; rem.push(...r); if (r.length < 1000) break; }
      const vs = ok(vinc) as any[], L: string[] = [];
      const fimDe = (v: any) => v.fim || (v.ultima_remun ? fimMes(v.ultima_remun) : null);
      L.push(`ANÁLISE PREVIDENCIÁRIA (analise_id ${a.id}) · caso "${a.caso?.titulo || ''}" · situação ${a.situacao}`);
      L.push(`Segurado: ${a.cliente?.nome || '—'} · sexo ${a.sexo || '—'} · nascimento ${br(a.nascimento)} · NIT ${a.nit || '—'} · CPF ${a.cpf || a.cliente?.cpf_cnpj || '—'} · mãe ${a.nome_mae || '—'}`);
      L.push(`Data-base (DER pretendida): ${br(a.data_base)} · CNIS emitido ${br(a.cnis_emitido_em)}, lido ${br(a.cnis_lido_em)}${a.cnis_arquivo ? ' · PDF do CNIS: abrir_documento com documento_id "cnis:' + a.id + '"' : ''}`);
      if (a.obs) L.push(`Observações: ${a.obs}`);
      const porV = new Map<string, any[]>(); for (const r of rem) { if (!porV.has(r.vinculo_id)) porV.set(r.vinculo_id, []); porV.get(r.vinculo_id)!.push(r); }
      L.push('', 'VÍNCULOS (seq · tipo · origem · período · competências · indicadores · conta?)');
      for (const v of vs) {
        const rs = (porV.get(v.id) || []).sort((x, y) => x.competencia.localeCompare(y.competencia));
        L.push(`- ${v.seq ?? '—'} · ${v.tipo}${v.especial ? ' ESPECIAL ' + v.especial + ' anos' : ''}${v.rural ? ' RURAL' : ''}${v.pcd ? ' PcD ' + v.pcd : ''} · ${v.empregador_nome || '—'} ${v.empregador_doc || ''}${v.beneficio_nb ? ' NB ' + v.beneficio_nb : ''}${v.beneficio_especie ? ' (' + v.beneficio_especie + ')' : ''}`
          + ` · ${v.origem}${v.alterado ? ' alterado à mão' : ''} · ${br(v.inicio)} a ${v.fim ? br(v.fim) : v.ultima_remun ? 'sem saída (últ. remun. ' + br(v.ultima_remun).slice(3) + ')' : 'sem saída'}`
          + ` · ${rs.length} comp.${rs.length ? ' (' + br(rs[0].competencia).slice(3) + ' a ' + br(rs[rs.length - 1].competencia).slice(3) + ')' : ''} · ${(v.indicadores || []).join(', ') || 'sem indicadores'} · ${v.considerar ? 'conta' : 'NÃO conta'}`
          + `${v.prova ? ' · prova: ' + v.prova : ''}${v.obs ? ' · obs: ' + v.obs : ''} · vinculo_id ${v.id}`);
      }
      const conta = vs.filter(v => v.considerar && v.inicio);
      const u = uniao(conta.map(v => ({ inicio: v.inicio, fim: fimDe(v) || a.data_base })));
      const lac: string[] = [];
      for (let i = 1; i < u.length; i++) { const de = maisDias(u[i - 1].fim, 1), ate = maisDias(u[i].inicio, -1); if (de <= ate) lac.push(`${br(de)} a ${br(ate)} (${tempoTxt(diff(de, ate))})`); }
      L.push('', `TEMPO BRUTO dos vínculos que contam (sem converter especial; mês de 30 dias): ${tempoTxt(soma(u.map(p => diff(p.inicio, p.fim))))}`);
      L.push(`Lacunas: ${lac.length ? lac.join('; ') : 'nenhuma'}`);
      const pd = ok(pend) as any[], nomeV = new Map(vs.map(v => [v.id, `${v.seq ?? ''} ${v.empregador_nome || v.tipo}`]));
      if (pd.length) {
        L.push('', `PENDÊNCIAS (${pd.filter(p => !p.resolvida).length} abertas de ${pd.length})`);
        for (const p of pd.sort((x, y) => Number(x.resolvida) - Number(y.resolvida))) L.push(`- ${p.resolvida ? '[resolvida] ' : ''}${p.codigo}${p.vinculo_id ? ' @ ' + nomeV.get(p.vinculo_id) : ''}: ${p.descricao}${p.competencias ? ' [' + p.competencias + ']' : ''}${p.providencia ? ' → ' + p.providencia : ''}${p.resolucao ? ' · resolução: ' + p.resolucao : ''}`);
      }
      const sm = ok(sims) as any[];
      if (sm.length) {
        L.push('', 'SIMULAÇÕES SALVAS (o cálculo é feito na tela do sistema; aqui está o último resultado salvo)');
        for (const s of sm) {
          L.push(`- ${br(s.criado_em)} · data-base ${br(s.data_base)} · melhor regra: ${s.melhor || '—'} · renda ${dinheiro(s.rmi)}`);
          const regras = (s.resultado?.regras || []) as any[];
          for (const r of regras.slice(0, 14)) L.push(`    ${r.nome || r.k}: ${r.cumpre ? 'CUMPRE' : r.data ? 'cumpre em ' + br(r.data) : 'não cumpre'}${r.calc?.rmi ? ' · renda ' + dinheiro(r.calc.rmi) : ''}${r.falta ? ' · falta ' + JSON.stringify(r.falta) : ''}`);
        }
      }
      const dc = ok(docs) as any[];
      if (dc.length) {
        L.push('', 'DOCUMENTOS ANEXADOS À ANÁLISE (abra o PDF com abrir_documento)');
        for (const d of dc) {
          L.push(`- ${d.nome} · ${d.tipo} · ${d.paginas ?? '?'} págs. · ${d.status}${d.erro ? ' (' + d.erro + ')' : ''} · documento_id ${d.id}`);
          const x = d.lido; if (!x) continue;
          for (const r of x.requerimentos || []) L.push(`    requerimento NB ${r.nb || '—'} · ${r.especie || ''} · DER ${br(r.der)} · ${r.situacao || ''}${r.data_decisao ? ' em ' + br(r.data_decisao) : ''}${r.motivo ? ' · motivo: ' + r.motivo : ''}${r.fundamento ? ' (' + r.fundamento + ')' : ''} · p. ${r.pagina}`);
          if (x.ciencia?.data) L.push(`    ciência da decisão ${br(x.ciencia.data)} · p. ${x.ciencia.pagina} · prazo do recurso (30 dias): ${br(maisDias(x.ciencia.data, 30))}`);
          if (x.tempo_inss) L.push(`    tempo apurado pelo INSS: ${x.tempo_inss.anos ?? 0}a ${x.tempo_inss.meses ?? 0}m ${x.tempo_inss.dias ?? 0}d · carência ${x.tempo_inss.carencia ?? '—'} · referência ${br(x.tempo_inss.data_referencia)} · p. ${x.tempo_inss.pagina}`);
          for (const p of x.periodos || []) L.push(`    período INSS ${br(p.inicio)} a ${br(p.fim)} · ${p.empresa || ''} · ${p.situacao || ''}${p.motivo ? ' · ' + p.motivo : ''} · p. ${p.pagina}`);
          for (const e of x.especiais || []) L.push(`    ${e.documento || 'PPP'} ${e.empresa || ''} · ${br(e.inicio)} a ${br(e.fim)} · ${e.funcao || ''} · agentes: ${e.agentes || '—'} ${e.intensidade || ''} · EPI eficaz: ${e.epi_eficaz || '—'} · resp. técnico: ${e.responsavel_tecnico || '—'} · p. ${e.pagina}`);
          for (const e of x.exigencias || []) L.push(`    exigência ${br(e.data)}: ${corta(e.texto, 300)}${e.cumprida ? ' (cumprida)' : ''} · p. ${e.pagina}`);
          for (const e of x.pericias || []) L.push(`    perícia ${br(e.data)}: ${corta(e.conclusao, 300)}${e.cid ? ' · CID ' + e.cid : ''}${e.did ? ' · DID ' + br(e.did) : ''}${e.dii ? ' · DII ' + br(e.dii) : ''} · p. ${e.pagina}`);
          for (const f of x.fatos || []) L.push(`    fato ${br(f.data)}: ${corta(f.descricao, 250)} · p. ${f.pagina}`);
          if (x.observacao) L.push(`    obs. da leitura: ${corta(x.observacao, 400)}`);
        }
      }
      return L.join('\n');
    },
  },
  {
    name: 'ver_remuneracoes', title: 'Ver as remunerações do CNIS',
    description: 'Competência por competência (valor e indicadores) de um vínculo, ou de todos, num intervalo. Útil para checar meses abaixo do mínimo, lacunas e remunerações extemporâneas.',
    inputSchema: so({ analise_id: { type: 'string' }, vinculo_id: { type: 'string', description: 'opcional: só este vínculo' },
                      de: { type: 'string', description: 'opcional: AAAA-MM' }, ate: { type: 'string', description: 'opcional: AAAA-MM' } }, ['analise_id']),
    async run({ analise_id, vinculo_id, de, ate }) {
      if (!uuidOk(analise_id)) return 'analise_id inválido.';
      const esc = await escritorio();
      const a = (ok(await db.from('prev_analise').select('id').eq('id', analise_id).eq('escritorio_id', esc).limit(1)) as any[])[0];
      if (!a) return 'Análise não encontrada.';
      const vs = ok(await db.from('prev_vinculo').select('id,seq,empregador_nome,tipo').eq('analise_id', analise_id)) as any[];
      const nome = new Map(vs.map(v => [v.id, `${v.seq ?? ''} ${v.empregador_nome || v.tipo}`]));
      const out: any[] = [];
      for (let i = 0; ; i += 1000) {
        let q = db.from('prev_remuneracao').select('vinculo_id,competencia,valor,contribuicao,pagamento,indicadores,origem,considerar').eq('analise_id', analise_id).order('competencia').range(i, i + 999);
        if (uuidOk(vinculo_id)) q = q.eq('vinculo_id', vinculo_id);
        if (/^\d{4}-\d{2}$/.test(String(de || ''))) q = q.gte('competencia', de + '-01');
        if (/^\d{4}-\d{2}$/.test(String(ate || ''))) q = q.lte('competencia', ate + '-01');
        const r = ok(await q) as any[]; out.push(...r); if (r.length < 1000) break;
      }
      if (!out.length) return 'Nenhuma competência no filtro.';
      const L = [`${out.length} competência(s). Formato: mm/aaaa · valor · [contribuição, pagamento] · indicadores · vínculo`];
      for (const r of out.slice(0, 1500)) L.push(`${br(r.competencia).slice(3)} · ${dinheiro(r.valor)}${r.contribuicao != null ? ' · contrib. ' + dinheiro(r.contribuicao) : ''}${r.pagamento ? ' · pago ' + br(r.pagamento) : ''}${(r.indicadores || []).length ? ' · ' + r.indicadores.join(',') : ''}${r.considerar === false ? ' · NÃO conta' : ''} · ${nome.get(r.vinculo_id) || ''}`);
      if (out.length > 1500) L.push(`(mostradas 1500 de ${out.length}; filtre por vínculo ou período)`);
      return L.join('\n');
    },
  },
  {
    name: 'abrir_documento', title: 'Abrir um documento guardado (PDF)',
    description: 'Devolve o PDF guardado no sistema para leitura: um documento anexado à análise previdenciária (documento_id da lista) ou o CNIS ("cnis:<analise_id>"). PDFs acima de ~4 MB não cabem: peça ao advogado para anexar direto na conversa.',
    inputSchema: so({ documento_id: { type: 'string', description: 'id do documento anexado, ou "cnis:<analise_id>"' } }, ['documento_id']),
    async run({ documento_id }) {
      const esc = await escritorio(), id = String(documento_id || '');
      let caminho = '', nome = '';
      if (id.startsWith('cnis:')) {
        const a = (ok(await db.from('prev_analise').select('cnis_arquivo').eq('id', id.slice(5)).eq('escritorio_id', esc).limit(1)) as any[])[0];
        if (!a?.cnis_arquivo) return 'Esta análise não tem PDF do CNIS guardado.';
        caminho = a.cnis_arquivo; nome = 'CNIS.pdf';
      } else if (uuidOk(id)) {
        const d = (ok(await db.from('prev_documento').select('arquivo,nome').eq('id', id).eq('escritorio_id', esc).limit(1)) as any[])[0];
        if (!d) return 'Documento não encontrado.';
        caminho = d.arquivo; nome = d.nome;
      } else return 'documento_id inválido.';
      if (!caminho.startsWith(esc + '/')) return 'Documento fora da pasta do escritório.';
      const { data, error } = await db.storage.from('previdenciario').download(caminho);
      if (error || !data) return 'Não foi possível baixar: ' + (error?.message || 'sem arquivo');
      const buf = new Uint8Array(await data.arrayBuffer());
      if (buf.length > 4_200_000) return `"${nome}" tem ${(buf.length / 1048576).toFixed(1)} MB: grande demais para devolver por aqui. Peça ao advogado para anexar o PDF direto na conversa.`;
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      const mime = /\.png$/i.test(nome) ? 'image/png' : /\.jpe?g$/i.test(nome) ? 'image/jpeg' : 'application/pdf';
      const b64 = btoa(bin);
      const corpo: Conteudo = mime === 'application/pdf'
        ? { type: 'resource', resource: { uri: `escritorio://documento/${encodeURIComponent(id)}`, mimeType: mime, blob: b64 } }
        : { type: 'image', data: b64, mimeType: mime };
      return [{ type: 'text', text: `${nome} (${(buf.length / 1024).toFixed(0)} KB). Ao citar, indique a página.` }, corpo];
    },
  },
  {
    name: 'ler_texto', title: 'Ler o texto de um documento do caso',
    description: 'Texto corrido que o sistema já extraiu de um documento do caso (CTPS, TRCT, laudo, contracheque…). Use o texto_id que aparece em "ver_caso". Textos longos vêm em partes: use "inicio" para continuar.',
    inputSchema: so({ texto_id: { type: 'string' }, inicio: { type: 'integer', description: 'posição inicial (padrão 0)' } }, ['texto_id']),
    async run({ texto_id, inicio = 0 }) {
      if (!uuidOk(texto_id)) return 'texto_id inválido.';
      const esc = await escritorio();
      const d = (ok(await db.from('doc_texto').select('arquivo,tipo,texto').eq('id', texto_id).eq('escritorio_id', esc).limit(1)) as any[])[0];
      if (!d) return 'Texto não encontrado.';
      const t = String(d.texto || ''), ini = Math.max(0, Number(inicio) || 0), PEDACO = 60000, fim = Math.min(t.length, ini + PEDACO);
      return `${d.arquivo} · ${d.tipo || ''} · caracteres ${ini} a ${fim} de ${t.length}${fim < t.length ? ` (continue com inicio=${fim})` : ''}\n\n${t.slice(ini, fim)}`;
    },
  },
  {
    name: 'prazos_e_agenda', title: 'Prazos e agenda do escritório',
    description: 'Prazos em aberto (vencidos e dos próximos dias), compromissos da agenda e intimações ainda não lidas.',
    inputSchema: so({ dias: { type: 'integer', description: 'quantos dias à frente (padrão 15)' } }),
    async run({ dias = 15 }) {
      const esc = await escritorio(), hoje = hojeRecife(), ate = maisDias(hoje, Math.min(120, Math.max(1, Number(dias) || 15)));
      const [pz, ev, it] = await Promise.all([
        db.from('prazo').select('descricao,providencia,data_fatal,situacao,fatal,caso:caso_id(id,titulo)').eq('escritorio_id', esc).in('situacao', ['sugerido', 'confirmado']).lte('data_fatal', ate).order('data_fatal').limit(150),
        db.from('evento').select('tipo,titulo,inicio,local,situacao,caso:caso_id(id,titulo)').eq('escritorio_id', esc).gte('inicio', hoje).lte('inicio', ate + 'T23:59:59').order('inicio').limit(100),
        db.from('intimacao').select('id', { count: 'exact', head: true }).eq('escritorio_id', esc).eq('situacao', 'nova'),
      ]);
      const L = [`Hoje: ${br(hoje)}. Até ${br(ate)}.`, '', 'PRAZOS EM ABERTO'];
      const zs = ok(pz) as any[];
      for (const z of zs) L.push(`- ${br(z.data_fatal)}${z.data_fatal < hoje ? ' VENCIDO' : z.data_fatal === hoje ? ' HOJE' : ''} · ${z.situacao}${z.fatal ? '' : ' (não fatal)'} · ${z.descricao}${z.providencia ? ' → ' + z.providencia : ''} · ${z.caso?.titulo || 'sem caso'}${z.caso?.id ? ' (caso_id ' + z.caso.id + ')' : ''}`);
      if (!zs.length) L.push('- nenhum');
      L.push('', 'AGENDA');
      const es = ok(ev) as any[];
      for (const e of es) L.push(`- ${br(e.inicio)} ${String(e.inicio).slice(11, 16)} · ${e.tipo} · ${e.titulo}${e.local ? ' · ' + e.local : ''} · ${e.situacao}${e.caso?.titulo ? ' · ' + e.caso.titulo : ''}`);
      if (!es.length) L.push('- nada');
      if (it.error) throw new Error(it.error.message);
      L.push('', `Intimações ainda não lidas no sistema: ${it.count ?? 0}`);
      return L.join('\n');
    },
  },
  {
    name: 'base_previdenciaria', title: 'Consultar a base de normas previdenciárias',
    description: 'Base de conhecimento do módulo previdenciário: leis, decretos, INs, portarias, temas do STF/STJ/TNU e súmulas, com a tese e a situação, mantida pelo robô semanal. Busca no título, na tese e nos assuntos.',
    inputSchema: so({ busca: { type: 'string', description: 'palavras (ex.: "vigilante", "Tema 1209", "ruído EPI")' },
                      categoria: { type: 'string', enum: ['legislacao', 'jurisprudencia', 'publicacao'] } }, ['busca']),
    async run({ busca, categoria }) {
      const t = String(busca || '').trim(); if (t.length < 2) return 'Informe o que buscar.';
      const termos = t.split(/\s+/).filter(x => x.length > 1).slice(0, 4);
      let q = db.from('prev_norma').select('tipo,numero,orgao,data,titulo,tese,situacao,assuntos,link,verificado,observacao');
      for (const w of termos) q = q.or(`titulo.ilike.${like(w)},tese.ilike.${like(w)},numero.ilike.${like(w)},observacao.ilike.${like(w)}`);
      if (categoria) q = q.eq('categoria', categoria);
      const r = ok(await q.order('data', { ascending: false }).limit(25)) as any[];
      if (!r.length) return `Nada na base para "${t}".`;
      return r.map(n => `- ${n.titulo} · ${n.tipo} ${n.numero || ''} ${n.orgao || ''} · ${br(n.data)} · situação: ${n.situacao || '—'}${n.verificado ? '' : ' · NÃO VERIFICADO'}\n  ${n.tese ? corta(n.tese, 900) : ''}${n.observacao ? '\n  obs.: ' + corta(n.observacao, 300) : ''}${n.link ? '\n  ' + n.link : ''}`).join('\n');
    },
  },
];
for (const f of FERRAMENTAS) (f as any).annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

// ------------------------------------------------------------------ protocolo
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });
const erroRpc = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
async function registrar(acao: string, depois: unknown) {
  try { await db.from('historico').insert({ escritorio_id: await escritorio(), entidade: 'mcp', acao, depois }); } catch { /* registro não derruba a consulta */ }
}

async function atender(m: any): Promise<unknown | null> {
  const id = m?.id, metodo = m?.method;
  if (m?.jsonrpc !== '2.0' || typeof metodo !== 'string') return id === undefined ? null : erroRpc(id, -32600, 'requisição inválida');
  if (id === undefined || id === null) return null;              // notificação: não se responde
  if (metodo === 'initialize') {
    const pedida = m.params?.protocolVersion;
    return { jsonrpc: '2.0', id, result: { protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
      capabilities: { tools: { listChanged: false } }, serverInfo: SERVIDOR, instructions: INSTRUCOES } };
  }
  if (metodo === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (metodo === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: FERRAMENTAS.map(({ run, ...f }) => f) } };
  if (metodo === 'tools/call') {
    const nome = m.params?.name, args = m.params?.arguments || {};
    const f = FERRAMENTAS.find(x => x.name === nome);
    if (!f) return erroRpc(id, -32602, 'ferramenta desconhecida: ' + nome);
    const t0 = Date.now();
    try {
      const r = await f.run(args);
      const content = typeof r === 'string' ? [{ type: 'text', text: r }] : r;
      await registrar(nome, { args, ms: Date.now() - t0 });
      return { jsonrpc: '2.0', id, result: { content } };
    } catch (e) {
      await registrar(nome, { args, erro: String((e as Error).message) });
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Erro ao consultar o sistema: ' + (e as Error).message }], isError: true } };
    }
  }
  if (metodo === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
  if (metodo === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
  return erroRpc(id, -32601, 'método não suportado: ' + metodo);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const segredo = Deno.env.get('MCP_TOKEN');
  if (!segredo || segredo.length < 32) return json({ erro: 'MCP_TOKEN não configurado (mínimo 32 caracteres)' }, 500);
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!iguais(tok, segredo)) return json({ erro: 'sem acesso' }, 401);
  if (req.method === 'GET') return new Response('', { status: 405, headers: { ...CORS, allow: 'POST' } });   // sem fluxo SSE: só POST
  if (req.method === 'DELETE') return new Response('', { status: 200, headers: CORS });
  if (req.method !== 'POST') return new Response('', { status: 405, headers: CORS });
  let corpo: any; try { corpo = await req.json(); } catch { return json(erroRpc(null, -32700, 'JSON inválido'), 400); }
  if (Array.isArray(corpo)) {
    const rs = (await Promise.all(corpo.map(atender))).filter(Boolean);
    return rs.length ? json(rs) : new Response(null, { status: 202, headers: CORS });
  }
  const r = await atender(corpo);
  return r ? json(r) : new Response(null, { status: 202, headers: CORS });
});
