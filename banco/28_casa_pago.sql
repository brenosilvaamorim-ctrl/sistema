-- 28_casa_pago.sql — marcar um item da casa como pago
--
-- "Já pago" era só a soma dos lançamentos. Isso responde quanto saiu, mas não
-- responde o que interessa no fim: este item está quitado? Um armário pago com
-- desconto fica com a soma menor que o orçado e parecia eternamente em aberto.
-- pago_em é a decisão do casal: acabou, não se deve mais nada disto.

alter table public.casa_item
  add column if not exists pago_em date;

comment on column public.casa_item.pago_em is
  'Data em que o item foi dado por quitado. Independe da soma dos lançamentos: é declaração, não cálculo.';
