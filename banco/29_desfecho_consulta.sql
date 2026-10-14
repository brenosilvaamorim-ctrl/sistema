-- 28_desfecho_consulta.sql
-- Faltava a resposta para a pergunta mais cara do escritório: de cada dez
-- consultas realizadas, quantas viram contrato. Sem ela não há como dizer
-- quanto vale pagar por um lead — qualquer cálculo de custo de aquisição fica
-- sendo chute.
--
-- Hoje a etapa do lead só diz onde ele está AGORA. Um lead que foi atendido e
-- não fechou e um lead que sumiu antes da consulta terminam os dois em
-- 'perdido', e a diferença entre os dois — que é justamente o que se quer
-- medir — se perde. O motivo também morava solto dentro do resumo, em texto
-- livre, onde nenhuma conta alcança.

alter table public.lead
  add column if not exists consulta_em     timestamptz,
  add column if not exists desfecho        text,
  add column if not exists desfecho_em     timestamptz,
  add column if not exists desfecho_motivo text,
  add column if not exists honorario       numeric(14,2);

-- Nulo é um estado legítimo e é a maioria: lead que ainda está em andamento, ou
-- que se perdeu antes de chegar à consulta. Só entra na conta de fechamento
-- quem foi efetivamente atendido.
alter table public.lead drop constraint if exists lead_desfecho_ck;
alter table public.lead add constraint lead_desfecho_ck
  check (desfecho is null or desfecho in ('contratou','nao_contratou','nao_compareceu'));

create index if not exists lead_desfecho_idx
  on public.lead(escritorio_id, desfecho) where desfecho is not null;

comment on column public.lead.consulta_em is
  'Quando a consulta aconteceu de fato. Marcar é uma coisa, acontecer é outra.';
comment on column public.lead.desfecho is
  'contratou | nao_contratou | nao_compareceu. Nulo enquanto não houve consulta. '
  'A taxa de fechamento é contratou / (contratou + nao_contratou): quem não '
  'compareceu não ouviu proposta nenhuma e não pode pesar contra ela.';
comment on column public.lead.desfecho_motivo is
  'Por que não fechou, em uma linha. Em coluna própria para poder ser agrupado.';
comment on column public.lead.honorario is
  'Honorário contratado. É o que permite devolver valor de conversão ao anúncio '
  'e saber qual origem traz caso grande, não só caso em quantidade.';
