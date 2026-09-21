// SINCRONIZAÇÃO COM O GOOGLE AGENDA, NOS DOIS SENTIDOS
//
// Daqui para lá: prazos, audiências/perícias, tarefas/reuniões e prescrições
// viram eventos. Cada item guarda um vínculo (google_link) com o id de lá, e um
// resumo do próprio conteúdo. Mudou o resumo, atualiza; sumiu daqui, apaga lá.
//
// De lá para cá, com uma trava deliberada: evento novo criado no Google entra
// como reunião. Mas se alguém arrastar ou apagar no Google um PRAZO, uma
// AUDIÊNCIA ou uma PRESCRIÇÃO, o sistema NÃO obedece — ele anota a divergência
// para você decidir. Data de prazo processual nasce da intimação, não de um
// arrastar de dedo no celular.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TZ = 'America/Sao_Paulo';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

const SO_DATA = (s: unknown) => String(s ?? '').slice(0, 10);
const maisUmDia = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
async function resumo(t: string) {
  const b = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}

/* ------------------------------------------------------------------ Google */
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
const api = (cal: string, cam = '', q = '') =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events${cam}${q}`;

async function chamar(tok: string, url: string, metodo = 'GET', corpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: { authorization: 'Bearer ' + tok, 'content-type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 410) return { gone: true };
  if (r.status === 404 || r.status === 204) return { ausente: true };
  const t = await r.text();
  if (!r.ok) throw new Error(`Google ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

/* ------------------------------------------------- o que daqui vai para lá */
function montarItens(pz: any[], ev: any[], cs: any[]) {
  const itens: any[] = [];
  for (const p of pz) itens.push({
    qual: 'prazo', ref: p.id, dia: SO_DATA(p.data_fatal), hora: null,
    titulo: `Prazo: ${p.descricao}${p.caso?.titulo ? ' — ' + p.caso.titulo : ''}`,
    local: p.intimacao?.orgao || '',
    detalhe: [`${p.dias || ''} dias úteis · situação: ${p.situacao}`,
              p.intimacao?.numero_formatado || '', p.providencia || ''].filter(Boolean).join('\n'),
  });
  for (const e of ev) itens.push({
    qual: 'evento', ref: e.id, dia: SO_DATA(e.inicio),
    hora: e.dia_inteiro ? null : String(e.inicio).slice(11, 16),
    fim: e.fim || null, tipo: e.tipo,
    titulo: `${e.tipo === 'audiencia' ? 'Audiência' : e.tipo}: ${e.titulo}` +
      (e.cliente?.nome ? ' — ' + e.cliente.nome : (e.caso?.titulo ? ' — ' + e.caso.titulo : '')),
    local: e.local || '', detalhe: [e.descricao || '', e.link_sala || ''].filter(Boolean).join('\n'),
  });
  for (const c of cs) itens.push({
    qual: 'prescricao', ref: c.id, dia: SO_DATA(c.prescricao_em), hora: null,
    titulo: `Prescrição — ${c.titulo}`, local: '',
    detalhe: c.prescricao_obs || 'Prazo prescricional anotado no cadastro.',
  });
  return itens.filter(i => i.dia && i.dia.length === 10);
}

function corpoEvento(it: any) {
  const base: any = {
    summary: it.titulo,
    description: (it.detalhe || '') + '\n\n— lançado pelo sistema do escritório',
    location: it.local || undefined,
    extendedProperties: { private: { sistema: 'breno', qual: it.qual, ref: it.ref } },
  };
  if (it.hora) {
    const ini = `${it.dia}T${it.hora}:00`;
    const fim = it.fim ? String(it.fim).slice(0, 19)
      : `${it.dia}T${String(Number(it.hora.slice(0, 2)) + 1).padStart(2, '0')}:${it.hora.slice(3, 5)}:00`;
    base.start = { dateTime: ini, timeZone: TZ };
    base.end = { dateTime: fim, timeZone: TZ };
  } else {
    base.start = { date: it.dia };
    base.end = { date: maisUmDia(it.dia) };
  }
  return base;
}

