# Modo B — BPC/LOAS da pessoa com deficiência

Objetivo: refazer a avaliação que o INSS fez (ou fará), mostrar onde ela errou e indicar o
caminho mais curto para a concessão. Redigido em 07/11/2026; o BPC mudou várias vezes desde
2021 (Leis 14.176/2021 e 15.077/2024): tudo marcado **[CONFERIR]** precisa de checagem.

## 1. Requisitos

1. **Deficiência**: impedimento de **longo prazo** (efeitos por no mínimo 2 anos) de natureza
   física, mental, intelectual ou sensorial que, em interação com barreiras, obstrua a
   participação plena na sociedade em igualdade de condições (LOAS, art. 20, §§ 2º e 10;
   Lei 13.146/2015, art. 2º).
2. **Miserabilidade**: renda familiar mensal por pessoa de até **1/4 do salário mínimo**
   (art. 20, § 3º), que **não é critério absoluto** (STF, Temas 27 e 312) e admite outros
   meios de prova (§ 11). Ampliação até 1/2 salário mínimo conforme grau da deficiência,
   dependência de terceiros e gastos com saúde (§ 11-A e art. 20-B, Lei 14.176/2021)
   [CONFERIR regulamentação vigente].
3. **Grupo familiar** (§ 1º): requerente, cônjuge ou companheiro, pais e, na falta deles,
   madrasta ou padrasto, irmãos solteiros, filhos e enteados solteiros e menores tutelados,
   **desde que vivam sob o mesmo teto**. Quem mora em outra casa não entra.
4. **Exclusões da renda**: BPC ou benefício previdenciário de até 1 salário mínimo pago a
   idoso ou pessoa com deficiência do grupo (§ 14) [CONFERIR alcance atual]; gastos com
   medicamentos, fraldas, alimentação especial e tratamento não fornecidos pelo SUS
   (art. 20-B) [CONFERIR].
5. **CadÚnico** inscrito e atualizado, de todo o grupo (Decreto 6.214/2007, art. 12) e as
   exigências cadastrais da Lei 15.077/2024 (biometria, atualização periódica) [CONFERIR].

## 2. A avaliação biopsicossocial do INSS

Feita por **assistente social** (avaliação social) e **perito médico** (avaliação médica),
com base na CIF, pela Portaria Conjunta MDS/INSS nº 2/2015 e atualizações [CONFERIR versão
vigente e a tabela conclusiva].

Componentes e quem avalia:

| Componente | Avalia | O que é |
|---|---|---|
| **Fatores ambientais** (e) | Social | Produtos e tecnologia; condições de moradia e mudanças ambientais; apoio e relacionamentos; atitudes; serviços, sistemas e políticas |
| **Atividades e participação** (d) | Social e médica | Aprendizagem e aplicação do conhecimento; comunicação; mobilidade; cuidado pessoal; vida doméstica; educação, trabalho e vida econômica; relações interpessoais; vida comunitária, social e cívica; tarefas e demandas gerais |
| **Funções do corpo** (b) | Médica | Funções mentais, sensoriais, da voz e fala, cardiovasculares, digestivas, neuromusculoesqueléticas etc. |

Qualificadores: **N** nenhuma (0–4%), **L** leve (5–24%), **M** moderada (25–49%),
**G** grave (50–95%), **C** completa (96–100%). A combinação dos componentes, pela tabela
conclusiva da portaria, define se há deficiência; em geral, grau **leve** nas atividades e
participação leva ao indeferimento.

Criança e adolescente: avalia-se o impacto da limitação no desempenho e na participação
**compatíveis com a idade** (Decreto 6.214/2007, art. 4º) [CONFERIR parágrafo].

Não confundir com o **IFBr-M** da aposentadoria da pessoa com deficiência (LC 142/2013),
que é outro instrumento.

## 3. Como refazer

1. Buscar no processo administrativo (`ver_analise_previdenciaria` → leitura do PA;
   `abrir_documento` para conferir) a **avaliação social** e a **médica**, com os
   qualificadores atribuídos a cada domínio e a página.
2. Montar o quadro:

```
Domínio | Qualificador do INSS | O que a prova mostra (doc., página) | Qualificador defendido
```

3. Apontar os erros típicos:
   - avaliação social **não feita** ou feita sem visita, só por entrevista curta;
   - fatores ambientais dados como "facilitadores" sem base (ex.: diz que há transporte
     adaptado onde não há);
   - qualificador leve em cuidado pessoal ou mobilidade contra laudo que descreve
     dependência;
   - doença tratada como **temporária** quando os laudos mostram evolução de anos;
   - criança avaliada com régua de adulto;
   - renda calculada com pessoa que não mora na casa, ou com benefício que deveria ser
     excluído (§ 14), ou sem descontar gastos com saúde.
4. Concluir com a tabela conclusiva refeita: **deficiência reconhecível? sim/não/depende de
   prova X**.
5. Conferir a renda com os dados do usuário (quem mora na casa, quanto cada um recebe, de
   onde) e o CadÚnico.

## 4. Caminho

| Situação | Caminho |
|---|---|
| Erro de cadastro (CadÚnico desatualizado, grupo errado) | Corrigir no CRAS e **novo requerimento** — mais rápido que discutir |
| Erro de avaliação com prova forte | **Recurso ao CRPS** em 30 dias da ciência (Decreto 3.048/99, art. 305) ou ação |
| Prazo perdido, prova a produzir em juízo | **Ação no JEF**, pedindo **perícia médica e avaliação social** (Súmula 80 da TNU) |
| Miserabilidade acima de 1/4 | Ação com prova de gastos e da realidade da casa (Temas 27 e 312 do STF; § 11) |

Âncoras da TNU para conferir antes de citar: Súmula 80 (avaliação social indispensável),
Súmula 48 (conceito de impedimento de longo prazo), Súmula 29 (incapacidade para a vida
independente não exige dependência total) [CONFERIR redação atual de todas].

## 5. Entrega

- Resumo no chat (formato da SKILL.md).
- Quadro domínio a domínio.
- Lista do que juntar: laudos com CID e **descrição das limitações** (não só o diagnóstico),
  relatórios escolares ou de terapias, receitas e notas de gastos, declaração de quem cuida,
  fotos da moradia quando relevante, CadÚnico atualizado.
- Se pedido: recurso ao CRPS ou petição inicial, com os quesitos da perícia médica e da
  avaliação social (ver `quesitos-pericia-medica.md`, bloco BPC).
