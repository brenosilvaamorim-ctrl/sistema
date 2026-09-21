// CONEXÃO COM O GOOGLE AGENDA (OAuth 2.0)
// Duas entradas na mesma função:
//   POST {acao:'iniciar'}  + JWT do usuário  -> devolve a URL de consentimento
//   GET  ?code=...&state=  (o Google chamando de volta) -> guarda o refresh_token
// O refresh_token é a chave da agenda pessoal. Ele nunca sai daqui: a tela lê a
// view google_conta_visao, que só diz se está conectada ou não.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const APP = 'https://sistema.brenosamorimadvocacia.com.br/';
const ESCOPO = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'openid', 'email',
].join(' ');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });
const volta = (q: string) => new Response(null, { status: 302, headers: { Location: APP + '#/config?google=' + q } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const CID = Deno.env.get('GOOGLE_CLIENT_ID');
  const CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const SBURL = Deno.env.get('SUPABASE_URL')!;
  const REDIRECT = SBURL + '/functions/v1/google-oauth';
  const db = createClient(SBURL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const url = new URL(req.url);

  // ---------------------------------------------------------- volta do Google
  if (url.searchParams.get('error')) return volta('negado');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (code && state) {
    if (!CID || !CSEC) return volta('semchave');
    const { data: conta } = await db.from('google_conta')
      .select('id, dono_id, nonce_em').eq('nonce', state).maybeSingle();
    if (!conta) return volta('estado');
    // O nonce vale 15 minutos. Passou disso, começa de novo.
    if (Date.now() - Date.parse(conta.nonce_em) > 15 * 60000) return volta('expirou');

    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: CID, client_secret: CSEC,
        redirect_uri: REDIRECT, grant_type: 'authorization_code',
      }),
    });
    const t = await r.json();
    if (!r.ok || !t.refresh_token) {
      await db.from('google_conta').update({
        ultimo_erro: 'Troca do código falhou: ' + (t.error_description || t.error || r.status) +
          (r.ok && !t.refresh_token ? ' (o Google não devolveu refresh_token — remova o acesso em myaccount.google.com/permissions e conecte de novo)' : ''),
      }).eq('id', conta.id);
      return volta('token');
    }

    let email = null;
    try {
      const me = await fetch('https://www.googleapis.com/oauth2/v3/userinfo',
        { headers: { authorization: 'Bearer ' + t.access_token } });
      if (me.ok) email = (await me.json()).email ?? null;
    } catch { /* e-mail é enfeite; a conexão vale sem ele */ }

    await db.from('google_conta').update({
      refresh_token: t.refresh_token, email, ativo: true,
      nonce: null, nonce_em: null, sync_token: null, ultimo_erro: null,
    }).eq('id', conta.id);
    return volta('ok');
  }

  // ------------------------------------------------------------- iniciar
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ erro: 'Faça login no sistema antes de conectar o Google.' }, 401);

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch { /* GET sem corpo */ }

  if (corpo.acao === 'desconectar') {
    await db.from('google_conta').update({
      refresh_token: null, ativo: false, sync_token: null, email: null,
    }).eq('dono_id', u.user.id);
    return json({ ok: true });
  }

  if (!CID || !CSEC) return json({
    erro: 'Falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em Supabase → Edge Functions → Secrets.',
  }, 400);

  const { data: esc } = await db.from('escritorio').select('id').limit(1).maybeSingle();
  const nonce = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const { error } = await db.from('google_conta').upsert({
    dono_id: u.user.id, escritorio_id: esc?.id ?? null,
    nonce, nonce_em: new Date().toISOString(),
  }, { onConflict: 'dono_id' });
  if (error) return json({ erro: error.message }, 500);

  const p = new URLSearchParams({
    client_id: CID, redirect_uri: REDIRECT, response_type: 'code', scope: ESCOPO,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: nonce,
  });
  return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + p.toString() });
});
