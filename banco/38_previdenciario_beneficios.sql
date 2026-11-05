-- 38_previdenciario_beneficios.sql — módulo Previdenciário, etapa 3: demais benefícios
--
-- Duas mudanças pequenas no banco; o resto da etapa é cálculo na tela:
--   prev_vinculo.professor — marca o período de magistério (educação infantil,
--                            fundamental e médio), que abre as regras do professor;
--   prev_parametro         — passa a aceitar o limite de baixa renda do auxílio-reclusão
--                            (tipo 'limite_reclusao'), com o valor de cada ano.

alter table public.prev_vinculo
  add column if not exists professor boolean not null default false;

alter table public.prev_parametro drop constraint if exists prev_parametro_tipo_check;
alter table public.prev_parametro add constraint prev_parametro_tipo_check
  check (tipo in ('salario_minimo','teto','limite_reclusao'));

-- Limite de baixa renda do auxílio-reclusão (média dos salários de contribuição dos 12 meses
-- anteriores à prisão; art. 80, §§ 3º e 4º, Lei 8.213). Fonte: gov.br/inss, "valor-limite
-- para direito ao auxílio-reclusão", e as portarias de reajuste de cada ano.
insert into public.prev_parametro (tipo, inicio, valor, ato, fonte) values
  ('limite_reclusao', '2019-01-01', 1364.43, 'Portaria ME 9/2019', 'gov.br/inss'),
  ('limite_reclusao', '2020-01-01', 1425.56, 'Portaria SEPRT/ME 914/2020', 'gov.br/inss'),
  ('limite_reclusao', '2021-01-01', 1503.25, 'Portaria SEPRT/ME 477/2021', 'gov.br/inss'),
  ('limite_reclusao', '2022-01-01', 1655.98, 'Portaria Interministerial MTP/ME 12/2022', 'gov.br/inss'),
  ('limite_reclusao', '2023-01-01', 1754.18, 'Portaria Interministerial MPS/MF 26/2023', 'gov.br/inss'),
  ('limite_reclusao', '2024-01-01', 1819.26, 'Portaria Interministerial MPS/MF 2/2024', 'gov.br/inss'),
  ('limite_reclusao', '2025-01-01', 1906.04, 'Portaria Interministerial MPS/MF 6/2025', 'gov.br/inss'),
  ('limite_reclusao', '2026-01-01', 1980.38, 'Portaria Interministerial MPS/MF 13/2026', 'gov.br/inss')
on conflict (tipo, inicio) do update set valor = excluded.valor, ato = excluded.ato, fonte = excluded.fonte, atualizado_em = now();