/* ------------------------------------------------------------ um sincronismo */
async function sincronizar(db: any, conta: any, cid: string, csec: string) {
  const tok = await acesso(conta.refresh_token, cid, csec);
  const cal = conta.calendar_id || 'primary';
  const conta_id = conta.dono_id;
  const nota = { criados: 0, atualizados: 0, apagados: 0, vindos: 0, divergencias: 0 };

  const [pz, ev, cs, lk] = await Promise.all([
    db.from('prazo').select('id, descricao, providencia, data_fatal, dias, situacao, caso:caso_id(titulo), intimacao:intimacao_id(numero_formatado, orgao)')
      .in('situacao', ['sugerido', 'confirmado']),
    db.from('evento').select('id, tipo, titulo, descricao, inicio, fim, dia_inteiro, local, link_sala, origem, cliente:cliente_id(nome), caso:caso_id(titulo)')
      .not('situacao', 'in', '("concluida","cancelada")'),
    db.from('caso').select('id, titulo, prescricao_em, prescricao_obs').not('prescricao_em', 'is', null),
    db.from('google_link').select('*').eq('dono_id', conta_id),
  ]);

  const itens = montarItens(pz.data || [], ev.data || [], cs.data || []);
  const links = new Map((lk.data || []).map((l: any) => [l.qual + ':' + l.ref, l]));
  const vivos = new Set(itens.map(i => i.qual + ':' + i.ref));

  for (const it of itens) {
    const chave = it.qual + ':' + it.ref;
    const h = await resumo([it.titulo, it.dia, it.hora, it.local, it.detalhe].join('|'));
    const l: any = links.get(chave);
    try {
      if (!l) {
        const g = await chamar(tok, api(cal), 'POST', corpoEvento(it));
        if (g?.id) {
          await db.from('google_link').insert({ dono_id: conta_id, qual: it.qual, ref: it.ref, google_id: g.id, hash_local: h });
          nota.criados++;
        }
      } else if (l.hash_local !== h) {
        const g = await chamar(tok, api(cal, '/' + encodeURIComponent(l.google_id)), 'PATCH', corpoEvento(it));
        if (g?.ausente) {
          const novo = await chamar(tok, api(cal), 'POST', corpoEvento(it));
          if (novo?.id) await db.from('google_link').update({ google_id: novo.id, hash_local: h, atualizado_em: new Date().toISOString() }).eq('id', l.id);
        } else {
          await db.from('google_link').update({ hash_local: h, divergencia: null, atualizado_em: new Date().toISOString() }).eq('id', l.id);
        }
        nota.atualizados++;
      }
    } catch (e) { /* um item não pode derrubar a rodada inteira */ }
  }

  for (const l of (lk.data || [])) {
    if (vivos.has(l.qual + ':' + l.ref)) continue;
    try { await chamar(tok, api(cal, '/' + encodeURIComponent(l.google_id)), 'DELETE'); } catch { /* já não existia */ }
    await db.from('google_link').delete().eq('id', l.id);
    nota.apagados++;
  }

  const porGoogleId = new Map((lk.data || []).map((l: any) => [l.google_id, l]));
  let pagina: string | null = null, novoToken: string | null = null, guarda = 0;
  do {
    const q = new URLSearchParams({ singleEvents: 'true', maxResults: '250', showDeleted: 'true' });
    if (conta.sync_token && !pagina) q.set('syncToken', conta.sync_token);
    else if (!conta.sync_token && !pagina) q.set('timeMin', new Date(Date.now() - 30 * 864e5).toISOString());
    if (pagina) q.set('pageToken', pagina);

    const lista: any = await chamar(tok, api(cal, '', '?' + q.toString()));
    if (lista?.gone) {
      await db.from('google_conta').update({ sync_token: null }).eq('id', conta.id);
      break;
    }
    for (const g of (lista.items || [])) {
      const l: any = porGoogleId.get(g.id);
      const nosso = g.extendedProperties?.private?.sistema === 'breno';

      if (l) {
        const protegido = l.qual === 'prazo' || l.qual === 'prescricao' ||
          (l.qual === 'evento' && /audiencia|pericia/.test(String(g.summary || '').toLowerCase()));
        const diaLa = g.start?.date || SO_DATA(g.start?.dateTime);
        const item = itens.find(i => i.qual === l.qual && i.ref === l.ref);
        if (g.status === 'cancelled') {
          if (protegido) {
            await db.from('google_link').update({ divergencia: { o_que: 'apagado no Google', quando: new Date().toISOString() } }).eq('id', l.id);
            nota.divergencias++;
          } else {
            await db.from('evento').update({ situacao: 'cancelada' }).eq('id', l.ref);
            await db.from('google_link').delete().eq('id', l.id);
          }
          continue;
        }
        if (item && diaLa && diaLa !== item.dia) {
          if (protegido) {
            await db.from('google_link').update({ divergencia: { o_que: 'data mudada no Google', de: item.dia, para: diaLa, quando: new Date().toISOString() } }).eq('id', l.id);
            nota.divergencias++;
          } else if (l.qual === 'evento') {
            const hora = g.start?.dateTime ? String(g.start.dateTime).slice(11, 19) : '00:00:00';
            await db.from('evento').update({ inicio: `${diaLa}T${hora}` }).eq('id', l.ref);
          }
        }
        continue;
      }

      if (nosso || g.status === 'cancelled') continue;
      const dia = g.start?.date || SO_DATA(g.start?.dateTime);
      if (!dia) continue;
      const hora = g.start?.dateTime ? String(g.start.dateTime).slice(11, 19) : '00:00:00';
      const { data: novo } = await db.from('evento').insert({
        escritorio_id: conta.escritorio_id, tipo: 'reuniao', titulo: g.summary || '(sem título)',
        descricao: g.description || null, inicio: `${dia}T${hora}`,
        fim: g.end?.dateTime || null, dia_inteiro: !!g.start?.date,
        local: g.location || null, situacao: 'agendada', origem: 'google',
        google_event_id: g.id,
      }).select('id').maybeSingle();
      if (novo?.id) {
        await db.from('google_link').insert({ dono_id: conta_id, qual: 'evento', ref: novo.id, google_id: g.id, hash_local: null });
        nota.vindos++;
      }
    }
    pagina = lista.nextPageToken || null;
    novoToken = lista.nextSyncToken || novoToken;
  } while (pagina && ++guarda < 8);

  await db.from('google_conta').update({
    sync_token: novoToken || conta.sync_token, ultimo_sync: new Date().toISOString(), ultimo_erro: null,
  }).eq('id', conta.id);
  return nota;
}

