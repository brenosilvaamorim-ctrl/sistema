// AGENDA EM FORMATO .ICS — para o Google Agenda assinar por link.
// Público de propósito: o Google não envia cabeçalho de login. Quem protege é o token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CAB = {
  'content-type': 'text/calendar; charset=utf-8',
  'cache-control': 'public, max-age=900',
  'Access-Control-Allow-Origin': '*',
};

const lim = (t: unknown) => String(t ?? '').replace(/([,;\\])/g, '\\$1').replace(/\r?\n/g, '\\n');
const dt = (iso: string) => String(iso).replace(/[-:]/g, '').slice(0, 15);

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (token.length < 16) return new Response('token ausente', { status: 401 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: esc } = await db.from('escritorio')
    .select('id, nome').eq('agenda_token', token).maybeSingle();
  if (!esc) return new Response('token inválido', { status: 403 });

  const [pz, ev, cs] = await Promise.all([
    db.from('prazo').select('id, descricao, data_fatal, dias, situacao, urgencia, caso:caso_id(titulo), intimacao:intimacao_id(numero_formatado, orgao)')
      .eq('escritorio_id', esc.id).in('situacao', ['sugerido', 'confirmado']),
    db.from('evento').select('id, tipo, titulo, inicio, fim, local, descricao, urgencia, cliente:cliente_id(nome), caso:caso_id(titulo)')
      .eq('escritorio_id', esc.id).not('situacao', 'in', '("concluida","cancelada")'),
    db.from('caso').select('id, titulo, prescricao_em, prescricao_obs')
      .eq('escritorio_id', esc.id).not('prescricao_em', 'is', null),
  ]);

  const carimbo = dt(new Date().toISOString()) + 'Z';
  const L: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Escritorio//Agenda//PT-BR',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + lim(esc.nome || 'Escritório'),
    'X-WR-TIMEZONE:America/Sao_Paulo'];

  const diaTodo = (uid: string, data: string, titulo: string, desc: string, local: string, alarme: string) => {
    const d = String(data).slice(0, 10).replace(/-/g, '');
    const dep = String(new Date(Date.parse(String(data).slice(0, 10) + 'T00:00:00Z') + 864e5)
      .toISOString().slice(0, 10)).replace(/-/g, '');
    L.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + carimbo,
      'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + dep,
      'SUMMARY:' + lim(titulo), 'DESCRIPTION:' + lim(desc),
      ...(local ? ['LOCATION:' + lim(local)] : []),
      'BEGIN:VALARM', 'TRIGGER:' + alarme, 'ACTION:DISPLAY', 'DESCRIPTION:' + lim(titulo),
      'END:VALARM', 'END:VEVENT');
  };

  for (const p of (pz.data ?? []) as any[]) {
    if (!p.data_fatal) continue;
    diaTodo('prazo-' + p.id + '@escritorio', p.data_fatal,
      'PRAZO: ' + p.descricao + (p.caso?.titulo ? ' — ' + p.caso.titulo : ''),
      [p.dias ? p.dias + ' dias' : '', 'situação: ' + p.situacao,
       p.urgencia ? 'urgência: ' + p.urgencia : '',
       p.intimacao?.numero_formatado ?? ''].filter(Boolean).join(' · '),
      p.intimacao?.orgao ?? '', '-P2D');
  }

  for (const e of (ev.data ?? []) as any[]) {
    const ini = String(e.inicio);
    const d = ini.slice(0, 10).replace(/-/g, ''), h = ini.slice(11, 16).replace(':', '');
    const hf = String(Number(ini.slice(11, 13)) + 1).padStart(2, '0') + ini.slice(14, 16);
    const nome = (e.tipo === 'audiencia' ? 'AUDIÊNCIA' : e.tipo.toUpperCase()) + ': ' + e.titulo +
      (e.cliente?.nome ? ' — ' + e.cliente.nome : (e.caso?.titulo ? ' — ' + e.caso.titulo : ''));
    L.push('BEGIN:VEVENT', 'UID:evento-' + e.id + '@escritorio', 'DTSTAMP:' + carimbo,
      'DTSTART;TZID=America/Sao_Paulo:' + d + 'T' + h + '00',
      'DTEND;TZID=America/Sao_Paulo:' + (e.fim ? String(e.fim).slice(0,10).replace(/-/g,'') + 'T' + String(e.fim).slice(11,16).replace(':','') + '00' : d + 'T' + hf + '00'),
      'SUMMARY:' + lim(nome),
      'DESCRIPTION:' + lim([e.descricao, e.urgencia && e.urgencia !== 'normal' ? 'urgência: ' + e.urgencia : ''].filter(Boolean).join('\n')),
      ...(e.local ? ['LOCATION:' + lim(e.local)] : []),
      'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:' + lim(nome),
      'END:VALARM', 'END:VEVENT');
  }

  for (const c of (cs.data ?? []) as any[]) {
    diaTodo('presc-' + c.id + '@escritorio', c.prescricao_em, 'PRESCRIÇÃO — ' + c.titulo,
      c.prescricao_obs ?? 'Prazo prescricional anotado no cadastro.', '', '-P30D');
  }

  L.push('END:VCALENDAR');
  return new Response(L.join('\r\n'), { headers: CAB });
});
