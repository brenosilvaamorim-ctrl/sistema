# banco/ — a estrutura do banco de dados

O sistema (`index.html`, na raiz) é só a tela. Os dados e as regras de acesso moram
no **Supabase**, projeto `escritorio`. Esta pasta guarda o código que monta esse banco,
para que ele não dependa de nenhuma sessão de trabalho nem da memória de ninguém.

## O que tem aqui

- **`estrutura-atual.sql`** — retrato completo da estrutura, extraído direto do catálogo
  do Postgres: tabelas, chaves, índices, funções, visões, regras de acesso (RLS), gatilhos
  e buckets de arquivos. É o documento de referência: se precisar reconstruir o banco do
  zero, é por ele que se começa. **Não contém nenhum dado de cliente, nenhuma senha,
  nenhuma chave.**
- **`24_consulta_lead.sql`, `25_projetos.sql`, …** — as mudanças feitas depois do retrato,
  numeradas na ordem em que foram aplicadas.

As migrações 01 a 23 foram aplicadas antes de esta pasta existir e os arquivos avulsos se
perderam; o efeito de todas elas está no `estrutura-atual.sql`.

## Regra para mudanças futuras

1. Toda mudança no banco vira um arquivo novo aqui, com o próximo número (`26_…`, `27_…`).
2. O arquivo é aplicado no Supabase (SQL Editor) e **só então** o `index.html` que depende
   dele é publicado.
3. De tempos em tempos, o `estrutura-atual.sql` é refeito, para o retrato não envelhecer.

## O que nunca vem para cá

Senhas, chaves de API (Anthropic, Resend, Asaas, ZapSign, Google) e o token de serviço do
Supabase. Esses ficam só em Supabase → Edge Functions → Secrets. Este repositório é
**público** — é isso que permite publicar o sistema de graça pelo GitHub Pages. As regras
de acesso valem no servidor: conhecer a estrutura não abre o banco.
