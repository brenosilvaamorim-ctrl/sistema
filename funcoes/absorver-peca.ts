// ABSORVEDOR DE PEÇAS
// Lê uma peça pronta (a que o Breno de fato protocolou) e alimenta o banco:
// teses novas, refinamentos de teses existentes e precedentes reais.
// Nada entra direto: tudo vira CANDIDATO, para o advogado aprovar.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const INSTRUCAO = `Você mantém o banco de teses de um escritório de advocacia. Recebe uma peça
que o advogado efetivamente protocolou e o índice das teses que o banco já tem.

SUA TAREFA
1. TESES NOVAS: tópicos jurídicos autônomos da peça que NÃO existem no banco.
2. REFINAMENTOS: quando a peça argumentou uma tese que já existe, mas de forma melhor, com
   precedente novo, com uma virada retórica nova ou enfrentando uma defesa que o texto-base não
   previa. Aponte o codigo_alvo e escreva o texto_base JÁ INCORPORANDO a melhoria.
3. PRECEDENTES: todo julgado citado, com os dados exatos como estao na peca.
   Para CADA julgado devolva tambem:
   - citacao: TRANSCREVA LITERALMENTE o trecho da peca em que ele aparece, do inicio do periodo ate
     o fim do raciocinio (ate 1200 caracteres). Copie palavra por palavra, sem resumir e sem reescrever.
   - ementa: se a peca transcrever a ementa ou o trecho do acordao, COPIE-A INTEIRA, literal (ate 3000
     caracteres). Se a peca nao transcrever, deixe null. Nunca escreva uma ementa de memoria.

REGRAS
- Não invente. Copie tribunal, número, relator, órgão e datas exatamente como aparecem. Campo que
  não estiver na peça fica null.
- Não proponha tese que seja recorte de outra já existente. Na dúvida, proponha refinamento.
- Ignore endereçamento, qualificação das partes, valor da causa e assinatura.
- texto_base é ROTEIRO de argumentação (600 a 1500 caracteres), não cópia da peça: descreva a
  sequência, as viradas, os precedentes e as frases de força. Sem nome de cliente nem de empresa.
- gatilho: em 1 ou 2 frases, quando a tese se aplica. Será usado para triagem automática.
- justificativa: em uma frase, por que vale a pena entrar no banco.

FORMATO — responda SOMENTE com JSON válido:
{"teses_novas":[{"codigo":"CODIGO_EM_MAIUSCULAS","area":"...","titulo":"...","rubrica":"...",
"gatilho":"...","texto_base":"...","pedido_modelo":"...","provas":"...","justificativa":"..."}],
"refinamentos":[{"codigo_alvo":"...","texto_base":"...","justificativa":"..."}],
"precedentes":[{"tribunal":"...","tipo_recurso":"...","numero":"...","relator":"...","orgao":"...","citacao":"...","ementa":null,
"julgamento":"AAAA-MM-DD","publicacao":"AAAA-MM-DD","tema":"...","tese_codigo":"..."}]}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return new Response(JSON.stringify({ erro: 'ANTHROPIC_API_KEY não configurada' }),
    { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  let { texto = '', origem = 'peça avulsa', minuta_id = null, area = null } = body;

  if (minuta_id && !texto) {
    const { data: m } = await db.from('minuta').select('corpo, caso_id').eq('id', minuta_id).single();
    texto = m?.corpo ?? '';
    origem = origem === 'peça avulsa' ? 'minuta ' + minuta_id : origem;
  }
  if (!texto || texto.length < 500)
    return new Response(JSON.stringify({ erro: 'texto ausente ou curto demais' }),
      { status: 400, headers: { ...CORS, 'content-type': 'application/json' } });

  const { data: esc } = await db.from('escritorio').select('id').limit(1).single();
  await db.from('peca_absorvida').insert({ escritorio_id: esc!.id, origem, texto: texto.slice(0, 400000) });
  const { data: banco } = await db.from('tese')
    .select('codigo, titulo, gatilho').eq('escritorio_id', esc!.id).eq('ativo', true);
  const indice = (banco ?? []).filter(t => !t.codigo.startsWith('_'))
    .map(t => `- ${t.codigo}: ${t.titulo} | ${t.gatilho}`).join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 16000, system: INSTRUCAO,
      messages: [{ role: 'user', content:
        `TESES JÁ NO BANCO:\n${indice}\n\n=== PEÇA (origem: ${origem}) ===\n${texto.slice(0, 120000)}` }] }),
  });
  if (!r.ok) return new Response(JSON.stringify({ erro: erroClaude(r.status, await r.text()) }),
    { status: 502, headers: { ...CORS, 'content-type': 'application/json' } });

  const j = await r.json();
  const bruto = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const m = bruto.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  let out: any = null;
  try { out = JSON.parse(m ? m[0] : bruto); } catch { /* ignore */ }
  if (!out) return new Response(JSON.stringify({ erro: 'saída fora do formato', trecho: bruto.slice(0, 400) }),
    { status: 502, headers: { ...CORS, 'content-type': 'application/json' } });

  const cands = [
    ...(out.teses_novas ?? []).map((t: any) => ({
      escritorio_id: esc!.id, tipo: 'nova', codigo: t.codigo, area: t.area ?? area,
      titulo: t.titulo, rubrica: t.rubrica, gatilho: t.gatilho, texto_base: t.texto_base,
      pedido_modelo: t.pedido_modelo, provas: t.provas, origem, justificativa: t.justificativa,
    })),
    ...(out.refinamentos ?? []).map((t: any) => ({
      escritorio_id: esc!.id, tipo: 'refinamento', codigo: t.codigo_alvo, codigo_alvo: t.codigo_alvo,
      texto_base: t.texto_base, origem, justificativa: t.justificativa,
    })),
  ];
  const { error: e1 } = cands.length ? await db.from('tese_candidata').insert(cands) : { error: null };

  const precs = (out.precedentes ?? []).filter((p: any) => p.tribunal && p.numero).map((p: any) => ({
    escritorio_id: esc!.id, tribunal: p.tribunal, tipo_recurso: p.tipo_recurso, numero: p.numero,
    relator: p.relator, orgao: p.orgao, julgamento: p.julgamento || null, publicacao: p.publicacao || null,
    citacao: p.citacao ?? null, ementa: p.ementa ?? null, citacao_fonte: 'peça: ' + origem,
    tema: p.tema, tese_codigo: p.tese_codigo, origem, confirmado: false,
  }));
  const { error: e2 } = precs.length
    ? await db.from('precedente').upsert(precs, { onConflict: 'escritorio_id,tribunal,numero', ignoreDuplicates: true })
    : { error: null };

  const vazio = cands.length === 0 && precs.length === 0;
  return new Response(JSON.stringify({
    origem, teses_novas: (out.teses_novas ?? []).length,
    refinamentos: (out.refinamentos ?? []).length, precedentes: precs.length,
    erro_teses: e1?.message, erro_precedentes: e2?.message,
    stop_reason: j.stop_reason, caracteres: texto.length, teses_no_indice: (banco ?? []).length,
    amostra: vazio ? bruto.slice(0, 600) : undefined,
  }, null, 2), { headers: { ...CORS, 'content-type': 'application/json' } });
});function erroClaude(status: number, txt: string) {
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


