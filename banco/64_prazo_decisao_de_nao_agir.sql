-- 64_prazo_decisao_de_nao_agir.sql — "não é prazo" e "é prazo, mas não vamos agir" são coisas diferentes
--
-- Pedido do Breno em 15/11/2026, a partir do caso da Jamile: a decisão que indeferiu a tutela
-- abria prazo de agravo, e a escolha foi não agravar. Descartar como "não é prazo" seria
-- falso — o prazo existia. E não registrar nada deixa o outro advogado sem saber se o prazo
-- passou por esquecimento ou por decisão.
--
-- O prazo dispensado continua com a situação `cancelado` (sai dos abertos, não aparece como
-- vencido, não entra na conta de prazo perdido), e esta coluna diz que o cancelamento foi
-- uma DECISÃO, não um erro de leitura. O porquê fica em `motivo_descarte`, como no descarte.
-- Uma coluna em vez de um valor novo no enum `situacao_prazo` porque o enum é lido por
-- visões, robôs e pela tela do escritório; um valor novo exigiria mexer em todos eles.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

alter table public.prazo add column if not exists decisao_nao_agir boolean not null default false;

select count(*) as prazos_com_a_coluna from public.prazo where decisao_nao_agir = false;
