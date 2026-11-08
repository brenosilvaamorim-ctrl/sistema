// ROBÔ DE MOVIMENTAÇÕES — API Pública do DataJud (CNJ)
// Roda no Supabase Edge Functions, agendado por pg_cron.
// Busca o andamento dos processos monitorados e grava em `movimentacao`.
// A chave do DataJud é pública e igual para todos: não há custo nem cadastro.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BASE = 'https://api-publica.datajud.cnj.jus.br';
// Chave pública divulgada pelo próprio CNJ na documentação da API.
const CHAVE_PUBLICA = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* A função é cortada pela plataforma por volta dos 150 segundos, e quem é cortado não
   devolve relatório nenhum: morre calada. Por isso o robô para sozinho antes disso e
   conta o que fez. O que não couber nesta rodada entra na próxima — a fila é ordenada
   pelo mais desatualizado primeiro. */
/* 50 s por consulta não é exagero: medido em 08/11/2026, o DataJud público leva de
   30 a 42 segundos para responder quando responde — o próprio Elasticsearch deles
   devolve `took: 30711` e `took: 41257`. Com os 8 s que eu havia posto, nenhuma
   resposta chegava a tempo e o robô voltava com zero consultados. Entre uma resposta
   e outra ele recusa com 429, e isso vem rápido: aí o recuo age. */
const PRAZO_CHAMADA = 50000;   // por consulta ao DataJud
const PRAZO_RODADA = 130000;   // da rodada inteira

// O DataJud mistura formatos: dataHora vem ISO ("2026-07-31T04:41:52.000Z"),
// dataAjuizamento vem compacta ("20260311194838"). Normaliza para AAAA-MM-DD.
function soData(v: unknown): string | null {
  const s = String(v ?? '');
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const cru = s.match(/^(\d{4})(\d{2})(\d{2})/);
  return cru ? `${cru[1]}-${cru[2]}-${cru[3]}` : null;
}

/* Esta função responde com a chave de serviço, que ignora a RLS: a conferência de
   quem pede tem de ser feita aqui dentro. Passam três: a própria chave de serviço,
   um login ativo do escritório, e a chave dos robôs — que o agendador do banco lê de
   `escritorio.robo_token` e manda na URL (`?chave=`) ou no cabeçalho `x-chave-robo`. */
