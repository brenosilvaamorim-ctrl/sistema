-- 64_urgencia_e_protocolo.sql — urgência do caso e 15 dias úteis para protocolar
--
-- Pedido do Breno em 15/11/2026, junto com o novo desenho do Início, da Agenda e do caso:
--
-- 1. URGÊNCIA DO CASO. Cada caso ganha uma avaliação de urgência, com a mesma escala que a
--    agenda já usa (baixa, normal, alta, critica — na tela: pouco urgente, normal, muito
--    urgente, não pode esperar). É juízo do advogado, não cálculo: o sistema só guarda e
--    mostra, e o Início e o plano da semana põem os urgentes à frente.
--
-- 2. PROTOCOLO EM 15 DIAS ÚTEIS. Quando um lead vira caso, nasce um prazo "Protocolar a ação"
--    para 15 dias úteis depois. É meta interna, não prazo processual: entra com `fatal = false`
--    e `regime = 'protocolo'`, para ninguém confundir com prazo do processo. Por ser um prazo
--    comum, aparece sozinho no Início, na Agenda, no aviso diário e no plano da semana.
--
--    Dias úteis contados como o robô do DJEN conta: pula sábado, domingo e feriado nacional;
--    estadual e municipal só os de PE, que é onde o escritório protocola a maior parte.
--    A contagem começa no dia seguinte ao fechamento.
--
--    O prazo se cumpre sozinho quando o caso ganha o primeiro processo (cadastro manual,
--    importação ou publicação). Ninguém precisa lembrar de dar baixa.
--
--    Quem dispara é o banco, não a tela: um gatilho no `lead`, quando `caso_id` é preenchido.
--    Assim vale para todo caminho que fecha lead — a Captação, a parceria, o que vier depois.
--
-- 3. RETROATIVO. Decisão do Breno: todos os casos que vieram de lead e ainda não têm
--    processo ganham o prazo, contado da data em que viraram caso (`lead.desfecho_em`, ou a
--    criação do caso se ela faltar). Os que já passaram dos 15 dias aparecem como vencidos.
--    Medido antes de escrever: são 2 casos.
--
-- Rodar no SQL Editor do Supabase ANTES de publicar o index.html que mostra a urgência.
-- Pode rodar de novo sem estragar nada.

-- 1. urgência -------------------------------------------------------------------------------
alter table public.caso add column if not exists urgencia text not null default 'normal';
alter table public.caso drop constraint if exists caso_urgencia_ck;
alter table public.caso add constraint caso_urgencia_ck
  check (urgencia in ('baixa', 'normal', 'alta', 'critica'));

-- 2. dias úteis -----------------------------------------------------------------------------
create or replace function public.somar_dias_uteis(desde date, n integer, p_uf text default 'PE')
returns date language plpgsql stable set search_path = public as $$
declare
  d date := desde;
  contados integer := 0;
begin
  while contados < n loop
    d := d + 1;
    if extract(isodow from d) in (6, 7) then continue; end if;
    if exists (select 1 from public.feriado f
                where f.data = d
                  and (f.ambito::text not in ('estadual', 'municipal') or f.uf = p_uf)) then
      continue;
    end if;
    contados := contados + 1;
  end loop;
  return d;
end $$;

-- Cria o prazo de protocolo de um caso, se fizer sentido: caso aberto, sem processo, e sem
-- prazo de protocolo já criado (aberto ou não — se alguém deu baixa, não volta).
create or replace function public.criar_prazo_protocolo(p_caso uuid, p_desde date)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c record;
  novo uuid;
begin
  select id, escritorio_id, parceria_id, encerrado_em into c from public.caso where id = p_caso;
  if c.id is null or c.encerrado_em is not null then return null; end if;
  if exists (select 1 from public.processo where caso_id = p_caso) then return null; end if;
  if exists (select 1 from public.prazo where caso_id = p_caso and regime = 'protocolo') then return null; end if;

  insert into public.prazo (escritorio_id, parceria_id, caso_id, descricao, providencia,
                            data_inicio, dias, dias_uteis, regime, data_fatal,
                            origem, situacao, fatal, urgencia)
  values (c.escritorio_id, c.parceria_id, p_caso, 'Protocolar a ação',
          'Meta do escritório: protocolar em até 15 dias úteis depois que o lead virou caso.',
          p_desde, 15, true, 'protocolo', public.somar_dias_uteis(p_desde, 15),
          'manual', 'confirmado', false, 'alta')
  returning id into novo;
  return novo;
end $$;

-- Roda com privilégio do dono (precisa enxergar processo e prazo de qualquer caso), então
-- ninguém de fora a chama direto: só os gatilhos abaixo e este arquivo.
revoke execute on function public.criar_prazo_protocolo(uuid, date) from public, anon, authenticated;

-- gatilho: lead virou caso
create or replace function public.protocolo_quando_vira_caso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.caso_id is not null and new.caso_id is distinct from old.caso_id then
    perform public.criar_prazo_protocolo(new.caso_id, (now() at time zone 'America/Recife')::date);
  end if;
  return new;
end $$;

drop trigger if exists protocolo_quando_vira_caso on public.lead;
create trigger protocolo_quando_vira_caso
  after update of caso_id on public.lead
  for each row execute function public.protocolo_quando_vira_caso();

-- gatilho: o caso ganhou processo → o prazo de protocolo está cumprido
create or replace function public.protocolo_cumprido_pelo_processo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.caso_id is not null then
    update public.prazo
       set situacao = 'cumprido', cumprido_em = now()
     where caso_id = new.caso_id
       and regime = 'protocolo'
       and situacao in ('sugerido', 'confirmado');
  end if;
  return new;
end $$;

drop trigger if exists protocolo_cumprido_pelo_processo on public.processo;
create trigger protocolo_cumprido_pelo_processo
  after insert or update of caso_id on public.processo
  for each row execute function public.protocolo_cumprido_pelo_processo();

-- 3. retroativo -----------------------------------------------------------------------------
select l.caso_id, c.titulo,
       coalesce(l.desfecho_em, c.criado_em)::date as virou_caso,
       public.criar_prazo_protocolo(l.caso_id, (coalesce(l.desfecho_em, c.criado_em) at time zone 'America/Recife')::date) as prazo_criado
  from public.lead l
  join public.caso c on c.id = l.caso_id
 where c.encerrado_em is null
   and not exists (select 1 from public.processo p where p.caso_id = c.id);

-- Conferência: os prazos de protocolo que existem agora.
select c.titulo, p.data_inicio as virou_caso, p.data_fatal as protocolar_ate, p.situacao
  from public.prazo p join public.caso c on c.id = p.caso_id
 where p.regime = 'protocolo'
 order by p.data_fatal;
