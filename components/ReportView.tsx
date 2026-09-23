'use client';
import type { Report, Status, VitalRow, RiskRow, AreaRow } from '../lib/clinical';
import { SCHEDE } from '../lib/clinical';
import type { Span } from '../lib/parser';

export const STATUS_STYLE: Record<Status, { dot: string; text: string; bg: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Nella norma' },
  warn: { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Da monitorare' },
  crit: { dot: 'bg-rose-600', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Critico' },
  none: { dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', label: 'Non rilevato' },
};
export const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');
type Hover = (s: Span | null) => void;

export function InfoBox() {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs leading-relaxed text-blue-950">
      <p><span className="font-semibold">Parser estrae parametri. Jev valuta rischio clinico con probabilità calibrate.</span></p>
      <p className="mt-1 text-blue-900">
        Ogni domanda ha le sue soglie: sopra la gialla <span className="font-medium">da verificare</span>, sopra la rossa <span className="font-medium">proposta apertura scheda</span>.
        Rosso pieno solo per i segni urgenti (frattura, deterioramento, delirium, dispnea…).
      </p>
    </div>
  );
}

function Snippet({ span, onHover }: { span: Span | null; onHover: Hover }) {
  if (!span) return null;
  return <p className="mt-2 line-clamp-2 border-l-2 border-slate-300/70 pl-2 text-xs italic text-slate-500" onMouseEnter={() => onHover(span)} onMouseLeave={() => onHover(null)}>“{span.text}”</p>;
}

function ThresholdBar({ r }: { r: RiskRow }) {
  const fill = r.color === 'rosso' ? 'bg-rose-600' : r.color === 'giallo' ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-slate-200/80" aria-hidden>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round(r.probability * 100)}%` }} />
      <span className="absolute -top-0.5 h-2.5 w-px bg-amber-600" style={{ left: `${r.q.threshold_yellow * 100}%` }} title={`Soglia gialla ${pct(r.q.threshold_yellow)}`} />
      <span className="absolute -top-0.5 h-2.5 w-px bg-rose-700" style={{ left: `${r.q.threshold_red * 100}%` }} title={`Soglia rossa ${pct(r.q.threshold_red)}`} />
    </div>
  );
}

function RiskCard({ r, mock, onHover }: { r: RiskRow; mock: boolean; onHover: Hover }) {
  const red = r.color === 'rosso';
  const box = red ? 'border-rose-200 bg-rose-50/70' : 'border-amber-200 bg-amber-50/60';
  const pill = red ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white';
  const status = r.band === 'sopra_rosso' ? (red ? 'Allarme' : 'Sopra soglia: proposta scheda') : 'Da verificare';
  return (
    <div className={`animate-rise rounded-xl border p-3 ${box}`} onMouseEnter={() => onHover(r.snippet)} onMouseLeave={() => onHover(null)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{r.q.label}</p>
            <p className="mt-0.5 text-xs text-slate-600">{status}. Scala: {r.q.scale}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular ${pill}`} title={mock ? 'Probabilità simulata con regole fisse' : 'Probabilità calibrata restituita da Jev'}>
            {mock ? 'Sim.' : 'Jev'} {pct(r.probability)}
          </span>
        </div>
        <ThresholdBar r={r} />
        <Snippet span={r.snippet} onHover={onHover} />
        {r.q.actions.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-slate-700">
            {r.q.actions.map((a) => <li key={a} className="flex gap-1.5"><span aria-hidden className={red ? 'text-rose-600' : 'text-amber-600'}>•</span>{a}</li>)}
          </ul>
        )}
        {r.href && r.cta === 'apri' && (
          <a href={r.href} className={`mt-3 inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold text-white outline-none transition focus-visible:ring-4 ${red ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300' : 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-300'}`}>
            Proposta: {SCHEDE[r.q.scheda!]}
          </a>
        )}
        {r.href && r.cta === 'verifica' && (
          <a href={r.href} className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 outline-none transition hover:bg-amber-50 focus-visible:ring-4 focus-visible:ring-amber-200">
            Da verificare: {SCHEDE[r.q.scheda!]}
          </a>
        )}
    </div>
  );
}

function Section({ title, hint, rows, mock, onHover, empty }: { title: string; hint: string; rows: RiskRow[]; mock: boolean; onHover: Hover; empty: string }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="text-[11px] text-slate-500">{hint}</span>
      </div>
      {rows.length ? (
        <div className="grid gap-3 sm:grid-cols-2">{rows.map((r) => <RiskCard key={r.q.id} r={r} mock={mock} onHover={onHover} />)}</div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-500">{empty}</p>
      )}
    </section>
  );
}

function AreaStrip({ aree }: { aree: AreaRow[] }) {
  const dot = { rosso: 'bg-rose-600', giallo: 'bg-amber-500', grigio: 'bg-slate-300', verde: 'bg-emerald-500' } as const;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Stato per area">
      {aree.map((a) => (
        <li key={a.category} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600" title={a.top ? `${a.top.q.label} ${pct(a.top.probability)}` : 'Nessun rischio sopra soglia'}>
          <span className={`h-2 w-2 rounded-full ${dot[a.color]}`} />{a.category}
        </li>
      ))}
    </ul>
  );
}

function VitalCard({ v, mock, onHover, i }: { v: VitalRow; mock: boolean; onHover: Hover; i: number }) {
  const s = STATUS_STYLE[v.status];
  return (
    <div className={`animate-rise rounded-xl border bg-white p-3 ${v.status === 'none' ? 'border-dashed border-slate-200' : v.note ? 'border-blue-300' : 'border-slate-200'}`}
      style={{ animationDelay: `${i * 35}ms` }} onMouseEnter={() => onHover(v.snippet)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{v.label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{v.status === 'none' ? s.label : v.bandLabel || s.label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular ${v.value ? (v.note ? 'text-slate-400 line-through decoration-1' : 'text-slate-900') : 'text-slate-300'}`}>{v.value ?? '—'}</span>
        {v.value && <span className="text-xs text-slate-500">{v.unit}</span>}
      </div>
      {v.jev && (v.status !== 'none' || v.jev.probability >= 0.5) && (
        <p className="mt-1.5 text-[11px] text-slate-600 tabular">{mock ? 'Sim.' : 'Jev'}: {v.jev.label.toLowerCase()} {pct(v.jev.probability)}</p>
      )}
      {v.note && <p className="mt-2 rounded-md bg-blue-50 px-2 py-1 text-[11px] leading-snug text-blue-900">{v.note}</p>}
      <Snippet span={v.snippet} onHover={onHover} />
    </div>
  );
}

const MARK: Record<string, string> = {
  ok: 'bg-emerald-100/80 decoration-emerald-500', warn: 'bg-amber-100 decoration-amber-500', crit: 'bg-rose-100 decoration-rose-500',
  none: 'bg-slate-100 decoration-slate-400 decoration-dotted', event: 'bg-blue-100 decoration-blue-500',
};
export function EvidenceText({ text, spans, focus }: { text: string; spans: Report['spans']; focus: Span | null }) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);
  const clean: typeof sorted = [];
  for (const s of sorted) if (!clean.length || s.start >= clean[clean.length - 1].end) clean.push(s);
  const parts: React.ReactNode[] = [];
  let cur = 0;
  clean.forEach((s, i) => {
    if (s.start > cur) parts.push(text.slice(cur, s.start));
    const isFocus = focus && focus.start < s.end && focus.end > s.start;
    parts.push(<mark key={i} className={`rounded px-0.5 text-slate-900 underline decoration-2 underline-offset-2 transition ${MARK[s.tone]} ${isFocus ? 'ring-2 ring-blue-500' : ''}`}>{text.slice(s.start, s.end)}</mark>);
    cur = s.end;
  });
  if (cur < text.length) parts.push(text.slice(cur));
  return <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{parts}</p>;
}

