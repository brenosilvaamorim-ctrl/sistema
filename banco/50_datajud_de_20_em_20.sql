-- 50_datajud_de_20_em_20.sql — uma tarefa só, a cada 20 minutos
--
-- Medido em 08/11/2026: cada rodada vence de 3 a 4 processos em ~115 segundos, porque a API
-- pública do CNJ leva de 30 a 42 segundos por consulta quando responde. Com as três
-- execuções diárias que havia, isso dava ~10 processos por dia — e 290 processos
-- monitorados levavam mais de um mês para dar a volta. Não é andamento; é amostragem.
--
-- O gargalo é do CNJ e não há como apressá-lo. O que está na nossa mão é a frequência:
-- cada execução é uma janela nova, e a fila é ordenada pelo mais desatualizado primeiro.
-- A cada 20 minutos são 72 janelas por dia, ~250 processos: a volta completa cai para
-- cerca de um dia.
--
-- Não é mais agressivo com o CNJ: o total diário de consultas fica parecido com o de hoje,
-- só que espalhado em vez de concentrado em três rajadas — o que é mais educado, não menos.
--
-- As três tarefas viram uma. O comando é o da `robo-datajud-1`, que já manda a chave dos
-- robôs no cabeçalho; nada do endereço muda.
--
-- Para voltar atrás: desagendar 'robo-datajud' e reagendar as três com '0 4 * * *',
-- '0 5 * * *' e '0 6 * * *'.

do $$
declare cmd text; n int := 0;
begin
  select command into cmd from cron.job where jobname = 'robo-datajud-1';
  if cmd is null then raise exception 'não achei a tarefa robo-datajud-1'; end if;

  perform cron.schedule('robo-datajud', '*/20 * * * *', cmd);
  raise notice 'tarefa robo-datajud agendada de 20 em 20 minutos';

  for n in 1..3 loop
    perform cron.unschedule('robo-datajud-' || n)
      where exists (select 1 from cron.job where jobname = 'robo-datajud-' || n);
    raise notice 'tarefa robo-datajud-% desagendada', n;
  end loop;
end $$;

select jobname, schedule, active,
       command like '%x-chave-robo%' as manda_a_chave
  from cron.job
 where command ~ 'functions/v1/robo-datajud'
 order by jobname;
