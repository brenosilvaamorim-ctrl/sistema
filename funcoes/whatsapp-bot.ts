// whatsapp-bot — assistente do WhatsApp do escritório (Supabase Edge Function)
//
// Conecta pelo Z-API, que mantém o número no celular (aparelho vinculado, como o
// WhatsApp Web) e ao mesmo tempo entrega as mensagens aqui. Conduz a triagem de PAD
// com o Claude e grava no que o sistema já tem: lead na Captação, respostas numa ficha
// e, fora do expediente, a consulta na Agenda (com link do Google Meet quando online).
//
// Regras que NÃO ficam a cargo da IA, porque são decididas aqui no código:
//   - se pode agendar sozinho (hora da conversa, urgência, área, conflito);
//   - a classificação de urgência (a partir das datas e da fase informadas);
//   - quais horários estão livres (agenda do sistema + Google Agenda).
//
// Três portas de entrada:
//   POST ?segredo=…  → webhook do Z-API (mensagem recebida)
//   POST com login   → tela de conversas do sistema (assumir, devolver, enviar)
//   GET              → sinal de vida
//
// Segredos (Supabase → Edge Functions → Secrets), nunca no código:
//   ZAPI_INSTANCIA, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN, ZAPI_SEGREDO
//   ANTHROPIC_API_KEY, RESEND_API_KEY, ALERTA_EMAIL_DE, ALERTA_EMAIL_PARA
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// Opcionais: BOT_MODEL, BOT_ESCRITORIO_ID, SISTEMA_URL, BOT_ENDERECO

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ============================================================ configuração

const TZ = "America/Recife"; // Petrolina e Juazeiro: UTC−3, sem horário de verão
const OFFSET = "-03:00";

const MODELO = Deno.env.get("BOT_MODEL") ?? "claude-opus-5";
if (!Deno.env.get("ZAPI_INSTANCIA") || !Deno.env.get("ZAPI_TOKEN")) {
  console.error("faltam os segredos ZAPI_INSTANCIA e ZAPI_TOKEN: a assistente não conseguirá responder");
}
const ZAPI = `https://api.z-api.io/instances/${Deno.env.get("ZAPI_INSTANCIA")}/token/${Deno.env.get("ZAPI_TOKEN")}`;
const ZAPI_CABECALHO = { "Content-Type": "application/json", "Client-Token": Deno.env.get("ZAPI_CLIENT_TOKEN") ?? "" };
const SISTEMA_URL = Deno.env.get("SISTEMA_URL") ?? "https://sistema.brenosamorimadvocacia.com.br";
const ENDERECO = Deno.env.get("BOT_ENDERECO") ?? "Rua do Cajueiro, 160, Sala 6, Centro, Petrolina - PE, 56304-420";

// Expediente: dentro dele a assistente só faz a triagem; fora dele, agenda sozinha.
const EXPEDIENTE = { inicio: 9, fim: 18 }; // seg a sex

// Horários oferecidos no agendamento automático.
const CONSULTA = {
  duracaoMin: 60,        // PENDENTE: confirmar com o Dr. Breno
  intervaloMin: 0,       // folga entre consultas
  primeiraHora: 9,
  ultimaHoraInicio: 17,  // última consulta começa às 17h
  diasUteisAFrente: 7,
  antecedenciaMinHoras: 12,
  quantosOferecer: 3,
};

// Presencial só para quem mora em Petrolina, Juazeiro e região (lista para o Dr. Breno revisar).
const CIDADES_PRESENCIAL = [
  "petrolina", "lagoa grande", "santa maria da boa vista", "oroco", "afranio", "dormentes",
  "juazeiro", "casa nova", "sobradinho", "curaca", "sento se",
];

// A assistente só entra em conversas sobre PAD. O escritório atende outras matérias pelo
// mesmo número: mensagem sem estes termos (nem anúncio sobre o tema) fica intocada para o
// Dr. Breno — sem resposta, sem "lida", sem lead e sem guardar o conteúdo.
const FILTRO_PAD = (Deno.env.get("BOT_FILTRO_PAD") ?? "nao") === "sim";
const GATILHOS = [
  /\bp\.?\s?a\.?\s?d\b/,            // PAD, P.A.D, P A D
  /sindicanc/,                    // sindicância, sindicancia
  /processo administrativo/,      // e "processo administrativo disciplinar"
  /processo adm\b/, /\bp\.?a\.?disciplinar/,
  /disciplinar/,                  // processo disciplinar, ação disciplinar
  /comissao processante/, /portaria de instauracao/,
  /sou servidor|servidora publica|servidor publico/,
];

