-- 24_consulta_lead.sql
-- A etapa "Consulta marcada" da Captação era só uma coluna do quadro: não havia
-- onde dizer QUANDO é a consulta, e por isso ela nunca chegava à Agenda. Um
-- compromisso que não está na agenda é um compromisso que se perde.
-- Esta migração dá ao evento um vínculo com o lead, do mesmo jeito que ficha já
-- tem lead_id e lead já tem caso_id.

alter table public.evento
  add column if not exists lead_id uuid references public.lead(id) on delete set null;

create index if not exists evento_lead_idx on public.evento(lead_id) where lead_id is not null;

comment on column public.evento.lead_id is
  'Consulta marcada na captação, antes de existir caso. Quando o lead fecha, o evento recebe caso_id e cliente_id e este vínculo deixa de ser o único.';
