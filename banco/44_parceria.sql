-- 44_parceria.sql — a porta da parceria
--
-- Um segundo escritório para dividir trabalho com advogado de fora, sem lhe dar
-- o escritório inteiro. A primeira é a parceria com a advogada Paula Marcula:
-- trabalhista que ela indica, previdenciário de um ou de outro, médico que eu
-- indico, e o que mais fizermos juntos.
--
-- ------------------------------------------------------------ a ideia central
--
-- NÃO há dois bancos, nem cópia, nem sincronismo. O caso em parceria é UMA
-- linha só, com dois carimbos: o escritorio_id de sempre e um parceria_id novo.
-- A porta do escritório enxerga pelo primeiro; a porta da parceria, pelo
-- segundo. Por isso "cadastrar lá e aparecer aqui" é imediato e não tem o que
-- dessincronizar: não foi a lugar nenhum, está no mesmo lugar.
--
-- ------------------------------------------------------------ por que é seguro
--
-- Toda regra de acesso do escritório passa por meu_escritorio(), que lê a
-- tabela usuario pelo login. A parceira NÃO tem linha em usuario. Para as
-- dezenas de tabelas que existem hoje — e para as que vierem — essa função
-- devolve nulo, a comparação dá nulo, e a regra nega. A trava não é o menu:
-- quem entra pela porta da parceria só alcança o que as políticas daqui abrem,
-- uma a uma, nome por nome. É o mesmo desenho da área da família (26_familia).
--
-- ------------------------------------------------------------ o que fica fora
--
-- Nada de captação geral, WhatsApp, notas fiscais, teses, playbook, jurimetria,
-- métricas, auditoria, configurações, pessoal/casa. Não por omissão: por não
-- haver política nenhuma para a parceira nessas tabelas.

-- ============================================================ 1. QUEM É A PARCERIA

