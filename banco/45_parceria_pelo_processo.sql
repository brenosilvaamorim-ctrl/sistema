-- 45_parceria_pelo_processo.sql — o carimbo também desce pelo processo
--
-- O que faltou na 44: o gatilho parceria_guarda herdava o carimbo da parceria
-- apenas pelo caso_id da linha. Serve para quase tudo, mas não para a publicação.
--
-- O robô do DJEN casa a intimação pelo número do processo e grava caso_id a
-- partir do caso daquele processo (funcoes/robo-djen.ts). Quando o processo não
-- tem caso — e a tela da parceria deixa cadastrar processo sem caso, de
-- propósito —, caso_id fica nulo, a intimação nasce sem carimbo e some da vista
-- da parceira, embora seja do processo dela. O mesmo valia para o prazo e para o
-- evento que o robô cria junto.
--
-- Agora a herança tenta o caso e, não havendo, o processo. Vale para intimacao,
-- prazo e evento, que são as três tabelas com processo_id.

create or replace function public.parceria_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pai uuid;
begin
  if tg_op = 'INSERT' then
    if new.parceria_id is null then
      v_pai := (to_jsonb(new) ->> 'caso_id')::uuid;
      if v_pai is not null then
        select parceria_id into new.parceria_id from public.caso where id = v_pai;
      end if;
    end if;
    -- sem caso, ou caso sem parceria: tenta pelo processo
    if new.parceria_id is null then
      v_pai := (to_jsonb(new) ->> 'processo_id')::uuid;
      if v_pai is not null then
        select parceria_id into new.parceria_id from public.processo where id = v_pai;
      end if;
    end if;
    if new.escritorio_id is null and new.parceria_id is not null then
      select escritorio_id into new.escritorio_id from public.parceria where id = new.parceria_id;
    end if;
    -- O quadro de casos do escritório agrupa por etapa e descarta quem não tem
    -- nenhuma: um caso aberto pela porta da parceria ficaria invisível lá. Ele
    -- entra na primeira etapa, como qualquer caso novo.
    if tg_table_name = 'caso' and new.parceria_id is not null and new.coluna_id is null then
      select id into new.coluna_id from public.coluna_caso
       where escritorio_id = new.escritorio_id order by ordem limit 1;
    end if;
  elsif old.parceria_id is not null and public.sou_parceira() then
    -- a condição do carimbo vem antes de propósito: linha sem parceria a
    -- parceira nem enxerga, e assim a alteração comum não paga duas consultas.
    new.escritorio_id := old.escritorio_id;
  end if;
  return new;
end $$;

-- ------------------------------------------------- marcar o caso alcança mais
-- Pelo mesmo motivo: parceria_marcar_caso carimbava a publicação, o prazo e o
-- evento que apontam para o caso. Os que apontam só para o processo ficavam de
-- fora — e é assim que o robô grava quando o processo não tem caso.
create or replace function public.parceria_marcar_caso(p_caso uuid, p_parceria uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cliente uuid;
begin
  if not exists (select 1 from public.caso where id = p_caso and escritorio_id = meu_escritorio()) then
    raise exception 'caso não é deste escritório';
  end if;
  if p_parceria is not null
     and not exists (select 1 from public.parceria where id = p_parceria and escritorio_id = meu_escritorio()) then
    raise exception 'parceria não é deste escritório';
  end if;

  select cliente_id into v_cliente from public.caso where id = p_caso;

  update public.caso       set parceria_id = p_parceria where id = p_caso;
  update public.processo   set parceria_id = p_parceria where caso_id = p_caso;
  update public.lancamento set parceria_id = p_parceria where caso_id = p_caso;
  update public.lead       set parceria_id = p_parceria where caso_id = p_caso;

  /* pelo caso ou pelo processo do caso: o robô grava de um jeito ou de outro,
     conforme o processo tenha caso amarrado ou não */
  update public.evento    set parceria_id = p_parceria
   where caso_id = p_caso or processo_id in (select id from public.processo where caso_id = p_caso);
  update public.prazo     set parceria_id = p_parceria
   where caso_id = p_caso or processo_id in (select id from public.processo where caso_id = p_caso);
  update public.intimacao set parceria_id = p_parceria
   where caso_id = p_caso or processo_id in (select id from public.processo where caso_id = p_caso);

  if v_cliente is not null then
    if p_parceria is not null then
      update public.cliente set parceria_id = p_parceria where id = v_cliente;
    elsif not exists (select 1 from public.caso
                       where cliente_id = v_cliente and parceria_id is not null and id <> p_caso) then
      update public.cliente set parceria_id = null where id = v_cliente;
    end if;
  end if;
end $$;

-- ------------------------------------------------------------ o que já existe
-- Se algum processo já tiver sido posto na parceria antes desta correção, as
-- publicações, prazos e eventos dele que ficaram sem carimbo passam a tê-lo.
update public.intimacao i set parceria_id = p.parceria_id
  from public.processo p
 where p.id = i.processo_id and p.parceria_id is not null and i.parceria_id is null;

update public.prazo z set parceria_id = p.parceria_id
  from public.processo p
 where p.id = z.processo_id and p.parceria_id is not null and z.parceria_id is null;

update public.evento e set parceria_id = p.parceria_id
  from public.processo p
 where p.id = e.processo_id and p.parceria_id is not null and e.parceria_id is null;

-- ------------------------------------------------------------ conferência
--   select count(*) from intimacao i join processo p on p.id = i.processo_id
--    where p.parceria_id is not null and i.parceria_id is null;   -- deve dar 0
