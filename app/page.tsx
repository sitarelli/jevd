'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESEMPI, mockAnalyze, buildReport, type AnalysisResult, type Report, type Esempio } from '../lib/clinical';
import type { Span } from '../lib/parser';
import { useDictation } from '../lib/useDictation';
import { ReportView, EvidenceText } from '../components/ReportView';
import { CompareView } from '../components/CompareView';

type Mode = 'mock' | 'jev';
type ApiError = { code: string; message: string; details?: unknown; status?: number };
type ServerStatus = { keyConfigured: boolean; questions: number; schemaErrors: string[] } | null;

export default function Page() {
  const [diary, setDiary] = useState(ESEMPI[0].text);
  const [compare, setCompare] = useState<{ ex: Esempio; report: Report }[] | null>(null);
  const [analyzedText, setAnalyzedText] = useState('');
  const [mode, setMode] = useState<Mode>('mock');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [clientMs, setClientMs] = useState<number | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [server, setServer] = useState<ServerStatus>(null);
  const [focus, setFocus] = useState<Span | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [compareMock, setCompareMock] = useState(true);
  const [gruppo, setGruppo] = useState<'alert' | 'trappola'>('alert');
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Stato configurazione server (chiave presente?) senza chiamare il Gateway
  useEffect(() => {
    fetch('/api/analyze', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => setServer(s))
      .catch(() => setServer(null));
  }, []);

  const appendDictation = useCallback((t: string) => {
    if (!t) return;
    setDiary((d) => {
      const sep = !d || /[\s\n]$/.test(d) ? '' : ' ';
      return d + sep + t.charAt(0).toUpperCase() + t.slice(1);
    });
  }, []);
  const mic = useDictation(appendDictation);

  const runMock = useCallback(async (text: string, t0: number) => {
    await new Promise((r) => setTimeout(r, 120));
    const r = mockAnalyze(text);
    setResult(r);
    setClientMs(Date.now() - t0);
  }, []);

  const analyze = useCallback(async (forceMode?: Mode) => {
    const m = forceMode || mode;
    const text = diary.trim();
    if (text.length < 3) { setError({ code: 'EMPTY_DIARY', message: 'Scrivi o detta il diario prima di analizzarlo.' }); return; }
    if (mic.state === 'listening') mic.stop();
    setLoading(true); setError(null); setNotice(null); setShowRaw(false); setCompare(null);
    setAnalyzedText(diary);
    const t0 = Date.now();
    try {
      if (m === 'mock') { await runMock(diary, t0); return; }
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diary }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const e: ApiError = json?.error && typeof json.error === 'object'
          ? { ...json.error, status: res.status }
          : { code: 'HTTP_' + res.status, message: typeof json?.error === 'string' ? json.error : `Errore ${res.status}`, status: res.status };
        if (e.code === 'MISSING_KEY') {
          setNotice('Chiave AI Gateway non configurata sul server: risultato calcolato con la simulazione locale.');
          await runMock(diary, t0);
          return;
        }
        setResult(null);
        setError(e);
        return;
      }
      setResult(json as AnalysisResult);
      setClientMs(Date.now() - t0);
    } catch (e: any) {
      setResult(null);
      setError({ code: 'NETWORK', message: `Impossibile raggiungere /api/analyze: ${e?.message || 'errore di rete'}` });
    } finally {
      setLoading(false);
    }
  }, [diary, mode, mic, runMock]);

  // Confronto A/B: stessi numeri, contesto diverso
  const runCompare = useCallback(async () => {
    const pair = ESEMPI.filter((e) => e.id === 'vitali-a' || e.id === 'vitali-b');
    if (mic.state === 'listening') mic.stop();
    setLoading(true); setError(null); setNotice(null);
    try {
      let results: AnalysisResult[];
      if (mode === 'mock') {
        await new Promise((r) => setTimeout(r, 120));
        results = pair.map((e) => mockAnalyze(e.text));
      } else {
        const res = await Promise.all(pair.map((e) => fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diary: e.text }) }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => null) }))));
        const bad = res.find((r) => !r.ok);
        if (bad) {
          if (bad.json?.error?.code === 'MISSING_KEY') {
            setNotice('Chiave AI Gateway non configurata sul server: confronto calcolato con la simulazione locale.');
            results = pair.map((e) => mockAnalyze(e.text));
          } else {
            setError({ code: bad.json?.error?.code || 'HTTP', message: bad.json?.error?.message || 'Errore durante il confronto', details: bad.json?.error?.details });
            return;
          }
        } else results = res.map((r) => r.json as AnalysisResult);
      }
      setCompare(pair.map((ex, i) => ({ ex, report: buildReport(ex.text, results[i]) })));
      setCompareMock(results[0].mode === 'mock');
    } finally {
      setLoading(false);
    }
  }, [mode, mic]);

  // Ctrl/Cmd + Invio per analizzare
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
  };

  const report = useMemo(() => (result ? buildReport(analyzedText, result) : null), [result, analyzedText]);
  const isMock = result?.mode === 'mock';
  const stale = !!result && analyzedText !== diary;
  const latency = result?.gatewayLatencyMs ?? clientMs;
  const listening = mic.state === 'listening' || mic.state === 'starting';

  return (
    <div className="min-h-screen">
      {/* Barra applicativa */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-900 text-white" aria-hidden>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-900">Diario clinico</h1>
              <p className="text-xs text-slate-500">RSA, nucleo 2, camera 12 (ospite dimostrativo)</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span className="hidden text-xs text-slate-500 md:inline">
              {server == null ? 'Verifica configurazione…' : server.keyConfigured ? 'Chiave Gateway configurata' : 'Chiave Gateway assente: disponibile solo la simulazione'}
            </span>
            <div role="radiogroup" aria-label="Motore di estrazione" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {([['mock', 'Simulazione locale'], ['jev', 'Jev via Gateway']] as [Mode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-3 py-1.5 font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
        {/* Colonna diario */}
        <section className="lg:col-span-5">
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-8.5rem)] lg:min-h-[500px]">
            <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-slate-900">Diario assistenziale</h2>
              <p className="text-xs text-slate-500">Scrivi o detta liberamente: il parser legge i numeri, Jev valuta i rischi.</p>
            </div>

            <div className="shrink-0 px-4 pt-2.5">
              <div role="tablist" aria-label="Gruppi di esempi" className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                {([['alert', 'Demo alert (1-8)'], ['trappola', 'Jev vs parser (A-H)']] as const).map(([g, l]) => (
                  <button key={g} role="tab" aria-selected={gruppo === g} onClick={() => setGruppo(g)}
                    className={`flex-1 rounded-md px-2 py-1 font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${gruppo === g ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div id="esempi" className="mt-2 flex flex-wrap gap-1">
                {ESEMPI.filter((ex) => ex.gruppo === gruppo).map((ex) => (
                  <button
                    key={ex.id}
                    onClick={() => { setDiary(ex.text); taRef.current?.focus(); }}
                    title={ex.atteso}
                    className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-xs outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${diary === ex.text ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-white'}`}
                  >
                    <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[10px] font-semibold tabular ${diary === ex.text ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>{ex.n}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
              {(() => {
                const cur = ESEMPI.find((e) => e.text === diary);
                return (
                  <p className="mt-1.5 min-h-[16px] text-xs leading-snug text-slate-500">
                    {cur ? (cur.gruppo === 'trappola' ? cur.atteso : `Atteso: ${cur.atteso}`) : gruppo === 'trappola' ? 'Analizza ogni testo prima in Simulazione locale (il parser) e poi con Jev.' : ''}
                  </p>
                );
              })()}
              {gruppo === 'alert' && (
                <button
                  onClick={runCompare}
                  disabled={loading}
                  className="mt-1.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                >
                  Confronta 4A e 4B: stessa PA 135/90, allarme diverso
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-2.5">
              <div className={`flex min-h-0 flex-1 flex-col rounded-xl border transition ${listening ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200 focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100'}`}>
                <textarea
                  ref={taRef}
                  value={diary}
                  onChange={(e) => setDiary(e.target.value)}
                  onKeyDown={onKeyDown}
                  rows={4}
                  aria-label="Testo del diario"
                  placeholder="Es. Paziente vigile, PA 130/80, FC 78, sat 97%, dolore 2/10…"
                  className="block min-h-[88px] w-full flex-1 resize-none rounded-t-xl bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400"
                />
                {listening && (
                  <p className="shrink-0 px-3 pb-2 text-sm italic text-slate-400" aria-live="polite">{mic.interim || 'In ascolto…'}</p>
                )}
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-slate-100 px-2 py-1.5">
                  <button
                    onClick={mic.toggle}
                    disabled={mic.supported === false}
                    aria-pressed={listening}
                    title={mic.supported === false ? 'Dettatura non supportata da questo browser (usa Chrome, Edge o Safari)' : ''}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${listening ? 'animate-pulseRing bg-rose-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-700'}`}
                  >
                    {listening ? '■ Ferma dettatura' : '🎙️ Detta con microfono'}
                  </button>
                  <button onClick={() => setDiary('')} className="rounded-lg px-2.5 py-1.5 text-sm text-slate-500 outline-none hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-blue-500">
                    Svuota
                  </button>
                  <span className="ml-auto pr-1 text-xs text-slate-400 tabular" title="Ctrl + Invio per analizzare">{diary.length} caratteri</span>
                </div>
              </div>

              {mic.supported === false && (
                <p className="mt-1.5 shrink-0 text-xs text-slate-500">Dettatura non disponibile in questo browser. Usa Chrome, Edge o Safari, oppure il microfono della tastiera del telefono.</p>
              )}
              {mic.error && (
                <div role="alert" className="mt-1.5 flex shrink-0 items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <span className="flex-1">{mic.error}</span>
                  <button onClick={mic.clearError} className="font-medium underline">Chiudi</button>
                </div>
              )}

              <button
                onClick={() => analyze()}
                disabled={loading}
                className="mt-2.5 inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm outline-none transition hover:bg-blue-800 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:bg-blue-400"
              >
                {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {loading ? 'Analisi in corso…' : mode === 'jev' ? 'Analizza con Jev' : 'Analizza (simulazione)'}
              </button>
            </div>
          </div>
        </section>

        {/* Colonna risultati */}
        <section className="space-y-5 lg:col-span-7" aria-live="polite">
          {/* Barra di stato risultato */}
          {result && !compare && (
            <div className="animate-rise flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${isMock ? 'bg-slate-200 text-slate-700' : 'bg-blue-700 text-white'}`}>
                {isMock ? 'Simulazione locale' : 'Jev reale'}
              </span>
              {latency != null && (
                <span className={`rounded-full px-2 py-0.5 font-medium tabular ${isMock ? 'bg-slate-100 text-slate-600' : latency < 400 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  title={isMock ? 'Tempo della simulazione nel browser' : 'Andata e ritorno server → Gateway'}>
                  {latency} ms{!isMock && latency < 400 ? ' (sotto i 400)' : ''}
                </span>
              )}
              {!isMock && clientMs != null && <span className="text-slate-500 tabular" title="Tempo totale dal browser">totale {clientMs} ms</span>}
              {!isMock && result.usage?.inputTokens != null && <span className="text-slate-500 tabular">{result.usage.inputTokens} token</span>}
              {!isMock && result.cost && <span className="text-slate-500 tabular">${Number(result.cost).toFixed(6)}</span>}
              {stale && <button onClick={() => analyze()} className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-200">Testo modificato: rianalizza</button>}
            </div>
          )}

          {notice && (
            <div className="animate-rise rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              {notice} Configura <code className="rounded bg-white px-1">AI_GATEWAY_API_KEY</code> su Vercel per usare Jev.
            </div>
          )}

          {error && (
            <div role="alert" className="animate-rise rounded-xl border border-rose-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700" aria-hidden>!</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{error.message}</p>
                  <p className="mt-0.5 text-xs text-slate-500 tabular">Codice {error.code}{error.status ? `, HTTP ${error.status}` : ''}</p>
                  {error.details != null && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-slate-600">Dettagli tecnici</summary>
                      <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{typeof error.details === 'string' ? error.details : JSON.stringify(error.details, null, 2)}</pre>
                    </details>
                  )}
                  {error.code !== 'EMPTY_DIARY' && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => analyze()} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Riprova</button>
                      <button onClick={() => { setMode('mock'); analyze('mock'); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Usa la simulazione</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {compare && <CompareView items={compare} mock={compareMock} onClose={() => setCompare(null)} />}

          {!compare && !result && !error && !loading && (
            <div className="grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
              <p className="text-sm font-medium text-slate-700">Nessuna analisi ancora</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Scegli un esempio o detta il diario, poi premi «{mode === 'jev' ? 'Analizza con Jev' : 'Analizza (simulazione)'}».</p>
            </div>
          )}

          {loading && !result && !compare && (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200/70" />)}
            </div>
          )}

          {!compare && report && result && (
            <div className={`space-y-5 transition-opacity ${loading ? 'opacity-50' : ''}`}>
              <ReportView report={report} mock={isMock} onHover={setFocus} />

              <section aria-label="Evidenze nel testo" className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Evidenze nel diario</h3>
                  <span className="text-[11px] text-slate-500">Passa sopra una card per vedere da dove arriva il valore</span>
                </div>
                <EvidenceText text={analyzedText} spans={report.spans} focus={focus} />
              </section>

              <section className="rounded-xl border border-slate-200 bg-white">
                <button onClick={() => setShowRaw((s) => !s)} aria-expanded={showRaw} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700">
                  Risposta grezza {isMock ? '(simulata)' : 'di Jev'}
                  <span className="text-slate-400">{showRaw ? '−' : '+'}</span>
                </button>
                {showRaw && (
                  <pre className="max-h-96 overflow-auto border-t border-slate-100 bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
                    {JSON.stringify(isMock ? { answers: result.answers, confidence: result.confidence } : result.raw, null, 2)}
                  </pre>
                )}
              </section>

              <p className="text-[11px] leading-relaxed text-slate-400">
                Il parser è il righello: legge i numeri. Jev è il cane da tartufo: legge il contesto e restituisce probabilità calibrate che fanno scattare gli alert. In simulazione le probabilità sono fisse, derivate dalle keyword del file data/jev-questions-rsa.json.
                Prototipo dimostrativo: non usare per decisioni cliniche reali.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
