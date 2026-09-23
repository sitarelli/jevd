import { notFound } from 'next/navigation';
import { StubForm } from '../../../components/StubForm';
import { SCHEDE_CONFIG, news2 } from '../../../lib/schede';
import { QUESTION_BY_ID, type SchedaId } from '../../../lib/jev-questions';

type SP = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === 'string' && v !== '' ? v : undefined);
const num = (v: string | string[] | undefined) => (str(v) !== undefined && !isNaN(+str(v)!) ? +str(v)! : null);

export default function SchedaPage({ params, searchParams }: { params: { tipo: string }; searchParams: SP }) {
  const cfg = SCHEDE_CONFIG[params.tipo as SchedaId];
  if (!cfg) notFound();

  let fields = cfg.fields.map((f) => {
    const raw = f.param ? str(searchParams[f.param]) : undefined;
    const value = raw ? (f.map ? f.map[raw] || raw : f.param === 'aree' ? raw.split('|').join(', ') : f.param === 'nrs' ? `${raw}/10` : raw) : undefined;
    return { label: f.label, value, placeholder: f.placeholder };
  });

  if (params.tipo === 'news') {
    const parts: [string, keyof typeof news2, string][] = [['PA sistolica', 'pas', 'mmHg'], ['Frequenza cardiaca', 'fc', 'bpm'], ['SpO₂ (scala 1)', 'sat', '%'], ['Temperatura', 'temp', '°C']];
    const known = parts.map(([label, k, u]) => ({ label, v: num(searchParams[k]), f: news2[k], u }));
    const got = known.filter((x) => x.v !== null);
    const tot = got.reduce((a, x) => a + x.f(x.v as number), 0);
    fields = [
      ...known.map((x) => ({ label: x.label, value: x.v !== null ? `${x.v} ${x.u} (punti ${x.f(x.v)})` : undefined, placeholder: 'Non disponibile' })),
      { label: 'NEWS2 parziale', value: got.length ? `${tot} punti su ${got.length} parametri` : undefined, placeholder: 'Nessun parametro' },
      { label: 'Frequenza respiratoria', value: undefined, placeholder: 'Da rilevare' },
      { label: 'Coscienza (ACVPU)', value: undefined, placeholder: 'Da rilevare' },
    ];
  }

  const q = str(searchParams.q) ? QUESTION_BY_ID[str(searchParams.q)!] : undefined;
  const origin = q ? `Proposta da Jev: ${q.label}${str(searchParams.p) ? ` ${str(searchParams.p)}%` : ''}.` : undefined;
  return <StubForm title={cfg.title} subtitle={cfg.subtitle} scale={cfg.scale} origin={origin} fields={fields} params={searchParams} />;
}
