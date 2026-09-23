import Link from 'next/link';

export function StubForm({ title, subtitle, scale, origin, fields, params }: {
  title: string; subtitle: string; scale?: string; origin?: string;
  fields: { label: string; value: string | undefined; placeholder?: string }[];
  params: Record<string, string | string[] | undefined>;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm font-medium text-blue-700 hover:underline">‹ Torna al diario</Link>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs text-slate-500">Scheda dimostrativa{scale ? `: ${scale}` : ''}</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        {params.source === 'jev' && (
          <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">{origin || 'Aperta su proposta di Jev.'} I campi precompilati dal diario vanno confermati dall'operatore.</p>
        )}
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-xs font-medium text-slate-500">{f.label}</dt>
              <dd className={`mt-1 rounded-lg border px-3 py-2 text-sm ${f.value ? 'border-blue-200 bg-blue-50/50 text-slate-900' : 'border-slate-200 text-slate-400'}`}>{f.value || f.placeholder || 'Da compilare'}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-slate-500">Parametri ricevuti</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(params, null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
