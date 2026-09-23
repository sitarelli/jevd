import { EHR_QUESTIONS, type QuestionId } from './jev-questions';
import {
  parseDiary, bandTemp, bandPA, bandFC, bandSat, bandGlic, bandDolore,
  type ParsedDiary, type Span,
} from './parser';

// ---------------- Forma delle risposte Jev (come da docs Vercel) ----------------
export type BooleanAnswer = { type: 'boolean'; probability: number };
export type ChoiceAnswer = { type: 'choice'; choice: string; probabilities?: Record<string, number> };
export type ScoreAnswer = { type: 'score'; score: number; probabilities?: Record<string, number> };
export type JevAnswer = BooleanAnswer | ChoiceAnswer | ScoreAnswer;
export type Answers = Partial<Record<QuestionId, JevAnswer>>;

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

// ---------------- Mock: risposte "alla Jev" costruite dal parser ----------------
function choiceMock(id: QuestionId, selected: string, p = 0.9): ChoiceAnswer {
  const q = EHR_QUESTIONS[id] as { criteria: Record<string, string> };
  const keys = Object.keys(q.criteria);
  const rest = (1 - p) / Math.max(1, keys.length - 1);
  const probabilities: Record<string, number> = {};
  for (const k of keys) probabilities[k] = +(k === selected ? p : rest).toFixed(2);
  return { type: 'choice', choice: selected, probabilities };
}
const boolMock = (v: boolean, strength = 0.94): BooleanAnswer => ({
  type: 'boolean',
  probability: v ? strength : +(1 - strength).toFixed(2),
});

export function mockAnalyze(diary: string): AnalysisResult {
  const p = parseDiary(diary);
  const a: Answers = {};
  a.caduta = boolMock(!!p.caduta, p.cadutaEsclusa ? 0.97 : 0.93);
  a.caduta_quando = choiceMock('caduta_quando', p.caduta ? p.caduta.when : 'nessuna');
  a.lesione = boolMock(!!p.lesione);
  a.lesione_sede = choiceMock('lesione_sede', p.lesione ? p.lesione.sede?.value || 'altro' : 'nessuna', p.lesione?.sede ? 0.88 : 0.7);
  a.lesione_fondo = choiceMock('lesione_fondo', p.lesione?.fondo?.value || 'non_indicato', 0.82);
  a.temperatura = choiceMock(
    'temperatura',
    p.temperatura ? bandTemp(p.temperatura.value) : p.temperaturaQualitativa === 'apiretico' ? 'normale' : p.temperaturaQualitativa === 'febbrile' ? 'febbricola' : 'non_rilevata',
  );
  a.pressione = choiceMock('pressione', p.pa ? bandPA(p.pa.s, p.pa.d) : 'non_rilevata');
  a.frequenza_cardiaca = choiceMock('frequenza_cardiaca', p.fc ? bandFC(p.fc.value) : 'non_rilevata');
  a.saturazione = choiceMock('saturazione', p.sat ? bandSat(p.sat.value) : 'non_rilevata');
  a.glicemia = choiceMock('glicemia', p.glicemia ? bandGlic(p.glicemia.value) : 'non_rilevata');
  a.peso_andamento = choiceMock('peso_andamento', p.pesoAndamento?.value || 'non_indicato', 0.8);
  const hasPain = !!p.dolore && p.dolore.value > 0 && !p.doloreNegato;
  a.dolore = boolMock(hasPain || !!p.doloreToracico);
  if (p.dolore) {
    const lvl = bandDolore(p.dolore.value);
    const probabilities: Record<string, number> = { '0': 0.02, '1': 0.02, '2': 0.02, '3': 0.02, '4': 0.02 };
    probabilities[String(lvl)] = 0.92;
    a.dolore_intensita = { type: 'score', score: lvl, probabilities };
  } else {
    a.dolore_intensita = { type: 'score', score: 0, probabilities: { '0': 0.9, '1': 0.05, '2': 0.03, '3': 0.01, '4': 0.01 } };
  }
  a.dolore_toracico = boolMock(!!p.doloreToracico);
  a.diuresi = choiceMock('diuresi', p.diuresi && p.diuresi.value !== 'volume registrato' ? p.diuresi.value : p.diuresi ? 'regolare' : 'non_indicata', 0.85);
  a.alvo = choiceMock('alvo', p.alvo?.value || 'non_indicato', 0.85);
  a.dispnea = boolMock(!!p.dispnea);
  a.sudorazione = boolMock(!!p.sudorazione);
  a.stato_mentale = choiceMock('stato_mentale', p.statoMentale?.value || 'non_indicato', 0.84);

  const confidence: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    if (v && v.type !== 'boolean') confidence[k] = v.type === 'choice' ? 0.86 : 0.88;
  }
  return { mode: 'mock', model: 'Mock locale (parser regex)', gatewayLatencyMs: null, answers: a, confidence };
}

