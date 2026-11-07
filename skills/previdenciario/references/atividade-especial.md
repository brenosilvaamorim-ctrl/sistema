# Modo A — Parecer de atividade especial

Objetivo: dizer, período por período, se o tempo deve ser reconhecido como especial, com que
prova, com que risco e o que falta. Redigido em 07/11/2026; teses marcadas **[CONFERIR]**
exigem checagem antes de ir para a peça.

## 1. Dados de entrada

- `ver_analise_previdenciaria`: vínculos (empresa, datas, função quando houver) e o bloco
  "especiais" lido dos PPP, LTCAT e laudos (empresa, período, função, agentes, intensidade,
  EPI eficaz S/N, responsável técnico, página).
- `abrir_documento` no PPP/LTCAT para conferir: campos 15 (exposição a fatores de risco:
  tipo, agente, intensidade, técnica utilizada, EPC/EPI eficaz, CA), 16 (responsável pelos
  registros ambientais, com período) e 14 (profissiografia).
- Do usuário, se faltar: função real e rotina, empresa ativa ou extinta, outros documentos
  (CTPS com função, laudos de ação trabalhista, PPRA/PGR).

## 2. Enquadramento pela data da prestação (tempus regit actum)

| Período | Como se prova | Base |
|---|---|---|
| Até 28/04/1995 | Por **categoria profissional** (função na CTPS basta, se constar dos anexos) ou por **agente** com formulário. Ruído e calor sempre com laudo. | Anexo do Decreto 53.831/64 e Anexos I e II do Decreto 83.080/79 |
| 29/04/1995 a 05/03/1997 | Fim da categoria. Exposição **permanente, não ocasional nem intermitente**, por formulário (SB-40, DSS-8030 e similares). Laudo só para ruído e calor. | Lei 9.032/95 |
| 06/03/1997 em diante | Formulário **com base em laudo técnico** (LTCAT). Agentes do Anexo IV do Decreto 2.172/97 e, a partir de 07/05/1999, do Anexo IV do Decreto 3.048/99. | MP 1.523/96 (Lei 9.528/97); Decreto 2.172/97 |
| 01/01/2004 em diante | **PPP** como documento próprio. Com responsável técnico pelos registros ambientais, dispensa o LTCAT. | Decreto 4.032/2001; IN do INSS [CONFERIR IN vigente] |
| Depois de 13/11/2019 | Tempo especial **não converte** em comum. Aposentadoria especial com idade mínima ou pontos na transição. Vedado o enquadramento por categoria ou ocupação. | EC 103/2019, arts. 19, § 1º, 21 e 25, § 2º |

Fatores de conversão (até 13/11/2019): 25 anos → homem 1,4 / mulher 1,2; 20 anos → 1,75 / 1,5;
15 anos → 2,33 / 2,0. O sistema já aplica (tabela `PREV_CONV`).

## 3. Agentes mais frequentes

**Ruído** (limite de tolerância pela data):
- até 05/03/1997: acima de **80 dB(A)**;
- 06/03/1997 a 18/11/2003: acima de **90 dB(A)**;
- a partir de 19/11/2003: acima de **85 dB(A)** (Decreto 4.882/2003), sem retroagir
  (STJ, Tema 694).
- Metodologia: a partir de 19/11/2003, NHO-01 da Fundacentro ou NR-15 informada no PPP; se o
  PPP não indicar, cabe exigir o LTCAT (TNU, Tema 174) [CONFERIR redação].
- Ruído variável: nível de exposição normalizado (NEN) quando houver; na falta, o pico, se
  a perícia indicar habitualidade (STJ, Tema 1083) [CONFERIR].
- **EPI não afasta** o ruído acima do limite (STF, Tema 555, ARE 664.335).

**Agentes químicos**: até 05/03/1997, avaliação qualitativa. Depois, quantitativa para os do
Anexo 11 da NR-15 e qualitativa para os do Anexo 13 (hidrocarbonetos, óleos minerais etc.).
**Cancerígenos** da LINACH, grupo 1: basta a presença no ambiente, e o EPI não afasta
(art. 68, § 4º, do Decreto 3.048, redação do Decreto 8.123/2013) [CONFERIR tema TNU/STJ].

