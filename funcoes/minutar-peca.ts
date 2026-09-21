// MINUTADOR DE PEÇAS
// Etapa 1 (triagem): lê os fatos do caso e indica quais teses do banco se aplicam.
// Etapa 2 (redação): monta a peça no estilo do escritório, usando os textos-base das teses.
// Nada é protocolado: grava como MINUTA. A revisão e a assinatura são do advogado.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// O estilo de redação vive no banco (tese._ESTILO_), editável sem redeploy.
const ESTILO_PADRAO = 'Redija em português jurídico formal, firme e sem prolixidade.';

// Traduz a recusa da Anthropic para uma frase que o advogado entende.
function erroClaude(status: number, txt: string) {
  const t = String(txt || '').toLowerCase();
  if (status === 402 || t.includes('credit balance') || t.includes('insufficient'))
    return 'Os creditos da API da Anthropic acabaram. Recarregue em platform.claude.com, no menu Billing, e tente de novo — nada foi perdido.';
  if (status === 401 || status === 403)
    return 'A chave da API da Anthropic foi revogada ou esta errada. Troque em Supabase, Edge Functions, Secrets.';
  if (status === 429)
    return 'A Anthropic limitou a velocidade neste momento. Espere um minuto e tente de novo.';
  if (status === 529 || status >= 500)
    return 'A Anthropic esta indisponivel agora. Tente de novo em alguns minutos.';
  return 'A Anthropic recusou o pedido (codigo ' + status + '). ' + String(txt || '').slice(0, 200);
}

async function claude(sys: string, user: string, key: string, max = 8000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: max, system: sys,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: user }] }),
  });
  if (!r.ok) throw new Error(erroClaude(r.status, await r.text()));
  const j = await r.json();
  (globalThis as any).__diag = { stop: j.stop_reason, blocos: (j.content ?? []).map((b: any) => b.type), uso: j.usage };
  return (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
}

