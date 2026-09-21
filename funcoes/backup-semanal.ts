// BACKUP SEMANAL — exporta as tabelas em CSV e envia por e-mail.
// Existe para que o escritório tenha uma cópia FORA do fornecedor:
// se o banco sumir, os dados continuam na caixa de entrada.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TABELAS = ['cliente','caso','processo','prazo','movimentacao','intimacao',
                 'lancamento','interacao','evento','honorario'];

function csv(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return '';
  const cols = Object.keys(linhas[0]);
  const campo = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(';'), ...linhas.map(l => cols.map(c => campo(l[c])).join(';'))].join('\r\n');
}

const b64 = (txt: string) => {
  const bytes = new TextEncoder().encode('﻿' + txt);   // BOM: Excel abre com acento certo
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const anexos: { filename: string; content: string }[] = [];
  const resumo: string[] = [];

  for (const t of TABELAS) {
    const { data, error } = await db.from(t).select('*').limit(50000);
    if (error) { resumo.push(`${t}: ERRO — ${error.message}`); continue; }
    const linhas = data ?? [];
    resumo.push(`${t}: ${linhas.length} registro(s)`);
    if (linhas.length) anexos.push({ filename: `${hoje}-${t}.csv`, content: b64(csv(linhas)) });
  }

  const chave = Deno.env.get('RESEND_API_KEY');
  const para = Deno.env.get('ALERTA_EMAIL_PARA') ?? 'brenos.amorim.adv@gmail.com';
  if (!chave) {
    return new Response(JSON.stringify({ data: hoje, resumo, aviso: 'sem RESEND_API_KEY' }, null, 2),
      { headers: { 'Content-Type': 'application/json' } });
  }

  const html = `
  <div style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#0b0b0b;max-width:560px">
    <h2 style="font:600 17px/1.3 Georgia,serif;margin:0 0 4px">Backup de ${hoje.split('-').reverse().join('/')}</h2>
    <p style="color:#52514e;font-size:13.5px;margin:0 0 16px">
      Cópia semanal dos dados do sistema, em CSV. Guarde este e-mail —
      é a sua cópia fora do fornecedor. Abre direto no Excel.</p>
    <ul style="color:#52514e;font-size:13.5px;padding-left:18px;margin:0 0 16px">
      ${resumo.map(r => `<li>${r}</li>`).join('')}
    </ul>
    <p style="color:#78766f;font-size:12px;margin:0">
      Enviado automaticamente aos domingos. Se um dia parar de chegar, algo quebrou — vale investigar.</p>
  </div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('ALERTA_EMAIL_DE') ?? 'onboarding@resend.dev',
      to: [para],
      subject: `Backup do sistema — ${hoje.split('-').reverse().join('/')}`,
      html,
      attachments: anexos,
    }),
  });

  return new Response(JSON.stringify({ data: hoje, resumo, anexos: anexos.length, email: r.status }, null, 2),
    { headers: { 'Content-Type': 'application/json' } });
});
