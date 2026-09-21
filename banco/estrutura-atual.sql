-- estrutura-atual.sql
-- Retrato da estrutura do banco do sistema do escritório (Supabase, projeto 'escritorio'),
-- extraído em 2026-09-21 direto do catálogo do Postgres.
-- Só estrutura: tabelas, chaves, índices, funções, visões, regras de acesso (RLS),
-- gatilhos e buckets. NENHUM dado de cliente, nenhuma senha, nenhuma chave.
-- Serve para reconstruir o banco do zero ou para conferir o que existe hoje.
-- As migrações 01 a 23 foram aplicadas antes de existir esta pasta; o efeito delas está aqui.


-- ============================================================ 1. TABELAS

create table if not exists public._bk20_playbook (
  id uuid,
  escritorio_id uuid,
  area text,
  tema text,
  tese text,
  quando_usar text,
  texto_padrao text,
  contra text,
  fundamento text,
  ordem integer,
  ativo boolean,
  criado_em timestamp with time zone,
  atualizado_em timestamp with time zone
);

create table if not exists public._bk20_tese (
  id uuid,
  escritorio_id uuid,
  area text,
  codigo text,
  titulo text,
  rubrica text,
  gatilho text,
  texto_base text,
  pedido_modelo text,
  provas text,
  origem text,
  ativo boolean,
  criado_em timestamp with time zone
);

create table if not exists public._bk21_caso (
  id uuid,
  area text,
  polo text
);

create table if not exists public.achado (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid not null,
  criado_em timestamp with time zone not null default now(),
  area text not null,
  tipo text not null,
  ficha text,
  titulo text not null,
  conteudo text not null,
  fonte text,
  verificacao text not null default 'nao_verificado'::text,
  origem text,
  caso text,
  status text not null default 'pendente'::text,
  incorporado_em timestamp with time zone,
  observacao text
);

create table if not exists public.area_atuacao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  ativo boolean not null default true,
  ordem integer not null default 0
);

