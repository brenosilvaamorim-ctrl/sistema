import { createClient } from 'jsr:@supabase/supabase-js@2';

const AREAS = ['servidores-publicos','servidores-educacao','processo-disciplinar','concursos-publicos','acidente-de-trabalho','redacao'];
const TIPOS = ['legislacao','armadilha','foro','documento','correcao'];
const VERIF = ['verificado','fonte_secundaria','nao_verificado'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ erro: 'use POST' }), { status: 405, headers: cors });

  let body;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ erro: 'JSON invalido' }), { status: 400, headers: cors }); }

  const faltando = ['area','tipo','titulo','conteudo'].filter((c) => !body[c]);
  if (faltando.length) return new Response(JSON.stringify({ erro: 'campos obrigatorios: ' + faltando.join(', ') }), { status: 400, headers: cors });
  if (!AREAS.includes(body.area)) return new Response(JSON.stringify({ erro: 'area invalida; use: ' + AREAS.join(', ') }), { status: 400, headers: cors });
  if (!TIPOS.includes(body.tipo)) return new Response(JSON.stringify({ erro: 'tipo invalido; use: ' + TIPOS.join(', ') + ' (precedente vai para a tabela precedente; tese, para tese_candidata)' }), { status: 400, headers: cors });
  if (body.verificacao && !VERIF.includes(body.verificacao)) return new Response(JSON.stringify({ erro: 'verificacao invalida; use: ' + VERIF.join(', ') }), { status: 400, headers: cors });

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

  let escritorioId = body.escritorio_id;
  if (!escritorioId) {
    const { data: esc, error: escErro } = await supabase.from('escritorio').select('id').limit(1).single();
    if (escErro) return new Response(JSON.stringify({ erro: 'escritorio nao resolvido: ' + escErro.message }), { status: 500, headers: cors });
    escritorioId = esc.id;
  }

  const { data, error } = await supabase.from('achado').insert({
    escritorio_id: escritorioId,
    area: body.area,
    tipo: body.tipo,
    ficha: body.ficha ?? null,
    titulo: body.titulo,
    conteudo: body.conteudo,
    fonte: body.fonte ?? null,
    verificacao: body.verificacao ?? 'nao_verificado',
    origem: body.origem ?? body.origem_chat ?? null,
    caso: body.caso ?? null,
    status: 'pendente',
  }).select('id, criado_em').single();

  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ ok: true, id: data.id, status: 'pendente' }), { status: 201, headers: cors });
});