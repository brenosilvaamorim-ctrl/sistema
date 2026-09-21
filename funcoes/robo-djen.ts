// ROBÔ DE INTIMAÇÕES — DJEN/CNJ
// Roda no Supabase Edge Functions, agendado por pg_cron.
// Lê as comunicações da OAB, calcula o prazo e grava como SUGERIDO.
// Nada aqui confirma prazo: confirmação é ato do advogado.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const DJEN = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const LIMIAR = 0.5;
const DIAS_SEM = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];

const UF_TRIB: Record<string,string> = {
  TRT1:'RJ',TRT2:'SP',TRT3:'MG',TRT4:'RS',TRT5:'BA',TRT6:'PE',TRT7:'CE',TRT8:'PA',
  TRT9:'PR',TRT10:'DF',TRT11:'AM',TRT12:'SC',TRT13:'PB',TRT14:'RO',TRT15:'SP',
  TRT16:'MA',TRT17:'ES',TRT18:'GO',TRT19:'AL',TRT20:'SE',TRT21:'RN',TRT22:'PI',
  TRT23:'MT',TRT24:'MS',TJPE:'PE',TJBA:'BA',TJPB:'PB',TJCE:'CE',TJPA:'PA',TJSP:'SP',
  TRF1:'DF',TRF5:'PE',TST:'DF',STJ:'DF',STF:'DF',
};

type Feriado = { data: string; nome: string; ambito: string; uf: string|null };

const parse = (s: string) => { const [a,m,d] = s.split('-').map(Number); return new Date(Date.UTC(a,m-1,d)); };
const fmt = (d: Date) => d.toISOString().slice(0,10);
const mais = (d: Date, n: number) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate()+n); return x; };

function indexar(fs: Feriado[], uf?: string) {
  const m = new Map<string, Feriado>();
  for (const f of fs) {
    if ((f.ambito === 'estadual' || f.ambito === 'municipal') && (!uf || f.uf !== uf)) continue;
    if (!m.has(f.data)) m.set(f.data, f);
  }
  return m;
}
function util(d: Date, m: Map<string,Feriado>) {
  const s = d.getUTCDay();
  if (s === 0 || s === 6) return { util: false, motivo: DIAS_SEM[s] };
  const f = m.get(fmt(d));
  return f ? { util: false, motivo: f.nome } : { util: true, motivo: undefined as string|undefined };
}
function proximoUtil(d: Date, m: Map<string,Feriado>) {
  let x = d;
  for (let i = 0; i < 60; i++) { if (util(x,m).util) return x; x = mais(x,1); }
  throw new Error('sem dia útil em 60 dias — tabela de feriados incompleta');
}

// disponibilização → publicação (1º dia útil seguinte) → contagem a partir do dia útil
// seguinte à publicação → soma em dias úteis. CPC art. 219 e 224; CLT art. 775.
function calcular(dispo: string, dias: number, uf: string|undefined, feriados: Feriado[]) {
  const mapa = indexar(feriados, uf);
  const d0 = parse(dispo);
  const publicacao = proximoUtil(mais(d0,1), mapa);
  let cur = mais(publicacao,1), contados = 0, fatal: Date|null = null;
  const passos: any[] = [];
  for (let i = 0; i < 400 && contados < dias; i++) {
    const u = util(cur, mapa);
    passos.push({ data: fmt(cur), diaSemana: DIAS_SEM[cur.getUTCDay()], util: u.util, motivo: u.motivo });
    if (u.util) { contados++; if (contados === dias) fatal = cur; }
    if (contados < dias) cur = mais(cur,1);
  }
  if (!fatal) throw new Error('contagem não fechou');
  const alertas: string[] = [];
  if (passos.some(p => !p.util && String(p.motivo||'').includes('recesso')))
    alertas.push('A contagem atravessa a suspensão de prazos do recesso. Confira a portaria do tribunal.');
  return { publicacao: fmt(publicacao), inicio: passos.find(p=>p.util)!.data, fatal: fmt(fatal), passos, alertas };
}

const EXT: Record<string,number> = { um:1,dois:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,
  dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,
  dezoito:18,dezenove:19,vinte:20,trinta:30 };
