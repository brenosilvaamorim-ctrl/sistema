// CONVITE DE ACESSO — só o titular pode chamar.
// Cria o usuário no Auth, manda o link por e-mail e já grava o perfil no escritório.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

const PERFIS = ['titular', 'advogado', 'estagiario', 'administrativo'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // quem está pedindo?
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  if (!token) return json({ erro: 'sem credencial' }, 401);
  const { data: quem, error: eu } = await admin.auth.getUser(token);
  if (eu || !quem?.user) return json({ erro: 'credencial inválida' }, 401);

  const { data: meu } = await admin.from('usuario')
    .select('escritorio_id, perfil, nome').eq('id', quem.user.id).maybeSingle();
  if (!meu) return json({ erro: 'você não está cadastrado em nenhum escritório' }, 403);
  if (meu.perfil !== 'titular') return json({ erro: 'só o titular pode convidar' }, 403);

  const corpo = await req.json().catch(() => ({}));
  const email = String(corpo.email || '').trim().toLowerCase();
  const nome = String(corpo.nome || '').trim();
  const perfil = String(corpo.perfil || 'estagiario');
  const destino = String(corpo.destino || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ erro: 'e-mail inválido' }, 400);
  if (!nome) return json({ erro: 'informe o nome' }, 400);
  if (!PERFIS.includes(perfil)) return json({ erro: 'perfil desconhecido' }, 400);

  // já existe no escritório?
  const { data: ja } = await admin.from('usuario').select('id').eq('email', email).maybeSingle();
  if (ja) return json({ erro: 'esse e-mail já tem acesso' }, 409);

  // convida (cria no Auth e dispara o e-mail com o link)
  const { data: novo, error: ec } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: destino || undefined,
    data: { nome, escritorio: meu.escritorio_id },
  });
  if (ec || !novo?.user) return json({ erro: 'não consegui enviar o convite: ' + (ec?.message || '') }, 500);

  const { error: ei } = await admin.from('usuario').insert({
    id: novo.user.id, escritorio_id: meu.escritorio_id,
    nome, email, perfil, ativo: true,
  });
  if (ei) return json({ erro: 'convite enviado, mas falhou ao gravar o perfil: ' + ei.message }, 500);

  return json({ ok: true, email, nome, perfil,
    aviso: 'O convite foi enviado. O link do e-mail vale por tempo limitado; se expirar, a pessoa entra pela tela de login digitando o mesmo e-mail.' });
});
