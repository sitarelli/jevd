# jevd: diario clinico per RSA con Jev (TypeSafe AI via Vercel AI Gateway)

Infermieri e OSS scrivono o dettano il diario. Il parser legge i numeri (righello), Jev valuta 38 rischi
clinico-assistenziali con probabilità calibrate (cane da tartufo) e propone le schede dedicate.

**Documentazione completa:** [`docs/OBIETTIVO_PROGETTO_RSA.md`](docs/OBIETTIVO_PROGETTO_RSA.md)

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

## Struttura

- `data/jev-questions-rsa.json`: le 38 domande (fonte unica, modificabile senza toccare il codice).
- `lib/jev-questions.ts`: converte il JSON nello schema del Gateway (`question` → `instructions`) e lo valida.
- `lib/parser.ts`: il righello (PA anche senza slash: "90 135" → 135/90).
- `lib/clinical.ts`: simulazione a keyword, soglie per domanda, report, esempi pronti.
- `app/api/analyze/route.ts`: runtime Node, timeout 10 s, Zero Data Retention.
- `app/scheda/[tipo]`: 11 schede dimostrative raggiungibili come `/scheda-cadute?source=jev` (rewrite in `next.config.js`).

La simulazione locale è il default. "Jev via Gateway" è opzionale e richiede la chiave.

Prototipo dimostrativo: soglie cliniche non validate, non usare per decisioni reali.
