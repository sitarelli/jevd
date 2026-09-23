'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dettatura con Web Speech API (Chrome, Edge, Safari).
 * Firefox non la supporta: in quel caso `supported` è false.
 * Richiede HTTPS (Vercel lo è) o localhost.
 */

export type DictationState = 'idle' | 'starting' | 'listening' | 'error';

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Accesso al microfono negato. Consenti il microfono dall\'icona a sinistra dell\'indirizzo e riprova.',
  'service-not-allowed': 'Il browser non consente il riconoscimento vocale su questa pagina.',
  'audio-capture': 'Nessun microfono disponibile. Collegane uno o controlla le impostazioni di sistema.',
  'no-speech': 'Non ho sentito nulla. Avvicinati al microfono e riprova.',
  network: 'Il riconoscimento vocale del browser richiede la connessione a internet.',
  'language-not-supported': 'Italiano (it-IT) non disponibile nel riconoscimento vocale di questo browser.',
  aborted: '',
};

/** Piccole normalizzazioni per la dettatura clinica in italiano. */
export function normalizeDictation(s: string) {
  return s
    .replace(/(\d)\s+virgola\s+(\d)/gi, '$1,$2')
    .replace(/(\d)\s*(?:per\s?cento|percento)/gi, '$1%')
    .replace(/(\d)\s+gradi\b/gi, '$1 °C')
    .replace(/\bpunto e virgola\b/gi, ';')
    .replace(/\s+(virgola)\s+/gi, ', ')
    .replace(/\s+punto\s*$/i, '.');
}

export function useDictation(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<DictationState>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => { wantRef.current = false; try { recRef.current?.abort(); } catch {} };
  }, []);

  const start = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setError('Questo browser non supporta la dettatura. Usa Chrome, Edge o Safari, oppure la dettatura della tastiera del telefono.'); setState('error'); return; }
    if (!window.isSecureContext) { setError('La dettatura richiede HTTPS. Apri la versione pubblicata su Vercel.'); setState('error'); return; }

    const rec = new SR();
    rec.lang = 'it-IT';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { setState('listening'); setError(null); };
    rec.onresult = (ev: any) => {
      let live = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) onFinalRef.current(normalizeDictation(r[0].transcript.trim()));
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (ev: any) => {
      const code = ev?.error || 'unknown';
      if (code === 'no-speech' && wantRef.current) return; // Chrome: pausa lunga, si riavvia da solo
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') wantRef.current = false;
      const msg = ERROR_TEXT[code] ?? `Errore dettatura: ${code}`;
      if (msg) { setError(msg); setState('error'); }
    };
    rec.onend = () => {
      setInterim('');
      if (wantRef.current) {
        // Chrome chiude la sessione dopo qualche secondo di silenzio: la riapriamo.
        try { rec.start(); return; } catch {}
      }
      setState((s) => (s === 'error' ? s : 'idle'));
    };

    recRef.current = rec;
    wantRef.current = true;
    setState('starting');
    try { rec.start(); } catch (e: any) { setError(e?.message || 'Impossibile avviare la dettatura'); setState('error'); wantRef.current = false; }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    try { recRef.current?.stop(); } catch {}
    setState('idle');
  }, []);

  const toggle = useCallback(() => {
    if (state === 'listening' || state === 'starting') stop(); else start();
  }, [state, start, stop]);

  return { supported, state, interim, error, start, stop, toggle, clearError: () => setError(null) };
}
