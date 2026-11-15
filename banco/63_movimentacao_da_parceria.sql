-- 63_movimentacao_da_parceria.sql — quem fez o quê, visto pelas duas portas; e o prazo descartado com motivo
--
-- Pedido do Breno em 15/11/2026: na parceria, ver toda a movimentação — quem incluiu, editou,
-- cumpriu —, sempre com o nome de quem fez; e poder mexer melhor nos prazos, inclusive
-- descartar o que o robô leu errado.
--
-- O registro já existia: a `auditoria`, alimentada pelo gatilho `anotar()`, que desde o 44
-- sabe o nome da parceira. Faltavam três coisas, e é só isso o que este arquivo faz:
--
-- 1. A parceira não lia a auditoria. A política `aud_ler` compara com `meu_escritorio()`, que
--    para ela é nulo. Abrir a auditoria inteira seria errado (é o escritório todo); a régua do
--    44 é a de sempre: ela vê só o que leva o carimbo. Por isso a auditoria ganha `parceria_id`
--    e `caso_id`, preenchidos pelo próprio gatilho a partir da linha anotada — ou, quando a
--    linha não tem carimbo próprio (fato, parte, documento...), a partir do caso ou do processo
--    a que ela pendura. A tela do escritório, pela porta da parceria, filtra pelo mesmo campo na
--    consulta (a lição do `caso_quadro`: a RLS não filtra nada para quem é do escritório).
--
-- 2. Só sete tabelas eram anotadas (caso, cliente, processo, prazo, evento, lançamento,
--    honorário). O trabalho do dia a dia da parceria passa também por lead, fato, parte,
--    documento pedido, documento, minuta, ficha, horas, contato e recado. Todas ganham o mesmo
--    gatilho. A publicação (`intimacao`) fica de fora: quem a inclui é o robô, centenas por
--    semana, e o que importa dela — o prazo que gera — já é anotado.
--
-- 3. A minuta tem o corpo inteiro da peça; anotá-la como está guardaria duas cópias da petição a
--    cada vírgula mexida. `aud_enxugar` troca texto com mais de 2.000 caracteres por uma marca com
--    o tamanho — o registro diz que o corpo mudou e quanto, não a peça de novo.
--
-- E o prazo: `motivo_descarte`. "Não é prazo" sem dizer por quê obriga o outro advogado a ir atrás
-- da publicação para saber se pode confiar no descarte. Em um sistema a dois, o porquê é metade
-- da informação.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

-- ------------------------------------------------------------ 1. as colunas novas

alter table public.auditoria add column if not exists parceria_id uuid;
alter table public.auditoria add column if not exists caso_id uuid;
create index if not exists ix_aud_parceria on public.auditoria (parceria_id, criado_em desc) where parceria_id is not null;
create index if not exists ix_aud_caso     on public.auditoria (caso_id, criado_em desc)     where caso_id is not null;

alter table public.prazo add column if not exists motivo_descarte text;

-- ------------------------------------------------------------ 2. o gatilho que sabe a parceria

