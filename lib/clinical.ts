import { RSA_QUESTIONS, QUESTION_BY_ID, type RsaQuestion, type SchedaId, type Tier } from './jev-questions';
import { parseDiary, findAffirmed, bandTemp, bandPA, bandFC, bandSat, bandGlic, bandDolore, type Span } from './parser';

/**
 * Metafora del cane da tartufo:
 *  - parser locale = righello: legge i NUMERI (PA, FC, Temp, Sat, Glicemia, Peso, NRS)
 *  - Jev           = cane da tartufo: legge il CONTESTO e dà probabilità calibrate che fanno scattare gli alert
 * Le soglie sono per singola domanda (threshold_yellow / threshold_red nel JSON).
 */

// ---------------- Risposte Jev (docs Vercel) ----------------
export type BooleanAnswer = { type: 'boolean'; probability: number };
export type ChoiceAnswer = { type: 'choice'; choice: string; probabilities?: Record<string, number> };
export type ScoreAnswer = { type: 'score'; score: number; probabilities?: Record<string, number> };
export type JevAnswer = BooleanAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Record<string, JevAnswer | undefined>;

export type AnalysisResult = {
  mode: 'jev' | 'mock';
  model: string;
  gatewayLatencyMs: number | null;
  answers: Answers;
  confidence: Record<string, number>;
  usage?: { inputTokens?: number; outputTokens?: number } | null;
  cost?: string | null;
  raw?: unknown;
};

