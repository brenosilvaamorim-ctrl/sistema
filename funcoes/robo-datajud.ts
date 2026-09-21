// ROBÔ DE MOVIMENTAÇÕES — API Pública do DataJud (CNJ)
// Roda no Supabase Edge Functions, agendado por pg_cron.
// Busca o andamento dos processos monitorados e grava em `movimentacao`.
// A chave do DataJud é pública e igual para todos: não há custo nem cadastro.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const BASE = 'https://api-publica.datajud.cnj.jus.br';
// Chave pública divulgada pelo próprio CNJ na documentação da API.
const CHAVE_PUBLICA = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// O DataJud mistura formatos: dataHora vem ISO ("2026-07-31T04:41:52.000Z"),
// dataAjuizamento vem compacta ("20260311194838"). Normaliza para AAAA-MM-DD.
function soData(v: unknown): string | null {
  const s = String(v ?? '');
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const cru = s.match(/^(\d{4})(\d{2})(\d{2})/);
  return cru ? `${cru[1]}-${cru[2]}-${cru[3]}` : null;
}

Deno.serve(async (req) => {
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

  const rel = {
    processos: (processos ?? []).length,
    consultados: 0,
    naoEncontrados: 0,
    movimentacoesNovas: 0,
    erros: [] as string[],
  };

  for (const p of processos ?? []) {
    const idx = alias.get(p.tribunal_sigla);
    if (!idx) {
      rel.erros.push(`${p.numero_cnj}: tribunal ${p.tribunal_sigla} sem índice no DataJud`);
      continue;
    }
    try {
      const r = await fetch(`${BASE}/${idx}/_search`, {
        method: 'POST',
        headers: { Authorization: `APIKey ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 1, query: { match: { numeroProcesso: p.numero_cnj } } }),
      });
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

  return new Response(JSON.stringify(rel, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
