import { NextRequest, NextResponse } from 'next/server';
import { EHR_QUESTIONS } from './jev-questions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { diary } = await req.json();
    if (!diary || diary.trim().length < 3) {
      return NextResponse.json({ error: 'Diario vuoto' }, { status: 400 });
    }
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Manca AI_GATEWAY_API_KEY in Environment Variables su Vercel' }, { status: 500 });
    }
    const start = Date.now();
    const resp = await fetch('https://ai-gateway.vercel.sh/v1/evaluate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'typesafe-ai/jev',
        state: diary,
        questions: EHR_QUESTIONS,
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return NextResponse.json({ error: `Gateway ${resp.status}`, details: txt.slice(0,1000) }, { status: resp.status });
    }
    const data = await resp.json();
    const latency = Date.now() - start;
    return NextResponse.json({ latency, model: 'typesafe-ai/jev via Vercel AI Gateway', raw: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Errore' }, { status: 500 });
  }
}