// ---------------- Report per la UI ----------------
export type Status = 'ok' | 'warn' | 'crit' | 'none';

export type JevReading = {
  label: string;          // es. "febbre", "sì", "moderato"
  probability: number;    // probabilità dell'esito scelto
  confidence: number | null; // concentrazione della distribuzione (solo choice/score)
  agrees: boolean | null; // concorda con il valore letto dal parser?
};

export type VitalRow = {
  id: string;
  label: string;
  value: string | null;
  unit: string;
  status: Status;
  bandLabel: string | null;
  snippet: Span | null;
  jev: JevReading | null;
};

export type EventRow = {
  id: 'caduta' | 'lesione';
  detected: boolean;
  probability: number;
  detail: string[];
  snippet: Span | null;
  href: string;
  cta: string;
};

export type SignRow = { id: string; label: string; value: string; status: Status; snippet: Span | null; jev: JevReading | null };

export type Alert = { level: 'warn' | 'crit'; text: string };

export type Report = {
  vitals: VitalRow[];
  events: EventRow[];
  signs: SignRow[];
  alerts: Alert[];
  spans: (Span & { tone: Status | 'event' })[];
};

const BAND_LABEL: Record<string, string> = {
  ipotermia: 'Ipotermia', normale: 'Nella norma', febbricola: 'Febbricola', febbre: 'Febbre', iperpiressia: 'Iperpiressia',
  ipotensione: 'Ipotensione', ipertensione: 'Ipertensione', ipertensione_severa: 'Ipertensione severa',
  bradicardia: 'Bradicardia', tachicardia: 'Tachicardia', ridotta: 'Ridotta', ipossiemia: 'Ipossiemia',
  ipoglicemia: 'Ipoglicemia', iperglicemia: 'Iperglicemia', iperglicemia_severa: 'Iperglicemia severa',
  non_rilevata: 'Non rilevata', non_indicato: 'Non indicato', non_indicata: 'Non indicata',
  stabile: 'Stabile', calo: 'In calo', aumento: 'In aumento',
  regolare: 'Regolare', assente: 'Assente', aumentata: 'Aumentata', stitico: 'Stitico', diarroico: 'Diarroico',
  vigile_orientato: 'Vigile e orientato', confuso: 'Confuso / disorientato', soporoso: 'Soporoso',
  sacrale: 'Sacrale', tallone: 'Tallone', trocantere: 'Trocantere', ischiatica: 'Ischiatica', gomito: 'Gomito', altro: 'Altra sede', nessuna: 'Nessuna',
  arrossamento: 'Arrossamento', granulazione: 'Granulazione', fibrina: 'Fibrina', necrosi: 'Necrosi',
  turno_attuale: 'Nel turno / stanotte', giorni_precedenti: 'Nei giorni precedenti',
};
export const bandLabel = (k: string | null | undefined) => (k ? BAND_LABEL[k] || k.replace(/_/g, ' ') : null);

const STATUS_OF: Record<string, Status> = {
  normale: 'ok', febbricola: 'warn', febbre: 'warn', iperpiressia: 'crit', ipotermia: 'crit',
  ipotensione: 'warn', ipertensione: 'warn', ipertensione_severa: 'crit',
  bradicardia: 'warn', tachicardia: 'warn', ridotta: 'warn', ipossiemia: 'crit',
  ipoglicemia: 'crit', iperglicemia: 'warn', iperglicemia_severa: 'crit',
};

