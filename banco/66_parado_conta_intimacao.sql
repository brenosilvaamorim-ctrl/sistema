-- 66_parado_conta_intimacao.sql — "parado há" passa a contar a intimação do DJEN
--
-- O Breno notou em 15/11/2026: o caso da Neuraneide aparecia parado havia mais de 40 dias,
-- mas tinha intimação em 10/11. Conferido no banco: o último andamento que o DataJud
-- devolveu é de 03/10 — mesmo com o robô tendo consultado em 15/11, porque a base pública do
-- CNJ chega atrasada —, e as intimações de 22/10 e 10/11 estavam na tabela `intimacao`, que
-- nenhuma destas visões olhava.
--
-- A regra nova: o último sinal de vida do processo é o MAIS RECENTE entre o último andamento
-- do DataJud e a última intimação do DJEN. O nome da coluna (`ultima_movimentacao`) fica,
-- porque a tela do escritório, a da parceria e os relatórios leem esse nome.
--
-- As três visões continuam com security_invoker = on (banco/44): sem isso, a parceira veria
-- pela visão o escritório inteiro. Está escrito de novo aqui porque recriar a visão é a hora
-- em que essa opção se perderia sem ninguém notar.
--
-- Se a visão no banco tiver coluna que este arquivo não tem, o Postgres recusa a troca com
-- "cannot drop columns from view" e nada muda — falha fechado.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

create or replace view public.caso_quadro with (security_invoker = on) as
 SELECT c.id,
    c.titulo,
    c.area,
    c.polo,
    c.resultado,
    c.encerrado_em,
    c.criado_em,
    cl.nome AS cliente_nome,
    COALESCE(cl.whatsapp, cl.telefone) AS fone,
    col.id AS coluna_id,
    col.nome AS coluna_nome,
    col.cor AS coluna_cor,
    col.ordem AS coluna_ordem,
    a.nome AS area_nome,
    ( SELECT count(*) AS count
           FROM processo p
          WHERE (p.caso_id = c.id)) AS processos,
    ( SELECT min(z.data_fatal) AS min
           FROM prazo z
          WHERE ((z.caso_id = c.id) AND (z.situacao = ANY (ARRAY['sugerido'::situacao_prazo, 'confirmado'::situacao_prazo])))) AS proximo_prazo,
    GREATEST(
      ( SELECT max(m.data) FROM (movimentacao m JOIN processo p ON ((p.id = m.processo_id))) WHERE (p.caso_id = c.id)),
      ( SELECT (max(i.data_disponibilizacao))::timestamptz FROM intimacao i
          WHERE (i.caso_id = c.id) OR (i.processo_id IN (SELECT p.id FROM processo p WHERE p.caso_id = c.id)))
    ) AS ultima_movimentacao,
    ( SELECT min(p.data_ajuizamento) AS min
           FROM processo p
          WHERE ((p.caso_id = c.id) AND (p.data_ajuizamento IS NOT NULL))) AS primeira_distribuicao
   FROM (((caso c
     LEFT JOIN cliente cl ON ((cl.id = c.cliente_id)))
     LEFT JOIN coluna_caso col ON ((col.id = c.coluna_id)))
     LEFT JOIN area_atuacao a ON ((a.id = c.area_id)));

create or replace view public.cliente_painel with (security_invoker = on) as
 SELECT cl.id,
    cl.nome,
    cl.telefone,
    cl.whatsapp,
    cl.email,
    cl.criado_em,
    c.id AS caso_id,
    c.titulo AS caso_titulo,
    c.area,
    c.polo,
    c.area_id,
    c.origem_id,
    c.prescricao_em,
    c.prescricao_obs,
    c.encerrado_em,
    c.criado_em AS caso_criado_em,
    a.nome AS area_nome,
    o.nome AS origem_nome,
    ( SELECT count(*) AS count
           FROM processo p
          WHERE (p.caso_id = c.id)) AS processos,
    GREATEST(
      ( SELECT max(m.data) FROM (movimentacao m JOIN processo p ON ((p.id = m.processo_id))) WHERE (p.caso_id = c.id)),
      ( SELECT (max(i.data_disponibilizacao))::timestamptz FROM intimacao i
          WHERE (i.caso_id = c.id) OR (i.processo_id IN (SELECT p.id FROM processo p WHERE p.caso_id = c.id)))
    ) AS ultima_movimentacao
   FROM (((cliente cl
     LEFT JOIN caso c ON ((c.cliente_id = cl.id)))
     LEFT JOIN area_atuacao a ON ((a.id = c.area_id)))
     LEFT JOIN origem_captacao o ON ((o.id = c.origem_id)));

create or replace view public.processo_painel with (security_invoker = on) as
 SELECT p.id,
    p.numero_cnj,
    p.numero_formatado,
    p.tribunal_sigla,
    p.orgao,
    p.classe,
    p.grau,
    p.assunto,
    p.data_ajuizamento,
    p.ultima_sync,
    p.monitorar,
    c.id AS caso_id,
    c.titulo AS caso_titulo,
    c.area,
    c.polo,
    c.criado_em AS caso_criado_em,
    cl.id AS cliente_id,
    cl.nome AS cliente_nome,
    cl.telefone,
    cl.whatsapp,
    GREATEST(
      ( SELECT max(m.data) FROM movimentacao m WHERE (m.processo_id = p.id)),
      ( SELECT (max(i.data_disponibilizacao))::timestamptz FROM intimacao i WHERE (i.processo_id = p.id))
    ) AS ultima_movimentacao,
    ( SELECT count(*) AS count
           FROM movimentacao m
          WHERE (m.processo_id = p.id)) AS movimentacoes
   FROM ((processo p
     LEFT JOIN caso c ON ((c.id = p.caso_id)))
     LEFT JOIN cliente cl ON ((cl.id = c.cliente_id)));

-- Conferência: o caso da Neuraneide deve sair com 10/11, não 03/10.
select q.titulo, q.ultima_movimentacao::date as ultimo_sinal,
       (current_date - q.ultima_movimentacao::date) as dias_parado
  from public.caso_quadro q
 where q.id in (select caso_id from public.processo where numero_cnj like '0000545%');
