# funcoes/ — as funções automáticas (Supabase Edge Functions)

São os programas que rodam no servidor, fora da tela: os robôs que leem o DJEN e o
DataJud, o aviso de prazos por e-mail, os backups, a agenda para o Google, a leitura de
documentos e extratos e a redação de minutas.

Cada arquivo aqui é o `index.ts` da função de mesmo nome no Supabase
(Edge Functions → nome da função → Code). Ex.: `robo-djen.ts` é o código da função
`robo-djen`.

## Como restaurar uma função

Supabase → Edge Functions → **Deploy a new function → Via Editor**, com o mesmo nome,
colando o conteúdo do arquivo. Ou, pela linha de comando, criar
`supabase/functions/<nome>/index.ts` com o conteúdo e rodar `supabase functions deploy <nome>`.

## O robô do DataJud e o 429

Medido em 08/11/2026, à 1h da manhã. O robô pede um lote de 60 processos e a API pública do
CNJ responde **HTTP 429 — requisições demais** em quase todos, ou simplesmente não responde.
Conferido também por fora, chamando a API direto: 429 na primeira tentativa, e nenhuma
resposta em 20 segundos nas duas seguintes. O gargalo é do CNJ, não daqui.

Isso vinha acontecendo havia muito tempo, sem aparecer: no Deno o `fetch` não tem prazo
padrão, então o processo cuja resposta não voltava segurava o laço até a plataforma matar a
função — e quem é morto não devolve relatório. O sintoma visível era `546` no registro e
1 ou 2 processos sincronizados por rodada, de 60 pedidos.

O que foi feito: prazo de 8 s por consulta, e a rodada para sozinha aos 110 s e devolve
`parou_por_tempo`, `segundos` e a lista de erros. Não acelera nada — **mostra**. Sem isso,
nada disto seria descoberto.

O que ainda dá para fazer: ao levar 429, o robô espera 300 ms e desiste daquele processo.
O certo é recuar e tentar o mesmo de novo (2 s, 4 s, 8 s), para aproveitar a brecha quando
a API abrir, em vez de queimar a janela batendo em porta fechada. E pedir menos: 290
processos por dia é mais do que o escritório precisa olhar.

## Quem pode chamar cada função

*Conferido em 07/11/2026, nas três direções, nas onze funções implantadas.*

- Só com a **chave pública** (a que está escrita na página, ao alcance de qualquer um):
  **403** nas onze — `robo-djen`, `robo-datajud`, `robo-previdencia`, `aviso-prazos`,
  `backup-semanal`, `registrar-achado`, `gerar-documento`, `minutar-peca`,
  `absorver-peca`, `custo-api` e `redigir-informativo`.
- **Exatamente como o agendador chama** (chave pública no `apikey` e `?chave=` com o
  `robo_token`): passa, e a função segue para o que ela faz.
- **Chave errada, do mesmo tamanho**: 403. **Sem chave e sem login**: 403.
  **Com o login do escritório**: passa.

Antes de trocar cada função, conferi que o código implantado era, byte a byte, o mesmo do
repositório — tamanho, número de linhas e soma de verificação. Nenhuma tinha edição feita
direto no painel.

Toda função que responde com a **chave de serviço** (que ignora a RLS) confere quem está
pedindo, por `doEscritorio(req)`. Passam três:

1. a própria chave de serviço no `Authorization`;
2. um login do escritório — alguém com linha ativa em `usuario`;
3. a **chave dos robôs**, em `?chave=` ou no cabeçalho `x-chave-robo`: é o
   `escritorio.robo_token`, criado pelo banco em `banco/46_chave_dos_robos.sql`. As tarefas
   do `pg_cron` a leem no momento da chamada. O valor não está em lugar nenhum fora do banco.

Quem não passa recebe `403 acesso restrito ao escritório`.

Têm conferência própria, e por isso ficaram como estavam: `backup-diario` (token na URL,
conferido contra `escritorio.backup_token`), `agenda-ics` e `google-sync` (`agenda_token`),
`google-oauth` (nonce guardado no banco), `whatsapp-bot` (segredo no endereço do webhook,
comparado em tempo constante), `convidar-membro` (exige perfil titular) e `nota-fiscal`.

