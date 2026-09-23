import type { SchedaId } from './jev-questions';

export type Field = { label: string; param?: string; map?: Record<string, string>; placeholder?: string };
export type SchedaConfig = { title: string; subtitle: string; scale: string; fields: Field[] };

const SEDE = { sacrale: 'Sacrale', tallone: 'Tallone', trocantere: 'Trocantere', ischiatica: 'Ischiatica', gomito: 'Gomito', altro: 'Altra sede' };
const FONDO = { arrossamento: 'Arrossamento', granulazione: 'Granulazione', fibrina: 'Fibrina', necrosi: 'Necrosi' };

export const SCHEDE_CONFIG: Record<SchedaId, SchedaConfig> = {
  cadute: {
    title: 'Scheda evento caduta', scale: 'Raccomandazione Min. Salute n. 13; Conley',
    subtitle: 'Registrazione della caduta, esiti e rivalutazione del rischio.',
    fields: [
      { label: 'Quando', param: 'quando', map: { turno_attuale: 'Nel turno / stamattina', giorni_precedenti: 'Nei giorni precedenti' } },
      { label: 'Sospetta frattura', param: 'frattura', map: { '1': 'Sì: non mobilizzare, avvisa il medico' }, placeholder: 'No' },
      { label: 'Luogo e dinamica', placeholder: 'Es. bagno, non testimoniata' },
      { label: 'Trauma cranico / anticoagulanti', placeholder: 'Sì / No' },
      { label: 'Rischio cadute (Conley)', placeholder: 'Punteggio' },
      { label: 'Medico e familiari avvisati', placeholder: 'Ora' },
    ],
  },
  lesioni: {
    title: 'Scheda lesioni cutanee', scale: 'NPIAP/EPUAP 2019; ISTAP; Braden',
    subtitle: 'Valutazione, classificazione e piano di medicazione.',
    fields: [
      { label: 'Sede', param: 'sede', map: SEDE },
      { label: 'Stadio / tipo', param: 'stadio', placeholder: 'LDP I-IV, skin tear 1-3' },
      { label: 'Fondo', param: 'fondo', map: FONDO },
      { label: 'Braden', placeholder: 'Punteggio' },
      { label: 'Medicazione', placeholder: 'Prodotto e frequenza' },
    ],
  },
  contenzione: {
    title: 'Scheda contenzione fisica', scale: 'CNB 2015; linee di indirizzo regionali',
    subtitle: 'La contenzione è un atto eccezionale: servono prescrizione, motivazione, durata, controlli e rivalutazione.',
    fields: [
      { label: 'Tipo di mezzo', placeholder: 'Spondine, cintura, tavolino' },
      { label: 'Prescrizione medica', placeholder: 'Medico, data, ora' },
      { label: 'Motivazione e alternative tentate', placeholder: 'Da compilare' },
      { label: 'Controlli e rivalutazione', placeholder: 'Ogni ... ore' },
      { label: 'Informazione a familiari / AdS', placeholder: 'Da compilare' },
    ],
  },
  nutrizionale: {
    title: 'Scheda nutrizionale e idratazione', scale: 'MNA-SF / MUST; bilancio idrico; test disfagia',
    subtitle: 'Screening del rischio malnutrizione, idratazione e deglutizione.',
    fields: [
      { label: 'MNA-SF', placeholder: 'Punteggio 0-14' },
      { label: 'Peso e variazione', placeholder: 'kg, % in 3 mesi' },
      { label: 'Introito (diario 3 giorni)', placeholder: 'Da compilare' },
      { label: 'Liquidi assunti / 24 h', placeholder: 'ml' },
      { label: 'Deglutizione', placeholder: 'Test acqua / GUSS, dieta modificata' },
    ],
  },
  news: {
    title: 'Scheda NEWS2 / deterioramento', scale: 'NEWS2 Royal College of Physicians 2017',
    subtitle: 'Punteggio parziale dai parametri del diario. Mancano frequenza respiratoria, coscienza (ACVPU) e ossigenoterapia: completali prima di decidere.',
    fields: [],
  },
  infezioni: {
    title: 'Scheda sorveglianza infezioni', scale: 'Criteri McGeer revisionati (Stone 2012)',
    subtitle: 'Sospetto clinico, precauzioni e uso appropriato degli antibiotici.',
    fields: [
      { label: 'Sito sospetto', placeholder: 'Respiratorio, urinario, gastrointestinale, cute' },
      { label: 'Criteri McGeer soddisfatti', placeholder: 'Sì / No' },
      { label: 'Precauzioni / isolamento', placeholder: 'Contatto, droplet' },
      { label: 'Esami richiesti', placeholder: 'Urinocoltura solo se sintomatico' },
    ],
  },
  dolore: {
    title: 'Scheda dolore', scale: 'NRS / PAINAD; Legge 38/2010 art. 7',
    subtitle: 'Rilevazione del dolore in cartella, trattamento e rivalutazione.',
    fields: [
      { label: 'Intensità NRS', param: 'nrs', placeholder: 'Non indicata nel diario' },
      { label: 'PAINAD (se non comunicante)', placeholder: 'Punteggio 0-10' },
      { label: 'Sede e caratteristiche', placeholder: 'Da compilare' },
      { label: 'Terapia e rivalutazione', placeholder: 'Farmaco, ora, NRS dopo 30-60 min' },
    ],
  },
  delirium: {
    title: 'Valutazione delirium', scale: '4AT (validata in italiano) o CAM',
    subtitle: 'Delirium probabile con esordio acuto/fluttuante + deficit di attenzione + pensiero disorganizzato o coscienza alterata.',
    fields: [
      { label: 'Vigilanza', placeholder: '4AT item 1' },
      { label: 'AMT4 (orientamento)', placeholder: '4AT item 2' },
      { label: 'Attenzione (mesi al contrario)', placeholder: '4AT item 3' },
      { label: 'Esordio acuto o fluttuante', placeholder: '4AT item 4' },
      { label: 'Cause da cercare', placeholder: 'Dolore, globo, fecaloma, infezione, farmaci, disidratazione' },
    ],
  },
  bpsd: {
    title: 'Scheda BPSD', scale: 'NPI-NH; Cohen-Mansfield',
    subtitle: 'Disturbi del comportamento: fattori scatenanti e interventi, prima non farmacologici.',
    fields: [
      { label: 'Comportamento osservato', placeholder: 'Agitazione, aggressività, wandering, deliri' },
      { label: 'Fattore scatenante', placeholder: 'Dolore, rumore, cura igienica, orario' },
      { label: 'Intervento non farmacologico', placeholder: 'Da compilare' },
      { label: 'NPI-NH', placeholder: 'Punteggio' },
    ],
  },
  pai: {
    title: 'Rivalutazione PAI', scale: 'VMD regionale (es. SVaMA in Veneto); InterRAI; Barthel',
    subtitle: 'Il Piano Assistenziale Individualizzato si rivede quando le condizioni cambiano in modo duraturo.',
    fields: [
      { label: 'Aree cambiate', param: 'aree' },
      { label: 'Barthel attuale', placeholder: 'Punteggio' },
      { label: 'Obiettivi rivisti', placeholder: 'Da compilare con l\'équipe' },
      { label: 'Convocazione UVMD / équipe', placeholder: 'Data' },
    ],
  },
  trasferimento: {
    title: 'Scheda di trasferimento', scale: 'SBAR; INTERACT',
    subtitle: 'Comunicazione strutturata verso PS o ospedale.',
    fields: [
      { label: 'S - Situazione', placeholder: 'Perché si invia' },
      { label: 'B - Background', placeholder: 'Diagnosi, terapia, allergie, DAT' },
      { label: 'A - Valutazione', placeholder: 'Parametri, NEWS2' },
      { label: 'R - Richiesta', placeholder: 'Cosa si chiede al PS' },
    ],
  },
};

// NEWS2 (RCP 2017) per i parametri disponibili dal diario
export const news2 = {
  pas: (x: number) => (x <= 90 ? 3 : x <= 100 ? 2 : x <= 110 ? 1 : x <= 219 ? 0 : 3),
  fc: (x: number) => (x <= 40 ? 3 : x <= 50 ? 1 : x <= 90 ? 0 : x <= 110 ? 1 : x <= 130 ? 2 : 3),
  sat: (x: number) => (x <= 91 ? 3 : x <= 93 ? 2 : x <= 95 ? 1 : 0),
  temp: (x: number) => (x <= 35 ? 3 : x <= 36 ? 1 : x <= 38 ? 0 : x <= 39 ? 1 : 2),
};
