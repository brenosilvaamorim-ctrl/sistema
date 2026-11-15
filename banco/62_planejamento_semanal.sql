-- 62_planejamento_semanal.sql — o plano da semana, todo domingo
--
-- O Breno pediu, em 15/11/2026, que todo domingo houvesse um planejamento da semana que
-- começa, feito com o que o sistema já sabe. O aviso diário de prazos lista o que vence; isto
-- vai um passo além: junta prazos, agenda, publicações a conferir, prescrições, casos parados,
-- minutas em rascunho, leads sem retorno, dinheiro a receber e projetos, e pede ao Claude que
-- arrume tudo em dias, com o que não pode escorregar destacado e o que dá para adiantar.
--
-- Quem monta é a função `planejamento-semanal` (funcoes/planejamento-semanal.ts). Ela grava
-- aqui, manda por e-mail e a tela mostra no Início. Cada item do plano tem um id curto; marcar
-- "feito" na tela guarda o id em `feitos`. No domingo seguinte, o que ficou sem marcar volta
-- para a função como "ficou da semana passada" — é isso que faz o plano ter memória.
--
-- Uma linha por escritório e por semana (`semana_de` é a segunda-feira). Refazer o plano no
-- meio da semana substitui a linha: os itens mudam, então as marcações daquela versão somem.
--
-- O agendamento copia o comando da tarefa do `aviso-prazos`, que já manda a chave dos robôs no
-- cabeçalho, e só troca o nome da função. Assim a chave continua sem aparecer em lugar nenhum.
-- Horário: domingo, 21h UTC = 18h em Petrolina (sem horário de verão).
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o index.html que mostra o plano.
-- Pode rodar de novo sem estragar nada.

create table if not exists public.planejamento (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorio(id) on delete cascade,
  semana_de     date not null,                       -- a segunda-feira da semana planejada
  inicio        date not null,                       -- primeiro dia coberto (amanhã, se for domingo)
  fim           date not null,                       -- domingo que fecha a semana
  plano         jsonb not null default '{}'::jsonb,  -- {resumo, alertas[], dias[], adiantar[]}
  dados         jsonb not null default '{}'::jsonb,  -- contagens do que foi lido, para conferência
  feitos        text[] not null default '{}',        -- ids dos itens marcados como feitos
  modelo        text,
  email         text,                                -- resultado do envio: status do Resend ou motivo
  gerado_em     timestamptz not null default now(),
  unique (escritorio_id, semana_de)
);

alter table public.planejamento enable row level security;

drop policy if exists planejamento_escritorio on public.planejamento;
create policy planejamento_escritorio on public.planejamento as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

-- O agendamento
do $$
declare cmd text;
begin
  select command into cmd
    from cron.job
   where command like '%functions/v1/aviso-prazos%'
   order by jobid
   limit 1;
  if cmd is null then
    raise exception 'não achei a tarefa do aviso-prazos para copiar o comando';
  end if;
  if cmd not like '%x-chave-robo%' then
    raise exception 'a tarefa do aviso-prazos não manda a chave no cabeçalho; rode o 49 antes';
  end if;

  cmd := replace(cmd, 'functions/v1/aviso-prazos', 'functions/v1/planejamento-semanal');
  perform cron.schedule('planejamento-semanal', '0 21 * * 0', cmd);
  raise notice 'tarefa planejamento-semanal agendada: domingo, 18h de Petrolina';
end $$;

-- Conferência: deve sair uma linha, com a chave no cabeçalho.
select jobname, schedule, active,
       command like '%x-chave-robo%' as manda_a_chave,
       command
  from cron.job
 where jobname = 'planejamento-semanal';