// deno-lint-ignore no-explicit-any
function falaDePad(m: any): boolean {
  const texto = [m?.text?.message, m?.text?.title, m?.text?.description,
    m?.image?.caption, m?.document?.caption, m?.buttonsResponseMessage?.message,
    m?.listResponseMessage?.title]
    .filter(Boolean).map((t: string) => semAcento(String(t))).join(" ");
  return GATILHOS.some((g) => g.test(texto));
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// ============================================================ clientes

const sb: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const claude = new Anthropic(); // lê ANTHROPIC_API_KEY do ambiente

// ============================================================ datas e horas
// A Agenda do sistema grava a hora "de parede" com o rótulo +00:00 (ex.: 14h em Petrolina
// vira 14:00+00:00). O bot segue a mesma convenção ao ler e gravar `evento`, senão a
// consulta apareceria 3 horas deslocada. Para o Google, usa a hora real com −03:00.

type Local = { data: string; hora: number; minuto: number; dow: number };

function agoraLocal(): Local {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { data: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, minuto: Number(p.minute), dow };
}

function somaDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}
function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
}
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function br(data: string): string {
  const [y, m, d] = data.split("-");
  return `${d}/${m}/${y}`;
}
function rotuloHorario(data: string, min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${DIAS[diaDaSemana(data)]}, ${br(data).slice(0, 5)}, às ${h}h${m ? String(m).padStart(2, "0") : ""}`;
}
/** Hora de parede no formato que a Agenda do sistema usa. */
const paredeDB = (data: string, min: number) => `${data}T${hhmm(min)}:00+00:00`;
/** Hora real, para o Google. */
const realISO = (data: string, min: number) => `${data}T${hhmm(min)}:00${OFFSET}`;

function podeAgendarSozinho(a = agoraLocal()): boolean {
  const fimDeSemana = a.dow === 0 || a.dow === 6;
  return fimDeSemana || a.hora < EXPEDIENTE.inicio || a.hora >= EXPEDIENTE.fim;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// ============================================================ entrada HTTP

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Sinal de vida (e o que o navegador vê se alguém abrir o endereço).
  if (req.method === "GET") return new Response("assistente do WhatsApp no ar", { status: 200 });
  if (req.method !== "POST") return new Response("método não suportado", { status: 405 });

  const bruto = await req.text();

  // A tela de conversas do sistema chega com o login do usuário, sem o segredo.
  const segredo = url.searchParams.get("segredo");
  if (!segredo) return await atenderPainel(bruto, req.headers.get("authorization"));

  // O Z-API não assina os avisos: a proteção é o segredo no endereço do webhook.
  const esperado = Deno.env.get("ZAPI_SEGREDO") ?? "";
  if (!esperado || segredo.length !== esperado.length) return new Response("não autorizado", { status: 401 });
  let dif = 0;
  for (let i = 0; i < segredo.length; i++) dif |= segredo.charCodeAt(i) ^ esperado.charCodeAt(i);
  if (dif !== 0) return new Response("não autorizado", { status: 401 });

  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try { corpo = JSON.parse(bruto); } catch { return new Response("json inválido", { status: 400 }); }

  // O Z-API espera resposta rápida; o trabalho segue em segundo plano.
  const trabalho = receberAviso(corpo).catch((e) => console.error("erro ao processar aviso", e));
  // deno-lint-ignore no-explicit-any
  (globalThis as any).EdgeRuntime?.waitUntil?.(trabalho);
  return new Response("ok", { status: 200 });
});

// ============================================================ tela de conversas
// A tela do sistema manda {acao, conversa_id, texto}. Quem está falando é conferido
// pelo login do Supabase; o token do WhatsApp nunca sai daqui.

const json = (dados: unknown, status = 200) =>
  new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });

async function atenderPainel(bruto: string, autorizacao: string | null): Promise<Response> {
  // deno-lint-ignore no-explicit-any
  let corpo: any;
  try { corpo = JSON.parse(bruto || "{}"); } catch { return json({ erro: "json inválido" }, 400); }
  if (!corpo?.acao) return json({ erro: "chamada não reconhecida" }, 400);

  const jwt = (autorizacao ?? "").replace(/^Bearer\s+/i, "");
  const { data: dono, error: eAuth } = await sb.auth.getUser(jwt);
  if (eAuth || !dono?.user) return json({ erro: "faça login no sistema novamente" }, 401);

  const { data: usuario } = await sb.from("usuario")
    .select("escritorio_id, nome, ativo").eq("id", dono.user.id).maybeSingle();
  if (!usuario?.ativo) return json({ erro: "usuário sem acesso" }, 403);

  const { data: conversa } = await sb.from("bot_conversa").select("*")
    .eq("id", String(corpo.conversa_id ?? "")).maybeSingle();
  if (!conversa || conversa.escritorio_id !== usuario.escritorio_id) {
    return json({ erro: "conversa não encontrada" }, 404);
  }

  if (corpo.acao === "assumir" || corpo.acao === "devolver") {
    const estado = corpo.acao === "assumir" ? "humano" : "ativa";
    await sb.from("bot_conversa")
      .update({ estado, pausada_ate: null, processando_ate: null, trava: null, atualizado_em: new Date().toISOString() })
      .eq("id", conversa.id);
    return json({ ok: true, estado });
  }

  if (corpo.acao === "enviar") {
    const texto = String(corpo.texto ?? "").trim();
    if (!texto) return json({ erro: "escreva a mensagem" }, 400);
    if (texto.length > 3500) return json({ erro: "mensagem longa demais (máximo 3500 caracteres)" }, 400);

    const janela = await janelaAberta(conversa.id);
    if (!janela.aberta) {
      return json({ erro: `A janela de 24 horas fechou (última mensagem do cliente ${janela.quando ?? "há mais de um dia"}). O WhatsApp só aceita mensagem modelo agora — ligue para o cliente ou peça que ele escreva de novo.` }, 409);
    }

    // Quem responde assume a conversa: a assistente fica em silêncio.
    if (conversa.estado !== "humano") {
      await sb.from("bot_conversa").update({ estado: "humano" }).eq("id", conversa.id);
    }
    const enviada = await enviarTexto(conversa, texto, usuario.nome ?? null);
    if (!enviada.ok) return json({ erro: enviada.erro ?? "o WhatsApp recusou a mensagem" }, 502);
    return json({ ok: true });
  }

  return json({ erro: "ação desconhecida" }, 400);
}

/** Pelo Z-API não há janela de 24 horas; a função existe para o caso de voltarmos à API oficial. */
async function janelaAberta(conversaId: string): Promise<{ aberta: boolean; quando: string | null }> {
  // Pelo Z-API o número é um aparelho vinculado: não existe a janela de 24 horas da
  // API oficial. A conferência fica aqui só para o dia em que migrarmos para a Meta.
  const { data } = await sb.from("bot_mensagem").select("criado_em")
    .eq("conversa_id", conversaId).eq("direcao", "entrada")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  return { aberta: true, quando: data?.criado_em ?? null };
}

// ============================================================ avisos do Z-API

// O Z-API manda um aviso por mensagem, com o objeto todo na raiz.
// deno-lint-ignore no-explicit-any
async function receberAviso(m: any) {
  if (m?.type && m.type !== "ReceivedCallback") return;      // status, presença, etc.
  if (m?.isGroup || m?.isNewsletter || m?.broadcast) return;   // resposta a status é mensagem de gente
  const telefone = String(m?.phone ?? "").replace(/\D/g, "");
  if (!telefone) return;

  const escritorioId = await escritorio();

  // Mensagem que o próprio escritório mandou pelo celular: a assistente se cala
  // nessa conversa por 12 horas para não atropelar o Dr. Breno.
  if (m?.fromMe) {
    // Cuidado: com "notificar enviadas por mim" ligado, as respostas da própria
    // assistente voltam como fromMe. Só o que ela não enviou é resposta humana.
    if (m?.messageId) {
      const { data: nossa } = await sb.from("bot_mensagem").select("id")
        .eq("wamid", String(m.messageId)).eq("direcao", "saida").maybeSingle();
      if (nossa) return;
    }
    await sb.from("bot_conversa")
      .update({ pausada_ate: new Date(Date.now() + 12 * 3600e3).toISOString() })
      .eq("escritorio_id", escritorioId).eq("telefone", telefone);
    return;
  }

  const conversaId = await registrarEntrada(escritorioId, m, m?.senderName || m?.chatName || "");
  if (conversaId) await processarConversa(conversaId);
}

let ESCRITORIO: string | null = null;
async function escritorio(): Promise<string> {
  if (ESCRITORIO) return ESCRITORIO;
  const fixo = Deno.env.get("BOT_ESCRITORIO_ID");
  if (fixo) return (ESCRITORIO = fixo);
  const { data, error } = await sb.from("escritorio").select("id").order("criado_em").limit(1).single();
  if (error) throw error;
  return (ESCRITORIO = data.id as string);
}

/** Guarda a mensagem recebida. Devolve o id da conversa, ou null se for repetida. */
// deno-lint-ignore no-explicit-any
async function registrarEntrada(escritorioId: string, m: any, waNome: string): Promise<string | null> {
  const telefone = String(m.phone ?? "").replace(/\D/g, "");
  const { data: ja } = await sb.from("bot_conversa").select("id")
    .eq("escritorio_id", escritorioId).eq("telefone", telefone).maybeSingle();
  // Num número dedicado ao bot, todo mundo que escreve é lead: responder sempre.
  // Ligue FILTRO_PAD só se um dia a assistente for para o número principal.
  if (FILTRO_PAD && !ja && !falaDePad(m)) return null;
  const conversa = await obterConversa(escritorioId, telefone, waNome, m);
  if (!conversa?.id) throw new Error("não consegui abrir a conversa deste número");

  const { texto, midiaPath, tipo } = await lerConteudo(m, conversa.id);
  const { error } = await sb.from("bot_mensagem").insert({
    conversa_id: conversa.id, wamid: String(m.messageId ?? `${telefone}:${m.momment ?? Date.now()}`),
    direcao: "entrada", tipo,
    texto, midia_path: midiaPath,
  });
  if (error) {
    if (error.code === "23505") return null; // aviso repetido do Z-API
    throw error;
  }
  await sb.from("bot_conversa").update({ ultima_msg_em: new Date().toISOString() }).eq("id", conversa.id);
  marcarComoLida(telefone, m.messageId).catch(() => {});
  return conversa.id;
}

// deno-lint-ignore no-explicit-any
async function obterConversa(escritorioId: string, telefone: string, waNome: string, m: any) {
  const buscar = async () => {
    const { data, error } = await sb.from("bot_conversa").select("*")
      .eq("escritorio_id", escritorioId).eq("telefone", telefone).maybeSingle();
    if (error) throw error;
    return data;
  };
  let conversa = await buscar();
  if (conversa?.lead_id) return conversa;

  // A conversa nasce primeiro (a chave única resolve duas primeiras mensagens simultâneas);
  // o lead só é criado por quem conseguir preencher o lead_id ainda vazio.
  if (!conversa) {
    const origem = origemDoContato(m);
    const { error } = await sb.from("bot_conversa").upsert({
      escritorio_id: escritorioId, telefone, wa_nome: waNome || null, origem,
    }, { onConflict: "escritorio_id,telefone", ignoreDuplicates: true });
    if (error) throw error;
    conversa = await buscar();
    if (!conversa) throw new Error("conversa não criada");
    if (conversa.lead_id) return conversa;
  }

  const lead = await criarLead(escritorioId, telefone, waNome, conversa.origem ?? "WhatsApp direto");
  const { data: ganhou } = await sb.from("bot_conversa").update({ lead_id: lead.id })
    .eq("id", conversa.id).is("lead_id", null).select("id");
  if (!ganhou?.length) {
    await sb.from("lead").delete().eq("id", lead.id); // outro aviso chegou antes
    return await buscar();
  }
  const ficha = await criarFicha(escritorioId, lead.id, waNome, telefone);
  await sb.from("bot_conversa").update({ ficha_id: ficha?.id ?? null }).eq("id", conversa.id);
  return await buscar();
}

// deno-lint-ignore no-explicit-any
// O Z-API não informa de qual anúncio veio o clique. A origem sai do texto pronto
// que o anúncio coloca na primeira mensagem — por isso cada canal tem o seu.
function origemDoContato(m: any): string {
  const t = semAcento(m?.text?.message ?? "");
  if (t.includes("vim pelo site") || t.includes("vim pelo google")) return "Google Ads";
  if (t.includes("vim pelo instagram") || t.includes("vi seu anuncio") || t.includes("vi o anuncio")) return "Instagram (anúncio)";
  return "WhatsApp direto";
}

async function criarLead(escritorioId: string, telefone: string, waNome: string, origem: string) {
  const { data: o } = await sb.from("origem_captacao").select("id")
    .eq("escritorio_id", escritorioId).eq("nome", origem).maybeSingle();
  const { data, error } = await sb.from("lead").insert({
    escritorio_id: escritorioId, nome: waNome || `WhatsApp ${telefone}`, telefone,
    origem, origem_id: o?.id ?? null, etapa: "novo",
    resumo: "Contato pelo WhatsApp — triagem em andamento com a assistente.",
  }).select("id").single();
  if (error) throw error;
  return data;
}

async function criarFicha(escritorioId: string, leadId: string, waNome: string, telefone: string) {
  const { data: modelo } = await sb.from("ficha_modelo").select("id")
    .eq("escritorio_id", escritorioId).eq("nome", "Triagem WhatsApp — PAD e sindicância").maybeSingle();
  if (!modelo) return null;
  const { data } = await sb.from("ficha").insert({
    escritorio_id: escritorioId, modelo_id: modelo.id, lead_id: leadId,
    respostas: { nome: waNome || null, fone: telefone }, atendido_por: "Assistente do WhatsApp",
  }).select("id").single();
  return data;
}

// ------------------------------------------------------------ conteúdo da mensagem

// deno-lint-ignore no-explicit-any
async function lerConteudo(m: any, conversaId: string): Promise<{ texto: string; midiaPath: string | null; tipo: string }> {
  if (m?.text?.message) return { texto: String(m.text.message), midiaPath: null, tipo: "text" };
  if (m?.buttonsResponseMessage?.message) return { texto: String(m.buttonsResponseMessage.message), midiaPath: null, tipo: "botao" };
  if (m?.listResponseMessage?.title) return { texto: String(m.listResponseMessage.title), midiaPath: null, tipo: "lista" };

  const midias: [string, string, string][] = [   // [chave no aviso, campo da URL, aviso ao modelo]
    ["image", "imageUrl", "[O cliente enviou uma foto. Ela foi guardada na ficha para o Dr. Breno ver.]"],
    ["document", "documentUrl", "[O cliente enviou um documento. Ele foi guardado na ficha para o Dr. Breno ver.]"],
    ["audio", "audioUrl", "[O cliente enviou um áudio. A assistente não consegue ouvir áudios; o arquivo foi guardado.]"],
    ["video", "videoUrl", "[O cliente enviou um vídeo. Ele foi guardado; a assistente não consegue assistir.]"],
  ];
  for (const [chave, campoUrl, aviso] of midias) {
    const midia = m?.[chave];
    if (!midia) continue;
    let caminho: string | null = null;
    try { caminho = await guardarMidia(midia[campoUrl], midia.mimeType, conversaId, m.messageId, midia.fileName); }
    catch (e) { console.error("falha ao baixar mídia", e); }
    const nome = midia.fileName ? ` "${midia.fileName}"` : "";
    const legenda = midia.caption ? ` Legenda: ${midia.caption}` : "";
    return { texto: `${aviso.replace(".", nome + ".")}${legenda}`, midiaPath: caminho, tipo: chave };
  }

  if (m?.location) {
    return { texto: `[O cliente enviou uma localização: ${m.location?.name ?? ""} ${m.location?.address ?? ""}]`, midiaPath: null, tipo: "location" };
  }
  if (m?.contact) return { texto: "[O cliente enviou um contato.]", midiaPath: null, tipo: "contato" };
  return { texto: "[O cliente enviou uma mensagem que a assistente não consegue ler.]", midiaPath: null, tipo: "outro" };
}

/** Baixa o arquivo do armazenamento do Z-API (fica 30 dias lá) e guarda no bucket do sistema. */
async function guardarMidia(url: string, mime: string, conversaId: string, messageId: string, nome?: string) {
  if (!url) return null;
  const arquivo = await fetch(url);
  if (!arquivo.ok) throw new Error(`download da mídia respondeu ${arquivo.status}`);
  const ext = nome?.includes(".") ? nome.split(".").pop() : (mime?.split("/")[1]?.split(";")[0] ?? "bin");
  // O bucket `fichas` só deixa ler quem é do escritório dono da primeira pasta do caminho.
  const caminho = `${await escritorio()}/whatsapp/${conversaId}/${messageId ?? crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("fichas").upload(caminho, await arquivo.arrayBuffer(), {
    contentType: mime || "application/octet-stream", upsert: true,
  });
  if (error) throw error;
  return caminho;
}

// ============================================================ o turno da assistente

async function processarConversa(conversaId: string) {
  // Quem manda várias mensagens seguidas recebe uma resposta só: a espera deixa a
  // rajada chegar, e a trava garante que um único aviso responda por vez.
  await new Promise((r) => setTimeout(r, 4000));

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const trava = crypto.randomUUID();
    const { data: pegou } = await sb.rpc("bot_travar_conversa", { p_conversa: conversaId, p_trava: trava });
    if (!pegou) return; // outro aviso já está respondendo; ele recolhe as mensagens novas

    try {
      for (let rodada = 0; rodada < 3; rodada++) {
        const respondeu = await responderPendentes(conversaId, trava);
        if (!respondeu) break;
      }
    } finally {
      // Solta só a própria trava (se ela tiver expirado, outro aviso pode estar com a vez).
      await sb.from("bot_conversa").update({ processando_ate: null, trava: null })
        .eq("id", conversaId).eq("trava", trava);
    }

    // Uma mensagem pode ter chegado entre a última conferência e a liberação da trava.
    const { count } = await sb.from("bot_mensagem").select("id", { count: "exact", head: true })
      .eq("conversa_id", conversaId).eq("direcao", "entrada").eq("processada", false);
    if (!count) return;
  }
}

