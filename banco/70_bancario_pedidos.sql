-- 70_bancario_pedidos.sql — módulo Bancário, etapa 3: pedidos administrativos aos bancos
--
-- Antes de ajuizar, cada banco recebe um pedido administrativo (Consumidor.gov, Banco
-- Central, Procon, SAC ou ouvidoria) pedindo contrato, comprovante do crédito, trilha da
-- assinatura e, pela LGPD, os dados pessoais tratados. É o que faz a pretensão resistida,
-- alimenta a exibição de documentos (Tema 648/STJ) e desarma a acusação de demanda
-- predatória (Tema 1.198/STJ). A tela gera o texto, registra o envio e lança na aba Prazos
-- os 30 dias de espera da resposta; a resposta (ou o silêncio) fica registrada aqui.

create table if not exists public.banc_pedido (
  id              uuid primary key default uuid_generate_v4(),
  escritorio_id   uuid not null references public.escritorio(id) on delete cascade,
  analise_id      uuid not null references public.banc_analise(id) on delete cascade,
  banco           text not null,
  contratos       text[] not null default '{}',
  canal           text check (canal in ('consumidor_gov','bacen','procon','sac','ouvidoria','email','outro')),
  texto           text,
  protocolo       text,
  enviado_em      date,
  prazo_id        uuid references public.prazo(id) on delete set null,
  respondido_em   date,
  resposta        text,                       -- o que o banco mandou (ou disse)
  exibiu          text check (exibiu in ('tudo','parte','nada')),
  situacao        text not null default 'rascunho'
                  check (situacao in ('rascunho','enviado','respondido','sem_resposta')),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists banc_pedido_idx on public.banc_pedido(analise_id, criado_em);

alter table public.banc_pedido enable row level security;
drop policy if exists banc_pedido_membro on public.banc_pedido;
create policy banc_pedido_membro on public.banc_pedido for all
  using (escritorio_id = meu_escritorio() and exists (select 1 from public.banc_analise a where a.id = banc_pedido.analise_id))
  with check (escritorio_id = meu_escritorio() and exists (select 1 from public.banc_analise a where a.id = banc_pedido.analise_id));
