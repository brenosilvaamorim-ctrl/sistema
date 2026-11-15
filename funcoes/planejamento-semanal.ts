// PLANEJAMENTO DA SEMANA
// Roda todo domingo às 18h de Petrolina (agendada em banco/62_planejamento_semanal.sql).
// Junta o que o sistema sabe da semana que começa — prazos, agenda, publicações a conferir,
// prescrições, casos parados, minutas em rascunho, leads sem retorno, dinheiro a receber,
// projetos e o que ficou do plano anterior —, pede ao Claude que arrume isso em dias e
// grava em `planejamento`. Quando chamada pelo agendador, manda também por e-mail.
//
// Nada aqui muda prazo, evento ou caso: o plano é sugestão. Quem dá baixa continua sendo
// quem faz, nas telas de sempre.
//
// Parâmetros (opcionais, na URL):
//   ?seco=1    devolve só os dados juntados, sem chamar o Claude e sem gravar — para conferir
//   ?enviar=1  manda o e-mail mesmo quando chamada pela tela (o agendador sempre manda)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-chave-robo',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o, null, 2),
  { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const br = (s: string) => String(s).slice(0, 10).split('-').reverse().join('/');
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const somaDias = (iso: string, n: number) =>
  new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const diaSemana = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();
const corta = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};
// A agenda guarda a hora de Petrolina como se fosse UTC (a audiência das 9h05 está
// gravada `09:05+00:00`) — é assim que a tela lê, recortando o texto. Aqui também:
// converter fuso deslocaria tudo três horas para trás.
const horaLocal = (ts: string) => String(ts).slice(11, 16);
const dataLocal = (ts: string) => String(ts).slice(0, 10);

/* ---------------------------------------------------------------- quem chama
   Responde com a chave de serviço, que ignora a RLS: a conferência é feita aqui dentro,
   como nas outras funções. Passam a chave dos robôs (o agendador), a chave de serviço e
   um login ativo do escritório. Devolve de qual escritório é o plano. */
async function quemPede(req: Request, adm: any):
  Promise<{ escritorio_id: string; robo: boolean } | null> {
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const chave = (new URL(req.url).searchParams.get('chave')
    ?? req.headers.get('x-chave-robo') ?? '').trim();
  if (chave.length >= 16) {
    const { data: e } = await adm.from('escritorio').select('id').eq('robo_token', chave).maybeSingle();
    if (e) return { escritorio_id: e.id, robo: true };
  }
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return null;
  if (servico && jwt === servico) {
    const { data: e } = await adm.from('escritorio').select('id').order('criado_em').limit(1).maybeSingle();
    return e ? { escritorio_id: e.id, robo: true } : null;
  }
  const { data: quem } = await adm.auth.getUser(jwt);
  if (!quem?.user) return null;
  const { data: u } = await adm.from('usuario').select('escritorio_id')
    .eq('id', quem.user.id).eq('ativo', true).maybeSingle();
  return u ? { escritorio_id: u.escritorio_id, robo: false } : null;
}

function erroClaude(status: number, txt: string) {
  const t = String(txt || '').toLowerCase();
  if (status === 402 || t.includes('credit balance') || t.includes('insufficient'))
    return 'Os créditos da API da Anthropic acabaram. Recarregue em platform.claude.com, no menu Billing.';
  if (status === 401 || status === 403)
    return 'A chave da API da Anthropic foi revogada ou está errada. Troque em Supabase, Edge Functions, Secrets.';
  if (status === 429) return 'A Anthropic limitou a velocidade neste momento. Tente de novo em um minuto.';
  if (status >= 500) return 'A Anthropic está indisponível agora. Tente de novo em alguns minutos.';
  return 'A Anthropic recusou o pedido (código ' + status + '). ' + String(txt || '').slice(0, 200);
}

