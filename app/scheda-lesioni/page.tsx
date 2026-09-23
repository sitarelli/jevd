import { StubForm } from '../../components/StubForm';

const LABEL: Record<string, string> = {
  sacrale: 'Sacrale', tallone: 'Tallone', trocantere: 'Trocantere', ischiatica: 'Ischiatica', gomito: 'Gomito', altro: 'Altra sede',
  arrossamento: 'Arrossamento', granulazione: 'Granulazione', fibrina: 'Fibrina', necrosi: 'Necrosi',
};
const s = (v: string | string[] | undefined) => (typeof v === 'string' ? LABEL[v] || v : undefined);

export default function SchedaLesioni({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  return (
    <StubForm
      title="Scheda lesioni cutanee"
      subtitle="Valutazione e monitoraggio della lesione."
      params={searchParams}
      fields={[
        { label: 'Sede', value: s(searchParams.sede) },
        { label: 'Stadio', value: typeof searchParams.stadio === 'string' ? searchParams.stadio : undefined, placeholder: 'I–IV / non stadiabile' },
        { label: 'Fondo', value: s(searchParams.fondo) },
        { label: 'Medicazione', value: undefined, placeholder: 'Prodotto e frequenza' },
      ]}
    />
  );
}
