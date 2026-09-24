import REPARTO from '../data/mock-reparto-20-ospiti.json';
import { QUESTION_BY_ID, RSA_QUESTIONS } from './jev-questions';
import { buildReport, mockAnalyze, type AnalysisResult, type Answers } from './clinical';

export type Diario = { id: string; ospite_id: string; data: string; ora: string; autore: string; ruolo?: string; testo: string; tipo_template: string };
export type Ospite = { id: string; nome: string; cognome: string; eta: number; stanza: string; nucleo: number; diari: Diario[] };
export const OSPITI = REPARTO as Ospite[];
/** Copia modificabile (le modifiche fatte nella demo restano nella sessione del browser). */
export const cloneOspiti = (): Ospite[] => OSPITI.map((o) => ({ ...o, diari: o.diari.map((d) => ({ ...d })) }));
export const TESTO_ORIGINALE: Record<string, string> = Object.fromEntries(OSPITI.flatMap((o) => o.diari.map((d) => [d.id, d.testo])));

export const ts = (d: Diario) => new Date(`${d.data}T${d.ora}:00`).getTime();

/** I filtri usano come "adesso" l'ultimo diario del dataset: con dati demo fissi la finestra resta sensata. */
export const RIFERIMENTO = Math.max(...OSPITI.flatMap((o) => o.diari.map(ts)));

export type Periodo = '24h' | '48h' | '5g' | 'tutti';
export const PERIODI: { id: Periodo; label: string; ore: number | null }[] = [
  { id: '24h', label: 'Ultime 24h', ore: 24 },
  { id: '48h', label: 'Ultime 48h', ore: 48 },
  { id: '5g', label: 'Ultimi 5 giorni', ore: 120 },
  { id: 'tutti', label: 'Tutti', ore: null },
];
export function diariNelPeriodo(o: Ospite, p: Periodo): Diario[] {
  const ore = PERIODI.find((x) => x.id === p)!.ore;
  const from = ore === null ? -Infinity : RIFERIMENTO - ore * 3600_000;
  return o.diari.filter((d) => ts(d) >= from).sort((a, b) => ts(b) - ts(a));
}

// ---------------- Urgency score ----------------
/**
 * Formula richiesta, con la corrispondenza tra gli id della v1 (usati nella formula)
 * e le domande v2 in data/jev-questions-rsa.json. Se una regola ha più domande v2,
 * vale la probabilità più alta.
 */
export const REGOLE: { id_v1: string; label: string; ids: string[]; soglia: number; punti: number }[] = [
  { id_v1: 'caduta_grave_frattura', label: 'Sospetta frattura', ids: ['sospetta_frattura'], soglia: 0.85, punti: 30 },
  { id_v1: 'deterioramento_ipotensione', label: 'Early warning', ids: ['deterioramento_sepsi', 'presincope'], soglia: 0.8, punti: 25 },
  { id_v1: 'rischio_ospedalizzazione', label: 'Invio in PS', ids: ['invio_ps'], soglia: 0.8, punti: 20 },
  { id_v1: 'febbre', label: 'Febbre', ids: ['febbre_attuale'], soglia: 0.8, punti: 10 },
  { id_v1: 'delirium_confusione_acuta', label: 'Delirium', ids: ['delirium'], soglia: 0.75, punti: 10 },
  { id_v1: 'dolore', label: 'Dolore', ids: ['dolore_riferito', 'dolore_non_controllato', 'dolore_comportamentale'], soglia: 0.8, punti: 8 },
  { id_v1: 'infezione_respiratoria_dispnea', label: 'Infezione respiratoria / dispnea', ids: ['infezione_respiratoria', 'dispnea'], soglia: 0.8, punti: 8 },
];

export type Contributo = { label: string; probability: number; punti: number };
export type Punteggio = {
  score: number;
  contributi: Contributo[];   // regole scattate, in ordine di punti
  numRosso: number;           // domande sopra la propria soglia rossa
  numGiallo: number;          // domande tra soglia gialla e rossa
  stato: 'verde' | 'giallo' | 'rosso';
  motivo: string;
};

const prob = (a: Answers, id: string) => { const x = a[id]; return x && x.type === 'boolean' ? x.probability : 0; };

