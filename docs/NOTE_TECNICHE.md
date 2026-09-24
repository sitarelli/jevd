# jevd: note tecniche

Documento per chi sviluppa o mantiene il prototipo. La presentazione generale del progetto è in `OBIETTIVO_PROGETTO_RSA.md`.

## 1. Architettura e configurazione

- Next.js 14 (App Router), Tailwind, deploy su Vercel.
- `data/jev-questions-rsa.json`: le 38 domande (fonte unica). `lib/jev-questions.ts` le converte nello schema di Vercel AI Gateway `/v1/evaluate` (`question` → `instructions`) e le valida.
- `lib/parser.ts`: estrazione dei numeri. `lib/clinical.ts`: simulazione locale, soglie, report, esempi. `lib/reparto.ts`: vista reparto e urgency score.
- `app/api/analyze/route.ts`: chiamata al Gateway con modello `typesafe-ai/jev`, runtime Node, timeout 10 s. `GET /api/analyze` mostra la configurazione, `?probe=1` fa una chiamata minima di prova.
- `app/scheda/[tipo]`: 11 schede dimostrative, raggiungibili come `/scheda-cadute?source=jev` (rewrite in `next.config.js`).

| Variabile (Vercel → Settings → Environment Variables) | Default | Effetto |
|---|---|---|
| `AI_GATEWAY_API_KEY` | - | Chiave del Gateway. Senza, l'app funziona solo in simulazione. |
| `AI_GATEWAY_ZDR` | `false` | `true` invia `zeroDataRetention`. Solo piani Pro/Enterprise: su Hobby il Gateway risponde 403. |
| `AI_GATEWAY_NO_TRAINING` | `true` | Invia `disallowPromptTraining`. |

## 2. Revisione del file di domande (v1 → v2)

Il file originale aveva 27 domande. La versione in `data/jev-questions-rsa.json` ne ha 38. I cambi principali:

**Domande atomiche.** Jev valuta meglio una domanda sola per volta; le domande composte vanno spezzate e ricombinate nel codice.
- `deterioramento_ipotensione` → `presincope` + `deterioramento_sepsi`
- `infezione_respiratoria_dispnea` → `dispnea` (urgente) + `infezione_respiratoria`
- `calo_peso_malnutrizione` → `introito_ridotto` + `calo_peso`
- `incontinenza_ritenzione` → `ritenzione_urinaria` + `incontinenza_nuova`
- `dolore` → `dolore_riferito` + `dolore_comportamentale` (PAINAD, per chi non comunica)
- `febbre` → `febbre_attuale` + `febbre_pregressa` (passato vs presente). Tolte le keyword numeriche ("37.8", "36.2"): i numeri sono lavoro del parser.

**Tempo e negazione nelle domande.** Ogni domanda dice *quando* ("ADESSO", "nelle ultime 24 ore") e ha `criteria.true` / `criteria.false` espliciti, incluso "negato = falso".

**Accorpate o spostate nel codice.**
- `rischio_allettamento` accorpata in `declino_funzionale`.
- `rivalutazione_pai` → regola dell'app (vedi sopra): "peggiorato rispetto a ieri" non è valutabile da una nota singola; la sostituisce `cambiamento_condizioni` (INTERACT Stop and Watch), che valuta ciò che il testo dice.
- `rischio_ospedalizzazione` → `invio_ps` (evento documentabile) + il livello urgente di `deterioramento_sepsi`.
- `stipsi_fecaloma` spostata in "Autonomia e funzione" insieme alle altre eliminazioni; tolta la diarrea, che diventa `diarrea_acuta` (rischio focolaio).
- `allucinazione_delirio` → `allucinazioni`: in italiano "delirio" (idea delirante) si confonde con "delirium" (confusione acuta), e le due cose portano a schede diverse. Tolta la keyword "cantava come un matto".

**Aggiunte** (letteratura e domande che ci avevate chiesto):
- `rischio_suicidario`: ideazione di morte e gesti autolesivi, soglie basse. Il suicidio è evento sentinella nella lista nazionale.
- `trauma_cranico`: caduta con colpo alla testa o non ricordata; in un anziano anticoagulato NICE NG232 indica la TC.
- `disfagia` portata a livello urgente, con richiamo alla Raccomandazione n. 19 sulla frantumazione dei farmaci.
- `diarrea_acuta`: gestisce anche la domanda sull'**isolamento** (precauzioni da contatto, C. difficile, norovirus).
- `ritiro_sociale`: l'isolamento *sociale* e l'apatia, distinti dalla depressione.
- `dolore_toracico`, `dispnea` come segni urgenti autonomi; `quadro_stabile` per il banner.

**Riferimenti corretti.**
- Contenzione: la Raccomandazione n. 8 riguarda la violenza sugli operatori, non la contenzione. Sostituita con il parere del Comitato Nazionale per la Bioetica (2015) e le linee di indirizzo regionali.
- Caduta: non è evento sentinella in sé; lo è la morte o il grave danno da caduta. Il riferimento corretto è la Raccomandazione n. 13.
- Infezione urinaria: urine torbide o maleodoranti da sole non bastano (criteri McGeer; *Choosing Wisely* AMDA); la domanda chiede sintomi urinari nuovi.

### Cosa non chiedere a Jev

Alcuni indicatori non stanno in una nota di diario e vanno calcolati dai dati strutturati della cartella:
- **polifarmacia** (numero di farmaci, criteri di Beers/STOPP): dalla terapia in atto;
- **PAI scaduto**, VMD da rifare: dalle date;
- **isolamento infettivo in corso**: dallo stato del paziente;
- **stato contenzione autorizzata**: dal registro contenzioni.

