/**
 * Domande Jev per la cartella clinica.
 *
 * Schema ufficiale Vercel AI Gateway (/v1/evaluate) — vedi
 * https://vercel.com/docs/ai-gateway/modalities/evaluation
 *
 *   boolean -> { type: 'boolean', instructions, criteria?: { true, false } }
 *   choice  -> { type: 'choice',  instructions, criteria: { chiave: descrizione } }   (max 255 opzioni)
 *   score   -> { type: 'score',   instructions, criteria: [livello0, livello1, ...] }  (da 2 a 10 livelli)
 *
 * NB: i campi `question`, `options`, `min`, `max` NON esistono nello schema:
 * la vecchia versione li usava ed è per questo che il Gateway rispondeva 400.
 *
 * NB 2: Jev NON estrae numeri liberi (es. "72 kg"). Restituisce probabilità
 * su opzioni/livelli che definiamo noi. Per questo i valori numerici li legge
 * il parser locale (lib/parser.ts) e Jev classifica/conferma con probabilità
 * calibrate (febbre sì/no, fascia pressoria, caduta, sede lesione, ...).
 */

export type BooleanQuestion = {
  type: 'boolean';
  instructions: string;
  criteria?: { true: string; false: string };
};
export type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
};
export type ScoreQuestion = {
  type: 'score';
  instructions: string;
  criteria: string[];
};
export type JevQuestion = BooleanQuestion | ChoiceQuestion | ScoreQuestion;

export const EHR_QUESTIONS = {
  // ---------------- Eventi ----------------
  caduta: {
    type: 'boolean',
    instructions:
      'Il diario riporta che il paziente è caduto (caduta, scivolata, inciampato, trovato a terra)?',
    criteria: {
      true: 'Il testo afferma che una caduta è avvenuta, oggi o nei giorni precedenti.',
      false: 'Nessuna caduta riportata, oppure il testo la esclude (es. "non cadute", "nessuna caduta").',
    },
  },
  caduta_quando: {
    type: 'choice',
    instructions: 'Quando è avvenuta la caduta descritta nel diario?',
    criteria: {
      turno_attuale: 'Durante il turno o la notte appena trascorsa (stanotte, oggi, poco fa).',
      giorni_precedenti: 'In un giorno precedente (ieri, due giorni fa, la settimana scorsa).',
      nessuna: 'Nel testo non è riportata alcuna caduta.',
    },
  },
  lesione: {
    type: 'boolean',
    instructions:
      'Il diario descrive una lesione cutanea (lesione da pressione, piaga, decubito, ulcera, ferita, escoriazione, arrossamento da pressione)?',
    criteria: {
      true: 'Una lesione cutanea è presente e descritta.',
      false: 'Nessuna lesione cutanea descritta, oppure viene esclusa. Una ferita chirurgica pulita non conta come lesione.',
    },
  },
  lesione_sede: {
    type: 'choice',
    instructions: 'Qual è la sede anatomica della lesione cutanea descritta?',
    criteria: {
      sacrale: 'Regione sacrale o sacro-coccigea.',
      tallone: 'Tallone destro o sinistro.',
      trocantere: 'Regione trocanterica / anca.',
      ischiatica: 'Regione ischiatica / glutea.',
      gomito: 'Gomito.',
      altro: 'Altra sede anatomica.',
      nessuna: 'Nessuna lesione descritta.',
    },
  },
  lesione_fondo: {
    type: 'choice',
    instructions: 'Come viene descritto il letto della lesione?',
    criteria: {
      arrossamento: 'Solo eritema / arrossamento, cute integra (stadio 1).',
      granulazione: 'Tessuto di granulazione, fondo rosso e deterso.',
      fibrina: 'Presenza di fibrina o slough giallastro.',
      necrosi: 'Escara o tessuto necrotico nero.',
      non_indicato: 'Il fondo della lesione non è descritto, o non c\'è lesione.',
    },
  },

  // ---------------- Parametri vitali (fasce) ----------------
  temperatura: {
    type: 'choice',
    instructions: 'In che fascia rientra la temperatura corporea riportata nel diario?',
    criteria: {
      ipotermia: 'Sotto 35 °C.',
      normale: 'Tra 35 e 37,2 °C, apiretico.',
      febbricola: 'Tra 37,3 e 37,9 °C.',
      febbre: 'Tra 38 e 39,4 °C.',
      iperpiressia: '39,5 °C o più.',
      non_rilevata: 'Temperatura non riportata nel testo.',
    },
  },
  pressione: {
    type: 'choice',
    instructions: 'In che fascia rientra la pressione arteriosa riportata (sistolica/diastolica)?',
    criteria: {
      ipotensione: 'Sistolica sotto 90 o diastolica sotto 60 mmHg.',
      normale: 'Sistolica 90-139 e diastolica 60-89 mmHg.',
      ipertensione: 'Sistolica 140-179 o diastolica 90-109 mmHg.',
      ipertensione_severa: 'Sistolica 180 o più, o diastolica 110 o più mmHg.',
      non_rilevata: 'Pressione arteriosa non riportata nel testo.',
    },
  },
  frequenza_cardiaca: {
    type: 'choice',
    instructions: 'In che fascia rientra la frequenza cardiaca riportata?',
    criteria: {
      bradicardia: 'Sotto 60 battiti al minuto.',
      normale: 'Tra 60 e 100 battiti al minuto.',
      tachicardia: 'Sopra 100 battiti al minuto.',
      non_rilevata: 'Frequenza cardiaca non riportata nel testo.',
    },
  },
  saturazione: {
    type: 'choice',
    instructions: 'In che fascia rientra la saturazione di ossigeno (SpO2) riportata?',
    criteria: {
      normale: '95% o più.',
      ridotta: 'Tra 90% e 94%.',
      ipossiemia: 'Sotto il 90%.',
      non_rilevata: 'Saturazione non riportata nel testo.',
    },
  },
  glicemia: {
    type: 'choice',
    instructions: 'In che fascia rientra la glicemia riportata (mg/dL)?',
    criteria: {
      ipoglicemia: 'Sotto 70 mg/dL.',
      normale: 'Tra 70 e 140 mg/dL.',
      iperglicemia: 'Tra 141 e 250 mg/dL.',
      iperglicemia_severa: 'Sopra 250 mg/dL.',
      non_rilevata: 'Glicemia non riportata nel testo.',
    },
  },
  peso_andamento: {
    type: 'choice',
    instructions: 'Il diario indica una variazione del peso del paziente?',
    criteria: {
      stabile: 'Peso riportato senza variazioni, o dichiarato stabile.',
      calo: 'Calo o perdita di peso.',
      aumento: 'Aumento di peso.',
      non_indicato: 'Nessuna informazione sull\'andamento del peso.',
    },
  },

  // ---------------- Dolore ----------------
  dolore: {
    type: 'boolean',
    instructions: 'Il paziente riferisce dolore?',
    criteria: {
      true: 'Dolore riferito o rilevato, di qualsiasi intensità maggiore di zero.',
      false: 'Dolore assente, negato, pari a 0, oppure non menzionato.',
    },
  },
  dolore_intensita: {
    type: 'score',
    instructions: 'Quanto è intenso il dolore riferito (scala NRS 0-10)?',
    criteria: [
      'Assente: NRS 0',
      'Lieve: NRS 1-3',
      'Moderato: NRS 4-6',
      'Severo: NRS 7-8',
      'Insopportabile: NRS 9-10',
    ],
  },
  dolore_toracico: {
    type: 'boolean',
    instructions: 'Il dolore riferito è localizzato al torace (dolore toracico, oppressione retrosternale)?',
  },

  // ---------------- Eliminazione ----------------
  diuresi: {
    type: 'choice',
    instructions: 'Come viene descritta la diuresi?',
    criteria: {
      regolare: 'Diuresi regolare, valida, presente.',
      ridotta: 'Diuresi ridotta, scarsa, oliguria.',
      assente: 'Anuria o diuresi assente.',
      aumentata: 'Poliuria o diuresi aumentata.',
      non_indicata: 'Diuresi non menzionata.',
    },
  },
  alvo: {
    type: 'choice',
    instructions: 'Come viene descritto l\'alvo (evacuazione)?',
    criteria: {
      regolare: 'Alvo regolare o canalizzato, nella norma.',
      stitico: 'Alvo chiuso, stitichezza, non evacua da giorni.',
      diarroico: 'Scariche diarroiche, feci liquide.',
      non_indicato: 'Alvo non menzionato.',
    },
  },

  // ---------------- Segni di allarme ----------------
  dispnea: {
    type: 'boolean',
    instructions: 'Il paziente presenta dispnea, affanno o difficoltà respiratoria?',
  },
  sudorazione: {
    type: 'boolean',
    instructions: 'È riportata sudorazione profusa o diaforesi?',
  },
  stato_mentale: {
    type: 'choice',
    instructions: 'Come viene descritto lo stato di coscienza / orientamento del paziente?',
    criteria: {
      vigile_orientato: 'Vigile, orientato, collaborante.',
      confuso: 'Confuso, disorientato, agitato.',
      soporoso: 'Soporoso, poco reattivo.',
      non_indicato: 'Stato mentale non descritto.',
    },
  },
} satisfies Record<string, JevQuestion>;