const SISTEMA = `Você é o assistente de planejamento de um escritório de advocacia pequeno, em Petrolina/PE,
tocado pelo advogado titular. Todo domingo você recebe, do sistema do escritório, o retrato da
semana que começa e devolve o plano dela.

Como planejar:
- Compromisso com hora marcada (audiência, perícia, consulta, reunião) fica no dia e na hora dele.
- Prazo fatal não se planeja para o dia em que vence: a peça é feita um ou dois dias úteis antes,
  e o dia do vencimento fica só para protocolar e conferir. Prazo que vence na semana seguinte,
  mas exige peça grande (inicial, recurso, contestação, réplica, razões finais), começa nesta.
- Prazo "sugerido" foi lido pelo robô e ainda não foi confirmado: conferir no PJe é tarefa do
  primeiro dia útil.
- Prazo vencido e ainda aberto: ou foi cumprido e falta dar baixa, ou precisa de decisão hoje.
  Diga qual das duas coisas fazer, sem alarde.
- Publicações a conferir entram cedo na semana, num bloco só.
- Peças e estudo vão nos dias com menos compromisso. Não encha um dia com mais de 4 ou 5 itens
  de trabalho; o que não couber vai para "adiantar".
- Retorno a lead e cobrança a cliente são tarefas curtas: agrupe num bloco do dia.
- Feriado não tem trabalho planejado, a não ser o que vence nele.
- O que veio "da semana passada, sem marcar como feito" volta ao plano se ainda fizer sentido.
- Use só o que está nos dados. Não invente prazo, cliente, valor ou compromisso.
- Escreva em português do Brasil, frases curtas, no imperativo ("Protocolar…", "Ligar para…").
  Cite o cliente ou o caso pelo nome que vier nos dados.
- Cada item que nasce de um registro dos dados leva o "ref" desse registro (ex.: "R12").

Devolva SÓ um JSON, sem texto antes ou depois, neste formato:
{
  "resumo": "duas ou três frases: o tamanho da semana e o que manda nela",
  "alertas": [ { "texto": "o que não pode escorregar", "ref": "R3" } ],
  "dias": [
    { "data": "AAAA-MM-DD", "foco": "frase curta do dia",
      "itens": [ { "texto": "…", "hora": "09:00" ou null, "tipo": "prazo|audiencia|compromisso|peca|conferir|contato|financeiro|projeto|outro", "ref": "R5" ou null } ] }
  ],
  "adiantar": [ { "texto": "…", "ref": "R8" ou null } ]
}
Os "dias" vão do primeiro ao último dia da semana informada, um objeto por dia, mesmo que vazio.
Limites, porque o plano tem de caber numa olhada: no máximo 3 alertas, 6 itens por dia e 8 em
"adiantar"; cada "texto" com até 110 caracteres e cada "foco" com até 60. Agrupe o que for
parecido ("Conferir as 12 publicações da semana passada") em vez de listar um a um.`;