`consulta-meet` também tem conferência própria, e desde a parceria ela tem duas portas: aceita
um login ativo em `usuario` **ou** um membro ativo de parceria ativa. O do escritório só mexe em
evento do escritório dele; o da parceria, só em evento carimbado com a parceria dele. A sala
nasce na conta do Google do escritório, que é a única que existe — a consulta é do escritório,
marcada a quatro mãos. Ninguém ganha acesso à agenda por isso: ganha o direito de pedir a sala
de um compromisso que já é seu.

`painel` não precisa: é só a casca HTML, e todo dado dela vem com a sessão de quem abriu.

`ler-documento` e `ler-extrato` **não** usam a chave de serviço — rodam com o login de quem
chamou, então a RLS vale. Aceitam qualquer login válido de propósito, porque a área da casa
(`familia/`) usa o `ler-extrato`. O que elas expõem a um convidado não é dado, é gasto de
API; se isso incomodar, o caminho é um teto de gasto na Anthropic, não uma trava aqui.

Para chamar uma função protegida à mão, use a sessão do escritório (o `access_token` do
login) no `Authorization`. A chave pública da página **não** serve mais para isso.

## Segredos

Nenhuma chave está escrita no código: todas são lidas de variáveis de ambiente
(`Deno.env.get(...)`). Na restauração, elas precisam estar em
Supabase → Edge Functions → **Secrets**:

- `ANTHROPIC_API_KEY`, `ANTHROPIC_ADMIN_KEY`
- `RESEND_API_KEY`, `ALERTA_EMAIL_DE`, `ALERTA_EMAIL_PARA`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- ~~`DATAJUD_API_KEY`~~ — **não existe e não precisa existir.** No DataJud público do CNJ a
  chave é uma só, divulgada na documentação e igual para todo mundo; ela já está escrita no
  `robo-datajud.ts`. Não há chave privada para pedir, e por isso a fila é compartilhada com
  o país inteiro — ver a seção sobre o 429, abaixo.
- `NFSE_CERT_PFX_B64`, `NFSE_CERT_SENHA` — certificado A1 do escritório para a nota fiscal (ver abaixo)
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
  (estas quatro o Supabase preenche sozinho)

Os valores nunca vêm para este repositório, que é público.

## Nota fiscal (função `nota-fiscal`)

Emite NFS-e direto no Emissor Nacional (Sefin Nacional), assinando com o certificado
A1 do escritório. Regras de preenchimento e fontes: `fiscal/guia-nfse-advocacia.md`.

**Instalar, na ordem:**

1. **Banco** — Supabase → SQL Editor → rodar `banco/30_notas_fiscais.sql`.
2. **Certificado** — no Mac, transformar o `.pfx` em texto e copiar:
   `base64 -i certificado.pfx | pbcopy`
   Supabase → Edge Functions → Secrets: `NFSE_CERT_PFX_B64` = (colar) e
   `NFSE_CERT_SENHA` = a senha do certificado. O arquivo e a senha nunca vêm para cá.
3. **Função** — Deploy a new function → Via Editor, nome `nota-fiscal`, colando
   `funcoes/nota-fiscal.ts`. Deixe "Verify JWT" ligado.
4. **Tela** — publicar o `index.html`. O menu ganha *Escritório → Notas fiscais*.
5. **Testar** — em Notas fiscais → Configuração, *Testar certificado e conexão*. Depois,
   emitir uma nota no modo de teste (produção restrita), que não tem valor fiscal.
   Só então o titular troca o ambiente para Produção.

**Se o teste de conexão falhar sem resposta (erro de rede):** a API do governo exige
TLS mútuo (a conexão se identifica com o certificado). Há relato (set/2026) de que o
runtime do Supabase passou a derrubar a função ao usar certificado de cliente. A
função já entrega a chave no formato PKCS#8, que é a correção indicada. Se ainda
assim falhar, o plano B é um pequeno repasse (Cloudflare Worker com certificado mTLS)
só para a chamada ao governo; a assinatura continua aqui.

**Quando renovar o certificado** (vale 1 ano): repetir o passo 2 com o novo `.pfx`.

## Manter atualizado

Quando uma função for alterada no Supabase, o arquivo correspondente aqui deve ser
substituído na mesma hora — senão a cópia envelhece sem ninguém perceber.

## Robô da previdência (função `robo-previdencia`)

