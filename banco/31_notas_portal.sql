-- 31_notas_portal.sql — notas emitidas à mão no portal do Emissor Nacional
--
-- Enquanto o escritório não tem o e-CNPJ A1, a nota é emitida no portal
-- (nfse.gov.br/EmissorNacional) com os dados que o sistema prepara, e depois
-- registrada aqui: número, chave e, se houver, o XML baixado do portal. Assim
-- ela aparece na lista e conta no faturamento do mês como as outras.
--
-- Nota do portal não tem DPS gerada pelo sistema, então série, número e
-- identificador da DPS passam a ser opcionais — mas continuam obrigatórios
-- para as notas emitidas pela API.

alter table public.nota_fiscal
  add column if not exists origem text not null default 'api';

alter table public.nota_fiscal drop constraint if exists nota_fiscal_origem_ck;
alter table public.nota_fiscal add constraint nota_fiscal_origem_ck
  check (origem in ('api','portal'));

alter table public.nota_fiscal
  alter column serie      drop not null,
  alter column numero_dps drop not null,
  alter column id_dps     drop not null;

alter table public.nota_fiscal drop constraint if exists nota_fiscal_dps_api_ck;
alter table public.nota_fiscal add constraint nota_fiscal_dps_api_ck
  check (origem = 'portal' or (serie is not null and numero_dps is not null and id_dps is not null));

-- O mesmo número de NFS-e não pode ser registrado duas vezes.
create unique index if not exists nota_fiscal_numero_uk
  on public.nota_fiscal(escritorio_id, ambiente, numero_nfse)
  where numero_nfse is not null;

-- Quem vê o financeiro registra nota do portal (só já emitida, e em seu nome).
drop policy if exists nf_portal_registrar on public.nota_fiscal;
create policy nf_portal_registrar on public.nota_fiscal for insert
  with check (escritorio_id = meu_escritorio() and vejo_financeiro()
              and origem = 'portal' and situacao = 'emitida' and criado_por = auth.uid());

-- O titular corrige ou marca como cancelada uma nota do portal
-- (o cancelamento em si é feito no portal).
drop policy if exists nf_portal_titular on public.nota_fiscal;
create policy nf_portal_titular on public.nota_fiscal for update
  using (escritorio_id = meu_escritorio() and meu_perfil() = 'titular' and origem = 'portal')
  with check (escritorio_id = meu_escritorio() and meu_perfil() = 'titular' and origem = 'portal');