Jev invece è utile per segnalare quando il testo contraddice o aggiorna questi dati (es. "spondine alzate stanotte" senza prescrizione in registro).

## 3. Diari di reparto: classifica per urgenza

Il bottone **Diari di reparto** in alto apre la vista del nucleo: 20 ospiti da `data/mock-reparto-20-ospiti.json`.

- **Lista a sinistra**: nome, stanza, ultimo diario (data e anteprima di 80 caratteri) e pallino di stato calcolato sull'ultimo diario del periodo (verde stabile, giallo da controllare, rosso urgente).
- **Filtri**: ultime 24 h, 48 h, 5 giorni, tutti. Con dati demo fissi, "adesso" è l'ora dell'ultimo diario del dataset (23/09 22:10), altrimenti le finestre sarebbero vuote.
- **Classifica a destra**: top 3 in card grandi, poi il resto in lista, con punteggio, motivo e testo del diario che ha determinato il punteggio.

### Urgency score

Per ogni diario: somma delle regole scattate, più 10 punti per ogni domanda sopra la sua soglia rossa e 3 per ogni domanda sopra la gialla. Ogni ospite prende il **massimo** dei suoi diari nel periodo; a parità di punti vengono prima gli ospiti in stato rosso.

La formula usa gli id della prima versione del JSON; la corrispondenza con le domande v2 è in `lib/reparto.ts` (`REGOLE`):

| Regola (id v1) | Domande v2 | Soglia | Punti |
|---|---|---|---|
| caduta_grave_frattura | sospetta_frattura | > 0,85 | 30 |
| deterioramento_ipotensione | deterioramento_sepsi, presincope | > 0,80 | 25 |
| rischio_ospedalizzazione | invio_ps | > 0,80 | 20 |
| febbre | febbre_attuale | > 0,80 | 10 |
| delirium_confusione_acuta | delirium | > 0,75 | 10 |
| dolore | dolore_riferito, dolore_non_controllato, dolore_comportamentale | > 0,80 | 8 |
| infezione_respiratoria_dispnea | infezione_respiratoria, dispnea | > 0,80 | 8 |

Quando una regola ha più domande v2 vale la probabilità più alta. `rischio_ospedalizzazione` nella v2 non esiste più come previsione: la regola usa `invio_ps` (evento documentato).

La formula non ha regole per disfagia, contenzione, lesioni o rischio suicidario: questi ospiti ricevono solo i punti per soglia rossa/gialla (10 o 3). Se volete che salgano in classifica, basta aggiungere una riga a `REGOLE`.

### Modalità

- **Simulazione locale** (default): tutti i diari del periodo, valutati nel browser, nessun credito consumato.
- **Jev via Gateway**: al massimo 20 chiamate (4 in parallelo, con barra di avanzamento). Si valuta prima l'ultimo diario di ogni ospite selezionato, poi i precedenti dal più recente. I diari oltre il limite non entrano in classifica e la barra di stato lo segnala. Con 20 ospiti e il filtro "Tutti" si valuta quindi solo l'ultimo diario di ciascuno; "Ultime 24 h" (21 diari) è il filtro più vicino al limite.

### Dataset

- `data/mock-reparto-20-ospiti.json`: 20 ospiti, 100 diari dal 19 al 23 settembre 2026, scritti da infermieri (47), OSS (42), educatrice (6) e fisioterapista (5). Ogni ospite ha un andamento coerente nei giorni. `data/mock-diari-flat.json` contiene gli stessi diari in forma piatta.
- Il campo `tipo_template` classifica il caso (es. `pallido_confuso_4B`, `trap_a`) ed è usato solo per il box dimostrativo 4A/4B.
- Nella vista reparto ogni diario si può modificare (✎ Modifica): la modifica resta nella sessione del browser e aggiorna subito la classifica.

## 4. Dettatura da mobile

Su mobile la dettatura raddoppiava il testo. La logica anti-duplicati è in `lib/dictationMerge.ts` (funzione pura, testata con sequenze di eventi simulate) e viene usata da `lib/useDictation.ts`:

- su mobile `continuous: false` e `interimResults: false`; su desktop sessione continua con anteprima;
- si accoda solo il testo dei risultati con `isFinal === true`, ogni indice una volta sola;
- se un risultato finale contiene il testo già ricevuto nella sessione (comportamento di Android), si accoda solo la parte nuova;
- frasi identiche entro 800 ms vengono ignorate;
- se il testo accodato finisce già con la stessa frase (riemissione dopo un riavvio), la frase viene scartata, confrontando parole intere, entro 5 secondi;
- il flag `isRecording` impedisce il riavvio in `onend` dopo che l'utente ha premuto Ferma, e il doppio avvio con doppio tap;
- `Svuota` azzera anche lo storico anti-duplicati.

Limite noto: una parola uguale alla fine del testo, dettata di nuovo entro 5 secondi, viene scartata (es. "80" subito dopo "PA 120 su 80").

## 5. Come modificare le domande

Il file `data/jev-questions-rsa.json` è la fonte unica. Per ogni domanda:

- `question` viene inviato a Jev come `instructions` (mai come `question`, che il Gateway rifiuta con errore 400);
- `criteria.true` / `criteria.false` definiscono cosa conta come sì e come no;
- `keywords` servono solo alla simulazione: `*` indica un prefisso (`cadut*`) o una parola qualsiasi in mezzo (`perso * kg`);
- `tier`, `threshold_yellow`, `threshold_red` decidono colore e proposte;
- `scheda` e `actions` decidono cosa viene proposto.

`GET /api/analyze` controlla il file (soglie, id duplicati, schema del Gateway) e riporta eventuali errori in `schemaErrors`.
