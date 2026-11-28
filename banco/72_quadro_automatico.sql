-- 72_quadro_automatico.sql — o cartão do caso anda sozinho no quadro
--
-- O quadro de Casos só mudava quando alguém arrastava o cartão, e o cartão ficava
-- para trás: audiência marcada com o caso ainda em "Em atendimento", recurso subindo
-- com o caso parado em "Aguardando audiência". Aqui o próprio banco move o cartão
-- quando acontece o que muda a fase do caso, venha de onde vier — da Agenda, da tela
-- do caso, da Captação, do robô do DJEN ou do DataJud:
--
--   caso criado sem coluna (fechou na Captação, por ex.) .. Iniciais/contestações pendentes
--   prazo de contestação lançado ......................... Iniciais/contestações pendentes
--   processo cadastrado no caso (protocolou), sem
--     contestação pendente; ou contestação cumprida ........ Em atendimento
--   audiência marcada no caso ............................ Aguardando audiência
--   audiência realizada ou cancelada, sem outra pendente .. volta a Em atendimento
--   fase do processo posta em "recurso", ou movimentação
--     de recurso interposto/recebido ou remessa ao tribunal  Em recurso
--   recurso decidido (fase volta a "conhecimento", ou
--     movimentação de provimento, acórdão, não conhecimento) volta a Em atendimento
--     (ou a Aguardando audiência, se ainda houver audiência marcada)
--   fase "execução", processo de cumprimento de sentença,
--     ou movimentação de início da execução ................ Execução
--   caso encerrado, ou todos os processos arquivados,
--     ou movimentação de arquivamento definitivo ............ Encerrado
--   caso reaberto ......................................... volta a Em atendimento
--
-- A regra de ouro: o automático só anda PARA A FRENTE na ordem
--   Prospecção (0) < Iniciais (1) < Em atendimento (2) < Aguardando audiência (3)
--   < Em recurso (4) < Execução (5) < Encerrado (6).
-- Uma audiência de conciliação marcada na execução não puxa o caso de volta para
-- "Aguardando audiência". As únicas voltas são as três marcadas "volta" acima, e cada
-- uma só acontece se o caso estiver exatamente na coluna de onde ela volta. Arrastar à
-- mão continua valendo sempre: o banco não desfaz o que você moveu.
--
-- Cada movimento automático deixa no caso a data e o motivo (quadro_auto_em,
-- quadro_auto_motivo), que o cartão mostra por alguns dias como "movido pelo sistema",
-- para ninguém estranhar um cartão que mudou de lugar sozinho. Quando alguém move o
-- cartão à mão, a marca some. A mudança também fica no histórico (gatilho aud_caso).
--
-- As colunas são achadas pelo nome (sem acento, sem maiúscula), não pelo id: se uma
-- coluna for renomeada sem a palavra-chave, aquele movimento simplesmente para de
-- acontecer, sem erro.
--
-- Movimentações do tribunal só contam se forem dos últimos 30 dias: na primeira
-- sincronização de um processo o robô traz anos de histórico de uma vez, e um recurso
-- de 2023 já julgado não pode mandar o caso para "Em recurso" hoje.

alter table public.caso
  add column if not exists quadro_auto_em     timestamptz,
  add column if not exists quadro_auto_motivo text;

comment on column public.caso.quadro_auto_em is
  'Quando o banco moveu o cartão sozinho pela última vez (banco/72). Some quando alguém move à mão.';
comment on column public.caso.quadro_auto_motivo is
  'Por que o banco moveu o cartão, em poucas palavras, para o cartão mostrar.';

-- ---------------------------------------------------------------- colunas e ordem
create or replace function public.quadro_chave_coluna(nome text)
returns text language sql immutable as $$
  select case
    when n ~ 'encerrad'                    then 'encerrado'
    when n ~ 'execu'                       then 'execucao'
    when n ~ 'recurso'                     then 'recurso'
    when n ~ 'audiencia'                   then 'audiencia'
    when n ~ 'atendimento'                 then 'atendimento'
    when n ~ 'inicia|contesta'             then 'iniciais'
    when n ~ 'prospec'                     then 'prospeccao'
  end
  from (select lower(public.sem_acento(coalesce(nome, ''))) as n) x