/** Renova a trava enquanto o turno trabalha; falha se outro aviso tiver tomado a vez. */
async function renovarTrava(conversaId: string, trava: string) {
  const { data } = await sb.from("bot_conversa")
    .update({ processando_ate: new Date(Date.now() + 5 * 60e3).toISOString() })
    .eq("id", conversaId).eq("trava", trava).select("id");
  if (!data?.length) throw new Error("a trava da conversa foi perdida");
}

/** Responde às mensagens ainda não processadas. Devolve false se não havia nenhuma. */
async function responderPendentes(conversaId: string, trava: string): Promise<boolean> {
  const { data: conversa, error: e1 } = await sb.from("bot_conversa").select("*").eq("id", conversaId).single();
  if (e1) throw e1;
  const { data: pendentes, error: e2 } = await sb.from("bot_mensagem").select("id, texto")
    .eq("conversa_id", conversaId).eq("direcao", "entrada").eq("processada", false).order("criado_em");
  if (e2) throw e2;
  if (!pendentes?.length) return false;

  const ids = pendentes.map((p) => p.id);
  const calada = conversa.estado !== "ativa" ||
    (conversa.pausada_ate && Date.parse(conversa.pausada_ate) > Date.now());
  if (calada) {
    await sb.from("bot_mensagem").update({ processada: true }).in("id", ids);
    return false;
  }

  const historico = Array.isArray(conversa.mensagens) ? conversa.mensagens : [];
  const falaDoCliente = { role: "user", content: [{ type: "text", text: pendentes.map((p) => p.texto).join("\n") }] };
  // deno-lint-ignore no-explicit-any
  let mensagens: any[] = [...historico, falaDoCliente];
  // Contexto do momento vai numa mensagem de sistema (canal do operador, que o cliente
  // não consegue imitar) logo depois da fala do cliente. Ele vale só para este turno:
  // guardar os de todos os turnos encheria a conversa de horários velhos.
  mensagens.push({ role: "system", content: contextoDoMomento(conversa) });

  const ctx: Ctx = { conversa, escritorioId: conversa.escritorio_id };
  const enviados: string[] = [];
  let textoFinal = "";

  try {
    for (let volta = 0; volta < 8 && !textoFinal; volta++) {
      await renovarTrava(conversaId, trava);
      const resp = await chamarClaude(mensagens);

      if (resp.stop_reason === "refusal") {
        mensagens.push({ role: "assistant", content: resp.content });
        textoFinal = "Desculpe, não consigo seguir com esse assunto por aqui. Vou pedir para o Dr. Breno falar com você.";
        await encaminharHumano(ctx, "A assistente recusou continuar a conversa (recusa de segurança do modelo).");
        break;
      }
      // Resposta cortada: uma chamada de ferramenta pela metade não pode ser executada.
      if (resp.stop_reason === "max_tokens") throw new Error("resposta da IA cortada por tamanho (max_tokens)");

      mensagens.push({ role: "assistant", content: resp.content });
      if (resp.stop_reason === "pause_turn") continue;

      // deno-lint-ignore no-explicit-any
      const usos = resp.content.filter((b: any) => b.type === "tool_use");
      // deno-lint-ignore no-explicit-any
      const textos = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      if (!usos.length) {
        if (!textos) throw new Error("a IA terminou o turno sem texto");
        textoFinal = textos;
        break;
      }
      if (textos) { await enviarTexto(conversa, textos); enviados.push(textos); } // "vou verificar..."

      const resultados = [];
      for (const u of usos) {
        let conteudo: string, erro = false;
        try { conteudo = JSON.stringify(await executarFerramenta(ctx, u.name, u.input ?? {})); }
        catch (e) { conteudo = `Erro: ${(e as Error).message}`; erro = true; console.error("ferramenta", u.name, e); }
        resultados.push({ type: "tool_result", tool_use_id: u.id, content: conteudo, is_error: erro });
      }
      mensagens.push({ role: "user", content: resultados });
    }
    if (!textoFinal) throw new Error("a IA não concluiu o turno em 8 voltas");
  } catch (e) {
    console.error("falha no turno da assistente", e);
    await avisarPorEmail(
      `Falha na assistente do WhatsApp — ${conversa.wa_nome ?? conversa.telefone}`,
      `<p>A assistente não conseguiu responder ao número ${conversa.telefone} e passou a conversa para você.</p><pre>${escHtml(String(e))}</pre>`,
    );
    textoFinal = "Tive uma instabilidade aqui. Já avisei o escritório, e o Dr. Breno ou a equipe vai retornar em breve.";
    await sb.from("bot_conversa").update({ estado: "humano" }).eq("id", conversa.id);
    // Um turno interrompido pode deixar uma chamada de ferramenta sem resposta, o que
    // quebraria a próxima chamada à API. Guarda o turno só com o que o cliente leu.
    mensagens = [...historico, falaDoCliente,
      { role: "assistant", content: [{ type: "text", text: [...enviados, textoFinal].join("\n") }] }];
  }

  // deno-lint-ignore no-explicit-any
  const paraGuardar = mensagens.filter((m: any) => m?.role !== "system");
  await sb.from("bot_conversa").update({ mensagens: paraGuardar, atualizado_em: new Date().toISOString() }).eq("id", conversa.id);
  await sb.from("bot_mensagem").update({ processada: true }).in("id", ids);
  if (textoFinal) await enviarTexto(conversa, textoFinal);
  return true;
}

