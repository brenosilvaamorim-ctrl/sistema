-- 60_ficha_do_lead_na_parceria.sql — a ficha nasce no lead, antes de existir caso
--
-- O 53 abriu a `ficha` pelo CASO. Só que a ficha de atendimento é preenchida na captação,
-- quando ainda não há caso nenhum: ela nasce amarrada ao LEAD e só depois, se o lead fechar,
-- ganha o caso. Pela regra do 53, a parceira não conseguiria criar nem ver a ficha do próprio
-- lead — a porta estava trancada justamente no momento em que ela é usada.
--
-- O 54, pela mesma razão, não sabia deduzir o escritório de uma ficha que ainda não tem caso.
-- E o 57, que abre o papel escaneado no Storage, procurava a ficha só pelo caso.
--
-- Os três passam a olhar o lead também. A pergunta continua a mesma — isto é nosso? —, só
-- que agora ela pode ser respondida por dois caminhos: pelo caso ou pelo lead.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------- 1. a ficha, pelo lead
drop policy if exists ficha_parceria on public.ficha;
create policy ficha_parceria on public.ficha for all to public
  using (caso_id in (select id from public.caso where parceria_id = minha_parceria())
      or lead_id in (select id from public.lead where parceria_id = minha_parceria()))
  with check (caso_id in (select id from public.caso where parceria_id = minha_parceria())
           or lead_id in (select id from public.lead where parceria_id = minha_parceria()));

-- ------------------------------------- 2. o escritório deduzido também do lead
create or replace function public.escritorio_pelo_caso() returns trigger
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.escritorio_id is not null then return new; end if;

  v := (to_jsonb(new) ->> 'caso_id')::uuid;
  if v is not null then
    select escritorio_id into new.escritorio_id from public.caso where id = v;
  end if;

  if new.escritorio_id is null then
    v := (to_jsonb(new) ->> 'processo_id')::uuid;
    if v is not null then
      select escritorio_id into new.escritorio_id from public.processo where id = v;
    end if;
  end if;

  /* A ficha da captação ainda não tem caso: pendura no lead. */
  if new.escritorio_id is null then
    v := (to_jsonb(new) ->> 'lead_id')::uuid;
    if v is not null then
      select escritorio_id into new.escritorio_id from public.lead where id = v;
    end if;
  end if;

  return new;
end $$;

-- --------------------------------------- 3. o papel escaneado, no Storage
drop policy if exists fichas_parceria_ler on storage.objects;
create policy fichas_parceria_ler on storage.objects for select to authenticated
  using (bucket_id = 'fichas'
     and (storage.foldername(name))[2] in (
           select f.id::text from public.ficha f
            where f.caso_id in (select id from public.caso where parceria_id = public.minha_parceria())
               or f.lead_id in (select id from public.lead where parceria_id = public.minha_parceria())));

drop policy if exists fichas_parceria_gravar on storage.objects;
create policy fichas_parceria_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'fichas'
     and (storage.foldername(name))[2] in (
           select f.id::text from public.ficha f
            where f.caso_id in (select id from public.caso where parceria_id = public.minha_parceria())
               or f.lead_id in (select id from public.lead where parceria_id = public.minha_parceria())));

-- ------------------------------------------------------------ conferência
select 'ficha pelo lead'  as regra, (select count(*) from pg_policies
         where schemaname='public' and tablename='ficha' and policyname='ficha_parceria'
           and qual like '%lead_id%') as ok
union all
select 'gatilho vê o lead', (select count(*) from pg_proc
         where proname='escritorio_pelo_caso' and prosrc like '%lead_id%')
union all
select 'storage pelo lead', (select count(*) from pg_policies
         where schemaname='storage' and policyname like 'fichas_parceria%'
           and coalesce(qual, with_check) like '%lead_id%');
