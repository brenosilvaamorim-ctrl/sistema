-- 74_rls_rapido.sql — as regras de acesso (RLS) param de rodar funções linha a linha
--
-- O sistema ficou lento em qualquer clique. A causa está nas regras de acesso: quase todas
-- têm a forma "escritorio_id = meu_escritorio()", e muitas, desde a parceria (banco/44),
-- também "... or parceria_id = minha_parceria()". Escritas assim, o Postgres executa a função
-- UMA VEZ PARA CADA LINHA que lê. meu_escritorio() é uma consulta à tabela de usuários;
-- minha_parceria() é uma junção que compara e-mails em minúsculas. Numa leitura de milhares
-- de movimentações ou intimações, são milhares dessas consultas escondidas, em toda tela. A
-- visão do quadro de Casos (caso_quadro) multiplica o estrago: para cada caso, ela lê
-- processos, prazos, movimentações e intimações, e cada uma dessas leituras paga a conta.
--
-- A correção é a que o próprio Supabase recomenda: envolver a chamada em (select ...). Aí o
-- Postgres calcula o valor uma vez por consulta e reaproveita. O resultado é o mesmo, porque
-- essas funções só dependem de quem está logado, não da linha: ninguém passa a ver nada que
-- não via, nem deixa de ver o que via.
--
-- Em vez de reescrever as regras à mão (o retrato em estrutura-atual.sql pode estar atrás do
-- banco), este arquivo lê as regras como estão AGORA, em pg_policies, e só troca o texto das
-- chamadas. Funções que recebem a linha como argumento não são tocadas. Pode rodar de novo:
-- o que já está embrulhado fica como está. Só mexe no esquema public (o storage do Supabase
-- pertence a outro usuário e suas tabelas são pequenas).

do $$
declare
  r record;
  -- funções sem argumento que só dependem do usuário logado
  fn constant text := '(?<!SELECT )\m((auth|public)\.)?(uid|jwt|meu_escritorio|meu_perfil|sou_advogado|vejo_financeiro|sou_parceira|minha_parceria|minha_familia)\(\)';
  -- pode('chave'): o argumento é uma constante, não a linha
  fp constant text := '(?<!SELECT )\m((public\.)?pode\(''[a-z_]+''::text\))';
  novo_q text; novo_c text; comando text; n int := 0;
begin
  for r in select schemaname, tablename, policyname, qual, with_check
             from pg_policies where schemaname = 'public' loop
    novo_q := r.qual; novo_c := r.with_check;
    if novo_q is not null then
      novo_q := regexp_replace(novo_q, fn, '( SELECT \1\3() )', 'g');
      novo_q := regexp_replace(novo_q, fp, '( SELECT \1 )', 'g');
    end if;
    if novo_c is not null then
      novo_c := regexp_replace(novo_c, fn, '( SELECT \1\3() )', 'g');
      novo_c := regexp_replace(novo_c, fp, '( SELECT \1 )', 'g');
    end if;
    if novo_q is distinct from r.qual or novo_c is distinct from r.with_check then
      comando := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      if novo_q is not null then comando := comando || ' using (' || novo_q || ')'; end if;
      if novo_c is not null then comando := comando || ' with check (' || novo_c || ')'; end if;
      execute comando;
      n := n + 1;
    end if;
  end loop;
  raise notice 'Regras de acesso reescritas: %', n;
end $$;

-- A visão do quadro procura as intimações de cada caso pelo caso e pelo processo; nenhuma das
-- duas colunas tinha índice.
create index if not exists intimacao_caso_idx     on public.intimacao(caso_id)     where caso_id is not null;
create index if not exists intimacao_processo_idx on public.intimacao(processo_id) where processo_id is not null;
