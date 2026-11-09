-- 54_escritorio_pelo_caso.sql — quem escreve pela porta da parceria não sabe o escritório
--
-- O 53 abriu as catorze tabelas que penduram num caso. Faltou uma coisa, e ela aparece na
-- primeira gravação: quase todas têm `escritorio_id not null`, e **nenhuma tem parceria_id** —
-- então o gatilho `parceria_guarda`, que preenche o escritório a partir do carimbo, não as
-- alcança. Resultado medido: anotar um contato pela parceria devolvia
--     23502 null value in column "escritorio_id" of relation "interacao"
--
-- Pôr o escritorio_id na tela seria errado por dois motivos: a parceira não tem por que
-- conhecê-lo, e qualquer tela nova que esquecesse o campo repetiria o defeito. O lugar disto
-- é o banco: o escritório **se deduz do caso** (ou do processo), que é justamente o que a
-- política do 53 já obriga a ser da parceria. Não há como apontar para o caso de um e gravar
-- no escritório de outro.
--
-- `parte` e `caso_tag` ficam de fora: não têm a coluna.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

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

  return new;
end $$;

do $$
declare
  t text;
  alvos text[] := array[
    'documento','caso_documento','doc_texto','minuta','ficha','fato',
    'interacao','timesheet','assinatura','carteira_revisao','delegacao','informativo_rascunho'];
  n int := 0;
begin
  foreach t in array alvos loop
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=t and column_name='escritorio_id') then
      raise notice 'tabela % não tem escritorio_id; pulei', t;
      continue;
    end if;
    -- "a_" para disparar antes de qualquer outro gatilho da tabela
    execute format('drop trigger if exists a_escritorio_pelo_caso on public.%I', t);
    execute format('create trigger a_escritorio_pelo_caso before insert on public.%I
                    for each row execute function public.escritorio_pelo_caso()', t);
    n := n + 1;
  end loop;
  raise notice 'gatilhos criados: %', n;
end $$;

-- conferência
select c.relname as tabela, t.tgname as gatilho
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where t.tgname = 'a_escritorio_pelo_caso'
 order by c.relname;
