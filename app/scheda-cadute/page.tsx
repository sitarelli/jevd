import { StubForm } from '../../components/StubForm';

const QUANDO: Record<string, string> = { turno_attuale: 'Nel turno / stanotte', giorni_precedenti: 'Nei giorni precedenti' };

export default function SchedaCadute({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = typeof searchParams.quando === 'string' ? searchParams.quando : undefined;
  return (
    <StubForm
      title="Scheda segnalazione caduta"
      subtitle="Registrazione evento, dinamica e rivalutazione del rischio."
      params={searchParams}
      fields={[
        { label: 'Quando', value: q ? QUANDO[q] || q : undefined },
        { label: 'Luogo', value: undefined, placeholder: 'Es. bagno, accanto al letto' },
        { label: 'Conseguenze', value: undefined, placeholder: 'Traumi, ematomi, dolore' },
        { label: 'Medico avvisato', value: undefined, placeholder: 'Sì / No, ora' },
      ]}
    />
  );
}
