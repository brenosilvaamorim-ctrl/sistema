-- 53_parceria_o_que_pende_do_caso.sql — a parceria alcança tudo o que pendura no caso
--
-- A régua, dita pelo Breno em 08/11/2026: o mini-sistema tem o sistema inteiro, menos o
-- bolso dele, **mas cada tela mostra exclusivamente o que pendura num caso ou processo da
-- parceria. As informações não se misturam.**
--
-- Levantando o banco com essa régua, vinte e uma tabelas penduram num caso. Oito já estavam
-- abertas (processo, prazo, evento, intimação, lançamento, honorário, lead e movimentação).
-- Faltavam catorze — e é por elas que passam Documentos, Minutas, Ficha, Mensageria, Horas,
-- Fatos e partes, Etiquetas e o resto do que o escritório tem.
--
-- Todas recebem a MESMA forma, e é essa forma que garante que nada se mistura:
--     caso_id in (select id from caso where parceria_id = minha_parceria())
-- Um documento de um caso que não é da parceria continua invisível, porque o caso dele não
-- está na lista. Para um login do escritório, `minha_parceria()` é nulo, a lista vem vazia e
-- a política nega — o escritório continua enxergando pelas políticas que já tinha.
--
-- Quatro tabelas penduram também num processo (documento, parte, delegação e o rascunho do
-- informativo); nelas o mesmo caminho vale pelo processo.
--
-- APAGAR NÃO ENTRA. Cada tabela ganha, junto, uma política restritiva que exige ser do
-- escritório para apagar. É a mesma regra que já vale para caso, cliente, processo e
-- lançamento: pela porta da parceria se escreve e se corrige, não se apaga. Documento e
-- minuta são trabalho; sumir com eles sem rastro é o tipo de estrago que ninguém percebe
-- na hora.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

do $$
declare
  t text;
  alvos text[] := array[
    'documento','caso_documento','doc_texto','minuta','ficha','fato','parte',
    'interacao','timesheet','assinatura','carteira_revisao','delegacao',
    'caso_tag','informativo_rascunho'];
  tem_proc boolean;
  cond text;
  n int := 0;
begin
  foreach t in array alvos loop
    if not exists (select 1 from information_schema.tables
                    where table_schema = 'public' and table_name = t) then
      raise notice 'tabela % não existe; pulei', t;
      continue;
    end if;

    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'processo_id')
      into tem_proc;

    cond := 'caso_id in (select id from public.caso where parceria_id = minha_parceria())';
    if tem_proc then
      cond := cond || ' or processo_id in (select id from public.processo where parceria_id = minha_parceria())';
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_parceria', t);
    execute format('create policy %I on public.%I for all to public using (%s) with check (%s)',
                   t || '_parceria', t, cond, cond);

    execute format('drop policy if exists %I on public.%I', t || '_sem_apagar', t);
    execute format('create policy %I on public.%I as restrictive for delete to public using (meu_escritorio() is not null)',
                   t || '_sem_apagar', t);

    n := n + 1;
    raise notice 'tabela % aberta para a parceria%', t, case when tem_proc then ' (pelo caso e pelo processo)' else '' end;
  end loop;
  raise notice 'tabelas abertas: %', n;
end $$;

-- A etiqueta é uma lista de nomes, como a etapa e a área: sem poder lê-la, o cartão do
-- quadro mostraria etiqueta sem nome. Mesmo molde do que o 44 fez com coluna_caso.
drop policy if exists tag_parceria on public.tag;
create policy tag_parceria on public.tag for select to public
  using (escritorio_id in (select escritorio_id from public.parceria where id = minha_parceria()));

-- ------------------------------------------------------------ conferência
select tablename as tabela,
       count(*) filter (where policyname like '%\_parceria')    as abre_para_a_parceria,
       count(*) filter (where policyname like '%\_sem\_apagar') as proibe_apagar
  from pg_policies
 where schemaname = 'public'
   and tablename in ('documento','caso_documento','doc_texto','minuta','ficha','fato','parte',
                     'interacao','timesheet','assinatura','carteira_revisao','delegacao',
                     'caso_tag','informativo_rascunho','tag')
 group by tablename
 order by abre_para_a_parceria, tablename;
