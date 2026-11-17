-- 69_bancario_leitura.sql — módulo Bancário, etapa 2: o que se leu dos documentos
--
-- A etapa 1 (68_bancario.sql) guarda e confere os arquivos. Esta guarda o que foi LIDO deles,
-- já conferido pelo advogado na tela:
--   banc_contrato   — cada contrato do Extrato de Empréstimos do INSS (ou de contrato avulso),
--                     com a coluna da entrevista (nega / não lembra / enganado / reconhece);
--   banc_desconto   — cada desconto do Histórico de Créditos (HISCRE), mês a mês, com o banco
--                     onde o benefício foi pago naquela competência (decide se o INSS entra);
--   banc_lancamento — cada linha suspeita do extrato bancário (tarifa, cesta, seguro, título).
-- É daqui que a tela tira o mapa dos contratos, os prazos (5 anos do último desconto) e as
-- faixas de restituição simples e em dobro (marco de 30/03/2021). A leitura é da IA (função
-- ler-bancario e, para extrato de conta, ler-extrato); nada vira linha sem o advogado gravar.

create table if not exists public.banc_contrato (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.banc_analise(id) on delete cascade,
  documento_id    uuid references public.banc_documento(id) on delete set null,
  numero          text not null,
  banco           text,
  produto         text not null default 'consignado'
                  check (produto in ('consignado','rmc','rcc','pessoal','veiculo','outro')),
  situacao        text,                      -- ativo, excluído, suspenso, encerrado (como o extrato diz)
  averbacao       date,
  inicio_desconto date,
  fim_desconto    date,
  valor_emprestado numeric(14,2),
  parcela         numeric(14,2),
  qtd_parcelas    int,
  limite_cartao   numeric(14,2),
  reservado       numeric(14,2),
  taxa_mensal     numeric(8,4),
  origem          text,                      -- contrato de origem (refinanciamento, portabilidade)
  entrevista      text not null default 'a_perguntar'
                  check (entrevista in ('a_perguntar','nega','nao_lembra','enganado','reconhece')),
  obs             text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create unique index if not exists banc_contrato_uidx on public.banc_contrato(analise_id, numero, produto);

create table if not exists public.banc_desconto (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.banc_analise(id) on delete cascade,
  documento_id    uuid references public.banc_documento(id) on delete cascade,
  competencia     date not null,             -- primeiro dia do mês
  rubrica         text not null,
  valor           numeric(14,2) not null,
  contrato        text,
  credor          text,
  banco_pagador   text                       -- onde o benefício caiu naquela competência
);
create index if not exists banc_desconto_idx on public.banc_desconto(analise_id, competencia);

create table if not exists public.banc_lancamento (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.banc_analise(id) on delete cascade,
  documento_id    uuid references public.banc_documento(id) on delete cascade,
  data            date not null,
  descricao       text not null,
  valor           numeric(14,2) not null,
  categoria       text not null default 'outro'
                  check (categoria in ('tarifa','cesta','seguro','capitalizacao','emprestimo','anuidade','juros_mora','outro')),
  banco           text,
  conta           text
);
create index if not exists banc_lancamento_idx on public.banc_lancamento(analise_id, data);

do $$ declare t text; begin
  foreach t in array array['banc_contrato','banc_desconto','banc_lancamento'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_membro', t);
    execute format('create policy %I on public.%I for all
      using (escritorio_id = meu_escritorio() and exists (select 1 from public.banc_analise a where a.id = %I.analise_id))
      with check (escritorio_id = meu_escritorio() and exists (select 1 from public.banc_analise a where a.id = %I.analise_id))',
      t || '_membro', t, t, t);
  end loop;
end $$;