create or replace function public.aud_enxugar(j jsonb) returns jsonb
language sql immutable as $$
  select case when j is null then null else (
    select coalesce(jsonb_object_agg(k,
             case when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 2000
                  then to_jsonb('(texto de ' || length(v #>> '{}') || ' caracteres)')
                  else v end), '{}'::jsonb)
      from jsonb_each(j) as e(k, v)) end
$$;

create or replace function public.anotar() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  reg jsonb; ant jsonb; nome text; esc uuid; rotulo text;
  v_caso uuid; v_parc uuid; v_proc uuid;
begin
  reg := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  ant := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

  select u.nome, u.escritorio_id into nome, esc from usuario u where u.id = auth.uid();
  if nome is null then
    select m.nome || ' (parceria)' into nome
      from parceria_membro m where m.usuario_auth = auth.uid() and m.ativo limit 1;
  end if;

  -- A que caso e a que parceria isto pertence. O carimbo da própria linha vale primeiro;
  -- o da linha antiga também, para que tirar um caso da parceria fique registrado nela.
  v_caso := case when tg_table_name = 'caso' then (reg->>'id')::uuid
                 else nullif(coalesce(reg->>'caso_id', ant->>'caso_id'), '')::uuid end;
  v_parc := nullif(coalesce(reg->>'parceria_id', ant->>'parceria_id'), '')::uuid;
  if v_parc is null and v_caso is not null then
    select c.parceria_id into v_parc from caso c where c.id = v_caso;
  end if;
  if v_parc is null then
    v_proc := nullif(coalesce(reg->>'processo_id', ant->>'processo_id'), '')::uuid;
    if v_proc is not null then
      select p.parceria_id, coalesce(v_caso, p.caso_id) into v_parc, v_caso from processo p where p.id = v_proc;
    end if;
  end if;
  -- `parte` não tem escritorio_id; sem isto, o que a parceira anota nela sumiria do lado de lá.
  if esc is null and reg->>'escritorio_id' is null and v_caso is not null then
    select c.escritorio_id into esc from caso c where c.id = v_caso;
  end if;

  rotulo := coalesce(reg->>'titulo', reg->>'nome', reg->>'descricao', reg->>'numero_formatado', reg->>'tipo', '');
  insert into auditoria (escritorio_id, usuario_id, usuario_nome, acao, tabela, registro_id,
                         descricao, antes, depois, parceria_id, caso_id)
  values (coalesce(esc, (reg->>'escritorio_id')::uuid), auth.uid(), coalesce(nome, 'robô/sistema'),
          lower(tg_op), tg_table_name, reg->>'id', left(rotulo, 300),
          case when tg_op = 'INSERT' then null else aud_enxugar(to_jsonb(old)) end,
          case when tg_op = 'DELETE' then null else aud_enxugar(to_jsonb(new)) end,
          v_parc, v_caso);
  return case when tg_op = 'DELETE' then old else new end;
end $function$;

-- ------------------------------------------------------------ 3. as tabelas que passam a ser anotadas

do $$
declare t text;
begin
  foreach t in array array['lead','fato','parte','caso_documento','documento','minuta','ficha',
                           'timesheet','interacao','parceria_recado'] loop
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      raise notice 'tabela % não existe; pulei', t; continue;
    end if;
    execute format('drop trigger if exists %I on public.%I', 'aud_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I
                    for each row execute function anotar()', 'aud_' || t, t);
  end loop;
end $$;

-- ------------------------------------------------------------ 4. o que já estava anotado ganha o carimbo

update public.auditoria a
   set caso_id = case when a.tabela = 'caso' then nullif(a.registro_id, '')::uuid
                      else nullif(coalesce(a.depois->>'caso_id', a.antes->>'caso_id'), '')::uuid end
 where a.caso_id is null
   and (a.tabela = 'caso' or coalesce(a.depois->>'caso_id', a.antes->>'caso_id') is not null);

update public.auditoria a
   set parceria_id = nullif(coalesce(a.depois->>'parceria_id', a.antes->>'parceria_id'), '')::uuid
 where a.parceria_id is null
   and coalesce(a.depois->>'parceria_id', a.antes->>'parceria_id') is not null;

update public.auditoria a
   set parceria_id = c.parceria_id
  from public.caso c
 where a.parceria_id is null and a.caso_id = c.id and c.parceria_id is not null;

-- ------------------------------------------------------------ 5. a parceira lê o que é da parceria

drop policy if exists aud_parceria on public.auditoria;
create policy aud_parceria on public.auditoria for select to public
  using (parceria_id = minha_parceria());

-- Conferência: quantas linhas da auditoria já pertencem a alguma parceria.
select count(*) as linhas_da_parceria from public.auditoria where parceria_id is not null;
