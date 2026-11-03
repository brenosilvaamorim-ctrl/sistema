-- 34_lancamento_nota_total.sql — nota pelo total quando o parceiro não emite
--
-- Na parceria, a regra é a nota sair só pela parte do escritório (art. 15,
-- § 9º, EAOAB), e o parceiro emitir a dele. Nem todo parceiro faz isso —
-- sobretudo quem não tem CNPJ. Nesse caso o escritório emite pelo total
-- recebido, e o repasse ao parceiro continua lançado como saída.
--
-- A escolha fica no recebimento e é sugerida na hora da nota. Na nota fiscal
-- não precisa de coluna: nota pelo total é a que tem valor do serviço igual
-- ao total recebido.

alter table public.lancamento
  add column if not exists nota_sobre_total boolean not null default false;

comment on column public.lancamento.nota_sobre_total is
  'Parceria em que o parceiro não emite nota: a NF do escritório sai pelo total recebido.';
