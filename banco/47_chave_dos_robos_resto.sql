-- 47_chave_dos_robos_resto.sql — faltou uma tarefa agendada, e ela estava quebrada
--
-- O 46 só reescreveu as tarefas dos cinco robôs que eu tinha acabado de trancar. Mas o
-- `redigir-informativo` também roda por agendamento (dias úteis, 13h UTC) e já tinha sido
-- trancado antes, de manhã — com uma conferência que ainda não conhecia a chave dos robôs.
-- Resultado: desde aquela hora, essa tarefa levava 403 todo dia útil.
--
-- Aqui a reescrita passa a valer para qualquer tarefa que chame uma função de borda e
-- ainda não mande a chave, menos as que já se identificam sozinhas: a `backup-diario`, pelo
-- `backup_token` no endereço, e a `whatsapp-bot`, pelo segredo do webhook.
--
-- ATENÇÃO (aprendido no 48): só serve para tarefas cujo endereço é um texto fixo. Onde o
-- endereço é montado por concatenação, enfiar `&chave=` no fim do pedaço fixo gruda a
-- chave no que vem depois. Foi o que aconteceu com a `whatsapp-bot`.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

do $$
declare
  j    record;
  url  text;
  sep  text;
  novo text;
  n int := 0;
begin
  for j in
    select jobid, jobname, schedule, command
      from cron.job
     where command ~ 'functions/v1/[a-z0-9-]+'
       and command not like '%robo_token%'
       -- já se identificam sozinhas, e não devem ser tocadas:
       and command not like '%backup-diario%'    -- backup_token no endereço
       and command not like '%whatsapp-bot%'     -- segredo do webhook, montado por concatenação
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

-- conferência: tem de sobrar apenas a backup-diario e as que não chamam função nenhuma
select jobname,
       schedule,
       command ~ 'functions/v1/[a-z0-9-]+' as chama_funcao,
       command like '%robo_token%'         as manda_a_chave,
       command like '%backup_token%'
         or command like '%backup-diario%' as tem_chave_propria
  from cron.job
 order by chama_funcao desc, manda_a_chave, jobname;
