// Migração 08 — agenda editável, urgência e preferências.
import postgres from 'npm:postgres@3.4.4';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PASSOS: [string, string][] = [
  ['evento.urgencia', "alter table evento add column if not exists urgencia text not null default 'normal'"],
  ['evento.cliente_id', 'alter table evento add column if not exists cliente_id uuid references cliente(id) on delete set null'],
  ['evento.concluido_em', 'alter table evento add column if not exists concluido_em timestamptz'],
  ['evento.lembrete_min', 'alter table evento add column if not exists lembrete_min int'],
  ['prazo.urgencia', 'alter table prazo add column if not exists urgencia text'],
  ['evento.ck0', 'alter table evento drop constraint if exists evento_urgencia_ck'],
  ['evento.ck1', "alter table evento add constraint evento_urgencia_ck check (urgencia in ('baixa','normal','alta','critica'))"],
  ['ix.inicio', 'create index if not exists evento_inicio_ix on evento (escritorio_id, inicio)'],
  ['ix.cliente', 'create index if not exists evento_cliente_ix on evento (cliente_id)'],
  ['preferencia', 'create table if not exists preferencia (id uuid primary key default uuid_generate_v4(), escritorio_id uuid not null references escritorio(id) on delete cascade, chave text not null, valor jsonb not null, atualizado_em timestamptz not null default now(), unique (escritorio_id, chave))'],
  ['preferencia.rls', 'alter table preferencia enable row level security'],
  ['preferencia.pol0', 'drop policy if exists pref_membro on preferencia'],
  ['preferencia.pol', 'create policy pref_membro on preferencia for all using (escritorio_id = meu_escritorio()) with check (escritorio_id = meu_escritorio())'],
  ['escritorio.token', 'alter table escritorio add column if not exists agenda_token text'],
  ['escritorio.token2', "update escritorio set agenda_token = md5(random()::text || clock_timestamp()::text) where agenda_token is null"],
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_DB_URL');
  if (!url) return new Response(JSON.stringify({ erro: 'SUPABASE_DB_URL ausente' }),
    { status: 500, headers: { ...CORS, 'content-type': 'application/json' } });
  const sql = postgres(url, { prepare: false });
  const feito: string[] = [];
  const falhou: Record<string, string> = {};
  for (const [nome, ddl] of PASSOS) {
    try { await sql.unsafe(ddl); feito.push(nome); }
    catch (e) { falhou[nome] = String((e as any)?.message ?? e); }
  }
  let token = null;
  try { const r = await sql.unsafe('select agenda_token from escritorio limit 1'); token = r[0]?.agenda_token; } catch { /* ignore */ }
  await sql.end();
  return new Response(JSON.stringify({ feito, falhou, agenda_token: token }, null, 2),
    { headers: { ...CORS, 'content-type': 'application/json' } });
});