**Agentes biológicos**: estabelecimentos de saúde e afins; exige contato habitual com
pacientes ou material infectocontagioso, avaliação qualitativa [CONFERIR].

**Calor**: IBUTG acima do limite do Anexo 3 da NR-15 para o tipo de atividade.

**Eletricidade acima de 250 V**: o rol do decreto é exemplificativo; reconhecível depois de
05/03/1997 com prova da exposição (STJ, Tema 534). Depois da EC 103, discute-se se a
periculosidade ainda enquadra [CONFERIR].

**Vigilante**: reconhecível com ou sem arma de fogo, inclusive depois de 1995, com prova da
nocividade (STJ, Tema 1031). Mesmo alerta da EC 103 [CONFERIR].

## 4. EPI eficaz no PPP

- Ruído: irrelevante (Tema 555).
- Demais agentes: o PPP com "EPI eficaz: S" afasta, em princípio, o tempo especial; cabe ao
  segurado demonstrar a ineficácia (inadequação ao risco, CA ausente ou vencido, falta de
  troca, higienização, treinamento); havendo dúvida, decide-se a favor do segurado
  (STJ, Tema 1090) [CONFERIR redação final].
- Cancerígenos (LINACH 1): o EPI não afasta.
- Antes de 03/12/1998 (MP 1.729/98, Lei 9.732/98) o EPI não era considerado
  [CONFERIR posição atual do INSS e da TNU].

## 5. Vícios comuns do PPP e como contornar

| Vício | Efeito | Saída |
|---|---|---|
| Sem responsável técnico no período (campo 16) | PPP pode não servir sozinho (TNU, Tema 208) [CONFERIR] | Pedir LTCAT à empresa; declaração de que o layout não mudou; perícia |
| Intensidade ausente ou "abaixo do limite" sem técnica | Risco de não reconhecer | LTCAT, PPRA/PGR, laudo de ação trabalhista como prova emprestada |
| PPP feito anos depois (extemporâneo) | Vale (Súmula 68 da TNU) | Indicar se houve mudança no ambiente |
| Empresa extinta | Sem PPP | Perícia por similaridade em empresa do mesmo ramo; prova emprestada |
| Função na CTPS diferente da real | Enquadramento errado | Prova da função real (testemunhas, fichas) |
| Recusa da empresa em fornecer | — | Requerer ao juízo a expedição ou a perícia; reclamação na Justiça do Trabalho para retificação [CONFERIR competência] |

Outras âncoras: auxílio-doença comum durante atividade especial conta como especial
(STJ, Tema 998); contribuinte individual pode ter tempo especial (Súmula 62 da TNU); quem se
aposenta na especial não pode seguir na atividade nociva (STF, Tema 709).

## 6. Estrutura do parecer

Para **cada período**:

```
Período: dd/mm/aaaa a dd/mm/aaaa — Empresa — Função
Prova: PPP (p. x) / LTCAT (p. y) / CTPS (p. z)
Agente e intensidade: ... (técnica: ...)
Regra da época: ... (limite ...)
EPI: ... ; Responsável técnico: sim/não no período
Conclusão: RECONHECER | RECONHECER COM PROVA ADICIONAL | NÃO RECONHECER
Por quê: <2 a 4 linhas, com a norma e o tema>
Falta / risco: ...
```

Depois:
1. **Quadro-resumo** dos períodos e da conclusão.
2. **Efeito provável**: "com os períodos X e Y como especiais, o tempo do sistema muda" —
   sem recalcular à mão; mande marcar os vínculos como especiais no sistema (aba Vínculos)
   e salvar a simulação para ver a regra e a RMI.
3. **Provas a produzir**, em ordem de força: LTCAT, retificação do PPP, perícia, prova
   emprestada, testemunhas (só complementares).
4. **Via**: requerimento administrativo com os documentos, recurso ao CRPS (30 dias da
   ciência) ou ação no JEF (com pedido de perícia técnica quando o PPP falhar).
