-- 30_notas_fiscais.sql — emissão de NFS-e pelo Emissor Nacional (Sefin Nacional)
--
-- O escritório é ME/EPP do Simples Nacional em Petrolina/PE. Desde 1º/11/2026
-- (Res. CGSN 191/2026), o Simples emite NFS-e pelo Emissor Nacional, e o sistema passa
-- a fazer isso direto pela API do governo, assinando com o certificado A1.
--
-- Três peças:
--   nfse_config  — os dados fixos do prestador e a numeração das DPS
--                  (uma linha por escritório);
--   nota_fiscal  — cada nota pedida, com o retrato do que foi enviado e do
--                  que voltou (XML da DPS e da NFS-e), para nunca depender de
--                  consultar o governo para saber o que foi emitido;
--   parceiro     — ganha CNPJ e razão social, que entram na descrição da nota
--                  quando parte do honorário foi repassada (art. 15, § 9º, EAOAB).
--
-- Só a função nota-fiscal (com a chave de serviço) grava notas. A tela apenas
-- lê, e só quem vê o financeiro enxerga as notas.

-- ------------------------------------------------------------ configuração
create table if not exists public.nfse_config (
  escritorio_id   uuid primary key references public.escritorio(id) on delete cascade,
  cnpj            text not null,                 -- só dígitos
  razao_social    text not null,
  inscricao_municipal text,                      -- só se cadastrado no CNC nacional (senão a DPS é rejeitada)
  cod_municipio   text not null default '2611101', -- Petrolina/PE (IBGE)
  ambiente        smallint not null default 2      -- 1 produção, 2 produção restrita (teste)
                  check (ambiente in (1,2)),
  serie           text not null default '1'        -- 00001 a 49999 = aplicativo próprio
                  check (serie ~ '^[0-9]{1,5}$' and serie::int between 1 and 49999),
  proximo_dps_producao bigint not null default 1,
  proximo_dps_teste    bigint not null default 1,
  cod_trib_nac    text not null default '171401'   -- 17.14.01 — advocacia
                  check (cod_trib_nac ~ '^[0-9]{6}$'),
  cod_nbs         text default '113012000'        -- NBS 2.0: representação e consultoria jurídica, outras áreas
                  check (cod_nbs is null or cod_nbs ~ '^[0-9]{9}$'),
  reg_ap_trib_sn  smallint not null default 1 check (reg_ap_trib_sn in (1,2,3)),
  p_tot_trib_sn   numeric(5,2) not null default 4.50,  -- % aproximado do DAS (Lei 12.741/2012)
  aliquota_iss_sn numeric(5,2),                         -- só usada quando o tomador retém o ISS
  descricao_padrao text not null default 'Honorários advocatícios.',
  atualizado_em   timestamptz not null default now()
);

alter table public.nfse_config enable row level security;

drop policy if exists nfse_cfg_ler on public.nfse_config;
create policy nfse_cfg_ler on public.nfse_config for select
  using (escritorio_id = meu_escritorio() and vejo_financeiro());

drop policy if exists nfse_cfg_titular on public.nfse_config;
create policy nfse_cfg_titular on public.nfse_config for update
  using (escritorio_id = meu_escritorio() and meu_perfil() = 'titular')
  with check (escritorio_id = meu_escritorio() and meu_perfil() = 'titular');

drop policy if exists nfse_cfg_criar on public.nfse_config;
create policy nfse_cfg_criar on public.nfse_config for insert
  with check (escritorio_id = meu_escritorio() and meu_perfil() = 'titular');

-- A numeração não pode ser mexida pela tela: só a função avança o contador.
-- (No Postgres, tirar a permissão de uma coluna não vale se a tabela inteira
-- está liberada; por isso tira-se da tabela e devolve-se coluna por coluna.)
revoke update on public.nfse_config from authenticated, anon;
grant update (cnpj, razao_social, inscricao_municipal, cod_municipio, ambiente, serie,
              cod_trib_nac, cod_nbs, reg_ap_trib_sn, p_tot_trib_sn, aliquota_iss_sn,
              descricao_padrao, atualizado_em)
  on public.nfse_config to authenticated;

