-- 41_previdenciario_robo_fontes.sql — o robô da previdência passa a ler uma fonte por chamada
--
-- Ler as quatro fontes de uma vez estourava o limite de tempo das funções do Supabase.
-- Agora cada chamada lê uma (?fonte=...), e a segunda de manhã tem quatro horários seguidos.

do $$
declare f text; m int := 0;
begin
  perform cron.unschedule(jobname) from cron.job where jobname like 'robo-previdencia%';
  foreach f in array array['ibge','dou','cnj','cjf'] loop
    perform cron.schedule('robo-previdencia-' || f, m || ' 10 * * 1', format($c$
      select net.http_get(
        url := 'https://wrdfyudabvvpvfcrvvzd.supabase.co/functions/v1/robo-previdencia?fonte=%s',
        headers := '{"apikey": "sb_publishable_EfdAshQdw1P1-lAXtlO9Hw_O8yoP3y5"}'::jsonb,
        timeout_milliseconds := 150000);
    $c$, f));
    m := m + 5;
  end loop;
end $$;

-- a primeira rodada, feita antes desta mudança, ficou aberta: encerra como falha
update public.prev_robo_execucao set terminado_em = now(), ok = false
 where terminado_em is null and iniciado_em < now() - interval '10 minutes';
