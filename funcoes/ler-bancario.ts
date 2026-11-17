// LEITOR DOS DOCUMENTOS DO MÓDULO BANCÁRIO
// Recebe o PDF (ou a foto) de um documento do caso bancário e devolve dado estruturado:
//   modo 'emprestimos' — Extrato de Empréstimos do INSS: um item por contrato (consignado e cartões)
//   modo 'hiscre'      — Histórico de Créditos do INSS: competência, banco pagador e cada desconto
//   modo 'contrato'    — contrato bancário: taxa, CET, seguro embutido, forma de assinatura
//   modo 'trilha'      — trilha da assinatura eletrônica: IP, geolocalização, dispositivo, selfie
// NÃO grava nada: quem confere e grava é a tela, linha a linha, com o advogado olhando.
// A regra é a mesma dos outros leitores: só o que está escrito. Contrato com número
// inventado vira ação temerária; é pior do que não ler.
// Roda com o login de quem chamou (sem chave de serviço), como ler-documento e ler-extrato.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'content-type': 'application/json' } });

const REGRAS = `REGRAS ABSOLUTAS
- Só transcreva o que está ESCRITO no documento. Nunca deduza, complete, estime ou arredonde.
- Campo que não aparece: null. Linha ilegível: fora do JSON, descrita em "observacao".
- Valores: 1.234,56 vira 1234.56 (número, positivo). Datas: AAAA-MM-DD. Competência: AAAA-MM.
- Taxa de juros: em % ao mês como número (2,14% a.m. vira 2.14); se só houver a anual, ponha em "taxa_anual".
- Responda APENAS com JSON, sem comentário e sem cerca de código.`;

const PROMPTS: Record<string, string> = {
  emprestimos: `Você lê o "Extrato de Empréstimos" (empréstimos consignados) do Meu INSS.
${REGRAS}
- Um item por contrato, inclusive os excluídos, encerrados e suspensos, na ordem do documento.
- "produto": "consignado" para empréstimo; "rmc" para cartão de crédito consignado (Reserva de Margem
  Consignável, RMC); "rcc" para cartão consignado de benefício (Reserva de Cartão Consignado, RCC).
- Nos cartões: "limite_cartao" é a coluna Limite de Cartão; "reservado" é o Reservado Atualizado (desconto mensal).
- "origem" é o contrato de origem quando o documento disser que é refinanciamento ou portabilidade.
{"titular":{"nome":"","cpf":"","beneficio":"","especie":""},
 "margem":{"total":null,"disponivel":null},
 "contratos":[{"numero":"","banco":"","produto":"consignado|rmc|rcc","situacao":"ativo|excluido|suspenso|encerrado|",
   "data_averbacao":"","inicio_desconto":"","fim_desconto":"","valor_emprestado":null,"valor_parcela":null,
   "qtd_parcelas":null,"limite_cartao":null,"reservado":null,"taxa_mensal":null,"taxa_anual":null,
   "origem":"","tipo_operacao":""}],
 "observacao":""}`,

  hiscre: `Você lê o "Histórico de Créditos" (HISCRE / extrato de pagamento de benefício) do Meu INSS.
${REGRAS}
- Uma entrada por competência, na ordem do documento.
- Em cada competência: banco, agência e conta onde o benefício foi pago, o valor bruto, o líquido e
  CADA rubrica de desconto como está escrita (ex.: "CONSIGNACAO EMPRESTIMO BANCARIO", "EMPRESTIMO
  SOBRE A RMC", "CONSIGNACAO - CARTAO", mensalidade de associação), com o valor.
- Se a rubrica trouxer número de contrato ou nome do banco credor, preencha "contrato" e "credor".
{"titular":{"nome":"","cpf":"","beneficio":"","especie":""},
 "competencias":[{"competencia":"AAAA-MM","banco":"","agencia":"","conta":"","bruto":null,"liquido":null,
   "descontos":[{"rubrica":"","valor":null,"contrato":"","credor":""}]}],
 "observacao":""}`,

  contrato: `Você lê um contrato bancário de crédito (consignado, cartão consignado, empréstimo pessoal,
financiamento de veículo, cédula de crédito bancário).
${REGRAS}
- "seguro": qualquer seguro, prestamista ou proteção financeira cobrado no contrato, com o valor do prêmio.
- "tarifas": cada tarifa ou encargo nomeado (cadastro, registro, avaliação do bem, IOF etc.), com valor.
- "assinatura": como o documento diz que foi assinado (manuscrita, eletrônica, biometria facial, token),
  e se há campo de assinatura em branco.
{"contrato":{"numero":"","banco":"","produto":"","data":"","valor_liberado":null,"valor_financiado":null,
   "parcela":null,"qtd_parcelas":null,"taxa_mensal":null,"taxa_anual":null,"cet_mensal":null,"cet_anual":null,
   "conta_credito":"","correspondente":""},
 "seguro":[{"tipo":"","seguradora":"","premio":null}],
 "tarifas":[{"nome":"","valor":null}],
 "assinatura":{"forma":"","em_branco":false,"data":""},
 "observacao":""}`,

  trilha: `Você lê a trilha de auditoria (evidências, log) de uma assinatura eletrônica de contrato bancário.
${REGRAS}
- Transcreva cada evento com data e hora (com fuso, se houver), IP, porta, geolocalização (latitude e
  longitude), dispositivo, sistema, navegador, telefone, e-mail e o que aconteceu.
- "selfie": se há foto/biometria facial, a data e hora da captura e o que o documento diz sobre ela.
- "govbr": se há registro de desbloqueio ou autenticação pelo gov.br.
{"contrato":"","eventos":[{"data_hora":"","ip":"","porta":"","latitude":null,"longitude":null,
   "dispositivo":"","sistema":"","navegador":"","telefone":"","email":"","acao":""}],
 "selfie":{"existe":false,"data_hora":"","observacao":""},
 "govbr":{"existe":false,"data_hora":""},
 "hash":"","certificado":"",
 "observacao":""}`,
};

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
  const { arquivo, mime, nome = 'documento', modo } = body;
  if (!PROMPTS[modo]) return resp({ erro: 'modo inválido (emprestimos, hiscre, contrato, trilha)' }, 400);
  if (!arquivo) return resp({ erro: 'arquivo obrigatório' }, 400);
  if (arquivo.length > 9_000_000) return resp({ erro: 'arquivo grande demais; mande até ~6 MB por vez' }, 400);

  const bloco = String(mime || '').includes('pdf')
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arquivo } }
    : { type: 'image', source: { type: 'base64', media_type: mime || 'image/jpeg', data: arquivo } };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: 16000, system: PROMPTS[modo],
      messages: [{ role: 'user', content: [bloco,
        { type: 'text', text: `Arquivo: ${nome}. Transcreva tudo o que o esquema pede, sem omitir linha.` }] }],
    }),
  });
  if (!r.ok) return resp({ erro: 'anthropic ' + r.status + ' ' + (await r.text()).slice(0, 300) }, 502);
  const j = await r.json();
  if (j.stop_reason === 'max_tokens') return resp({ erro: 'conteúdo demais para uma leitura; mande menos páginas' }, 413);
  const txt = (j.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n').trim();
  const m = txt.replace(/^```(json)?/i, '').replace(/```$/, '').trim().match(/\{[\s\S]*\}/);
  let lido: any = null;
  try { lido = JSON.parse(m ? m[0] : txt); } catch { /* devolve cru abaixo */ }
  if (!lido) return resp({ erro: 'não consegui estruturar a leitura', cru: txt.slice(0, 1500) }, 422);
  return resp({ modo, arquivo: nome, lido });
});