function json(txt: string) {
  const m = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : txt); } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return new Response(JSON.stringify({ erro: 'ANTHROPIC_API_KEY não configurada' }),
    { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const { caso_id, fatos = '', etapa = 'completo', tipo = 'inicial' } = body;
  let teses: string[] = body.teses ?? [];
  if (!caso_id) return new Response(JSON.stringify({ erro: 'caso_id obrigatório' }),
    { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });

  const { data: caso } = await db.from('caso')
    .select('id, escritorio_id, titulo, area, ficha, cliente:cliente_id(*)')
    .eq('id', caso_id).single();
  if (!caso) return new Response(JSON.stringify({ erro: 'caso não encontrado' }),
    { status: 404, headers: { ...CORS, 'content-type': 'application/json' } });

  const { data: procs } = await db.from('processo')
    .select('numero_formatado, numero_cnj, orgao, tribunal_sigla, classe').eq('caso_id', caso_id);

  const { data: banco } = await db.from('tese')
    .select('codigo, titulo, rubrica, gatilho, texto_base, pedido_modelo, provas')
    .eq('escritorio_id', caso.escritorio_id).eq('ativo', true);

  // PLAYBOOK — as posições padrão do escritório, escritas pelo advogado.
  const { data: pbTodos } = await db.from('playbook')
    .select('area, tema, tese, quando_usar, texto_padrao, contra, fundamento')
    .eq('escritorio_id', caso.escritorio_id).eq('ativo', true).order('ordem');
  const norm = (t: string) => String(t ?? '').toLowerCase();
  const pb = (pbTodos ?? []).filter((t: any) => !t.area || !caso.area || norm(t.area) === norm(caso.area));
  const alvoTxt = JSON.stringify(caso ?? {}).toLowerCase();
  const palavras = new Set(alvoTxt.split(/[^a-zA-Zaaaaeeiooouuc]+/).filter((p: string) => p.length > 4));
  const pontua = (t: any) => {
    const campo = [t.tema, t.tese, t.quando_usar].join(' ').toLowerCase();
    let n = 0; for (const p of palavras) if (campo.includes(p as string)) n++; return n;
  };
  const pbUsar = pb
    .map((t: any) => ({ t, n: pontua(t) }))
    .sort((a: any, b: any) => b.n - a.n)
    .slice(0, 6)
    .map((x: any) => ({ ...x.t, texto_padrao: String(x.t.texto_padrao ?? '').slice(0, 900) }));
  const playbook = pbUsar.map((t: any) => {
    let s = '### ' + t.tema + '\nTESE: ' + t.tese;
    if (t.quando_usar) s += '\nSO CABE QUANDO: ' + t.quando_usar;
    if (t.fundamento) s += '\nFUNDAMENTO (use exatamente este): ' + t.fundamento;
    if (t.contra) s += '\nSE A DEFESA ALEGAR: ' + t.contra;
    if (t.texto_padrao) s += '\nREDACAO DO ESCRITORIO (aproveite a estrutura e o vocabulario):\n' + t.texto_padrao;
    return s;
  }).join('\n\n');

  const contexto = [
    `CASO: ${caso.titulo} — área ${caso.area ?? 'não informada'}`,
    `CLIENTE: ${JSON.stringify(caso.cliente ?? {})}`,
    procs?.length ? `PROCESSO: ${JSON.stringify(procs[0])}` : 'PROCESSO: ainda não distribuído',
    caso.ficha ? `FICHA DE ATENDIMENTO: ${JSON.stringify(caso.ficha)}` : '',
    fatos ? `FATOS INFORMADOS AGORA:\n${fatos}` : '',
  ].filter(Boolean).join('\n\n');

  // ETAPA 1 — triagem
  if (!teses.length) {
    const lista = (banco ?? []).filter(t => !t.codigo.startsWith('_')).map(t => `- ${t.codigo}: ${t.titulo}\n  aplica-se quando: ${t.gatilho}`).join('\n');
    const out = json(await claude(
      'Você é um advogado trabalhista sênior fazendo a triagem de teses de um caso novo.',
      `TESES DISPONÍVEIS NO BANCO DO ESCRITÓRIO:\n${lista}\n\n` +
      (pb.length ? 'POSICOES DO PLAYBOOK QUE PODEM CABER:\n' + pb.map((t: any) => '- ' + t.tema + ': ' + t.tese + (t.quando_usar ? ' (so cabe quando: ' + t.quando_usar + ')' : '')).join('\n') + '\n\n' : '') +
      `${contexto}\n\n` +
      `Indique quais teses se aplicam. Não force: só inclua se os fatos a sustentarem. ` +
      `Seja TELEGRÁFICO: "porque" e "falta" com no máximo 12 palavras cada.\n` +
      `Responda SOMENTE com JSON, sem quebras de linha dentro dos valores: ` +
      `{"teses":[{"codigo":"...","porque":"...","falta":"..."}],"teses_sem_modelo":["..."]}`,
      key, 8000));
    if (etapa === 'triagem' || !out?.teses?.length)
      return new Response(JSON.stringify(out ?? { erro: 'triagem sem resultado' }, null, 2),
        { headers: { ...CORS, 'content-type': 'application/json' } });
    teses = out.teses.map((t: any) => t.codigo);
  }

  // ETAPA 2 — redação
  const estilo = (banco ?? []).find(t => t.codigo === '_ESTILO_')?.texto_base ?? ESTILO_PADRAO;
  const metodo = (banco ?? []).find(t => t.codigo === '_ESTRATEGIA_')?.texto_base ?? '';
  const usadas = (banco ?? []).filter(t => teses.includes(t.codigo) && !t.codigo.startsWith('_'));
  const material = usadas.map(t =>
    `### ${t.codigo} — ${t.titulo}\nRUBRICA: ${t.rubrica ?? ''}\nCOMO O ESCRITÓRIO ARGUMENTA:\n${t.texto_base}\n` +
    `PEDIDO PADRÃO: ${t.pedido_modelo ?? ''}\nPROVAS: ${t.provas ?? ''}`).join('\n\n');

  const blocoPb = playbook ? '\n\nPLAYBOOK DO ESCRITORIO — posicoes ja firmadas pelo advogado.\n' +
    'Regras de uso: aplique apenas as que os fatos deste caso sustentarem; onde uma se aplicar, siga a redacao e o fundamento indicados em vez de escrever de forma generica; nao invente fundamento nem estenda a tese alem do que esta escrito aqui; quando o playbook trouxer resposta a defesa, ja deixe o argumento preparado no texto.\n\n' + playbook : '';

  const texto = await claude(metodo + '\n\n' + estilo,
    `${contexto}\n\nTESES A DESENVOLVER (use o texto-base como roteiro de argumentação, ` +
    `mas reescreva com os fatos DESTE caso):\n\n${material}${blocoPb}\n\n` +
    `Trabalhe a ${tipo} nos TRÊS TEMPOS do método. Onde faltar dado, use [CONFERIR: ...]. ` +
    `Respeite exatamente as linhas separadoras ---ANALISE--- ---PECA--- ---JUIZ--- ---PENDENCIAS---.`,
    key, 12000);

  const parte = (a: string, b?: string) => {
    const i = texto.indexOf(a); if (i < 0) return '';
    const j = b ? texto.indexOf(b, i) : -1;
    return texto.slice(i + a.length, j < 0 ? undefined : j).trim();
  };
  const analise = parte('---ANALISE---', '---PECA---');
  const corpo = parte('---PECA---', '---JUIZ---') || texto.trim();
  const juiz = parte('---JUIZ---', '---PENDENCIAS---');
  const pend = parte('---PENDENCIAS---');

  const { data: salva, error } = await db.from('minuta').insert({
    escritorio_id: caso.escritorio_id, caso_id, tipo, teses,
    corpo, analise, modo_juiz: juiz, observacoes: pend, status: 'rascunho',
  }).select('id').single();

  return new Response(JSON.stringify({
    minuta_id: salva?.id, erro: error?.message, teses,
    playbook: pbUsar.map((t: any) => t.tema),
    analise, corpo, modo_juiz: juiz, pendencias: pend,
    diag: (globalThis as any).__diag, bruto: texto.length,
  }, null, 2), { headers: { ...CORS, 'content-type': 'application/json' } });
});
