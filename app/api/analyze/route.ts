import { NextRequest, NextResponse } from 'next/server';
import { EHR_QUESTIONS, validateQuestions } from '../../../lib/jev-questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GATEWAY_URL = process.env.AI_GATEWAY_URL_OVERRIDE || 'https://ai-gateway.vercel.sh/v1/evaluate'; // override solo per test locali
const MODEL = 'typesafe-ai/jev';

/**
 * Opzioni privacy del Gateway.
 * - zeroDataRetention per richiesta è disponibile solo su piani Pro/Enterprise:
 *   su Hobby il Gateway risponde 403 prima del routing. Default: disattivata.
 *   Attivala con AI_GATEWAY_ZDR=true solo se il team è su Pro/Enterprise.
 * - disallowPromptTraining resta attiva di default (AI_GATEWAY_NO_TRAINING=false per spegnerla).
 */
const envFlag = (name: string, def: boolean) => {
  const v = process.env[name]?.trim().toLowerCase();
  return v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v);
};
function gatewayOptions() {
  const zdr = envFlag('AI_GATEWAY_ZDR', false);
  const noTraining = envFlag('AI_GATEWAY_NO_TRAINING', true);
  const gateway: Record<string, boolean> = {};
  if (zdr) gateway.zeroDataRetention = true;
  if (noTraining) gateway.disallowPromptTraining = true;
  return { zdr, noTraining, providerOptions: Object.keys(gateway).length ? { gateway } : undefined };
}

type ErrorCode = 'EMPTY_DIARY' | 'MISSING_KEY' | 'INVALID_SCHEMA' | 'GATEWAY_ERROR' | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE';

function fail(code: ErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

async function callGateway(apiKey: string, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const t0 = Date.now();
  try {
    const resp = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await resp.text();
    return { resp, text, latency: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

function explainStatus(status: number) {
  const { zdr, noTraining } = gatewayOptions();
  if (status === 403 && zdr) return 'Il Gateway ha rifiutato la richiesta (403) con Zero Data Retention attiva: su piano Hobby non è disponibile. Imposta AI_GATEWAY_ZDR=false (o rimuovila) e rifai il deploy.';
  if (status === 403 && noTraining) return 'Il Gateway ha rifiutato la richiesta (403). ZDR è già disattivata: prova AI_GATEWAY_NO_TRAINING=false e rifai il deploy; se persiste controlla chiave e accesso al Gateway.';
  if (status === 401 || status === 403) return 'Chiave AI Gateway non valida o senza accesso. Controlla AI_GATEWAY_API_KEY su Vercel e rifai il deploy.';
  if (status === 400) return 'Il Gateway ha rifiutato la richiesta (schema domande o body non valido).';
  if (status === 402) return 'Credito AI Gateway esaurito o billing non attivo sul team Vercel.';
  if (status === 429) return 'Troppe richieste: limite di rate del Gateway raggiunto. Riprova tra poco.';
  if (status >= 500) return 'Errore lato Gateway/provider. Riprova tra qualche secondo.';
  return `Il Gateway ha risposto ${status}.`;
}

export async function POST(req: NextRequest) {
  let diary = '';
  try {
    const body = await req.json();
    diary = typeof body?.diary === 'string' ? body.diary : '';
  } catch {
    return fail('EMPTY_DIARY', 'Body JSON non valido: atteso { "diary": "..." }', 400);
  }
  if (diary.trim().length < 3) return fail('EMPTY_DIARY', 'Il diario è vuoto.', 400);
  if (diary.length > 20_000) return fail('EMPTY_DIARY', 'Il diario è troppo lungo (max 20.000 caratteri).', 413);

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    return fail('MISSING_KEY', 'AI_GATEWAY_API_KEY non configurata. Aggiungila in Vercel → Settings → Environment Variables e rifai il deploy.', 503);
  }

  const schemaErrors = validateQuestions(EHR_QUESTIONS);
  if (schemaErrors.length) return fail('INVALID_SCHEMA', 'Schema domande Jev non valido.', 500, schemaErrors);

  const payload = {
    model: MODEL,
    state: diary,
    questions: EHR_QUESTIONS,
    ...(gatewayOptions().providerOptions ? { providerOptions: gatewayOptions().providerOptions } : {}),
  };

  let res: Awaited<ReturnType<typeof callGateway>>;
  try {
    res = await callGateway(apiKey, payload);
  } catch (e: any) {
    if (e?.name === 'AbortError') return fail('TIMEOUT', 'Il Gateway non ha risposto entro 10 secondi.', 504);
    return fail('NETWORK', `Impossibile contattare il Gateway: ${e?.message || 'errore di rete'}`, 502);
  }

  if (!res.resp.ok) {
    let details: unknown = res.text.slice(0, 2000);
    try { details = JSON.parse(res.text); } catch {}
    return fail('GATEWAY_ERROR', explainStatus(res.resp.status), res.resp.status, details);
  }

  let data: any;
  try { data = JSON.parse(res.text); } catch {
    return fail('BAD_RESPONSE', 'Risposta del Gateway non in formato JSON.', 502, res.text.slice(0, 1000));
  }
  if (!data || typeof data.answers !== 'object') {
    return fail('BAD_RESPONSE', 'Risposta del Gateway senza campo "answers".', 502, data);
  }

  const confidence =
    data?.providerMetadata?.typesafe?.confidence ||
    data?.provider_metadata?.typesafe?.confidence ||
    {};

  return NextResponse.json({
    mode: 'jev',
    model: data.model || MODEL,
    gatewayLatencyMs: res.latency,
    answers: data.answers,
    confidence,
    usage: data.usage || null,
    cost: data?.providerMetadata?.gateway?.cost ?? null,
    raw: data,
  });
}

/**
 * GET /api/analyze            -> stato configurazione (senza chiamare il Gateway)
 * GET /api/analyze?probe=1    -> invia l'esempio minimo della documentazione Vercel,
 *                                con le stesse providerOptions della chiamata reale
 *                                (1 domanda boolean): utile per separare problemi di chiave
 *                                da problemi di schema.
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const schemaErrors = validateQuestions(EHR_QUESTIONS);
  const status = {
    keyConfigured: !!apiKey,
    keyPrefix: apiKey ? apiKey.slice(0, 4) + '…' : null,
    model: MODEL,
    endpoint: GATEWAY_URL,
    questions: Object.keys(EHR_QUESTIONS).length,
    zeroDataRetention: gatewayOptions().zdr,
    disallowPromptTraining: gatewayOptions().noTraining,
    schemaErrors,
  };
  if (req.nextUrl.searchParams.get('probe') !== '1' || !apiKey) return NextResponse.json(status);

  try {
    const r = await callGateway(apiKey, {
      model: MODEL,
      state: 'The support agent issued a full refund to the customer.',
      questions: { refunded: { type: 'boolean', instructions: 'Was a refund issued?' } },
      ...(gatewayOptions().providerOptions ? { providerOptions: gatewayOptions().providerOptions } : {}),
    });
    let body: unknown = r.text.slice(0, 2000);
    try { body = JSON.parse(r.text); } catch {}
    return NextResponse.json({ ...status, probe: { status: r.resp.status, latencyMs: r.latency, body } });
  } catch (e: any) {
    return NextResponse.json({ ...status, probe: { error: e?.message || String(e) } }, { status: 502 });
  }
}
