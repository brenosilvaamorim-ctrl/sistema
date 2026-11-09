# parceria/ — a área da parceria

Terceiro aplicativo do mesmo sistema, publicado em
`sistema.brenosamorimadvocacia.com.br/parceria/`. Serve para dividir trabalho com advogado
de fora — a primeira é a parceria com a advogada Paula Marcula.

`index.html` aqui é a tela dessa área, como o `index.html` da raiz é a tela do escritório e
o de `familia/` é o da casa. Os três falam com o mesmo banco (Supabase), com regras de
acesso diferentes:

- o escritório exige uma linha em `usuario` (`meu_escritorio()`);
- a família exige uma linha em `familia_membro` (`minha_familia()`);
- a parceria exige uma linha em `parceria_membro` (`minha_parceria()`).

Quem entra numa porta não enxerga o outro lado. A separação é feita no banco, não no menu:
ver `banco/44_parceria.sql`.

## O que esta porta tem de diferente das outras duas

A família tem tabelas próprias (`pessoal_*`), e por isso separá-la foi simples. A parceria
**divide as tabelas do escritório** — é esse o ponto dela. Um caso em parceria não é uma
cópia: é a mesma linha de `caso`, com dois carimbos. O `escritorio_id` de sempre, que faz
o escritório vê-la, e um `parceria_id` novo, que faz a parceria vê-la. Por isso o que se
cadastra de um lado aparece do outro na hora: não foi a lugar nenhum.

O carimbo vai junto para o que pende do caso — cliente, processo, prazo, agenda,
lançamento e intimação —, e o que chegar depois nasce carimbado, por gatilho. Marcar e
desmarcar se faz na tela do caso, no sistema do escritório.

## Por que a parceira não alcança o escritório

Ela **não tem linha em `usuario`**. Toda regra de acesso do escritório compara
`escritorio_id` com `meu_escritorio()`, que lê `usuario` pelo login: para ela a função
devolve nulo, a comparação dá nulo, e a regra nega. Isso vale para as dezenas de tabelas
que existem hoje e para as que vierem — a negação é o padrão, e não uma lista que alguém
precise manter. Ela só alcança o que `44_parceria.sql` abriu, nome por nome.

Se ela digitar o endereço do sistema do escritório, a página carrega e não vem dado nenhum.

## O que ela pode e o que não pode

Pode abrir caso, cadastrar cliente e processo, lançar e dar baixa no dinheiro da parceria,
marcar na agenda, dar baixa em publicação e trocar recados.

**Não pode apagar** caso, cliente, processo nem lançamento: essas tabelas já tinham
políticas restritivas exigindo `pode(...)`, que lê `usuario`. Pela porta da parceria se
encerra e se corrige, não se apaga. Também não pode mudar o `escritorio_id` de uma linha —
seria fazê-la sumir do sistema do escritório — e o gatilho devolve o valor anterior.

Os campos que apontam para `usuario` (`responsavel_id`, `criado_por`, `lida_por`) ficam em
branco no que ela cria, porque ela não está naquela tabela. Quem fez o quê está na
auditoria, pelo nome — `anotar()` passou a procurar também em `parceria_membro`.

## Convidar e desligar

Sistema do escritório → **Escritório → Configurações → Parceria com advogado de fora**.
O convite é por e-mail e vale antes de a pessoa existir: ela entra em `/parceria/` com esse
e-mail, por link, como na área da família. Desligar corta o acesso na hora, sem apagar nada.

## Duas coisas que esta porta expôs, e que não eram dela

Enquanto todo login era do escritório, nada disto importava. Passa a importar no instante
em que existe um login que não é.

1. **As visões ignoravam a RLS.** No Postgres, uma visão roda com os privilégios de quem a
   criou. As sete visões do sistema (`caso_quadro`, `cliente_painel`, `processo_painel`,
   `mensageria_painel`, `movimentacao_traduzida`, `caso_competencia`, `google_conta_visao`)
   foram criadas sem `security_invoker`: qualquer login com acesso a elas lia o escritório
   inteiro, por fora das regras. **Corrigido em `44_parceria.sql`.**