/* ------------------------------------------------------------------- porta */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const CID = Deno.env.get('GOOGLE_CLIENT_ID'), CSEC = Deno.env.get('GOOGLE_CLIENT_SECRET');
  if (!CID || !CSEC) return json({ erro: 'Falta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nos Secrets.' }, 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const t = new URL(req.url).searchParams.get('t');
  let contas: any[] = [];
  if (t && t.length >= 16) {
    const { data: esc } = await db.from('escritorio').select('id').eq('agenda_token', t).maybeSingle();
    if (!esc) return json({ erro: 'token inválido' }, 403);
    contas = (await db.from('google_conta').select('*').eq('ativo', true).not('refresh_token', 'is', null)).data || [];
  } else {
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json({ erro: 'Faça login no sistema.' }, 401);
    contas = (await db.from('google_conta').select('*').eq('dono_id', u.user.id).not('refresh_token', 'is', null)).data || [];
    if (!contas.length) return json({ erro: 'Nenhuma conta do Google conectada. Conecte em Configurações.' }, 400);
  }

  const saida: any[] = [];
  for (const c of contas) {
    try { saida.push({ conta: c.email, ...(await sincronizar(db, c, CID, CSEC)) }); }
    catch (e) {
      await db.from('google_conta').update({ ultimo_erro: String((e as Error).message).slice(0, 400) }).eq('id', c.id);
      saida.push({ conta: c.email, erro: String((e as Error).message).slice(0, 400) });
    }
  }
  return json({ ok: true, contas: saida });
});
