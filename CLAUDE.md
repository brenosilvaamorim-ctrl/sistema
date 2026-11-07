# Sistema do escritório — instruções para o Claude

Este repositório é o **sistema interno do escritório Breno S. Amorim Advocacia**,
publicado em https://sistema.brenosamorimadvocacia.com.br/. Quando o Breno disser
"o sistema" ou "o sistema do escritório", é deste repositório que se trata.

## Como está montado

- **Tela:** o `index.html` da raiz é o sistema inteiro (HTML, CSS e JS num arquivo só).
  O GitHub Pages publica direto da `main`, em um ou dois minutos depois do push.
- **Banco e servidor:** Supabase, projeto `escritorio`. Os dados e as regras de acesso
  (RLS) moram lá; a tela fala com ele pelo `supabase-js`, com o login de quem abriu.
- **Funções automáticas:** Supabase Edge Functions. O código de cada uma está em
  `funcoes/<nome>.ts`; quem pode chamar cada função está em `funcoes/LEIAME.md`.
- **Estrutura do banco:** `banco/estrutura-atual.sql` é o retrato; `banco/NN_nome.sql`
  são as mudanças posteriores, numeradas. Ver `banco/LEIAME.md`.

## Regras de trabalho

1. **Puxe a `main` antes de mexer.** O Breno também altera o repositório pelo Mac.
2. **Mudança de banco vira arquivo novo em `banco/`**, com o próximo número, e é
   aplicada no SQL Editor do Supabase **antes** de publicar o `index.html` que depende
   dela. Escreva no topo do arquivo o porquê da mudança, como os arquivos anteriores.
3. **Função nova ou alterada:** o código vai para `funcoes/<nome>.ts` e é publicado em
   Supabase → Edge Functions (Deploy via Editor, mesmo nome). Atualize
   `funcoes/LEIAME.md` dizendo quem pode chamá-la.
4. **Nada de segredo aqui.** O repositório é público. Chaves e tokens ficam só em
   Supabase → Edge Functions → Secrets; as funções os leem por `Deno.env.get`.
5. **Confira a sintaxe do `index.html`** antes de publicar (extraia o `<script>` e rode
   `node --check`): um erro de JS derruba a tela inteira.
6. **Teste o que der para testar** com o login do escritório antes de dizer que está
   pronto, e apague o que o teste criar.
7. Comentários e mensagens de commit em português, explicando o porquê, no tom dos que
   já existem.
