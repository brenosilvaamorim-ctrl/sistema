-- 61_parceria_biblioteca.sql — a biblioteca de trabalhista, para a parceria ler
--
-- O Breno pediu o Playbook e as Ementas na porta da parceria, e isto é diferente de tudo o
-- que o 44 ao 60 abriram. Até aqui a regra foi: a parceria vê **o que pendura num caso dela**.
-- Tese e precedente não penduram em caso nenhum — são biblioteca, material de consulta. Por
-- isso não dá para filtrá-los por `parceria_id`: não existe esse carimbo, e não faria sentido.
--
-- O que delimita, então, é a MATÉRIA: decisão do Breno em 09/11/2026, **só direito do trabalho**
-- (reclamante, reclamada e acidente de trabalho), que é `area = 'Trabalhista'`. O resto do
-- acervo — concursos, disciplinar, administrativo, processual civil — continua só do lado dele.
--
-- ---------------------------------------------------------------------------------------------
-- POR QUE ISTO VIRA VISÃO, E NÃO POLÍTICA NA TABELA
--
-- Porque o problema aqui é de COLUNA, não de linha. Três campos guardam de onde o verbete veio,
-- e o que eles guardam é nome de cliente de caso que não é da parceria:
--
--   tese.origem        → de qual peça a tese foi extraída: via de regra "Inicial.", o NOME
--                         DO CLIENTE e o do réu, mais a data do protocolo
--   precedente.origem  → o mesmo, para o julgado: peça, nome do cliente, parte contrária
--   precedente.citacao → trecho da peça em que o julgado foi citado, copiado de caso real
--
-- (Os exemplos não vão escritos aqui, e é por isto mesmo: este repositório é público.)
--
-- Medido no banco antes de escrever isto: 136 de 136 precedentes têm `origem` preenchida, e as
-- distintas são quase todas nome de pessoa. Abrir a tabela com uma política deixaria esses
-- campos ao alcance de quem chamar a API direto — a tela não mostrar não é proteção.
--
-- RLS filtra linha; não esconde coluna. O que esconde coluna é a visão não trazer a coluna.
-- Por isso: nenhuma política nova em `tese`, `playbook` ou `precedente` — a parceira continua
-- sem alcançar as três tabelas —, e três visões que trazem só o que pode sair.
--
-- ATENÇÃO, e é o contrário do que o 44 corrigiu: estas visões são DE PROPÓSITO sem
-- `security_invoker`. Rodam com o privilégio do dono, porque é isso que as faz atravessar a RLS
-- das tabelas-base, que nega a parceira. Quem protege aqui é o WHERE de cada uma, e só ele.
-- As sete visões do 44 vazavam por serem assim SEM querer e SEM WHERE nenhum. Logo:
--
--   * não acrescente coluna a estas visões sem olhar o que ela guarda;
--   * não tire o WHERE, nem o afrouxe;
--   * se um dia a parceria for a mais de uma área, mude o WHERE — não a política.
--
-- O WHERE falha fechado: sem parceria ativa, `minha_parceria()` devolve nulo, a subconsulta
-- devolve nulo, a comparação dá nulo e não vem linha nenhuma.
--
-- É só leitura. Ensinar peça ao banco, fila de aprovação e carteira de revisão continuam do
-- lado do escritório: o acervo é dele, e quem decide o que entra nele é ele.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o index.html da parceria que usa as visões.
-- Pode rodar de novo sem estragar nada.

-- O escritório da minha parceria, se ela estiver ativa. Nulo em qualquer outro caso.
create or replace function public.escritorio_da_minha_parceria() returns uuid
language sql stable security definer set search_path = public as $$
  select p.escritorio_id
    from public.parceria p
   where p.id = public.minha_parceria()
     and p.ativa
   limit 1
$$;
grant execute on function public.escritorio_da_minha_parceria() to authenticated;