// =====================================================================
// Keyword engine (usato dalla simulazione e per trovare gli snippet)
// =====================================================================
const esc = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map<string, RegExp>();
/** "cadut*" -> prefisso, "perso * kg" -> una parola qualsiasi in mezzo; confini di parola compatibili con le accentate. */
export function kwRegex(k: string): RegExp {
  let re = reCache.get(k);
  if (!re) {
    const body = k.trim().split(/\s+/).map((w) => (w === '*' ? '[\\p{L}\\d]+' : esc(w).replace(/\*/g, '[\\p{L}\\d]*'))).join('\\s+');
    re = new RegExp(`(?<![\\p{L}\\d])${body}(?![\\p{L}\\d])`, 'iu');
    reCache.set(k, re);
  }
  return re;
}
export const normalizeText = (t: string) => (t || '').replace(/[’`]/g, "'");

export type Scan = { hits: Span[]; negated: Span[] };
export function scanKeywords(text: string, keywords: string[]): Scan {
  const hits: Span[] = [];
  const negated: Span[] = [];
  for (const k of keywords) {
    const r = findAffirmed(text, kwRegex(k));
    if (r.hit && !hits.some((h) => h.start < r.hit!.end && r.hit!.start < h.end)) hits.push(r.hit);
    else if (!r.hit && r.negated) negated.push(r.negated);
  }
  hits.sort((a, b) => a.start - b.start);
  return { hits, negated };
}
const kw = (text: string, ...ks: string[]) => scanKeywords(text, ks).hits.length > 0;

function allTemps(text: string): number[] {
  const out: number[] = [];
  const re = /\b(3[3-9]|4[0-2])(?:[.,](\d))?\b\s*(?:°|gradi)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[2] && !/°|gradi/.test(m[0])) continue;
    out.push(parseFloat(`${m[1]}.${m[2] || 0}`));
  }
  return out;
}
const FEBBRE_PREGRESSA = /\b(?:ieri|aveva|stanotte|giorni\s+fa|in\s+precedenza|la\s+scorsa\s+notte)\b[^.;]{0,30}\bfebbr\w*/i;

// =====================================================================
// SIMULAZIONE LOCALE: probabilità fisse da keyword (nessun random)
// =====================================================================
export function mockAnalyze(diary: string): AnalysisResult {
  const t = normalizeText(diary);
  const p = parseDiary(t);
  const out: Record<string, number> = {};

  for (const q of RSA_QUESTIONS) {
    if (q.tier === 'sintesi') continue;
    const s = scanKeywords(t, q.keywords);
    const n = s.hits.length;
    const neg = (q.mock as any)?.neg ?? 0.04;
    out[q.id] = n === 0 ? (s.negated.length ? neg : 0.03) : n === 1 ? q.mock?.p1 ?? 0.8 : n === 2 ? q.mock?.p2 ?? 0.88 : q.mock?.p3 ?? 0.92;
  }
  out.dispnea = out.dispnea === 0.04 ? 0.03 : out.dispnea;
  const cadutaSi = (out.caduta ?? 0) >= 0.5;

  // Sospetta frattura: "non carica" + accorciamento/extrarotazione = quadro tipico
  {
    const f = scanKeywords(t, QUESTION_BY_ID.sospetta_frattura.keywords).hits.length;
    const tipico = kw(t, 'non carica') && kw(t, 'accorciament*', 'extraruotat*', 'extrarotat*');
    out.sospetta_frattura = tipico ? 0.86 : f >= 2 ? 0.62 : f === 1 ? (cadutaSi ? 0.3 : 0.15) : 0.03;
  }
  // Trauma cranico: "non ricorda" conta solo dopo una caduta, e da solo resta un dubbio
  {
    const forti = scanKeywords(t, QUESTION_BY_ID.trauma_cranico.keywords.filter((k) => k !== 'non ricorda')).hits.length;
    out.trauma_cranico = forti ? 0.88 : cadutaSi && kw(t, 'non ricorda') ? 0.55 : 0.03;
  }
  // Presincope: pallore + sudorazione + sensazione di svenire, anche con PA normale
  const pres = [kw(t, 'pallid*', 'pallore'), kw(t, 'sudat*', 'sudorazion*'), kw(t, 'svenire', 'svenimento', 'lipotimi*', 'capogir*', 'mancamento')].filter(Boolean).length;
  out.presincope = pres === 3 ? (p.pa && p.pa.s <= 90 ? 0.82 : 0.81) : pres === 2 ? 0.55 : pres === 1 ? 0.15 : 0.03;

  // Febbre ADESSO vs IN PASSATO
  const temps = allTemps(t);
  const pregressa = FEBBRE_PREGRESSA.test(t);
  const current = pregressa && temps.length > 1 ? temps[temps.length - 1] : p.temperatura?.value ?? temps[temps.length - 1] ?? null;
  const febbreScan = scanKeywords(t, QUESTION_BY_ID.febbre_attuale.keywords);
  let febbreOra: number;
  if ((!febbreScan.hits.length && febbreScan.negated.length) || (pregressa && (current === null || current < 37.5))) febbreOra = 0.08;
  else if (current !== null && current >= 38) febbreOra = 0.93;
  else if (current !== null && current >= 37.3) febbreOra = 0.35;
  else febbreOra = 0.05;
  out.febbre_attuale = febbreOra;
  out.febbre_pregressa = pregressa ? 0.85 : 0.05;

  // Deterioramento: somma di segnali deboli (numeri del parser + presincope)
  const segnali = [
    !!p.fc && p.fc.value > 100,
    !!p.pa && p.pa.s <= 100,
    !!p.sat && p.sat.value <= 94,
    current !== null && current >= 37.5 && !pregressa,
    pres >= 2,
  ].filter(Boolean).length;
  const detKw = (out.deterioramento_sepsi ?? 0) >= 0.5;
  out.deterioramento_sepsi = segnali >= 4 ? 0.78 : segnali === 3 ? 0.6 : segnali === 2 || detKw ? 0.35 : 0.05;

  // Dolore riferito: la negazione vince, NRS 0 = nessun dolore
  if (p.doloreNegato || (p.dolore && p.dolore.value === 0)) out.dolore_riferito = 0.05;
  else if ((p.dolore && p.dolore.value > 0) || out.dolore_riferito >= 0.5) out.dolore_riferito = 0.9;

  // Quadro stabile = nessun rischio rilevante
  const maxRisk = Math.max(...RSA_QUESTIONS.filter((q) => ['urgente', 'evento', 'monitoraggio'].includes(q.tier)).map((q) => out[q.id] ?? 0));
  out.quadro_stabile = maxRisk < 0.3 ? 0.94 : Math.max(0.05, +(0.95 - maxRisk).toFixed(2));

  const answers: Answers = {};
  for (const [k, v] of Object.entries(out)) answers[k] = { type: 'boolean', probability: +v.toFixed(2) };
  return { mode: 'mock', model: 'Simulazione locale (keyword, probabilità fisse)', gatewayLatencyMs: null, answers, confidence: {} };
}

// =====================================================================
// REPORT PER LA UI
// =====================================================================
export type Status = 'ok' | 'warn' | 'crit' | 'none';
export type Color = 'rosso' | 'giallo' | 'grigio';
export type Band = 'sopra_rosso' | 'sopra_giallo' | 'possibile' | 'escluso';

export const SCHEDE: Record<SchedaId, string> = {
  cadute: 'Apri scheda caduta',
  lesioni: 'Apri scheda lesioni',
  contenzione: 'Apri scheda contenzione',
  nutrizionale: 'Apri scheda nutrizionale',
  news: 'Apri scheda NEWS2',
  infezioni: 'Apri scheda infezioni',
  dolore: 'Apri scheda dolore',
  delirium: 'Valuta delirium (4AT/CAM)',
  bpsd: 'Apri scheda BPSD',
  pai: 'Rivaluta PAI',
  trasferimento: 'Apri scheda trasferimento',
};

export type RiskRow = {
  q: RsaQuestion;
  probability: number;
  band: Band;
  color: Color;
  cta: 'apri' | 'verifica' | null;
  href: string | null;
  snippet: Span | null;
  negatedSnippet: Span | null;
};

export type VitalRow = {
  id: string; label: string; value: string | null; unit: string; status: Status;
  bandLabel: string | null; snippet: Span | null; note: string | null;
  jev: { label: string; probability: number } | null;
};

export type AreaRow = { category: string; color: Color | 'verde'; top: RiskRow | null };

export type Report = {
  overall: 'verde' | 'giallo' | 'rosso';
  stable: number | null;
  segnalazioni: RiskRow[];   // urgenti sopra soglia gialla
  eventi: RiskRow[];         // eventi da documentare sopra soglia gialla
  monitoraggio: RiskRow[];   // aree da monitorare sopra soglia gialla
  possibili: RiskRow[];      // tra 30% e soglia gialla
  esclusi: RiskRow[];        // sotto 30% ma nominati nel testo (negazioni!)
  pai: { reason: string; href: string } | null;
  aree: AreaRow[];
  vitals: VitalRow[];
  parsedCount: number;
  spans: (Span & { tone: Status | 'event' })[];
};

export const AREE = ['Sicurezza', 'Cute e lesioni', 'Nutrizione e idratazione', 'Deterioramento e infezioni', 'Dolore e comfort', 'Cognizione e comportamento', 'Autonomia e funzione', 'Terapia', 'Organizzativo'];

const BAND_LABEL: Record<string, string> = {
  ipotermia: 'Ipotermia', normale: 'Nella norma', febbricola: 'Febbricola', febbre: 'Febbre', iperpiressia: 'Iperpiressia',
  ipotensione: 'Ipotensione', ipertensione: 'Ipertensione', ipertensione_severa: 'Ipertensione severa',
  bradicardia: 'Bradicardia', tachicardia: 'Tachicardia', ridotta: 'Ridotta', ipossiemia: 'Ipossiemia',
  ipoglicemia: 'Ipoglicemia', iperglicemia: 'Iperglicemia', iperglicemia_severa: 'Iperglicemia severa',
};
const STATUS_OF: Record<string, Status> = {
  normale: 'ok', febbricola: 'warn', febbre: 'warn', iperpiressia: 'crit', ipotermia: 'crit',
  ipotensione: 'warn', ipertensione: 'warn', ipertensione_severa: 'crit',
  bradicardia: 'warn', tachicardia: 'warn', ridotta: 'warn', ipossiemia: 'crit',
  ipoglicemia: 'crit', iperglicemia: 'warn', iperglicemia_severa: 'crit',
};
const PAIN = ['Assente', 'Lieve', 'Moderato', 'Severo', 'Insopportabile'];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const qs = (o: Record<string, string | number | null | undefined>) =>
  Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export function buildReport(diary: string, result: AnalysisResult): Report {
  const text = normalizeText(diary);
  const p = parseDiary(text);
  const a = result.answers;
  const spans: Report['spans'] = [];
  const push = (s: Span | null | undefined, tone: Status | 'event') => { if (s) spans.push({ ...s, tone }); };
  const prob = (id: string) => { const x = a[id]; return x && x.type === 'boolean' ? x.probability : null; };

  // ---------------- Parametri (righello) ----------------
  const vital = (id: string, label: string, unit: string, value: string | null, band: string | null, snippet: Span | null): VitalRow => {
    const status: Status = value || band ? STATUS_OF[band || ''] || 'ok' : 'none';
    push(snippet, status);
    return { id, label, value, unit, status, bandLabel: band ? BAND_LABEL[band] || band : null, snippet, note: null, jev: null };
  };
  const tempBand = p.temperatura ? bandTemp(p.temperatura.value) : p.temperaturaQualitativa === 'apiretico' ? 'normale' : null;
  const vitals: VitalRow[] = [
    vital('pa', 'Pressione arteriosa', 'mmHg', p.pa ? `${p.pa.s}/${p.pa.d}` : null, p.pa ? bandPA(p.pa.s, p.pa.d) : null, p.pa?.span || null),
    vital('fc', 'Frequenza cardiaca', 'bpm', p.fc ? fmt(p.fc.value) : null, p.fc ? bandFC(p.fc.value) : null, p.fc?.span || null),
    vital('sat', 'Saturazione O₂', '%', p.sat ? fmt(p.sat.value) : null, p.sat ? bandSat(p.sat.value) : null, p.sat?.span || null),
    vital('temp', 'Temperatura', '°C', p.temperatura ? fmt(p.temperatura.value) : null, tempBand, p.temperatura?.span || null),
    vital('glic', 'Glicemia', 'mg/dL', p.glicemia ? fmt(p.glicemia.value) : null, p.glicemia ? bandGlic(p.glicemia.value) : null, p.glicemia?.span || null),
    vital('peso', 'Peso', 'kg', p.peso ? fmt(p.peso.value) : null, null, p.peso?.span || null),
  ];
  if (vitals[5].value) vitals[5].bandLabel = 'Registrato';
  if (!p.temperatura && p.temperaturaQualitativa === 'apiretico') vitals[3].bandLabel = 'Apiretico';

  const fOra = prob('febbre_attuale');
  const fPrima = prob('febbre_pregressa');
  if (fOra !== null) {
    const tv = vitals[3];
    tv.jev = { label: 'Febbre ora', probability: fOra };
    if (tempBand && ['febbre', 'iperpiressia'].includes(tempBand) && fOra < 0.3) {
      tv.status = 'ok';
      tv.note = `Jev: valore riferito al passato${fPrima !== null && fPrima >= 0.5 ? ` (febbre pregressa ${Math.round(fPrima * 100)}%)` : ''}. Nessun allarme febbre.`;
    }
  }
  {
    const pd = prob('dolore_riferito');
    const value = p.dolore ? String(p.dolore.value) : p.doloreNegato ? '0' : null;
    const status: Status = p.dolore ? (p.dolore.value >= 7 ? 'crit' : p.dolore.value >= 4 ? 'warn' : 'ok') : pd !== null && pd >= 0.5 ? 'warn' : p.doloreNegato ? 'ok' : 'none';
    push(p.dolore?.span || p.doloreNegato, status);
    vitals.push({
      id: 'dolore', label: 'Dolore NRS', value, unit: '/10', status,
      bandLabel: p.dolore ? PAIN[bandDolore(p.dolore.value)] : p.doloreNegato ? 'Assente' : pd !== null && pd >= 0.5 ? 'Riferito, senza numero' : null,
      snippet: p.dolore?.span || p.doloreNegato, note: null, jev: pd !== null ? { label: 'Dolore', probability: pd } : null,
    });
  }
  const parsedCount = [p.pa, p.fc, p.sat, p.temperatura, p.glicemia, p.peso, p.dolore].filter(Boolean).length;

  // ---------------- Rischi (cane da tartufo) ----------------
  const cadQuando = p.caduta?.when;
  const hrefFor = (q: RsaQuestion, pr: number): string | null => {
    if (!q.scheda) return null;
    const base: Record<string, string | number | null | undefined> = { source: 'jev', q: q.id, p: Math.round(pr * 100) };
    const extra: Record<string, string | number | null | undefined> =
      q.scheda === 'news' ? { pas: p.pa?.s, fc: p.fc?.value, sat: p.sat?.value, temp: p.temperatura?.value }
      : q.scheda === 'cadute' ? { quando: cadQuando, frattura: (prob('sospetta_frattura') ?? 0) >= QUESTION_BY_ID.sospetta_frattura.threshold_yellow ? 1 : null }
      : q.scheda === 'lesioni' ? { sede: p.lesione?.sede?.value, fondo: p.lesione?.fondo?.value, stadio: p.lesione?.stadio }
      : q.scheda === 'dolore' ? { nrs: p.dolore?.value }
      : {};
    return `/scheda-${q.scheda}?${qs({ ...base, ...extra })}`;
  };

  const risks: RiskRow[] = [];
  for (const q of RSA_QUESTIONS) {
    if (q.tier === 'sintesi' || q.tier === 'info') continue;
    const pr = prob(q.id);
    if (pr === null || !Number.isFinite(pr)) continue;
    const scan = scanKeywords(text, q.keywords);
    const band: Band = pr >= q.threshold_red ? 'sopra_rosso' : pr >= q.threshold_yellow ? 'sopra_giallo' : pr >= 0.3 ? 'possibile' : 'escluso';
    const color: Color = band === 'sopra_rosso' && q.tier === 'urgente' ? 'rosso' : band === 'sopra_rosso' || band === 'sopra_giallo' ? 'giallo' : 'grigio';
    const cta = band === 'sopra_rosso' ? 'apri' : band === 'sopra_giallo' ? 'verifica' : null;
    const row: RiskRow = { q, probability: pr, band, color, cta: q.scheda ? cta : null, href: hrefFor(q, pr), snippet: scan.hits[0] || null, negatedSnippet: scan.negated[0] || null };
    risks.push(row);
    if (color === 'rosso') push(row.snippet, 'crit');
    else if (color === 'giallo') push(row.snippet, 'warn');
    else if (band === 'escluso') push(row.negatedSnippet, 'none');
  }
  const byP = (x: RiskRow, y: RiskRow) => (x.color === 'rosso' ? 0 : 1) - (y.color === 'rosso' ? 0 : 1) || y.probability - x.probability;
  const above = risks.filter((r) => r.band === 'sopra_rosso' || r.band === 'sopra_giallo');
  const segnalazioni = above.filter((r) => r.q.tier === 'urgente').sort(byP);
  const eventi = above.filter((r) => r.q.tier === 'evento').sort(byP);
  const monitoraggio = above.filter((r) => r.q.tier === 'monitoraggio').sort(byP);
  const possibili = risks.filter((r) => r.band === 'possibile').sort(byP);
  const esclusi = risks.filter((r) => r.band === 'escluso' && (r.negatedSnippet || r.snippet)).sort((x, y) => x.probability - y.probability);

  // ---------------- Regola PAI (codice nostro, non Jev) ----------------
  // Il PAI si rivede per cambiamenti che durano: una domanda legata al PAI sopra soglia rossa,
  // oppure 3 o più aree diverse sopra soglia gialla. Un evento acuto singolo va al medico, non al PAI.
  const areeSopra = new Set(above.map((r) => r.q.category));
  const paiTrigger = above.find((r) => r.q.scheda === 'pai' && r.band === 'sopra_rosso');
  const pai = paiTrigger
    ? { reason: `${paiTrigger.q.label} ${Math.round(paiTrigger.probability * 100)}%`, href: `/scheda-pai?${qs({ source: 'jev', q: paiTrigger.q.id })}` }
    : areeSopra.size >= 3
    ? { reason: `${areeSopra.size} aree sopra soglia: ${Array.from(areeSopra).join(', ')}`, href: `/scheda-pai?${qs({ source: 'jev', aree: Array.from(areeSopra).join('|') })}` }
    : null;

  const aree: AreaRow[] = AREE.map((category) => {
    const rs = above.filter((r) => r.q.category === category).sort(byP);
    return { category, color: rs.length ? rs[0].color : 'verde', top: rs[0] || null };
  });

  const overall: Report['overall'] = above.some((r) => r.color === 'rosso') ? 'rosso' : above.length ? 'giallo' : 'verde';
  return { overall, stable: prob('quadro_stabile'), segnalazioni, eventi, monitoraggio, possibili, esclusi, pai, aree, vitals, parsedCount, spans };
}

// ---------------- Esempi pronti RSA ----------------
export type Esempio = { id: string; n: string; label: string; text: string; atteso: string };
export const ESEMPI: Esempio[] = [
  { id: 'stabile', n: '1', label: 'Controllo stabile', atteso: 'Nessun alert, quadro stabile 94%',
    text: 'ospite a letto, PA 135/90, FC 88, sat 96% in aria, apiretico 36.6, tranquillo, collabora' },
  { id: 'caduta-lieve', n: '2', label: 'Caduta lieve con escoriazione', atteso: 'Giallo: caduta 89% e lesione 85%, proposte schede caduta e lesioni',
    text: 'riferisce caduta ieri sera in giardino, piccola escoriazione ginocchio dx, ora deambula senza dolore, PA 130/80 FC 78' },
  { id: 'frattura', n: '3', label: 'Trovato a terra, sospetta frattura', atteso: 'Rosso: sospetta frattura di femore 86%',
    text: 'trovato a terra stamattina in bagno, non ricorda caduta, dolore forte anca dx, non carica arto, accorciamento' },
  { id: 'vitali-a', n: '4A', label: 'Stessi vitali A: tranquillo', atteso: 'Verde: stabile 94%',
    text: 'PA 135/90 FC 88 apiretico tranquillo' },
  { id: 'vitali-b', n: '4B', label: 'Stessi vitali B: pallido e confuso', atteso: 'Rosso: presincope 81%, confusione 74%',
    text: 'PA 135/90 FC 88 pallido sudato dice di sentirsi svenire, un po\' confuso' },
  { id: 'negazioni', n: '5', label: 'Negazioni: nega, non', atteso: 'Dolore 5%, caduta 4%, dispnea 3%: nessun falso allarme',
    text: 'nega dolore, apiretico 36.8, nega caduta, non dispnoico, PA 125/80 FC 72' },
  { id: 'passato', n: '6', label: 'Febbre ieri, oggi no', atteso: 'Febbre in atto 8%: nessun falso allarme',
    text: 'la figlia riferisce che ieri la mamma aveva febbre alta 38.5, oggi 36.8, nega febbre attuale, PA 120/70' },
  { id: 'delirium', n: '7', label: 'Delirium, non riconosce', atteso: 'Rosso: delirium 78%, proposta 4AT/CAM',
    text: 'confuso stamattina, non riconosce familiari, disorientato nel tempo e spazio, agitazione' },
  { id: 'sepsi', n: '8', label: 'Early warning, NEWS2', atteso: 'Rosso: presincope 82%, deterioramento/sepsi 78%',
    text: 'pallido, sudato, FC 115, PA 90/60, febbricola 37.8°C, dice sentirsi svenire, sat 92%' },
];
