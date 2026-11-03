-- 32_notas_rascunho_repasse.sql — rascunhos de nota e repasse no Financeiro
--
-- Rascunho: a nota fica pronta (tomador, valor, competência, descrição com
-- parceria) e é emitida depois — no portal ou, com o e-CNPJ A1, pelo sistema.
-- Rascunho não tem DPS nem valor fiscal; só quem vê o financeiro cria, edita
-- ou apaga, e a tela nunca transforma rascunho em nota emitida: a emissão
-- grava uma nota nova e o rascunho é apagado.
--
-- Repasse: quando a nota sai com parceria, o valor transferido ao parceiro
-- vira uma saída no Financeiro, ligada à nota pela coluna nota_fiscal_id
-- (que também impede lançar o mesmo repasse duas vezes).

alter table public.nota_fiscal drop constraint if exists nota_fiscal_situacao_check;
alter table public.nota_fiscal add constraint nota_fiscal_situacao_check
  check (situacao in ('rascunho','enviando','emitida','rejeitada','cancelada'));

alter table public.nota_fiscal drop constraint if exists nota_fiscal_dps_api_ck;
alter table public.nota_fiscal add constraint nota_fiscal_dps_api_ck
  check (origem = 'portal' or situacao = 'rascunho'
         or (serie is not null and numero_dps is not null and id_dps is not null));

drop policy if exists nf_rascunho_criar on public.nota_fiscal;
create policy nf_rascunho_criar on public.nota_fiscal for insert
  with check (escritorio_id = meu_escritorio() and vejo_financeiro()
              and situacao = 'rascunho' and criado_por = auth.uid());

drop policy if exists nf_rascunho_editar on public.nota_fiscal;
create policy nf_rascunho_editar on public.nota_fiscal for update
  using (escritorio_id = meu_escritorio() and vejo_financeiro() and situacao = 'rascunho')
  with check (escritorio_id = meu_escritorio() and vejo_financeiro() and situacao = 'rascunho');

drop policy if exists nf_rascunho_apagar on public.nota_fiscal;
create policy nf_rascunho_apagar on public.nota_fiscal for delete
  using (escritorio_id = meu_escritorio() and vejo_financeiro() and situacao = 'rascunho');

alter table public.lancamento
  add column if not exists nota_fiscal_id uuid references public.nota_fiscal(id) on delete set null;

create unique index if not exists lancamento_repasse_nota_uk
  on public.lancamento(nota_fiscal_id) where nota_fiscal_id is not null and tipo = 'saida';

comment on column public.lancamento.nota_fiscal_id is
  'Nota fiscal que originou este lançamento (hoje: a saída do repasse de parceria).';
