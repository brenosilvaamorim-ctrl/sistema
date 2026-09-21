// LEITOR DE EXTRATO BANCÁRIO E FATURA DE CARTÃO
// Recebe o PDF (ou a foto) e devolve as linhas separadas em entrada e saída.
// NÃO grava lançamento nenhum: quem confirma linha a linha é o dono, na tela.
// A regra que manda aqui é a mesma do leitor de documentos: só o que está
// escrito. Extrato com número inventado é pior do que extrato nenhum.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

const SISTEMA = `Você lê extratos bancários e faturas de cartão de crédito brasileiros e devolve dado estruturado.

REGRAS ABSOLUTAS
- Só transcreva o que está ESCRITO. Nunca deduza, nunca complete, nunca estime, nunca arredonde.
- Linha ilegível: NÃO invente. Deixe-a fora e descreva o que ficou ilegível em "observacao".
- Não calcule totais que o documento não traz. Se o saldo ou o total não estiver escrito, omita o campo.
- Não junte nem separe lançamentos: uma linha do documento é uma linha do JSON.

CONVENÇÕES BRASILEIRAS
- Valor 1.234,56 é mil duzentos e trinta e quatro reais e cinquenta e seis centavos. Devolva 1234.56.
- Devolva o valor SEMPRE positivo; o sinal vai no campo "tipo".
- "D", "débito", valor entre parênteses ou com sinal negativo = tipo "saida".
- "C", "crédito", depósito, TED/PIX recebido, rendimento, estorno = tipo "entrada".
- Datas em AAAA-MM-DD. Se o ano não estiver na linha, use o do período do documento.

FATURA DE CARTÃO
- Nela, as compras são "saida" e os estornos/pagamentos da fatura anterior são "entrada".
- Compra parcelada: transcreva a descrição como está, inclusive o "03/10", e preencha
  "parcela" e "total_parcelas" quando o documento os mostrar.
- Em "documento.total_fatura" ponha o total a pagar, se estiver escrito.

CLASSIFICAÇÃO
- Em "categoria_sugerida" use APENAS um dos nomes da lista que vier na mensagem do usuário.
  Não crie nome novo. Se nenhum servir, deixe "".
- A sugestão é palpite a partir da descrição; quem decide é o dono, na tela.

Responda APENAS com JSON, sem comentário e sem cerca de código:
{"documento":{"tipo":"extrato|fatura","banco":"","conta":"","periodo_inicio":"","periodo_fim":"",
  "saldo_final":0,"total_fatura":0,"vencimento":""},
 "lancamentos":[{"data":"","descricao":"","valor":0,"tipo":"entrada|saida",
  "categoria_sugerida":"","parcela":null,"total_parcelas":null}],
 "observacao":"o que ficou ilegível, duvidoso ou fora do padrão"}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return resp({ erro: 'ANTHROPIC_API_KEY não configurada' }, 500);

  const jwt = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!jwt) return resp({ erro: 'sem autenticação' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: 'Bearer ' + jwt } } });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return resp({ erro: 'sessão inválida' }, 401);

  const body = await req.json().catch(() => ({}));
  const { arquivo, mime, nome = 'extrato', categorias = [] } = body;
  if (!arquivo) return resp({ erro: 'arquivo obrigatório' }, 400);
  if (arquivo.length > 9_000_000) return resp({ erro: 'arquivo grande demais; mande até ~6 MB por vez' }, 400);

  const bloco = String(mime || '').includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: arquivo } };

  const lista = Array.isArray(categorias) && categorias.length
    ? `\n\nCategorias existentes (use só estas em categoria_sugerida):\n- ${categorias.join('\n- ')}`
    : '\n\nNão há categorias cadastradas: deixe categoria_sugerida vazia.';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 16000, system: SISTEMA,
      messages: [{ role: 'user', content: [bloco,
        { type: 'text', text: `Arquivo: ${nome}. Transcreva TODAS as linhas de movimento, na ordem em que aparecem.${lista}` }] }],
    }),
  });
  if (!r.ok) return resp({ erro: 'anthropic ' + r.status + ' ' + (await r.text()).slice(0, 300) }, 502);
  const j = await r.json();
  const txt = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  const m = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  let lido: any = null;
  try { lido = JSON.parse(m ? m[0] : txt); } catch { /* devolve cru abaixo */ }
  if (!lido) return resp({ erro: 'não consegui estruturar a leitura', cru: txt.slice(0, 1500) }, 422);

  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.abs(n) : null; };
  const linhas = (Array.isArray(lido.lancamentos) ? lido.lancamentos : [])
    .map((l: any) => ({
      data: /^\d{4}-\d{2}-\d{2}$/.test(String(l?.data)) ? l.data : null,
      descricao: String(l?.descricao ?? '').trim().slice(0, 200),
      valor: num(l?.valor),
      tipo: l?.tipo === 'entrada' ? 'entrada' : 'saida',
      categoria_sugerida: String(l?.categoria_sugerida ?? '').trim(),
      parcela: Number.isFinite(Number(l?.parcela)) ? Number(l.parcela) : null,
      total_parcelas: Number.isFinite(Number(l?.total_parcelas)) ? Number(l.total_parcelas) : null,
    }))
    .filter((l: any) => l.data && l.valor && l.descricao);

  const d = lido.documento ?? {};
  return resp({
    documento: {
      tipo: d.tipo === 'fatura' ? 'fatura' : 'extrato',
      banco: String(d.banco ?? '').trim() || null,
      conta: String(d.conta ?? '').trim() || null,
      periodo_inicio: /^\d{4}-\d{2}-\d{2}$/.test(String(d.periodo_inicio)) ? d.periodo_inicio : null,
      periodo_fim:    /^\d{4}-\d{2}-\d{2}$/.test(String(d.periodo_fim))    ? d.periodo_fim    : null,
      vencimento:     /^\d{4}-\d{2}-\d{2}$/.test(String(d.vencimento))     ? d.vencimento     : null,
      saldo_final:  Number.isFinite(Number(d.saldo_final))  ? Number(d.saldo_final)  : null,
      total_fatura: Number.isFinite(Number(d.total_fatura)) ? Number(d.total_fatura) : null,
    },
    lancamentos: linhas,
    entradas: linhas.filter((l: any) => l.tipo === 'entrada').reduce((a: number, l: any) => a + l.valor, 0),
    saidas:   linhas.filter((l: any) => l.tipo === 'saida').reduce((a: number, l: any) => a + l.valor, 0),
    descartadas: (Array.isArray(lido.lancamentos) ? lido.lancamentos.length : 0) - linhas.length,
    observacao: String(lido.observacao ?? '').trim() || null,
    arquivo: nome,
  });
});
