-- 57_parceria_arquivos.sql — os arquivos do caso em parceria
--
-- Até aqui a parceria alcançava a FICHA do caso e o HONORÁRIO dele, mas não o papel: o
-- contrato assinado e a ficha escaneada moram no Storage, que tem regra própria e não
-- enxerga `parceria_id`. A tela mostrava a lista do que falta chegar e nada do que chegou.
--
-- O caminho dos arquivos do escritório é `{escritorio_id}/{id da coisa}/{arquivo}`. A
-- PRIMEIRA pasta é o escritório — não serve de chave aqui, porque é a mesma para tudo o
-- que é dele. A chave é a SEGUNDA:
--
--   bucket `contratos`  → a segunda pasta é o CASO       (ver honorario.arquivo_path)
--   bucket `fichas`     → a segunda pasta é a FICHA      (ver ficha.arquivo_path)
--
-- Então a regra pergunta a mesma coisa de sempre, só que pelo nome do arquivo: este caso é
-- da parceria? Esta ficha pendura num caso da parceria? Um contrato de caso que não é dela
-- continua invisível, porque a pasta dele não está na lista.
--
-- LER e GRAVAR, não apagar nem trocar. É a mesma régua do 53: pela porta da parceria se
-- escreve e se corrige, não se apaga — e apagar arquivo é pior do que apagar linha, porque
-- não há como reconstruir depois.
--
-- Nada aqui mexe no que o escritório já podia: são políticas novas, que somam.
-- Os outros baldes — previdenciario, financeiro, casa, backup, modelos — ficam de fora:
-- não penduram em caso de parceria.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------- contratos (por caso)
drop policy if exists contratos_parceria_ler on storage.objects;
create policy contratos_parceria_ler on storage.objects for select to authenticated
  using (bucket_id = 'contratos'
     and (storage.foldername(name))[2] in (
           select id::text from public.caso where parceria_id = public.minha_parceria()));

drop policy if exists contratos_parceria_gravar on storage.objects;
create policy contratos_parceria_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos'
     and (storage.foldername(name))[2] in (
           select id::text from public.caso where parceria_id = public.minha_parceria()));

-- ----------------------------------------------------------- fichas (por ficha)
drop policy if exists fichas_parceria_ler on storage.objects;
create policy fichas_parceria_ler on storage.objects for select to authenticated
  using (bucket_id = 'fichas'
     and (storage.foldername(name))[2] in (
           select f.id::text from public.ficha f
            where f.caso_id in (select id from public.caso where parceria_id = public.minha_parceria())));

drop policy if exists fichas_parceria_gravar on storage.objects;
create policy fichas_parceria_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'fichas'
     and (storage.foldername(name))[2] in (
           select f.id::text from public.ficha f
            where f.caso_id in (select id from public.caso where parceria_id = public.minha_parceria())));

-- ------------------------------------------------------------ conferência
select bucket_id,
       count(*)                                   as arquivos,
       count(*) filter (where (storage.foldername(name))[2] in (
         select id::text from public.caso where parceria_id is not null)) as de_caso_em_parceria
  from storage.objects
 where bucket_id in ('contratos','fichas')
 group by bucket_id
 order by bucket_id;
