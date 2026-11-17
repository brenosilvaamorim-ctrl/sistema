-- 68_bancario.sql — módulo Bancário: análise do caso e entrada de documentos
--
-- Ações de consumidor contra bancos (consignado não contratado, RMC/RCC, seguro
-- prestamista, juros, descontos em conta). Como no Previdenciário, a análise é sempre
-- ligada a um caso. Esta migração cobre só a ETAPA 1, a entrada de documentos:
-- extratos do INSS, Registrato, extratos bancários, contratos, respostas dos bancos,
-- documentos pessoais e médicos.
--
-- O que a tela faz ao receber um arquivo, tudo no navegador e sem IA:
--   - calcula o hash (SHA-256) para não guardar o mesmo arquivo duas vezes no caso;
--   - reconhece o tipo pelos cabeçalhos fixos (extratos do INSS, Registrato);
--   - confere o CPF do titular com o da análise;
--   - lê o período coberto (primeira e última data) e diz se ele basta;
--   - mede se o PDF tem texto ou é imagem (foto/digitalização).
-- Documento novo do mesmo tipo NÃO substitui o anterior: extrato de março e de
-- novembro são provas diferentes. Nada é lido por IA nesta etapa.
--
-- Quem vê a análise e os documentos é quem é do escritório (meu_escritorio()).
-- Os arquivos ficam no bucket privado 'bancario', em <escritorio>/<analise>/…,
-- e só abrem por link temporário.

create table if not exists public.banc_analise (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  caso_id         uuid not null references public.caso(id) on delete cascade,
  cliente_id      uuid references public.cliente(id) on delete set null,
  titulo          text,
  cpf             text,                       -- titular dos extratos (confere cada documento)
  nb              text,                       -- número do benefício, se houver
  nascimento      date,
  perfil          text not null default 'inss'
                  check (perfil in ('inss','bpc','servidor','correntista','veiculo','outro')),
  situacao        text not null default 'aberta'
                  check (situacao in ('aberta','pedido_adm','ajuizada','encerrada','arquivada')),
  obs             text,
  guarda_ate      date,                       -- prazo de guarda dos documentos (padrão: 5 anos após arquivar)
  criado_por      uuid references public.usuario(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists banc_analise_caso_idx on public.banc_analise(caso_id);
create index if not exists banc_analise_esc_idx  on public.banc_analise(escritorio_id, atualizado_em desc);

alter table public.banc_analise enable row level security;
drop policy if exists banc_analise_membro on public.banc_analise;
create policy banc_analise_membro on public.banc_analise for all
  using (escritorio_id = meu_escritorio()) with check (escritorio_id = meu_escritorio());

drop trigger if exists aud_banc_analise on public.banc_analise;
create trigger aud_banc_analise after insert or delete or update on public.banc_analise
  for each row execute function anotar();

create table if not exists public.banc_documento (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.banc_analise(id) on delete cascade,
  tipo            text not null default 'outro'
                  check (tipo in ('emprestimos_inss','hiscre','registrato','extrato_bancario','contrato',
                                  'trilha_assinatura','fatura_cartao','apolice','protocolo_adm','resposta_banco',
                                  'procuracao','identidade','residencia','gratuidade','medico','outro')),
  banco           text,                       -- instituição, quando o documento é de um banco
  nome            text not null,              -- nome do arquivo como veio
  arquivo         text not null,              -- caminho no bucket 'bancario'
  hash            text,                       -- SHA-256 do arquivo
  paginas         int,
  periodo_inicio  date,
  periodo_fim     date,
  titular         text not null default 'a_conferir'
                  check (titular in ('confere','diverge','a_conferir')),
  titular_lido    text,                       -- CPF(s) encontrados no documento
  legibilidade    text check (legibilidade in ('texto','imagem')),
  canal           text not null default 'tela' check (canal in ('tela','link','drive','chat')),
  sensivel        boolean not null default false,  -- documento médico
  status          text not null default 'recebido'
                  check (status in ('recebido','conferido','pendente','lido','erro')),
  pendencia       text,                       -- o que falta neste documento (período curto, titular, imagem ruim)
  lido            jsonb,                      -- etapa 2: o que foi extraído
  lido_em         timestamptz,
  erro            text,
  criado_por      uuid references public.usuario(id) on delete set null,
  criado_em       timestamptz not null default now()
);
create index if not exists banc_doc_analise_idx on public.banc_documento(analise_id, criado_em);
create unique index if not exists banc_doc_hash_uidx on public.banc_documento(analise_id, hash) where hash is not null;

alter table public.banc_documento enable row level security;
drop policy if exists banc_doc_membro on public.banc_documento;
create policy banc_doc_membro on public.banc_documento for all
  using (escritorio_id = meu_escritorio()
         and exists (select 1 from public.banc_analise a where a.id = banc_documento.analise_id))
  with check (escritorio_id = meu_escritorio()
         and exists (select 1 from public.banc_analise a where a.id = banc_documento.analise_id));

-- ------------------------------------------------------------ arquivos
insert into storage.buckets (id, name, public)
values ('bancario', 'bancario', false)
on conflict (id) do nothing;

drop policy if exists banc_arq_ler on storage.objects;
create policy banc_arq_ler on storage.objects for select to authenticated
  using (bucket_id = 'bancario' and (storage.foldername(name))[1] = meu_escritorio()::text);

drop policy if exists banc_arq_gravar on storage.objects;
create policy banc_arq_gravar on storage.objects for insert to authenticated
  with check (bucket_id = 'bancario' and (storage.foldername(name))[1] = meu_escritorio()::text);

drop policy if exists banc_arq_apagar on storage.objects;
create policy banc_arq_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'bancario' and (storage.foldername(name))[1] = meu_escritorio()::text);