2. **Funções de borda que respondem com a chave de serviço** (que ignora a RLS) só exigiam
   um login válido. Ganharam a conferência `doEscritorio(req)` — `gerar-documento`,
   `minutar-peca`, `absorver-peca`, `custo-api` e `redigir-informativo` —, **implantadas no
   Supabase em 07/11/2026**. Conferido nos dois sentidos: chamadas só com a chave pública
   respondem 403 "acesso restrito ao escritório"; chamadas com o login do escritório passam.

   **`migrar-08` foi apagada do Supabase** no mesmo dia. Ela não pedia login nenhum que
   valesse: com a chave pública, que está na página, qualquer um a executava, e ela abre
   conexão de dono no banco para rodar DDL. Era de uso único; o código continua aqui, em
   `funcoes/migrar-08.ts`, idêntico ao que estava implantado, caso um dia volte a ser preciso.

   Ficou de fora, de propósito, `registrar-achado` (escreve na base de conhecimento; chamada
   pelas skills), por eu não saber ainda quem a chama de fora do escritório.

## O teste da parede, 07/11/2026

Feito com um login de fora de verdade (`brenosilvaamorim+teste@gmail.com`), que entrou por
link de e-mail e virou membro da parceria. Da sessão dele, e não da tela:

- **Ler o escritório:** `caso`, `cliente`, `processo`, `lead`, `lancamento`, `intimacao`,
  `movimentacao`, `prazo`, `evento`, `usuario`, `escritorio`, `tese`, `honorario`,
  `parceiro`, `oab` e `auditoria` responderam **0 linhas** — num banco com 306 casos e 270
  clientes. `meu_escritorio()` devolveu nulo; `sou_parceira()`, verdadeiro.
- **As sete visões** (`caso_quadro`, `caso_competencia`, `cliente_painel`,
  `processo_painel`, `mensageria_painel`, `movimentacao_traduzida`, `google_conta_visao`):
  **0 linhas** cada. Era por aí que vazava antes do `security_invoker`.
- **Funções de borda:** `gerar-documento`, `minutar-peca`, `absorver-peca` e `custo-api`
  responderam 403; `mcp-escritorio`, 401.
- **Escrever onde não devia:** abrir caso sem o carimbo da parceria, 42501; inserir-se em
  `usuario`, 42501; virar titular em `parceria_membro`, 0 linhas alteradas.
- **Com um caso da parceria na mão:** apagar, 0 linhas; tirar da parceria, 42501; trocar o
  `escritorio_id`, o gatilho devolveu o valor anterior. O caso continuou existindo, com os
  dois carimbos intactos.
- **A volta:** o caso aberto na parceria apareceu no escritório na hora, no quadro e na tela
  do caso, com a pílula *em parceria*. Depois o teste foi desfeito — caso, cliente, convite
  e login de teste apagados, e o banco voltou aos 306 casos, sem nenhuma linha carimbada.

O teste também achou um defeito, corrigido no mesmo dia: o primeiro acesso parava em
"Erro ao carregar" porque `sb.rpc(...)` não tem `.catch` — e, com isso, o
`entrar_na_parceria()` nunca rodava.

## Publicações: pelo processo, nunca pela OAB

Decisão de 07/11/2026. A captura do Diário é por OAB (`oab`, com `monitorar`), e monitorar a
OAB da parceira traria para este banco **todas** as intimações dela, inclusive de causas que
nada têm com a parceria. Não se faz isso.

O que vale é o outro lado da mecânica: o robô casa cada intimação capturada pelo **número do
processo** e, achando, a amarra ao processo e ao caso. Cadastrado o processo aqui, a
publicação dele chega carimbada e aparece nas duas portas — sem que nenhuma OAB nova entre no
monitoramento. O mesmo serve ao prazo e ao evento que o robô cria junto, e ao andamento, que
vem do DataJud por processo, e não por advogado.