create table if not exists public.assinatura (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  titulo text not null,
  tipo text,
  plataforma text not null default 'ZapSign'::text,
  link text,
  enviado_em date,
  assinado_em date,
  observacao text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.auditoria (
  id bigint not null default nextval('auditoria_id_seq'::regclass),
  escritorio_id uuid,
  usuario_id uuid,
  usuario_nome text,
  acao text not null,
  tabela text,
  registro_id text,
  descricao text,
  antes jsonb,
  depois jsonb,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.carteira_revisao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  tese_codigo text not null,
  situacao text not null default 'pendente'::text,
  anotacao text,
  decidido_em timestamp with time zone,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.caso (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  cliente_id uuid,
  responsavel_id uuid,
  coluna_id uuid,
  titulo text not null,
  area text,
  polo text,
  descricao text,
  observacoes text,
  valor_causa numeric(14,2),
  privado boolean not null default false,
  encerrado_em date,
  resultado text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  origem_id uuid,
  area_id uuid,
  prescricao_em date,
  prescricao_obs text,
  ficha jsonb,
  tipo_caso_id uuid,
  dados jsonb not null default '{}'::jsonb,
  viabilidade jsonb not null default '{}'::jsonb,
  cliente_lado text,
  resultado_origem text,
  ordem numeric,
  certame_id uuid,
  data_ciencia_ato date
);

create table if not exists public.caso_documento (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  descricao text not null,
  obs text,
  ordem integer not null default 0,
  recebido_em date,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.caso_tag (
  caso_id uuid not null,
  tag_id uuid not null
);

create table if not exists public.categoria_financeira (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  tipo tipo_lancamento not null
);

create table if not exists public.certame (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid not null,
  ente text not null,
  esfera text,
  edital text not null,
  ano integer,
  banca text,
  orgao text,
  cargos text,
  data_publicacao_edital date,
  data_homologacao date,
  ato_homologacao text,
  validade_meses integer,
  prorrogado boolean not null default false,
  ato_prorrogacao text,
  data_vencimento date,
  lei_cargo text,
  lei_cotas text,
  percentual_cota_racial numeric(5,2),
  percentual_cota_pcd numeric(5,2),
  observacoes text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.checklist_modelo (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  ordem integer not null default 0,
  itens jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.cliente (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  tipo tipo_pessoa not null default 'fisica'::tipo_pessoa,
  nome text not null,
  cpf_cnpj text,
  rg text,
  ctps text,
  pis text,
  nascimento date,
  estado_civil text,
  profissao text,
  email text,
  telefone text,
  whatsapp text,
  endereco text,
  cidade text,
  uf character(2),
  cep text,
  observacoes text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  origem_id uuid,
  cpf text default cpf_cnpj,
  nacionalidade text default 'brasileiro(a)'::text,
  bairro text,
  anterior_ao_sistema boolean not null default false
);

create table if not exists public.coluna_caso (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  ordem integer not null,
  cor text,
  arquivo_final boolean not null default false
);

create table if not exists public.config_api (
  escritorio_id uuid not null,
  piso_usd numeric(10,2) not null default 5,
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.credito_api (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  data date not null default CURRENT_DATE,
  valor_usd numeric(10,2) not null,
  obs text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.decisao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  tribunal text,
  orgao text,
  comarca text,
  uf character(2),
  relator text,
  data date,
  classe text,
  assunto text,
  tema text,
  tese text,
  resultado text,
  favoravel boolean,
  valor numeric(14,2),
  numero text,
  ementa text,
  link text,
  fonte text,
  autoridade text,
  observacao text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.delegacao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  parceiro_id uuid not null,
  caso_id uuid,
  processo_id uuid,
  tipo text not null default 'audiencia'::text,
  titulo text not null,
  descricao text,
  local_ato text,
  data_ato timestamp with time zone,
  prazo_retorno date,
  situacao text not null default 'combinada'::text,
  entregue_em date,
  honorario_tipo text,
  honorario_valor numeric(14,2),
  honorario_percentual numeric(5,2),
  lancamento_id uuid,
  pago_em date,
  observacoes text,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.doc_texto (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  arquivo text not null,
  tipo text,
  texto text not null,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.documento (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  processo_id uuid,
  titulo text not null,
  tipo text,
  storage_path text,
  drive_file_id text,
  tamanho_bytes bigint,
  enviado_por uuid,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.escritorio (
  id uuid not null default uuid_generate_v4(),
  nome text not null,
  cnpj text,
  endereco text,
  telefone text,
  email text,
  criado_em timestamp with time zone not null default now(),
  logo_url text,
  estilo_peca text,
  agenda_token text,
  backup_token text
);

create table if not exists public.evento (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  processo_id uuid,
  responsavel_id uuid,
  tipo tipo_evento not null default 'tarefa'::tipo_evento,
  titulo text not null,
  descricao text,
  inicio timestamp with time zone not null,
  fim timestamp with time zone,
  dia_inteiro boolean not null default false,
  local text,
  situacao situacao_tarefa not null default 'aberta'::situacao_tarefa,
  google_event_id text,
  criado_por uuid,
  criado_em timestamp with time zone not null default now(),
  urgencia text not null default 'normal'::text,
  cliente_id uuid,
  concluido_em timestamp with time zone,
  lembrete_min integer,
  convidado_email text,
  link_sala text,
  origem text,
  subtipo text,
  lead_id uuid,
  projeto_id uuid
);

create table if not exists public.fato (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  data date,
  descricao text not null,
  prova text,
  documento_id uuid,
  trecho text,
  pagina integer,
  ordem integer not null default 0,
  origem text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.feriado (
  id uuid not null default uuid_generate_v4(),
  data date not null,
  nome text not null,
  ambito ambito_feriado not null,
  uf character(2),
  tribunal_sigla text
);

create table if not exists public.ficha (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid,
  modelo_id uuid,
  lead_id uuid,
  cliente_id uuid,
  caso_id uuid,
  respostas jsonb not null default '{}'::jsonb,
  situacao text not null default 'rascunho'::text,
  atendido_por text,
  assinada_em date,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  arquivo_path text,
  arquivo_nome text,
  arquivo_em timestamp with time zone
);

create table if not exists public.ficha_modelo (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid,
  nome text not null,
  area text,
  ativo boolean not null default true,
  ordem integer not null default 0,
  estrutura jsonb not null,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.google_conta (
  id uuid not null default gen_random_uuid(),
  dono_id uuid not null default auth.uid(),
  escritorio_id uuid,
  email text,
  refresh_token text,
  calendar_id text not null default 'primary'::text,
  ativo boolean not null default true,
  sync_token text,
  ultimo_sync timestamp with time zone,
  ultimo_erro text,
  criado_em timestamp with time zone not null default now(),
  nonce text,
  nonce_em timestamp with time zone
);

create table if not exists public.google_link (
  id uuid not null default gen_random_uuid(),
  dono_id uuid not null default auth.uid(),
  qual text not null,
  ref uuid not null,
  google_id text not null,
  hash_local text,
  divergencia jsonb,
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.historico (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  usuario_id uuid,
  entidade text not null,
  entidade_id uuid,
  acao text not null,
  antes jsonb,
  depois jsonb,
  data timestamp with time zone not null default now()
);

create table if not exists public.honorario (
  id uuid not null default uuid_generate_v4(),
  caso_id uuid not null,
  modalidade text,
  valor_fixo numeric(14,2),
  percentual_exito numeric(5,2),
  observacoes text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.informativo_rascunho (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  processo_id uuid,
  corpo text not null,
  relevancia text,
  revisar boolean not null default false,
  motivo_revisar text,
  contexto_hash text not null,
  status text not null default 'rascunho'::text,
  criado_em timestamp with time zone not null default now(),
  decidido_em timestamp with time zone
);

create table if not exists public.interacao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  usuario_id uuid,
  tipo text,
  descricao text not null,
  data timestamp with time zone not null default now()
);

create table if not exists public.intimacao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  processo_id uuid,
  caso_id uuid,
  djen_id bigint,
  hash_djen text,
  tribunal_sigla text,
  orgao text,
  tipo_comunicacao text,
  tipo_documento text,
  classe text,
  numero_processo text,
  numero_formatado text,
  data_disponibilizacao date not null,
  meio text,
  texto text not null,
  link_pje text,
  destinatarios jsonb,
  advogados jsonb,
  oab_captura text,
  situacao situacao_intimacao not null default 'nova'::situacao_intimacao,
  lida_por uuid,
  lida_em timestamp with time zone,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.lancamento (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  cliente_id uuid,
  categoria_id uuid,
  tipo tipo_lancamento not null,
  descricao text,
  contraparte text,
  valor numeric(14,2) not null,
  vencimento date not null,
  pagamento date,
  situacao situacao_lancamento not null default 'previsto'::situacao_lancamento,
  parcela integer,
  total_parcelas integer,
  observacoes text,
  criado_por uuid,
  criado_em timestamp with time zone not null default now(),
  distribuicao_para uuid
);

create table if not exists public.lead (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  telefone text,
  email text,
  origem text,
  area text,
  resumo text,
  etapa text not null default 'novo'::text,
  responsavel_id uuid,
  proximo_contato date,
  caso_id uuid,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  origem_id uuid,
  area_id uuid,
  prescricao_em date,
  viabilidade jsonb not null default '{}'::jsonb,
  nota integer
);

create table if not exists public.meta (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  indicador text not null,
  area_id uuid,
  competencia date not null,
  alvo numeric(14,2) not null
);

create table if not exists public.minuta (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid not null,
  tipo text not null default 'inicial'::text,
  teses text[],
  corpo text not null,
  observacoes text,
  status text not null default 'rascunho'::text,
  criado_em timestamp with time zone not null default now(),
  analise text,
  modo_juiz text
);

create table if not exists public.movimentacao (
  id uuid not null default uuid_generate_v4(),
  processo_id uuid not null,
  data timestamp with time zone not null,
  codigo integer,
  descricao text not null,
  complementos jsonb,
  hash_origem text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.movimento_dicionario (
  codigo integer not null,
  nome_cnj text not null,
  texto_cliente text,
  categoria text,
  relevante boolean not null default false,
  ocorrencias integer not null default 0,
  revisado boolean not null default false,
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.oab (
  id uuid not null default uuid_generate_v4(),
  usuario_id uuid,
  numero text not null,
  uf character(2) not null,
  principal boolean not null default false,
  monitorar boolean not null default true,
  escritorio_id uuid
);

create table if not exists public.origem_captacao (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  tipo text not null default 'indicacao'::text,
  ativo boolean not null default true
);

create table if not exists public.parceiro (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  oab text,
  uf_oab text,
  escritorio text,
  telefone text,
  email text,
  cidade text,
  areas text,
  percentual_padrao numeric(5,2),
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.parte (
  id uuid not null default uuid_generate_v4(),
  processo_id uuid,
  caso_id uuid,
  nome text not null,
  polo polo_parte not null,
  tipo tipo_pessoa,
  cpf_cnpj text,
  advogado_nome text,
  advogado_oab text,
  nosso_cliente boolean not null default false
);

create table if not exists public.peca_absorvida (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  origem text,
  texto text not null,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.pessoal_categoria (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  nome text not null,
  tipo text not null default 'saida'::text,
  grupo text not null default 'variavel'::text,
  teto_mensal numeric(14,2),
  ordem integer not null default 0,
  ativo boolean not null default true
);

create table if not exists public.pessoal_conta (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  nome text not null,
  tipo text not null default 'corrente'::text,
  saldo_inicial numeric(14,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.pessoal_extrato (
  id uuid not null default gen_random_uuid(),
  dono_id uuid not null,
  arquivo_nome text,
  arquivo_path text,
  hash_arquivo text,
  tipo text,
  banco text,
  conta text,
  periodo_ini date,
  periodo_fim date,
  saldo_final numeric(14,2),
  total_fatura numeric(14,2),
  vencimento date,
  linhas jsonb not null default '[]'::jsonb,
  observacao text,
  situacao text not null default 'lido'::text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.pessoal_fin_parcela (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  financiamento_id uuid not null,
  competencia date not null,
  fase text not null default 'amortizacao'::text,
  valor_pago numeric(14,2),
  juros numeric(14,2),
  amortizacao numeric(14,2),
  seguro numeric(14,2),
  taxas numeric(14,2),
  liberacao numeric(14,2),
  saldo_devedor numeric(14,2),
  origem text not null default 'extrato'::text,
  obs text,
  criado_em timestamp with time zone not null default now(),
  correcao numeric,
  prestacao numeric
);

create table if not exists public.pessoal_financiamento (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  nome text not null,
  credor text,
  valor_financiado numeric(14,2) not null,
  entrada numeric(14,2) not null default 0,
  taxa_mes numeric(8,5) not null default 0,
  parcelas integer not null,
  primeira date not null,
  sistema text not null default 'PRICE'::text,
  seguro_mes numeric(14,2) not null default 0,
  obs text,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  obra_ate date,
  liberado numeric(14,2) not null default 0,
  taxa_adm numeric(14,2) not null default 0
);

create table if not exists public.pessoal_lancamento (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  data date not null default CURRENT_DATE,
  tipo text not null default 'saida'::text,
  valor numeric(14,2) not null,
  descricao text,
  categoria_id uuid,
  conta_id uuid,
  projeto_id uuid,
  financiamento_id uuid,
  parcela integer,
  meta_id uuid,
  situacao text not null default 'pago'::text,
  origem text,
  lancamento_id uuid,
  criado_em timestamp with time zone not null default now(),
  extrato_id uuid,
  hash_origem text
);

create table if not exists public.pessoal_meta (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  nome text not null,
  tipo text not null default 'meta'::text,
  alvo numeric(14,2) not null default 0,
  guardado numeric(14,2) not null default 0,
  prazo date,
  obs text
);

create table if not exists public.pessoal_projeto (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  nome text not null,
  orcamento numeric(14,2) not null default 0,
  inicio date,
  previsao date,
  situacao text not null default 'andamento'::text,
  obs text,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.pessoal_recorrente (
  id uuid not null default uuid_generate_v4(),
  dono_id uuid not null,
  descricao text not null,
  categoria_id uuid,
  valor numeric(14,2) not null,
  dia integer not null default 10,
  inicio date not null default CURRENT_DATE,
  fim date,
  ativo boolean not null default true
);

create table if not exists public.plano_investimento (
  escritorio_id uuid not null,
  caixa_atual numeric(14,2) not null default 0,
  entrada_media numeric(14,2) not null default 0,
  saida_media numeric(14,2) not null default 0,
  reserva_minima numeric(14,2) not null default 0,
  investimento_mes numeric(14,2) not null default 0,
  meses_teste integer not null default 6,
  ticket_medio numeric(14,2) not null default 0,
  meses_ate_receber integer not null default 12,
  cen_baixo numeric(6,2) not null default 1,
  cen_medio numeric(6,2) not null default 2,
  cen_alto numeric(6,2) not null default 4,
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.playbook (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  area text,
  tema text not null,
  tese text not null,
  quando_usar text,
  texto_padrao text,
  contra text,
  fundamento text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  tese_id uuid
);

create table if not exists public.prazo (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  intimacao_id uuid,
  processo_id uuid,
  caso_id uuid,
  responsavel_id uuid,
  descricao text not null,
  providencia text,
  data_publicacao date,
  data_inicio date,
  dias integer,
  dias_uteis boolean not null default true,
  regime text,
  data_fatal date not null,
  memoria_calculo jsonb,
  origem origem_prazo not null default 'automatico'::origem_prazo,
  situacao situacao_prazo not null default 'sugerido'::situacao_prazo,
  confianca numeric(3,2),
  trecho_origem text,
  confirmado_por uuid,
  confirmado_em timestamp with time zone,
  cumprido_em timestamp with time zone,
  fatal boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  urgencia text,
  convidado_email text
);

create table if not exists public.precedente (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  tribunal text,
  tipo_recurso text,
  numero text,
  relator text,
  orgao text,
  julgamento date,
  publicacao date,
  tema text,
  ementa text,
  tese_codigo text,
  origem text,
  confirmado boolean not null default false,
  criado_em timestamp with time zone not null default now(),
  link text,
  autoridade text,
  situacao text,
  verificacao text,
  verificado_em timestamp with time zone,
  citacao text,
  citacao_fonte text
);

create table if not exists public.preferencia (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  chave text not null,
  valor jsonb not null,
  atualizado_em timestamp with time zone not null default now()
);

create table if not exists public.processo (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  numero_cnj text not null,
  numero_formatado text,
  tribunal_sigla text,
  grau text,
  orgao text,
  classe text,
  assunto text,
  valor_causa numeric(14,2),
  data_ajuizamento date,
  segredo_justica boolean not null default false,
  monitorar boolean not null default true,
  ultima_sync timestamp with time zone,
  criado_em timestamp with time zone not null default now(),
  fase text not null default 'conhecimento'::text,
  aguardando_ate date,
  aguardando_obs text,
  marco_intercorrente date,
  marco_obs text,
  parte_ativa text,
  parte_passiva text
);

create table if not exists public.projeto (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid not null,
  titulo text not null,
  descricao text,
  fase text not null default 'ideia'::text,
  responsavel_id uuid,
  prazo_final date,
  custo numeric(12,2),
  retorno_valor numeric(12,2),
  retorno_obs text,
  motivo_descarte text,
  ordem integer,
  criado_por uuid default auth.uid(),
  criado_em timestamp with time zone not null default now(),
  atualizado_em timestamp with time zone not null default now(),
  concluido_em timestamp with time zone
);

create table if not exists public.projeto_nota (
  id uuid not null default gen_random_uuid(),
  escritorio_id uuid not null,
  projeto_id uuid not null,
  texto text not null,
  automatica boolean not null default false,
  autor uuid default auth.uid(),
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.regra (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  gatilho text not null,
  contem text,
  acao text not null,
  parametro text,
  dias integer not null default 0,
  ativo boolean not null default true,
  vezes integer not null default 0,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.tag (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  cor text
);

create table if not exists public.tese (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  area text not null,
  codigo text not null,
  titulo text not null,
  rubrica text,
  gatilho text not null,
  texto_base text not null,
  pedido_modelo text,
  provas text,
  origem text,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.tese_candidata (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  area text,
  codigo text not null,
  titulo text,
  rubrica text,
  gatilho text,
  texto_base text,
  pedido_modelo text,
  provas text,
  origem text,
  tipo text not null default 'nova'::text,
  codigo_alvo text,
  justificativa text,
  status text not null default 'pendente'::text,
  criado_em timestamp with time zone not null default now(),
  decidido_em timestamp with time zone
);

create table if not exists public.timesheet (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  caso_id uuid,
  usuario_id uuid not null,
  data date not null,
  minutos integer not null,
  descricao text,
  faturavel boolean not null default true,
  valor_hora numeric(10,2),
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.tipo_caso (
  id uuid not null default uuid_generate_v4(),
  escritorio_id uuid not null,
  nome text not null,
  area text,
  polo text,
  checklist_id uuid,
  tarefas jsonb not null default '[]'::jsonb,
  campos jsonb not null default '[]'::jsonb,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now()
);

create table if not exists public.tribunal (
  sigla text not null,
  nome text not null,
  uf character(2),
  alias_datajud text,
  ativo boolean not null default true
);

create table if not exists public.usuario (
  id uuid not null,
  escritorio_id uuid not null,
  nome text not null,
  email text not null,
  perfil perfil_acesso not null default 'estagiario'::perfil_acesso,
  telefone text,
  ativo boolean not null default true,
  criado_em timestamp with time zone not null default now(),
  permissoes jsonb not null default '{}'::jsonb
);



-- ============================================================ 2. CHAVES E VERIFICAÇÕES

alter table achado add constraint achado_area_check CHECK ((area = ANY (ARRAY['servidores-publicos'::text, 'servidores-educacao'::text, 'processo-disciplinar'::text, 'concursos-publicos'::text, 'acidente-de-trabalho'::text, 'redacao'::text])));

alter table achado add constraint achado_pkey PRIMARY KEY (id);

alter table achado add constraint achado_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'descartado'::text, 'incorporado'::text])));

alter table achado add constraint achado_tipo_check CHECK ((tipo = ANY (ARRAY['legislacao'::text, 'armadilha'::text, 'foro'::text, 'documento'::text, 'correcao'::text])));

alter table achado add constraint achado_verificacao_check CHECK ((verificacao = ANY (ARRAY['verificado'::text, 'fonte_secundaria'::text, 'nao_verificado'::text])));

alter table area_atuacao add constraint area_atuacao_escritorio_id_nome_key UNIQUE (escritorio_id, nome);

alter table area_atuacao add constraint area_atuacao_pkey PRIMARY KEY (id);

alter table assinatura add constraint assinatura_pkey PRIMARY KEY (id);

alter table auditoria add constraint auditoria_pkey PRIMARY KEY (id);

alter table carteira_revisao add constraint carteira_revisao_caso_id_tese_codigo_key UNIQUE (caso_id, tese_codigo);

alter table carteira_revisao add constraint carteira_revisao_pkey PRIMARY KEY (id);

alter table caso add constraint caso_pkey PRIMARY KEY (id);

alter table caso_documento add constraint caso_documento_pkey PRIMARY KEY (id);

alter table caso_tag add constraint caso_tag_pkey PRIMARY KEY (caso_id, tag_id);

alter table categoria_financeira add constraint categoria_financeira_escritorio_id_nome_key UNIQUE (escritorio_id, nome);

alter table categoria_financeira add constraint categoria_financeira_pkey PRIMARY KEY (id);

alter table certame add constraint certame_pkey PRIMARY KEY (id);

alter table checklist_modelo add constraint checklist_modelo_pkey PRIMARY KEY (id);

alter table cliente add constraint cliente_pkey PRIMARY KEY (id);

alter table coluna_caso add constraint coluna_caso_pkey PRIMARY KEY (id);

alter table config_api add constraint config_api_pkey PRIMARY KEY (escritorio_id);

alter table credito_api add constraint credito_api_pkey PRIMARY KEY (id);

alter table decisao add constraint decisao_pkey PRIMARY KEY (id);

alter table delegacao add constraint delegacao_pkey PRIMARY KEY (id);

alter table doc_texto add constraint doc_texto_pkey PRIMARY KEY (id);

alter table documento add constraint documento_pkey PRIMARY KEY (id);

alter table escritorio add constraint escritorio_pkey PRIMARY KEY (id);

alter table evento add constraint evento_pkey PRIMARY KEY (id);

alter table evento add constraint evento_urgencia_ck CHECK ((urgencia = ANY (ARRAY['baixa'::text, 'normal'::text, 'alta'::text, 'critica'::text])));

alter table fato add constraint fato_pkey PRIMARY KEY (id);

alter table feriado add constraint feriado_data_ambito_uf_tribunal_sigla_key UNIQUE (data, ambito, uf, tribunal_sigla);

alter table feriado add constraint feriado_pkey PRIMARY KEY (id);

alter table ficha add constraint ficha_pkey PRIMARY KEY (id);

alter table ficha_modelo add constraint ficha_modelo_pkey PRIMARY KEY (id);

alter table google_conta add constraint google_conta_dono_id_key UNIQUE (dono_id);

alter table google_conta add constraint google_conta_pkey PRIMARY KEY (id);

alter table google_link add constraint google_link_dono_id_google_id_key UNIQUE (dono_id, google_id);

alter table google_link add constraint google_link_pkey PRIMARY KEY (id);

alter table google_link add constraint google_link_qual_check CHECK ((qual = ANY (ARRAY['prazo'::text, 'evento'::text, 'prescricao'::text])));

alter table google_link add constraint google_link_qual_ref_key UNIQUE (qual, ref);

alter table historico add constraint historico_pkey PRIMARY KEY (id);

alter table honorario add constraint honorario_pkey PRIMARY KEY (id);

alter table informativo_rascunho add constraint informativo_rascunho_caso_id_contexto_hash_key UNIQUE (caso_id, contexto_hash);

alter table informativo_rascunho add constraint informativo_rascunho_pkey PRIMARY KEY (id);

alter table informativo_rascunho add constraint informativo_rascunho_relevancia_check CHECK ((relevancia = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text])));

alter table informativo_rascunho add constraint informativo_rascunho_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'aprovado'::text, 'descartado'::text, 'enviado'::text])));

alter table interacao add constraint interacao_pkey PRIMARY KEY (id);

alter table intimacao add constraint intimacao_hash_djen_key UNIQUE (hash_djen);

alter table intimacao add constraint intimacao_pkey PRIMARY KEY (id);

alter table lancamento add constraint lancamento_pkey PRIMARY KEY (id);

alter table lead add constraint lead_pkey PRIMARY KEY (id);

alter table meta add constraint meta_escritorio_id_indicador_area_id_competencia_key UNIQUE (escritorio_id, indicador, area_id, competencia);

alter table meta add constraint meta_pkey PRIMARY KEY (id);

alter table minuta add constraint minuta_pkey PRIMARY KEY (id);

alter table movimentacao add constraint movimentacao_pkey PRIMARY KEY (id);

alter table movimentacao add constraint movimentacao_processo_id_hash_origem_key UNIQUE (processo_id, hash_origem);

alter table movimento_dicionario add constraint movimento_dicionario_pkey PRIMARY KEY (codigo);

alter table oab add constraint oab_numero_uf_key UNIQUE (numero, uf);

alter table oab add constraint oab_pkey PRIMARY KEY (id);

alter table origem_captacao add constraint origem_captacao_escritorio_id_nome_key UNIQUE (escritorio_id, nome);

alter table origem_captacao add constraint origem_captacao_pkey PRIMARY KEY (id);

alter table parceiro add constraint parceiro_pkey PRIMARY KEY (id);

alter table parte add constraint parte_pkey PRIMARY KEY (id);

alter table peca_absorvida add constraint peca_absorvida_pkey PRIMARY KEY (id);

alter table pessoal_categoria add constraint pessoal_categoria_dono_id_nome_key UNIQUE (dono_id, nome);

alter table pessoal_categoria add constraint pessoal_categoria_pkey PRIMARY KEY (id);

alter table pessoal_conta add constraint pessoal_conta_pkey PRIMARY KEY (id);

alter table pessoal_extrato add constraint pessoal_extrato_pkey PRIMARY KEY (id);

alter table pessoal_fin_parcela add constraint pessoal_fin_parcela_financiamento_id_competencia_key UNIQUE (financiamento_id, competencia);

alter table pessoal_fin_parcela add constraint pessoal_fin_parcela_pkey PRIMARY KEY (id);

alter table pessoal_financiamento add constraint pessoal_financiamento_pkey PRIMARY KEY (id);

alter table pessoal_lancamento add constraint pessoal_lancamento_pkey PRIMARY KEY (id);

alter table pessoal_meta add constraint pessoal_meta_pkey PRIMARY KEY (id);

alter table pessoal_projeto add constraint pessoal_projeto_pkey PRIMARY KEY (id);

alter table pessoal_recorrente add constraint pessoal_recorrente_pkey PRIMARY KEY (id);

alter table plano_investimento add constraint plano_investimento_pkey PRIMARY KEY (escritorio_id);

alter table playbook add constraint playbook_pkey PRIMARY KEY (id);

alter table prazo add constraint prazo_pkey PRIMARY KEY (id);

alter table precedente add constraint precedente_escritorio_id_tribunal_numero_key UNIQUE (escritorio_id, tribunal, numero);

alter table precedente add constraint precedente_pkey PRIMARY KEY (id);

alter table preferencia add constraint preferencia_escritorio_id_chave_key UNIQUE (escritorio_id, chave);

alter table preferencia add constraint preferencia_pkey PRIMARY KEY (id);

alter table processo add constraint processo_escritorio_id_numero_cnj_key UNIQUE (escritorio_id, numero_cnj);

alter table processo add constraint processo_pkey PRIMARY KEY (id);

alter table projeto add constraint projeto_fase_check CHECK ((fase = ANY (ARRAY['ideia'::text, 'analise'::text, 'aprovada'::text, 'execucao'::text, 'concluida'::text, 'descartada'::text])));

alter table projeto add constraint projeto_pkey PRIMARY KEY (id);

alter table projeto_nota add constraint projeto_nota_pkey PRIMARY KEY (id);

alter table regra add constraint regra_pkey PRIMARY KEY (id);

alter table tag add constraint tag_escritorio_id_nome_key UNIQUE (escritorio_id, nome);

alter table tag add constraint tag_pkey PRIMARY KEY (id);

alter table tese add constraint tese_escritorio_id_codigo_key UNIQUE (escritorio_id, codigo);

alter table tese add constraint tese_pkey PRIMARY KEY (id);

alter table tese_candidata add constraint tese_candidata_pkey PRIMARY KEY (id);

alter table tese_candidata add constraint tese_candidata_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovada'::text, 'descartada'::text])));

alter table tese_candidata add constraint tese_candidata_tipo_check CHECK ((tipo = ANY (ARRAY['nova'::text, 'refinamento'::text])));

alter table timesheet add constraint timesheet_pkey PRIMARY KEY (id);

alter table tipo_caso add constraint tipo_caso_pkey PRIMARY KEY (id);

alter table tribunal add constraint tribunal_pkey PRIMARY KEY (sigla);

alter table usuario add constraint usuario_email_key UNIQUE (email);

alter table usuario add constraint usuario_pkey PRIMARY KEY (id);



-- ============================================================ 3. CHAVES ESTRANGEIRAS

alter table area_atuacao add constraint area_atuacao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table assinatura add constraint assinatura_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table assinatura add constraint assinatura_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table carteira_revisao add constraint carteira_revisao_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table carteira_revisao add constraint carteira_revisao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table caso add constraint caso_area_id_fkey FOREIGN KEY (area_id) REFERENCES area_atuacao(id);

alter table caso add constraint caso_certame_id_fkey FOREIGN KEY (certame_id) REFERENCES certame(id) ON DELETE SET NULL;

alter table caso add constraint caso_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL;

alter table caso add constraint caso_coluna_id_fkey FOREIGN KEY (coluna_id) REFERENCES coluna_caso(id) ON DELETE SET NULL;

alter table caso add constraint caso_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table caso add constraint caso_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES origem_captacao(id);

alter table caso add constraint caso_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuario(id) ON DELETE SET NULL;

alter table caso add constraint caso_tipo_caso_id_fkey FOREIGN KEY (tipo_caso_id) REFERENCES tipo_caso(id) ON DELETE SET NULL;

alter table caso_documento add constraint caso_documento_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table caso_documento add constraint caso_documento_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table caso_tag add constraint caso_tag_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table caso_tag add constraint caso_tag_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tag(id) ON DELETE CASCADE;

alter table categoria_financeira add constraint categoria_financeira_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table certame add constraint certame_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table checklist_modelo add constraint checklist_modelo_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table cliente add constraint cliente_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table cliente add constraint cliente_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES origem_captacao(id);

alter table coluna_caso add constraint coluna_caso_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table config_api add constraint config_api_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table credito_api add constraint credito_api_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table decisao add constraint decisao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table delegacao add constraint delegacao_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table delegacao add constraint delegacao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table delegacao add constraint delegacao_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES lancamento(id) ON DELETE SET NULL;

alter table delegacao add constraint delegacao_parceiro_id_fkey FOREIGN KEY (parceiro_id) REFERENCES parceiro(id) ON DELETE CASCADE;

alter table delegacao add constraint delegacao_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table doc_texto add constraint doc_texto_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table doc_texto add constraint doc_texto_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table documento add constraint documento_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table documento add constraint documento_enviado_por_fkey FOREIGN KEY (enviado_por) REFERENCES usuario(id);

alter table documento add constraint documento_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table documento add constraint documento_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table evento add constraint evento_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table evento add constraint evento_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL;

alter table evento add constraint evento_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuario(id);

alter table evento add constraint evento_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table evento add constraint evento_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES lead(id) ON DELETE SET NULL;

alter table evento add constraint evento_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table evento add constraint evento_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE SET NULL;

alter table evento add constraint evento_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuario(id) ON DELETE SET NULL;

alter table fato add constraint fato_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table fato add constraint fato_documento_id_fkey FOREIGN KEY (documento_id) REFERENCES documento(id) ON DELETE SET NULL;

alter table fato add constraint fato_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table feriado add constraint feriado_tribunal_sigla_fkey FOREIGN KEY (tribunal_sigla) REFERENCES tribunal(sigla);

alter table ficha add constraint ficha_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table ficha add constraint ficha_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL;

alter table ficha add constraint ficha_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id);

alter table ficha add constraint ficha_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES lead(id) ON DELETE SET NULL;

alter table ficha add constraint ficha_modelo_id_fkey FOREIGN KEY (modelo_id) REFERENCES ficha_modelo(id);

alter table ficha_modelo add constraint ficha_modelo_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id);

alter table google_conta add constraint google_conta_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id);

alter table historico add constraint historico_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table historico add constraint historico_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuario(id);

alter table honorario add constraint honorario_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table informativo_rascunho add constraint informativo_rascunho_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table informativo_rascunho add constraint informativo_rascunho_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table informativo_rascunho add constraint informativo_rascunho_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table interacao add constraint interacao_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table interacao add constraint interacao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table interacao add constraint interacao_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuario(id);

alter table intimacao add constraint intimacao_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table intimacao add constraint intimacao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table intimacao add constraint intimacao_lida_por_fkey FOREIGN KEY (lida_por) REFERENCES usuario(id);

alter table intimacao add constraint intimacao_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table intimacao add constraint intimacao_tribunal_sigla_fkey FOREIGN KEY (tribunal_sigla) REFERENCES tribunal(sigla);

alter table lancamento add constraint lancamento_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table lancamento add constraint lancamento_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES categoria_financeira(id) ON DELETE SET NULL;

alter table lancamento add constraint lancamento_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE SET NULL;

alter table lancamento add constraint lancamento_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES usuario(id);

alter table lancamento add constraint lancamento_distribuicao_para_fkey FOREIGN KEY (distribuicao_para) REFERENCES usuario(id) ON DELETE SET NULL;

alter table lancamento add constraint lancamento_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table lead add constraint lead_area_id_fkey FOREIGN KEY (area_id) REFERENCES area_atuacao(id);

alter table lead add constraint lead_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id);

alter table lead add constraint lead_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table lead add constraint lead_origem_id_fkey FOREIGN KEY (origem_id) REFERENCES origem_captacao(id);

alter table lead add constraint lead_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuario(id);

alter table meta add constraint meta_area_id_fkey FOREIGN KEY (area_id) REFERENCES area_atuacao(id);

alter table meta add constraint meta_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table minuta add constraint minuta_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table minuta add constraint minuta_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table movimentacao add constraint movimentacao_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE CASCADE;

alter table oab add constraint oab_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table oab add constraint oab_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table origem_captacao add constraint origem_captacao_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table parceiro add constraint parceiro_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table parte add constraint parte_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE CASCADE;

alter table parte add constraint parte_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE CASCADE;

alter table peca_absorvida add constraint peca_absorvida_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table pessoal_categoria add constraint pessoal_categoria_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_conta add constraint pessoal_conta_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_extrato add constraint pessoal_extrato_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_fin_parcela add constraint pessoal_fin_parcela_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_fin_parcela add constraint pessoal_fin_parcela_financiamento_id_fkey FOREIGN KEY (financiamento_id) REFERENCES pessoal_financiamento(id) ON DELETE CASCADE;

alter table pessoal_financiamento add constraint pessoal_financiamento_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_lancamento add constraint pessoal_lancamento_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES pessoal_categoria(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_conta_id_fkey FOREIGN KEY (conta_id) REFERENCES pessoal_conta(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_lancamento add constraint pessoal_lancamento_extrato_id_fkey FOREIGN KEY (extrato_id) REFERENCES pessoal_extrato(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_financiamento_id_fkey FOREIGN KEY (financiamento_id) REFERENCES pessoal_financiamento(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_lancamento_id_fkey FOREIGN KEY (lancamento_id) REFERENCES lancamento(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_meta_id_fkey FOREIGN KEY (meta_id) REFERENCES pessoal_meta(id) ON DELETE SET NULL;

alter table pessoal_lancamento add constraint pessoal_lancamento_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES pessoal_projeto(id) ON DELETE SET NULL;

alter table pessoal_meta add constraint pessoal_meta_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_projeto add constraint pessoal_projeto_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table pessoal_recorrente add constraint pessoal_recorrente_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES pessoal_categoria(id) ON DELETE SET NULL;

alter table pessoal_recorrente add constraint pessoal_recorrente_dono_id_fkey FOREIGN KEY (dono_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table plano_investimento add constraint plano_investimento_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table playbook add constraint playbook_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table playbook add constraint playbook_tese_id_fkey FOREIGN KEY (tese_id) REFERENCES tese(id) ON DELETE SET NULL;

alter table prazo add constraint prazo_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table prazo add constraint prazo_confirmado_por_fkey FOREIGN KEY (confirmado_por) REFERENCES usuario(id);

alter table prazo add constraint prazo_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table prazo add constraint prazo_intimacao_id_fkey FOREIGN KEY (intimacao_id) REFERENCES intimacao(id) ON DELETE SET NULL;

alter table prazo add constraint prazo_processo_id_fkey FOREIGN KEY (processo_id) REFERENCES processo(id) ON DELETE SET NULL;

alter table prazo add constraint prazo_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuario(id) ON DELETE SET NULL;

alter table precedente add constraint precedente_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table preferencia add constraint preferencia_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table processo add constraint processo_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table processo add constraint processo_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table processo add constraint processo_tribunal_sigla_fkey FOREIGN KEY (tribunal_sigla) REFERENCES tribunal(sigla);

alter table projeto add constraint projeto_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table projeto add constraint projeto_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES usuario(id) ON DELETE SET NULL;

alter table projeto_nota add constraint projeto_nota_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table projeto_nota add constraint projeto_nota_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projeto(id) ON DELETE CASCADE;

alter table regra add constraint regra_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table tag add constraint tag_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table tese add constraint tese_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table tese_candidata add constraint tese_candidata_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table timesheet add constraint timesheet_caso_id_fkey FOREIGN KEY (caso_id) REFERENCES caso(id) ON DELETE SET NULL;

alter table timesheet add constraint timesheet_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table timesheet add constraint timesheet_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE;

alter table tipo_caso add constraint tipo_caso_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES checklist_modelo(id) ON DELETE SET NULL;

alter table tipo_caso add constraint tipo_caso_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table usuario add constraint usuario_escritorio_id_fkey FOREIGN KEY (escritorio_id) REFERENCES escritorio(id) ON DELETE CASCADE;

alter table usuario add constraint usuario_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;



-- ============================================================ 4. ÍNDICES

CREATE INDEX achado_area_status_idx ON public.achado USING btree (escritorio_id, area, status, criado_em DESC);

CREATE INDEX caso_certame_idx ON public.caso USING btree (certame_id);

CREATE INDEX caso_escritorio_id_coluna_id_idx ON public.caso USING btree (escritorio_id, coluna_id);

CREATE INDEX caso_ordem_idx ON public.caso USING btree (coluna_id, ordem);

CREATE INDEX caso_titulo_idx ON public.caso USING gin (titulo gin_trgm_ops);

CREATE UNIQUE INDEX certame_unico ON public.certame USING btree (escritorio_id, ente, edital);

CREATE INDEX certame_vencimento_idx ON public.certame USING btree (escritorio_id, data_vencimento);

CREATE INDEX cliente_cpf_cnpj_idx ON public.cliente USING btree (cpf_cnpj);

CREATE INDEX cliente_nome_idx ON public.cliente USING gin (nome gin_trgm_ops);

CREATE INDEX evento_cliente_ix ON public.evento USING btree (cliente_id);

CREATE INDEX evento_escritorio_id_inicio_idx ON public.evento USING btree (escritorio_id, inicio);

CREATE INDEX evento_inicio_ix ON public.evento USING btree (escritorio_id, inicio);

CREATE INDEX evento_lead_idx ON public.evento USING btree (lead_id) WHERE (lead_id IS NOT NULL);

CREATE INDEX evento_projeto_idx ON public.evento USING btree (projeto_id) WHERE (projeto_id IS NOT NULL);

CREATE INDEX evento_responsavel_id_situacao_idx ON public.evento USING btree (responsavel_id, situacao);

CREATE INDEX feriado_data_idx ON public.feriado USING btree (data);

CREATE INDEX ficha_caso ON public.ficha USING btree (caso_id);

CREATE INDEX ficha_client ON public.ficha USING btree (cliente_id);

CREATE INDEX ficha_lead ON public.ficha USING btree (lead_id);

CREATE INDEX google_conta_nonce ON public.google_conta USING btree (nonce);

CREATE INDEX historico_entidade_entidade_id_data_idx ON public.historico USING btree (entidade, entidade_id, data DESC);

CREATE INDEX idx_caso_prescricao ON public.caso USING btree (prescricao_em) WHERE (prescricao_em IS NOT NULL);

CREATE INDEX intimacao_escritorio_id_situacao_data_disponibilizacao_idx ON public.intimacao USING btree (escritorio_id, situacao, data_disponibilizacao DESC);

CREATE INDEX intimacao_numero_processo_idx ON public.intimacao USING btree (numero_processo);

CREATE INDEX ix_assin_caso ON public.assinatura USING btree (caso_id);

CREATE INDEX ix_aud_data ON public.auditoria USING btree (criado_em DESC);

CREATE INDEX ix_aud_tabela ON public.auditoria USING btree (tabela);

CREATE INDEX ix_cartrev_esc ON public.carteira_revisao USING btree (escritorio_id, situacao);

CREATE INDEX ix_caso_semcliente ON public.caso USING btree (escritorio_id) WHERE (cliente_id IS NULL);

CREATE INDEX ix_casodoc_caso ON public.caso_documento USING btree (caso_id);

CREATE INDEX ix_credapi_esc ON public.credito_api USING btree (escritorio_id, data);

CREATE INDEX ix_decisao_tema ON public.decisao USING btree (escritorio_id, tema);

CREATE INDEX ix_deleg_caso ON public.delegacao USING btree (caso_id);

CREATE INDEX ix_deleg_parceiro ON public.delegacao USING btree (parceiro_id);

CREATE INDEX ix_deleg_situacao ON public.delegacao USING btree (situacao);

CREATE INDEX ix_doctexto_busca ON public.doc_texto USING gin (texto gin_trgm_ops);

CREATE INDEX ix_doctexto_caso ON public.doc_texto USING btree (caso_id);

CREATE INDEX ix_fato_caso ON public.fato USING btree (caso_id, data);

CREATE INDEX ix_finparc ON public.pessoal_fin_parcela USING btree (dono_id, financiamento_id, competencia);

CREATE INDEX ix_lanc_distrib ON public.lancamento USING btree (distribuicao_para, vencimento);

CREATE INDEX ix_pessextrato ON public.pessoal_extrato USING btree (dono_id, criado_em DESC);

CREATE INDEX ix_pesslanc ON public.pessoal_lancamento USING btree (dono_id, data DESC);

CREATE INDEX ix_pesslanc_extrato ON public.pessoal_lancamento USING btree (extrato_id);

CREATE INDEX ix_pesslanc_hash ON public.pessoal_lancamento USING btree (dono_id, hash_origem);

CREATE INDEX ix_prec_tema ON public.precedente USING btree (escritorio_id, tema);

CREATE INDEX ix_rasc_status ON public.informativo_rascunho USING btree (escritorio_id, status, relevancia);

CREATE INDEX ix_tese_area ON public.tese USING btree (escritorio_id, area, ativo);

CREATE INDEX lancamento_caso_id_idx ON public.lancamento USING btree (caso_id);

CREATE INDEX lancamento_escritorio_id_vencimento_idx ON public.lancamento USING btree (escritorio_id, vencimento);

CREATE INDEX lead_escritorio_id_etapa_proximo_contato_idx ON public.lead USING btree (escritorio_id, etapa, proximo_contato);

CREATE INDEX movimentacao_processo_id_data_idx ON public.movimentacao USING btree (processo_id, data DESC);

CREATE INDEX playbook_tese_idx ON public.playbook USING btree (tese_id);

CREATE INDEX prazo_escritorio_id_situacao_data_fatal_idx ON public.prazo USING btree (escritorio_id, situacao, data_fatal);

CREATE INDEX prazo_responsavel_id_data_fatal_idx ON public.prazo USING btree (responsavel_id, data_fatal);

CREATE INDEX processo_escritorio_id_monitorar_idx ON public.processo USING btree (escritorio_id, monitorar);

CREATE INDEX processo_numero_cnj_idx ON public.processo USING btree (numero_cnj);

CREATE INDEX projeto_esc_fase_idx ON public.projeto USING btree (escritorio_id, fase);

CREATE INDEX projeto_nota_proj_idx ON public.projeto_nota USING btree (projeto_id, criado_em);



-- ============================================================ 5. FUNÇÕES

CREATE OR REPLACE FUNCTION public.anotar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  reg jsonb; nome text; esc uuid; rotulo text;
begin
  reg := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select u.nome, u.escritorio_id into nome, esc from usuario u where u.id = auth.uid();
  rotulo := coalesce(reg->>'titulo', reg->>'nome', reg->>'descricao', reg->>'numero_formatado', '');
  insert into auditoria (escritorio_id, usuario_id, usuario_nome, acao, tabela, registro_id,
                         descricao, antes, depois)
  values (coalesce(esc, (reg->>'escritorio_id')::uuid), auth.uid(), coalesce(nome, 'robô/sistema'),
          lower(tg_op), tg_table_name, reg->>'id', rotulo,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return case when tg_op = 'DELETE' then old else new end;
end $function$
;

CREATE OR REPLACE FUNCTION public.aplicar_traducoes_padrao()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c int;
  n int := 0;
  regras constant text[][] := array[
    -- padrão (regex, sem acento)          categoria       relevante  texto ao cliente
    array['distribu',                      'entrada',      't', 'O processo foi distribuído e já está tramitando na vara.'],
    array['redistribu',                    'entrada',      't', 'O processo foi redistribuído para outra vara.'],
    array['audiencia.*design|design.*audiencia', 'audiencia','t','Foi designada audiência. Vou te avisar da data e do que levar.'],
    array['audiencia.*(realizad|encerrad)','audiencia',    't', 'A audiência foi realizada.'],
    array['audiencia.*(adiad|redesign)',   'audiencia',    't', 'A audiência foi adiada e será remarcada.'],
    array['audiencia.*cancel',             'audiencia',    't', 'A audiência foi cancelada.'],
    array['homologa.*acordo|acordo.*homolog','encerramento','t','O acordo foi homologado pelo juiz.'],
    array['^senten|proferid.*senten|julgament.*(merito|proced)','decisao','t','Saiu a sentença. Vou te explicar o resultado e os próximos passos.'],
    array['improced',                      'decisao',      't', 'Saiu a decisão. Preciso te explicar o resultado pessoalmente.'],
    array['proced',                        'decisao',      't', 'Saiu a decisão. Vou te explicar o resultado e os próximos passos.'],
    array['embargos de declara',           'recurso',      't', 'Foram opostos embargos de declaração para esclarecer pontos da decisão.'],
    array['recurso.*(interpost|recebid)|interpos.*recurso','recurso','t','Foi interposto recurso. O processo vai subir para instância superior.'],
    array['remessa|remetid',               'andamento',    'f', 'O processo foi enviado a outro setor ou instância.'],
    array['recebiment',                    'andamento',    'f', 'O processo foi recebido pelo setor responsável.'],
    array['pericia|perit',                 'andamento',    't', 'O processo está em fase de perícia.'],
    array['pagament|alvara|deposit|transferencia de valor','encerramento','t','Há movimentação de valores no processo. Vou te procurar sobre isso.'],
    array['penhora|bloqueio|sisbajud|bacenjud','andamento','t','Foi determinada busca de bens ou bloqueio de valores do devedor.'],
    array['citac|intimac.*(expedid|cumprid)','andamento','f','A parte contrária foi comunicada oficialmente do processo.'],
    array['contestac|defesa',              'andamento',    't', 'A parte contrária apresentou defesa. Vou responder no prazo.'],
    array['suspens|sobresta',              'andamento',    't', 'O processo está temporariamente suspenso.'],
    array['arquivament|baixa definitiva',  'encerramento', 't', 'O processo foi arquivado.'],
    array['desarquiv',                     'andamento',    't', 'O processo foi desarquivado e voltou a tramitar.'],
    array['transit',                       'encerramento', 't', 'A decisão transitou em julgado: não cabe mais recurso.'],
    array['conclus',                       'expediente',   'f', 'O processo foi para análise do juiz.'],
    array['despach|mero expediente',       'expediente',   'f', 'O juiz proferiu despacho de andamento.'],
    array['decisa',                        'decisao',      't', 'O juiz proferiu decisão no processo.'],
    array['juntad',                        'expediente',   'f', 'Foi juntado documento aos autos.'],
    array['publicac|disponibiliza',        'expediente',   'f', 'Houve publicação oficial no diário da justiça.'],
    array['expedic|expedid',               'expediente',   'f', 'Foi expedido documento pela vara.'],
    array['ato ordinat',                   'expediente',   'f', 'Andamento interno de cartório.'],
    array['decurso de prazo|certida',      'expediente',   'f', 'Andamento interno de cartório.']
  ];
begin
  for i in 1 .. array_length(regras, 1) loop
    update movimento_dicionario d
       set texto_cliente = regras[i][4],
           categoria     = regras[i][2],
           relevante     = regras[i][3]::boolean,
           atualizado_em = now()
     where d.texto_cliente is null
       and d.revisado = false
       and sem_acento(d.nome_cnj) ~ regras[i][1];
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  -- o que sobrou sem tradução fica visível para revisão manual
  update movimento_dicionario
     set categoria = coalesce(categoria, 'outro')
   where categoria is null;
  return n;
end $function$
;

CREATE OR REPLACE FUNCTION public.meu_escritorio()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$ select escritorio_id from usuario where id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.meu_perfil()
 RETURNS perfil_acesso
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$ select perfil from usuario where id = auth.uid() $function$
;

CREATE OR REPLACE FUNCTION public.norm_nome(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
           trim(split_part(split_part(split_part(split_part(
             upper(unaccent(coalesce(t,''))), ' X ', 1), '(', 1), ' PROCESSO', 1), '.', 1)),
           '\s+', ' ', 'g');
$function$
;

CREATE OR REPLACE FUNCTION public.pode(chave text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select (u.permissoes ->> chave)::boolean from usuario u where u.id = auth.uid()),
    (select u.perfil = 'titular' from usuario u where u.id = auth.uid()),
    false);
$function$
;

CREATE OR REPLACE FUNCTION public.provisionar_usuario()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare esc uuid; begin
  select id into esc from escritorio order by criado_em limit 1;
  if new.email = 'brenos.amorim.adv@gmail.com' then
    insert into usuario (id, escritorio_id, nome, email, perfil)
      values (new.id, esc, 'Breno S. Amorim', new.email, 'titular')
      on conflict (id) do nothing;
    update oab set usuario_id = new.id
      where numero = '45776' and uf = 'PE' and usuario_id is null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.sem_acento(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
AS $function$
  select lower(unaccent(t));
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_dicionario()
 RETURNS TABLE(novos integer, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  with base as (
    select codigo, mode() within group (order by descricao) as nome, count(*)::int as qtd
      from movimentacao
     where codigo is not null
     group by codigo
  )
  insert into movimento_dicionario (codigo, nome_cnj, ocorrencias)
  select codigo, nome, qtd from base
  on conflict (codigo) do update
     set ocorrencias   = excluded.ocorrencias,
         nome_cnj      = case when movimento_dicionario.revisado then movimento_dicionario.nome_cnj
                              else excluded.nome_cnj end,
         atualizado_em = now();
  get diagnostics n = row_count;
  return query select n, (select count(*)::int from movimento_dicionario);
end $function$
;

CREATE OR REPLACE FUNCTION public.sou_advogado()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$ select meu_perfil() in ('titular', 'advogado') $function$
;

CREATE OR REPLACE FUNCTION public.vejo_financeiro()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$ select meu_perfil() in ('titular', 'administrativo') $function$
;



-- ============================================================ 6. VISÕES

create or replace view public.caso_competencia as
 SELECT id,
    titulo,
    area_id,
    origem_id,
    encerrado_em,
    resultado,
    criado_em,
    ( SELECT min(p.data_ajuizamento) AS min
           FROM processo p
          WHERE ((p.caso_id = c.id) AND (p.data_ajuizamento IS NOT NULL))) AS primeira_distribuicao,
    LEAST((criado_em)::date, COALESCE(( SELECT min(p.data_ajuizamento) AS min
           FROM processo p
          WHERE ((p.caso_id = c.id) AND (p.data_ajuizamento IS NOT NULL))), (criado_em)::date)) AS competencia
   FROM caso c;

create or replace view public.caso_quadro as
 SELECT c.id,
    c.titulo,
    c.area,
    c.polo,
    c.resultado,
    c.encerrado_em,
    c.criado_em,
    cl.nome AS cliente_nome,
    COALESCE(cl.whatsapp, cl.telefone) AS fone,
    col.id AS coluna_id,
    col.nome AS coluna_nome,
    col.cor AS coluna_cor,
    col.ordem AS coluna_ordem,
    a.nome AS area_nome,
    ( SELECT count(*) AS count
           FROM processo p
          WHERE (p.caso_id = c.id)) AS processos,
    ( SELECT min(z.data_fatal) AS min
           FROM prazo z
          WHERE ((z.caso_id = c.id) AND (z.situacao = ANY (ARRAY['sugerido'::situacao_prazo, 'confirmado'::situacao_prazo])))) AS proximo_prazo,
    ( SELECT max(m.data) AS max
           FROM (movimentacao m
             JOIN processo p ON ((p.id = m.processo_id)))
          WHERE (p.caso_id = c.id)) AS ultima_movimentacao,
    ( SELECT min(p.data_ajuizamento) AS min
           FROM processo p
          WHERE ((p.caso_id = c.id) AND (p.data_ajuizamento IS NOT NULL))) AS primeira_distribuicao
   FROM (((caso c
     LEFT JOIN cliente cl ON ((cl.id = c.cliente_id)))
     LEFT JOIN coluna_caso col ON ((col.id = c.coluna_id)))
     LEFT JOIN area_atuacao a ON ((a.id = c.area_id)));

create or replace view public.cliente_painel as
 SELECT cl.id,
    cl.nome,
    cl.telefone,
    cl.whatsapp,
    cl.email,
    cl.criado_em,
    c.id AS caso_id,
    c.titulo AS caso_titulo,
    c.area,
    c.polo,
    c.area_id,
    c.origem_id,
    c.prescricao_em,
    c.prescricao_obs,
    c.encerrado_em,
    c.criado_em AS caso_criado_em,
    a.nome AS area_nome,
    o.nome AS origem_nome,
    ( SELECT count(*) AS count
           FROM processo p
          WHERE (p.caso_id = c.id)) AS processos,
    ( SELECT max(m.data) AS max
           FROM (movimentacao m
             JOIN processo p ON ((p.id = m.processo_id)))
          WHERE (p.caso_id = c.id)) AS ultima_movimentacao
   FROM (((cliente cl
     LEFT JOIN caso c ON ((c.cliente_id = cl.id)))
     LEFT JOIN area_atuacao a ON ((a.id = c.area_id)))
     LEFT JOIN origem_captacao o ON ((o.id = c.origem_id)));

create or replace view public.google_conta_visao as
 SELECT id,
    dono_id,
    email,
    calendar_id,
    ativo,
    ultimo_sync,
    ultimo_erro,
    criado_em,
    (refresh_token IS NOT NULL) AS conectada
   FROM google_conta;

create or replace view public.mensageria_painel as
 SELECT c.id AS caso_id,
    c.titulo,
    c.area,
    cl.id AS cliente_id,
    cl.nome,
    COALESCE(cl.whatsapp, cl.telefone) AS fone,
    ( SELECT max(i.data) AS max
           FROM interacao i
          WHERE (i.caso_id = c.id)) AS ultimo_contato,
    ( SELECT max(mt.data) AS max
           FROM (movimentacao_traduzida mt
             JOIN processo p ON ((p.id = mt.processo_id)))
          WHERE (p.caso_id = c.id)) AS ultima_movimentacao,
    ( SELECT count(*) AS count
           FROM (movimentacao_traduzida mt
             JOIN processo p ON ((p.id = mt.processo_id)))
          WHERE ((p.caso_id = c.id) AND mt.relevante AND (mt.data > COALESCE(( SELECT max(i.data) AS max
                   FROM interacao i
                  WHERE (i.caso_id = c.id)), (c.criado_em - '90 days'::interval))))) AS novidades,
    ( SELECT count(*) AS count
           FROM interacao i
          WHERE ((i.caso_id = c.id) AND (i.tipo = 'informativo'::text))) AS informativos
   FROM (caso c
     JOIN cliente cl ON ((cl.id = c.cliente_id)))
  WHERE (c.encerrado_em IS NULL);

create or replace view public.movimentacao_traduzida as
 SELECT m.id,
    m.processo_id,
    m.data,
    m.codigo,
    m.descricao,
    COALESCE(d.texto_cliente, m.descricao) AS texto_cliente,
    COALESCE(d.categoria, 'outro'::text) AS categoria,
    COALESCE(d.relevante, false) AS relevante
   FROM (movimentacao m
     LEFT JOIN movimento_dicionario d ON ((d.codigo = m.codigo)));

create or replace view public.processo_painel as
 SELECT p.id,
    p.numero_cnj,
    p.numero_formatado,
    p.tribunal_sigla,
    p.orgao,
    p.classe,
    p.grau,
    p.assunto,
    p.data_ajuizamento,
    p.ultima_sync,
    p.monitorar,
    c.id AS caso_id,
    c.titulo AS caso_titulo,
    c.area,
    c.polo,
    c.criado_em AS caso_criado_em,
    cl.id AS cliente_id,
    cl.nome AS cliente_nome,
    cl.telefone,
    cl.whatsapp,
    ( SELECT max(m.data) AS max
           FROM movimentacao m
          WHERE (m.processo_id = p.id)) AS ultima_movimentacao,
    ( SELECT count(*) AS count
           FROM movimentacao m
          WHERE (m.processo_id = p.id)) AS movimentacoes
   FROM ((processo p
     LEFT JOIN caso c ON ((c.id = p.caso_id)))
     LEFT JOIN cliente cl ON ((cl.id = c.cliente_id)));



-- ============================================================ 7. RLS LIGADO

alter table public._bk20_playbook enable row level security;

alter table public._bk20_tese enable row level security;

alter table public._bk21_caso enable row level security;

alter table public.achado enable row level security;

alter table public.area_atuacao enable row level security;

alter table public.assinatura enable row level security;

alter table public.auditoria enable row level security;

alter table public.carteira_revisao enable row level security;

alter table public.caso enable row level security;

alter table public.caso_documento enable row level security;

alter table public.caso_tag enable row level security;

alter table public.categoria_financeira enable row level security;

alter table public.certame enable row level security;

alter table public.checklist_modelo enable row level security;

alter table public.cliente enable row level security;

alter table public.coluna_caso enable row level security;

alter table public.config_api enable row level security;

alter table public.credito_api enable row level security;

alter table public.decisao enable row level security;

alter table public.delegacao enable row level security;

alter table public.doc_texto enable row level security;

alter table public.documento enable row level security;

alter table public.escritorio enable row level security;

alter table public.evento enable row level security;

alter table public.fato enable row level security;

alter table public.feriado enable row level security;

alter table public.ficha enable row level security;

alter table public.ficha_modelo enable row level security;

alter table public.google_conta enable row level security;

alter table public.google_link enable row level security;

alter table public.historico enable row level security;

alter table public.honorario enable row level security;

alter table public.informativo_rascunho enable row level security;

alter table public.interacao enable row level security;

alter table public.intimacao enable row level security;

alter table public.lancamento enable row level security;

alter table public.lead enable row level security;

alter table public.meta enable row level security;

alter table public.minuta enable row level security;

alter table public.movimentacao enable row level security;

alter table public.movimento_dicionario enable row level security;

alter table public.oab enable row level security;

alter table public.origem_captacao enable row level security;

alter table public.parceiro enable row level security;

alter table public.parte enable row level security;

alter table public.peca_absorvida enable row level security;

alter table public.pessoal_categoria enable row level security;

alter table public.pessoal_conta enable row level security;

alter table public.pessoal_extrato enable row level security;

alter table public.pessoal_fin_parcela enable row level security;

alter table public.pessoal_financiamento enable row level security;

alter table public.pessoal_lancamento enable row level security;

alter table public.pessoal_meta enable row level security;

alter table public.pessoal_projeto enable row level security;

alter table public.pessoal_recorrente enable row level security;

alter table public.plano_investimento enable row level security;

alter table public.playbook enable row level security;

alter table public.prazo enable row level security;

alter table public.precedente enable row level security;

alter table public.preferencia enable row level security;

alter table public.processo enable row level security;

alter table public.projeto enable row level security;

alter table public.projeto_nota enable row level security;

alter table public.regra enable row level security;

alter table public.tag enable row level security;

alter table public.tese enable row level security;

alter table public.tese_candidata enable row level security;

alter table public.timesheet enable row level security;

alter table public.tipo_caso enable row level security;

alter table public.tribunal enable row level security;

alter table public.usuario enable row level security;



-- ============================================================ 8. POLÍTICAS DE ACESSO

create policy achado_all on public.achado as permissive for all to public
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy area_membro on public.area_atuacao as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy assin_membro on public.assinatura as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy aud_gravar on public.auditoria as permissive for insert to public
  with check ((escritorio_id = meu_escritorio()));

create policy aud_ler on public.auditoria as permissive for select to public
  using ((escritorio_id = meu_escritorio()));

create policy cartrev_membro on public.carteira_revisao as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy caso_del_restrito on public.caso as restrictive for delete to public
  using (pode('excluir_caso'::text));

create policy caso_escrita on public.caso as permissive for all to public
  using (((escritorio_id = meu_escritorio()) AND (meu_perfil() <> 'administrativo'::perfil_acesso)));

create policy caso_leitura on public.caso as permissive for select to public
  using (((escritorio_id = meu_escritorio()) AND ((privado = false) OR (responsavel_id = auth.uid()) OR (meu_perfil() = 'titular'::perfil_acesso))));

create policy casodoc_membro on public.caso_documento as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy casotag_membro on public.caso_tag as permissive for all to public
  using ((EXISTS ( SELECT 1
   FROM caso c
  WHERE ((c.id = caso_tag.caso_id) AND (c.escritorio_id = meu_escritorio())))))
  with check ((EXISTS ( SELECT 1
   FROM caso c
  WHERE ((c.id = caso_tag.caso_id) AND (c.escritorio_id = meu_escritorio())))));

create policy catfin_restrito on public.categoria_financeira as permissive for all to public
  using (((escritorio_id = meu_escritorio()) AND vejo_financeiro()));

create policy certame_esc on public.certame as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy chkm_membro on public.checklist_modelo as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy cli_membro on public.cliente as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy cliente_del_restrito on public.cliente as restrictive for delete to public
  using (pode('excluir_cliente'::text));

create policy col_membro on public.coluna_caso as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy cfgapi_membro on public.config_api as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy credapi_membro on public.credito_api as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy decisao_membro on public.decisao as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy deleg_membro on public.delegacao as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy doctexto_membro on public.doc_texto as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy doc_membro on public.documento as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy esc_membro on public.escritorio as permissive for select to public
  using ((id = meu_escritorio()));

create policy evt_membro on public.evento as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy fato_membro on public.fato as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy fer_leitura on public.feriado as permissive for select to authenticated
  using (true);

create policy fi_esc on public.ficha as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy fm_esc on public.ficha_modelo as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy gc_dono on public.google_conta as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy gl_dono on public.google_link as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy hist_leitura on public.historico as permissive for select to public
  using ((escritorio_id = meu_escritorio()));

create policy hon_restrito on public.honorario as permissive for all to public
  using (((caso_id IN ( SELECT caso.id
   FROM caso
  WHERE (caso.escritorio_id = meu_escritorio()))) AND vejo_financeiro()));

create policy rasc_all on public.informativo_rascunho as permissive for all to authenticated
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy inter_membro on public.interacao as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy int_membro on public.intimacao as permissive for select to public
  using ((escritorio_id = meu_escritorio()));

create policy int_triagem on public.intimacao as permissive for update to public
  using ((escritorio_id = meu_escritorio()));

create policy fin_restrito on public.lancamento as permissive for all to public
  using (((escritorio_id = meu_escritorio()) AND vejo_financeiro()));

create policy lanc_del_restrito on public.lancamento as restrictive for delete to public
  using (pode('excluir_lancamento'::text));

create policy lead_membro on public.lead as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy meta_membro on public.meta as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy minuta_all on public.minuta as permissive for all to authenticated
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy mov_membro on public.movimentacao as permissive for select to public
  using ((processo_id IN ( SELECT processo.id
   FROM processo
  WHERE (processo.escritorio_id = meu_escritorio()))));

create policy dic_escrita on public.movimento_dicionario as permissive for all to authenticated
  using (sou_advogado())
  with check (sou_advogado());

create policy dic_leitura on public.movimento_dicionario as permissive for select to authenticated
  using (true);

create policy oab_membro on public.oab as permissive for select to public
  using (((escritorio_id = meu_escritorio()) OR (usuario_id IN ( SELECT usuario.id
   FROM usuario
  WHERE (usuario.escritorio_id = meu_escritorio())))));

create policy orig_membro on public.origem_captacao as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy parc_membro on public.parceiro as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy parte_membro on public.parte as permissive for all to public
  using (((processo_id IN ( SELECT processo.id
   FROM processo
  WHERE (processo.escritorio_id = meu_escritorio()))) OR (caso_id IN ( SELECT caso.id
   FROM caso
  WHERE (caso.escritorio_id = meu_escritorio())))));

create policy peca_membro on public.peca_absorvida as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy pcat_dono on public.pessoal_categoria as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pconta_dono on public.pessoal_conta as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pext_dono on public.pessoal_extrato as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pfinparc_dono on public.pessoal_fin_parcela as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pfin_dono on public.pessoal_financiamento as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy planc_dono on public.pessoal_lancamento as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pmeta_dono on public.pessoal_meta as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy pproj_dono on public.pessoal_projeto as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy precor_dono on public.pessoal_recorrente as permissive for all to public
  using ((dono_id = auth.uid()))
  with check ((dono_id = auth.uid()));

create policy planoinv_membro on public.plano_investimento as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy playbook_membro on public.playbook as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy prazo_advogado_altera on public.prazo as permissive for update to public
  using (((escritorio_id = meu_escritorio()) AND sou_advogado()));

create policy prazo_advogado_escreve on public.prazo as permissive for insert to public
  with check (((escritorio_id = meu_escritorio()) AND sou_advogado()));

create policy prazo_advogado_exclui on public.prazo as permissive for delete to public
  using (((escritorio_id = meu_escritorio()) AND (meu_perfil() = 'titular'::perfil_acesso)));

create policy prazo_leitura on public.prazo as permissive for select to public
  using ((escritorio_id = meu_escritorio()));

create policy prec_all on public.precedente as permissive for all to authenticated
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy pref_membro on public.preferencia as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy proc_membro on public.processo as permissive for all to public
  using ((escritorio_id = meu_escritorio()));

create policy processo_del_restrito on public.processo as restrictive for delete to public
  using (pode('excluir_processo'::text));

create policy projeto_escritorio on public.projeto as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy projeto_nota_escritorio on public.projeto_nota as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy regra_membro on public.regra as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy tag_membro on public.tag as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy tese_all on public.tese as permissive for all to authenticated
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy cand_all on public.tese_candidata as permissive for all to authenticated
  using ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))))
  with check ((escritorio_id IN ( SELECT usuario.escritorio_id
   FROM usuario
  WHERE (usuario.id = auth.uid()))));

create policy ts_proprio on public.timesheet as permissive for all to public
  using (((escritorio_id = meu_escritorio()) AND ((usuario_id = auth.uid()) OR (meu_perfil() = 'titular'::perfil_acesso))));

create policy tipocaso_membro on public.tipo_caso as permissive for all to public
  using ((escritorio_id = meu_escritorio()))
  with check ((escritorio_id = meu_escritorio()));

create policy trib_leitura on public.tribunal as permissive for select to authenticated
  using (true);

create policy usr_membro on public.usuario as permissive for select to public
  using ((escritorio_id = meu_escritorio()));

create policy usr_titular_gerencia on public.usuario as permissive for all to public
  using (((escritorio_id = meu_escritorio()) AND (meu_perfil() = 'titular'::perfil_acesso)));

create policy backup_limpar on storage.objects as permissive for delete to authenticated
  using ((bucket_id = 'backup'::text));

create policy backup_ver on storage.objects as permissive for select to authenticated
  using ((bucket_id = 'backup'::text));

create policy fichas_apagar on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'fichas'::text) AND ((storage.foldername(name))[1] = (meu_escritorio())::text)));

create policy fichas_gravar on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'fichas'::text) AND ((storage.foldername(name))[1] = (meu_escritorio())::text)));

create policy fichas_ler on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'fichas'::text) AND ((storage.foldername(name))[1] = (meu_escritorio())::text)));

create policy fichas_trocar on storage.objects as permissive for update to authenticated
  using (((bucket_id = 'fichas'::text) AND ((storage.foldername(name))[1] = (meu_escritorio())::text)));

create policy fin_apagar on storage.objects as permissive for delete to authenticated
  using (((bucket_id = 'financeiro'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy fin_gravar on storage.objects as permissive for insert to authenticated
  with check (((bucket_id = 'financeiro'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy fin_ler on storage.objects as permissive for select to authenticated
  using (((bucket_id = 'financeiro'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy modelos_leitura_autenticada on storage.objects as permissive for select to authenticated
  using ((bucket_id = 'modelos'::text));



-- ============================================================ 9. GATILHOS

CREATE TRIGGER aud_assinatura AFTER INSERT OR DELETE OR UPDATE ON public.assinatura FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_caso AFTER INSERT OR DELETE OR UPDATE ON public.caso FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_cliente AFTER INSERT OR DELETE OR UPDATE ON public.cliente FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_delegacao AFTER INSERT OR DELETE OR UPDATE ON public.delegacao FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_evento AFTER INSERT OR DELETE OR UPDATE ON public.evento FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_honorario AFTER INSERT OR DELETE OR UPDATE ON public.honorario FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_lancamento AFTER INSERT OR DELETE OR UPDATE ON public.lancamento FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_parceiro AFTER INSERT OR DELETE OR UPDATE ON public.parceiro FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_prazo AFTER INSERT OR DELETE OR UPDATE ON public.prazo FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_processo AFTER INSERT OR DELETE OR UPDATE ON public.processo FOR EACH ROW EXECUTE FUNCTION anotar();

CREATE TRIGGER aud_usuario AFTER INSERT OR DELETE OR UPDATE ON public.usuario FOR EACH ROW EXECUTE FUNCTION anotar();



-- ============================================================ 10. BUCKETS DO STORAGE

insert into storage.buckets (id, name, public) values ('app', 'app', t) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('backup', 'backup', f) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('fichas', 'fichas', f) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('financeiro', 'financeiro', f) on conflict (id) do nothing;

insert into storage.buckets (id, name, public) values ('modelos', 'modelos', f) on conflict (id) do nothing;

