-- 52_origem_da_parceria.sql — a indicação da Paula passa a carimbar sozinha
--
-- O que faltava: marcar um lead, cliente ou caso com a origem "Indicação Paula" não fazia
-- nada em relação à parceria. O único jeito de dividir era o botão na tela do caso, à mão,
-- um a um. Era metade do que o Breno tinha pedido em dezembro.
--
-- A ligação que faltava é entre a ORIGEM e a PARCERIA. Em Escritório → Origens de captação,
-- uma origem pode agora apontar para uma parceria. Quem nascer (ou for corrigido) com essa
-- origem já nasce carimbado — e como o origem_id é copiado do lead para o cliente e para o
-- caso quando o lead fecha, o carimbo acompanha o atendimento inteiro sozinho.
--
-- DUAS REGRAS QUE O GATILHO SEGUE, E O PORQUÊ:
--   1. Ele só CARIMBA, nunca descarimba. Trocar a origem depois não tira o caso da vista da
--      parceira: sair da parceria continua sendo ato do titular, no botão. Tirar por
--      acidente seria perder trabalho dela sem ninguém perceber.
--   2. Ele não sobrepõe carimbo que já exista. Quem já é de uma parceria continua nela.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------ 1. a ligação
alter table public.origem_captacao
  add column if not exists parceria_id uuid references public.parceria(id) on delete set null;

create index if not exists origem_captacao_parceria_ix
  on public.origem_captacao (parceria_id) where parceria_id is not null;

comment on column public.origem_captacao.parceria_id is
  'Quando preenchida, lead/cliente/caso com esta origem nascem carimbados para esta parceria.';

-- ------------------------------------------------------------ 2. o gatilho
create or replace function public.parceria_pela_origem() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_par uuid;
begin
  if new.parceria_id is not null then return new; end if;   -- já é de alguém: não mexe
  if new.origem_id is null then return new; end if;
  select parceria_id into v_par from public.origem_captacao where id = new.origem_id;
  if v_par is null then return new; end if;
  new.parceria_id := v_par;
  if new.escritorio_id is null then
    select escritorio_id into new.escritorio_id from public.parceria where id = v_par;
  end if;
  return new;
end $$;

-- Nome começando com "a_" para rodar ANTES do parceria_guarda, que é quem herda pelo caso
-- e pelo processo: o gatilho do Postgres dispara em ordem alfabética, e quem chega primeiro
-- é quem decide. A origem é a decisão do titular; a herança é só o preenchimento do resto.
drop trigger if exists a_parceria_pela_origem on public.lead;
create trigger a_parceria_pela_origem before insert or update of origem_id, parceria_id
  on public.lead for each row execute function public.parceria_pela_origem();

drop trigger if exists a_parceria_pela_origem on public.cliente;
create trigger a_parceria_pela_origem before insert or update of origem_id, parceria_id
  on public.cliente for each row execute function public.parceria_pela_origem();

drop trigger if exists a_parceria_pela_origem on public.caso;
create trigger a_parceria_pela_origem before insert or update of origem_id, parceria_id
  on public.caso for each row execute function public.parceria_pela_origem();

-- ------------------------------------------------------------ 3. conferência
select o.nome as origem, p.nome as parceria,
       (select count(*) from public.lead    l where l.origem_id = o.id) as leads,
       (select count(*) from public.cliente c where c.origem_id = o.id) as clientes,
       (select count(*) from public.caso    k where k.origem_id = o.id) as casos
  from public.origem_captacao o
  left join public.parceria p on p.id = o.parceria_id
 where o.ativo
 order by (o.parceria_id is null), o.nome;
