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