export type QuestionId = keyof typeof EHR_QUESTIONS;

/**
 * Validazione locale dello schema, PRIMA di chiamare il Gateway.
 * Così un errore di configurazione si vede con un messaggio chiaro
 * invece di un 400 generico.
 */
export function validateQuestions(questions: Record<string, JevQuestion>): string[] {
  const errors: string[] = [];
  for (const [id, q] of Object.entries(questions)) {
    const anyQ = q as any;
    for (const legacy of ['question', 'options', 'min', 'max', 'description']) {
      if (legacy in anyQ) errors.push(`${id}: campo "${legacy}" non previsto dallo schema (usa instructions/criteria)`);
    }
    if (!['boolean', 'choice', 'score'].includes(anyQ.type)) {
      errors.push(`${id}: type "${anyQ.type}" non valido (boolean | choice | score)`);
      continue;
    }
    if (typeof q.instructions !== 'string' || !q.instructions.trim()) {
      errors.push(`${id}: instructions mancante`);
    }
    if (q.type === 'choice') {
      const n = Object.keys(q.criteria || {}).length;
      if (n < 2 || n > 255) errors.push(`${id}: choice richiede da 2 a 255 opzioni (ne ha ${n})`);
    }
    if (q.type === 'score') {
      const n = Array.isArray(q.criteria) ? q.criteria.length : 0;
      if (n < 2 || n > 10) errors.push(`${id}: score richiede da 2 a 10 livelli (ne ha ${n})`);
    }
    if (q.type === 'boolean' && q.criteria) {
      if (typeof q.criteria.true !== 'string' || typeof q.criteria.false !== 'string') {
        errors.push(`${id}: criteria boolean deve avere "true" e "false" stringa`);
      }
    }
  }
  return errors;
}
