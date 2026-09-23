/**
 * Parser deterministico del diario infermieristico.
 *
 * Jev restituisce probabilità su opzioni/fasce, non numeri liberi: il valore
 * esatto (72 kg, 145/90, 37,8 °C) e lo snippet di testo da cui arriva
 * li ricava questo parser. È anche la base del mock quando la chiave manca.
 */

export type Span = { start: number; end: number; text: string };
export type Num = { value: number; span: Span } | null;

export type ParsedDiary = {
  peso: Num;
  temperatura: Num;
  temperaturaQualitativa: 'apiretico' | 'febbrile' | null;
  pa: { s: number; d: number; span: Span } | null;
  fc: Num;
  sat: Num;
  glicemia: Num;
  dolore: Num;
  doloreNegato: Span | null;
  doloreToracico: Span | null;
  diuresi: { value: string; ml: number | null; span: Span } | null;
  alvo: { value: string; span: Span } | null;
  caduta: { when: 'turno_attuale' | 'giorni_precedenti'; span: Span } | null;
  cadutaEsclusa: Span | null;
  lesione: {
    span: Span;
    sede: { value: string; span: Span } | null;
    fondo: { value: string; span: Span } | null;
    stadio: string | null;
  } | null;
  dispnea: Span | null;
  sudorazione: Span | null;
  statoMentale: { value: 'vigile_orientato' | 'confuso' | 'soporoso'; span: Span } | null;
  pesoAndamento: { value: 'calo' | 'aumento' | 'stabile'; span: Span } | null;
};

const toNum = (s: string) => parseFloat(s.replace(',', '.'));

function mk(text: string, m: RegExpExecArray): Span {
  return { start: m.index, end: m.index + m[0].length, text: m[0] };
}

function firstMatch(text: string, res: RegExp[], min: number, max: number, group = 1): Num {
  for (const re of res) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const v = toNum(m[group]);
      if (!isNaN(v) && v >= min && v <= max) return { value: v, span: mk(text, m) };
    }
  }
  return null;
}

// La negazione vale solo nella stessa frase/inciso: si ferma a . ; , e a capo.
const NEG = /\b(non|nessun[ao]?|no|nega|negat[oa]|senza|assenza di|esclus[ao])\b[^.;,\n]{0,18}$/i;
const RISK = /\b(rischio|prevenzione|scala|conley|morse)\b[^.;\n]{0,14}$/i;

