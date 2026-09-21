// AVISO DIÁRIO DE PRAZOS
// Roda de manhã, monta o resumo do que vence e manda por e-mail.
// Se não houver chave de e-mail configurada, apenas devolve o resumo em JSON.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const br = (s: string) => s.split('-').reverse().join('/');

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10);

  const { data: prazos, error } = await db
    .from('prazo')
    .select('data_fatal, descricao, dias, confianca, situacao, intimacao:intimacao_id (numero_formatado, tribunal_sigla, orgao, link_pje)')
    .in('situacao', ['sugerido', 'confirmado'])
    .lte('data_fatal', limite)
    .order('data_fatal');

  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500 });

  // Prescrições anotadas no cadastro que já estão perto de fechar.
  const limitePresc = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
  const { data: presc } = await db.from('caso')
    .select('titulo, prescricao_em, prescricao_obs, cliente:cliente_id(nome)')
    .not('prescricao_em', 'is', null)
    .lte('prescricao_em', limitePresc)
    .is('encerrado_em', null)
    .order('prescricao_em');
  const prescricoes = presc ?? [];

  const lista = prazos ?? [];
  const vencidos = lista.filter((p: any) => p.data_fatal < hoje);
  const ativos = lista.filter((p: any) => p.data_fatal >= hoje);
  const urgentes = ativos.filter((p: any) => p.data_fatal <= new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10));

  const linha = (p: any) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc;white-space:nowrap"><strong>${br(p.data_fatal)}</strong></td>
      <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc">${p.descricao}
        <div style="color:#78766f;font-size:12px">${p.dias} dias úteis · ${p.situacao === 'sugerido' ? 'aguardando sua confirmação' : 'confirmado'}</div></td>
      <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc;font-size:12px;color:#52514e">
        ${p.intimacao?.numero_formatado ?? '—'}<br>${p.intimacao?.tribunal_sigla ?? ''} · ${p.intimacao?.orgao ?? ''}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc;font-size:12px">${p.confianca ? Math.round(p.confianca * 100) + '%' : '—'}</td>
    </tr>`;

  const bloco = (titulo: string, itens: any[], cor: string) => itens.length ? `
    <h3 style="font-size:14px;margin:22px 0 6px;color:${cor}">${titulo} (${itens.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="text-align:left;color:#78766f;font-size:11px;text-transform:letter-spacing:.05em">
        <th style="padding:6px 12px">Vence</th><th style="padding:6px 12px">Providência</th>
        <th style="padding:6px 12px">Processo</th><th style="padding:6px 12px">Confiança</th></tr></thead>
      <tbody>${itens.map(linha).join('')}</tbody>
    </table>` : '';

  const resumo = {
    data: hoje,
    total: ativos.length,
    prescricoes: prescricoes.length,
    urgentes: urgentes.length,
    vencidos: vencidos.length,
    proximo: ativos[0] ? { vence: ativos[0].data_fatal, o_que: ativos[0].descricao } : null,
  };

  const chave = Deno.env.get('RESEND_API_KEY');
  const para = Deno.env.get('ALERTA_EMAIL_PARA');
  if (!chave || !para) {
    return new Response(JSON.stringify({ ...resumo, email: 'não configurado' }, null, 2),
      { headers: { 'Content-Type': 'application/json' } });
  }
  if (!ativos.length && !vencidos.length && !prescricoes.length) {
    return new Response(JSON.stringify({ ...resumo, email: 'nada a avisar' }, null, 2),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const html = `
  <div style="font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0b;max-width:700px">
    <h2 style="font-size:19px;margin:0 0 4px">Prazos de ${br(hoje)}</h2>
    <p style="color:#52514e;margin:0 0 6px">
      ${ativos.length} em aberto${urgentes.length ? `, <strong style="color:#d03b3b">${urgentes.length} vencendo em até 5 dias</strong>` : ''}.
      ${ativos[0] ? `Mais curto: <strong>${ativos[0].descricao}</strong>, ${br(ativos[0].data_fatal)}.` : ''}
    </p>
    ${bloco('▲ Vencidos — confira se foram cumpridos', vencidos, '#d03b3b')}
    ${bloco('▲ Urgentes — até 5 dias', urgentes, '#ec835a')}
    ${bloco('Demais prazos', ativos.filter((p: any) => !urgentes.includes(p)), '#52514e')}
    ${prescricoes.length ? `
      <h3 style="font-size:14px;margin:22px 0 6px;color:#d03b3b">Prescrição se aproximando (${prescricoes.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>
        ${prescricoes.map((c: any) => `<tr>
          <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc;white-space:nowrap"><strong>${br(c.prescricao_em)}</strong>
            <div style="color:#78766f;font-size:12px">${Math.round((Date.parse(c.prescricao_em) - Date.now()) / 86400000)} dias</div></td>
          <td style="padding:9px 12px;border-bottom:1px solid #e3e1dc">${c.cliente?.nome ?? c.titulo}
            <div style="color:#78766f;font-size:12px">${c.prescricao_obs ?? 'data anotada no cadastro do caso'}</div></td>
        </tr>`).join('')}
      </tbody></table>` : ''}
    <p style="color:#78766f;font-size:12.5px;margin-top:24px;line-height:1.6">
      Os prazos marcados como “aguardando sua confirmação” foram lidos automaticamente
      do texto da intimação. A contagem é sugestão do sistema — a responsabilidade pela
      data continua sendo sua. Confira sempre no PJe antes de agir.
    </p>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('ALERTA_EMAIL_DE') ?? 'onboarding@resend.dev',
      to: [para],
      subject: urgentes.length
        ? `${urgentes.length} prazo(s) urgente(s) — o mais curto vence ${br(ativos[0].data_fatal)}`
        : `Prazos: ${ativos.length} em aberto`,
      html,
    }),
  });

  return new Response(JSON.stringify({ ...resumo, email: r.status }, null, 2),
    { headers: { 'Content-Type': 'application/json' } });
});
