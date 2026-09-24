/**
 * Logica anti-duplicati per la dettatura (pura, testabile senza browser).
 *
 * Problemi noti del riconoscimento vocale su mobile:
 *  1. Android: con continuous=true ogni risultato finale può contenere TUTTO il testo della sessione.
 *  2. Android: lo stesso risultato finale arriva più volte con lo stesso indice.
 *  3. Dopo un riavvio in onend la frase precedente viene riemessa.
 */
const norm = (s: string) => s.toLowerCase().replace(/[.,;:!?]+/g, ' ').replace(/\s+/g, ' ').trim();

export function createTranscriptMerger(opts: { debounceMs?: number; repeatWindowMs?: number } = {}) {
  const debounceMs = opts.debounceMs ?? 800;
  const repeatWindowMs = opts.repeatWindowMs ?? 5000;
  let lastTranscript = '';        // tutto il testo accodato finora (per il controllo endsWith)
  let lastText = '';
  let lastAt = -Infinity;
  let sessionFinal = '';          // testo finale già visto nella sessione corrente
  let processed = new Set<number>();

  return {
    /** Da chiamare a ogni start() del riconoscimento. */
    newSession() { sessionFinal = ''; processed = new Set(); },
    /** Da chiamare quando l'utente preme Svuota o riparte da zero. */
    reset() { lastTranscript = ''; lastText = ''; lastAt = -Infinity; sessionFinal = ''; processed = new Set(); },
    /** Restituisce il testo da accodare, o null se è un duplicato. Solo per risultati isFinal. */
    push(index: number, transcript: string, now: number): string | null {
      let t = (transcript || '').trim();
      if (!t) return null;
      if (processed.has(index)) return null;                // (2) stesso risultato ripetuto
      processed.add(index);

      if (sessionFinal && norm(t).startsWith(norm(sessionFinal))) {   // (1) testo cumulativo
        const words = sessionFinal.split(/\s+/).length;
        const delta = t.split(/\s+/).slice(words).join(' ').trim();
        sessionFinal = t;
        t = delta;
        if (!t) return null;
      } else {
        sessionFinal = `${sessionFinal} ${t}`.trim();
      }

      const n = norm(t);
      if (n === norm(lastText) && now - lastAt < debounceMs) return null;   // debounce 800 ms
      // (3) riemissione dopo riavvio: il testo accodato finisce già con questa frase (a parole intere)
      const tail = norm(lastTranscript);
      if (now - lastAt < repeatWindowMs && (tail === n || tail.endsWith(' ' + n))) return null;

      lastText = t;
      lastAt = now;
      lastTranscript = `${lastTranscript} ${t}`.trim();
      return t;
    },
  };
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS = /Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}
