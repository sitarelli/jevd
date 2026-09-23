'use client';
import type { Report, Status, JevReading, VitalRow, EventRow, SignRow } from '../lib/clinical';
import type { Span } from '../lib/parser';

export const STATUS_STYLE: Record<Status, { dot: string; ring: string; text: string; bg: string; label: string }> = {
  ok: { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700', bg: 'bg-emerald-50', label: 'Nella norma' },
  warn: { dot: 'bg-amber-500', ring: 'ring-amber-200', text: 'text-amber-700', bg: 'bg-amber-50', label: 'Da monitorare' },
  crit: { dot: 'bg-rose-600', ring: 'ring-rose-200', text: 'text-rose-700', bg: 'bg-rose-50', label: 'Critico' },
  none: { dot: 'bg-slate-300', ring: 'ring-slate-200', text: 'text-slate-500', bg: 'bg-slate-50', label: 'Non rilevato' },
};

const pct = (n: number) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—');

export function ConfidenceBadge({ jev, mock }: { jev: JevReading | null; mock: boolean }) {
  if (!jev) return null;
  const p = jev.probability;
  const tone = !Number.isFinite(p) ? 'bg-slate-100 text-slate-600'
    : p >= 0.85 ? 'bg-blue-600 text-white'
    : p >= 0.6 ? 'bg-blue-100 text-blue-800'
    : 'bg-amber-100 text-amber-800';
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium tabular ${tone}`} title={mock ? 'Valore simulato: attiva Jev per le probabilità reali' : 'Probabilità assegnata da Jev all\'esito scelto'}>
        {mock ? 'Sim.' : 'Jev'} {jev.label} {pct(p)}
      </span>
      {jev.confidence != null && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 tabular" title="Concentrazione della distribuzione (0 = incerta, 1 = netta)">
          conf. {jev.confidence.toFixed(2)}
        </span>
      )}
      {jev.agrees === true && <span className="text-emerald-700" title="La fascia di Jev coincide con il valore letto nel testo">✓ concorde</span>}
      {jev.agrees === false && <span className="font-medium text-amber-700" title="Jev e il valore letto nel testo indicano fasce diverse: verificare">⚠ discorde</span>}
      {Number.isFinite(p) && p < 0.6 && <span className="font-medium text-amber-700">da verificare</span>}
    </div>
  );
}

function Snippet({ span, onHover }: { span: Span | null; onHover: (s: Span | null) => void }) {
  if (!span) return null;
  return (
    <p
      className="mt-2 line-clamp-2 border-l-2 border-slate-200 pl-2 text-xs italic text-slate-500"
      onMouseEnter={() => onHover(span)}
      onMouseLeave={() => onHover(null)}
    >
      “{span.text}”
    </p>
  );
}

function VitalCard({ v, mock, onHover, i }: { v: VitalRow; mock: boolean; onHover: (s: Span | null) => void; i: number }) {
  const s = STATUS_STYLE[v.status];
  return (
    <div
      className={`animate-rise rounded-xl border bg-white p-3 ${v.status === 'none' ? 'border-dashed border-slate-200' : 'border-slate-200'}`}
      style={{ animationDelay: `${i * 35}ms` }}
      onMouseEnter={() => onHover(v.snippet)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{v.label}</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.bg} ${s.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {v.status === 'none' ? s.label : v.bandLabel || s.label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular ${v.value ? 'text-slate-900' : 'text-slate-300'}`}>{v.value ?? '—'}</span>
        {v.value && <span className="text-xs text-slate-500">{v.unit}</span>}
      </div>
      <div className="mt-1.5 min-h-[20px]">
        {v.status !== 'none' || (v.jev && !mock) ? <ConfidenceBadge jev={v.jev} mock={mock} /> : null}
      </div>
      <Snippet span={v.snippet} onHover={onHover} />
    </div>
  );
}

