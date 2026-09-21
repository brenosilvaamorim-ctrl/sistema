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
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
  (estas quatro o Supabase preenche sozinho)

Os valores nunca vêm para este repositório, que é público.

## Manter atualizado

Quando uma função for alterada no Supabase, o arquivo correspondente aqui deve ser
substituído na mesma hora — senão a cópia envelhece sem ninguém perceber.