export function Verdict({ report, mock }: { report: Report; mock: boolean }) {
  const top = [...report.segnalazioni, ...report.eventi, ...report.monitoraggio];
  if (report.overall === 'verde') {
    return (
      <div className="animate-rise flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-lg text-white" aria-hidden>✓</span>
        <div>
          <p className="text-sm font-semibold text-emerald-900">Nessun alert: quadro stabile{report.stable != null ? ` ${pct(report.stable)}` : ''}</p>
          <p className="text-xs text-emerald-800">{mock ? 'Simulazione' : 'Jev'}: nessuna domanda sopra la sua soglia gialla.</p>
        </div>
      </div>
    );
  }
  const crit = report.overall === 'rosso';
  return (
    <div className={`animate-rise flex items-center gap-3 rounded-xl px-4 py-3 ${crit ? 'bg-rose-600 text-white' : 'border border-amber-300 bg-amber-50 text-amber-950'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-bold ${crit ? 'animate-pulseRing bg-white text-rose-600' : 'bg-amber-500 text-white'}`} aria-hidden>!</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{crit ? 'Allarme: avvisa il medico e apri le schede proposte' : 'Da documentare o verificare'}</p>
        <p className={`text-xs ${crit ? 'text-rose-50' : 'text-amber-900'}`}>{top.map((r) => `${r.q.label} ${pct(r.probability)}`).join(', ')}</p>
      </div>
    </div>
  );
}

