// REDATOR DE INFORMATIVOS
// Lê o texto INTEGRAL da intimação (DJEN) + as movimentações do DataJud
// e redige uma mensagem específica para aquele cliente, naquele processo.
// Nada é enviado: grava como RASCUNHO. O envio continua sendo ato do advogado.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SISTEMA_PADRAO = `Você escreve a mensagem que um advogado manda ao próprio cliente pelo WhatsApp.`;

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

async function redigir(ctx: string, key: string, sistema: string) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: sistema,
      messages: [{ role: 'user', content: ctx }],
    }),
  });
  if (!r.ok) throw new Error(erroClaude(r.status, await r.text()));
  const j = await r.json();
  const txt = (j.content ?? []).filter((b: any) => b.type === 'text')
    .map((b: any) => b.text).join('\n').trim()
    .replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const m = txt.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : txt); }
  catch {
    return { corpo: txt, relevancia: 'media', revisar: true,
      motivo_revisar: txt ? 'saída fora do formato' : 'resposta vazia (stop: ' + (j.stop_reason ?? '?') + ')' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return new Response(JSON.stringify({ erro: 'ANTHROPIC_API_KEY não configurada' }),
    { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const alvo: number[] | null = body.caso_ids ?? (body.caso_id ? [body.caso_id] : null);
  const limite = Number(body.limite ?? 20);

  // casos com movimentação nova desde o último informativo
  let q = db.from('mensageria_painel').select('*').gt('novidades', 0).limit(limite);
  if (alvo) q = db.from('mensageria_painel').select('*').in('caso_id', alvo);
  const { data: casos, error } = await q;
  if (error) return new Response(JSON.stringify({ erro: error.message }),
    { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });

  const { data: estiloRow } = await db.from('tese')
    .select('texto_base').eq('codigo', '_ESTILO_MENSAGEM_').maybeSingle();
  const sistema = estiloRow?.texto_base ?? SISTEMA_PADRAO;

  const feitos: any[] = [];
  for (const c of casos ?? []) {
    const { data: procs } = await db.from('processo')
      .select('id, escritorio_id, numero_cnj, numero_formatado, tribunal_sigla, classe, orgao, assunto')
      .eq('caso_id', c.caso_id);
    const ids = (procs ?? []).map(p => p.id);
    if (!ids.length) continue;

    const desde = c.ultimo_contato ?? '2000-01-01';
    const { data: movs } = await db.from('movimentacao_traduzida')
      .select('data, descricao, texto_cliente, categoria')
      .in('processo_id', ids).gte('data', String(desde).slice(0, 10))
      .order('data', { ascending: false }).limit(12);

    // TEXTO INTEGRAL da publicação — é daqui que sai a mensagem específica
    const { data: intims } = await db.from('intimacao')
      .select('data_disponibilizacao, tipo_documento, texto')
      .in('processo_id', ids).gte('data_disponibilizacao', String(desde).slice(0, 10))
      .order('data_disponibilizacao', { ascending: false }).limit(4);

    const p = procs![0];
    const ctx = [
      `CLIENTE: ${c.nome}`,
      `PROCESSO: ${p.numero_formatado || p.numero_cnj} — ${p.classe ?? ''} — ${p.orgao ?? ''} (${p.tribunal_sigla ?? ''})`,
      `ÁREA: ${c.area ?? 'não informada'}`,
      '',
      'MOVIMENTAÇÕES NOVAS (DataJud):',
      ...(movs ?? []).map(m => `- ${m.data}: ${m.descricao}${m.texto_cliente ? ' (tradução atual: ' + m.texto_cliente + ')' : ''}`),
      '',
      'TEXTO INTEGRAL DAS PUBLICAÇÕES (DJEN) — fonte principal:',
      ...(intims ?? []).map(i => `--- ${i.data_disponibilizacao} (${i.tipo_documento ?? ''}) ---\n${String(i.texto || '').slice(0, 6000)}`),
      (intims ?? []).length ? '' : '(sem publicação no período — use apenas as movimentações acima)',
    ].join('\n');

    try {
      const out = await redigir(ctx, key, sistema);
      const { error: e } = await db.from('informativo_rascunho').upsert({
        escritorio_id: p.escritorio_id, caso_id: c.caso_id, processo_id: p.id,
        corpo: out.corpo, relevancia: out.relevancia, revisar: !!out.revisar,
        motivo_revisar: out.motivo_revisar ?? null, contexto_hash: ctx.length + ':' + (movs?.[0]?.data ?? ''),
        status: 'rascunho',
      }, { onConflict: 'caso_id,contexto_hash' });
      feitos.push({ caso: c.nome, relevancia: out.relevancia, revisar: out.revisar, erro: e?.message });
    } catch (err) {
      feitos.push({ caso: c.nome, erro: String(err) });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  return new Response(JSON.stringify({ processados: feitos.length, feitos }, null, 2),
    { headers: { ...CORS, 'content-type': 'application/json' } });
});
