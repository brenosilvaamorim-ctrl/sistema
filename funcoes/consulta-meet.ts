// CONSULTA POR VÍDEO: SALA DO MEET NA HORA
//
// A tela da Captação chama esta função logo depois de gravar uma consulta com
// formato 'video'. Ela leva o evento para o Google Agenda de quem está logado já
// com a sala do Meet e devolve o link, que fica em evento.link_sala.
//
// Por que não esperar o google-sync: ele só roda quando alguém aperta
// "Sincronizar agora", e o link é preciso no mesmo minuto, para mandar à pessoa.
//
// Para não duplicar o evento, grava o vínculo em google_link exatamente como o
// google-sync faria. Na próxima troca, o google-sync acha o vínculo e só
// atualiza o evento (o PATCH dele não mexe na sala, que continua a mesma).
//
// Remarcar uma consulta que já tem sala: a sala fica, muda só a data, pelo
// google-sync. Consulta que passou a ser por vídeo e já estava no Google sem
// sala: a sala é acrescentada ao evento que já existe.
//
// POST { evento_id }  +  login do escritório no Authorization
// Resposta: { link, google_id }  ou  { erro }

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TZ = 'America/Sao_Paulo';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

async function acesso(refresh: string, cid: string, csec: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cid, client_secret: csec, refresh_token: refresh, grant_type: 'refresh_token' }),
  });
  const t = await r.json();
  if (!r.ok) throw new Error('O Google recusou a chave da conta: ' + (t.error_description || t.error || r.status) +
    '. Reconecte em Configurações.');
  return t.access_token as string;
}

async function chamar(tok: string, url: string, metodo = 'GET', corpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 404 || r.status === 410) return { ausente: true };
  const t = await r.text();
  if (!r.ok) throw new Error(`Google ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

/* Mesmo título e mesmo horário que o google-sync monta, para a troca seguinte
   não estranhar o evento. A hora gravada no banco é a de Petrolina, com +00:00
   só de rótulo — por isso se lê a hora pelo texto, não pelo relógio. */
function corpoEvento(e: any) {
  const ini = String(e.inicio).slice(0, 16);           // AAAA-MM-DDTHH:MM
  const dia = ini.slice(0, 10), hora = ini.slice(11, 16);
  const fim = e.fim ? String(e.fim).slice(0, 19)
    : `${dia}T${String(Number(hora.slice(0, 2)) + 1).padStart(2, '0')}:${hora.slice(3, 5)}:00`;
  return {
    summary: `${e.tipo}: ${e.titulo}` + (e.cliente?.nome ? ' — ' + e.cliente.nome : (e.caso?.titulo ? ' — ' + e.caso.titulo : '')),
    description: (e.descricao || '') + '\n\n— lançado pelo sistema do escritório',
    location: e.local || undefined,
    start: { dateTime: `${ini}:00`, timeZone: TZ },
    end: { dateTime: fim, timeZone: TZ },
    extendedProperties: { private: { sistema: 'breno', qual: 'evento', ref: e.id } },
  };
}

const pedidoSala = (id: string) => ({
  createRequest: { requestId: 'consulta-' + id + '-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
});
const linkDa = (g: any) =>
  g?.hangoutLink || (g?.conferenceData?.entryPoints || []).find((p: any) => p.entryPointType === 'video')?.uri || null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);

  const CID = Deno.env.get('GOOGLE_CLIENT_ID'), CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!CID || !CSEC) return json({ erro: 'Falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos Secrets.' }, 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // quem pede: login ativo do escritório
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const { data: quem } = await db.auth.getUser(jwt);
  if (!quem?.user) return json({ erro: 'Faça login no sistema.' }, 401);
  const { data: u } = await db.from('usuario').select('id, escritorio_id')
    .eq('id', quem.user.id).eq('ativo', true).maybeSingle();
  if (!u) return json({ erro: 'acesso restrito ao escritório' }, 403);

  let corpo: any = {};
  try { corpo = await req.json(); } catch { /* sem corpo */ }
  if (!corpo.evento_id) return json({ erro: 'falta evento_id' }, 400);

  const { data: ev } = await db.from('evento')
    .select('id, escritorio_id, tipo, titulo, descricao, inicio, fim, local, link_sala, formato, cliente:cliente_id(nome), caso:caso_id(titulo)')
    .eq('id', corpo.evento_id).eq('escritorio_id', u.escritorio_id).maybeSingle();
  if (!ev) return json({ erro: 'consulta não encontrada' }, 404);

  // a agenda de quem marcou; se essa pessoa não ligou o Google, a do escritório
  let { data: conta } = await db.from('google_conta').select('*')
    .eq('dono_id', u.id).eq('ativo', true).not('refresh_token', 'is', null).maybeSingle();
  if (!conta) ({ data: conta } = await db.from('google_conta').select('*')
    .eq('escritorio_id', u.escritorio_id).eq('ativo', true).not('refresh_token', 'is', null).limit(1).maybeSingle());
  if (!conta) return json({ erro: 'Nenhuma conta do Google conectada. Conecte em Configurações para gerar o Meet.' }, 400);

  try {
    const tok = await acesso(conta.refresh_token, CID, CSEC);
    const cal = encodeURIComponent(conta.calendar_id || 'primary');
    const base = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;

    const { data: vinc } = await db.from('google_link').select('*')
      .eq('dono_id', conta.dono_id).eq('qual', 'evento').eq('ref', ev.id).maybeSingle();

    let g: any = null;
    if (vinc) {
      g = await chamar(tok, `${base}/${encodeURIComponent(vinc.google_id)}`);
      if (g?.ausente) g = null;
      else if (!linkDa(g)) {
        g = await chamar(tok, `${base}/${encodeURIComponent(vinc.google_id)}?conferenceDataVersion=1`, 'PATCH',
          { conferenceData: pedidoSala(ev.id) });
      }
    }
    if (!g) {
      g = await chamar(tok, `${base}?conferenceDataVersion=1`, 'POST',
        { ...corpoEvento(ev), conferenceData: pedidoSala(ev.id) });
      if (vinc) await db.from('google_link').update({ google_id: g.id, hash_local: null, atualizado_em: new Date().toISOString() }).eq('id', vinc.id);
      else await db.from('google_link').insert({ dono_id: conta.dono_id, qual: 'evento', ref: ev.id, google_id: g.id, hash_local: null });
    }

    // O Google costuma devolver a sala na hora; quando ela vem "pendente", espera e relê.
    let link = linkDa(g);
    for (let i = 0; !link && i < 4; i++) {
      await new Promise(r => setTimeout(r, 1000));
      g = await chamar(tok, `${base}/${encodeURIComponent(g.id)}`);
      link = linkDa(g);
    }
    if (!link) return json({ erro: 'O Google criou o evento, mas ainda não devolveu a sala. Tente de novo em instantes.' }, 502);

    await db.from('evento').update({ link_sala: link, google_event_id: g.id }).eq('id', ev.id);
    return json({ link, google_id: g.id });
  } catch (e) {
    const msg = String((e as Error).message).slice(0, 400);
    await db.from('google_conta').update({ ultimo_erro: msg }).eq('id', conta.id);
    return json({ erro: msg }, 502);
  }
});
