// GERADOR DE DOCUMENTOS — procuração e contrato de honorários
// Preenche os modelos .docx do escritório (guardados no Storage, com timbre)
// com os dados do cliente e devolve o arquivo em Word, editável.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

const xml = (s: string) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function qualificacao(c: Record<string, unknown>): string {
  const juridica = c.tipo === 'juridica';
  const p: string[] = [String(c.nome || '').toUpperCase()];
  if (!juridica) {
    p.push('brasileiro(a)');
    if (c.profissao) p.push(String(c.profissao));
    if (c.estado_civil) p.push(String(c.estado_civil));
    if (c.rg) p.push('RG n. ' + c.rg);
    if (c.cpf_cnpj) p.push('CPF n. ' + c.cpf_cnpj);
    if (c.ctps) p.push('CTPS n. ' + c.ctps);
  } else if (c.cpf_cnpj) {
    p.push('inscrita no CNPJ sob o n. ' + c.cpf_cnpj);
  }
  const end = [c.endereco, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : (c.cidade || ''), c.cep]
    .filter(Boolean).join(', ');
  if (end) p.push((juridica ? 'com sede na ' : 'residente e domiciliado(a) na ') + end);
  return p.join(', ') + '.';
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const casoId = url.searchParams.get('caso_id');
  const tipo = url.searchParams.get('tipo') === 'proc-contrato' ? 'proc-contrato' : 'procuracao';
  const cidade = url.searchParams.get('cidade') || 'Petrolina-PE';
  const objeto = url.searchParams.get('objeto') || '';
  const honorarios = url.searchParams.get('honorarios') || '';

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!casoId) {
    return new Response(JSON.stringify({ erro: 'falta caso_id' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data: caso, error } = await db.from('caso')
    .select('id, titulo, cliente:cliente_id(nome,tipo,cpf_cnpj,rg,ctps,pis,estado_civil,profissao,endereco,cidade,uf,cep)')
    .eq('id', casoId).single();
  if (error || !caso?.cliente) {
    return new Response(JSON.stringify({ erro: error?.message ?? 'caso sem cliente' }),
      { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: modelo, error: e2 } = await db.storage.from('modelos').download(`${tipo}.docx`);
  if (e2 || !modelo) {
    return new Response(JSON.stringify({ erro: 'modelo não encontrado: ' + (e2?.message ?? tipo) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const hoje = new Date(Date.now() - 3 * 3600 * 1000);   // horário de Brasília
  const dataExtenso = `${cidade}, ${hoje.getUTCDate()} de ${MESES[hoje.getUTCMonth()]} de ${hoje.getUTCFullYear()}.`;

  const zip = await JSZip.loadAsync(await modelo.arrayBuffer());
  const doc = await zip.file('word/document.xml')!.async('string');
  const preenchido = doc
    .replaceAll('{{QUALIFICACAO}}', xml(qualificacao(caso.cliente as Record<string, unknown>)))
    .replaceAll('{{OBJETO}}', xml(objeto || '[descrever o objeto da demanda]'))
    .replaceAll('{{HONORARIOS}}', xml(honorarios || '[descrever os honorários contratados]'))
    .replaceAll('{{CIDADE_DATA}}', xml(dataExtenso));
  zip.file('word/document.xml', preenchido);

  const saida = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  const nome = `${tipo}-${String(caso.titulo || 'cliente').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.docx`;

  return new Response(saida, {
    headers: {
      ...cors,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${nome}"`,
    },
  });
});
