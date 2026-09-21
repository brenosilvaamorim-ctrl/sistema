// LEITOR DE DOCUMENTOS
// Recebe um PDF ou uma foto (CTPS, TRCT, contracheque, cartão de ponto, laudo, edital)
// e devolve os campos estruturados e os fatos com a página onde cada um aparece.
// Não grava nada sozinho: quem confirma é o advogado, na tela do caso.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

const SISTEMA = `Você lê documentos de processos trabalhistas brasileiros e devolve dado estruturado.
Regras absolutas:
- Só extraia o que está ESCRITO no documento. Nunca deduza, nunca complete, nunca estime.
- Campo ilegível ou ausente: deixe fora do JSON. É melhor faltar do que inventar.
- Datas sempre em AAAA-MM-DD. Valores como número, sem R$ e sem ponto de milhar.
- Em cada fato, informe a página em que ele aparece e transcreva o trecho exato que o comprova.
Responda APENAS com JSON, sem comentário e sem cerca de código:
{"tipo":"CTPS|TRCT|contracheque|cartão de ponto|ASO|CAT|laudo|edital|contrato|outro",
 "campos":{"empresa":"","cnpj":"","admissao":"","saida":"","funcao":"","salario":0,"jornada":"","motivo":"","ctps":""},
 "fatos":[{"data":"","descricao":"","trecho":"","pagina":1}],
 "observacao":"o que ficou ilegivel ou duvidoso",\n "transcricao":"transcreva aqui, corrido, TODO o texto legivel do documento, na ordem em que aparece; nao resuma, nao interprete e nao complete o que nao estiver escrito"}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return resp({ erro: 'ANTHROPIC_API_KEY não configurada' }, 500);

  const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!jwt) return resp({ erro: 'sem autenticação' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return resp({ erro: 'sessão inválida' }, 401);

  const body = await req.json().catch(() => ({}));
  const { arquivo, mime, nome = 'documento', caso_id } = body;
  if (!arquivo) return resp({ erro: 'arquivo obrigatório' }, 400);
  if (arquivo.length > 9_000_000) return resp({ erro: 'arquivo grande demais; mande até ~6 MB' }, 400);

  const bloco = String(mime || '').includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: arquivo } };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 12000, system: SISTEMA,
      messages: [{ role: 'user', content: [bloco,
        { type: 'text', text: `Arquivo: ${nome}. Extraia o que estiver escrito, no formato pedido.` }] }],
    }),
  });
  if (!r.ok) return resp({ erro: erroClaude(r.status, await r.text()) }, 502);
  const j = await r.json();
  const txt = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  const m = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  let lido: any = null;
  try { lido = JSON.parse(m ? m[0] : txt); } catch { /* devolve cru abaixo */ }
  if (!lido) return resp({ erro: 'não consegui estruturar a leitura', cru: txt.slice(0, 1500) }, 422);

  if (lido.campos) for (const k of Object.keys(lido.campos))
    if (lido.campos[k] === '' || lido.campos[k] === 0 || lido.campos[k] === null) delete lido.campos[k];
  lido.fatos = Array.isArray(lido.fatos) ? lido.fatos.filter((f: any) => f && f.descricao) : [];
  lido.arquivo = nome;
  lido.caso_id = caso_id ?? null;
  return resp(lido);
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


