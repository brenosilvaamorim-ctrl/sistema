-- 73_indices_por_caso.sql — índices pelo caso em evento, prazo e processo
--
-- A tela do caso busca as audiências, os prazos e os processos pelo caso_id, e a regra do
-- quadro (banco/72) faz o mesmo a cada audiência, prazo ou processo gravado. Nenhuma das três
-- tabelas tinha índice nessa coluna: cada busca lia a tabela inteira. Com poucos registros não
-- se nota; com os anos de agenda e de prazos importados do DJEN, é o tipo de coisa que deixa a
-- tela do caso lenta. Só acrescenta índices; não muda dado nenhum e pode rodar de novo.

create index if not exists evento_caso_idx   on public.evento(caso_id)   where caso_id is not null;
create index if not exists prazo_caso_idx    on public.prazo(caso_id)    where caso_id is not null;
create index if not exists processo_caso_idx on public.processo(caso_id) where caso_id is not null;
