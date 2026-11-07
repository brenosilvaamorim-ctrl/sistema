-- 48_desfazer_no_whatsapp.sql — eu quebrei o vigia do WhatsApp; isto desfaz
--
-- O 47 passou a reescrever QUALQUER tarefa que chamasse uma função de borda. Foi longe
-- demais: a tarefa do `whatsapp-bot` não precisava da chave dos robôs — ela já se
-- identifica com o próprio segredo do webhook — e, pior, o endereço dela não era um texto
-- fixo: era montado por concatenação, com o segredo vindo depois. Ao enfiar `&chave=` no
-- fim do pedaço fixo, o segredo foi parar colado na chave, e o `whatsapp-bot` passou a
-- responder 401 a cada 15 minutos, desde a hora em que o 47 rodou.
--
-- Aqui a reescrita é desfeita só nessa tarefa: o endereço volta a ser o texto de antes.
-- Pode rodar de novo sem estragar nada.

do $$
declare j record; novo text; n int := 0;
begin
  for j in
    select jobname, schedule, command
      from cron.job
     where command like '%functions/v1/whatsapp-bot%'
       and command like '%robo_token%'
  loop
    novo := regexp_replace(
      j.command,
      $q$\('(https://[^']*)[?&]chave=' \|\| \(select robo_token from public\.escritorio limit 1\)\)$q$,
      $q$'\1'$q$,
      'g');
    if novo = j.command then
      raise notice 'tarefa %: não reconheci a reescrita; não mexi', j.jobname;
      continue;
    end if;
    perform cron.schedule(j.jobname, j.schedule, novo);
    n := n + 1;
    raise notice 'tarefa % devolvida ao que era', j.jobname;
  end loop;
  raise notice 'tarefas desfeitas: %', n;
end $$;

-- Conferência: o comando inteiro de cada tarefa que chama uma função de borda, para eu
-- ler com os olhos e ver se alguma outra ficou com texto pendurado depois da chave.
select jobname,
       schedule,
       command like '%robo_token%' as manda_a_chave,
       command ~ $q$robo_token from public\.escritorio limit 1\)\)\s*\|\|$q$ as tem_coisa_depois,
       command
  from cron.job
 where command ~ 'functions/v1/[a-z0-9-]+'
 order by tem_coisa_depois desc, jobname;
