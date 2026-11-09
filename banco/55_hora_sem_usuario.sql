-- 55_hora_sem_usuario.sql — a parceira lança hora, e ela não está em `usuario`
--
-- Terceiro defeito achado gravando de verdade, depois do 53 e do 54. `timesheet.usuario_id`
-- é obrigatório e aponta para `usuario` — a tabela de quem é do escritório. A parceira não
-- está lá, e nunca estará: é isso que a mantém do lado de fora. Resultado:
--     23502 null value in column "usuario_id" of relation "timesheet"
--
-- Conferi as catorze tabelas que o 53 abriu: só esta coluna era obrigatória. As outras que
-- apontam para `usuario` — `documento.enviado_por` e `interacao.usuario_id` — já aceitavam
-- nulo, como `responsavel_id`, `criado_por` e `lida_por`. Esta ficou de fora da regra por
-- descuido, não por desenho: o escritório sempre tinha um usuário, e ninguém testou o
-- contrário.
--
-- Deixar nulo é o mesmo que já vale no resto do sistema para quem escreve pela parceria:
-- o campo fica em branco, e **quem fez o quê continua na auditoria, pelo nome** — o
-- `anotar()` do 44 procura o nome em `parceria_membro` quando não acha em `usuario`.
--
-- Nenhuma linha existe hoje em timesheet, então não há o que migrar.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

alter table public.timesheet alter column usuario_id drop not null;

comment on column public.timesheet.usuario_id is
  'Em branco quando a hora foi lançada pela porta da parceria: quem lançou não está em usuario. Ver banco/55.';

-- conferência: tem de voltar `false` em obrigatoria
select a.attname as coluna, a.attnotnull as obrigatoria
  from pg_attribute a
 where a.attrelid = 'public.timesheet'::regclass
   and a.attname in ('usuario_id','escritorio_id','caso_id','minutos');