// deno-lint-ignore no-explicit-any
function contextoDoMomento(conversa: any): string {
  const a = agoraLocal();
  const agenda = podeAgendarSozinho(a)
    ? "FORA do expediente: se a triagem estiver completa e o sistema permitir, ofereça horários (consultar_horarios)."
    : "DENTRO do expediente (seg a sex, 9h–18h): NÃO ofereça horários. Ao concluir a triagem, diga que o Dr. Breno vai analisar e retornar para marcar.";
  return [
    `Agora: ${DIAS[a.dow]}, ${br(a.data)}, ${hhmm(a.hora * 60 + a.minuto)} (horário de Brasília).`,
    `Momento: ${agenda}`,
    `Origem do contato: ${conversa.origem ?? "desconhecida"}. Nome no perfil do WhatsApp: ${conversa.wa_nome || "não informado"}.`,
    conversa.urgencia !== "normal" ? `Urgência já classificada pelo sistema: ${conversa.urgencia}.` : "",
  ].filter(Boolean).join("\n");
}

// deno-lint-ignore no-explicit-any
async function chamarClaude(mensagens: any[]): Promise<any> {
  const params = {
    model: MODELO,
    max_tokens: 4096,
    system: INSTRUCOES,
    tools: FERRAMENTAS,
    messages: mensagens,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    // Se o modelo recusar por política de segurança, a própria API refaz com o modelo
    // de reserva recomendado, em vez de devolver a recusa.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
  // Mensagens de sistema no meio da conversa e `fallbacks: "default"` são mais novos que
  // as tipagens do SDK; o formato segue a documentação da API.
  // deno-lint-ignore no-explicit-any
  return await claude.beta.messages.create(params as any);
}

// ============================================================ instruções da assistente

const INSTRUCOES = `Você é a assistente virtual do escritório Breno S. Amorim Advocacia (Petrolina/PE), atendendo pelo WhatsApp pessoas que chegaram por anúncios sobre processo administrativo disciplinar (PAD) e sindicância no serviço público. Seu trabalho é a triagem inicial: entender o caso, registrar as informações e, quando o sistema permitir, marcar a consulta. Quem avalia o caso é sempre o Dr. Breno.

# Como conversar
- Português do Brasil, cordial e direto. Frases curtas. Uma ou duas perguntas por mensagem. É WhatsApp: nada de textos longos, títulos ou listas extensas. Para destacar, use *negrito* do WhatsApp com moderação.
- Sem juridiquês. Se usar um termo técnico, explique em poucas palavras.
- Chame a pessoa pelo primeiro nome depois que souber.
- Na primeira resposta, apresente-se como assistente virtual do escritório. Nunca diga ou dê a entender que é o Dr. Breno ou uma pessoa.

# Regras de conduta (inegociáveis)
1. Não dê parecer. Não diga se a pessoa tem direito, se vai ganhar, se o processo é nulo, se prescreveu ou se cabe recurso. Resposta padrão: "Essa avaliação é feita pelo Dr. Breno na consulta, com os documentos em mãos."
2. Não fale de honorários, valores ou percentuais. Pode dizer que a consulta inicial é gratuita.
3. Não prometa resultado nem prazo de solução.
4. Não peça CPF, RG, senha, matrícula completa nem dados bancários. Se a pessoa mandar, não repita esses dados.
5. Não fale mal da administração, da comissão, de colegas advogados ou de ninguém.
6. Se pedirem para falar com uma pessoa, aceite na hora: chame encaminhar_para_humano e avise que o Dr. Breno retorna.
7. Se a pessoa já tiver advogado no caso, diga que o escritório pode fazer uma consulta de segunda opinião, sem interferir no trabalho do colega.
8. Se quem fala for membro da comissão, chefia ou denunciante (e não o servidor investigado), registre o papel, colha só nome e um resumo, e não ofereça agendamento: o Dr. Breno precisa verificar conflito de interesse.
9. Mensagens entre colchetes, como "[O cliente enviou um documento...]", são avisos do sistema sobre anexos. Agradeça o envio; você não vê o conteúdo dos arquivos.
10. Se a pessoa relatar risco à própria vida ou crise emocional grave, acolha com cuidado, indique o CVV (ligue 188, 24 horas) e chame encaminhar_para_humano.
11. Assuntos fora do escopo (outros ramos do direito, conversa aleatória): seja gentil, registre um resumo e diga que o Dr. Breno vai avaliar.

# Roteiro da triagem (nesta ordem, com naturalidade)
1. Apresentação e consentimento: explique que fará algumas perguntas rápidas para encaminhar o caso ao Dr. Breno e que os dados serão usados só para esse atendimento. Pergunte se pode seguir. Registre a resposta (consentimento). Se a pessoa não aceitar, agradeça e encerre sem colher o caso.
2. Nome e cidade/UF.
3. Confirme se o caso envolve PAD, sindicância ou punição no serviço público. Se não envolver, registre area="Outra área" com um resumo e diga que o Dr. Breno vai avaliar.
4. Vínculo: ente (federal, estadual, municipal, militar estadual, empresa pública), órgão, cargo, se é estável ou está em estágio probatório.
5. Fase atual do procedimento (pergunta central).
6. Datas que se aplicam à fase: do fato, da portaria, da citação ou indiciação, fim do prazo de defesa, audiência ou interrogatório marcados, publicação da punição, início do afastamento. Aceite datas aproximadas (mês/ano) e registre que são aproximadas. Registre no formato AAAA-MM-DD; se só souber mês e ano, use o dia 01 e anote em datas_aproximadas.
7. Em poucas palavras, do que está sendo acusado.
8. Se tem documentos (portaria, citação, termo de indiciação, relatório, decisão). Convide a mandar foto ou PDF por aqui mesmo. Pergunte se já tem advogado no caso.
9. Se mora em Petrolina, Juazeiro ou região, pergunte se prefere consulta presencial ou online. Para as demais cidades, a consulta é online, pelo Google Meet.

Registre as respostas com registrar_triagem assim que surgirem (pode chamar várias vezes, só com os campos novos). O retorno da ferramenta traz a classificação de urgência calculada pelo sistema e as instruções de próximo passo: siga essas instruções.

# Urgência
Quem classifica é o sistema, a partir das datas e da fase. Se o retorno indicar urgência, o Dr. Breno já foi avisado por e-mail. Diga à pessoa, com calma, que há um prazo em andamento, que o Dr. Breno foi avisado com prioridade e que ele ou a equipe entra em contato o quanto antes. Não explique prazos legais nem faça contas de prescrição com o cliente.

# Encerramento da triagem e agendamento
Quando tiver o essencial (nome, cidade, confirmação da área, fase, datas principais, relato), chame concluir_triagem com um resumo objetivo para o Dr. Breno. O retorno diz o que fazer:
- "agendar": ofereça os horários de consultar_horarios, exatamente como vierem, e peça para a pessoa escolher. Se nenhum servir, chame consultar_horarios de novo com pular. Depois da escolha, chame agendar_consulta e confirme com dia, hora, formato e link ou endereço, exatamente como a ferramenta devolver.
- "aguardar": diga que recebeu tudo e que o Dr. Breno vai analisar as respostas e retornar em breve para marcar o atendimento.
- "urgente" ou "humano": siga a orientação do retorno.
Nunca invente horários, links ou endereços: use só o que as ferramentas devolverem. Se a ferramenta recusar o agendamento, siga a orientação que ela der.

# Depois da triagem
Se a pessoa mandar novidades (nova notificação, prazo, publicação), registre com registrar_triagem e diga que vai repassar ao Dr. Breno. Para remarcar ou cancelar consulta, chame encaminhar_para_humano.`;

// ============================================================ ferramentas

const DATA = { type: "string", description: "Data no formato AAAA-MM-DD" };

const FERRAMENTAS = [
  {
    name: "registrar_triagem",
    description: "Grava na ficha do lead as informações que o cliente acabou de dar. Envie só os campos novos ou corrigidos. Devolve a urgência calculada pelo sistema, o que ainda falta perguntar e instruções de próximo passo.",
    input_schema: {
      type: "object",
      properties: {
        consentimento: { type: "string", enum: ["sim", "não"] },
        nome: { type: "string" },
        cidade: { type: "string" },
        uf: { type: "string", description: "Sigla, ex.: PE" },
        papel: { type: "string", enum: ["Servidor acusado/investigado", "Familiar do servidor", "Membro de comissão / chefia / denunciante", "Outro"] },
        area: { type: "string", enum: ["PAD/sindicância", "Outra área"] },
        resumo_outra_area: { type: "string" },
        ente: { type: "string", enum: ["Federal", "Estadual", "Municipal", "Militar estadual (PM/BM)", "Empresa pública / economia mista", "Outro"] },
        orgao: { type: "string" },
        cargo: { type: "string" },
        estavel: { type: "string", enum: ["Estável", "Estágio probatório", "Não sabe"] },
        fase: { type: "string", enum: ["Ainda não há processo", "Sindicância", "PAD instaurado, sem citação", "Citado/indiciado — prazo de defesa correndo", "Interrogatório ou audiência marcados", "Relatório final / aguardando julgamento", "Já punido", "Afastado preventivamente"] },
        penalidade: { type: "string", enum: ["Advertência", "Suspensão", "Demissão", "Cassação de aposentadoria", "Destituição de cargo em comissão", "Exclusão / perda do posto", "Outra"] },
        acusacao: { type: "string", description: "Do que é acusado, nas palavras do cliente, resumido" },
        tem_advogado: { type: "string", enum: ["sim", "não", "não sei"] },
        documentos: { type: "string", description: "Documentos que diz ter ou que enviou" },
        data_fato: DATA, data_ciencia: DATA, data_portaria: DATA, data_citacao: DATA,
        prazo_defesa_fim: DATA, data_audiencia: DATA, data_punicao: DATA, data_afastamento: DATA,
        datas_aproximadas: { type: "string", description: "Quais datas foram dadas de forma aproximada" },
        formato: { type: "string", enum: ["Presencial", "Online"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "concluir_triagem",
    description: "Encerra a triagem quando o essencial foi colhido. Grava o resumo para o Dr. Breno e devolve o próximo passo: agendar, aguardar, urgente ou humano.",
    input_schema: {
      type: "object",
      properties: {
        resumo: { type: "string", description: "Resumo objetivo do caso para o Dr. Breno, em até 6 linhas" },
      },
      required: ["resumo"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_horarios",
    description: "Lista horários livres para a consulta inicial. Só funciona se concluir_triagem tiver devolvido 'agendar'.",
    input_schema: {
      type: "object",
      properties: {
        formato: { type: "string", enum: ["Presencial", "Online"] },
        pular: { type: "integer", description: "Quantos horários pular (para oferecer outras opções). Padrão 0." },
      },
      required: ["formato"],
      additionalProperties: false,
    },
  },
  {
    name: "agendar_consulta",
    description: "Marca a consulta no horário que o cliente escolheu entre os oferecidos por consultar_horarios.",
    input_schema: {
      type: "object",
      properties: {
        horario_id: { type: "string", description: "O id do horário escolhido, exatamente como veio de consultar_horarios" },
        formato: { type: "string", enum: ["Presencial", "Online"] },
        email: { type: "string", description: "E-mail do cliente, se ele quiser receber o convite (opcional)" },
      },
      required: ["horario_id", "formato"],
      additionalProperties: false,
    },
  },
  {
    name: "encaminhar_para_humano",
    description: "Passa a conversa para o Dr. Breno e silencia a assistente neste número. Use quando o cliente pedir uma pessoa, para remarcar ou cancelar consulta, ou em situação delicada.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
];

// deno-lint-ignore no-explicit-any
type Ctx = { conversa: any; escritorioId: string };

// deno-lint-ignore no-explicit-any
async function executarFerramenta(ctx: Ctx, nome: string, entrada: any): Promise<unknown> {
  switch (nome) {
    case "registrar_triagem": return await registrarTriagem(ctx, entrada);
    case "concluir_triagem": return await concluirTriagem(ctx, entrada);
    case "consultar_horarios": return await consultarHorarios(ctx, entrada);
    case "agendar_consulta": return await agendarConsulta(ctx, entrada);
    case "encaminhar_para_humano": return await encaminharHumano(ctx, String(entrada?.motivo ?? ""));
    default: throw new Error(`ferramenta desconhecida: ${nome}`);
  }
}

// ------------------------------------------------------------ ficha e lead

// deno-lint-ignore no-explicit-any
async function lerFicha(ctx: Ctx): Promise<Record<string, any>> {
  if (!ctx.conversa.ficha_id) return {};
  const { data } = await sb.from("ficha").select("respostas").eq("id", ctx.conversa.ficha_id).single();
  return data?.respostas ?? {};
}

// deno-lint-ignore no-explicit-any
async function gravarFicha(ctx: Ctx, novos: Record<string, any>) {
  if (!ctx.conversa.ficha_id) return;
  const atual = await lerFicha(ctx);
  await sb.from("ficha").update({ respostas: { ...atual, ...novos }, atualizado_em: new Date().toISOString() })
    .eq("id", ctx.conversa.ficha_id);
}

const CAMPOS_FICHA = new Set([
  "consentimento", "nome", "cidade", "uf", "papel", "ente", "orgao", "cargo", "estavel", "fase", "penalidade",
  "acusacao", "tem_advogado", "documentos", "data_fato", "data_ciencia", "data_portaria", "data_citacao",
  "prazo_defesa_fim", "data_audiencia", "data_punicao", "data_afastamento", "datas_aproximadas", "formato",
]);

// deno-lint-ignore no-explicit-any
async function registrarTriagem(ctx: Ctx, e: any) {
  const novos: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e ?? {})) {
    if (!CAMPOS_FICHA.has(k) || v == null || v === "") continue;
    if (k.startsWith("data_") || k === "prazo_defesa_fim") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) continue; // data mal formada não entra
    }
    novos[k] = v;
  }
  if (e?.area) novos.area_triagem = e.area;
  if (e?.resumo_outra_area) novos.resumo = e.resumo_outra_area;

  const ficha = { ...(await lerFicha(ctx)), ...novos };
  const urg = classificarUrgencia(ficha);
  await gravarFicha(ctx, { ...novos, urgencia: urg.nivel, urgencia_motivo: urg.motivos.join("; ") || null, alertas_internos: urg.alertas.join("\n") || null });

  // Lead na Captação: nome de verdade assim que souber, e a área. (`viabilidade` e `nota`
  // são do quadro de viabilidade da tela; a assistente não mexe neles.)
  const lead: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
  if (novos.nome) lead.nome = novos.nome;
  if (e?.area === "PAD/sindicância") Object.assign(lead, await areaServidor(ctx.escritorioId));
  if (e?.area === "Outra área") lead.area = "Outra área (triagem WhatsApp)";
  await sb.from("lead").update(lead).eq("id", ctx.conversa.lead_id);

  // Urgência nova: e-mail imediato, uma vez só.
  let orientacao = "Siga o roteiro com a próxima pergunta que faltar.";
  await sb.from("bot_conversa").update({ urgencia: urg.nivel }).eq("id", ctx.conversa.id);
  ctx.conversa.urgencia = urg.nivel;
  if (urg.nivel === "urgente") {
    if (!ctx.conversa.urgencia_avisada_em) {
      await avisarUrgencia(ctx, ficha, urg);
      ctx.conversa.urgencia_avisada_em = new Date().toISOString();
      await sb.from("bot_conversa").update({ urgencia_avisada_em: ctx.conversa.urgencia_avisada_em }).eq("id", ctx.conversa.id);
    }
    orientacao = "URGENTE: o Dr. Breno já foi avisado por e-mail. Diga isso à pessoa com calma. Complete rapidamente o que faltar (acusação e documentos) e conclua a triagem. Não ofereça horários.";
  }
  if (ficha.consentimento === "não") orientacao = "A pessoa não consentiu. Agradeça, diga que fica à disposição e encerre sem colher mais dados.";
  if (ficha.papel === "Membro de comissão / chefia / denunciante") orientacao = "Possível conflito de interesse: colha só nome e resumo, conclua a triagem e não ofereça horários.";

  return { gravado: Object.keys(novos), urgencia: urg.nivel, faltando: faltando(ficha), orientacao };
}

// deno-lint-ignore no-explicit-any
function faltando(f: Record<string, any>): string[] {
  const falta: string[] = [];
  if (!f.consentimento) falta.push("consentimento");
  if (!f.nome) falta.push("nome");
  if (!f.cidade) falta.push("cidade");
  if (!f.area_triagem) falta.push("confirmação de que é PAD/sindicância");
  if (f.area_triagem === "Outra área") return falta;
  if (!f.ente) falta.push("ente");
  if (!f.cargo) falta.push("cargo");
  if (!f.fase) falta.push("fase");
  if (!f.acusacao) falta.push("do que é acusado");
  if (f.fase === "Citado/indiciado — prazo de defesa correndo" && !f.data_citacao && !f.prazo_defesa_fim) falta.push("data da citação ou fim do prazo de defesa");
  if (f.fase === "Interrogatório ou audiência marcados" && !f.data_audiencia) falta.push("data da audiência");
  if (f.fase === "Já punido" && !f.data_punicao) falta.push("data da publicação da punição");
  if (f.fase === "Afastado preventivamente" && !f.data_afastamento) falta.push("data do afastamento");
  if (!f.tem_advogado) falta.push("se já tem advogado");
  return falta;
}

let AREA_CACHE: Record<string, unknown> | null = null;
async function areaServidor(escritorioId: string) {
  if (AREA_CACHE) return AREA_CACHE;
  const { data } = await sb.from("area_atuacao").select("id, nome").eq("escritorio_id", escritorioId).eq("ativo", true);
  const achada = (data ?? []).find((a) => /servidor|administrativ|pad|disciplinar/i.test(a.nome));
  return (AREA_CACHE = achada ? { area_id: achada.id, area: achada.nome } : { area: "Servidor público — PAD" });
}

// ------------------------------------------------------------ urgência (regras do escritório)

type Urgencia = { nivel: "normal" | "alta" | "urgente"; motivos: string[]; alertas: string[] };

// deno-lint-ignore no-explicit-any
function classificarUrgencia(f: Record<string, any>): Urgencia {
  const hoje = agoraLocal().data;
  const u: Urgencia = { nivel: "normal", motivos: [], alertas: [] };
  const sobe = (n: Urgencia["nivel"], motivo: string) => {
    const ordem = { normal: 0, alta: 1, urgente: 2 };
    if (ordem[n] > ordem[u.nivel]) u.nivel = n;
    u.motivos.push(motivo);
  };
  const ha = (d?: string) => (d ? diasEntre(d, hoje) : null); // dias desde a data

  if (f.fase === "Citado/indiciado — prazo de defesa correndo") {
    const fim = f.prazo_defesa_fim;
    if (!fim || diasEntre(hoje, fim) >= 0) sobe("urgente", "prazo de defesa em curso");
    else sobe("alta", `prazo de defesa informado já venceu (${br(fim)})`);
  }
  if (f.data_audiencia) {
    const faltam = diasEntre(hoje, f.data_audiencia);
    if (faltam >= 0 && faltam <= 7) sobe("urgente", `interrogatório/audiência em ${faltam} dia(s) (${br(f.data_audiencia)})`);
    else if (faltam > 7) sobe("alta", `interrogatório/audiência marcado para ${br(f.data_audiencia)}`);
  } else if (f.fase === "Interrogatório ou audiência marcados") sobe("alta", "audiência marcada, data não informada");

  const desdePunicao = ha(f.data_punicao);
  if (desdePunicao != null && desdePunicao >= 0) {
    if (desdePunicao <= 30) sobe("urgente", `punição publicada há ${desdePunicao} dia(s): prazo de recurso administrativo`);
    else if (desdePunicao <= 120) sobe("urgente", `punição publicada há ${desdePunicao} dias: dentro dos 120 dias do mandado de segurança`);
    const limiteMS = somaDias(f.data_punicao, 120);
    u.alertas.push(desdePunicao <= 120
      ? `MS: 120 dias da publicação (art. 23 da Lei 12.016/2009) vencem em ${br(limiteMS)} — conferir a data de ciência.`
      : `Punição há ${desdePunicao} dias: fora da janela do MS; avaliar ação anulatória (prescrição quinquenal, Decreto 20.910/32).`);
  } else if (f.fase === "Já punido") sobe("alta", "já punido, data da punição não informada");

  const desdeAfast = ha(f.data_afastamento);
  if (desdeAfast != null && desdeAfast >= 0 && desdeAfast <= 30) sobe("urgente", `afastamento preventivo há ${desdeAfast} dia(s)`);
  else if (f.fase === "Afastado preventivamente") sobe("alta", "afastamento preventivo");

  if (["PAD instaurado, sem citação", "Relatório final / aguardando julgamento", "Sindicância"].includes(f.fase)) {
    sobe("alta", `fase: ${f.fase}`);
  }

  const desdeFato = ha(f.data_fato), desdeCiencia = ha(f.data_ciencia);
  const base = desdeCiencia ?? desdeFato;
  if (base != null && base > 5 * 365) {
    u.alertas.push(`Fato/ciência há mais de 5 anos: verificar prescrição da pretensão punitiva (na Lei 8.112, art. 142: 5 anos demissão, 2 suspensão, 180 dias advertência; conferir o estatuto aplicável e as interrupções).`);
  } else if (base != null && base > 180) {
    u.alertas.push(`Fato/ciência há ${base} dias: conferir prescrição para advertência (180 dias na Lei 8.112) e o marco interruptivo da portaria.`);
  }
  if (f.estavel === "Estágio probatório") u.alertas.push("Estágio probatório: verificar se é PAD ou avaliação de estágio (exoneração).");
  if (f.datas_aproximadas) u.alertas.push(`Datas aproximadas: ${f.datas_aproximadas}.`);
  return u;
}

// ------------------------------------------------------------ concluir triagem

// deno-lint-ignore no-explicit-any
async function concluirTriagem(ctx: Ctx, e: any) {
  const resumo = String(e?.resumo ?? "").trim();
  const f = await lerFicha(ctx);
  const urg = classificarUrgencia(f);
  const falta = faltando(f);

  let passo: "agendar" | "aguardar" | "urgente" | "humano";
  let encaminhamento: string;
  let orientacao: string;

  if (f.consentimento === "não") {
    passo = "humano"; encaminhamento = "Outra área / fora do perfil";
    orientacao = "Sem consentimento: agradeça e encerre.";
  } else if (f.papel === "Membro de comissão / chefia / denunciante") {
    passo = "aguardar"; encaminhamento = "Só triagem — aguardando o Dr. Breno";
    orientacao = "Diga que o Dr. Breno vai analisar e retornar. Não ofereça horários.";
  } else if (f.area_triagem === "Outra área") {
    passo = "aguardar"; encaminhamento = "Outra área / fora do perfil";
    orientacao = "Diga que o Dr. Breno vai avaliar o caso e retornar.";
  } else if (urg.nivel === "urgente") {
    passo = "urgente"; encaminhamento = "Urgente — Dr. Breno avisado";
    orientacao = "Reforce que o Dr. Breno foi avisado com prioridade e retorna o quanto antes. Não ofereça horários.";
  } else if (podeAgendarSozinho()) {
    passo = "agendar"; encaminhamento = "Só triagem — aguardando o Dr. Breno"; // vira "Agendou" em agendar_consulta
    orientacao = falta.length
      ? `Antes de oferecer horários, pergunte o que falta: ${falta.join(", ")}. Depois chame consultar_horarios.`
      : "Pergunte presencial ou online (presencial só para Petrolina, Juazeiro e região) e chame consultar_horarios.";
  } else {
    passo = "aguardar"; encaminhamento = "Só triagem — aguardando o Dr. Breno";
    orientacao = "Diga que recebeu tudo e que o Dr. Breno vai analisar as respostas e retornar em breve para marcar o atendimento.";
  }

  // A ficha continua em rascunho: quem a conclui é o Dr. Breno, depois de conferir.
  await gravarFicha(ctx, { resumo, encaminhamento, urgencia: urg.nivel });
  await sb.from("lead").update({
    resumo: `[Triagem WhatsApp — ${urg.nivel}] ${resumo}`, atualizado_em: new Date().toISOString(),
  }).eq("id", ctx.conversa.lead_id);
  await sb.from("lead").update({ etapa: "contatado" }).eq("id", ctx.conversa.lead_id).eq("etapa", "novo");

  const primeiraVez = !ctx.conversa.triagem_concluida_em;
  if (primeiraVez) {
    ctx.conversa.triagem_concluida_em = new Date().toISOString();
    await sb.from("bot_conversa").update({ triagem_concluida_em: ctx.conversa.triagem_concluida_em }).eq("id", ctx.conversa.id);
    // No expediente, o Dr. Breno recebe a triagem para decidir o atendimento.
    // Urgente já gerou o e-mail próprio; nos demais, o Dr. Breno recebe a triagem.
    if (passo !== "urgente") await avisarTriagemConcluida(ctx, f, urg, resumo, passo === "agendar");
  }
  return { proximo_passo: passo, faltando: falta, orientacao };
}

// ------------------------------------------------------------ horários

// deno-lint-ignore no-explicit-any
async function podeOferecer(ctx: Ctx, formato: string): Promise<{ ok: true; f: Record<string, any> } | { ok: false; motivo: string }> {
  if (!podeAgendarSozinho()) return { ok: false, motivo: "Agora é horário de expediente: o Dr. Breno vai analisar e retornar para marcar. Diga isso ao cliente." };
  if (!ctx.conversa.triagem_concluida_em) return { ok: false, motivo: "Conclua a triagem (concluir_triagem) antes de oferecer horários." };
  const f = await lerFicha(ctx);
  const urg = classificarUrgencia(f);
  if (urg.nivel === "urgente") return { ok: false, motivo: "Caso urgente: não agendar automaticamente. O Dr. Breno já foi avisado e vai retornar." };
  if (f.area_triagem !== "PAD/sindicância") return { ok: false, motivo: "Só casos de PAD/sindicância são agendados automaticamente. Diga que o Dr. Breno vai avaliar e retornar." };
  if (f.papel === "Membro de comissão / chefia / denunciante") return { ok: false, motivo: "Possível conflito de interesse: não agendar. Diga que o Dr. Breno vai retornar." };
  if (formato === "Presencial" && !CIDADES_PRESENCIAL.includes(semAcento(String(f.cidade ?? "")))) {
    return { ok: false, motivo: `Atendimento presencial é só para Petrolina, Juazeiro e região. Para ${f.cidade ?? "a cidade informada"}, ofereça consulta online pelo Google Meet.` };
  }
  return { ok: true, f };
}

type Horario = { data: string; min: number };

async function horariosLivres(
  ctx: Ctx, quantos: number, pular = 0, opc: { espalhar?: boolean; antecedenciaHoras?: number } = {},
): Promise<Horario[]> {
  const espalhar = opc.espalhar ?? true;
  const antecedencia = opc.antecedenciaHoras ?? CONSULTA.antecedenciaMinHoras;
  const a = agoraLocal();
  const agoraMin = a.hora * 60 + a.minuto;
  const dias: string[] = [];
  for (let d = 0; dias.length < CONSULTA.diasUteisAFrente && d < 30; d++) {
    const data = somaDias(a.data, d);
    const dow = diaDaSemana(data);
    if (dow !== 0 && dow !== 6) dias.push(data);
  }
  if (!dias.length) return [];

  const inicio = dias[0], fim = somaDias(dias[dias.length - 1], 1);
  const [feriados, ocupados, google] = await Promise.all([
    feriadosEntre(inicio, fim),
    ocupadosNoSistema(ctx.escritorioId, inicio, fim),
    ocupadosNoGoogle(ctx.escritorioId, inicio, fim).catch((e) => { console.error("freebusy", e); return [] as [number, number][]; }),
  ]);

  const livres: Horario[] = [];
  const passo = CONSULTA.duracaoMin + CONSULTA.intervaloMin;
  for (const data of dias) {
    if (feriados.has(data)) continue;
    for (let min = CONSULTA.primeiraHora * 60; min <= CONSULTA.ultimaHoraInicio * 60; min += passo) {
      const faltamHoras = diasEntre(a.data, data) * 24 + (min - agoraMin) / 60;
      if (faltamHoras < antecedencia) continue;
      const ini = Date.parse(realISO(data, min)), fimSlot = ini + CONSULTA.duracaoMin * 60e3;
      const choca = [...ocupados, ...google].some(([o1, o2]) => ini < o2 && fimSlot > o1);
      if (!choca) livres.push({ data, min });
    }
  }
  if (!espalhar) return livres.slice(pular, pular + quantos);
  // Espalha as opções: no máximo 2 por dia, para o cliente ter escolha de datas.
  const porDia = new Map<string, number>();
  const espalhados = livres.filter((h) => {
    const n = porDia.get(h.data) ?? 0;
    porDia.set(h.data, n + 1);
    return n < 2;
  });
  return espalhados.slice(pular, pular + quantos);
}

async function feriadosEntre(inicio: string, fim: string): Promise<Set<string>> {
  const { data, error } = await sb.from("feriado").select("data, uf, tribunal_sigla").gte("data", inicio).lt("data", fim);
  if (error) throw error;
  return new Set((data ?? []).filter((f) => !f.tribunal_sigla && (!f.uf || f.uf === "PE")).map((f) => f.data));
}

/** Compromissos da Agenda do sistema, convertidos da hora de parede para instantes reais. */
async function ocupadosNoSistema(escritorioId: string, inicio: string, fim: string): Promise<[number, number][]> {
  const { data, error } = await sb.from("evento").select("inicio, fim, dia_inteiro, tipo, situacao")
    .eq("escritorio_id", escritorioId).neq("situacao", "cancelada")
    .gte("inicio", `${somaDias(inicio, -1)}T00:00:00+00:00`).lt("inicio", `${fim}T00:00:00+00:00`);
  // Sem a agenda, todo horário pareceria livre: melhor falhar do que marcar em cima de outro compromisso.
  if (error) throw error;
  const out: [number, number][] = [];
  for (const e of data ?? []) {
    if (e.dia_inteiro && e.tipo === "tarefa") continue; // tarefa do dia não ocupa horário
    const parede = (s: string) => Date.parse(s.slice(0, 19) + OFFSET); // hora de parede → real
    const ini = parede(e.inicio);
    const f = e.dia_inteiro ? ini + 24 * 3600e3 : e.fim ? parede(e.fim) : ini + 60 * 60e3;
    out.push([ini, f]);
  }
  return out;
}

async function ocupadosNoGoogle(escritorioId: string, inicio: string, fim: string): Promise<[number, number][]> {
  const g = await tokenGoogle(escritorioId);
  if (!g) return [];
  const r = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${g.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: `${inicio}T00:00:00${OFFSET}`, timeMax: `${fim}T00:00:00${OFFSET}`, timeZone: TZ, items: [{ id: g.calendarId }] }),
  });
  if (!r.ok) throw new Error(`freeBusy ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return (j?.calendars?.[g.calendarId]?.busy ?? []).map((b: { start: string; end: string }) => [Date.parse(b.start), Date.parse(b.end)]);
}

// deno-lint-ignore no-explicit-any
async function consultarHorarios(ctx: Ctx, e: any) {
  const formato = e?.formato === "Presencial" ? "Presencial" : "Online";
  const pode = await podeOferecer(ctx, formato);
  if (!pode.ok) return { permitido: false, orientacao: pode.motivo };
  const lista = await horariosLivres(ctx, CONSULTA.quantosOferecer, Math.max(0, Number(e?.pular ?? 0)));
  if (!lista.length) {
    return { permitido: true, horarios: [], orientacao: "Não há horários livres nos próximos dias. Diga que o Dr. Breno vai retornar para combinar um horário, e chame encaminhar_para_humano." };
  }
  return {
    permitido: true,
    formato,
    duracao: `${CONSULTA.duracaoMin} minutos`,
    horarios: lista.map((h) => ({ id: `${h.data}T${hhmm(h.min)}`, rotulo: rotuloHorario(h.data, h.min) })),
    orientacao: "Ofereça estes horários (horário de Brasília) e peça para escolher.",
  };
}

// ------------------------------------------------------------ agendar

// deno-lint-ignore no-explicit-any
async function agendarConsulta(ctx: Ctx, e: any) {
  const formato = e?.formato === "Presencial" ? "Presencial" : "Online";
  const pode = await podeOferecer(ctx, formato);
  if (!pode.ok) return { agendado: false, orientacao: pode.motivo };
  const f = pode.f;

  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(String(e?.horario_id ?? ""));
  if (!m) return { agendado: false, orientacao: "Horário inválido. Use um id de consultar_horarios." };
  const data = m[1], min = Number(m[2]) * 60 + Number(m[3]);

  // Confere de novo: o horário pode ter sido ocupado enquanto o cliente escolhia.
  // Sem espalhar e com antecedência folgada: vale o horário que foi oferecido minutos antes.
  const livres = await horariosLivres(ctx, 500, 0, { espalhar: false, antecedenciaHoras: 1 });
  if (!livres.some((h) => h.data === data && h.min === min)) {
    return { agendado: false, orientacao: "Esse horário acabou de ser ocupado. Chame consultar_horarios e ofereça outros." };
  }

  const { data: jaTem } = await sb.from("evento").select("id").eq("lead_id", ctx.conversa.lead_id)
    .neq("situacao", "cancelada").gte("inicio", `${agoraLocal().data}T00:00:00+00:00`).limit(1);
  if (jaTem?.length) return { agendado: false, orientacao: "Este cliente já tem consulta marcada. Para remarcar, chame encaminhar_para_humano." };

  const nome = f.nome ?? ctx.conversa.wa_nome ?? ctx.conversa.telefone;
  const titulo = `Consulta inicial — ${nome} (PAD)`;
  const descricao = [
    `Agendada pela assistente do WhatsApp.`,
    `Cliente: ${nome} — WhatsApp ${ctx.conversa.telefone}${e?.email ? ` — ${e.email}` : ""}`,
    `Cidade: ${f.cidade ?? "?"}/${f.uf ?? "?"} · ${formato}`,
    f.resumo ? `Resumo: ${f.resumo}` : "",
    `Ficha: ${SISTEMA_URL}/#/ficha/${ctx.conversa.ficha_id}`,
  ].filter(Boolean).join("\n");

  let linkMeet: string | null = null, googleId: string | null = null, googleDono: string | null = null;
  try {
    const g = await criarEventoGoogle(ctx.escritorioId, { titulo, descricao, data, min, online: formato === "Online", email: e?.email });
    if (g) ({ link: linkMeet, id: googleId, dono: googleDono } = g);
  } catch (err) {
    console.error("google", err);
  }
  if (formato === "Online" && !linkMeet) {
    await avisarPorEmail(`Consulta sem link do Meet — ${nome}`,
      `<p>A consulta de ${escHtml(nome)} em ${rotuloHorario(data, min)} foi marcada, mas o Google não gerou o link do Meet. Gere o link e envie ao cliente pelo WhatsApp.</p>`);
  }

  const { data: ev, error } = await sb.from("evento").insert({
    escritorio_id: ctx.escritorioId, tipo: "reuniao", subtipo: "consulta_inicial", origem: "whatsapp-bot",
    titulo, descricao,
    inicio: paredeDB(data, min), fim: paredeDB(data, min + CONSULTA.duracaoMin),
    local: formato === "Presencial" ? ENDERECO : "Online (Google Meet)",
    link_sala: linkMeet, lead_id: ctx.conversa.lead_id, urgencia: "normal",
    convidado_email: e?.email ?? null, google_event_id: googleId,
  }).select("id").single();
  if (error) {
    if (googleId) await apagarEventoGoogle(ctx.escritorioId, googleId).catch((e2) => console.error("desfazer google", e2));
    throw error;
  }

  // Vincula ao Google para a sincronização do sistema não duplicar o compromisso.
  if (googleId && googleDono) {
    await sb.from("google_link").insert({ dono_id: googleDono, qual: "evento", ref: ev.id, google_id: googleId });
  }

  await sb.from("lead").update({ etapa: "consulta", atualizado_em: new Date().toISOString() }).eq("id", ctx.conversa.lead_id);
  await gravarFicha(ctx, { formato, encaminhamento: "Agendou automaticamente" });

  const rotulo = rotuloHorario(data, min);
  await avisarPorEmail(`Consulta marcada pela assistente — ${nome}, ${rotulo}`,
    `<p><b>${escHtml(nome)}</b> — ${formato} — ${rotulo} (${CONSULTA.duracaoMin} min).</p>` +
    `<p>${escHtml(f.resumo ?? "")}</p><p><a href="${SISTEMA_URL}/#/agenda">Abrir a Agenda</a></p>`);

  return {
    agendado: true,
    quando: `${rotulo} (horário de Brasília)`,
    duracao: `${CONSULTA.duracaoMin} minutos`,
    formato,
    ...(formato === "Online" ? { link_meet: linkMeet ?? "o link será enviado por aqui antes da consulta" } : { endereco: ENDERECO }),
    orientacao: "Confirme com a pessoa usando exatamente estes dados. Lembre que a consulta é gratuita e que, para remarcar, basta responder aqui.",
  };
}

// ============================================================ Google Agenda

async function tokenGoogle(escritorioId: string): Promise<{ token: string; calendarId: string; dono: string } | null> {
  const { data: conta } = await sb.from("google_conta").select("refresh_token, calendar_id, dono_id")
    .eq("escritorio_id", escritorioId).eq("ativo", true).not("refresh_token", "is", null).limit(1).maybeSingle();
  if (!conta) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: conta.refresh_token, grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`token Google ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { token: j.access_token, calendarId: conta.calendar_id || "primary", dono: conta.dono_id };
}

async function criarEventoGoogle(
  escritorioId: string,
  o: { titulo: string; descricao: string; data: string; min: number; online: boolean; email?: string },
): Promise<{ id: string; link: string | null; dono: string } | null> {
  const g = await tokenGoogle(escritorioId);
  if (!g) return null;
  const corpo: Record<string, unknown> = {
    summary: o.titulo,
    description: o.descricao,
    start: { dateTime: realISO(o.data, o.min), timeZone: TZ },
    end: { dateTime: realISO(o.data, o.min + CONSULTA.duracaoMin), timeZone: TZ },
    reminders: { useDefault: true },
  };
  if (o.online) {
    corpo.conferenceData = { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } };
  }
  if (o.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) corpo.attendees = [{ email: o.email }];

  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(g.calendarId)}/events?conferenceDataVersion=1&sendUpdates=${corpo.attendees ? "all" : "none"}`,
    { method: "POST", headers: { Authorization: `Bearer ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo) },
  );
  if (!r.ok) throw new Error(`evento Google ${r.status}: ${await r.text()}`);
  const ev = await r.json();
  const link = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((p: { entryPointType: string }) => p.entryPointType === "video")?.uri ?? null;
  return { id: ev.id, link, dono: g.dono };
}

async function apagarEventoGoogle(escritorioId: string, id: string) {
  const g = await tokenGoogle(escritorioId);
  if (!g) return;
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(g.calendarId)}/events/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${g.token}` } });
}

