/**
 * Domande Jev per RSA: la fonte è data/jev-questions-rsa.json (modificabile senza toccare il codice).
 *
 * Schema Vercel AI Gateway /v1/evaluate:
 *   boolean -> { type: 'boolean', instructions, criteria?: { true, false } }
 * Il campo `question` del JSON viene inviato come `instructions`.
 * Mai inviare `question`, `options`, `min`, `max`: il Gateway risponde 400.
 */
import RSA from '../data/jev-questions-rsa.json';

export type Tier = 'urgente' | 'evento' | 'monitoraggio' | 'info' | 'sintesi';
export type SchedaId =
  | 'cadute' | 'lesioni' | 'contenzione' | 'nutrizionale' | 'news' | 'infezioni'
  | 'dolore' | 'delirium' | 'bpsd' | 'pai' | 'trasferimento';

export type RsaQuestion = {
  id: string;
  label: string;
  category: string;
  tier: Tier;
  question: string;
  criteria?: { true: string; false: string };
  keywords: string[];
  threshold_yellow: number;
  threshold_red: number;
  scale: string;
  ministry_indicator: string;
  literature: string;
  trigger: string;
  scheda: SchedaId | null;
  actions: string[];
  mock?: { p1?: number; p2?: number; p3?: number };
};

export const RSA_QUESTIONS = RSA as RsaQuestion[];
export const QUESTION_BY_ID: Record<string, RsaQuestion> = Object.fromEntries(RSA_QUESTIONS.map((q) => [q.id, q]));
export type QuestionId = string;

export type BooleanQuestion = { type: 'boolean'; instructions: string; criteria?: { true: string; false: string } };
export type ChoiceQuestion = { type: 'choice'; instructions: string; criteria: Record<string, string> };
export type ScoreQuestion = { type: 'score'; instructions: string; criteria: string[] };
export type JevQuestion = BooleanQuestion | ChoiceQuestion | ScoreQuestion;

/** Payload `questions` per il Gateway, costruito dal JSON. */
export const EHR_QUESTIONS: Record<string, JevQuestion> = Object.fromEntries(
  RSA_QUESTIONS.map((q) => [
    q.id,
    q.criteria
      ? { type: 'boolean', instructions: q.question, criteria: { true: q.criteria.true, false: q.criteria.false } }
      : { type: 'boolean', instructions: q.question },
  ]),
);

/** Controlli sul JSON (soglie, id, keywords) e sullo schema del Gateway. */
export function validateQuestions(questions: Record<string, JevQuestion> = EHR_QUESTIONS): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const q of RSA_QUESTIONS) {
    if (seen.has(q.id)) errors.push(`${q.id}: id duplicato`);
    seen.add(q.id);
    if (!(q.threshold_yellow > 0 && q.threshold_yellow < q.threshold_red && q.threshold_red <= 1)) {
      errors.push(`${q.id}: soglie non valide (serve 0 < giallo < rosso <= 1)`);
    }
    if (!q.keywords?.length) errors.push(`${q.id}: keywords vuote (servono alla simulazione)`);
  }
  for (const [id, q] of Object.entries(questions)) {
    const anyQ = q as any;
    for (const legacy of ['question', 'options', 'min', 'max', 'description']) {
      if (legacy in anyQ) errors.push(`${id}: campo "${legacy}" non previsto dallo schema Gateway`);
    }
    if (!['boolean', 'choice', 'score'].includes(anyQ.type)) errors.push(`${id}: type "${anyQ.type}" non valido`);
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) errors.push(`${id}: instructions mancante`);
    if (q.type === 'choice') {
      const n = Object.keys(q.criteria || {}).length;
      if (n < 2 || n > 255) errors.push(`${id}: choice richiede 2-255 opzioni`);
    }
    if (q.type === 'score') {
      const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
      if (n < 2 || n > 10) errors.push(`${id}: score richiede 2-10 livelli`);
    }
  }
  return errors;
}
