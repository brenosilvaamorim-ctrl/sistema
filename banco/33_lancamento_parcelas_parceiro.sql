-- 33_lancamento_parcelas_parceiro.sql — parcelas e parceiro no Financeiro
--
-- O honorário parcelado passa a ser lançado de uma vez: o sistema cria uma
-- linha por parcela (as colunas parcela e total_parcelas já existiam) e as
-- amarra pelo grupo_parcelas, para mostrar o total do acordo em cada parcela.
--
-- Quando o caso é em parceria, o recebimento guarda o parceiro e o percentual
-- dele. A tela mostra quanto cabe ao parceiro na parcela e no total, e a nota
-- fiscal desse recebimento já sai com a parceria preenchida.

alter table public.lancamento
  add column if not exists grupo_parcelas       uuid,
  add column if not exists parceiro_id          uuid references public.parceiro(id) on delete set null,
  add column if not exists percentual_parceiro  numeric(5,2);

alter table public.lancamento drop constraint if exists lancamento_percentual_parceiro_ck;
alter table public.lancamento add constraint lancamento_percentual_parceiro_ck
  check (percentual_parceiro is null or (percentual_parceiro > 0 and percentual_parceiro < 100));

create index if not exists lancamento_grupo_parcelas_idx
  on public.lancamento(grupo_parcelas) where grupo_parcelas is not null;

comment on column public.lancamento.grupo_parcelas is
  'Mesmo valor em todas as parcelas de um honorário lançado parcelado.';
comment on column public.lancamento.percentual_parceiro is
  'Percentual do honorário que cabe ao parceiro (parceria, art. 15, § 9º, EAOAB).';