**O limite disso, que é real:** a intimação só é capturada se algum advogado monitorado
estiver no processo. Nas causas em que a parceira atua sozinha, sem o escritório na
procuração, nada chega — e não há como mudar isso sem monitorar a OAB dela, que é justamente
o que se decidiu não fazer.

## As telas, e por que estas

Decisão do Breno em 08/11/2026: **o sistema do escritório inteiro vem para cá, menos o bolso
dele — mas cada tela mostra exclusivamente o que pendura num caso ou processo da parceria. As
informações não se misturam.** Nada do escritório atravessa.

O menu tem os mesmos grupos do sistema do escritório, na mesma ordem de pensamento, para quem
sabe andar lá saber andar aqui:

- **Meu dia** — Início, Prazos, Agenda (com calendário do mês), Publicações
- **Pessoas** — Captação (quadro), Clientes
- **Casos** — Casos (quadro), Processos, Andamento
- **Conversas** — Avisar o cliente, Recados, WhatsApp
- **Escrever** — Playbook, Ementas (só trabalhista; ver a seção seguinte)
- **Dinheiro** — Financeiro, Números

**A armadilha que isto escondia, e que custou um susto:** não basta a RLS filtrar. A RLS
protege a parceira, mas para um login do escritório ela não filtra nada — e a tela passa a
mostrar o escritório inteiro dentro da porta da parceria. Foi o que aconteceu quando o quadro
pediu `caso_quadro` sem filtro: abriu com 213 casos. **O filtro tem de estar na consulta**,
sempre, em toda tela daqui. Vale para `caso_quadro`, `mensageria_painel`, `bot_conversa` e
qualquer visão ou tabela que não carregue `parceria_id` na própria linha.

## A Captação daqui, e o que ela precisou

A Paula também anota lead por esta porta, e por isso a Captação não é só o quadro:

- **De onde veio, e "e também".** O lead tem duas origens, porque às vezes são duas perguntas
  diferentes: o anúncio que trouxe a pessoa e a pessoa que a trouxe. Um lead captado num
  anúncio feito em parceria é *Google* **e** *Paula*. A lista de origens que aparece aqui é
  a que o escritório marcou como visível na parceria (Escritório → Configurações → Origens de
  captação), mais as que nasceram desta porta — não é a lista inteira do escritório.
- **A ficha de atendimento, para preencher.** O coração da triagem: é a ficha que vira os
  fatos do caso e a lista de documentos, e é ela que a peça lê depois. É a mesma `ficha` e o
  mesmo `ficha_modelo` do escritório — a mesma linha, pela outra porta —, com autoguarda a
  cada campo, concluir/reabrir, "levar respostas para os fatos" e "cobrar os documentos que
  faltam". Duas coisas ficaram de fora, de propósito:
  - **plantar modelo de ficha.** O escritório semeia `ficha_modelo` na primeira abertura; o
    `banco/56` abriu só a **leitura** para a parceria, e está certo — o questionário é decisão
    do escritório. Sem modelo ativo, a tela diz isso em vez de inventar um.
  - **imprimir para assinar.** O papel sai com o timbre do escritório, e o timbre mora na
    tabela `escritorio`, que a parceira não lê. Como é a **mesma** ficha, o Breno imprime do
    lado dele; não há nada a duplicar aqui.
- **A ficha em papel.** Atendimento presencial rende papel. O arquivo (PDF ou foto, até 15 MB)
  não pendura no lead: pendura na **mesma ficha** — se já houver uma do atendimento, o papel
  entra nela (antes a Captação criava uma ficha vazia só para o arquivo, e um atendimento com
  papel e questionário acabava com duas). As regras do balde `fichas` conferem a ficha pela
  **segunda** pasta do caminho (`banco/57` e `banco/60`), e é por isso que o papel anexado aqui
  aparece lá, no caso, quando o lead fechar.