const PAIN_LEVELS = ['Assente', 'Lieve', 'Moderato', 'Severo', 'Insopportabile'];

function readChoice(a: Answers, conf: Record<string, number>, id: QuestionId, localBand: string | null): JevReading | null {
  const ans = a[id];
  if (!ans || ans.type !== 'choice') return null;
  const probability = ans.probabilities?.[ans.choice] ?? NaN;
  return {
    label: bandLabel(ans.choice) || ans.choice,
    probability,
    confidence: conf[id] ?? null,
    agrees: localBand ? localBand === ans.choice : null,
  };
}
function readBool(a: Answers, id: QuestionId, local: boolean | null): JevReading | null {
  const ans = a[id];
  if (!ans || ans.type !== 'boolean') return null;
  const yes = ans.probability >= 0.5;
  return {
    label: yes ? 'Sì' : 'No',
    probability: yes ? ans.probability : 1 - ans.probability,
    confidence: null,
    agrees: local === null ? null : local === yes,
  };
}
const pOf = (a: Answers, id: QuestionId) => {
  const x = a[id];
  return x && x.type === 'boolean' ? x.probability : 0;
};
const fmt = (n: number, d = 1) => (Number.isInteger(n) ? String(n) : n.toFixed(d).replace('.', ','));

export function buildReport(diary: string, result: AnalysisResult): Report {
  const p: ParsedDiary = parseDiary(diary);
  const a = result.answers;
  const c = result.confidence || {};
  const spans: Report['spans'] = [];
  const pushSpan = (s: Span | null | undefined, tone: Status | 'event') => { if (s) spans.push({ ...s, tone }); };

  const vital = (
    id: string, label: string, unit: string, qid: QuestionId | null,
    value: string | null, band: string | null, snippet: Span | null,
  ): VitalRow => {
    const jev = qid ? readChoice(a, c, qid, band) : null;
    const effectiveBand = band || (jev && a[qid!]?.type === 'choice' ? (a[qid!] as ChoiceAnswer).choice : null);
    const status: Status = value || (effectiveBand && !/^non_/.test(effectiveBand))
      ? STATUS_OF[effectiveBand || ''] || 'ok'
      : 'none';
    pushSpan(snippet, status);
    return { id, label, value, unit, status, bandLabel: bandLabel(effectiveBand), snippet, jev };
  };

  const vitals: VitalRow[] = [
    vital('pa', 'Pressione arteriosa', 'mmHg', 'pressione', p.pa ? `${p.pa.s}/${p.pa.d}` : null, p.pa ? bandPA(p.pa.s, p.pa.d) : null, p.pa?.span || null),
    vital('fc', 'Frequenza cardiaca', 'bpm', 'frequenza_cardiaca', p.fc ? fmt(p.fc.value) : null, p.fc ? bandFC(p.fc.value) : null, p.fc?.span || null),
    vital('sat', 'Saturazione O₂', '%', 'saturazione', p.sat ? fmt(p.sat.value) : null, p.sat ? bandSat(p.sat.value) : null, p.sat?.span || null),
    vital('temp', 'Temperatura', '°C', 'temperatura', p.temperatura ? fmt(p.temperatura.value) : null, p.temperatura ? bandTemp(p.temperatura.value) : p.temperaturaQualitativa === 'apiretico' ? 'normale' : null, p.temperatura?.span || null),
    vital('glic', 'Glicemia', 'mg/dL', 'glicemia', p.glicemia ? fmt(p.glicemia.value) : null, p.glicemia ? bandGlic(p.glicemia.value) : null, p.glicemia?.span || null),
    (() => {
      const row = vital('peso', 'Peso', 'kg', 'peso_andamento', p.peso ? fmt(p.peso.value) : null, p.pesoAndamento?.value || null, p.peso?.span || null);
      if (row.status === 'none' && row.value === null) return row;
      row.status = p.pesoAndamento?.value === 'calo' || (a.peso_andamento as ChoiceAnswer)?.choice === 'calo' ? 'warn' : row.value ? 'ok' : row.status;
      if (!row.bandLabel || /^Non /.test(row.bandLabel)) row.bandLabel = 'Registrato';
      pushSpan(p.pesoAndamento?.span, row.status);
      return row;
    })(),
  ];

  if (!p.temperatura && p.temperaturaQualitativa === 'apiretico') vitals[3].bandLabel = 'Apiretico';

  // Dolore (score): Jev fornisce la fascia, il parser il numero esatto
  {
    const s = a.dolore_intensita as ScoreAnswer | undefined;
    const painBool = pOf(a, 'dolore');
    const lvlLocal = p.dolore ? bandDolore(p.dolore.value) : null;
    let jev: JevReading | null = null;
    if (s && s.type === 'score' && (painBool >= 0.5 || p.dolore)) {
      const idx = Math.max(0, Math.min(4, Math.round(s.score)));
      jev = {
        label: PAIN_LEVELS[idx],
        probability: s.probabilities?.[String(idx)] ?? NaN,
        confidence: c.dolore_intensita ?? null,
        agrees: lvlLocal === null ? null : lvlLocal === idx,
      };
    }
    const value = p.dolore ? String(p.dolore.value) : p.doloreNegato ? '0' : null;
    const status: Status = p.dolore ? (p.dolore.value >= 7 ? 'crit' : p.dolore.value >= 4 ? 'warn' : 'ok') : painBool >= 0.5 ? 'warn' : p.doloreNegato ? 'ok' : 'none';
    pushSpan(p.dolore?.span || p.doloreNegato, status);
    vitals.push({ id: 'dolore', label: 'Dolore NRS', value, unit: '/10', status, bandLabel: p.dolore ? PAIN_LEVELS[bandDolore(p.dolore.value)] : p.doloreNegato ? 'Assente' : jev?.label || null, snippet: p.dolore?.span || p.doloreNegato, jev });
  }

  // ---- Eventi
  const pCad = pOf(a, 'caduta');
  const quando = a.caduta_quando as ChoiceAnswer | undefined;
  const cadDetected = result.mode === 'jev' ? pCad >= 0.5 : !!p.caduta;
  const pLes = pOf(a, 'lesione');
  const sede = a.lesione_sede as ChoiceAnswer | undefined;
  const fondo = a.lesione_fondo as ChoiceAnswer | undefined;
  const lesDetected = result.mode === 'jev' ? pLes >= 0.5 : !!p.lesione;
  const sedeKey = sede && sede.choice !== 'nessuna' ? sede.choice : p.lesione?.sede?.value || null;
  const fondoKey = fondo && fondo.choice !== 'non_indicato' ? fondo.choice : p.lesione?.fondo?.value || null;

  const events: EventRow[] = [
    {
      id: 'caduta',
      detected: cadDetected,
      probability: pCad,
      detail: cadDetected
        ? [quando && quando.choice !== 'nessuna' ? `Quando: ${bandLabel(quando.choice)}` : p.caduta ? `Quando: ${bandLabel(p.caduta.when)}` : '']
            .filter(Boolean)
        : p.cadutaEsclusa ? ['Il diario esclude cadute'] : [],
      snippet: p.caduta?.span || p.cadutaEsclusa,
      href: `/scheda-cadute?source=jev${quando?.choice && quando.choice !== 'nessuna' ? `&quando=${quando.choice}` : ''}`,
      cta: 'Apri scheda cadute',
    },
    {
      id: 'lesione',
      detected: lesDetected,
      probability: pLes,
      detail: lesDetected
        ? [
            sedeKey ? `Sede: ${bandLabel(sedeKey)}` : 'Sede non indicata',
            fondoKey ? `Fondo: ${bandLabel(fondoKey)}` : '',
            p.lesione?.stadio ? `Stadio ${p.lesione.stadio}` : '',
          ].filter(Boolean)
        : [],
      snippet: p.lesione?.span || null,
      href: `/scheda-lesioni?source=jev${sedeKey ? `&sede=${sedeKey}` : ''}${fondoKey ? `&fondo=${fondoKey}` : ''}${p.lesione?.stadio ? `&stadio=${p.lesione.stadio}` : ''}`,
      cta: 'Apri scheda lesioni',
    },
  ];
  if (cadDetected) pushSpan(p.caduta?.span, 'event');
  if (lesDetected) { pushSpan(p.lesione?.span, 'event'); pushSpan(p.lesione?.sede?.span, 'event'); pushSpan(p.lesione?.fondo?.span, 'event'); }

  // ---- Segni, eliminazione, stato mentale
  const signs: SignRow[] = [];
  const addBoolSign = (id: QuestionId, label: string, local: Span | null, tone: Status) => {
    const jev = readBool(a, id, !!local);
    const yes = result.mode === 'jev' ? pOf(a, id) >= 0.5 : !!local;
    signs.push({ id, label, value: yes ? 'Presente' : 'Non riportata', status: yes ? tone : 'none', snippet: local, jev });
    if (yes) pushSpan(local, tone);
  };
  addBoolSign('dispnea', 'Dispnea', p.dispnea, 'crit');
  addBoolSign('dolore_toracico', 'Dolore toracico', p.doloreToracico, 'crit');
  addBoolSign('sudorazione', 'Sudorazione', p.sudorazione, 'warn');
  const addChoiceSign = (id: QuestionId, label: string, local: { value: string; span: Span } | null, statusFor: (k: string) => Status) => {
    const jev = readChoice(a, c, id, local?.value || null);
    const ans = a[id] as ChoiceAnswer | undefined;
    const key = (result.mode === 'jev' ? ans?.choice : local?.value) || local?.value || ans?.choice || 'non_indicato';
    const st = /^non_/.test(key) ? 'none' : statusFor(key);
    signs.push({ id, label, value: bandLabel(key) || '—', status: st, snippet: local?.span || null, jev });
    pushSpan(local?.span, st);
  };
  addChoiceSign('stato_mentale', 'Stato mentale', p.statoMentale, (k) => (k === 'vigile_orientato' ? 'ok' : k === 'soporoso' ? 'crit' : 'warn'));
  addChoiceSign('diuresi', 'Diuresi', p.diuresi ? { value: p.diuresi.value === 'volume registrato' ? 'regolare' : p.diuresi.value, span: p.diuresi.span } : null, (k) => (k === 'regolare' ? 'ok' : k === 'assente' ? 'crit' : 'warn'));
  if (p.diuresi?.ml) signs[signs.length - 1].value += ` (${p.diuresi.ml} ml)`;
  addChoiceSign('alvo', 'Alvo', p.alvo, (k) => (k === 'regolare' ? 'ok' : 'warn'));

  // ---- Segnalazioni (regole demo, non validate clinicamente)
  const alerts: Alert[] = [];
  if (p.sat && p.sat.value < 90) alerts.push({ level: 'crit', text: `SpO₂ ${p.sat.value}%: ipossiemia` });
  if (p.pa && (p.pa.s >= 180 || p.pa.d >= 110)) alerts.push({ level: 'crit', text: `PA ${p.pa.s}/${p.pa.d}: valori severi` });
  else if (p.pa && p.pa.s < 90) alerts.push({ level: 'crit', text: `PA ${p.pa.s}/${p.pa.d}: ipotensione` });
  if (p.fc && (p.fc.value > 120 || p.fc.value < 45)) alerts.push({ level: 'crit', text: `FC ${p.fc.value} bpm fuori soglia` });
  if (p.temperatura && (p.temperatura.value >= 39.5 || p.temperatura.value < 35)) alerts.push({ level: 'crit', text: `Temperatura ${fmt(p.temperatura.value)} °C` });
  if (p.glicemia && (p.glicemia.value > 250 || p.glicemia.value < 70)) alerts.push({ level: 'crit', text: `Glicemia ${p.glicemia.value} mg/dL` });
  if (signs.find((s) => s.id === 'dolore_toracico')?.status === 'crit') alerts.push({ level: 'crit', text: 'Dolore toracico riferito' });
  if (p.dolore && p.dolore.value >= 7) alerts.push({ level: 'warn', text: `Dolore NRS ${p.dolore.value}/10` });
  if (signs.find((s) => s.id === 'dispnea')?.status === 'crit') alerts.push({ level: 'warn', text: 'Dispnea riportata' });
  if (cadDetected) alerts.push({ level: 'warn', text: 'Caduta: compilare la scheda evento' });
  const sm = signs.find((s) => s.id === 'stato_mentale');
  if (sm && sm.status !== 'ok' && sm.status !== 'none') alerts.push({ level: 'warn', text: `Stato mentale: ${sm.value.toLowerCase()}` });

  return { vitals, events, signs, alerts, spans };
}

