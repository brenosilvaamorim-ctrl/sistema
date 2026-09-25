-- 27_casa_parcelas.sql — comparar propostas de verdade e saber até quando se paga
--
-- Um orçamento não é só um número: é uma loja ou um profissional, com contato,
-- um preço à vista e, quase sempre, um parcelamento. Comparar só pelo valor
-- esconde a diferença que mais pesa no mês — a parcela. E, depois de fechar,
-- a pergunta que volta é "até quando eu pago isto?".
--
-- Por isso as condições de pagamento moram no ORÇAMENTO (cada proposta tem a
-- sua) e, quando um é escolhido, elas são copiadas para o ITEM, que passa a
-- ser o contrato: foi com fulano, em tantas parcelas, e a última cai em tal mês.

alter table public.casa_orcamento
  add column if not exists contato        text,
  add column if not exists parcelas       integer,
  add column if not exists valor_parcela  numeric(14,2),
  add column if not exists entrada        numeric(14,2),
  add column if not exists primeira_parcela date,
  add column if not exists forma          text,
  add column if not exists link           text;

alter table public.casa_item
  add column if not exists contratado_em    date,
  add column if not exists contato          text,
  add column if not exists parcelas         integer,
  add column if not exists valor_parcela    numeric(14,2),
  add column if not exists entrada          numeric(14,2),
  add column if not exists primeira_parcela date,
  add column if not exists ultima_parcela   date,
  add column if not exists forma            text,
  add column if not exists orcamento_id     uuid references public.casa_orcamento(id) on delete set null;

comment on column public.casa_item.ultima_parcela is
  'Calculada quando o orçamento é escolhido: primeira parcela + (parcelas - 1) meses.';
