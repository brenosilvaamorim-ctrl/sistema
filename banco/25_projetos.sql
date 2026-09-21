-- 25_projetos.sql — Ideias e projetos do escritório
-- Uma ideia percorre: ideia → em análise → aprovada → em execução → concluída,
-- ou é descartada (com o motivo, para a mesma discussão não voltar do zero).
-- As tarefas de um projeto são eventos comuns (tipo 'tarefa') com projeto_id:
-- assim entram na Agenda, vão para o Google e recebem baixa como qualquer outra.

create table if not exists public.projeto (
  id               uuid primary key default gen_random_uuid(),
  escritorio_id    uuid not null references public.escritorio(id) on delete cascade,
  titulo           text not null,
  descricao        text,
  fase             text not null default 'ideia'
                   check (fase in ('ideia','analise','aprovada','execucao','concluida','descartada')),
  responsavel_id   uuid references public.usuario(id) on delete set null,
  prazo_final      date,
  custo            numeric(12,2),
  retorno_valor    numeric(12,2),
  retorno_obs      text,
  motivo_descarte  text,
  ordem            integer,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  concluido_em     timestamptz
);
create index if not exists projeto_esc_fase_idx on public.projeto(escritorio_id, fase);

create table if not exists public.projeto_nota (
  id             uuid primary key default gen_random_uuid(),
  escritorio_id  uuid not null references public.escritorio(id) on delete cascade,
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  texto          text not null,
  automatica     boolean not null default false,
  autor          uuid default auth.uid(),
  criado_em      timestamptz not null default now()
);
create index if not exists projeto_nota_proj_idx on public.projeto_nota(projeto_id, criado_em);

alter table public.evento
  add column if not exists projeto_id uuid references public.projeto(id) on delete set null;
create index if not exists evento_projeto_idx on public.evento(projeto_id) where projeto_id is not null;

alter table public.projeto      enable row level security;
alter table public.projeto_nota enable row level security;

drop policy if exists projeto_escritorio on public.projeto;
create policy projeto_escritorio on public.projeto
  for all using (escritorio_id = meu_escritorio()) with check (escritorio_id = meu_escritorio());

drop policy if exists projeto_nota_escritorio on public.projeto_nota;
create policy projeto_nota_escritorio on public.projeto_nota
  for all using (escritorio_id = meu_escritorio()) with check (escritorio_id = meu_escritorio());
