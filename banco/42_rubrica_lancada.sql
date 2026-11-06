-- 42_rubrica_lancada.sql — cada rubrica do contrato é lançada por si
--
-- O que estava errado na 40: o lançamento era do contrato inteiro, de uma vez. A linha
-- honorario.lancado_em travava o botão para sempre, e a rubrica com condição nunca teve
-- caixa de marcar. Resultado: a entrada da fase administrativa saía, e a entrada da fase
-- judicial e o êxito ficavam registrados sem ter por onde ser lançados quando se
-- tornassem devidos. Era um buraco, não uma decisão — o próprio cartão dizia que o êxito
-- "espera o caso ser ganho", e não havia o segundo passo.
--
-- Agora cada rubrica guarda a sua própria data de lançamento, em "lancada_em" dentro do
-- jsonb. É ela que diz se aquela rubrica já saiu; honorario.lancado_em passa a registrar
-- só quando saiu o PRIMEIRO lançamento do contrato, como informação.
--
-- Nada de DDL: rubricas é jsonb. O que esta migração faz é acertar o que já existe.

-- ------------------------------------------------------------ o que cada rubrica guarda
-- Acrescenta-se ao formato documentado na migração 40:
--   "lancada_em": "2026-11-06T02:01:47.916Z"   quando esta rubrica virou lançamento;
--                                              ausente ou null = ainda não saiu
--
-- "lancar" continua vindo do leitor, mas agora é só sugestão: destaca o botão da rubrica
-- que já é certa. Não tranca mais nada, porque foi exatamente o que prendeu a entrada
-- condicional.

-- ------------------------------------------------------------ acerto do que já existe
-- Contrato lançado antes desta mudança: as rubricas que foram ao Financeiro são as que
-- estavam marcadas em "lancar". Herdam a data do lançamento do contrato. As demais ficam
-- sem lancada_em, que é a verdade: não saíram.
update public.honorario h
set rubricas = (
      select jsonb_agg(
               case when (r->>'lancar')::boolean is true
                    then r || jsonb_build_object('lancada_em', to_jsonb(h.lancado_em))
                    else r end
               order by i)
      from jsonb_array_elements(h.rubricas) with ordinality as t(r, i)),
    atualizado_em = now()
where h.lancado_em is not null
  and jsonb_typeof(h.rubricas) = 'array'
  and jsonb_array_length(h.rubricas) > 0
  -- só quem ainda não tem a marca nova, para poder rodar de novo sem estragar
  and not exists (
        select 1 from jsonb_array_elements(h.rubricas) r
        where r ? 'lancada_em' and r->>'lancada_em' is not null);

-- ------------------------------------------------------------ conferência
-- Depois de rodar, cada contrato já lançado deve ter tantas rubricas com lancada_em
-- quantas tinham lancar = true. E o número de lançamentos ligados ao honorário deve
-- bater com a soma das parcelas dessas rubricas.
--
--   select h.id, h.lancado_em,
--          (select count(*) from jsonb_array_elements(h.rubricas) r
--            where r->>'lancada_em' is not null) as rubricas_lancadas,
--          (select count(*) from public.lancamento l where l.honorario_id = h.id) as linhas
--   from public.honorario h where h.lancado_em is not null;
