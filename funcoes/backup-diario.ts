// BACKUP DIÁRIO — grava um JSON com todas as tabelas no Storage do próprio projeto.
// Chamada pelo agendador do banco (pg_cron) uma vez por dia. Protegido por token.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const TABELAS = ['escritorio','usuario','oab','cliente','caso','processo','parte','prazo',
  'movimentacao','intimacao','evento','lancamento','honorario','interacao','lead','documento',
  'tese','tese_candidata','precedente','minuta','informativo_rascunho','preferencia',
  'area_atuacao','origem_captacao','categoria_financeira','movimento_dicionario',
  'checklist_modelo','caso_documento','coluna_caso','tag','caso_tag','tribunal','timesheet','historico'];

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (token.length < 16) return new Response('token ausente', { status: 401 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: esc } = await db.from('escritorio')
    .select('id, nome').eq('backup_token', token).maybeSingle();
  if (!esc) return new Response('token inválido', { status: 403 });

  const pacote: Record<string, unknown> = {
    gerado_em: new Date().toISOString(), escritorio: esc.nome, versao: 1,
  };
  const dados: Record<string, unknown[]> = {};
  const falhas: string[] = [];
  let linhas = 0;

  for (const t of TABELAS) {
    const { data, error } = await db.from(t).select('*').limit(50000);
    if (error) { falhas.push(t + ': ' + error.message); continue; }
    dados[t] = data ?? [];
    linhas += (data ?? []).length;
  }
  pacote.tabelas = dados;
  pacote.falhas = falhas;
  pacote.linhas = linhas;

  const hoje = new Date().toISOString().slice(0, 10);
  const corpo = new Blob([JSON.stringify(pacote)], { type: 'application/json' });
  const { error: up } = await db.storage.from('backup')
    .upload(hoje + '.json', corpo, { contentType: 'application/json', upsert: true });

  const saida = { arquivo: hoje + '.json', linhas, tabelas: Object.keys(dados).length,
    bytes: corpo.size, falhas, erro_ao_gravar: up?.message ?? null };
  return new Response(JSON.stringify(saida, null, 2), {
    status: up ? 500 : 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
});
