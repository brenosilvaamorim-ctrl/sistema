-- 26_familia.sql — a área da família (fora do sistema do escritório)
--
-- O "Meu financeiro" era privado por construção: cada linha pertencia a uma
-- pessoa (dono_id = auth.uid()). Controlar as contas a dois exige o contrário:
-- as linhas passam a pertencer a uma FAMÍLIA, e quem é da família enxerga tudo.
-- dono_id continua existindo, mas muda de papel: deixa de ser a tranca e passa
-- a ser a assinatura de quem lançou.
--
-- O convite é por e-mail e vale antes de a pessoa existir: minha_familia()
-- reconhece tanto quem já entrou uma vez (usuario_auth) quanto quem só foi
-- convidado (e-mail do login). Assim a esposa entra pelo link mágico e já vê
-- tudo, sem nenhum passo de administração no meio.
--
-- Nada disso dá acesso ao escritório: a entrada de lá depende de uma linha em
-- usuario, que só existe para quem o escritório criou.

create table if not exists public.familia (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null default 'Nossa casa',
  criado_em  timestamptz not null default now()
);

create table if not exists public.familia_membro (
  id            uuid primary key default gen_random_uuid(),
  familia_id    uuid not null references public.familia(id) on delete cascade,
  email         text not null,
  nome          text,
  papel         text not null default 'membro' check (papel in ('titular','membro')),
  usuario_auth  uuid,
  criado_em     timestamptz not null default now()
);
create unique index if not exists familia_membro_email_idx
  on public.familia_membro (familia_id, lower(email));

create or replace function public.minha_familia() returns uuid
language sql stable security definer set search_path = public as $$
  select m.familia_id
    from public.familia_membro m
   where m.usuario_auth = auth.uid()
      or lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   order by (m.usuario_auth = auth.uid()) desc nulls last
   limit 1
$$;

/* Chamada no primeiro acesso: gruda o login da pessoa no convite dela. */
create or replace function public.entrar_na_familia() returns uuid
language plpgsql security definer set search_path = public as $$
declare f uuid;
begin
  update public.familia_membro set usuario_auth = auth.uid()
   where usuario_auth is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   returning familia_id into f;
  return coalesce(f, public.minha_familia());
end $$;
grant execute on function public.entrar_na_familia() to authenticated;

-- ---------------------------------------------------------------- a família
do $$
declare fam uuid; uid uuid;
begin
  select id into fam from public.familia order by criado_em limit 1;
  if fam is null then
    insert into public.familia (nome) values ('Família Amorim') returning id into fam;
  end if;
  select id into uid from public.usuario where lower(email) = 'brenos.amorim.adv@gmail.com' limit 1;
  insert into public.familia_membro (familia_id, email, nome, papel, usuario_auth)
  values (fam, 'brenos.amorim.adv@gmail.com', 'Breno', 'titular', uid)
  on conflict do nothing;
end $$;

do $$
declare
  fam uuid;
  t   text;
  p   record;
  tabelas text[] := array['pessoal_categoria','pessoal_conta','pessoal_extrato',
    'pessoal_fin_parcela','pessoal_financiamento','pessoal_lancamento',
    'pessoal_meta','pessoal_projeto','pessoal_recorrente'];
begin
  select id into fam from public.familia order by criado_em limit 1;
  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists familia_id uuid references public.familia(id) on delete cascade', t);
    execute format('update public.%I set familia_id = %L where familia_id is null', t, fam);
    execute format('alter table public.%I alter column dono_id drop not null', t);
    execute format('create index if not exists %I on public.%I (familia_id)', t || '_fam_idx', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I for all to authenticated
      using (familia_id = public.minha_familia())
      with check (familia_id = public.minha_familia())$f$, t || '_familia', t);
  end loop;
end $$;

alter table public.familia        enable row level security;
alter table public.familia_membro enable row level security;

drop policy if exists familia_minha on public.familia;
create policy familia_minha on public.familia for all to authenticated
  using (id = public.minha_familia()) with check (id = public.minha_familia());

drop policy if exists familia_membro_minha on public.familia_membro;
create policy familia_membro_minha on public.familia_membro for all to authenticated
  using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());

