-- 49_chave_no_cabecalho.sql — a chave sai do endereço e vai para o cabeçalho
--
-- Faz duas coisas, nesta ordem. Rodar só este arquivo basta: ele já inclui o que o 48 fazia.
--
-- 1. DESFAZ o estrago do 47 na tarefa do `whatsapp-bot`. O endereço dela não era texto
--    fixo: era montado por concatenação, com o segredo do webhook vindo depois. O
--    `&chave=` entrou no meio e grudou a chave no segredo — e o vigia passou a responder
--    401 a cada 15 minutos. Ela nunca precisou da chave: já se identifica sozinha.
--
-- 2. TIRA a chave do endereço das demais tarefas e a põe no cabeçalho `x-chave-robo`.
--    Por que: o que viaja na URL fica escrito, em texto puro, no registro das funções —
--    qualquer um que abra os logs lê a chave. No cabeçalho, não aparece. A conferência
--    `doEscritorio` já aceitava as duas formas desde o início.
--
-- Mexe só no que reconhece. O que não casar com o padrão fica como está e sai no relatório.
-- Pode rodar de novo sem estragar nada.

do $$
declare
  j    record;
  sem  text;   -- comando com o endereço limpo
  novo text;   -- comando com a chave no cabeçalho
  n_desfeito int := 0;
  n_movido   int := 0;
  padrao_url constant text :=
    $q$\('(https://[^']*)[?&]chave=' \|\| \(select robo_token from public\.escritorio limit 1\)\)$q$;
begin
  for j in
    select jobname, schedule, command
      from cron.job
     where command like '%robo_token%'
  loop
    -- o endereço volta a ser o texto que era
    sem := regexp_replace(j.command, padrao_url, $q$'\1'$q$, 'g');
    if sem = j.command then
      raise notice 'tarefa %: não reconheci a reescrita no endereço; não mexi', j.jobname;
      continue;
    end if;

    -- a do WhatsApp para por aqui: ela não leva chave nenhuma
    if j.command like '%functions/v1/whatsapp-bot%' then
      perform cron.schedule(j.jobname, j.schedule, sem);
      n_desfeito := n_desfeito + 1;
      raise notice 'tarefa % devolvida ao que era, sem chave', j.jobname;
      continue;
    end if;

    -- nas outras, a chave entra no cabeçalho
    novo := regexp_replace(
      sem,
      $q$(headers\s*:=\s*)'([^']*)'::jsonb$q$,
      $q$\1(('\2'::jsonb) || jsonb_build_object('x-chave-robo', (select robo_token from public.escritorio limit 1)))$q$,
      'g');
    if novo = sem then
      raise notice 'tarefa %: não achei o cabeçalho; deixei a chave no endereço', j.jobname;
      continue;   -- fica como estava, que funciona
    end if;
    perform cron.schedule(j.jobname, j.schedule, novo);
    n_movido := n_movido + 1;
    raise notice 'tarefa %: chave movida para o cabeçalho', j.jobname;
  end loop;
  raise notice 'desfeitas: %, movidas: %', n_desfeito, n_movido;
end $$;

-- Conferência: o comando inteiro de cada tarefa que chama função, para ler com os olhos.
select jobname,
       schedule,
       command like '%x-chave-robo%'                     as chave_no_cabecalho,
       command ~ $q$[?&]chave='$q$                       as chave_no_endereco,
       command ~ $q$robo_token from public\.escritorio limit 1\)\)\s*\|\|$q$ as tem_coisa_depois,
       command
  from cron.job
 where command ~ 'functions/v1/[a-z0-9-]+'
 order by tem_coisa_depois desc, chave_no_endereco desc, jobname;