export function ReportView({ report, mock, onHover }: { report: Report; mock: boolean; onHover: Hover }) {
  const found = report.vitals.filter((v) => v.value).length;
  return (
    <div className="space-y-5">
      <InfoBox />

      <section aria-label="Segnalazioni" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Segnalazioni</h3>
          <span className="text-[11px] text-slate-500">Stato delle 9 aree</span>
        </div>
        <Verdict report={report} mock={mock} />
        <AreaStrip aree={report.aree} />
        {report.segnalazioni.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">{report.segnalazioni.map((r) => <RiskCard key={r.q.id} r={r} mock={mock} onHover={onHover} />)}</div>
        )}
      </section>

      <Section title="Eventi da documentare" hint="Caduta, lesioni, contenzione, dolore, terapia, PS" rows={report.eventi} mock={mock} onHover={onHover} empty="Nessun evento sopra soglia." />
      {report.monitoraggio.length > 0 && (
        <Section title="Aree da monitorare" hint="Nutrizione, infezioni, umore, autonomia" rows={report.monitoraggio} mock={mock} onHover={onHover} empty="" />
      )}

      {report.pai && (
        <div className="animate-rise flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Proposta: rivaluta il PAI</p>
            <p className="text-xs text-slate-600">{report.pai.reason}. Regola dell'app, non di Jev.</p>
          </div>
          <a href={report.pai.href} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800">Proposta: {SCHEDE.pai}</a>
        </div>
      )}

      {(report.possibili.length > 0 || report.esclusi.length > 0) && (
        <section aria-label="Sotto soglia" className="space-y-2">
          {report.possibili.length > 0 && (
            <p className="text-xs text-slate-600">
              <span className="font-medium">Sotto soglia, da tenere d'occhio:</span>{' '}
              {report.possibili.map((r) => `${r.q.label} ${pct(r.probability)}`).join(', ')}
            </p>
          )}
          {report.esclusi.length > 0 && (
            <div>
              <p className="text-xs text-slate-500">Nominati nel testo ma esclusi da {mock ? 'Jev (simulato)' : 'Jev'}:</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {report.esclusi.map((r) => (
                  <li key={r.q.id} onMouseEnter={() => onHover(r.negatedSnippet || r.snippet)} onMouseLeave={() => onHover(null)}
                    className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-white tabular" title={`Nel testo: “${(r.negatedSnippet || r.snippet)?.text}”`}>
                    {r.q.label} {pct(r.probability)} no
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-label="Parametri">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Parametri letti dal parser</h3>
          <span className="text-xs text-slate-500 tabular">{found === 0 ? 'Nessun numero nel testo' : `${found} valori`}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {report.vitals.map((v, i) => <VitalCard key={v.id} v={v} mock={mock} onHover={onHover} i={i} />)}
        </div>
      </section>
    </div>
  );
}