comment on function public.escritorio_da_minha_parceria() is
  'Escritório dono da parceria de quem está logado, se a parceria estiver ativa; nulo fora disso. Guarda das visões da biblioteca (banco/61).';

-- ------------------------------------------------------------------ teses de trabalhista
drop view if exists public.tese_trabalhista;
create view public.tese_trabalhista as
select t.id, t.area, t.codigo, t.titulo, t.rubrica, t.gatilho,
       t.texto_base, t.pedido_modelo, t.provas
  from public.tese t
 where t.escritorio_id = public.escritorio_da_minha_parceria()
   and t.area = 'Trabalhista'
   and t.ativo
   and t.codigo not like '\_%';   -- os códigos _sistema_ não são tese de direito

comment on view public.tese_trabalhista is
  'Biblioteca de teses trabalhistas para a porta da parceria (banco/61). SEM security_invoker de propósito: o WHERE é a única guarda. NÃO expõe tese.origem, que nomeia cliente de caso alheio.';

-- --------------------------------------------------------------- playbook de trabalhista
drop view if exists public.playbook_trabalhista;
create view public.playbook_trabalhista as
select p.id, p.area, p.tema, p.tese, p.quando_usar, p.texto_padrao,
       p.contra, p.fundamento, p.ordem, p.tese_id
  from public.playbook p
 where p.escritorio_id = public.escritorio_da_minha_parceria()
   and p.area = 'Trabalhista'
   and p.ativo;

comment on view public.playbook_trabalhista is
  'Textos prontos de trabalhista para a porta da parceria (banco/61). SEM security_invoker de propósito: o WHERE é a única guarda.';

-- ------------------------------------------------------------ ementas (precedentes) dela
-- O precedente não tem área: tem `tese_codigo`. A matéria vem da tese a que ele se amarra —
-- e, medido, todos os 136 têm esse código preenchido.
drop view if exists public.precedente_trabalhista;
create view public.precedente_trabalhista as
select r.id, r.tribunal, r.tipo_recurso, r.numero, r.relator, r.orgao,
       r.julgamento, r.publicacao, r.tema, r.ementa, r.tese_codigo,
       r.confirmado, r.link, r.autoridade, r.situacao, r.verificado_em
  from public.precedente r
 where r.escritorio_id = public.escritorio_da_minha_parceria()
   and exists (select 1 from public.tese t
                where t.escritorio_id = r.escritorio_id
                  and t.codigo = r.tese_codigo
                  and t.area = 'Trabalhista');

comment on view public.precedente_trabalhista is
  'Ementas de trabalhista para a porta da parceria (banco/61). SEM security_invoker de propósito: o WHERE é a única guarda. NÃO expõe precedente.origem nem precedente.citacao, que vêm de peça de caso alheio.';

-- ------------------------------------------------------------------------------- acesso
-- Só para quem está logado. `anon` é a chave que está na página, e não entra aqui.
grant select on public.tese_trabalhista       to authenticated;
grant select on public.playbook_trabalhista   to authenticated;
grant select on public.precedente_trabalhista to authenticated;

revoke all on public.tese_trabalhista       from anon;
revoke all on public.playbook_trabalhista    from anon;
revoke all on public.precedente_trabalhista  from anon;

-- ------------------------------------------------------------------------------ conferir
-- Com o login do Breno (que também é membro titular da parceria), as três têm de responder.
-- Com a chave pública e sem login, nenhuma responde.
--
--   select count(*) from public.tese_trabalhista;         -- esperado: 88
--   select count(*) from public.playbook_trabalhista;     -- esperado: 40
--   select count(*) from public.precedente_trabalhista;   -- os amarrados a tese trabalhista
--
-- E a prova de que a coluna ficou de fora — as três têm de dar erro de coluna inexistente:
--   select origem  from public.tese_trabalhista;
--   select origem  from public.precedente_trabalhista;
--   select citacao from public.precedente_trabalhista;
