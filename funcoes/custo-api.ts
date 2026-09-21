// CUSTO DA API DA ANTHROPIC
// Le o relatorio de custo da organizacao. Nao gasta credito: so consulta.
// Precisa da chave administrativa (sk-ant-admin01-...) no Secret ANTHROPIC_ADMIN_KEY.
// A Anthropic nao expoe saldo; o saldo do painel e a soma das recargas menos este gasto.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

// Soma todo campo numerico chamado amount, em qualquer profundidade da resposta.
function somar(no: unknown, achados: number[]) {
  if (Array.isArray(no)) { no.forEach((x) => somar(x, achados)); return; }
  if (no && typeof no === 'object') {
    for (const [k, v] of Object.entries(no as Record<string, unknown>)) {
      if (k === 'amount' && (typeof v === 'string' || typeof v === 'number')) {
        const n = Number(v); if (!Number.isNaN(n)) achados.push(n);
      } else somar(v, achados);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const admin = Deno.env.get('ANTHROPIC_ADMIN_KEY');
  if (!admin) return json({ erro: 'Falta a chave administrativa. Crie em platform.claude.com, em Settings, Admin keys, e cole em Supabase, Edge Functions, Secrets, com o nome ANTHROPIC_ADMIN_KEY.' }, 400);

  const corpo = await req.json().catch(() => ({}));
  const desde = String(corpo.desde ?? '').slice(0, 10);
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(desde)
    ? desde
    : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const fim = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const valores: number[] = [];
  const porDia: Record<string, number> = {};
  let pagina: string | null = null;
  let voltas = 0;

  do {
    const url = new URL('https://api.anthropic.com/v1/organizations/cost_report');
    url.searchParams.set('starting_at', inicio + 'T00:00:00Z');
    url.searchParams.set('ending_at', fim + 'T00:00:00Z');
    url.searchParams.set('limit', '31');
    if (pagina) url.searchParams.set('page', pagina);

    const r = await fetch(url.toString(), {
      headers: { 'x-api-key': admin, 'anthropic-version': '2023-06-01' },
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 300);
      if (r.status === 401 || r.status === 403)
        return json({ erro: 'A chave administrativa foi recusada. Confira se ela comeca com sk-ant-admin01- e se voce e admin da organizacao.' }, 400);
      return json({ erro: 'A Anthropic recusou a consulta de custo (codigo ' + r.status + '). ' + t }, 502);
    }
    const j = await r.json();
    for (const bucket of (j.data ?? [])) {
      const dia = String(bucket.starting_at ?? '').slice(0, 10);
      const deste: number[] = [];
      somar(bucket.results ?? bucket, deste);
      const soma = deste.reduce((a: number, b: number) => a + b, 0);
      if (dia) porDia[dia] = (porDia[dia] ?? 0) + soma;
      valores.push(soma);
    }
    pagina = j.has_more ? (j.next_page ?? null) : null;
    voltas++;
  } while (pagina && voltas < 12);

  const bruto = valores.reduce((a, b) => a + b, 0);
  return json({
    desde: inicio,
    ate: fim,
    gasto_usd: Math.round(bruto) / 100,
    bruto,
    por_dia: Object.fromEntries(Object.entries(porDia).map(([d, c]) => [d, Math.round(c) / 100])),
  });
});
