// PAINEL — servido como página pelo próprio Supabase.
// O HTML é uma casca pública; todo dado é buscado com a sessão do
// advogado logado, então as permissões do banco (RLS) continuam valendo.
const K = 'sb_publishable_EfdAshQdw1P1-lAXtlO9Hw_O8yoP3y5';
const U = 'https://wrdfyudabvvpvfcrvvzd.supabase.co';

const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prazos — Escritório</title>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<style>
:root{color-scheme:light;--s0:#f4f3f0;--s1:#fcfcfb;--ln:#e3e1dc;--ink:#0b0b0b;--i2:#52514e;--i3:#78766f;
--good:#0ca30c;--warn:#fab219;--ser:#ec835a;--crit:#d03b3b}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--s0:#111110;--s1:#1a1a19;--ln:#33332f;--ink:#fff;--i2:#c3c2b7;--i3:#8f8e85}}
*{box-sizing:border-box}body{margin:0;background:var(--s0);color:var(--ink);font:15px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
nav{display:flex;gap:18px;align-items:center;padding:13px 20px;background:var(--s1);border-bottom:1px solid var(--ln)}
nav b{margin-right:6px}nav a{color:var(--i2);text-decoration:none;font-size:14px;cursor:pointer}
nav a.on,nav a:hover{color:var(--ink)}nav .dir{margin-left:auto;font-size:12.5px;color:var(--i3)}
main{max-width:1180px;margin:0 auto;padding:24px 18px 70px}
h1{font-size:21px;margin:0 0 3px}.meta{color:var(--i2);font-size:13.5px;margin-bottom:20px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:11px;margin-bottom:22px}
.kpi{background:var(--s1);border:1px solid var(--ln);border-radius:12px;padding:14px 16px}
.kpi .n{font-size:29px;font-weight:650;line-height:1.1;letter-spacing:-.02em}
.kpi .l{color:var(--i2);font-size:12.5px;margin-top:2px}.kpi.al .n{color:var(--crit)}
.card{background:var(--s1);border:1px solid var(--ln);border-radius:12px;margin-bottom:18px;overflow:hidden}
h2{font-size:14.5px;margin:15px 18px 3px}.nota{margin:0 18px 12px;color:var(--i2);font-size:12.8px;max-width:78ch}
table{width:100%;border-collapse:collapse;font-size:13.4px}
th{text-align:left;font-weight:600;color:var(--i3);font-size:11.3px;text-transform:uppercase;letter-spacing:.05em;padding:9px 11px;border-bottom:1px solid var(--ln)}
td{padding:10px 11px;border-bottom:1px solid var(--ln);vertical-align:top}tr:last-child td{border-bottom:0}
.sub{display:block;color:var(--i3);font-size:11.3px;margin-top:2px}
.proc{font-variant-numeric:tabular-nums;font-size:12.3px;color:var(--i2);white-space:nowrap}
.dt{white-space:nowrap;font-variant-numeric:tabular-nums}.q{color:var(--i2);font-style:italic;font-size:12.3px;display:block}
.pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;font-size:11.3px;font-weight:600;white-space:nowrap;border:1px solid}
.crit{color:var(--crit);border-color:var(--crit)}.ser{color:var(--ser);border-color:var(--ser)}
.warn{color:var(--warn);border-color:var(--warn)}.good{color:var(--good);border-color:var(--good)}
button,input{font:inherit}
.btn{font-size:12.3px;font-weight:600;padding:5px 11px;border-radius:8px;border:1px solid var(--ln);background:var(--s0);color:var(--ink);cursor:pointer;white-space:nowrap}
.btn:hover{border-color:var(--i3)}.btn.ok{border-color:var(--good);color:var(--good)}
.acoes{display:flex;flex-direction:column;gap:5px}.acoes form{display:flex;gap:4px}
input[type=date],input[type=email]{padding:5px 9px;border-radius:8px;border:1px solid var(--ln);background:var(--s0);color:var(--ink);font-size:12.5px}
.aviso{background:var(--s1);border:1px solid var(--crit);border-left-width:3px;border-radius:8px;padding:12px 15px;margin-bottom:18px;font-size:13.4px;color:var(--i2)}
.aviso b{color:var(--ink)}.vazio{padding:28px;text-align:center;color:var(--i3)}
.login{max-width:400px;margin:12vh auto;background:var(--s1);border:1px solid var(--ln);border-radius:14px;padding:28px}
.login h1{font-size:19px;margin-bottom:6px}.login p{color:var(--i2);font-size:13.5px;margin:0 0 18px}
.login input{width:100%;margin-bottom:10px;padding:9px 11px}.login .btn{width:100%;padding:9px}
</style></head><body>
<div id="app"><div class="vazio">Carregando…</div></div>
<script>
const sb = window.supabase.createClient("${U}", "${K}");
const app = document.getElementById('app');
const br = s => s ? s.split('-').reverse().join('/') : '—';
const hoje = () => new Date().toISOString().slice(0,10);
const dias = d => Math.round((Date.parse(d+'T00:00:00Z') - Date.parse(hoje()+'T00:00:00Z'))/864e5);
const esc = s => String(s??'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function sit(r){ if(r<0) return ['crit','▲','Vencido']; if(r<=2) return ['crit','▲','Urgente'];
  if(r<=5) return ['ser','●','Atenção']; if(r<=10) return ['warn','●','Próximo']; return ['good','●','No prazo']; }

function telaLogin(msg){
  app.innerHTML = \`<div class="login"><h1>Prazos do escritório</h1>
    <p>Entre com seu e-mail. Enviamos um link de acesso — sem senha para decorar.</p>
    <input id="em" type="email" placeholder="seu@email.com" autocomplete="email">
    <button class="btn ok" id="go">Receber link de acesso</button>
    <p id="msg" style="margin-top:12px">\${msg||''}</p></div>\`;
  document.getElementById('go').onclick = async () => {
    const email = document.getElementById('em').value.trim();
    if(!email) return;
    document.getElementById('msg').textContent = 'Enviando…';
    const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.href }});
    document.getElementById('msg').textContent = error ? ('Erro: '+error.message) : 'Link enviado. Confira seu e-mail.';
  };
}

async function acao(id, campos){
  const { error } = await sb.from('prazo').update(campos).eq('id', id);
  if (error) alert('Não foi possível: ' + error.message); else render();
}
window.confirmar = id => acao(id, { situacao:'confirmado', confirmado_em:new Date().toISOString() });
window.cumprir  = id => acao(id, { situacao:'cumprido', cumprido_em:new Date().toISOString() });
window.descartar= id => { if(confirm('Marcar como "não é prazo"? Ele sai do painel.')) acao(id, { situacao:'cancelado' }); };
window.ajustar  = (id, ev) => { ev.preventDefault();
  const d = ev.target.querySelector('input').value;
  if (d) acao(id, { data_fatal:d, origem:'manual', situacao:'confirmado', confirmado_em:new Date().toISOString() }); };

function linha(p, podeConfirmar){
  const r = dias(p.data_fatal), [k,ic,tx] = sit(r), m = p.memoria_calculo || {};
  const alertas = (m.alertas||[]).map(a=>\`<span class="sub" style="color:var(--ser)">▲ \${esc(a)}</span>\`).join('');
  const acoes = podeConfirmar
    ? \`<div class="acoes">
        <button class="btn ok" onclick="confirmar('\${p.id}')">Confirmar</button>
        <form onsubmit="ajustar('\${p.id}',event)"><input type="date" value="\${p.data_fatal}"><button class="btn">Ajustar</button></form>
        <button class="btn" onclick="descartar('\${p.id}')">Não é prazo</button></div>\`
    : \`<button class="btn" onclick="cumprir('\${p.id}')">Cumprido</button>\`;
  return \`<tr>
    <td class="dt"><b>\${br(p.data_fatal)}</b><span class="sub">\${r===0?'hoje':(r<0?'há '+(-r)+'d':r+' dias')}</span></td>
    <td><span class="pill \${k}"><span aria-hidden="true">\${ic}</span> \${tx}</span></td>
    <td><b>\${esc(p.descricao)}</b><span class="sub">\${p.dias} dias úteis · \${esc(m.regime||'')}</span></td>
    <td><b>\${esc(p.caso?.titulo || '—')}</b><span class="sub">\${esc(p.intimacao?.tribunal_sigla||'')} · \${esc(p.intimacao?.orgao||'')}</span></td>
    <td class="proc">\${p.intimacao?.link_pje ? \`<a href="\${p.intimacao.link_pje}" target="_blank" rel="noreferrer">\${esc(p.intimacao?.numero_formatado)}</a>\` : esc(p.intimacao?.numero_formatado||'—')}</td>
    <td style="max-width:330px"><span class="q">“\${esc((p.trecho_origem||'').slice(0,105))}…”</span>
      <span class="sub">publicação \${br(m.publicacao)} → início \${br(m.inicioContagem)}</span>\${alertas}</td>
    <td>\${p.confianca ? Math.round(p.confianca*100)+'%' : '—'}</td>
    <td>\${acoes}</td></tr>\`;
}

function tabela(titulo, nota, itens, podeConfirmar){
  if(!itens.length) return '';
  return \`<div class="card"><h2>\${titulo}</h2><p class="nota">\${nota}</p><table>
    <thead><tr><th>Vence</th><th>Situação</th><th>Providência</th><th>Cliente / vara</th>
    <th>Processo</th><th>Trecho lido e memória</th><th>Conf.</th><th>Ação</th></tr></thead>
    <tbody>\${itens.map(p=>linha(p,podeConfirmar)).join('')}</tbody></table></div>\`;
}

async function render(){
  const { data:{ user } } = await sb.auth.getUser();
  if(!user) return telaLogin();
  const { data, error } = await sb.from('prazo')
    .select('id,descricao,data_fatal,dias,situacao,confianca,trecho_origem,memoria_calculo,intimacao:intimacao_id(numero_formatado,tribunal_sigla,orgao,link_pje),caso:caso_id(titulo)')
    .in('situacao',['sugerido','confirmado']).order('data_fatal');
  if(error) return app.innerHTML = '<main><div class="vazio">Erro ao carregar: '+esc(error.message)+'</div></main>';
  const lista = data||[], sug = lista.filter(p=>p.situacao==='sugerido'), conf = lista.filter(p=>p.situacao==='confirmado');
  const urg = lista.filter(p=>dias(p.data_fatal)<=5).length, venc = lista.filter(p=>dias(p.data_fatal)<0).length;
  app.innerHTML = \`
  <nav><b>Escritório</b><a class="on">Prazos</a>
    <span class="dir">\${esc(user.email)} · <a onclick="sb.auth.signOut().then(()=>location.reload())">sair</a></span></nav>
  <main><h1>Prazos</h1><p class="meta">Atualizado pelo robô do DJEN às 9h e 15h, dias úteis.</p>
  <div class="kpis">
    <div class="kpi"><div class="n">\${lista.length}</div><div class="l">em aberto</div></div>
    <div class="kpi \${urg?'al':''}"><div class="n">\${urg}</div><div class="l">vencem em até 5 dias</div></div>
    <div class="kpi \${venc?'al':''}"><div class="n">\${venc}</div><div class="l">já vencidos</div></div>
    <div class="kpi"><div class="n">\${sug.length}</div><div class="l">aguardando confirmação</div></div>
  </div>
  \${sug.length?\`<div class="aviso"><b>\${sug.length} prazo(s) aguardando sua confirmação.</b>
    Foram lidos automaticamente do texto da intimação. Confira a data antes de aceitar —
    a contagem é sugestão do sistema, a responsabilidade continua sendo sua.</div>\`:''}
  \${tabela('Aguardando confirmação','Confirme, ajuste a data ou descarte o que não for prazo.',sug,true)}
  \${tabela('Confirmados por você','Marque como cumprido quando protocolar.',conf,false)}
  \${lista.length?'':'<div class="card"><div class="vazio">Nenhum prazo em aberto.</div></div>'}
  </main>\`;
}

sb.auth.onAuthStateChange(()=>render());
render();
</script></body></html>`;

Deno.serve(() => {
  const cab = new Headers();
  cab.set('content-type', 'text/html; charset=utf-8');
  cab.set('cache-control', 'no-store');
  return new Response(new TextEncoder().encode(html), { status: 200, headers: cab });
});