// ---------------- Esempi pronti ----------------
export const ESEMPI: { id: string; label: string; text: string }[] = [
  {
    id: 'caduta-febbre',
    label: 'Caduta notturna, febbre, lesione sacrale',
    text: 'Paziente 82 anni, stanotte verso le 3 caduta in bagno, riferisce di essere scivolata. Rialzata con aiuto, nessun trauma cranico apparente. Peso 72 kg, febbre 37,8 °C, PA 145/90 mmHg, FC 92 bpm, satura 94% in aria ambiente. Lesione da pressione sacrale stadio 1, arrossamento non sbiancante. Dolore 4/10 all\'anca sinistra.',
  },
  {
    id: 'controllo',
    label: 'Controllo standard giornaliero',
    text: 'Controllo giornaliero: paziente vigile e orientato, collaborante. Peso 68,5 kg, temperatura 36,6 °C, PA 130 su 80, FC 78, SpO2 98%, glicemia a digiuno 110 mg/dL. Nega dolore. Diuresi regolare, alvo regolare. Non cadute nel turno.',
  },
  {
    id: 'tallone',
    label: 'Piaga del tallone con fibrina',
    text: 'Paziente allettato, piaga da decubito al tallone destro stadio 3 con fibrina sul fondo, essudato moderato, medicata con idrogel. Peso 61 kg, febbricola 37,2, PA 118/70, FC 88, sat 96%. Dolore 3/10 durante la medicazione. Nessuna caduta oggi.',
  },
  {
    id: 'scompenso',
    label: 'Scompenso: PA 170/95, sat 89%',
    text: 'Ore 22: paziente dispnoico a riposo, ortopnoico, edemi declivi agli arti inferiori. PA 170/95, FC 110 irregolare, sat 89% in aria, portata a 93% con O2 2 L/min. Apiretico. Diuresi ridotta, circa 300 ml nelle ultime 8 ore. Avvisato medico di guardia.',
  },
  {
    id: 'diabete',
    label: 'Diabete: glicemia 285, sudorazione',
    text: 'Paziente diabetico tipo 2, riferisce sete intensa e astenia, cute sudata, sudorazione profusa. Stick glicemico 285 mg/dL alle 11. PA 150/85, FC 96, temperatura 36,9 °C, SpO2 97%. Vigile, lievemente rallentato. Somministrata insulina da schema, ricontrollo tra 2 ore.',
  },
  {
    id: 'toracico',
    label: 'Dolore toracico 8/10',
    text: 'Alle 6:40 paziente riferisce dolore toracico retrosternale 8/10 irradiato al braccio sinistro, insorto a riposo. Sudato, pallido, lievemente dispnoico. PA 160/100, FC 104, sat 95%, temperatura 36,4. Eseguito ECG, chiamato medico di guardia.',
  },
  {
    id: 'confuso',
    label: 'Paziente confuso, caduta ieri, calo di peso',
    text: 'Paziente confuso e disorientato nel tempo, agitato nel pomeriggio. Ieri pomeriggio caduta accidentale accanto al letto, ematoma alla fronte, già valutato. Peso 58 kg, ha perso 4 kg nell\'ultimo mese. PA 105/65, FC 84, temperatura 36,8 °C, SpO2 95%. Alvo chiuso da 3 giorni.',
  },
  {
    id: 'post-op',
    label: 'Post-operatorio: ipotensione e oliguria',
    text: 'Primo giorno post intervento di protesi d\'anca. Paziente soporoso ma risvegliabile. PA 88/55, FC 118, temperatura 38,4 °C, sat 93% in O2. Diuresi scarsa, 150 ml in 6 ore da catetere. Medicazione della ferita chirurgica pulita e asciutta. Dolore NRS 6 alla mobilizzazione.',
  },
];