export function urgencyScore(testo: string, r: AnalysisResult): Punteggio {
  const a = r.answers;
  let score = 0;
  const contributi: Contributo[] = [];
  for (const g of REGOLE) {
    const p = Math.max(...g.ids.map((id) => prob(a, id)));
    if (p > g.soglia) { score += g.punti; contributi.push({ label: g.label, probability: p, punti: g.punti }); }
  }
  let numRosso = 0, numGiallo = 0;
  for (const q of RSA_QUESTIONS) {
    if (q.tier === 'sintesi' || q.tier === 'info') continue;
    const p = prob(a, q.id);
    if (p >= q.threshold_red) numRosso++;
    else if (p >= q.threshold_yellow) numGiallo++;
  }
  score += numRosso * 10 + numGiallo * 3;
  contributi.sort((x, y) => y.punti - x.punti || y.probability - x.probability);

  const rep = buildReport(testo, r);
  const altri = [...rep.segnalazioni, ...rep.eventi, ...rep.monitoraggio]
    .filter((x) => !contributi.some((c) => REGOLE.find((g) => g.label === c.label)!.ids.includes(x.q.id)))
    .slice(0, 2)
    .map((x) => `${x.q.label} ${Math.round(x.probability * 100)}%`);
  const motivo = [...contributi.map((c) => `${c.label} ${Math.round(c.probability * 100)}%`), ...altri].join(' + ') || 'Nessun rischio sopra soglia';
  return { score, contributi, numRosso, numGiallo, stato: rep.overall, motivo };
}

export type DiarioValutato = { diario: Diario; punteggio: Punteggio; mode: 'jev' | 'mock' };
export type RigaClassifica = {
  ospite: Ospite;
  migliore: DiarioValutato;          // il diario col punteggio più alto nel periodo
  ultimo: Diario;
  valutati: number;
};

/** Per ospite prende il MAX dei punteggi dei suoi diari valutati, poi ordina decrescente. */
export function classifica(ospiti: Ospite[], valutati: Map<string, DiarioValutato>, periodo: Periodo): RigaClassifica[] {
  const righe: RigaClassifica[] = [];
  for (const o of ospiti) {
    const ds = diariNelPeriodo(o, periodo);
    const vs = ds.map((d) => valutati.get(d.id)).filter(Boolean) as DiarioValutato[];
    if (!vs.length) continue;
    const migliore = vs.reduce((m, v) => (v.punteggio.score > m.punteggio.score || (v.punteggio.score === m.punteggio.score && ts(v.diario) > ts(m.diario)) ? v : m));
    righe.push({ ospite: o, migliore, ultimo: ds[0], valutati: vs.length });
  }
  const rank = { rosso: 0, giallo: 1, verde: 2 } as const;
  return righe.sort((x, y) =>
    y.migliore.punteggio.score - x.migliore.punteggio.score ||
    rank[x.migliore.punteggio.stato] - rank[y.migliore.punteggio.stato] ||
    x.ospite.stanza.localeCompare(y.ospite.stanza));
}

export const valutaLocale = (d: Diario): DiarioValutato => {
  const r = mockAnalyze(d.testo);
  return { diario: d, punteggio: urgencyScore(d.testo, r), mode: 'mock' };
};

/**
 * In modalità Jev le chiamate sono al massimo 20: prima l'ultimo diario di ogni ospite selezionato,
 * poi i diari precedenti, dal più recente, finché si arriva a 20.
 */
export const MAX_CHIAMATE_JEV = 20;
export function pianoChiamate(ospiti: Ospite[], periodo: Periodo): { scelti: Diario[]; esclusi: number } {
  const perOspite = ospiti.map((o) => diariNelPeriodo(o, periodo));
  const ordine: Diario[] = [];
  const maxLen = Math.max(0, ...perOspite.map((x) => x.length));
  for (let i = 0; i < maxLen; i++) for (const ds of perOspite) if (ds[i]) ordine.push(ds[i]);
  return { scelti: ordine.slice(0, MAX_CHIAMATE_JEV), esclusi: Math.max(0, ordine.length - MAX_CHIAMATE_JEV) };
}

export const fmtData = (d: Diario) => {
  const [y, m, g] = d.data.split('-');
  return `${g}/${m} ${d.ora}`;
};
export const labelDomanda = (id: string) => QUESTION_BY_ID[id]?.label || id;