// ============================================================ humano e avisos

async function encaminharHumano(ctx: Ctx, motivo: string) {
  await sb.from("bot_conversa").update({ estado: "humano", atualizado_em: new Date().toISOString() }).eq("id", ctx.conversa.id);
  ctx.conversa.estado = "humano";
  await avisarPorEmail(`WhatsApp: ${ctx.conversa.wa_nome ?? ctx.conversa.telefone} precisa de você`,
    `<p>A assistente passou a conversa para você e ficou em silêncio neste número.</p>` +
    `<p><b>Motivo:</b> ${escHtml(motivo)}</p><p>WhatsApp: ${ctx.conversa.telefone}</p>` +
    `<p><a href="${SISTEMA_URL}/#/captacao">Abrir a Captação</a></p>`);
  return { encaminhado: true, orientacao: "Diga que o Dr. Breno vai continuar o atendimento pessoalmente e retorna em breve." };
}

// deno-lint-ignore no-explicit-any
async function avisarUrgencia(ctx: Ctx, f: Record<string, any>, u: Urgencia) {
  await avisarPorEmail(`🔴 URGENTE — PAD: ${f.nome ?? ctx.conversa.wa_nome ?? ctx.conversa.telefone}`,
    `<p><b>Motivo:</b> ${escHtml(u.motivos.join("; "))}</p>` +
    `<p><b>WhatsApp:</b> <a href="https://wa.me/${ctx.conversa.telefone}">${ctx.conversa.telefone}</a><br>` +
    `<b>Vínculo:</b> ${escHtml([f.ente, f.orgao, f.cargo].filter(Boolean).join(" · ") || "—")}<br>` +
    `<b>Fase:</b> ${escHtml(f.fase ?? "—")}</p>` +
    (u.alertas.length ? `<p><b>Para conferir:</b><br>${u.alertas.map(escHtml).join("<br>")}</p>` : "") +
    `<p><a href="${SISTEMA_URL}/#/ficha/${ctx.conversa.ficha_id}">Abrir a ficha</a></p>`);
}