const semAcento = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function detectarPrazo(texto: string) {
  const t = semAcento(texto);
  const ach: Array<{dias:number;conf:number;trecho:string}> = [];
  const pads: Array<[RegExp,number]> = [
    [/no prazo de\s+(\d{1,3})\s*(?:\([a-z\s]+\))?\s*dias?/g, .92],
    [/prazo:\s*(\d{1,3})\s*dias?/g, .90],
    [/(?:dentro de|no prazo)\s+(\d{1,3})\s*dias?/g, .80],
    [/prazo de\s+([a-z]+)\s+dias?/g, .75],
    [/prazo de\s+(\d{1,3})\s*dias?/g, .85],
    [/\b(\d{1,3})\s*dias?\b/g, .40],
  ];
  for (const [re, conf] of pads) {
    re.lastIndex = 0; let m: RegExpExecArray|null;
    while ((m = re.exec(t)) !== null) {
      const b = m[1];
      const d = /^\d+$/.test(b) ? Number(b) : EXT[b];
      if (!d || d < 1 || d > 180) continue;
      ach.push({ dias: d, conf, trecho: texto.slice(Math.max(0,m.index-70), m.index+m[0].length+30).replace(/\s+/g,' ').trim() });
    }
  }
  const TIP = new Set([5,8,10,15,30]);
  ach.sort((a,b) => (b.conf + (TIP.has(b.dias)?.05:0)) - (a.conf + (TIP.has(a.dias)?.05:0)));
  const vistos = new Set<number>(); const out: typeof ach = [];
  for (const a of ach) { if (vistos.has(a.dias)) continue; vistos.add(a.dias); out.push(a); }
  return out;
}

function detectarAudiencia(texto: string) {
  const out: Array<{data:string;hora:string|null}> = [];
  const re = /audi[êe]ncia[^.]{0,140}?(\d{2})\/(\d{2})\/(\d{4})(?:\s*[àa]s\s*(\d{1,2})[:h](\d{2}))?/gi;
  let m: RegExpExecArray|null;
  while ((m = re.exec(texto)) !== null)
    out.push({ data: `${m[3]}-${m[2]}-${m[1]}`, hora: m[4] ? `${m[4].padStart(2,'0')}:${m[5]}` : null });
  return out;
}

function providencia(texto: string, fallback: string) {
  const t = (texto||'').toLowerCase();
  const pares: Array<[RegExp,string]> = [
    [/laudo pericial/, 'Manifestar sobre laudo pericial'],
    [/c[áa]lculos/, 'Apresentar/impugnar cálculos'],
    [/contrarraz[õo]es/, 'Contrarrazões'],
    [/contestaç[ãa]o/, 'Contestação'],
    [/r[ée]plica/, 'Réplica'],
    [/embargos de declaraç[ãa]o/, 'Embargos de declaração'],
    [/recurso ordin[áa]rio/, 'Recurso ordinário'],
    [/agravo de petiç[ãa]o/, 'Agravo de petição'],
    [/efetue o pagamento/, 'Pagamento / cumprimento'],
    [/hipossufici[êe]ncia/, 'Juntar declaração de hipossuficiência'],
    [/contatos? telef[ôo]nicos?|meios de contato/, 'Informar contatos da parte'],
  ];
  for (const [re, r] of pares) if (re.test(t)) return r;
  return fallback || 'Providência a definir';
}