$$;

create or replace function public.quadro_nivel(chave text)
returns integer language sql immutable as $$
  select case chave
    when 'prospeccao'  then 0 when 'iniciais'  then 1
    when 'atendimento' then 2 when 'audiencia' then 3
    when 'recurso'     then 4 when 'execucao'  then 5
    when 'encerrado'   then 6 end
$$;

create or replace function public.quadro_coluna(p_esc uuid, p_chave text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from coluna_caso
   where escritorio_id = p_esc and public.quadro_chave_coluna(nome) = p_chave
   order by ordem limit 1
$$;

-- Move o caso para a coluna da chave. Sem "so_se_em", só anda para a frente; com ele,
-- é uma volta, e só acontece se o caso estiver naquela coluna.
create or replace function public.quadro_mover(p_caso uuid, p_chave text, p_motivo text, p_so_se_em text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_esc uuid; v_atual uuid; v_chave_atual text; v_destino uuid;
begin
  if p_caso is null then return; end if;
  select c.escritorio_id, c.coluna_id, public.quadro_chave_coluna(col.nome)
    into v_esc, v_atual, v_chave_atual
    from caso c left join coluna_caso col on col.id = c.coluna_id
   where c.id = p_caso;
  if v_esc is null then return; end if;

  v_destino := public.quadro_coluna(v_esc, p_chave);
  if v_destino is null or v_destino = v_atual then return; end if;

  if p_so_se_em is not null then
    if v_chave_atual is distinct from p_so_se_em then return; end if;
  elsif coalesce(public.quadro_nivel(v_chave_atual), 0) >= public.quadro_nivel(p_chave) then
    return;
  end if;

  -- a marca avisa o gatilho quadro_caso_mao de que este movimento não foi à mão
  perform set_config('quadro.auto', '1', true);
  update caso set coluna_id = v_destino, ordem = null, atualizado_em = now(),
                  quadro_auto_em = now(), quadro_auto_motivo = p_motivo
   where id = p_caso;
  perform set_config('quadro.auto', '', true);
end $$;

-- Volta para "Em atendimento" a partir de uma coluna; mas se ainda houver audiência marcada
-- no caso, o lugar dele é "Aguardando audiência", e é para lá que vai.
create or replace function public.quadro_voltar(p_caso uuid, p_de text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.quadro_mover(p_caso, 'atendimento', p_motivo, p_de);
  if exists (select 1 from evento e where e.caso_id = p_caso and e.tipo = 'audiencia'
              and e.situacao not in ('concluida', 'cancelada') and e.inicio >= now() - interval '1 day') then
    perform public.quadro_mover(p_caso, 'audiencia', p_motivo || '; há audiência marcada');
  end if;
end $$;

-- Funções da primeira versão deste arquivo, com outra assinatura: saem para não sobrar duas.
drop function if exists public.quadro_mover(uuid, text, text);
drop function if exists public.quadro_voltar(uuid, text);

-- ---------------------------------------------------------------- o caso em si
-- Caso que nasce sem coluna sumiria do quadro, que agrupa por coluna. Entra em
-- "Iniciais/contestações pendentes" (ou, se ela não existir, na primeira coluna).
create or replace function public.quadro_caso_novo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.coluna_id is null then
    new.coluna_id := coalesce(public.quadro_coluna(new.escritorio_id, 'iniciais'),
      (select id from coluna_caso where escritorio_id = new.escritorio_id order by ordem limit 1));
  end if;
  return new;
end $$;

drop trigger if exists quadro_caso_novo on public.caso;
create trigger quadro_caso_novo before insert on public.caso
  for each row execute function public.quadro_caso_novo();

-- Movida à mão apaga a marca de "movido pelo sistema".
create or replace function public.quadro_caso_mao()
returns trigger language plpgsql as $$
begin
  if new.coluna_id is distinct from old.coluna_id
     and coalesce(current_setting('quadro.auto', true), '') <> '1' then
    new.quadro_auto_em := null; new.quadro_auto_motivo := null;
  end if;
  return new;
end $$;

drop trigger if exists quadro_caso_mao on public.caso;
create trigger quadro_caso_mao before update of coluna_id on public.caso
  for each row execute function public.quadro_caso_mao();

create or replace function public.quadro_caso_encerrado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.encerrado_em is null and new.encerrado_em is not null then
    perform public.quadro_mover(new.id, 'encerrado', 'caso encerrado');
  elsif old.encerrado_em is not null and new.encerrado_em is null then
    perform public.quadro_voltar(new.id, 'encerrado', 'caso reaberto');
  end if;
  return null;
end $$;

drop trigger if exists quadro_caso_encerrado on public.caso;
create trigger quadro_caso_encerrado after update of encerrado_em
  on public.caso for each row execute function public.quadro_caso_encerrado();

-- ---------------------------------------------------------------- audiências
create or replace function public.quadro_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_caso uuid;
begin
  if tg_op = 'DELETE' then v_caso := old.caso_id; else v_caso := new.caso_id; end if;
  if v_caso is null then return null; end if;

  if tg_op <> 'DELETE' and new.tipo = 'audiencia'
     and new.situacao not in ('concluida', 'cancelada')
     and new.inicio >= now() - interval '1 day' then
    perform public.quadro_mover(v_caso, 'audiencia', 'audiência marcada para ' || to_char(new.inicio at time zone 'America/Recife', 'DD/MM'));
    return null;
  end if;

  -- audiência saiu (baixa, cancelamento, troca de tipo, apagada): volta se não sobrou outra
  if (tg_op = 'DELETE' and old.tipo = 'audiencia')
     or (tg_op = 'UPDATE' and old.tipo = 'audiencia') then
    if not exists (select 1 from evento e
                    where e.caso_id = v_caso and e.tipo = 'audiencia'
                      and e.situacao not in ('concluida', 'cancelada')
                      and e.inicio >= now() - interval '1 day') then
      perform public.quadro_mover(v_caso, 'atendimento',
        case when tg_op = 'UPDATE' and new.situacao = 'concluida' then 'audiência realizada' else 'audiência desmarcada' end,
        'audiencia');
    end if;
  end if;
  return null;
end $$;

drop trigger if exists quadro_evento on public.evento;
create trigger quadro_evento after insert or delete or update of tipo, situacao, caso_id, inicio
  on public.evento for each row execute function public.quadro_evento();

-- ---------------------------------------------------------------- prazos de contestação
-- Contestação pendente põe o caso em "Iniciais/contestações pendentes" (só a partir de
-- Prospecção: caso que já anda não volta). Cumprida a última, ele segue para "Em atendimento".
create or replace function public.quadro_prazo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.caso_id is null or public.sem_acento(coalesce(new.descricao, '')) !~ 'contestac' then return null; end if;
  if new.situacao in ('sugerido', 'confirmado') then
    perform public.quadro_mover(new.caso_id, 'iniciais', 'prazo de contestação até ' || to_char(new.data_fatal, 'DD/MM'));
  elsif new.situacao = 'cumprido' and not exists (
      select 1 from prazo p where p.caso_id = new.caso_id and p.id <> new.id
         and p.situacao in ('sugerido', 'confirmado') and public.sem_acento(p.descricao) ~ 'contestac') then
    perform public.quadro_mover(new.caso_id, 'atendimento', 'contestação protocolada', 'iniciais');
  end if;
  return null;
end $$;

drop trigger if exists quadro_prazo on public.prazo;
create trigger quadro_prazo after insert or update of situacao, caso_id, descricao
  on public.prazo for each row execute function public.quadro_prazo();

-- ---------------------------------------------------------------- processo
create or replace function public.quadro_processo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.caso_id is null then return null; end if;

  -- Processo cadastrado no caso: a inicial foi protocolada. Se for o cliente que se
  -- defende e a contestação ainda estiver aberta, espera ela ser cumprida (ver quadro_prazo).
  if (tg_op = 'INSERT' or old.caso_id is distinct from new.caso_id)
     and not exists (select 1 from prazo p where p.caso_id = new.caso_id
                       and p.situacao in ('sugerido', 'confirmado') and public.sem_acento(p.descricao) ~ 'contestac') then
    perform public.quadro_mover(new.caso_id, 'atendimento', 'processo cadastrado');
  end if;

  if new.fase = 'recurso' then
    perform public.quadro_mover(new.caso_id, 'recurso', 'fase do processo: recurso');
  elsif new.fase = 'execucao'
     or (tg_op = 'INSERT' and public.sem_acento(coalesce(new.classe, '')) ~ 'cumprimento de senten|execuc') then
    perform public.quadro_mover(new.caso_id, 'execucao', 'fase do processo: execução');
  elsif new.fase = 'arquivado' then
    if not exists (select 1 from processo p where p.caso_id = new.caso_id and p.fase <> 'arquivado') then
      perform public.quadro_mover(new.caso_id, 'encerrado', 'processos arquivados');
    end if;
  elsif tg_op = 'UPDATE' and old.fase = 'recurso' and new.fase = 'conhecimento' then
    perform public.quadro_voltar(new.caso_id, 'recurso', 'recurso decidido');
  end if;
  return null;
end $$;

drop trigger if exists quadro_processo on public.processo;
create trigger quadro_processo after insert or update of fase, caso_id
  on public.processo for each row execute function public.quadro_processo();

-- ---------------------------------------------------------------- movimentações do tribunal
create or replace function public.quadro_movimentacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_caso uuid; d text;
begin
  if new.data < now() - interval '30 days' then return null; end if;
  select caso_id into v_caso from processo where id = new.processo_id;
  if v_caso is null then return null; end if;
  d := public.sem_acento(coalesce(new.descricao, '') || ' ' || coalesce(new.complementos::text, ''));

  if d ~ 'arquivamento definitivo|baixa definitiva|arquivad[oa]s? definitivamente' then
    perform public.quadro_mover(v_caso, 'encerrado', 'arquivamento definitivo');
  elsif d ~ 'cumprimento de senten|inicio da execuc|execucao (definitiva|provisoria)|liquidacao de senten' then
    perform public.quadro_mover(v_caso, 'execucao', 'início da execução');
  elsif d ~ '(recurso|apelacao).{0,40}(interpost|recebid)|(interpost|recebid)[oa]s? .{0,25}(recurso|apelacao)|interposicao de (recurso|apelacao)|remessa.{0,40}(tribunal|instancia superior|2. grau|segundo grau|turma recursal)' then
    -- só sobe se não houver julgamento de recurso registrado depois desta movimentação
    if not exists (select 1 from movimentacao m where m.processo_id = new.processo_id and m.data > new.data
                    and public.sem_acento(m.descricao) ~ 'provimento|provido|acordao|nao conhecid|recurso.{0,30}julgad') then
      perform public.quadro_mover(v_caso, 'recurso', 'recurso no tribunal');
    end if;
  elsif d ~ 'provimento|provido|acordao|nao conhecid|recurso.{0,30}julgad' then
    perform public.quadro_voltar(v_caso, 'recurso', 'recurso julgado');
  end if;
  return null;
end $$;

drop trigger if exists quadro_movimentacao on public.movimentacao;
create trigger quadro_movimentacao after insert
  on public.movimentacao for each row execute function public.quadro_movimentacao();

comment on function public.quadro_mover(uuid, text, text, text) is
  'Move o caso no quadro (ver banco/72). Sem p_so_se_em só avança; com ele, volta só a partir daquela coluna.';