// deno-lint-ignore no-explicit-any
async function avisarTriagemConcluida(ctx: Ctx, f: Record<string, any>, u: Urgencia, resumo: string, oferecendo = false) {
  await avisarPorEmail(`Triagem concluída — ${f.nome ?? ctx.conversa.telefone} (${u.nivel})`,
    `<p>${escHtml(resumo)}</p>` +
    `<p><b>Cidade:</b> ${escHtml(`${f.cidade ?? "?"}/${f.uf ?? "?"}`)} · <b>Fase:</b> ${escHtml(f.fase ?? "—")}</p>` +
    (u.alertas.length ? `<p><b>Para conferir:</b><br>${u.alertas.map(escHtml).join("<br>")}</p>` : "") +
    (oferecendo
      ? `<p>Fora do expediente: a assistente está oferecendo horários. Se ele marcar, chega outro e-mail; se não, retome por aqui.</p>`
      : `<p>O cliente foi informado de que você vai analisar e retornar para marcar.</p>`) +
    `<p><a href="${SISTEMA_URL}/#/ficha/${ctx.conversa.ficha_id}">Abrir a ficha</a> · ` +
    `<a href="https://wa.me/${ctx.conversa.telefone}">Responder no WhatsApp</a></p>`);
}

async function avisarPorEmail(assunto: string, html: string) {
  const chave = Deno.env.get("RESEND_API_KEY");
  if (!chave) { console.error("RESEND_API_KEY ausente; e-mail não enviado:", assunto); return; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("ALERTA_EMAIL_DE"), to: Deno.env.get("ALERTA_EMAIL_PARA"), subject: assunto, html,
    }),
  });
  if (!r.ok) console.error("falha no e-mail", r.status, await r.text());
}

