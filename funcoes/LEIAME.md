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

## Quem pode chamar cada função

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
- `DATAJUD_API_KEY`
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
   personalizado. URL: `https://wrdfyudabvvpvfcrvvzd.supabase.co/functions/v1/mcp-escritorio`.
   Autenticação: **sem login**. Em cabeçalhos da requisição: `Authorization` com o valor
   `Bearer <o token>`.

**Cortar o acesso:** troque ou apague o segredo `MCP_TOKEN`. O conector para na hora.

**Privacidade:** com dados de clientes, deixe desligada no Claude a opção de usar as
conversas para melhorar os modelos (Configurações → Privacidade).
