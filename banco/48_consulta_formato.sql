-- 48_consulta_formato.sql — a consulta diz como vai ser
--
-- Ao marcar a consulta na Captação, escolhe-se: presencial, videochamada ou
-- ligação. Videochamada faz a função consulta-meet criar o evento no Google
-- Agenda já com a sala do Meet e devolver o link para link_sala.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o index.html que usa a coluna.
-- Pode rodar de novo sem estragar nada.

alter table public.evento add column if not exists formato text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'evento_formato_ck') then
    alter table public.evento add constraint evento_formato_ck
      check (formato is null or formato in ('presencial', 'video', 'telefone'));
  end if;
end $$;

comment on column public.evento.formato is
  'Como a consulta acontece: presencial, video (Meet gerado pela função consulta-meet) ou telefone. Nulo nos eventos que não são consulta.';
