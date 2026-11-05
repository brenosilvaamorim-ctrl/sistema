// LEITOR DE DOCUMENTOS
// Recebe um PDF ou uma foto (CTPS, TRCT, contracheque, cartão de ponto, laudo, edital)
// e devolve os campos estruturados e os fatos com a página onde cada um aparece.
// Não grava nada sozinho: quem confirma é o advogado, na tela do caso.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

const SISTEMA = `Você lê documentos de processos trabalhistas brasileiros e devolve dado estruturado.
Regras absolutas:
- Só extraia o que está ESCRITO no documento. Nunca deduza, nunca complete, nunca estime.
- Campo ilegível ou ausente: deixe fora do JSON. É melhor faltar do que inventar.
- Datas sempre em AAAA-MM-DD. Valores como número, sem R$ e sem ponto de milhar.
- Em cada fato, informe a página em que ele aparece e transcreva o trecho exato que o comprova.
Responda APENAS com JSON, sem comentário e sem cerca de código:
{"tipo":"CTPS|TRCT|contracheque|cartão de ponto|ASO|CAT|laudo|edital|contrato|outro",
 "campos":{"empresa":"","cnpj":"","admissao":"","saida":"","funcao":"","salario":0,"jornada":"","motivo":"","ctps":""},
 "fatos":[{"data":"","descricao":"","trecho":"","pagina":1}],
 "observacao":"o que ficou ilegivel ou duvidoso",\n "transcricao":"transcreva aqui, corrido, TODO o texto legivel do documento, na ordem em que aparece; nao resuma, nao interprete e nao complete o que nao estiver escrito"}`;

// Modo "nfse": lê notas fiscais de serviço já emitidas (PDF do DANFSe, do portal
// nacional ou da prefeitura), para importar ao Financeiro. Também só extrai.
const SISTEMA_NFSE = `Você lê notas fiscais de serviço eletrônicas (NFS-e) brasileiras — DANFSe do padrão nacional ou nota da prefeitura — e devolve dado estruturado.
Regras absolutas:
- Só extraia o que está ESCRITO. Nunca deduza nem complete. Campo ausente: deixe fora.
- Datas em AAAA-MM-DD. Valores como número (ponto decimal), sem R$ e sem ponto de milhar.
- CPF e CNPJ só com dígitos.
- Se o arquivo tiver mais de uma nota, devolva uma por item de "notas".
- "situacao": "cancelada" se houver qualquer indicação de cancelamento; "substituida" se indicar substituição; senão "normal".
Responda APENAS com JSON, sem comentário e sem cerca de código:
{"notas":[{"numero":"","chave":"","data_emissao":"","competencia":"","prestador_cnpj":"","prestador_nome":"","tomador_nome":"","tomador_doc":"","valor_servico":0,"valor_liquido":0,"iss_retido":false,"descricao":"","municipio":"","situacao":"normal"}],
 "observacao":"o que ficou ilegível ou duvidoso"}`;

