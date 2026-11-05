-- 40_contrato_honorario.sql — o contrato assinado vira informação do financeiro
--
-- O que faltava: quando o lead fecha, o sistema cria cliente e caso, mas o contrato
-- nunca voltava para dentro. O honorário ficava num texto livre ("30% sobre o proveito
-- econômico") que não gera nada, e o financeiro era preenchido à mão, sem ligação com
-- o caso.
--
-- Aqui o contrato é anexado ao caso, lido por IA (modo 'contrato' da função
-- ler-documento) e transformado em RUBRICAS: uma linha por obrigação do cliente —
-- entrada, cada parcela, êxito, despesas. As rubricas ficam em jsonb porque o
-- desenho do honorário muda por área: trabalhista por êxito, previdenciário com
-- entrada administrativa e judicial, concursos com entrada e parcelas. Coluna fixa
-- para cada formato engessaria o que varia.
--
-- Nada é lançado sozinho. A leitura fica guardada, o advogado confere na tela do caso
-- e só então manda para o financeiro; o que foi lançado fica marcado para não lançar
-- duas vezes. O percentual de êxito não vira lançamento agora: fica registrado e
-- espera o caso ser ganho, quando o proveito econômico é conhecido.
--
-- A tabela honorario já existia desde o início do sistema, carregada na tela do caso
-- e nunca usada — nenhuma linha, nenhuma escrita. É ela que ganha corpo aqui.

-- ------------------------------------------------------------ honorário do caso
-- Uma linha por caso: o contrato vigente e as rubricas que ele criou.
alter table public.honorario add column if not exists escritorio_id uuid;
alter table public.honorario add column if not exists arquivo_path  text;   -- caminho no bucket 'contratos'
alter table public.honorario add column if not exists arquivo_nome  text;
alter table public.honorario add column if not exists assinado_em   date;
alter table public.honorario add column if not exists rubricas      jsonb not null default '[]'::jsonb;
alter table public.honorario add column if not exists lido_em       timestamptz;
alter table public.honorario add column if not exists lancado_em    timestamptz;
alter table public.honorario add column if not exists leitura_obs   text;   -- o que a IA não conseguiu ler
alter table public.honorario add column if not exists atualizado_em timestamptz not null default now();

-- escritorio_id nasceu ausente; preenche pelo caso antes de exigir.
update public.honorario h set escritorio_id = c.escritorio_id
  from public.caso c where c.id = h.caso_id and h.escritorio_id is null;

do $$ begin
  if not exists (select 1 from information_schema.table_constraints
                 where constraint_name = 'honorario_caso_fk') then
    alter table public.honorario
      add constraint honorario_caso_fk foreign key (caso_id)
      references public.caso(id) on delete cascade;
  end if;
end $$;

-- Um contrato vigente por caso: a tela edita, não acumula versões silenciosas.
create unique index if not exists honorario_caso_uq on public.honorario(caso_id);
create index if not exists honorario_esc_idx on public.honorario(escritorio_id, atualizado_em desc);

-- ------------------------------------------------------------ o que cada rubrica guarda
-- rubricas: [{
--   "nome": "Entrada",                      texto como aparece no contrato
--   "especie": "entrada|parcela|exito|despesa|outro",
--   "valor": 1500.00,                       null quando a rubrica é percentual
--   "percentual": 30.0,                     null quando é valor fixo
--   "base": "proveito econômico",           sobre o que o percentual incide
--   "parcelas": 6,                          1 quando é parcela única
--   "primeiro_vencimento": "2027-01-10",    null quando o contrato não datou
--   "condicao": "se houver ajuizamento",    o que precisa acontecer para ser devida
--   "trecho": "cláusula 3ª, parágrafo 1º",  onde foi lido, para conferência
--   "lancar": true                          se entra no financeiro agora
-- }]
--
-- "lancar" é decidido na leitura e revisto pelo advogado: êxito e rubrica condicional
-- entram com false, porque o valor ainda não existe.

-- ------------------------------------------------------------ ligação com o financeiro
-- O lançamento já tinha caso_id e ninguém usava: a tela do Financeiro só liga a cliente.
-- Daqui em diante, honorário lançado pelo contrato nasce amarrado ao caso.
alter table public.lancamento add column if not exists honorario_id uuid
  references public.honorario(id) on delete set null;
create index if not exists lancamento_honorario_idx on public.lancamento(honorario_id);
create index if not exists lancamento_caso_idx on public.lancamento(caso_id);

-- ------------------------------------------------------------ quem enxerga
alter table public.honorario enable row level security;

-- A tabela JÁ TEM a política hon_restrito, que exige vejo_financeiro() — titular ou
-- administrativo. Honorário é dinheiro: estagiário e associado enxergam o caso e não
-- enxergam o valor. Não criar outra política aqui: política permissiva soma por OU,
-- então uma segunda regra mais larga afrouxaria o acesso em vez de somar proteção.
-- hon_restrito é ALL e tem with_check nulo, logo o using também vale na escrita.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'honorario' and policyname = 'hon_restrito') then
    create policy hon_restrito on public.honorario for all
      using (caso_id in (select id from public.caso where escritorio_id = meu_escritorio())
             and vejo_financeiro());
  end if;
end $$;

-- Contrato é dinheiro: quem mexeu fica registrado, como nas demais tabelas.
drop trigger if exists aud_honorario on public.honorario;
create trigger aud_honorario after insert or delete or update on public.honorario
  for each row execute function anotar();

-- ------------------------------------------------------------ arquivo do contrato
-- Bucket próprio, fechado, numa pasta com o id do escritório. O PDF traz os mesmos
-- valores da tabela, então exige vejo_financeiro() como ela.
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false)
on conflict (id) do nothing;

drop policy if exists contrato_arq_ler on storage.objects;
create policy contrato_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = meu_escritorio()::text and vejo_financeiro());

drop policy if exists contrato_arq_gravar on storage.objects;
create policy contrato_arq_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'contratos' and (storage.foldername(name))[1] = meu_escritorio()::text and vejo_financeiro());

drop policy if exists contrato_arq_trocar on storage.objects;
create policy contrato_arq_trocar on storage.objects for update to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = meu_escritorio()::text and vejo_financeiro());

drop policy if exists contrato_arq_apagar on storage.objects;
create policy contrato_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'contratos' and (storage.foldername(name))[1] = meu_escritorio()::text and vejo_financeiro());