async function doEscritorio(req: Request): Promise<boolean> {
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const adm = createClient(Deno.env.get('SUPABASE_URL')!, servico, { auth: { persistSession: false } });

  const chave = (new URL(req.url).searchParams.get('chave')
    ?? req.headers.get('x-chave-robo') ?? '').trim();
  if (chave.length >= 16) {
    const { data: e } = await adm.from('escritorio').select('id').eq('robo_token', chave).maybeSingle();
    if (e) return true;
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return false;
  if (servico && jwt === servico) return true;
  const { data: quem } = await adm.auth.getUser(jwt);
  if (!quem?.user) return false;
  const { data: u } = await adm.from('usuario').select('id')
    .eq('id', quem.user.id).eq('ativo', true).maybeSingle();
  return !!u;
}

Deno.serve(async (req) => {
  if (!await doEscritorio(req)) return new Response(JSON.stringify({ erro: 'acesso restrito ao escritório' }),
    { status: 403, headers: { 'Content-Type': 'application/json' } });
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const url = new URL(req.url);
  const lote = Math.min(Number(url.searchParams.get('lote') ?? 60), 200);
  const chave = Deno.env.get('DATAJUD_API_KEY') ?? CHAVE_PUBLICA;

  const { data: tribunais } = await db.from('tribunal').select('sigla, alias_datajud').eq('ativo', true);
  const alias = new Map((tribunais ?? []).map((t) => [t.sigla, t.alias_datajud]));

  // Os mais desatualizados primeiro, para caber no tempo da execução.
  const { data: processos, error } = await db
    .from('processo')
    .select('id, numero_cnj, tribunal_sigla, caso_id')
    .eq('monitorar', true)
    .order('ultima_sync', { ascending: true, nullsFirst: true })
    .limit(lote);

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const comecou = Date.now();
  const rel = {
    processos: (processos ?? []).length,
    consultados: 0,
    naoEncontrados: 0,
    movimentacoesNovas: 0,
    recuos: 0,
    parou_por_tempo: false,
    segundos: 0,
    erros: [] as string[],
  };

  for (const p of processos ?? []) {
    if (Date.now() - comecou > PRAZO_RODADA) { rel.parou_por_tempo = true; break; }
    const idx = alias.get(p.tribunal_sigla);
    if (!idx) {
      rel.erros.push(`${p.numero_cnj}: tribunal ${p.tribunal_sigla} sem índice no DataJud`);
      continue;
    }
    try {
      /* Duas defesas, e elas resolvem coisas diferentes.

         Prazo por chamada: no Deno o fetch não tem prazo padrão, então um processo
         cuja resposta nunca volta segura o laço até a plataforma matar a função —
         e quem é morto não devolve relatório. Travar não é falhar: o catch não pega.

         Recuo no 429: a API pública do CNJ é uma fila compartilhada com o país e
         vive cheia. Desistir do processo em 300 ms desperdiça a janela — quando a
         brecha abre, ninguém está lá para usá-la. Então insiste no MESMO processo,
         esperando 2 s e depois 4 s. Só no 429: repetir uma chamada que travou
         custaria oito segundos por tentativa, e não vale. */
      let r!: Response;
      for (let tentativa = 1; tentativa <= 3; tentativa++) {
        r = await fetch(`${BASE}/${idx}/_search`, {
          method: 'POST',
          headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ size: 1, query: { match: { numeroProcesso: p.numero_cnj } } }),
          signal: AbortSignal.timeout(PRAZO_CHAMADA),
        });
        if (r.status !== 429) break;
        if (tentativa === 3 || Date.now() - comecou > PRAZO_RODADA - PRAZO_CHAMADA) break;
        rel.recuos++;
        await espera(2000 * tentativa);   // 2 s, depois 4 s
      }
      if (!r.ok) {
        rel.erros.push(`${p.numero_cnj}: DataJud HTTP ${r.status}`);
        await espera(300);
        continue;
      }

      const j = await r.json();
      const src = j?.hits?.hits?.[0]?._source;
      rel.consultados++;

      if (!src) {
        rel.naoEncontrados++;
        await db.from('processo').update({ ultima_sync: new Date().toISOString() }).eq('id', p.id);
        await espera(200);
        continue;
      }

      const novas = (src.movimentos ?? []).map((m: Record<string, unknown>) => ({
        processo_id: p.id,
        data: m.dataHora,
        codigo: m.codigo,
        descricao: m.nome ?? `Movimento ${m.codigo}`,
        complementos: m.complementosTabelados ?? null,
        hash_origem: `${m.codigo}|${m.dataHora}`,
      }));

      if (novas.length) {
        // onConflict = já tínhamos esse movimento; ignoreDuplicates evita reescrever.
        const { data: ins, error: e } = await db
          .from('movimentacao')
          .upsert(novas, { onConflict: 'processo_id,hash_origem', ignoreDuplicates: true })
          .select('id');
        if (e) rel.erros.push(`${p.numero_cnj}: ${e.message}`);
        else rel.movimentacoesNovas += (ins ?? []).length;
      }

      await db.from('processo').update({
        classe: src.classe?.nome ?? null,
        orgao: src.orgaoJulgador?.nome ?? null,
        grau: src.grau ?? null,
        assunto: src.assuntos?.[0]?.nome ?? null,
        valor_causa: typeof src.valorCausa === 'number' ? src.valorCausa : null,
        data_ajuizamento: soData(src.dataAjuizamento),
        ultima_sync: new Date().toISOString(),
      }).eq('id', p.id);

      await espera(200);   // gentileza com a API pública
    } catch (err) {
      rel.erros.push(`${p.numero_cnj}: ${(err as Error).message}`);
    }
  }

  rel.segundos = Math.round((Date.now() - comecou) / 1000);
  return new Response(JSON.stringify(rel, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