function EventCard({ e, mock, onHover }: { e: EventRow; mock: boolean; onHover: (s: Span | null) => void }) {
  const isFall = e.id === 'caduta';
  const title = isFall ? 'Caduta' : 'Lesione cutanea';
  if (!e.detected) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">{title}</span>
          <span className="text-xs text-slate-400">{mock ? 'non rilevata' : `non rilevata (p ${pct(e.probability)})`}</span>
        </div>
        {e.detail.map((d) => <p key={d} className="mt-1 text-xs text-slate-500">{d}</p>)}
        <Snippet span={e.snippet} onHover={onHover} />
      </div>
    );
  }
  const tone = isFall ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60';
  const btn = isFall ? 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-300' : 'bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-300';
  return (
    <div className={`animate-rise rounded-xl border p-3 ${tone}`} onMouseEnter={() => onHover(e.snippet)} onMouseLeave={() => onHover(null)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{isFall ? '⚠️' : '🩹'} {title} rilevata</p>
          <p className="mt-0.5 text-xs text-slate-600">{e.detail.join(' · ') || 'Dettagli non indicati nel diario'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular ${e.probability >= 0.85 ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>
          {mock ? 'Sim.' : 'Jev'} {pct(e.probability)}
        </span>
      </div>
      <Snippet span={e.snippet} onHover={onHover} />
      <a
        href={e.href}
        className={`mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white outline-none transition focus-visible:ring-4 ${btn}`}
      >
        Proposta: {e.cta}
      </a>
    </div>
  );
}

function SignList({ signs, mock, onHover }: { signs: SignRow[]; mock: boolean; onHover: (s: Span | null) => void }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {signs.map((s) => {
        const st = STATUS_STYLE[s.status];
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" onMouseEnter={() => onHover(s.snippet)} onMouseLeave={() => onHover(null)}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
            <span className="w-32 text-sm text-slate-600">{s.label}</span>
            <span className={`text-sm font-medium ${s.status === 'none' ? 'text-slate-400' : 'text-slate-900'}`}>{s.value}</span>
            <span className="ml-auto">{(s.status !== 'none' || !mock) && <ConfidenceBadge jev={s.jev} mock={mock} />}</span>
            {s.snippet && s.status !== 'none' && <span className="basis-full truncate pl-5 text-xs italic text-slate-500">“{s.snippet.text}”</span>}
          </li>
        );
      })}
    </ul>
  );
}

const MARK: Record<string, string> = {
  ok: 'bg-emerald-100/80 decoration-emerald-500',
  warn: 'bg-amber-100 decoration-amber-500',
  crit: 'bg-rose-100 decoration-rose-500',
  none: 'bg-slate-100 decoration-slate-400',
  event: 'bg-blue-100 decoration-blue-500',
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
    parts.push(
      <mark key={i} className={`rounded px-0.5 text-slate-900 underline decoration-2 underline-offset-2 transition ${MARK[s.tone]} ${isFocus ? 'ring-2 ring-blue-500' : ''}`}>
        {text.slice(s.start, s.end)}
      </mark>,
    );
    cur = s.end;
  });
  if (cur < text.length) parts.push(text.slice(cur));
  return <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{parts}</p>;
}

export function ReportView({ report, mock, onHover }: { report: Report; mock: boolean; onHover: (s: Span | null) => void }) {
  const found = report.vitals.filter((v) => v.status !== 'none').length;
  return (
    <div className="space-y-5">
      {report.alerts.length > 0 && (
        <section aria-label="Segnalazioni" className="animate-rise rounded-xl border border-slate-200 bg-white p-3">
          <h3 className="text-sm font-semibold text-slate-900">Segnalazioni</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {report.alerts.map((a) => (
              <li key={a.text} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${a.level === 'crit' ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-900'}`}>{a.text}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">Soglie dimostrative, non validate clinicamente.</p>
        </section>
      )}

      <section aria-label="Eventi">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Eventi</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.events.map((e) => <EventCard key={e.id} e={e} mock={mock} onHover={onHover} />)}
        </div>
      </section>

      <section aria-label="Parametri vitali">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Parametri</h3>
          <span className="text-xs text-slate-500 tabular">{found} di {report.vitals.length} rilevati</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {report.vitals.map((v, i) => <VitalCard key={v.id} v={v} mock={mock} onHover={onHover} i={i} />)}
        </div>
      </section>

      <section aria-label="Segni ed eliminazione">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Segni, stato mentale, eliminazione</h3>
        <SignList signs={report.signs} mock={mock} onHover={onHover} />
      </section>
    </div>
  );
}