// Modo "contrato": lê o contrato de honorários assinado e devolve as rubricas que o
// cliente deve pagar, uma por obrigação. O desenho do honorário muda por área — êxito
// no trabalhista, entrada administrativa e judicial no previdenciário, entrada e
// parcelas nos concursos —, então não há campo fixo: o que vier escrito vira rubrica.
// Quem confere e manda para o financeiro é o advogado, na tela do caso.
const SISTEMA_CONTRATO = `Você lê contratos de honorários advocatícios brasileiros e devolve as obrigações financeiras do cliente, uma por uma.
Regras absolutas:
- Só extraia o que está ESCRITO. Nunca deduza, nunca complete, nunca estime, nunca calcule o que o contrato não calculou.
- Rubrica que você não conseguir ler por inteiro: devolva o que leu e descreva a dúvida em "observacao". É melhor faltar do que inventar.
- Datas em AAAA-MM-DD. Valores como número (ponto decimal), sem R$ e sem ponto de milhar. Percentual como número (30, não 0,3 e não "30%").
- Uma rubrica por obrigação distinta. Parcelamento é UMA rubrica com "parcelas" igual ao número de parcelas e "valor" igual ao de CADA parcela — nunca multiplique.
- "especie": "entrada" (pagamento inicial, de qualquer fase), "parcela" (pagamento mensal ou periódico), "exito" (percentual ou valor devido só em caso de êxito, proveito econômico, condenação ou acordo), "despesa" (custas, diligências, reembolso, perícia), "outro".
- "valor" só quando houver quantia certa; "percentual" só quando houver percentual. Nunca os dois na mesma rubrica, salvo se o contrato trouxer os dois expressamente.
- "base": sobre o que o percentual incide, nas palavras do contrato (ex.: "proveito econômico", "valor da condenação", "benefício atrasado").
- "condicao": o que precisa acontecer para a rubrica ser devida, quando o contrato condicionar (ex.: "em caso de ajuizamento", "se houver acordo"). Rubrica incondicional: deixe fora.
- "lancar": true só para o que já é certo e tem valor conhecido (entrada, parcela, despesa com valor). SEMPRE false para espécie "exito" e para qualquer rubrica condicional ou sem valor — esse dinheiro ainda não existe.
- "trecho": onde a rubrica foi lida (ex.: "cláusula 4ª, parágrafo único"), para o advogado conferir.
- Se o documento não for contrato de honorários, devolva "rubricas" vazio e diga o que é em "observacao".
Responda APENAS com JSON, sem comentário e sem cerca de código:
{"contratante":"nome do cliente como está no contrato","assinado_em":"",
 "rubricas":[{"nome":"","especie":"entrada","valor":0,"percentual":null,"base":"","parcelas":1,"primeiro_vencimento":"","condicao":"","trecho":"","lancar":true}],
 "observacao":"o que ficou ilegível, duvidoso ou precisa de conferência"}`;

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
  const { arquivo, mime, nome = 'documento', caso_id, modo } = body;
  const nfse = modo === 'nfse', contrato = modo === 'contrato';
  if (!arquivo) return resp({ erro: 'arquivo obrigatório' }, 400);
  if (arquivo.length > 9_000_000) return resp({ erro: 'arquivo grande demais; mande até ~6 MB' }, 400);

  const bloco = String(mime || '').includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: arquivo } };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      /* Contrato vai em Opus: é dele que sai dinheiro lançado, e a cláusula de
         honorário muda de forma a cada área. Os demais modos seguem no Sonnet. */
      model: contrato ? 'claude-opus-5-5' : 'claude-sonnet-5',
      max_tokens: contrato ? 16000 : (nfse ? 4000 : 12000),
      system: contrato ? SISTEMA_CONTRATO : (nfse ? SISTEMA_NFSE : SISTEMA),
      messages: [{ role: 'user', content: [bloco,
        { type: 'text', text: `Arquivo: ${nome}. Extraia o que estiver escrito, no formato pedido.` }] }],
    }),
  });
  if (!r.ok) return resp({ erro: erroClaude(r.status, await r.text()) }, 502);
  const j = await r.json();
  /* Resposta cortada no limite devolve JSON pela metade: avisa em vez de falhar na análise. */
  if (j.stop_reason === 'max_tokens')
    return resp({ erro: 'O documento é longo demais para uma leitura só. Mande só as páginas das cláusulas de honorário.' }, 422);
  const txt = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  const m = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  let lido: any = null;
  try { lido = JSON.parse(m ? m[0] : txt); } catch { /* devolve cru abaixo */ }
  if (!lido) return resp({ erro: 'não consegui estruturar a leitura', cru: txt.slice(0, 1500) }, 422);
  if (nfse) return resp({ notas: Array.isArray(lido.notas) ? lido.notas : [], observacao: lido.observacao || '', arquivo: nome });

  if (contrato) {
    const ESPECIES = ['entrada', 'parcela', 'exito', 'despesa', 'outro'];
    const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const data = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
    const rubricas = (Array.isArray(lido.rubricas) ? lido.rubricas : [])
      .filter((x: any) => x && (x.nome || x.valor || x.percentual))
      .map((x: any) => {
        const especie = ESPECIES.includes(x.especie) ? x.especie : 'outro';
        const valor = num(x.valor), percentual = num(x.percentual);
        const condicao = String(x.condicao || '').trim();
        return {
          nome: String(x.nome || '').trim().slice(0, 120) || 'Honorário',
          especie, valor, percentual,
          base: String(x.base || '').trim().slice(0, 120),
          parcelas: Math.min(Math.max(Math.round(Number(x.parcelas) || 1), 1), 120),
          primeiro_vencimento: data(x.primeiro_vencimento),
          condicao, trecho: String(x.trecho || '').trim().slice(0, 160),
          /* Só vai ao financeiro o que já é certo e tem quantia: êxito e rubrica
             condicional ficam registrados, esperando o fato que os torna devidos. */
          lancar: x.lancar === true && especie !== 'exito' && !condicao && valor !== null,
        };
      });
    return resp({ contratante: String(lido.contratante || '').trim(), assinado_em: data(lido.assinado_em),
      rubricas, observacao: String(lido.observacao || '').trim(), arquivo: nome, caso_id: caso_id ?? null });
  }

  if (lido.campos) for (const k of Object.keys(lido.campos))
    if (lido.campos[k] === '' || lido.campos[k] === 0 || lido.campos[k] === null) delete lido.campos[k];
  lido.fatos = Array.isArray(lido.fatos) ? lido.fatos.filter((f: any) => f && f.descricao) : [];
  lido.arquivo = nome;
  lido.caso_id = caso_id ?? null;
  return resp(lido);
});function erroClaude(status: number, txt: string) {
  const t = String(txt || '').toLowerCase();
  if (status === 402 || t.includes('credit balance') || t.includes('insufficient'))
    return 'Os creditos da API da Anthropic acabaram. Recarregue em platform.claude.com, no menu Billing, e tente de novo — nada foi perdido.';
  if (status === 401 || status === 403)
    return 'A chave da API da Anthropic foi revogada ou esta errada. Troque em Supabase, Edge Functions, Secrets.';
  if (status === 429)
    return 'A Anthropic limitou a velocidade neste momento. Espere um minuto e tente de novo.';
  if (status === 529 || status >= 500)
    return 'A Anthropic esta indisponivel agora. Tente de novo em alguns minutos.';
  return 'A Anthropic recusou o pedido (codigo ' + status + '). ' + String(txt || '').slice(0, 200);
}


