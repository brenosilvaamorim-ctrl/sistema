-- 35_notas_importadas.sql — notas emitidas antes do sistema
--
-- As notas que o escritório já tirou (no portal da prefeitura, E&L, ou no
-- Emissor Nacional) entram no sistema pela importação: XML ou PDF, conferidos
-- numa prévia. Cada uma vira um registro em nota_fiscal com origem 'importada'
-- e, quando é o caso, um recebimento no Financeiro.
--
-- A numeração da prefeitura e a do Emissor Nacional são séries diferentes e
-- podem repetir o mesmo número; por isso a trava contra duplicidade passa a
-- considerar também a origem.

alter table public.nota_fiscal drop constraint if exists nota_fiscal_origem_ck;
alter table public.nota_fiscal add constraint nota_fiscal_origem_ck
  check (origem in ('api','portal','importada'));

alter table public.nota_fiscal drop constraint if exists nota_fiscal_dps_api_ck;
alter table public.nota_fiscal add constraint nota_fiscal_dps_api_ck
  check (origem in ('portal','importada') or situacao = 'rascunho'
         or (serie is not null and numero_dps is not null and id_dps is not null));

drop index if exists public.nota_fiscal_numero_uk;
create unique index if not exists nota_fiscal_numero_uk
  on public.nota_fiscal(escritorio_id, ambiente, origem, numero_nfse)
  where numero_nfse is not null;

drop policy if exists nf_importar on public.nota_fiscal;
create policy nf_importar on public.nota_fiscal for insert
  with check (escritorio_id = meu_escritorio() and vejo_financeiro()
              and origem = 'importada' and situacao in ('emitida','cancelada') and criado_por = auth.uid());

-- O titular corrige ou marca como cancelada nota do portal ou importada.
drop policy if exists nf_portal_titular on public.nota_fiscal;
create policy nf_portal_titular on public.nota_fiscal for update
  using (escritorio_id = meu_escritorio() and meu_perfil() = 'titular' and origem in ('portal','importada'))
  with check (escritorio_id = meu_escritorio() and meu_perfil() = 'titular' and origem in ('portal','importada'));
