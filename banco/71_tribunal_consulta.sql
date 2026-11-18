-- 71_tribunal_consulta.sql — lembrete de consultar os sistemas dos tribunais
--
-- O DataJud e o DJEN trazem quase tudo, mas não tudo: despacho sem publicação, expediente
-- aberto só no painel do PJe, prazo de ciência que corre no sistema e não no diário. A regra
-- do escritório é entrar no sistema de cada tribunal onde temos processo ativo a cada quinze
-- dias. Esta tabela guarda quando foi a última entrada, de quanto em quanto tempo ela deve
-- se repetir e o endereço do sistema, para o botão abrir direto.
--
-- Os tribunais com processo em curso aparecem sozinhos no Início (vêm de processo.tribunal_sigla);
-- a linha aqui só nasce quando alguém marca a primeira consulta. Os incluídos à mão
-- (manual = true) aparecem mesmo sem processo cadastrado — TRF5 de um caso ainda no
-- administrativo, sistema de juizado que o DataJud não cobre, etc.

create table if not exists public.tribunal_consulta (
  escritorio_id    uuid not null references public.escritorio(id) on delete cascade,
  sigla            text not null,
  manual           boolean not null default false,
  ultima_consulta  date,
  intervalo_dias   integer not null default 15 check (intervalo_dias between 1 and 180),
  link             text,
  atualizado_em    timestamptz not null default now(),
  primary key (escritorio_id, sigla)
);

alter table public.tribunal_consulta enable row level security;
drop policy if exists tribunal_consulta_membro on public.tribunal_consulta;
create policy tribunal_consulta_membro on public.tribunal_consulta for all
  using (escritorio_id = meu_escritorio())
  with check (escritorio_id = meu_escritorio());
