-- 43_previdenciario_documentos.sql — módulo Previdenciário: documentos anexados à análise
--
-- Além do CNIS, a análise recebe outros documentos do segurado: cópia do processo
-- administrativo do INSS, carta de indeferimento, PPP, LTCAT, laudo, CTPS. Cada um
-- fica guardado no bucket 'previdenciario' (mesma pasta do CNIS) e, quando o advogado
-- pede, é lido pela IA (função ler-documento, modo 'inss'). O que a IA leu fica em
-- "lido"; o sistema cruza essa leitura com o CNIS e o cálculo na tela da análise.
-- Nada vira vínculo nem pendência sozinho: quem decide é o advogado.
--
-- Quem vê o documento é quem vê a análise (e, por ela, o caso).

create table if not exists public.prev_documento (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.prev_analise(id) on delete cascade,
  tipo            text not null default 'processo'
                  check (tipo in ('processo','decisao','ppp','ltcat','laudo','ctps','outro')),
  nome            text not null,               -- nome do arquivo como veio
  arquivo         text not null,               -- caminho no bucket 'previdenciario'
  paginas         int,
  status          text not null default 'guardado'
                  check (status in ('guardado','lendo','lido','erro')),
  erro            text,
  lido            jsonb,                       -- o que a IA leu (requerimentos, períodos, PPP, perícias…)
  lido_em         timestamptz,
  criado_por      uuid references public.usuario(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists prev_doc_analise_idx on public.prev_documento(analise_id, criado_em);

alter table public.prev_documento enable row level security;

drop policy if exists prev_doc_membro on public.prev_documento;
create policy prev_doc_membro on public.prev_documento for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_documento.analise_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.prev_analise a where a.id = prev_documento.analise_id));
