-- 47_parceria_guarda_sem_coluna.sql — contato novo voltou a entrar na Captação
--
-- O que quebrou: a 45 pôs no gatilho parceria_guarda a regra que dá ao caso novo
-- da parceria a primeira etapa do quadro. A condição foi escrita numa linha só:
--
--   if tg_table_name = 'caso' and new.parceria_id is not null and new.coluna_id is null
--
-- O PL/pgSQL não garante parar no primeiro termo falso. Em tabela sem coluna_id
-- (lead, evento, prazo, intimação...), ele avalia new.coluna_id e o INSERT inteiro
-- cai com: record "new" has no field "coluna_id". Foi assim que a Captação parou
-- de aceitar contato novo.
--
-- O conserto separa o teste da tabela do resto e lê coluna_id pelo jsonb, que
-- devolve nulo em vez de erro. Para o caso, o comportamento é o mesmo da 45.
--
-- Aplicada pelo SQL Editor em 07/11/2026. Pode rodar de novo sem estragar nada.

create or replace function public.parceria_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai uuid;
begin
  if tg_op = 'INSERT' then
    if new.parceria_id is null then
      v_pai := (to_jsonb(new) ->> 'caso_id')::uuid;
      if v_pai is not null then
        select parceria_id into new.parceria_id from public.caso where id = v_pai;
      end if;
    end if;
    -- sem caso, ou caso sem parceria: tenta pelo processo
    if new.parceria_id is null then
      v_pai := (to_jsonb(new) ->> 'processo_id')::uuid;
      if v_pai is not null then
        select parceria_id into new.parceria_id from public.processo where id = v_pai;
      end if;
    end if;
    if new.escritorio_id is null and new.parceria_id is not null then
      select escritorio_id into new.escritorio_id from public.parceria where id = new.parceria_id;
    end if;
    -- O quadro de casos do escritório agrupa por etapa e descarta quem não tem
    -- nenhuma: um caso aberto pela porta da parceria ficaria invisível lá. Ele
    -- entra na primeira etapa, como qualquer caso novo.
    if tg_table_name = 'caso' then
      if new.parceria_id is not null and (to_jsonb(new) ->> 'coluna_id') is null then
        select id into new.coluna_id from public.coluna_caso
         where escritorio_id = new.escritorio_id order by ordem limit 1;
      end if;
    end if;
  elsif old.parceria_id is not null and public.sou_parceira() then
    -- a condição do carimbo vem antes de propósito: linha sem parceria a
    -- parceira nem enxerga, e assim a alteração comum não paga duas consultas.
    new.escritorio_id := old.escritorio_id;
  end if;
  return new;
end $$;