function escHtml(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// ============================================================ envio pelo WhatsApp

/** Envia texto pelo Z-API e registra no histórico. `porHumano` é quem escreveu da tela. */
// deno-lint-ignore no-explicit-any
async function enviarTexto(conversa: any, texto: string, porHumano: string | null = null): Promise<{ ok: boolean; erro?: string }> {
  const partes = texto.match(/[\s\S]{1,3800}(?=\s|$)|[\s\S]{1,3800}/g) ?? [texto];
  let falha: string | undefined;
  for (const parte of partes) {
    const r = await fetch(`${ZAPI}/send-text`, {
      method: "POST",
      headers: ZAPI_CABECALHO,
      body: JSON.stringify({ phone: conversa.telefone, message: parte.trim(), delayTyping: 2 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {   // o Z-API às vezes devolve 200 com erro no corpo
      console.error("falha ao enviar WhatsApp", r.status, JSON.stringify(j));
      falha = j?.error ?? j?.message ?? `o Z-API respondeu ${r.status}`;
      continue;
    }
    await sb.from("bot_mensagem").insert({
      conversa_id: conversa.id, wamid: j?.messageId ?? null, direcao: "saida",
      tipo: porHumano ? "humano" : "text", texto: parte.trim(), processada: true,
    });
  }
  return falha ? { ok: false, erro: falha } : { ok: true };
}

/** Marca como lida no celular, para o Dr. Breno não ver aviso do que a assistente já tratou. */
async function marcarComoLida(telefone: string, messageId?: string) {
  if (!messageId) return;
  await fetch(`${ZAPI}/read-message`, {
    method: "POST", headers: ZAPI_CABECALHO,
    body: JSON.stringify({ phone: telefone, messageId }),
  });
}
