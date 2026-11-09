-- 59_origem_na_parceria.sql — a parceira precisa dizer de onde o lead veio
--
-- A Captação da parceria não tinha o campo de origem: a Paula vai anotar lead por lá, e sem
-- isso todo atendimento dela nasceria sem saber se veio de anúncio, do site ou de indicação.
-- A lista existe (`origem_captacao`), mas a parceria não tinha permissão de lê-la.
--
-- ABRIR A LISTA INTEIRA SERIA MISTURAR. Olhando o que há lá dentro:
--
--   anuncio   → Google Ads, Meta Ads, Instagram (anúncio), WhatsApp direto
--   organico  → Site, Site (orgânico), Instagram organico, Nao informado
--   indicacao → Indicacao de cliente, **Elvis**, **Mario**, **Weslley**, Paula
--   outro     → **Ueslley**, Indicação de outro advogado
--   parceria  → Sindicato
--
-- Os nomes em negrito são **quem indica trabalho para o escritório**. Isso é informação do
-- escritório, não da parceria: a Paula não tem por que saber de quem mais o Breno recebe
-- indicação. É exatamente o tipo de coisa que a régra "as informações não se misturam" quer
-- deixar de fora.
--
-- Por outro lado, "Indicacao de cliente" e "Indicação de outro advogado" são genéricas e
-- fazem falta de verdade a quem está anotando um lead.
--
-- Então a escolha não é minha: é uma caixa por origem, que o Breno marca. O padrão vai do
-- lado seguro — canal e orgânico entram, indicação e outro ficam de fora, a origem da
-- própria parceria entra sempre. Marcar "Indicacao de cliente" é um clique em
-- Configurações → Origens de captação.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

alter table public.origem_captacao
  add column if not exists na_parceria boolean not null default false;

comment on column public.origem_captacao.na_parceria is
  'Esta origem aparece para quem entra pela porta da parceria. Ver banco/59.';

-- Padrão seguro, aplicado uma vez só: canal e orgânico sim, nomes de quem indica não.
-- O `where not na_parceria` não basta para ser idempotente de verdade (desmarcar à mão
-- seria desfeito na segunda rodada), então marca-se só o que nunca foi decidido — e é por
-- isso que a coluna nasce `false` e este update roda uma vez, na criação.
do $$
begin
  if not exists (select 1 from public.origem_captacao where na_parceria) then
    update public.origem_captacao
       set na_parceria = true
     where tipo in ('anuncio', 'organico', 'parceria');
    raise notice 'padrão aplicado: canal, orgânico e parceria visíveis';
  else
    raise notice 'já há origens marcadas; não mexi na escolha de ninguém';
  end if;
end $$;

-- A origem da própria parceria aparece sempre, tenha sido marcada ou não.
drop policy if exists origem_parceria on public.origem_captacao;
create policy origem_parceria on public.origem_captacao for select to public
  using (minha_parceria() is not null
     and escritorio_id in (select escritorio_id from public.parceria where id = minha_parceria())
     and (na_parceria or parceria_id = minha_parceria()));

-- ------------------------------------------------------------ conferência
select tipo,
       string_agg(nome || case when na_parceria then ' ✓' else '' end, ' · ' order by nome) as origens
  from public.origem_captacao
 where ativo
 group by tipo
 order by tipo;
