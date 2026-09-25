# familia/ — a área da família

Segundo aplicativo do mesmo sistema, publicado em
`sistema.brenosamorimadvocacia.com.br/familia/`. Serve para as contas de casa e para a obra
da casa nova, e é usado pelo casal.

`index.html` aqui é a tela dessa área, do mesmo jeito que o `index.html` da raiz é a tela do
escritório. Os dois falam com o mesmo banco (Supabase), mas com regras de acesso diferentes:

- o escritório exige uma linha em `usuario` (`meu_escritorio()`);
- a família exige uma linha em `familia_membro` (`minha_familia()`).

Quem entra numa porta não enxerga o outro lado. A separação é feita no banco, não no menu:
ver `banco/26_familia.sql`.

As tabelas desta área são `pessoal_*` (dinheiro), `casa_ambiente`, `casa_item`,
`casa_orcamento` e `familia`/`familia_membro`. Os orçamentos anexados ficam no bucket `casa`,
numa pasta por família.
