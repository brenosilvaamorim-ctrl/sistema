---
name: previdenciario
description: "Trabalho previdenciário (RGPS, lado do segurado) apoiado no sistema do escritório: parecer de atividade especial a partir de PPP, LTCAT e laudos; análise do BPC/LOAS da pessoa com deficiência refazendo a avaliação biopsicossocial; quesitos médicos e preparação do cliente para a perícia; impugnação de laudo pericial desfavorável; roteiro de audiência (depoimento do autor e testemunhas) com o que cada pergunta prova. Use SEMPRE que o usuário falar em aposentadoria especial, tempo especial, PPP, LTCAT, ruído, agente nocivo, EPI, BPC, LOAS, pessoa com deficiência, avaliação social, biopsicossocial, perícia médica do INSS ou judicial, quesitos, auxílio por incapacidade, aposentadoria por incapacidade permanente, auxílio-acidente, laudo pericial, impugnar laudo, segurado especial, trabalhador rural, união estável para pensão, testemunhas ou audiência em caso previdenciário. Acione mesmo sem dizer skill."
---

# Previdenciário: parecer, perícia e prova

## 1. O que esta skill faz

Cinco trabalhos que pedem leitura e redação, feitos no Claude com os dados do sistema do
escritório (conector **Sistema do escritório**). O cálculo de tempo, regras e RMI continua
sendo o do sistema: esta skill não recalcula benefício, lê o que o sistema já apurou.

| Modo | Pedido típico | Entrega | Referência |
|---|---|---|---|
| **A. Atividade especial** | "faça o parecer do tempo especial do fulano" | Parecer por período + o que marcar no sistema + provas a produzir | `references/atividade-especial.md` |
| **B. BPC/LOAS da pessoa com deficiência** | "o INSS negou o BPC, refaça a avaliação" | Avaliação refeita domínio a domínio + caminho (novo pedido, recurso ou ação) | `references/bpc-deficiencia.md` |
| **C. Quesitos médicos** | "quesitos para a perícia do auxílio" | Petição de quesitos + roteiro de preparação do cliente | `references/quesitos-pericia-medica.md` |
| **D. Impugnação de laudo** | "o laudo veio desfavorável" | Manifestação sobre o laudo com esclarecimentos e, se couber, nova perícia | `references/impugnacao-laudo.md` |
| **E. Audiência** | "prepare a audiência do rural" | Roteiro de prova oral: fato, pergunta, o que prova, plano B | `references/audiencia-previdenciaria.md` |

Leia **só** a referência do modo pedido (e a de outro modo se o caso exigir, como D depois de C).

## 2. Regras de conduta (inegociáveis)

1. **Não invente fato, data, documento nem precedente.** Fato vem do sistema, dos documentos
   ou do usuário. O que faltar vira pergunta, não suposição.
2. **Jurisprudência só confirmada.** As referências foram redigidas em 07/11/2026 e trazem
   teses que mudam (Temas do STF, STJ e TNU). Antes de citar em peça, confirme a redação e
   a vigência no **JusRatio** (se estiver conectado) ou marque `[CONFERIR: tema/súmula]`.
   Itens já marcados **[CONFERIR]** nas referências nunca vão para a peça sem checagem.
3. **Cite a página.** Todo fato tirado de documento leva a fonte: `(PPP, p. 3)`,
   `(PA, p. 41)`. O conector informa a página do que foi lido.
4. **O conector só lê.** Nada é gravado no sistema. Quando a conclusão mudar o cálculo (um
   período passa a especial, um vínculo precisa de correção), diga ao usuário **o que
   ajustar na tela** do sistema e para salvar uma nova simulação.
5. **Não prepare mentira.** Na perícia e na audiência, a skill organiza o que o cliente e
   as testemunhas sabem e antecipa perguntas; nunca sugere resposta para decorar nem
   "ajusta" versão (art. 342 do CP; ética profissional).
6. **Minuta para revisão.** Tudo é rascunho para o advogado decidir.
7. **Sigilo.** Use dados de saúde só no necessário para o trabalho pedido.

## 3. Como buscar os dados (conector)

Ferramentas do conector **Sistema do escritório**:

| Ferramenta | Para quê |
|---|---|
| `buscar` | Achar cliente, caso, processo ou análise pelo nome, CPF ou número. Devolve os ids. |
| `ver_caso` | Caso inteiro: processos e movimentações, prazos, agenda, fatos, documentos, minutas. |
| `ver_analise_previdenciaria` | Vínculos do CNIS, tempo, lacunas, pendências, simulações salvas e **o que a IA do sistema já leu** do processo administrativo, PPP, LTCAT e laudos (com página). |
| `ver_remuneracoes` | Competência a competência de um vínculo (meses abaixo do mínimo, extemporâneos). |
| `abrir_documento` | Abre o PDF guardado (CNIS, PA, PPP, laudo) para leitura direta. |
| `ler_texto` | Texto já extraído de um documento do caso, em partes. |
| `prazos_e_agenda` | Prazos e audiências (para saber o prazo de quesitos, de manifestação, a data da audiência). |
| `base_previdenciaria` | Normas, súmulas e temas guardados na base do sistema. |

Fluxo padrão: `buscar` → `ver_analise_previdenciaria` (ou `ver_caso`) → `abrir_documento`
só para o que precisar ler por inteiro ou conferir. Se o conector não estiver disponível,
trabalhe com os arquivos que o usuário anexar e diga que não consultou o sistema.

Se a leitura do sistema e o PDF divergirem, **vale o PDF**; aponte a divergência.

## 4. Fluxo comum aos cinco modos

1. **Identificar o modo** pelo pedido. Se ambíguo, pergunte uma vez.
2. **Levantar os dados** (seção 3) e listar o que falta. Pergunte ao usuário só o que não
   estiver no sistema nem nos documentos.
3. **Conferir o prazo** em `prazos_e_agenda` quando houver peça a protocolar e diga quantos
   dias restam.
4. **Seguir a referência do modo**, na ordem dela.
5. **Entregar**: resumo curto no chat (conclusão primeiro, depois riscos e pendências) e a
   peça ou o roteiro em Word quando pedido. Para o estilo de redação, siga a skill
   `redigir-peca` se ela estiver disponível; senão, texto direto, fatos antes de adjetivos,
   seções numeradas.
6. **Fechar com o que fazer no sistema** (regra 4) e as provas a buscar.

## 5. Formato do resumo no chat

```
Conclusão: <uma ou duas frases>
Pontos fortes: <até 3>
Riscos: <até 3, com o que os resolve>
Falta: <documentos ou informações>
No sistema: <o que ajustar e salvar>
Prazo: <data e dias restantes, se houver>
```
