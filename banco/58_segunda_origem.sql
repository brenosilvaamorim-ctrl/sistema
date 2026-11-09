-- 58_segunda_origem.sql — um atendimento pode ter vindo por dois caminhos
--
-- Pedido do Breno em 09/11/2026, com a razão junto: "farei captação em parceria com a Paula
-- no Google Ads. Nesse caso, marcarei google e paula para identificar melhor."
--
-- Ele está certo, e o motivo é que a lista de origens hoje mistura duas perguntas
-- diferentes: **por onde a pessoa chegou** (Google Ads, Instagram, Site, WhatsApp) e **quem
-- a mandou** (Paula, Mario, Elvis, indicação de cliente). Com um campo só, marcar "Google
-- Ads" apaga a informação de que foi captação da parceria; marcar "Paula" apaga de onde o
-- clique veio. Nenhuma das duas respostas é mais verdadeira que a outra.
--
-- A solução é um segundo lugar para a mesma lista, não uma lista nova: o vocabulário é o
-- mesmo, o que muda é caberem dois. DOIS, e não quantos quiser — "Google Ads + Paula" é a
-- forma real do problema, e uma tabela de ligação espalharia mudança por captação, métricas,
-- gatilho e as duas telas, em troca de um terceiro valor que ninguém pediu.
--
-- O carimbo da parceria passa a olhar os dois: basta uma das origens apontar para a
-- parceria. Continua só carimbando, nunca descarimbando.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

alter table public.lead    add column if not exists origem2_id uuid references public.origem_captacao(id);
alter table public.cliente add column if not exists origem2_id uuid references public.origem_captacao(id);
alter table public.caso    add column if not exists origem2_id uuid references public.origem_captacao(id);

comment on column public.lead.origem2_id is
  'Segunda origem do mesmo atendimento — o canal e quem indicou, quando são dois. Ver banco/58.';
comment on column public.cliente.origem2_id is 'Idem lead.origem2_id.';
comment on column public.caso.origem2_id    is 'Idem lead.origem2_id.';

create index if not exists lead_origem2_ix    on public.lead    (origem2_id) where origem2_id is not null;
create index if not exists cliente_origem2_ix on public.cliente (origem2_id) where origem2_id is not null;
create index if not exists caso_origem2_ix    on public.caso    (origem2_id) where origem2_id is not null;

-- ------------------------------------------------------- o carimbo vê as duas
create or replace function public.parceria_pela_origem() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_par uuid;
begin
  if new.parceria_id is not null then return new; end if;   -- já é de alguém: não mexe

  select o.parceria_id into v_par
    from public.origem_captacao o
   where o.id in (new.origem_id, new.origem2_id)
     and o.parceria_id is not null
   limit 1;

  if v_par is null then return new; end if;

  new.parceria_id := v_par;
  if new.escritorio_id is null then
    select escritorio_id into new.escritorio_id from public.parceria where id = v_par;
  end if;
  return new;
end $$;

-- os gatilhos precisam acordar também quando a SEGUNDA origem muda
do $$
declare t text;
begin
  foreach t in array array['lead','cliente','caso'] loop
    execute format('drop trigger if exists a_parceria_pela_origem on public.%I', t);
    execute format('create trigger a_parceria_pela_origem
                      before insert or update of origem_id, origem2_id, parceria_id
                      on public.%I for each row execute function public.parceria_pela_origem()', t);
  end loop;
end $$;

-- ------------------------------------------------------------ conferência
select c.relname as tabela,
       count(*) filter (where a.attname = 'origem2_id') as tem_segunda_origem,
       (select count(*) from pg_trigger g
         where g.tgrelid = c.oid and g.tgname = 'a_parceria_pela_origem') as gatilho
  from pg_class c join pg_attribute a on a.attrelid = c.oid
 where c.relname in ('lead','cliente','caso') and a.attnum > 0
 group by c.relname, c.oid
 order by c.relname;