async function planejar(contexto: string, key: string) {
  // Opus primeiro: é uma chamada por semana, e o raciocínio de distribuir a semana é o
  // que vale aqui. Se o modelo não estiver disponível na conta, cai para o que as outras
  // funções já usam.
  const modelos = ['claude-opus-5-5', 'claude-sonnet-5'];
  let ultimo = '';
  for (const model of modelos) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: 12000, system: SISTEMA,
        messages: [{ role: 'user', content: contexto }],
      }),
    });
    if (r.status === 404 || r.status === 400) { ultimo = await r.text(); continue; }
    if (!r.ok) throw new Error(erroClaude(r.status, await r.text()));
    const j = await r.json();
    const txt = (j.content ?? []).filter((b: any) => b.type === 'text')
      .map((b: any) => b.text).join('\n').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    try { return { plano: JSON.parse(m ? m[0] : txt), modelo: model }; }
    catch {
      throw new Error('O Claude respondeu fora do formato (stop: ' + (j.stop_reason ?? '?') +
        ', ' + (j.usage?.output_tokens ?? '?') + ' tokens de saída).');
    }
  }
  throw new Error(erroClaude(404, ultimo));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adm = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const quem = await quemPede(req, adm);
  if (!quem) return json({ erro: 'acesso restrito ao escritório' }, 403);
  const esc = quem.escritorio_id;
  const url = new URL(req.url);
  const seco = url.searchParams.get('seco') === '1';
  const enviar = quem.robo || url.searchParams.get('enviar') === '1';

  /* ------------------------------------------------------------ a semana
     No domingo, planeja de segunda a domingo. Em outro dia (refazer pela tela), planeja
     de hoje até o domingo da mesma semana. */
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const inicio = diaSemana(hoje) === 0 ? somaDias(hoje, 1) : hoje;
  const semana_de = somaDias(inicio, -((diaSemana(inicio) + 6) % 7));
  const fim = somaDias(semana_de, 6);
  const fim14 = somaDias(fim, 7);
  const ha14 = somaDias(hoje, -14);
  const ha30 = somaDias(hoje, -30);

  const q = <T>(p: PromiseLike<{ data: T[] | null; error: any }>) =>
    Promise.resolve(p).then(r => { if (r.error) throw new Error(r.error.message); return r.data ?? []; });

  let PZ: any[], EV: any[], ATR: any[], IT: any[], PRC: any[], PRO: any[], CS: any[],
    MN: any[], LD: any[], LC: any[], PJ: any[], AS: any[], FR: any[], ANT: any[];
  try {
    [PZ, EV, ATR, IT, PRC, PRO, CS, MN, LD, LC, PJ, AS, FR, ANT] = await Promise.all([
      q(adm.from('prazo')
        .select('id,descricao,providencia,data_fatal,situacao,fatal,caso:caso_id(id,titulo,cliente:cliente_id(nome)),processo:processo_id(numero_formatado,tribunal_sigla)')
        .eq('escritorio_id', esc).in('situacao', ['sugerido', 'confirmado'])
        .gte('data_fatal', ha30).lte('data_fatal', fim14).order('data_fatal').limit(80)),
      q(adm.from('evento')
        .select('id,tipo,titulo,inicio,fim,dia_inteiro,local,urgencia,caso:caso_id(id,titulo),cliente:cliente_id(nome)')
        .eq('escritorio_id', esc).not('situacao', 'in', '("concluida","cancelada")')
        .gte('inicio', inicio + 'T00:00:00Z').lt('inicio', somaDias(fim, 1) + 'T00:00:00Z')
        .order('inicio').limit(80)),
      // tarefas que já passaram da data e continuam abertas
      q(adm.from('evento')
        .select('id,tipo,titulo,inicio,caso:caso_id(id,titulo),cliente:cliente_id(nome)')
        .eq('escritorio_id', esc).eq('tipo', 'tarefa').not('situacao', 'in', '("concluida","cancelada")')
        .gte('inicio', ha30 + 'T00:00:00Z').lt('inicio', inicio + 'T00:00:00Z')
        .order('inicio').limit(25)),
      q(adm.from('intimacao')
        .select('id,data_disponibilizacao,tribunal_sigla,orgao,tipo_comunicacao,numero_formatado,texto,caso:caso_id(id,titulo)')
        .eq('escritorio_id', esc).not('situacao', 'in', '("sem_providencia","confirmada","cumprida")')
        .gte('data_disponibilizacao', ha30).order('data_disponibilizacao').limit(25)),
      q(adm.from('caso')
        .select('id,titulo,prescricao_em,prescricao_obs,cliente:cliente_id(nome)')
        .eq('escritorio_id', esc).is('encerrado_em', null).not('prescricao_em', 'is', null)
        .lte('prescricao_em', somaDias(hoje, 120)).order('prescricao_em').limit(20)),
      q(adm.from('processo')
        .select('id,numero_formatado,aguardando_ate,aguardando_obs,caso:caso_id(id,titulo)')
        .eq('escritorio_id', esc).not('aguardando_ate', 'is', null)
        .lte('aguardando_ate', fim).gte('aguardando_ate', ha30).order('aguardando_ate').limit(20)),
      // casos abertos sem processo e sem mexida há mais de 30 dias: em geral, peça por fazer
      q(adm.from('caso')
        .select('id,titulo,area,atualizado_em,cliente:cliente_id(nome),processo(id)')
        .eq('escritorio_id', esc).is('encerrado_em', null)
        .lt('atualizado_em', ha30 + 'T00:00:00Z').order('atualizado_em').limit(60)),
      q(adm.from('minuta')
        .select('id,tipo,criado_em,caso:caso_id(id,titulo)')
        .eq('escritorio_id', esc).eq('status', 'rascunho').order('criado_em').limit(15)),
      q(adm.from('lead')
        .select('id,nome,area,etapa,proximo_contato,atualizado_em,resumo')
        .eq('escritorio_id', esc).not('etapa', 'in', '("fechado","perdido")')
        .or(`proximo_contato.lte.${fim},and(proximo_contato.is.null,atualizado_em.lt.${somaDias(hoje, -7)})`)
        .order('proximo_contato', { ascending: true, nullsFirst: false }).limit(20)),
      q(adm.from('lancamento')
        .select('id,tipo,descricao,contraparte,valor,vencimento,situacao,cliente:cliente_id(nome),caso:caso_id(id,titulo)')
        .eq('escritorio_id', esc).in('situacao', ['previsto', 'atrasado'])
        .gte('vencimento', somaDias(hoje, -60)).lte('vencimento', fim).order('vencimento').limit(40)),
      q(adm.from('projeto')
        .select('id,titulo,fase,prazo_final')
        .eq('escritorio_id', esc).in('fase', ['aprovada', 'execucao'])
        .order('prazo_final', { ascending: true, nullsFirst: false }).limit(10)),
      q(adm.from('assinatura')
        .select('id,titulo,enviado_em,caso:caso_id(id,titulo,cliente:cliente_id(nome))')
        .eq('escritorio_id', esc).is('assinado_em', null).not('enviado_em', 'is', null)
        .lte('enviado_em', somaDias(hoje, -5)).order('enviado_em').limit(15)),
      q(adm.from('feriado').select('data,nome,ambito,uf,tribunal_sigla')
        .gte('data', inicio).lte('data', fim).order('data')),
      // o plano anterior, para saber o que ficou sem marcar
      q(adm.from('planejamento').select('semana_de,plano,feitos')
        .eq('escritorio_id', esc).lt('semana_de', semana_de).order('semana_de', { ascending: false }).limit(1)),
    ]);
  } catch (e) {
    return json({ erro: 'Não consegui ler o banco: ' + (e as Error).message }, 500);
  }

  const parados = CS.filter((c: any) => !(c.processo ?? []).length).slice(0, 15);

  /* ------------------------------------------------------------ referências
     Cada registro ganha um apelido curto (R1, R2…) para o Claude citar sem gastar com
     uuids; depois o apelido vira o link da tela. */
  const REF: Record<string, { link: string }> = {};
  let n = 0;
  const ref = (link: string) => { const r = 'R' + (++n); REF[r] = { link }; return r; };
  const linkCaso = (c: any, outro: string) => c?.id ? '#/caso/' + c.id : outro;
  const quemE = (x: any) => x?.caso?.cliente?.nome || x?.cliente?.nome || x?.caso?.titulo || '';

  const L: string[] = [];
  const sec = (titulo: string, linhas: string[]) => {
    L.push(`\n## ${titulo} (${linhas.length})`);
    L.push(linhas.length ? linhas.join('\n') : '(nada)');
  };

  L.push(`Hoje: ${br(hoje)} (${DIAS[diaSemana(hoje)]}).`);
  L.push(`Semana a planejar: de ${br(inicio)} (${DIAS[diaSemana(inicio)]}) a ${br(fim)} (domingo).`);
  L.push('Dias: ' + Array.from({ length: Math.round((Date.parse(fim) - Date.parse(inicio)) / 864e5) + 1 },
    (_, i) => somaDias(inicio, i)).map(d => `${d} ${DIAS[diaSemana(d)]}`).join(', ') + '.');

  sec('Feriados na semana', FR.map((f: any) =>
    `- ${f.data} ${f.nome} (${f.ambito}${f.uf ? ' ' + f.uf : ''}${f.tribunal_sigla ? ' ' + f.tribunal_sigla : ''})`));

  const vencidos = PZ.filter((p: any) => p.data_fatal < inicio);
  const naSemana = PZ.filter((p: any) => p.data_fatal >= inicio && p.data_fatal <= fim);
  const depois = PZ.filter((p: any) => p.data_fatal > fim);
  const linhaPz = (p: any) => `- [${ref(linkCaso(p.caso, '#/prazos'))}] vence ${p.data_fatal} (${DIAS[diaSemana(p.data_fatal)]})` +
    ` · ${p.situacao === 'sugerido' ? 'SUGERIDO, não confirmado' : 'confirmado'}${p.fatal ? '' : ' · não fatal'}` +
    ` · ${corta(p.descricao, 140)}${p.providencia ? ' — ' + corta(p.providencia, 100) : ''}` +
    ` · ${quemE(p)}${p.processo?.numero_formatado ? ' · ' + p.processo.numero_formatado + ' ' + (p.processo.tribunal_sigla ?? '') : ''}`;
  sec('Prazos vencidos e ainda abertos', vencidos.map(linhaPz));
  sec('Prazos que vencem na semana', naSemana.map(linhaPz));
  sec('Prazos da semana seguinte', depois.map(linhaPz));

  sec('Agenda da semana', EV.map((e: any) =>
    `- [${ref(linkCaso(e.caso, '#/agenda'))}] ${dataLocal(e.inicio)} ${e.dia_inteiro ? 'dia inteiro' : horaLocal(e.inicio)}` +
    ` · ${e.tipo} · ${corta(e.titulo, 120)}${quemE(e) ? ' · ' + quemE(e) : ''}${e.local ? ' · ' + corta(e.local, 60) : ''}` +
    `${e.urgencia && e.urgencia !== 'normal' ? ' · urgência ' + e.urgencia : ''}`));
  sec('Tarefas atrasadas, ainda abertas', ATR.map((e: any) =>
    `- [${ref(linkCaso(e.caso, '#/agenda'))}] era para ${dataLocal(e.inicio)} · ${corta(e.titulo, 120)}${quemE(e) ? ' · ' + quemE(e) : ''}`));

  sec('Publicações a conferir', IT.map((i: any) =>
    `- [${ref(linkCaso(i.caso, '#/prazos'))}] ${i.data_disponibilizacao} · ${i.tribunal_sigla ?? ''} ${corta(i.orgao, 60)}` +
    ` · ${i.tipo_comunicacao ?? ''} · ${i.numero_formatado ?? ''}${i.caso?.titulo ? ' · ' + i.caso.titulo : ''}` +
    ` · trecho: ${corta(i.texto, 220)}`));

  sec('Prescrição se aproximando (120 dias)', PRC.map((c: any) =>
    `- [${ref('#/caso/' + c.id)}] prescreve ${c.prescricao_em} · ${c.cliente?.nome ?? c.titulo}${c.prescricao_obs ? ' · ' + corta(c.prescricao_obs, 100) : ''}`));

  sec('Processos com espera vencendo', PRO.map((p: any) =>
    `- [${ref(linkCaso(p.caso, '#/processos'))}] aguardando até ${p.aguardando_ate} · ${p.numero_formatado ?? ''}` +
    ` · ${corta(p.aguardando_obs, 120)}${p.caso?.titulo ? ' · ' + p.caso.titulo : ''}`));

  sec('Casos abertos, sem processo, parados há mais de 30 dias', parados.map((c: any) =>
    `- [${ref('#/caso/' + c.id)}] ${c.cliente?.nome ?? ''} · ${corta(c.titulo, 100)}${c.area ? ' · ' + c.area : ''}` +
    ` · última mexida ${String(c.atualizado_em).slice(0, 10)}`));

  sec('Minutas em rascunho', MN.map((m: any) =>
    `- [${ref(linkCaso(m.caso, '#/minutas'))}] ${m.tipo} · ${m.caso?.titulo ?? ''} · criada ${String(m.criado_em).slice(0, 10)}`));

  sec('Leads esperando retorno', LD.map((l: any) =>
    `- [${ref('#/captacao')}] ${l.nome} · ${l.area ?? ''} · etapa ${l.etapa}` +
    ` · ${l.proximo_contato ? 'próximo contato ' + l.proximo_contato : 'sem próximo contato, parado desde ' + String(l.atualizado_em).slice(0, 10)}` +
    `${l.resumo ? ' · ' + corta(l.resumo, 100) : ''}`));

  const brl = (v: number) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  sec('Dinheiro a receber (vencido ou vencendo na semana)', LC.filter((l: any) => l.tipo === 'entrada').map((l: any) =>
    `- [${ref('#/financeiro')}] ${l.vencimento}${l.vencimento < inicio ? ' (ATRASADO)' : ''} · ${brl(l.valor)}` +
    ` · ${corta(l.descricao, 80)} · ${l.cliente?.nome || l.contraparte || l.caso?.titulo || ''}`));
  sec('Contas a pagar (vencidas ou vencendo na semana)', LC.filter((l: any) => l.tipo === 'saida').map((l: any) =>
    `- [${ref('#/financeiro')}] ${l.vencimento}${l.vencimento < inicio ? ' (ATRASADO)' : ''} · ${brl(l.valor)}` +
    ` · ${corta(l.descricao, 80)}${l.contraparte ? ' · ' + l.contraparte : ''}`));

  sec('Assinaturas paradas há 5 dias ou mais', AS.map((a: any) =>
    `- [${ref(linkCaso(a.caso, '#/inicio'))}] ${corta(a.titulo, 80)} · enviado ${a.enviado_em} · ${quemE(a)}`));

  sec('Projetos em andamento', PJ.map((p: any) =>
    `- [${ref('#/projetos')}] ${corta(p.titulo, 100)} · ${p.fase}${p.prazo_final ? ' · prazo ' + p.prazo_final : ''}`));

  const ant = ANT[0];
  const sobra = ant ? [
    ...(ant.plano?.alertas ?? []), ...(ant.plano?.dias ?? []).flatMap((d: any) => d.itens ?? []),
    ...(ant.plano?.adiantar ?? []),
  ].filter((i: any) => i?.id && !(ant.feitos ?? []).includes(i.id)) : [];
  sec(`Da semana passada${ant ? ' (' + br(ant.semana_de) + ')' : ''}, sem marcar como feito`,
    sobra.slice(0, 25).map((i: any) => `- ${i.link ? '[' + ref(i.link) + '] ' : ''}${corta(i.texto, 160)}`));

  const contexto = L.join('\n');
  const dados = {
    prazos_vencidos: vencidos.length, prazos_semana: naSemana.length, prazos_seguinte: depois.length,
    agenda: EV.length, tarefas_atrasadas: ATR.length, publicacoes: IT.length, prescricoes: PRC.length,
    esperas: PRO.length, casos_parados: parados.length, minutas: MN.length, leads: LD.length,
    a_receber: LC.filter((l: any) => l.tipo === 'entrada').length,
    a_pagar: LC.filter((l: any) => l.tipo === 'saida').length,
    assinaturas: AS.length, projetos: PJ.length, sobra_semana_anterior: sobra.length,
  };

  if (seco) return json({ semana_de, inicio, fim, dados, contexto });

  /* O agendador (pg_net) desiste da resposta em 60 s, e o Claude leva mais que isso para
     escrever a semana. Para o robô, a função responde na hora e termina o trabalho em
     segundo plano; o resultado fica no registro da função e na tabela. Pela tela, espera. */
  const trabalho = gerar();
  if (quem.robo && (globalThis as any).EdgeRuntime?.waitUntil) {
    (globalThis as any).EdgeRuntime.waitUntil(trabalho.then(r => console.log('[plano]', JSON.stringify(r.corpo))));
    return json({ aceito: true, semana_de, inicio, fim, dados }, 202);
  }
  const r = await trabalho;
  return json(r.corpo, r.status);

  async function gerar(): Promise<{ corpo: any; status: number }> {
  const t0 = Date.now();
  const json = (corpo: any, status = 200) =>
    ({ corpo: { ...corpo, segundos: Math.round((Date.now() - t0) / 1000) }, status });

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ erro: 'ANTHROPIC_API_KEY não configurada em Edge Functions → Secrets.' }, 500);

  let plano: any, modelo: string;
  try { ({ plano, modelo } = await planejar(contexto, key)); }
  catch (e) { return json({ erro: (e as Error).message, dados }, 502); }

  /* Ids curtos e estáveis dentro do plano, e o apelido trocado pelo link da tela.
     O que o Claude citou e não existe é descartado em silêncio: link errado é pior que
     link nenhum. */
  let k = 0;
  const arruma = (i: any) => {
    const r = typeof i?.ref === 'string' ? REF[i.ref.trim()] : undefined;
    return {
      id: 'i' + (++k), texto: String(i?.texto ?? '').trim(),
      ...(i?.hora ? { hora: String(i.hora).slice(0, 5) } : {}),
      ...(i?.tipo ? { tipo: String(i.tipo) } : {}),
      ...(r ? { link: r.link } : {}),
    };
  };
  const final = {
    resumo: String(plano?.resumo ?? '').trim(),
    alertas: (plano?.alertas ?? []).slice(0, 3).map(arruma).filter((i: any) => i.texto),
    dias: (plano?.dias ?? []).filter((d: any) => /^\d{4}-\d{2}-\d{2}$/.test(d?.data ?? ''))
      .map((d: any) => ({ data: d.data, foco: String(d.foco ?? '').trim(),
        itens: (d.itens ?? []).map(arruma).filter((i: any) => i.texto) })),
    adiantar: (plano?.adiantar ?? []).map(arruma).filter((i: any) => i.texto),
  };

  /* ------------------------------------------------------------ e-mail */
  let email = 'não pedido';
  if (enviar) {
    const chave = Deno.env.get('RESEND_API_KEY');
    const para = Deno.env.get('ALERTA_EMAIL_PARA');
    if (!chave || !para) email = 'e-mail não configurado';
    else {
      const sistema = 'https://sistema.brenosamorimadvocacia.com.br/';
      const e = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
      const item = (i: any) => `<li style="margin:3px 0">${i.hora ? `<b>${e(i.hora)}</b> · ` : ''}` +
        (i.link ? `<a href="${sistema}${i.link}" style="color:#0b0b0b">${e(i.texto)}</a>` : e(i.texto)) + '</li>';
      const html = `
      <div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0b;max-width:700px">
        <h2 style="font-size:19px;margin:0 0 4px">A semana de ${br(inicio)} a ${br(fim)}</h2>
        <p style="color:#52514e;margin:0 0 12px">${e(final.resumo)}</p>
        ${final.alertas.length ? `<div style="border-left:3px solid #d03b3b;padding:4px 12px;margin:12px 0">
          <b style="color:#d03b3b">Não pode escorregar</b><ul style="margin:6px 0;padding-left:18px">${final.alertas.map(item).join('')}</ul></div>` : ''}
        ${final.dias.map((d: any) => `
          <h3 style="font-size:15px;margin:18px 0 2px">${DIAS[diaSemana(d.data)]}, ${br(d.data)}</h3>
          ${d.foco ? `<div style="color:#78766f;font-size:13px">${e(d.foco)}</div>` : ''}
          ${d.itens.length ? `<ul style="margin:6px 0;padding-left:18px">${d.itens.map(item).join('')}</ul>`
            : '<div style="color:#78766f;font-size:13px">Livre.</div>'}`).join('')}
        ${final.adiantar.length ? `<h3 style="font-size:15px;margin:18px 0 2px">Se sobrar tempo, adiantar</h3>
          <ul style="margin:6px 0;padding-left:18px">${final.adiantar.map(item).join('')}</ul>` : ''}
        <p style="color:#78766f;font-size:12.5px;margin-top:24px;line-height:1.6">
          Plano montado pelo sistema a partir do que está cadastrado nele. É sugestão: os prazos
          continuam sendo conferidos no PJe. Marque o que for fazendo no Início do sistema — o que
          ficar sem marcar volta no plano do domingo que vem.</p>
      </div>`;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('ALERTA_EMAIL_DE') ?? 'onboarding@resend.dev',
          to: [para],
          subject: `Plano da semana: ${br(inicio)} a ${br(fim)}` +
            (naSemana.length ? ` — ${naSemana.length} prazo(s) vencendo` : ''),
          html,
        }),
      });
      email = String(r.status);
    }
  }

  const { data: salvo, error } = await adm.from('planejamento').upsert({
    escritorio_id: esc, semana_de, inicio, fim, plano: final, dados, feitos: [],
    modelo, email, gerado_em: new Date().toISOString(),
  }, { onConflict: 'escritorio_id,semana_de' }).select('id').single();
  if (error) return json({ erro: 'O plano saiu, mas não consegui gravar: ' + error.message, plano: final }, 500);

  return json({ id: salvo.id, semana_de, inicio, fim, modelo, email, dados, plano: final });
  }
});