/** Trova la prima occorrenza non negata. */
export function findAffirmed(text: string, re: RegExp): { hit: Span | null; negated: Span | null } {
  const g = new RegExp(re.source, 'gi' + (re.flags.includes('u') ? 'u' : ''));
  let m: RegExpExecArray | null;
  let negated: Span | null = null;
  while ((m = g.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    if (RISK.test(before)) continue;
    if (NEG.test(before)) {
      if (!negated) {
        const negM = before.match(NEG)!;
        const start = m.index - negM[0].length;
        negated = { start, end: m.index + m[0].length, text: text.slice(start, m.index + m[0].length) };
      }
      continue;
    }
    return { hit: mk(text, m), negated };
  }
  return { hit: null, negated };
}

/** Cerca parole chiave: 'earliest' = la prima nel testo, 'priority' = la prima regola della tabella che trova qualcosa. */
function findKeyword<T extends string>(
  text: string,
  table: [RegExp, T][],
  mode: 'earliest' | 'priority' = 'earliest',
): { value: T; span: Span } | null {
  let best: { value: T; span: Span } | null = null;
  for (const [re, value] of table) {
    const m = new RegExp(re.source, 'i').exec(text);
    if (!m) continue;
    if (mode === 'priority') return { value, span: mk(text, m) };
    if (!best || m.index < best.span.start) best = { value, span: mk(text, m) };
  }
  return best;
}

export function parseDiary(raw: string): ParsedDiary {
  const text = raw || '';

  // ---- Peso (evita "perso 4 kg", "calo di 3 kg")
  let peso = firstMatch(text, [/\b(?:peso|pesa|pesato)\b[^\d\n]{0,14}(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg|chili|chilogrammi)?/i], 20, 250);
  if (!peso) {
    const g = /(\d{2,3}(?:[.,]\d{1,2})?)\s*(?:kg|chili)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 22), m.index);
      if (/(pers[oi]|calo|perdita|aumento|preso|di)\s*[^\d]{0,8}$/i.test(before)) continue;
      const v = toNum(m[1]);
      if (v >= 20 && v <= 250) { peso = { value: v, span: mk(text, m) }; break; }
    }
  }

  // ---- Temperatura
  const temperatura = firstMatch(
    text,
    [
      /\b(?:temperatura(?:\s+corporea)?|temp\.?|TC|T\.C\.|febbre|febbricola|piressia|iperpiressia|apiretic[oa])\b[^\d\n]{0,14}(\d{2}(?:[.,]\d{1,2})?)/i,
      /(\d{2}(?:[.,]\d{1,2})?)\s*(?:°\s*C?|gradi)/i,
    ],
    32,
    43,
  );
  let temperaturaQualitativa: ParsedDiary['temperaturaQualitativa'] = null;
  if (!temperatura) {
    if (/\bapiretic[oa]\b/i.test(text)) temperaturaQualitativa = 'apiretico';
    else if (/\b(febbrile|febbricola|febbre)\b/i.test(text)) temperaturaQualitativa = 'febbrile';
  }

  // ---- Pressione arteriosa
  // Accetta "135/90", "135 su 90", "135-90", "135 e 90", "90 135", "90/135": sistolica = max, diastolica = min.
  // Il separatore è limitato (/, su, -, virgola o spazi) per non unire "PA 135, FC 88" in 135/88.
  let pa: ParsedDiary['pa'] = null;
  for (const re of [
    /\b(?:PA|P\.A\.|pressione(?:\s+arteriosa)?)\b[^\d\n]{0,14}(\d{2,3})\s*(?:\/|\\|su|-|,|e)?\s*(\d{2,3})\b/i,
    /(\d{2,3})\s*\/\s*(\d{2,3})\s*mm\s*hg/i,
  ]) {
    const m = re.exec(text);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      const s = Math.max(a, b);
      const d = Math.min(a, b);
      if (s >= 50 && s <= 280 && d >= 20 && d <= 180 && s !== d) { pa = { s, d, span: mk(text, m) }; break; }
    }
  }

  // ---- Frequenza cardiaca
  const fc = firstMatch(
    text,
    [
      /\b(?:FC|F\.C\.|frequenza\s+cardiaca|frequenza(?!\s+respiratoria)|polso|battiti)\b[^\d\n]{0,14}(\d{2,3})/i,
      /(\d{2,3})\s*(?:bpm|battiti)/i,
    ],
    20,
    250,
  );

  // ---- Saturazione
  const sat = firstMatch(
    text,
    [/\b(?:SpO2|SaO2|sat\w*)(?:\s*(?:in\s*)?O2)?[^\d\n]{0,14}(\d{2,3})\s*(?:%|per\s?cento)?/i, /(\d{2,3})\s*%\s*(?:in\s+aria|in\s+AA|in\s+O2|con\s+O2)/i],
    50,
    100,
  );

  // ---- Glicemia
  const glicemia = firstMatch(
    text,
    [/\b(?:glicemia|glic\.?|glucosio|HGT|stick(?:\s+glicemico)?|destrostix|DTX)\b[^\d\n]{0,22}(\d{2,3})/i],
    15,
    900,
  );

  // ---- Dolore
  const dolore = firstMatch(
    text,
    [
      /\b(?:dolore|dolente|NRS|VAS)\b[^\n]{0,40}?(\d{1,2})\s*(?:\/|su)\s*10\b/i,
      /\b(?:NRS|VAS)\b[^\d\n]{0,6}(\d{1,2})\b/i,
    ],
    0,
    10,
  );
  const doloreNeg = /\b(?:nega\s+dolore|dolore\s+(?:assente|negato)|non\s+(?:riferisce|lamenta)\s+dolor\w*|nessun\s+dolore|senza\s+dolore)\b/i.exec(text);
  const doloreNegato = doloreNeg ? mk(text, doloreNeg) : null;
  const dtor = /\b(?:dolore\s+(?:toracico|retrosternale|al\s+petto)|oppressione\s+(?:toracica|retrosternale)|toracalgia)\b/i.exec(text);
  const doloreToracico = dtor ? mk(text, dtor) : null;

  // ---- Diuresi
  let diuresi: ParsedDiary['diuresi'] = null;
  const dMl = /\bdiuresi\b[^\d\n]{0,18}(\d{2,4})\s*(?:ml|cc)\b/i.exec(text);
  const dKw = findKeyword(text, [
    [/\bdiuresi\s+(?:\w+\s+){0,2}?(?:regolare|valida|presente|conservata|spontanea|nella\s+norma)\b/, 'regolare'],
    [/\bdiuresi\s+(?:\w+\s+){0,2}?(?:ridotta|scarsa|contratta)\b|\boliguri\w*/, 'ridotta'],
    [/\bdiuresi\s+assente\b|\banuri\w*/, 'assente'],
    [/\bdiuresi\s+(?:\w+\s+){0,2}?(?:abbondante|aumentata)\b|\bpoliuri\w*/, 'aumentata'],
  ]);
  if (dKw || dMl) {
    diuresi = {
      value: dKw ? dKw.value : 'volume registrato',
      ml: dMl ? parseInt(dMl[1], 10) : null,
      span: dKw ? dKw.span : mk(text, dMl!),
    };
  }

  // ---- Alvo
  const alvo = findKeyword(text, [
    [/\balvo\s+(?:\w+\s+){0,2}?(?:regolare|canalizzato|nella\s+norma|aperto)\b/, 'regolare'],
    [/\balvo\s+(?:\w+\s+){0,2}?(?:chiuso|stitico)\b|\bstipsi\b|\bstitichezza\b|\bnon\s+evacua\b/, 'stitico'],
    [/\balvo\s+diarroico\b|\bdiarre\w*|\bscariche\s+(?:\w+\s+)?(?:liquide|diarroiche)\b/, 'diarroico'],
  ]);

  // ---- Caduta
  const cad = findAffirmed(text, /\b(?:cadut[oa]|caduta|cade|scivolat[oa]|inciampat[oa]|(?:trovat[oa]|rinvenut[oa])\s+(?:a\s+terra|sul\s+pavimento))\b/);
  let caduta: ParsedDiary['caduta'] = null;
  if (cad.hit) {
    const around = text.slice(Math.max(0, cad.hit.start - 40), cad.hit.end + 40);
    const when = /\b(ieri|l'altro\s*ieri|giorni\s+fa|settimana\s+scorsa|giorno\s+prima|in\s+data)\b/i.test(around)
      ? 'giorni_precedenti'
      : 'turno_attuale';
    caduta = { when, span: cad.hit };
  }

  // ---- Lesione
  const les = findAffirmed(text, /\b(?:lesion[ei](?:\s+da\s+(?:pressione|decubito))?|piag[ah][ei]?|piaga|decubit[oi]|ulcer[ae]|ferit[ae](?!\s+chirurgic)|escoriazion[ei]|LdP|LDP)\b/);
  let lesione: ParsedDiary['lesione'] = null;
  if (les.hit) {
    const sede = findKeyword(text, [
      [/\bsacral[ei]|\bsacro(?:-?coccige\w*)?\b|\bcoccige\w*/, 'sacrale'],
      [/\btallon[ei]\b/, 'tallone'],
      [/\btrocanter\w*/, 'trocantere'],
      [/\bischi\w*|\bglute\w*/, 'ischiatica'],
      [/\bgomit[oi]\b/, 'gomito'],
    ]);
    const fondo = findKeyword(text, [
      [/\bfibrin\w*|\bslough\b/, 'fibrina'],
      [/\bnecros\w*|\bnecrotic\w*|\bescara\b/, 'necrosi'],
      [/\bgranulazion\w*/, 'granulazione'],
      [/\barrossament\w*|\beritem\w*/, 'arrossamento'],
    ]);
    const st = /\bstadio\s*(IV|III|II|I|[1-4])\b/i.exec(text);
    lesione = { span: les.hit, sede, fondo, stadio: st ? st[1].toUpperCase() : null };
  }

  // ---- Sintomi / segni
  const dis = findAffirmed(text, /\b(?:dispnea|dispnoic[oa]|affann\w*|fame\s+d'aria|difficolt[àa]\s+respiratori\w*)\b/).hit;
  const sud = findAffirmed(text, /\b(?:sudorazione(?:\s+profusa)?|sudat[oa]|diaforesi|sudaticcio)\b/).hit;
  const statoMentale = findKeyword(text, [
    [/\bconfus[oa]\b|\bdisorientat[oa]\b|\bagitat[oa]\b|\bdelirium\b/, 'confuso'],
    [/\bsoporos[oa]\b|\bpoco\s+reattiv[oa]\b/, 'soporoso'],
    [/\bvigile\b|\borientat[oa]\b|\bcollaborante\b/, 'vigile_orientato'],
  ], 'priority');
  const pesoAndamento = findKeyword(text, [
    [/\bcalo\s+ponderale\b|\bperso\s+(?:\d+(?:[.,]\d)?\s*)?(?:kg|chili|peso)\b|\bpeso\s+pers[oa]\b|\bperdita\s+di\s+peso\b|\bdimagri\w*|\bha\s+perso\b/, 'calo'],
    [/\baumento\s+ponderale\b|\baumentat[oa]\s+di\s+peso\b|\bpreso\s+\d+(?:[.,]\d)?\s*kg\b/, 'aumento'],
    [/\bpeso\s+stabile\b|\bpeso\s+invariato\b/, 'stabile'],
  ]);

  return {
    peso, temperatura, temperaturaQualitativa, pa, fc, sat, glicemia, dolore,
    doloreNegato, doloreToracico, diuresi, alvo, caduta, cadutaEsclusa: cad.hit ? null : cad.negated,
    lesione, dispnea: dis, sudorazione: sud, statoMentale, pesoAndamento,
  };
}

// ---------------- Fasce cliniche (stesse soglie delle domande Jev) ----------------

export function bandTemp(t: number) {
  if (t < 35) return 'ipotermia';
  if (t <= 37.2) return 'normale';
  if (t < 38) return 'febbricola';
  if (t < 39.5) return 'febbre';
  return 'iperpiressia';
}
export function bandPA(s: number, d: number) {
  if (s >= 180 || d >= 110) return 'ipertensione_severa';
  if (s >= 140 || d >= 90) return 'ipertensione';
  if (s <= 90 || d <= 60) return 'ipotensione';
  return 'normale';
}
export function bandFC(f: number) {
  if (f < 60) return 'bradicardia';
  if (f > 100) return 'tachicardia';
  return 'normale';
}
export function bandSat(s: number) {
  if (s >= 95) return 'normale';
  if (s >= 90) return 'ridotta';
  return 'ipossiemia';
}
export function bandGlic(g: number) {
  if (g < 70) return 'ipoglicemia';
  if (g <= 140) return 'normale';
  if (g <= 250) return 'iperglicemia';
  return 'iperglicemia_severa';
}
export function bandDolore(n: number) {
  if (n <= 0) return 0;
  if (n <= 3) return 1;
  if (n <= 6) return 2;
  if (n <= 8) return 3;
  return 4;
}
