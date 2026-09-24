'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createTranscriptMerger, isMobileDevice } from './dictationMerge';

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
  const isRecording = useRef(false);            // true solo finché l'utente non preme Ferma
  const mobileRef = useRef(false);
  const mergerRef = useRef(createTranscriptMerger({ debounceMs: 800 }));
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const w = window as any;
    // iOS Safari espone webkitSpeechRecognition, Chrome Android entrambi i nomi
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    mobileRef.current = isMobileDevice();
    return () => { isRecording.current = false; try { recRef.current?.abort(); } catch {} };
  }, []);

  const createRecognition = useCallback(() => {
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    const rec = new SR();
    const mobile = mobileRef.current;
    rec.lang = 'it-IT';
    // Mobile: una frase per sessione, solo risultati finali (è la causa principale dei doppioni).
    // Desktop: sessione continua con anteprima dei risultati parziali.
    rec.continuous = !mobile;
    rec.interimResults = !mobile;
    rec.maxAlternatives = 1;

    rec.onstart = () => { mergerRef.current.newSession(); setState('listening'); setError(null); };
    rec.onresult = (ev: any) => {
      let live = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) {
          const text = mergerRef.current.push(i, normalizeDictation(r[0].transcript), Date.now());
          if (text) onFinalRef.current(text);
        } else {
          live += r[0].transcript;
        }
      }
      setInterim(live);
    };
    rec.onerror = (ev: any) => {
      const code = ev?.error || 'unknown';
      if ((code === 'no-speech' || code === 'aborted') && isRecording.current) return; // pausa: si riprende in onend
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') isRecording.current = false;
      const msg = ERROR_TEXT[code] ?? `Errore dettatura: ${code}`;
      if (msg) { setError(msg); setState('error'); }
    };
    rec.onend = () => {
      setInterim('');
      if (!isRecording.current) { setState((s) => (s === 'error' ? s : 'idle')); return; } // l'utente ha fermato: niente riavvio
      // Ancora in registrazione: riapre la sessione (su mobile dopo ogni frase, su desktop dopo il silenzio)
      setTimeout(() => {
        if (!isRecording.current) return;
        try { rec.start(); } catch { isRecording.current = false; setState('idle'); }
      }, mobile ? 250 : 0);
    };
    return rec;
  }, []);

  const start = useCallback(() => {
    const w = window as any;
    if (!(w.SpeechRecognition || w.webkitSpeechRecognition)) { setError('Questo browser non supporta la dettatura. Usa Chrome, Edge o Safari, oppure la dettatura della tastiera del telefono.'); setState('error'); return; }
    if (!window.isSecureContext) { setError('La dettatura richiede HTTPS. Apri la versione pubblicata su Vercel.'); setState('error'); return; }
    if (isRecording.current) return;               // evita doppio avvio con doppio tap
    try { recRef.current?.abort(); } catch {}
    const rec = createRecognition();
    recRef.current = rec;
    isRecording.current = true;
    setState('starting');
    try { rec.start(); } catch (e: any) { setError(e?.message || 'Impossibile avviare la dettatura'); setState('error'); isRecording.current = false; }
  }, [createRecognition]);

  const stop = useCallback(() => {
    isRecording.current = false;
    try { recRef.current?.stop(); } catch {}
    setState('idle');
  }, []);

  const toggle = useCallback(() => {
    if (isRecording.current) stop(); else start();
  }, [start, stop]);

  /** Da chiamare quando la textarea viene svuotata, così il controllo anti-duplicati riparte da zero. */
  const resetTranscript = useCallback(() => mergerRef.current.reset(), []);

  return { supported, state, interim, error, start, stop, toggle, resetTranscript, clearError: () => setError(null) };
}