- **A consulta marcada.** Igual ao escritório: dia, hora e formato — presencial, videochamada
  ou ligação. Por vídeo, a função `consulta-meet` cria o evento no Google já com a sala do
  Meet e devolve o link, na hora, para mandar à pessoa pelo WhatsApp. A sala nasce na conta
  do Google do **escritório**, a única que existe: a consulta é do escritório, marcada a
  quatro mãos. A função confere que o evento é desta parceria antes de tocar nele — ninguém
  ganha acesso à agenda por isso.

  Uma diferença proposital em relação ao escritório: lá o campo "onde" já vem com o endereço
  do escritório; aqui, não. A parceira não lê a tabela `escritorio` (e não deve), e a consulta
  em parceria pode ser no escritório de qualquer um dos dois. Quem marca escreve onde é.
- **A viabilidade.** A mesma régua e os mesmos pesos do escritório — prazo 3, prova 3, solvência
  2, testemunha 1, coerência 1 —, porque a nota tem de significar o mesmo dos dois lados. Com a
  nota igual, o mesmo lead não aparece bom numa porta e ruim na outra.
- **Pedir documentos.** A mesma lista do escritório, para o cliente receber o mesmo pedido venha
  ele por qual porta vier. Aqui o texto abre no WhatsApp de **quem está pedindo**, e não sai pela
  assistente no número do escritório: a função `whatsapp-bot` só atende quem tem linha em
  `usuario`, e falar pelo número do escritório não é coisa de se dar a quem é de fora sem o Breno
  decidir. Feito o pedido, o lead vai para "Análise de documentação" e o retorno fica em três dias.

Nas mensagens que saem daqui, quem manda se apresenta pelo **próprio nome** (o de
`parceria_membro`), e não como "o escritório". A parceira fala por si, no caso que é dos dois.

## A biblioteca: Playbook e Ementas, só de trabalhista

Decisão do Breno em 09/11/2026. São as duas primeiras telas desta porta que **não** se filtram
por `parceria_id`, e isso é proposital: tese e precedente não penduram em caso nenhum — são
material de consulta, não informação de cliente. Logo não existe carimbo para filtrar, e o que
delimita é a **matéria**: só direito do trabalho (reclamante, reclamada e acidente de trabalho),
que é `area = 'Trabalhista'`. Concursos, disciplinar, administrativo e processual civil
continuam só do lado do escritório.

**Por que isto virou visão, e não política na tabela.** O problema aqui é de coluna, não de
linha. Três campos guardam de onde o verbete veio, e o que eles guardam identifica cliente de
caso que não é da parceria:

| campo | o que há lá |
|---|---|
| `tese.origem` | a peça de onde a tese saiu: nome do cliente, parte contrária, data |
| `precedente.origem` | o mesmo, para o julgado |
| `precedente.citacao` | o trecho da peça em que o julgado foi citado, copiado de caso real |

Medido antes de escrever a regra: **136 de 136** precedentes têm `origem` preenchida, e as
distintas são quase todas nome de pessoa. RLS filtra linha, não esconde coluna — e a tela não
mostrar não é proteção, porque a API está aberta a quem tem login. Então: **nenhuma política
nova** em `tese`, `playbook` ou `precedente` (a parceira continua sem alcançar as três tabelas)
e três visões que trazem só o que pode sair — `tese_trabalhista`, `playbook_trabalhista` e
`precedente_trabalhista` (`banco/61`).

**O cuidado que essas visões exigem**, e é o inverso do que o `44` corrigiu: elas são de
propósito **sem `security_invoker`**, porque é isso que as faz atravessar a RLS das tabelas-base.
Quem protege é o `WHERE` de cada uma, e só ele. Portanto: não acrescente coluna sem olhar o que
ela guarda, não afrouxe o `WHERE`, e se um dia a parceria for a mais de uma área, mude o `WHERE`
— não a política.

É **só leitura**. Ensinar peça ao banco, fila de aprovação e carteira de revisão seguem do lado
do escritório: o acervo é dele, e quem decide o que entra nele é ele.

## O que não vem para esta porta

Notas fiscais, teses, playbook, jurimetria, auditoria, configurações, previdenciário e a área
da casa. Não por omissão da tela: por não existir política nenhuma para a parceira nessas
tabelas.
