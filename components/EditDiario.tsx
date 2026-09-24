'use client';
import { useEffect, useMemo, useState } from 'react';
import { urgencyScore, valutaLocale, fmtData, TESTO_ORIGINALE, type Diario, type Ospite, type Punteggio } from '../lib/reparto';
import type { AnalysisResult } from '../lib/clinical';

type Mode = 'mock' | 'jev';
const TONE = { verde: 'bg-emerald-50 text-emerald-900 border-emerald-200', giallo: 'bg-amber-50 text-amber-950 border-amber-300', rosso: 'bg-rose-600 text-white border-rose-700' } as const;
const LABEL = { verde: 'Stabile', giallo: 'Da controllare', rosso: 'Urgente' } as const;

function Esito({ titolo, p }: { titolo: string; p: Punteggio }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${TONE[p.stato]}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium opacity-80">{titolo}</span>
        <span className="text-lg font-bold tabular">{p.score} <span className="text-[10px] font-medium uppercase opacity-80">punti</span></span>
      </div>
      <p className="text-sm font-semibold">{LABEL[p.stato]}</p>
      <p className="text-xs leading-snug">{p.motivo}</p>
    </div>
  );
}

export function EditDiario({ ospite, diario, mode, onSave, onClose, jevCached }: {
  ospite: Ospite; diario: Diario; mode: Mode;
  onSave: (testo: string, jev: { testo: string; punteggio: Punteggio } | null) => void;
  onClose: () => void;
  jevCached?: { testo: string; punteggio: Punteggio } | null;
}) {
  const [testo, setTesto] = useState(diario.testo);
  const [debounced, setDebounced] = useState(diario.testo);
  const [jev, setJev] = useState<{ testo: string; punteggio: Punteggio } | null>(jevCached && jevCached.testo === diario.testo ? jevCached : null);
  const [jevBusy, setJevBusy] = useState(false);
  const [jevErr, setJevErr] = useState<string | null>(null);
  const originale = TESTO_ORIGINALE[diario.id];

  useEffect(() => { const t = setTimeout(() => setDebounced(testo), 250); return () => clearTimeout(t); }, [testo]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const locale = useMemo(() => valutaLocale({ ...diario, testo: debounced }).punteggio, [debounced, diario]);
  const prima = useMemo(() => valutaLocale(diario).punteggio, [diario]);
  const jevValido = jev && jev.testo === testo ? jev : null;

  const valutaJev = async () => {
    setJevBusy(true); setJevErr(null);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ diary: testo }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setJevErr(json?.error?.message || `Errore ${res.status}`); return; }
      setJev({ testo, punteggio: urgencyScore(testo, json as AnalysisResult) });
    } catch (e: any) { setJevErr(e?.message || 'Errore di rete'); } finally { setJevBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Modifica diario" onClick={onClose}>
      <div className="animate-rise max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Modifica diario: {ospite.cognome} {ospite.nome}</h2>
            <p className="text-xs text-slate-500 tabular">Stanza {ospite.stanza} · {fmtData(diario)} · {diario.autore}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" aria-label="Chiudi">✕</button>
        </div>

        <p className="mt-2 text-xs text-slate-600">Cambia il testo e guarda come cambia la valutazione: aggiungi o togli una negazione, un sintomo, un riferimento al passato.</p>
        <textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={5} autoFocus
          className="mt-2 block w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-[15px] leading-relaxed text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Esito titolo={testo === diario.testo ? 'Simulazione locale' : 'Simulazione locale (dal vivo)'} p={locale} />
          {mode === 'jev' ? (
            jevValido ? <Esito titolo="Jev via Gateway" p={jevValido.punteggio} /> : (
              <div className="flex flex-col justify-center rounded-xl border border-dashed border-blue-200 px-3 py-2">
                <button onClick={valutaJev} disabled={jevBusy || !testo.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-blue-400">
                  {jevBusy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                  {jevBusy ? 'Jev sta valutando…' : 'Valuta con Jev'}
                </button>
                {jevErr && <p className="mt-1 text-xs text-rose-700">{jevErr}</p>}
              </div>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
              Per confrontare con Jev reale seleziona «Jev via Gateway» in alto.
            </div>
          )}
        </div>
        {testo !== diario.testo && (
          <p className="mt-2 text-xs text-slate-500">Prima della modifica: {LABEL[prima.stato].toLowerCase()}, {prima.score} punti ({prima.motivo}).</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button onClick={() => onSave(testo, jevValido)} disabled={!testo.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Salva nel reparto</button>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Annulla</button>
          {testo !== originale && (
            <button onClick={() => setTesto(originale)} className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Ripristina testo originale</button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Le modifiche restano solo in questo browser finché non ricarichi la pagina. Non inserire dati reali di ospiti.</p>
      </div>
    </div>
  );
}
