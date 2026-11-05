-- 36_previdenciario.sql — módulo Previdenciário (RGPS), etapa 1: análise, CNIS e vínculos
--
-- Cada análise previdenciária pertence a um caso (e, por ele, a um cliente). O CNIS
-- é lido na própria tela (sem IA, sem custo) e vira três coisas:
--   prev_vinculo      — cada relação previdenciária: emprego, recolhimento, benefício;
--   prev_remuneracao  — o valor de cada competência dentro do vínculo;
--   prev_pendencia    — o que precisa ser resolvido para o período contar
--                       (indicadores do CNIS, lacunas, períodos sem prova).
-- O advogado pode incluir períodos que o CNIS não tem (CTPS, rural, especial) e
-- corrigir os que tem: o que veio do CNIS e o que foi mexido à mão ficam marcados.
--
-- Quem vê a análise é quem vê o caso: as regras abaixo perguntam ao próprio caso,
-- então um caso privado continua privado aqui.
--
-- O PDF do CNIS fica no bucket 'previdenciario', numa pasta com o id do escritório.

-- ------------------------------------------------------------ análise
create table if not exists public.prev_analise (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  caso_id         uuid not null references public.caso(id) on delete cascade,
  cliente_id      uuid references public.cliente(id) on delete set null,
  titulo          text,
  sexo            text check (sexo in ('F','M')),
  nascimento      date,
  nit             text,
  cpf             text,
  nome_mae        text,
  data_base       date not null default current_date,   -- data em que se analisa o direito (DER pretendida)
  situacao        text not null default 'aberta'
                  check (situacao in ('aberta','requerida','concedida','indeferida','judicial','arquivada')),
  obs             text,
  cnis_arquivo    text,          -- caminho no bucket 'previdenciario'
  cnis_emitido_em date,
  cnis_lido_em    timestamptz,
  cnis_legenda    jsonb not null default '{}'::jsonb,   -- legenda de indicadores do próprio extrato
  criado_por      uuid references public.usuario(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists prev_analise_caso_idx on public.prev_analise(caso_id);
create index if not exists prev_analise_esc_idx  on public.prev_analise(escritorio_id, atualizado_em desc);

-- ------------------------------------------------------------ vínculos
create table if not exists public.prev_vinculo (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.prev_analise(id) on delete cascade,
  seq             integer,                 -- número do vínculo no CNIS
  origem          text not null default 'cnis' check (origem in ('cnis','manual')),
  alterado        boolean not null default false,   -- veio do CNIS, mas foi corrigido à mão
  tipo            text not null default 'empregado'
                  check (tipo in ('empregado','domestico','avulso','individual','facultativo',
                                  'segurado_especial','beneficio','rpps','outro')),
  tipo_cnis       text,                    -- o texto como está no CNIS
  empregador_doc  text,                    -- CNPJ, CEI ou CPF
  empregador_nome text,
  inicio          date,
  fim             date,
  ultima_remun    date,
  indicadores     text[] not null default '{}',
  beneficio_nb    text,
  beneficio_especie text,
  especial        text check (especial in ('15','20','25')),   -- anos da aposentadoria especial do agente
  pcd             text check (pcd in ('leve','moderada','grave')),
  rural           boolean not null default false,
  considerar      boolean not null default true,
  prova           text,                    -- o que sustenta o período (CTPS, PPP, sentença…)
  obs             text,
  criado_em       timestamptz not null default now()
);
create index if not exists prev_vinculo_analise_idx on public.prev_vinculo(analise_id, inicio);

-- ------------------------------------------------------------ remunerações
create table if not exists public.prev_remuneracao (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.prev_analise(id) on delete cascade,
  vinculo_id      uuid not null references public.prev_vinculo(id) on delete cascade,
  competencia     date not null,           -- sempre o dia 1º do mês
  valor           numeric(14,2),           -- remuneração ou salário de contribuição
  contribuicao    numeric(14,2),           -- valor recolhido (contribuinte individual/facultativo)
  pagamento       date,                    -- data do pagamento da guia
  indicadores     text[] not null default '{}',
  origem          text not null default 'cnis' check (origem in ('cnis','manual')),
  considerar      boolean not null default true
);
create index if not exists prev_remun_vinc_idx on public.prev_remuneracao(vinculo_id, competencia);
create index if not exists prev_remun_analise_idx on public.prev_remuneracao(analise_id, competencia);

-- ------------------------------------------------------------ pendências
create table if not exists public.prev_pendencia (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.prev_analise(id) on delete cascade,
  vinculo_id      uuid references public.prev_vinculo(id) on delete cascade,
  codigo          text not null,           -- indicador do CNIS (PEXT…) ou regra do sistema (LACUNA…)
  descricao       text not null,
  providencia     text,
  competencias    text,                    -- resumo dos meses atingidos, quando for o caso
  origem          text not null default 'cnis' check (origem in ('cnis','sistema','manual')),
  resolvida       boolean not null default false,
  resolucao       text,
  criado_em       timestamptz not null default now()
);
create index if not exists prev_pend_analise_idx on public.prev_pendencia(analise_id);

-- ------------------------------------------------------------ regras de acesso
alter table public.prev_analise     enable row level security;
alter table public.prev_vinculo     enable row level security;
alter table public.prev_remuneracao enable row level security;
alter table public.prev_pendencia   enable row level security;

-- A análise segue o caso: se a pessoa não enxerga o caso, não enxerga a análise.
drop policy if exists prev_analise_membro on public.prev_analise;
create policy prev_analise_membro on public.prev_analise for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.caso c where c.id = prev_analise.caso_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.caso c where c.id = prev_analise.caso_id));

-- O que pende da análise segue a análise.
drop policy if exists prev_vinculo_membro on public.prev_vinculo;
create policy prev_vinculo_membro on public.prev_vinculo for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_vinculo.analise_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_vinculo.analise_id));

drop policy if exists prev_remun_membro on public.prev_remuneracao;
create policy prev_remun_membro on public.prev_remuneracao for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_remuneracao.analise_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_remuneracao.analise_id));

drop policy if exists prev_pend_membro on public.prev_pendencia;
create policy prev_pend_membro on public.prev_pendencia for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_pendencia.analise_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_pendencia.analise_id));

-- Histórico de quem mexeu na análise (mesmo gatilho das demais tabelas).
drop trigger if exists aud_prev_analise on public.prev_analise;
create trigger aud_prev_analise after insert or delete or update on public.prev_analise
  for each row execute function anotar();

-- ------------------------------------------------------------ arquivos (CNIS e anexos)
insert into storage.buckets (id, name, public)
values ('previdenciario', 'previdenciario', false)
on conflict (id) do nothing;

drop policy if exists prev_arq_ler on storage.objects;
create policy prev_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'previdenciario' and (storage.foldername(name))[1] = meu_escritorio()::text);

drop policy if exists prev_arq_gravar on storage.objects;
create policy prev_arq_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'previdenciario' and (storage.foldername(name))[1] = meu_escritorio()::text);

drop policy if exists prev_arq_trocar on storage.objects;
create policy prev_arq_trocar on storage.objects for update to authenticated
  using (bucket_id = 'previdenciario' and (storage.foldername(name))[1] = meu_escritorio()::text);

drop policy if exists prev_arq_apagar on storage.objects;
create policy prev_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'previdenciario' and (storage.foldername(name))[1] = meu_escritorio()::text);
