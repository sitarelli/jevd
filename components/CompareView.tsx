'use client';
import type { Report, Esempio } from '../lib/clinical';
import { Verdict, pct } from './ReportView';

export function CompareView({ items, mock, onClose }: { items: { ex: Esempio; report: Report }[]; mock: boolean; onClose: () => void }) {
  const rows = ['pa', 'fc', 'temp', 'sat'];
  return (
    <section className="animate-rise rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Confronto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Stessi numeri, contesto diverso</h2>
          <p className="text-xs text-slate-500">Il parser legge gli stessi valori. Jev valuta il contesto e cambia l'allarme.</p>
        </div>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100">Chiudi confronto</button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {items.map(({ ex, report }) => (
          <div key={ex.id} className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{ex.n}. {ex.label.replace(/^Stessi vitali [AB]: /, '')}</p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs italic leading-relaxed text-slate-600">“{ex.text}”</p>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Parser</p>
              <dl className="mt-1 grid grid-cols-4 gap-2">
                {rows.map((id) => {
                  const v = report.vitals.find((x) => x.id === id)!;
                  return (
                    <div key={id} className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <dt className="text-[10px] text-slate-500">{v.label.replace('Frequenza cardiaca', 'FC').replace('Pressione arteriosa', 'PA').replace('Saturazione O₂', 'Sat')}</dt>
                      <dd className="text-sm font-semibold tabular text-slate-900">{v.value ?? (v.bandLabel === 'Apiretico' ? 'apir.' : '—')}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-500">{mock ? 'Jev (simulato)' : 'Jev'}</p>
              <Verdict report={report} mock={mock} />
              <ul className="mt-2 space-y-1">
                {[...report.segnalazioni, ...report.eventi, ...report.monitoraggio].map((r) => (
                  <li key={r.q.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{r.q.label}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold tabular ${r.color === 'rosso' ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'}`}>{pct(r.probability)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
