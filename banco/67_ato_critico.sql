-- 67_ato_critico.sql — sentença, acórdão e liminar não podem passar batido
--
-- Pedido do Breno em 15/11/2026: "quando houver publicação de sentença, esse tipo de ato não
-- pode passar batido". Até aqui uma sentença chegava do DJEN como qualquer outra publicação,
-- na mesma lista e com a mesma cor de uma intimação para juntar procuração.
--
-- Cada intimação passa a ter `critico`: o tipo de ato que exige reação (recurso, embargos,
-- cumprimento), ou nulo. A tela, o e-mail diário e o plano da semana leem esta coluna e põem
-- o ato em destaque até o prazo ser cumprido ou a publicação ser tratada.
--
-- POR QUE OLHAR O TEXTO, E NÃO SÓ O TIPO DO DOCUMENTO: medido em 15/11 nas publicações desde
-- junho, 182 de 273 vêm com o tipo "Notificação" — é assim que a Justiça do Trabalho manda
-- quase tudo. A sentença vem no corpo: "Fica V. Sa. intimado para tomar ciência da Sentença
-- ID … proferida nos autos". Pelo tipo só, essas passariam batido, que é o problema.
--
-- Os tipos, do mais grave para o menos:
--   sentenca   sentença, julgamento procedente/improcedente, extinção do processo
--   acordao    acórdão do tribunal
--   monocratica decisão monocrática do relator
--   embargos   julgamento de embargos de declaração
--   tutela     tutela de urgência ou liminar concedida ou negada
--   homologacao homologação de acordo ou de cálculos
--
-- Prefere-se marcar a mais a marcar a menos: um "acórdão" citado de passagem num despacho vira
-- falso alarme, que se descarta com um clique; uma sentença não marcada é prazo perdido.
--
-- Rodar no SQL Editor do Supabase. Pode rodar de novo sem estragar nada.

alter table public.intimacao add column if not exists critico text;

create or replace function public.classificar_ato(tipo_doc text, texto text)
returns text language sql immutable as $$
  select case
    when coalesce(tipo_doc,'') ~* 'senten'
      or coalesce(texto,'') ~* 'ci[eê]ncia d[ao] senten[cç]a'
      or coalesce(texto,'') ~* '\mjulg[oa]\s+(totalmente\s+|parcialmente\s+)?(procedente|improcedente|extint)'
      or coalesce(texto,'') ~* '\mextingo\s+o\s+processo'
      then 'sentenca'
      -- "SENTENÇA" sozinho, em maiúsculas, NÃO entra: é o nome da classe "Cumprimento de
      -- sentença" no cabeçalho de quase toda publicação de execução. Alarme falso em série.
    when coalesce(tipo_doc,'') ~* 'ac[oó]rd[aã]o'
      or coalesce(texto,'') ~* 'ci[eê]ncia do ac[oó]rd[aã]o'
      or coalesce(texto,'') ~* '\macordam\M'
      then 'acordao'
    when coalesce(tipo_doc,'') ~* 'monocr[aá]tica'
      then 'monocratica'
    when coalesce(texto,'') ~* 'embargos de declara[cç][aã]o.{0,120}(rejeit|acolh|conhe[cç]o|n[aã]o conhe[cç]o|provid)'
      then 'embargos'
    when coalesce(texto,'') ~* '(defiro|indefiro|concedo|nego|deferida|indeferida|concedida|negada).{0,80}(tutela|liminar)'
      or coalesce(texto,'') ~* '(tutela|liminar).{0,60}(deferid|indeferid|concedid|negad)'
      then 'tutela'
    when coalesce(texto,'') ~* '\mhomologo\M.{0,60}(acordo|c[aá]lculo)'
      then 'homologacao'
  end
$$;

create or replace function public.marcar_ato_critico() returns trigger
language plpgsql set search_path = public as $$
begin
  new.critico := public.classificar_ato(new.tipo_documento, new.texto);
  return new;
end $$;

drop trigger if exists marcar_ato_critico on public.intimacao;
create trigger marcar_ato_critico
  before insert or update of texto, tipo_documento on public.intimacao
  for each row execute function public.marcar_ato_critico();

-- Retroativo: tudo o que já está no banco.
update public.intimacao
   set critico = public.classificar_ato(tipo_documento, texto)
 where critico is distinct from public.classificar_ato(tipo_documento, texto);

-- Conferência: quantos de cada tipo, e os dos últimos 60 dias.
select critico, count(*) as quantos,
       count(*) filter (where data_disponibilizacao >= current_date - 60) as nos_ultimos_60_dias
  from public.intimacao
 where critico is not null
 group by critico
 order by quantos desc;