-- ------------------------------------------------------------ notas
create table if not exists public.nota_fiscal (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  lancamento_id   uuid references public.lancamento(id) on delete set null,
  cliente_id      uuid references public.cliente(id) on delete set null,
  caso_id         uuid references public.caso(id) on delete set null,
  parceiro_id     uuid references public.parceiro(id) on delete set null,

  ambiente        smallint not null check (ambiente in (1,2)),
  serie           text not null,
  numero_dps      bigint not null,
  id_dps          text not null,
  competencia     date not null,

  valor_servico   numeric(14,2) not null check (valor_servico > 0),
  valor_total_recebido numeric(14,2),     -- com parceria: o que entrou ao todo
  valor_parceria  numeric(14,2),          -- com parceria: o que foi repassado
  iss_retido      boolean not null default false,
  descricao       text not null,
  tomador         jsonb not null,          -- retrato do tomador no momento da emissão

  situacao        text not null default 'enviando'
                  check (situacao in ('enviando','emitida','rejeitada','cancelada')),
  chave_acesso    text unique,
  numero_nfse     text,
  emitida_em      timestamptz,
  erros           jsonb,
  xml_dps         text,
  xml_nfse        text,
  cancelada_em    timestamptz,
  motivo_cancelamento text,

  criado_por      uuid references public.usuario(id) on delete set null,
  criado_em       timestamptz not null default now(),
  unique (escritorio_id, ambiente, serie, numero_dps)
);

create index if not exists nota_fiscal_comp_idx on public.nota_fiscal(escritorio_id, competencia desc);
create index if not exists nota_fiscal_lanc_idx on public.nota_fiscal(lancamento_id);

alter table public.nota_fiscal enable row level security;

drop policy if exists nf_ler on public.nota_fiscal;
create policy nf_ler on public.nota_fiscal for select
  using (escritorio_id = meu_escritorio() and vejo_financeiro());
-- Sem política de insert/update/delete: só a função (chave de serviço) grava.

drop trigger if exists aud_nota_fiscal on public.nota_fiscal;
create trigger aud_nota_fiscal after insert or delete or update on public.nota_fiscal
  for each row execute function anotar();

-- ------------------------------------------------------------ numeração
-- Reserva o próximo número de DPS de forma atômica (duas emissões ao mesmo
-- tempo nunca pegam o mesmo número). Só a chave de serviço pode chamar.
create or replace function public.nfse_reservar_numero(p_escritorio uuid, p_ambiente smallint)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $$
declare n bigint;
begin
  if p_ambiente = 1 then
    update nfse_config set proximo_dps_producao = proximo_dps_producao + 1
      where escritorio_id = p_escritorio returning proximo_dps_producao - 1 into n;
  else
    update nfse_config set proximo_dps_teste = proximo_dps_teste + 1
      where escritorio_id = p_escritorio returning proximo_dps_teste - 1 into n;
  end if;
  if n is null then raise exception 'nfse_config não encontrada para o escritório'; end if;
  return n;
end $$;

revoke all on function public.nfse_reservar_numero(uuid, smallint) from public, anon, authenticated;
grant execute on function public.nfse_reservar_numero(uuid, smallint) to service_role;

-- ------------------------------------------------------------ parceiro
alter table public.parceiro
  add column if not exists cnpj         text,
  add column if not exists razao_social text;

comment on column public.parceiro.razao_social is
  'Nome do escritório parceiro como consta no CNPJ — vai, em maiúsculas, na descrição da nota com parceria.';

-- ------------------------------------------------------------ dados iniciais
insert into public.nfse_config (escritorio_id, cnpj, razao_social)
select id, '60837337000180', 'BRENO S. AMORIM SOCIEDADE INDIVIDUAL DE ADVOCACIA'
  from public.escritorio order by criado_em limit 1
on conflict (escritorio_id) do nothing;