Deno.serve(async (req) => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  const url = new URL(req.url);
  const dias = Number(url.searchParams.get('dias') ?? '7');
  const hoje = new Date();
  const fim = fmt(hoje);
  const inicio = fmt(new Date(hoje.getTime() - dias * 86400000));

  const { data: esc } = await db.from('escritorio').select('id').limit(1).single();
  const { data: oabs } = await db.from('oab').select('numero, uf').eq('monitorar', true);
  const { data: feriados } = await db.from('feriado').select('data, nome, ambito, uf');

  const rel: any = { janela: { inicio, fim }, oabs: [], intimacoesNovas: 0,
    prazosSugeridos: 0, semPrazo: 0, baixaConfianca: 0, audiencias: 0, erros: [] };

  for (const o of oabs ?? []) {
    try {
      const itens: any[] = [];
      for (let p = 1; p <= 30; p++) {
        const u = new URL(DJEN);
        u.searchParams.set('numeroOab', o.numero);
        u.searchParams.set('ufOab', o.uf);
        u.searchParams.set('dataDisponibilizacaoInicio', inicio);
        u.searchParams.set('dataDisponibilizacaoFim', fim);
        u.searchParams.set('itensPorPagina', '100');
        u.searchParams.set('pagina', String(p));
        const r = await fetch(u, { headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`DJEN ${r.status}`);
        const j = await r.json();
        const lote = j.items ?? [];
        itens.push(...lote);
        if (lote.length < 100) break;
      }

      // o DJEN repete a mesma comunicação uma vez por destinatário
      const vistos = new Set<string>(); const unicas: any[] = [];
      for (const i of itens) {
        const k = `${i.numero_processo}|${i.data_disponibilizacao}|${(i.texto||'').slice(0,400)}`;
        if (vistos.has(k)) continue; vistos.add(k); unicas.push(i);
      }
      rel.oabs.push({ oab: `${o.numero}/${o.uf}`, recebidas: itens.length, unicas: unicas.length });

      for (const c of unicas) {
        const { data: ja } = await db.from('intimacao').select('id').eq('hash_djen', c.hash).maybeSingle();
        if (ja) continue;

        const { data: proc } = await db.from('processo').select('id, caso_id')
          .eq('numero_cnj', c.numero_processo).maybeSingle();

        const cands = detectarPrazo(c.texto || '');
        const melhor = cands[0];
        const criar = !!melhor && melhor.conf >= LIMIAR;

        const { data: intim, error: e1 } = await db.from('intimacao').insert({
          escritorio_id: esc!.id, processo_id: proc?.id ?? null, caso_id: proc?.caso_id ?? null,
          djen_id: c.id, hash_djen: c.hash, tribunal_sigla: c.siglaTribunal, orgao: c.nomeOrgao,
          tipo_comunicacao: c.tipoComunicacao, tipo_documento: c.tipoDocumento, classe: c.nomeClasse,
          numero_processo: c.numero_processo, numero_formatado: c.numeroprocessocommascara,
          data_disponibilizacao: c.data_disponibilizacao, meio: c.meio, texto: c.texto,
          link_pje: c.link, destinatarios: c.destinatarios, advogados: c.destinatarioadvogados,
          oab_captura: `${o.numero}/${o.uf}`, situacao: criar ? 'triada' : 'nova',
        }).select('id').single();
        if (e1) { rel.erros.push(`intimação ${c.hash}: ${e1.message}`); continue; }
        rel.intimacoesNovas++;

        if (criar) {
          const uf = UF_TRIB[c.siglaTribunal];
          const calc = calcular(c.data_disponibilizacao, melhor.dias, uf, feriados as Feriado[]);
          const alertas = [...calc.alertas];
          if (cands.length > 1)
            alertas.push(`O texto menciona mais de um prazo (${cands.map(x=>x.dias+'d').join(', ')}). Sugerido o de maior confiança — confira.`);
          if (!uf) alertas.push(`Tribunal ${c.siglaTribunal} sem UF mapeada: feriados estaduais não aplicados.`);

          const { error: e2 } = await db.from('prazo').insert({
            escritorio_id: esc!.id, intimacao_id: intim.id,
            processo_id: proc?.id ?? null, caso_id: proc?.caso_id ?? null,
            descricao: providencia(c.texto, c.tipoDocumento),
            data_publicacao: c.data_disponibilizacao, data_inicio: calc.inicio,
            dias: melhor.dias, dias_uteis: true,
            regime: /^TRT\d+$|^TST$/.test(c.siglaTribunal) ? 'CLT' : 'CPC',
            data_fatal: calc.fatal,
            memoria_calculo: { publicacao: calc.publicacao, inicioContagem: calc.inicio,
              uf: uf ?? null, passos: calc.passos, alertas },
            origem: 'automatico', situacao: 'sugerido',
            confianca: melhor.conf, trecho_origem: melhor.trecho,
          });
          if (e2) rel.erros.push(`prazo ${c.hash}: ${e2.message}`);
          else rel.prazosSugeridos++;
        } else if (melhor) {
          rel.baixaConfianca++;
        } else {
          rel.semPrazo++;
        }

        for (const a of detectarAudiencia(c.texto || '')) {
          await db.from('evento').insert({
            escritorio_id: esc!.id, processo_id: proc?.id ?? null, caso_id: proc?.caso_id ?? null,
            tipo: 'audiencia', titulo: `Audiência — ${c.numeroprocessocommascara}`,
            descricao: `Detectada automaticamente na intimação de ${c.data_disponibilizacao}. Confira no PJe.`,
            inicio: `${a.data}T${a.hora ?? '09:00'}:00-03:00`, local: c.nomeOrgao,
          });
          rel.audiencias++;
        }
      }
    } catch (err) {
      rel.erros.push(`OAB ${o.numero}/${o.uf}: ${(err as Error).message}`);
    }
  }

  return new Response(JSON.stringify(rel, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
});
