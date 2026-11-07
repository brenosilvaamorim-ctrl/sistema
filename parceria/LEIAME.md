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
   um login válido. Ganharam a conferência `doEscritorio(req)`: `gerar-documento`,
   `minutar-peca`, `absorver-peca`, `custo-api` e `redigir-informativo`. **Essas precisam
   ser reimplantadas no Supabase** — o arquivo daqui não é o que roda lá.

   Ficaram de fora, de propósito, por eu não saber quem as chama hoje:
   `registrar-achado` (escreve na base de conhecimento; chamada pelas skills) e
   **`migrar-08`**, que roda DDL arbitrário e, se ainda estiver implantada, é um buraco
   para qualquer login — era de uso único e o melhor é apagá-la do Supabase.

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

## O que não vem para esta porta

Captação, WhatsApp, notas fiscais, teses, playbook, jurimetria, métricas, auditoria,
configurações, previdenciário e a área da casa. Não por omissão da tela: por não existir
política nenhuma para a parceira nessas tabelas.