create table if not exists public.parceria (
  id            uuid primary key default gen_random_uuid(),
  escritorio_id uuid not null references public.escritorio(id) on delete cascade,
  nome          text not null,
  -- liga à ficha de parceiro já existente, para o rateio do Financeiro
  -- (lancamento.parceiro_id e percentual_parceiro) continuar valendo.
  parceiro_id   uuid references public.parceiro(id) on delete set null,
  ativa         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- O convite é por e-mail e vale antes de a pessoa existir, como na família:
-- ela entra pelo link mágico e já encontra tudo, sem passo de administração.
create table if not exists public.parceria_membro (
  id            uuid primary key default gen_random_uuid(),
  parceria_id   uuid not null references public.parceria(id) on delete cascade,
  usuario_auth  uuid,                       -- preenchido no primeiro acesso
  email         text not null,
  nome          text not null,
  oab           text,
  uf_oab        char(2),
  -- 'titular' é o dono do escritório, que entra pelas duas portas;
  -- 'parceira' é quem só tem esta.
  papel         text not null default 'parceira',
  percentual    numeric(5,2),               -- quanto lhe cabe, por padrão
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

create unique index if not exists parceria_membro_email_unq
  on public.parceria_membro (parceria_id, lower(email));
create index if not exists parceria_membro_auth_ix
  on public.parceria_membro (usuario_auth) where usuario_auth is not null;

comment on table public.parceria is
  'Cada parceria com advogado de fora. A linha guarda a qual escritório ela pertence.';
comment on column public.parceria_membro.papel is
  'titular = dono do escritório (entra pelas duas portas); parceira = só por esta.';

-- ============================================================ 2. QUEM SOU EU AQUI

create or replace function public.minha_parceria() returns uuid
language sql stable security definer set search_path = public as $$
  select m.parceria_id
    from public.parceria_membro m
    join public.parceria p on p.id = m.parceria_id
   where m.ativo and p.ativa
     and (m.usuario_auth = auth.uid()
          or lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')))
   order by (m.usuario_auth = auth.uid()) desc nulls last
   limit 1
$$;

-- Chamada no primeiro acesso: gruda o login da pessoa no convite dela.
create or replace function public.entrar_na_parceria() returns uuid
language plpgsql security definer set search_path = public as $$
declare alvo uuid;
begin
  update public.parceria_membro
     set usuario_auth = auth.uid()
   where usuario_auth is null
     and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  returning parceria_id into alvo;
  return coalesce(alvo, public.minha_parceria());
end $$;

-- Atalho de leitura: estou entrando pela porta da parceria, e não pela do escritório?
create or replace function public.sou_parceira() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_escritorio() is null and public.minha_parceria() is not null
$$;

grant execute on function public.minha_parceria()   to authenticated;
grant execute on function public.entrar_na_parceria() to authenticated;
grant execute on function public.sou_parceira()     to authenticated;

-- ============================================================ 3. O CARIMBO

-- Onde cabe o carimbo. Quem não o tem é invisível para a parceira, e é esse o
-- padrão: a coluna nasce nula em tudo que já existe.
alter table public.caso       add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.cliente    add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.processo   add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.lead       add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.lancamento add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.evento     add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.intimacao  add column if not exists parceria_id uuid references public.parceria(id) on delete set null;
alter table public.prazo      add column if not exists parceria_id uuid references public.parceria(id) on delete set null;

create index if not exists caso_parceria_ix       on public.caso(parceria_id)       where parceria_id is not null;
create index if not exists cliente_parceria_ix    on public.cliente(parceria_id)    where parceria_id is not null;
create index if not exists processo_parceria_ix   on public.processo(parceria_id)   where parceria_id is not null;
create index if not exists lead_parceria_ix       on public.lead(parceria_id)       where parceria_id is not null;
create index if not exists lancamento_parceria_ix on public.lancamento(parceria_id) where parceria_id is not null;
create index if not exists evento_parceria_ix     on public.evento(parceria_id)     where parceria_id is not null;
create index if not exists intimacao_parceria_ix  on public.intimacao(parceria_id)  where parceria_id is not null;
create index if not exists prazo_parceria_ix      on public.prazo(parceria_id)      where parceria_id is not null;

comment on column public.caso.parceria_id is
  'Carimbo da parceria: a mesma linha passa a ser vista também pela porta da parceria.';

-- ------------------------------------------------------------ guarda do carimbo
--
-- Um gatilho só, e não dois, porque a ordem importaria: o Postgres dispara por
-- ordem alfabética do nome, e se o carimbo herdado chegasse depois do escritório
-- um lançamento feito pela porta da parceria nasceria sem dono. As três coisas
-- acontecem aqui, na ordem certa:
--
--   1. herdar o carimbo do caso, quando a linha pende de um caso em parceria —
--      é o que faz o processo, o dinheiro, a agenda e o prazo nascerem já
--      compartilhados, sem ninguém ter de marcar nada;
--   2. preencher o escritorio_id a partir da parceria, porque a parceira não lê
--      a tabela escritorio, nem deve;
--   3. impedir que quem entrou pela porta da parceria troque o escritorio_id —
--      seria fazer a linha sumir do meu sistema.
--
-- O caso_id é lido pelo jsonb da linha porque nem toda tabela tem essa coluna
-- (cliente não tem), e um mesmo gatilho serve a todas.
create or replace function public.parceria_guarda() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_caso uuid;
begin
  if tg_op = 'INSERT' then
    if new.parceria_id is null then
      v_caso := (to_jsonb(new) ->> 'caso_id')::uuid;
      if v_caso is not null then
        select parceria_id into new.parceria_id from public.caso where id = v_caso;
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

do $$
declare t text;
begin
  foreach t in array array['caso','cliente','processo','lead','lancamento','evento','intimacao','prazo'] loop
    execute format('drop trigger if exists %I on public.%I', 'tg_parceria_guarda_'||t, t);
    execute format('create trigger %I before insert or update on public.%I
                      for each row execute function public.parceria_guarda()',
                   'tg_parceria_guarda_'||t, t);
  end loop;
end $$;

-- ============================================================ 4. O QUE A PARCEIRA ALCANÇA
--
-- Políticas permissivas: somam-se às que já existem, sem tocar em nenhuma delas.
-- Quem entra pelo escritório continua enxergando exatamente o que enxergava.
-- Sem "with check" explícito, o Postgres usa o "using" também na escrita — é o
-- que queremos: ela só grava linha carimbada com a parceria dela, e não consegue
-- tirar o carimbo (a verificação é feita na linha nova).
--
-- Apagar continua fechado para ela em caso, cliente, processo e lançamento: ali
-- já existem políticas restritivas que exigem pode(...), e pode(...) lê a tabela
-- usuario, onde ela não está. Pela porta da parceria se encerra e se corrige,
-- não se apaga. Lead, agenda e prazo ela apaga, que são dela mesma.

drop policy if exists caso_parceria       on public.caso;
drop policy if exists cliente_parceria    on public.cliente;
drop policy if exists processo_parceria   on public.processo;
drop policy if exists lead_parceria       on public.lead;
drop policy if exists lancamento_parceria on public.lancamento;
drop policy if exists evento_parceria     on public.evento;
drop policy if exists prazo_parceria      on public.prazo;

create policy caso_parceria       on public.caso       for all to public using (parceria_id = minha_parceria());
create policy cliente_parceria    on public.cliente    for all to public using (parceria_id = minha_parceria());
create policy processo_parceria   on public.processo   for all to public using (parceria_id = minha_parceria());
create policy lead_parceria       on public.lead       for all to public using (parceria_id = minha_parceria());
create policy lancamento_parceria on public.lancamento for all to public using (parceria_id = minha_parceria());
create policy evento_parceria     on public.evento     for all to public using (parceria_id = minha_parceria());
create policy prazo_parceria      on public.prazo      for all to public using (parceria_id = minha_parceria());

-- Intimação é do robô: ela lê e dá baixa, não cria.
drop policy if exists intimacao_parceria_ler on public.intimacao;
drop policy if exists intimacao_parceria_alt on public.intimacao;
create policy intimacao_parceria_ler on public.intimacao for select to public using (parceria_id = minha_parceria());
create policy intimacao_parceria_alt on public.intimacao for update to public using (parceria_id = minha_parceria());

-- Pendurados: não têm carimbo próprio, herdam o do pai.
drop policy if exists mov_parceria on public.movimentacao;
create policy mov_parceria on public.movimentacao for select to public
  using (processo_id in (select id from public.processo where parceria_id = minha_parceria()));

drop policy if exists hon_parceria on public.honorario;
create policy hon_parceria on public.honorario for all to public
  using (caso_id in (select id from public.caso where parceria_id = minha_parceria()));

-- A parceria precisa se ler a si mesma para a tela saber quem é quem.
alter table public.parceria        enable row level security;
alter table public.parceria_membro enable row level security;

drop policy if exists parceria_vejo on public.parceria;
drop policy if exists parceria_dono on public.parceria;
create policy parceria_vejo on public.parceria for select to public
  using (id = minha_parceria() or escritorio_id = meu_escritorio());
create policy parceria_dono on public.parceria for all to public
  using (escritorio_id = meu_escritorio());

drop policy if exists parceria_membro_vejo on public.parceria_membro;
drop policy if exists parceria_membro_dono on public.parceria_membro;
create policy parceria_membro_vejo on public.parceria_membro for select to public
  using (parceria_id = minha_parceria()
         or parceria_id in (select id from public.parceria where escritorio_id = meu_escritorio()));
create policy parceria_membro_dono on public.parceria_membro for all to public
  using (parceria_id in (select id from public.parceria where escritorio_id = meu_escritorio()));

-- ============================================================ 4a. O BURACO DAS VISÕES
--
-- Isto é o mais importante deste arquivo, e não tem a ver com a tela nenhuma.
--
-- No Postgres, uma visão roda com os privilégios de quem a criou, não de quem a
-- consulta: a RLS das tabelas de baixo é ignorada. Enquanto todo login era do
-- escritório isso não fazia diferença — todo mundo podia ver tudo mesmo. No
-- instante em que existe um login que NÃO é do escritório, cada uma destas sete
-- visões vira uma porta aberta para o escritório inteiro: caso_quadro entrega a
-- carteira de casos com nome e telefone de cliente, cliente_painel entrega os
-- clientes, e assim por diante. E o repositório é público: o nome delas está lá.
--
-- security_invoker = on faz a visão obedecer a RLS de quem consulta. Para quem
-- entra pelo escritório nada muda (a regra já o autoriza); para a parceira, a
-- visão passa a mostrar só as linhas carimbadas.
alter view public.caso_quadro            set (security_invoker = on);
alter view public.caso_competencia       set (security_invoker = on);
alter view public.cliente_painel         set (security_invoker = on);
alter view public.processo_painel        set (security_invoker = on);
alter view public.mensageria_painel      set (security_invoker = on);
alter view public.movimentacao_traduzida set (security_invoker = on);
alter view public.google_conta_visao     set (security_invoker = on);

-- As visões do quadro juntam etapa e área. Sem poder lê-las, o caso da parceira
-- apareceria sem etapa e sem área — são listas de nomes, não há sigilo nelas.
drop policy if exists coluna_parceria on public.coluna_caso;
create policy coluna_parceria on public.coluna_caso for select to public
  using (escritorio_id in (select escritorio_id from public.parceria where id = minha_parceria()));

drop policy if exists area_parceria on public.area_atuacao;
create policy area_parceria on public.area_atuacao for select to public
  using (escritorio_id in (select escritorio_id from public.parceria where id = minha_parceria()));

-- ============================================================ 4b. A AUDITORIA PRECISA SABER O NOME DELA
--
-- anotar() busca o nome de quem escreveu na tabela usuario. Quem entra pela
-- porta da parceria não está lá, e toda alteração dela ficaria registrada como
-- "robô/sistema" — num sistema dividido a dois, é o registro que mais importa.
-- A mudança é só acrescentar a segunda busca; o resto da função é o que era.
create or replace function public.anotar() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  reg jsonb; nome text; esc uuid; rotulo text;
begin
  reg := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select u.nome, u.escritorio_id into nome, esc from usuario u where u.id = auth.uid();
  if nome is null then
    select m.nome || ' (parceria)' into nome
      from parceria_membro m where m.usuario_auth = auth.uid() and m.ativo limit 1;
  end if;
  rotulo := coalesce(reg->>'titulo', reg->>'nome', reg->>'descricao', reg->>'numero_formatado', '');
  insert into auditoria (escritorio_id, usuario_id, usuario_nome, acao, tabela, registro_id,
                         descricao, antes, depois)
  values (coalesce(esc, (reg->>'escritorio_id')::uuid), auth.uid(), coalesce(nome, 'robô/sistema'),
          lower(tg_op), tg_table_name, reg->>'id', rotulo,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

-- ============================================================ 5. RECADOS ENTRE NÓS
--
-- "Mensagens", aqui, é a conversa entre os dois advogados — presa ao caso quando
-- houver caso. A mensageria do cliente (e-mail, WhatsApp) não vem para esta porta.
create table if not exists public.parceria_recado (
  id           uuid primary key default gen_random_uuid(),
  parceria_id  uuid not null references public.parceria(id) on delete cascade,
  caso_id      uuid references public.caso(id) on delete cascade,
  autor_auth   uuid not null default auth.uid(),
  autor_nome   text not null,
  texto        text not null,
  lido_em      timestamptz,
  criado_em    timestamptz not null default now()
);
create index if not exists parceria_recado_ix on public.parceria_recado (parceria_id, criado_em desc);
create index if not exists parceria_recado_caso_ix on public.parceria_recado (caso_id) where caso_id is not null;

alter table public.parceria_recado enable row level security;
drop policy if exists recado_parceria on public.parceria_recado;
create policy recado_parceria on public.parceria_recado for all to public
  using (parceria_id = minha_parceria()
         or parceria_id in (select id from public.parceria where escritorio_id = meu_escritorio()));

-- ============================================================ 6. MARCAR UM CASO
--
-- Marcar o caso e esquecer o resto não serve: a parceira veria um caso sem nome
-- de cliente, sem processo e sem dinheiro. Esta função carimba o caso e tudo que
-- pende dele. Passar null desmarca.
--
-- O cliente é carimbado junto, porque sem o cadastro não há como trabalhar o
-- caso — e descarimbado só quando nenhum outro caso dele continuar na parceria.
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
  update public.evento     set parceria_id = p_parceria where caso_id = p_caso;
  update public.prazo      set parceria_id = p_parceria where caso_id = p_caso;
  update public.intimacao  set parceria_id = p_parceria where caso_id = p_caso;
  update public.lead       set parceria_id = p_parceria where caso_id = p_caso;

  if v_cliente is not null then
    if p_parceria is not null then
      update public.cliente set parceria_id = p_parceria where id = v_cliente;
    elsif not exists (select 1 from public.caso
                       where cliente_id = v_cliente and parceria_id is not null and id <> p_caso) then
      update public.cliente set parceria_id = null where id = v_cliente;
    end if;
  end if;
end $$;

grant execute on function public.parceria_marcar_caso(uuid, uuid) to authenticated;

-- O que chega depois já entra carimbado: processo, dinheiro, agenda, prazo e
-- intimação de um caso em parceria herdam o carimbo do caso no gatilho da
-- seção 3. Esta função é para o que já existia quando o caso foi marcado.

-- ============================================================ 7. CONFERÊNCIA
--
-- Depois de aplicar, com o login da parceira (e só com ele), isto deve devolver
-- exatamente os casos da parceria e nada mais:
--
--   select count(*) from caso;        -- só os carimbados
--   select count(*) from cliente;     -- só os carimbados
--   select count(*) from tese;        -- 0
--   select count(*) from lead;        -- só os carimbados
--   select count(*) from usuario;     -- 0
--   select minha_parceria(), meu_escritorio(), sou_parceira();  -- uuid, null, true
--
-- E, com o meu login, nada pode ter mudado: meu_escritorio() segue respondendo,
-- e as contagens de antes da migração continuam as mesmas.
