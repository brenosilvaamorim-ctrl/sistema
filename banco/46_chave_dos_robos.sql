-- 46_chave_dos_robos.sql — os robôs passam a se identificar
--
-- Por que: as funções de borda que rodam sozinhas (robô do DJEN, do DataJud, da
-- previdência, o aviso de prazos e o backup semanal) respondem com a chave de serviço,
-- que ignora a RLS, e não conferiam quem estava chamando. O agendador do banco as
-- chamava com a CHAVE PÚBLICA — a mesma que está escrita na página do sistema. Ou seja,
-- qualquer pessoa podia disparar os robôs: gastar API, mandar e-mail, mexer na fila.
--
-- O conserto não usa segredo novo nem nada colado à mão: nasce aqui dentro, no banco,
-- uma chave por escritório (`escritorio.robo_token`), e as tarefas agendadas passam a
-- lê-la no momento da chamada e mandá-la na URL. A função confere contra a tabela.
-- O valor nunca passa por arquivo, por tela nem por este repositório, que é público.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------ 1. a chave
alter table public.escritorio add column if not exists robo_token text;

update public.escritorio
   set robo_token = replace(gen_random_uuid()::text, '-', '')
                 || replace(gen_random_uuid()::text, '-', '')
 where robo_token is null;

create index if not exists escritorio_robo_token_ix on public.escritorio (robo_token);

-- ------------------------------------------------------------ 2. as tarefas agendadas
-- Reescreve cada tarefa que chama uma dessas funções, preservando nome, horário e tudo
-- o mais do comando: só o endereço passa a ser montado na hora, com a chave.
do $$
declare
  j   record;
  url text;
  sep text;
  novo text;
  n int := 0;
begin
  for j in
    select jobid, jobname, schedule, command
      from cron.job
     where command ~ 'functions/v1/(robo-djen|robo-datajud|robo-previdencia|aviso-prazos|backup-semanal)'
       and command not like '%robo_token%'
  loop
    url := (regexp_match(j.command, '''(https://[^'']*functions/v1/[^'']*)'''))[1];
    if url is null then
      raise notice 'tarefa % tem endereço fora do padrão; não mexi', j.jobname;
      continue;
    end if;
    sep  := case when position('?' in url) > 0 then '&' else '?' end;
    novo := replace(
      j.command,
      '''' || url || '''',
      '(' || quote_literal(url || sep || 'chave=')
          || ' || (select robo_token from public.escritorio limit 1))');
    perform cron.schedule(j.jobname, j.schedule, novo);
    n := n + 1;
    raise notice 'tarefa % atualizada', j.jobname;
  end loop;
  raise notice 'tarefas atualizadas: %', n;
end $$;

-- ------------------------------------------------------------ 3. conferência
select jobname,
       schedule,
       command like '%robo_token%'                      as manda_a_chave,
       command ~ 'functions/v1/[a-z0-9-]+'              as chama_funcao
  from cron.job
 order by jobname;
