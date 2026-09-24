'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PERIODI, REGOLE, RIFERIMENTO, MAX_CHIAMATE_JEV, TESTO_ORIGINALE,
  cloneOspiti, diariNelPeriodo, classifica, valutaLocale, pianoChiamate, urgencyScore, fmtData,
  type Periodo, type Ospite, type Diario, type DiarioValutato, type RigaClassifica, type Punteggio,
} from '../lib/reparto';
import { EditDiario } from './EditDiario';
import type { AnalysisResult } from '../lib/clinical';

type Mode = 'mock' | 'jev';
type Stato = 'verde' | 'giallo' | 'rosso';
const DOT: Record<Stato | 'nessuno', string> = { verde: 'bg-emerald-500', giallo: 'bg-amber-500', rosso: 'bg-rose-600', nessuno: 'bg-slate-300' };
const STATO_LABEL: Record<Stato, string> = { verde: 'Stabile', giallo: 'Da controllare', rosso: 'Urgente' };
const nome = (o: Ospite) => `${o.cognome} ${o.nome}`;
const fmtRif = () => { const d = new Date(RIFERIMENTO); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export default function RepartoView({ mode, onOpen }: { mode: Mode; onOpen: (o: Ospite, d: Diario) => void }) {
  const [ospiti, setOspiti] = useState<Ospite[]>(cloneOspiti);
  const [edit, setEdit] = useState<{ o: Ospite; d: Diario } | null>(null);
  const [aperti, setAperti] = useState<Set<string>>(new Set());
  const [jevCache, setJevCache] = useState<Map<string, { testo: string; punteggio: Punteggio }>>(new Map());
  const [periodo, setPeriodo] = useState<Periodo>('tutti');
  const [sel, setSel] = useState<Set<string>>(() => new Set(cloneOspiti().map((o) => o.id)));
  const [valutati, setValutati] = useState<Map<string, DiarioValutato> | null>(null);
  const [run, setRun] = useState<{ periodo: Periodo; richiesto: Mode; mode: Mode; ms: number; diari: number; esclusi: number; errori: number; ospiti: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);

  // Stato locale di ogni diario (istantaneo, nessuna chiamata): serve per i pallini prima dell'analisi
  const locale = useMemo(() => new Map(ospiti.flatMap((o) => o.diari).map((d) => [d.id, valutaLocale(d)])), [ospiti]);

  const statoUltimo = (o: Ospite): { stato: Stato | 'nessuno'; ultimo: Diario | null; fonte: 'jev' | 'locale' | null } => {
    const ultimo = diariNelPeriodo(o, periodo)[0] || null;
    if (!ultimo) return { stato: 'nessuno', ultimo: null, fonte: null };
    const j = valutati?.get(ultimo.id);
    if (j && j.mode === 'jev') return { stato: j.punteggio.stato, ultimo, fonte: 'jev' };
    return { stato: locale.get(ultimo.id)!.punteggio.stato, ultimo, fonte: 'locale' };
  };

  const conDiari = ospiti.filter((o) => diariNelPeriodo(o, periodo).length > 0);
  const selezionati = conDiari.filter((o) => sel.has(o.id));
  const tuttiSel = conDiari.length > 0 && selezionati.length === conDiari.length;
  const totDiari = selezionati.reduce((n, o) => n + diariNelPeriodo(o, periodo).length, 0);
  const piano = mode === 'jev' ? pianoChiamate(selezionati, periodo) : null;

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSel(tuttiSel ? new Set() : new Set(conDiari.map((o) => o.id)));

  const analizza = useCallback(async () => {
    if (!selezionati.length) { setError('Seleziona almeno un ospite con diari nel periodo.'); return; }
    setBusy(true); setError(null); setNotice(null);
    const t0 = Date.now();
    const out = new Map<string, DiarioValutato>();
    const soloLocale = () => { for (const o of selezionati) for (const d of diariNelPeriodo(o, periodo)) out.set(d.id, locale.get(d.id)!); };
    try {
      if (mode === 'mock') {
        await new Promise((r) => setTimeout(r, 250));
        soloLocale();
        setRun({ periodo, richiesto: mode, mode, ms: Date.now() - t0, diari: out.size, esclusi: 0, errori: 0, ospiti: selezionati.map((o) => o.id) });
      } else {
        const { scelti, esclusi } = pianoChiamate(selezionati, periodo);
        setProgress({ done: 0, total: scelti.length });
        let done = 0, errori = 0, missingKey = false;
        const queue = [...scelti];
        const worker = async () => {
          while (queue.length && !missingKey) {
            const d = queue.shift()!;
            try {
              const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diary: d.testo }) });
              const json = await res.json().catch(() => null);
              if (!res.ok) { if (json?.error?.code === 'MISSING_KEY') missingKey = true; else errori++; }
              else { const punteggio = urgencyScore(d.testo, json as AnalysisResult); out.set(d.id, { diario: d, punteggio, mode: 'jev' }); setJevCache((m) => new Map(m).set(d.id, { testo: d.testo, punteggio })); }
            } catch { errori++; }
            done++; setProgress({ done, total: scelti.length });
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]); // 4 chiamate in parallelo
        if (missingKey) {
          out.clear(); soloLocale();
          setNotice('Chiave AI Gateway non configurata sul server: classifica calcolata con la simulazione locale.');
          setRun({ periodo, richiesto: mode, mode: 'mock', ms: Date.now() - t0, diari: out.size, esclusi: 0, errori: 0, ospiti: selezionati.map((o) => o.id) });
        } else {
          if (errori) setNotice(`${errori} chiamate non riuscite: quei diari non sono in classifica.`);
          setRun({ periodo, richiesto: mode, mode, ms: Date.now() - t0, diari: out.size, esclusi, errori, ospiti: selezionati.map((o) => o.id) });
        }
      }
      setValutati(out);
    } finally {
      setBusy(false); setProgress(null);
    }
  }, [selezionati, periodo, mode, locale]);

  const modificati = ospiti.reduce((n, o) => n + o.diari.filter((d) => d.testo !== TESTO_ORIGINALE[d.id]).length, 0);
  const salva = (o: Ospite, d: Diario, testo: string, jev: { testo: string; punteggio: Punteggio } | null) => {
    const nuovo = { ...d, testo };
    setOspiti((prev) => prev.map((x) => (x.id !== o.id ? x : { ...x, diari: x.diari.map((y) => (y.id === d.id ? nuovo : y)) })));
    if (jev) setJevCache((m) => new Map(m).set(d.id, jev));
    // aggiorna subito la classifica se il diario era stato valutato
    setValutati((prev) => {
      if (!prev || !prev.has(d.id)) return prev;
      const m = new Map(prev);
      const era = prev.get(d.id)!;
      if (era.mode === 'jev') {
        if (jev) m.set(d.id, { diario: nuovo, punteggio: jev.punteggio, mode: 'jev' });
        else { m.set(d.id, { ...valutaLocale(nuovo), mode: 'jev' }); setNotice(`Diario di ${o.cognome} ${o.nome} modificato: in classifica provvisoriamente con la valutazione locale. Premi «Valuta con Jev» nell'editor o rianalizza.`); }
      } else m.set(d.id, valutaLocale(nuovo));
      return m;
    });
    setEdit(null);
  };
  const ripristinaTutti = () => {
    setOspiti(cloneOspiti()); setJevCache(new Map());
    setValutati((prev) => {
      if (!prev) return prev;
      const m = new Map<string, DiarioValutato>();
      const orig = new Map(cloneOspiti().flatMap((o) => o.diari).map((d) => [d.id, d]));
      prev.forEach((v, id) => m.set(id, v.mode === 'mock' ? valutaLocale(orig.get(id)!) : v));
      return m;
    });
    if (run?.mode === 'jev') setNotice('Diari ripristinati: rianalizza con Jev per aggiornare la classifica.');
  };
  const modifica = (o: Ospite, d: Diario) => setEdit({ o: ospiti.find((x) => x.id === o.id)!, d: ospiti.find((x) => x.id === o.id)!.diari.find((y) => y.id === d.id)! });

  const righe: RigaClassifica[] = useMemo(() => {
    if (!valutati || !run) return [];
    return classifica(ospiti.filter((o) => run.ospiti.includes(o.id)), valutati, run.periodo);
  }, [valutati, run, ospiti]);
  const stale = !!run && (run.periodo !== periodo || run.richiesto !== mode || run.ospiti.length !== selezionati.length || run.ospiti.some((id) => !sel.has(id)));
  const isMockRun = run?.mode === 'mock';
  // Su schermi stretti la classifica è sotto la lista: ci si porta lì a fine analisi
  useEffect(() => {
    if (run && !busy && typeof window !== 'undefined' && window.innerWidth < 1024) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [run, busy]);

  // Callout demo 4A/4B: stessi vitali, posizioni diverse
  const demo = useMemo(() => {
    const pos = (pred: (r: RigaClassifica) => boolean) => { const i = righe.findIndex(pred); return i < 0 ? null : { i: i + 1, r: righe[i] }; };
    const b = pos((r) => r.migliore.diario.tipo_template === 'pallido_confuso_4B');
    const a = pos((r) => r.ospite.diari.some((d) => d.tipo_template === 'tranquillo_4A') && !r.ospite.diari.some((d) => d.tipo_template === 'pallido_confuso_4B'));
    const intatto = (o: Ospite) => o.diari.every((d) => d.testo === TESTO_ORIGINALE[d.id]);
    return a && b && intatto(a.r.ospite) && intatto(b.r.ospite) ? { a, b } : null;
  }, [righe]);

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12">
      {/* ---------------- Lista ospiti ---------------- */}
      <section className="lg:col-span-5">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-8.5rem)] lg:min-h-[520px]">
          <div className="shrink-0 border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Ospiti del nucleo 2</h2>
            <p className="text-xs text-slate-500">{ospiti.length} ospiti, {ospiti.reduce((n, o) => n + o.diari.length, 0)} diari di infermieri, OSS, fisioterapista ed educatrice. Riferimento temporale: ultimo diario del {fmtRif()}.</p>
            {modificati > 0 && (
              <p className="mt-1 text-xs text-blue-800">{modificati} {modificati === 1 ? 'diario modificato' : 'diari modificati'} in questa sessione. <button onClick={ripristinaTutti} disabled={busy} className="font-semibold underline">Ripristina originali</button></p>
            )}
          </div>

          <div className="shrink-0 space-y-2 px-4 pt-2.5">
            <div role="radiogroup" aria-label="Periodo" className="grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
              {PERIODI.map((p) => (
                <button key={p.id} role="radio" aria-checked={periodo === p.id} onClick={() => setPeriodo(p.id)} disabled={busy}
                  className={`rounded-md px-1.5 py-1 font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500 ${periodo === p.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs">
              <label className="inline-flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                <input type="checkbox" checked={tuttiSel} onChange={toggleAll} disabled={busy} className="h-4 w-4 rounded border-slate-300 accent-blue-700" />
                Seleziona tutti
              </label>
              <span className="text-slate-500 tabular">{selezionati.length} ospiti, {totDiari} diari</span>
            </div>
          </div>

          <ul className="mt-2 max-h-[45vh] min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 pb-2 lg:max-h-none" aria-label="Ospiti">
            {ospiti.map((o) => {
              const { stato, ultimo, fonte } = statoUltimo(o);
              const ds = diariNelPeriodo(o, periodo);
              const n = ds.length;
              const disabled = n === 0;
              const aperto = aperti.has(o.id);
              const mostra = aperto ? ds : ds.slice(0, 1);
              return (
                <li key={o.id} className={`rounded-xl border px-2.5 py-2 transition ${disabled ? 'border-dashed border-slate-200 opacity-60' : sel.has(o.id) ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200'}`}>
                  <div className="flex items-center gap-2.5">
                    <input type="checkbox" aria-label={`Seleziona ${nome(o)}`} className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 accent-blue-700" checked={!disabled && sel.has(o.id)} disabled={disabled || busy} onChange={() => toggle(o.id)} />
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[stato]}`} title={stato === 'nessuno' ? 'Nessun diario nel periodo' : `${STATO_LABEL[stato]} (${fonte === 'jev' ? 'Jev' : 'stima locale'}, ultimo diario)`} />
                    <span className="truncate text-sm font-semibold text-slate-900">{nome(o)}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500 tabular">St. {o.stanza} · {o.eta}a</span>
                  </div>
                  {ultimo ? (
                    <div className="ml-[26px] mt-1 space-y-2">
                      {mostra.map((d) => (
                        <div key={d.id}>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 tabular">
                            <span>{fmtData(d)} · {d.autore}</span>
                            {d.testo !== TESTO_ORIGINALE[d.id] && <span className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-800">modificato</span>}
                            <button onClick={() => modifica(o, d)} disabled={busy} className="ml-auto rounded px-1.5 py-0.5 font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50" aria-label={`Modifica diario del ${fmtData(d)}`}>✎ Modifica</button>
                          </div>
                          <p className="text-xs leading-snug text-slate-700">{d.testo}</p>
                        </div>
                      ))}
                      {n > 1 && (
                        <button onClick={() => setAperti((s0) => { const x = new Set(s0); x.has(o.id) ? x.delete(o.id) : x.add(o.id); return x; })} className="text-[11px] font-medium text-slate-500 hover:text-slate-800">
                          {aperto ? 'Mostra solo l\'ultimo' : `Mostra tutti i ${n} diari del periodo`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="ml-[26px] mt-0.5 text-xs text-slate-400">Nessun diario nel periodo</p>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="shrink-0 border-t border-slate-100 px-4 py-3">
            {error && <p role="alert" className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900">{error}</p>}
            <button onClick={analizza} disabled={busy || !selezionati.length}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-base font-semibold text-white shadow-sm outline-none transition hover:bg-blue-800 focus-visible:ring-4 focus-visible:ring-blue-200 disabled:bg-blue-400">
              {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {busy ? 'Analisi in corso…' : mode === 'jev' ? 'Analizza per importanza (Jev)' : 'Analizza per importanza (Jev simulato)'}
            </button>
            <p className="mt-1.5 text-center text-[11px] text-slate-500">
              {mode === 'jev'
                ? `Jev via Gateway: ${piano?.scelti.length ?? 0} chiamate${piano && piano.esclusi ? `, ${piano.esclusi} diari più vecchi esclusi (max ${MAX_CHIAMATE_JEV})` : ''}`
                : 'Simulazione locale: nessuna chiamata, nessun credito consumato'}
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- Classifica ---------------- */}
      <section ref={resultsRef} className="scroll-mt-4 space-y-4 lg:col-span-7" aria-live="polite">
        {progress && (
          <div className="rounded-xl border border-blue-200 bg-white p-3">
            <div className="flex justify-between text-xs text-slate-600 tabular"><span>Jev sta valutando i diari…</span><span>{progress.done} / {progress.total}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
          </div>
        )}

        {run && !busy && (
          <div className="animate-rise flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${isMockRun ? 'bg-slate-200 text-slate-700' : 'bg-blue-700 text-white'}`}>{isMockRun ? 'Simulazione locale' : 'Jev reale'}</span>
            <span className="text-slate-600 tabular">{righe.length} ospiti, {run.diari} diari valutati in {run.ms} ms</span>
            {run.esclusi > 0 && <span className="text-amber-700">{run.esclusi} diari più vecchi non valutati (limite {MAX_CHIAMATE_JEV} chiamate)</span>}
            <span className="text-slate-500">{PERIODI.find((p) => p.id === run.periodo)!.label}</span>
            {stale && <button onClick={analizza} className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 font-medium text-amber-900 hover:bg-amber-200">Filtri cambiati: rianalizza</button>}
          </div>
        )}
        {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{notice}</div>}

        {!run && !busy && (
          <div className="grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">Classifica non ancora calcolata</p>
            <p className="mt-1 max-w-md text-sm text-slate-500">Scegli periodo e ospiti, poi premi «Analizza per importanza». Ogni ospite prende il punteggio del suo diario più urgente nel periodo.</p>
          </div>
        )}

        {run && !busy && righe.length > 0 && (
          <>
            {demo && (
              <div className="animate-rise rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2.5 text-xs leading-relaxed text-blue-950">
                <span className="font-semibold">Stessi vitali, posizioni opposte.</span>{' '}
                {nome(demo.b.r.ospite)} (PA 135/90, FC 88, pallida e confusa) è al <span className="font-semibold">{demo.b.i}° posto</span> con {demo.b.r.migliore.punteggio.score} punti.{' '}
                {nome(demo.a.r.ospite)} (PA 135/90, FC 88, tranquillo) è al <span className="font-semibold">{demo.a.i}° posto</span> con {demo.a.r.migliore.punteggio.score}. Il parser li vede uguali, Jev no.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-3">
              {righe.slice(0, 3).map((r, i) => <TopCard key={r.ospite.id} r={r} rank={i + 1} mock={isMockRun} onOpen={onOpen} onEdit={modifica} />)}
            </div>

            {righe.length > 3 && (
              <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white" start={4}>
                {righe.slice(3).map((r, i) => <Riga key={r.ospite.id} r={r} rank={i + 4} max={righe[0].migliore.punteggio.score} onOpen={onOpen} onEdit={modifica} />)}
              </ol>
            )}

            <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">Come si calcola l'urgency score</summary>
              <p className="mt-2">Per ogni diario si sommano i punti delle regole scattate, più 10 punti per ogni domanda sopra la sua soglia rossa e 3 per ogni domanda sopra la gialla. Ogni ospite prende il punteggio massimo dei suoi diari nel periodo. A parità di punti vengono prima gli ospiti in stato rosso.</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left tabular">
                  <thead><tr className="text-slate-500"><th className="py-1 pr-3 font-medium">Regola (id v1)</th><th className="py-1 pr-3 font-medium">Domande v2</th><th className="py-1 pr-3 font-medium">Se prob. &gt;</th><th className="py-1 font-medium">Punti</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {REGOLE.map((g) => <tr key={g.id_v1}><td className="py-1 pr-3">{g.label} <span className="text-slate-400">({g.id_v1})</span></td><td className="py-1 pr-3">{g.ids.join(', ')}</td><td className="py-1 pr-3">{g.soglia}</td><td className="py-1">+{g.punti}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      {edit && (
        <EditDiario
          key={edit.d.id}
          ospite={edit.o}
          diario={edit.d}
          mode={mode}
          jevCached={jevCache.get(edit.d.id) || null}
          onClose={() => setEdit(null)}
          onSave={(testo, jev) => salva(edit.o, edit.d, testo, jev)}
        />
      )}
    </main>
  );
}

function TopCard({ r, rank, mock, onOpen, onEdit }: { r: RigaClassifica; rank: number; mock: boolean; onOpen: (o: Ospite, d: Diario) => void; onEdit: (o: Ospite, d: Diario) => void }) {
  const p = r.migliore.punteggio;
  const tone = p.stato === 'rosso' ? 'bg-rose-600 text-white border-rose-700' : p.stato === 'giallo' ? 'bg-amber-50 text-amber-950 border-amber-300' : 'bg-emerald-50 text-emerald-950 border-emerald-200';
  const sub = p.stato === 'rosso' ? 'text-rose-100' : 'text-slate-600';
  const quote = p.stato === 'rosso' ? 'bg-rose-700/40 text-rose-50' : 'bg-white/70 text-slate-700';
  return (
    <article className={`animate-rise flex flex-col rounded-2xl border p-4 shadow-sm ${tone}`} style={{ animationDelay: `${rank * 60}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-3xl font-bold leading-none tabular">#{rank}</span>
        <div className="text-right">
          <p className="text-3xl font-bold leading-none tabular">{p.score}</p>
          <p className={`text-[10px] font-medium uppercase tracking-wide ${sub}`}>urgency score</p>
        </div>
      </div>
      <h3 className="mt-3 text-lg font-semibold leading-tight">{nome(r.ospite)}</h3>
      <p className={`text-xs ${sub}`}>Stanza {r.ospite.stanza} · {r.ospite.eta} anni · {STATO_LABEL[p.stato]}</p>
      <p className="mt-2 text-sm font-medium leading-snug">{p.motivo}</p>
      <blockquote className={`mt-2 rounded-lg px-2.5 py-2 text-xs italic leading-snug ${quote}`}>
        <span className="not-italic font-medium">{fmtData(r.migliore.diario)}</span> “{r.migliore.diario.testo}”
      </blockquote>
      {r.ultimo.id !== r.migliore.diario.id && <p className={`mt-1.5 text-[11px] leading-snug ${sub}`}>Ultimo diario {fmtData(r.ultimo)}: {r.ultimo.testo}</p>}
      <div className={`mt-auto flex flex-wrap gap-x-3 pt-3 text-xs font-semibold ${p.stato === 'rosso' ? 'text-white' : 'text-blue-800'}`}>
        <button onClick={() => onEdit(r.ospite, r.migliore.diario)} className="underline-offset-2 hover:underline">✎ Modifica</button>
        <button onClick={() => onOpen(r.ospite, r.migliore.diario)} className="underline-offset-2 hover:underline">Apri nel diario ospite ›</button>
      </div>
      {mock && <span className="sr-only">Punteggio da simulazione locale</span>}
    </article>
  );
}

function Riga({ r, rank, max, onOpen, onEdit }: { r: RigaClassifica; rank: number; max: number; onOpen: (o: Ospite, d: Diario) => void; onEdit: (o: Ospite, d: Diario) => void }) {
  const p = r.migliore.punteggio;
  return (
    <li className="flex gap-3 px-3 py-2.5">
      <span className="w-6 shrink-0 pt-0.5 text-right text-sm font-semibold text-slate-400 tabular">{rank}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[p.stato]}`} title={STATO_LABEL[p.stato]} />
          <span className="truncate text-sm font-semibold text-slate-900">{nome(r.ospite)}</span>
          <span className="text-xs text-slate-500">St. {r.ospite.stanza}</span>
          <span className="ml-auto shrink-0 text-sm font-bold text-slate-900 tabular">{p.score}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className={`h-full rounded-full ${p.stato === 'rosso' ? 'bg-rose-500' : p.stato === 'giallo' ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${max ? (p.score / max) * 100 : 0}%` }} />
        </div>
        <p className="mt-1 text-xs font-medium text-slate-700">{p.motivo}</p>
        <p className="text-xs leading-snug text-slate-600"><span className="tabular text-slate-500">{fmtData(r.migliore.diario)} · {r.migliore.diario.autore}</span> · {r.migliore.diario.testo}</p>
        <div className="mt-0.5 flex gap-3 text-xs font-medium text-blue-700">
          <button onClick={() => onEdit(r.ospite, r.migliore.diario)} className="hover:underline">✎ Modifica</button>
          <button onClick={() => onOpen(r.ospite, r.migliore.diario)} className="hover:underline">Apri nel diario ospite</button>
        </div>
      </div>
    </li>
  );
}
