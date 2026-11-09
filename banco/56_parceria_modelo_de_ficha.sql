-- 56_parceria_modelo_de_ficha.sql — a ficha do caso precisa das perguntas para ser lida
--
-- O 53 abriu a `ficha`, que é onde moram as respostas do atendimento. Só que as respostas
-- são um jsonb com chaves curtas — `at_num`, `rotina_obs`, `nec_obs` —, e **a pergunta que
-- cada chave responde está em `ficha_modelo.estrutura`**. Sem o modelo, a tela da parceria
-- mostraria "rotina_obs: sim", que não quer dizer nada.
--
-- `ficha_modelo` é o questionário, não o atendimento: são as perguntas que o escritório faz,
-- iguais para todo mundo, sem nome de cliente nem resposta de ninguém. É da mesma natureza
-- de `tag`, `area_atuacao` e `coluna_caso`, que o 44 já abriu pelo mesmo motivo — sem elas,
-- o caso apareceria sem etapa e sem área.
--
-- Só leitura. Criar ou mudar questionário continua sendo do escritório: é o método dele.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

drop policy if exists ficha_modelo_parceria on public.ficha_modelo;
create policy ficha_modelo_parceria on public.ficha_modelo for select to public
  using (escritorio_id is null
      or escritorio_id in (select escritorio_id from public.parceria where id = minha_parceria()));

-- conferência
select nome, area, jsonb_array_length(estrutura) as blocos
  from public.ficha_modelo
 where ativo
 order by ordem, nome;