-- ------------------------------------------------------- a casa: reforma e mobília
create table if not exists public.casa_ambiente (
  id          uuid primary key default gen_random_uuid(),
  familia_id  uuid not null references public.familia(id) on delete cascade,
  nome        text not null,
  situacao    text not null default 'a_fazer' check (situacao in ('a_fazer','andamento','pronto')),
  ordem       integer not null default 0,
  obs         text,
  criado_em   timestamptz not null default now()
);

create table if not exists public.casa_item (
  id               uuid primary key default gen_random_uuid(),
  familia_id       uuid not null references public.familia(id) on delete cascade,
  ambiente_id      uuid references public.casa_ambiente(id) on delete set null,
  tipo             text not null default 'servico' check (tipo in ('servico','movel','material','eletro','outro')),
  nome             text not null,
  descricao        text,
  situacao         text not null default 'a_orcar'
                   check (situacao in ('a_orcar','orcado','contratado','comprado','entregue','pronto','cancelado')),
  valor_previsto   numeric(14,2),
  fornecedor       text,
  comprar_ate      date,
  entrega_prevista date,
  entregue_em      date,
  obs              text,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
create index if not exists casa_item_amb_idx on public.casa_item (ambiente_id);

create table if not exists public.casa_orcamento (
  id             uuid primary key default gen_random_uuid(),
  familia_id     uuid not null references public.familia(id) on delete cascade,
  item_id        uuid not null references public.casa_item(id) on delete cascade,
  fornecedor     text not null,
  valor          numeric(14,2) not null,
  prazo_dias     integer,
  validade       date,
  condicoes      text,
  arquivo_path   text,
  arquivo_nome   text,
  escolhido      boolean not null default false,
  obs            text,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now()
);
create index if not exists casa_orcamento_item_idx on public.casa_orcamento (item_id);

alter table public.pessoal_lancamento
  add column if not exists casa_item_id uuid references public.casa_item(id) on delete set null;
create index if not exists pessoal_lancamento_casa_idx
  on public.pessoal_lancamento (casa_item_id) where casa_item_id is not null;

alter table public.casa_ambiente  enable row level security;
alter table public.casa_item      enable row level security;
alter table public.casa_orcamento enable row level security;

drop policy if exists casa_ambiente_familia on public.casa_ambiente;
create policy casa_ambiente_familia on public.casa_ambiente for all to authenticated
  using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());

drop policy if exists casa_item_familia on public.casa_item;
create policy casa_item_familia on public.casa_item for all to authenticated
  using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());

drop policy if exists casa_orcamento_familia on public.casa_orcamento;
create policy casa_orcamento_familia on public.casa_orcamento for all to authenticated
  using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());

-- --------------------------------------------------------------- arquivos
insert into storage.buckets (id, name, public) values ('casa','casa',false)
  on conflict (id) do nothing;

drop policy if exists casa_arq_ler on storage.objects;
create policy casa_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'casa' and (storage.foldername(name))[1] = public.minha_familia()::text);
drop policy if exists casa_arq_gravar on storage.objects;
create policy casa_arq_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'casa' and (storage.foldername(name))[1] = public.minha_familia()::text);
drop policy if exists casa_arq_trocar on storage.objects;
create policy casa_arq_trocar on storage.objects for update to authenticated
  using (bucket_id = 'casa' and (storage.foldername(name))[1] = public.minha_familia()::text);
drop policy if exists casa_arq_apagar on storage.objects;
create policy casa_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'casa' and (storage.foldername(name))[1] = public.minha_familia()::text);

/* Os extratos passam a morar numa pasta da família; os antigos, na pasta de
   quem subiu, continuam onde estão e legíveis pelas regras que já existiam. */
drop policy if exists financeiro_fam_ler on storage.objects;
create policy financeiro_fam_ler on storage.objects for select to authenticated
  using (bucket_id = 'financeiro' and (storage.foldername(name))[1] = public.minha_familia()::text);
drop policy if exists financeiro_fam_gravar on storage.objects;
create policy financeiro_fam_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'financeiro' and (storage.foldername(name))[1] = public.minha_familia()::text);
drop policy if exists financeiro_fam_apagar on storage.objects;
create policy financeiro_fam_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'financeiro' and (storage.foldername(name))[1] = public.minha_familia()::text);
