# Diario clinico con Jev (TypeSafe AI via Vercel AI Gateway)

L'infermiere scrive o detta il diario; l'app estrae parametri vitali ed eventi
e propone l'apertura delle schede Cadute / Lesioni.

## Chiave API (solo su Vercel)

1. Vercel → progetto → **Settings → Environment Variables**
2. Aggiungi `AI_GATEWAY_API_KEY` = `vck_...` (ambienti: Production e Preview)
3. **Deployments → ultimo deploy → Redeploy** (le variabili valgono solo per i deploy successivi)

Non serve `.env.local` se deployi direttamente. Serve solo per `npm run dev` in locale.

Verifica: apri `https://<tuo-progetto>.vercel.app/api/analyze`
→ deve mostrare `"keyConfigured": true` e `"schemaErrors": []`.
Test chiave isolato: `/api/analyze?probe=1` invia l'esempio minimo della documentazione Vercel.

Senza chiave l'app funziona comunque in **Simulazione locale** (anche se selezioni "Jev via Gateway":
il server risponde `MISSING_KEY` e la UI ripiega sulla simulazione avvisandoti).

## Come funziona

- `lib/jev-questions.ts`: 19 domande Jev nello schema ufficiale `/v1/evaluate`
  (`type` + `instructions` + `criteria`). Validate localmente prima dell'invio.
- `lib/parser.ts`: legge dal testo i numeri esatti e gli snippet (Jev non restituisce numeri liberi,
  ma probabilità su opzioni e fasce).
- `lib/clinical.ts`: unisce parser + risposte Jev, confronta le fasce (concorde/discorde), segnalazioni, esempi.
- `app/api/analyze/route.ts`: runtime Node, timeout 10 s, Zero Data Retention, errori con codice.
- `lib/useDictation.ts`: dettatura Web Speech API `it-IT` (Chrome, Edge, Safari; non Firefox).
- `/scheda-cadute`, `/scheda-lesioni`: pagine segnaposto che ricevono i parametri proposti.

Prototipo dimostrativo: soglie cliniche non validate, non usare per decisioni reali.