Alimenta a base de conhecimento do módulo Previdenciário (Previdenciário → Base). Toda
segunda às 7h lê o Diário Oficial (instruções normativas do INSS, portarias DIRBEN,
interministeriais e conjuntas, leis, decretos e MPs), o banco de precedentes do CNJ
(temas e súmulas do STF, STJ, TNU, TRF1 e TRF5), o INPC do IBGE e as notícias da TNU no
CJF. Tudo vira sugestão na fila `prev_atualizacao`; nada muda a base nem as tabelas de
cálculo sem a decisão do titular na tela. Não usa chave nem IA: só fontes públicas.

**Instalar:**

1. **Banco** — Supabase → SQL Editor → rodar `banco/39_previdenciario_base.sql` (cria as
   tabelas, o acervo inicial e a foto inicial do CNJ) e depois `banco/41_previdenciario_robo_fontes.sql`
   (o agendamento: segunda às 7h, 7h05, 7h10 e 7h15, uma fonte por chamada — `?fonte=ibge|dou|cnj|cjf`;
   ler as quatro de uma vez estoura o limite de tempo das funções).
2. **Função** — Deploy a new function → Via Editor, nome `robo-previdencia`, colando
   `funcoes/robo-previdencia.ts`. **Desligue "Verify JWT"** (como no `robo-datajud`): o
   agendamento chama só com a chave pública.
3. **Testar** — Previdenciário → Base → Tabelas e robô → *Rodar agora*. As quatro leituras levam
   um ou dois minutos e aparecem no registro logo abaixo.

**Se uma fonte falhar** (o site mudou ou ficou fora do ar), o registro mostra qual. As outras
seguem normalmente, e a que falhou busca desde a última vez em que deu certo na rodada seguinte.

## Conector do Claude (função `mcp-escritorio`)

Deixa o Claude (claude.ai e Claude Desktop) consultar o sistema numa conversa: buscar
clientes e casos, ver o caso inteiro, a análise previdenciária, as remunerações do CNIS,
os prazos e a agenda, a base de normas e abrir os PDFs guardados. **Só lê**: nenhuma
ferramenta grava. Cada consulta fica no histórico (`historico`, entidade `mcp`).
O uso sai da assinatura do Claude, não do crédito da API.

**Instalar:**

1. **Segredo** — gere um token longo no Terminal (ele vai direto para a área de
   transferência, sem aparecer na tela): `openssl rand -hex 32 | pbcopy`. Em Supabase →
   Edge Functions → **Secrets**, crie `MCP_TOKEN` e cole. Guarde o token num cofre de
   senhas: ele é a chave do conector.
2. **Função** — Edge Functions → Deploy a new function → Via Editor, nome
   `mcp-escritorio`, colar `mcp-escritorio.ts`. Em Settings da função, **desligar
   "Verify JWT"** (quem confere o acesso é o próprio código, pelo `MCP_TOKEN`).
3. **Claude** — claude.ai → Configurações → Conectores → Adicionar conector
   personalizado. URL com o token no fim:
   `https://wrdfyudabvvpvfcrvvzd.supabase.co/functions/v1/mcp-escritorio/k/<o token>`.
   Autenticação: **sem login**, sem cabeçalho. (O cabeçalho `Authorization: Bearer <token>`
   também é aceito pela função, mas o claude.ai recusa cabeçalho fixo em conector sem
   login — erro `static_headers_probe_rejected`, nov/2026 — sem nem chamar o servidor.)
   Para montar a URL sem o token aparecer na tela:
   `printf 'https://wrdfyudabvvpvfcrvvzd.supabase.co/functions/v1/mcp-escritorio/k/%s' "$(pbpaste)" | pbcopy`
   com o token na área de transferência.

**Cortar o acesso:** troque ou apague o segredo `MCP_TOKEN`. O conector para na hora.
Depois de trocar, exclua o conector no claude.ai e crie outro com a URL nova.

**Quando não conecta:** cada chamada deixa uma linha `[mcp]` nos logs da função
(Edge Functions → mcp-escritorio → Logs), com método, caminho (token mascarado), se o
token veio e bateu, e o programa que chamou. Se nenhuma linha aparece, o problema está
no cliente, não na função.

**Privacidade:** com dados de clientes, deixe desligada no Claude a opção de usar as
conversas para melhorar os modelos (Configurações → Privacidade).
