# jevd in RSA: obiettivo del progetto

## 1. Obiettivo

jevd è un prototipo di cartella clinica elettronica per RSA e strutture residenziali sociosanitarie.
Infermieri e OSS scrivono o dettano il diario in linguaggio libero, come fanno oggi. L'app:

1. legge i parametri numerici (PA, FC, temperatura, SpO₂, glicemia, peso, NRS);
2. valuta 38 domande di rischio clinico-assistenziale con probabilità calibrate;
3. fa scattare alert automatici e propone l'apertura della scheda dedicata (caduta, lesioni, contenzione, nutrizionale, NEWS2, infezioni, dolore, delirium, BPSD, PAI, trasferimento).

L'obiettivo non è sostituire la valutazione dell'operatore, ma **non perdere nel testo libero i segnali che richiedono un'azione o una documentazione obbligatoria**.

## 2. Il righello e il cane da tartufo

| | Parser locale (righello) | Jev (cane da tartufo) |
|---|---|---|
| Cosa fa | Estrae numeri dal testo | Legge il contesto e stima la probabilità che un'affermazione sia vera |
| Output | `PA 135/90`, `FC 88`, `37,8 °C` | `presincope: 0.81`, `caduta: 0.04` |
| Dove sbaglia | Non capisce negazioni, tempi, contesto: "ieri febbre 38.5, oggi 36.8" → legge 38.5 | Non restituisce numeri liberi; può sbagliare come ogni modello |
| Dove gira | Nel browser e nel server, deterministico | Vercel AI Gateway, modello `typesafe-ai/jev` |

I nove esempi pronti dimostrano la differenza. Il più chiaro è il confronto 4A/4B: **stessa PA 135/90 e FC 88**, ma "tranquillo" dà quadro stabile, mentre "pallido, sudato, dice di sentirsi svenire" dà presincope all'81%. Il righello vede due casi identici, il cane da tartufo no.

Anche 90 135 viene letto correttamente: il parser prende i due numeri vicini a "PA/pressione" e assegna sistolica = massimo, diastolica = minimo (`"90 135"`, `"135 e 90"`, `"135-90"`, `"90/135"` → 135/90).

## 3. Cosa chiede la normativa e cosa copre l'app

**Premessa importante.** In Italia non esiste un set nazionale obbligatorio di indicatori clinici di qualità per le RSA. Il quadro è composto da:

- **norme e raccomandazioni nazionali** che si applicano anche alle strutture residenziali: Raccomandazione del Ministero n. 13/2011 sulle cadute; Legge 38/2010, che all'art. 7 impone di riportare la rilevazione del dolore in cartella; Legge 24/2017 (Gelli-Bianco) sulla gestione del rischio; sistema SIMES per gli eventi sentinella; PNCAR per infezioni e antibiotici; flusso FAR (DM 17 dicembre 2008) per l'assistenza residenziale;
- **il progetto CCM 2010 finanziato dal Ministero** (Toscana, Emilia-Romagna, Liguria, ISS) che ha proposto e validato indicatori per RSA su lesioni da pressione, cadute, dolore, incontinenza, contenzione, malnutrizione;
- **i requisiti di accreditamento regionali**, che chiedono protocolli e spesso indicatori su questi stessi temi, e la valutazione multidimensionale regionale (in Veneto la SVaMA, altrove InterRAI o strumenti propri).

La tabella usa quindi "Riferimento" invece di "Indicatore del Ministero": dove il riferimento è regionale o di letteratura, è scritto.

| Area / riferimento | Domande Jev | Scala di riferimento | Trigger scheda |
|---|---|---|---|
| Cadute (Racc. n. 13; indicatore CCM e regionale) | `caduta`, `sospetta_frattura`, `trauma_cranico` | Conley; NICE CG124 (femore), NICE NG232 (trauma cranico) | Scheda caduta |
| Lesioni da pressione (CCM, regionale) | `lesione_pressione`, `lesione_traumatica` | Braden; NPIAP/EPUAP 2019; ISTAP | Scheda lesioni |
| Contenzione fisica (CCM, regionale; CNB 2015) | `contenzione` | Registro contenzioni | Scheda contenzione |
| Malnutrizione e idratazione (CCM) | `introito_ridotto`, `calo_peso`, `disidratazione`, `disfagia` | MNA-SF / MUST; bilancio idrico; GUSS | Scheda nutrizionale |
| Dolore (Legge 38/2010 art. 7) | `dolore_riferito`, `dolore_comportamentale`, `dolore_non_controllato` | NRS; PAINAD nella demenza | Scheda dolore |
| Infezioni correlate all'assistenza (PNCAR) | `febbre_attuale`, `infezione_respiratoria`, `infezione_urinaria`, `diarrea_acuta` | Criteri McGeer revisionati (Stone 2012) | Scheda infezioni |
| Deterioramento e ospedalizzazioni evitabili | `presincope`, `deterioramento_sepsi`, `dispnea`, `dolore_toracico`, `cambiamento_condizioni` | NEWS2; qSOFA; INTERACT Stop and Watch | Scheda NEWS2 |
| Accessi in PS / ricoveri (FAR, regionale) | `invio_ps` | SBAR | Scheda trasferimento |
| Delirium | `delirium` | 4AT o CAM | Valutazione delirium |
| Disturbi del comportamento (BPSD) | `bpsd_agitazione`, `allucinazioni` | NPI-NH; Cohen-Mansfield | Scheda BPSD |
| Umore e relazione | `depressione`, `ritiro_sociale`, `rischio_suicidario` | GDS-15 / Cornell; C-SSRS screening | PAI; per il rischio suicidario solo azioni immediate |
| Autonomia e PAI (VMD regionale) | `declino_funzionale`, `incontinenza_nuova`, `ritenzione_urinaria`, `stipsi_fecaloma` | Barthel; InterRAI ADL; bladder scan; Bristol | Rivaluta PAI |
| Sicurezza della terapia (Racc. n. 7, 17, 19; AIFA) | `rifiuto_terapia`, `effetto_avverso_farmaco` | Beers 2023; STOPP/START v3 | Azioni verso il medico |
| Sonno | `insonnia` | Diario del sonno | Nessuna scheda |
| Sintesi | `quadro_stabile`, `febbre_pregressa` | - | Nessuna: banner di stabilità e spiegazione del passato |

## 4. Soglie e alert automatici

### Le soglie 0,70 / 0,85 vanno bene per tutto?

No. Una soglia unica tratta allo stesso modo una notte insonne e una sospetta frattura. La soglia giusta dipende da **quanto costa non vedere un caso** rispetto a **quanto costa un falso allarme** (tempo dell'operatore e *alert fatigue*). Per questo ogni domanda ha le sue soglie, raggruppate in tre livelli:

| Livello | Esempi | Giallo | Rosso | Motivo |
|---|---|---|---|---|
| Urgente | frattura, trauma cranico, presincope, deterioramento/sepsi, dispnea, dolore toracico, disfagia, delirium, rischio suicidario | 0,50 | 0,80 (0,75 delirium e sepsi; 0,40/0,70 rischio suicidario) | Mancare il caso è grave, la verifica costa poco |
| Evento da documentare | caduta, lesioni, contenzione, dolore, BPSD, rifiuto terapia, invio PS | 0,60 | 0,85 | Documentazione spesso obbligatoria: la scheda si propone quando l'evento è quasi certo |
| Monitoraggio | nutrizione, infezioni, umore, autonomia, alvo, sonno | 0,70 | 0,85 (0,90 sonno) | Segnali frequenti: soglie alte per non sommergere il turno |

### Cosa succede sopra soglia

- **Sotto la gialla**: nessun alert. Se la parola compare nel testo ma Jev la esclude (es. "nega caduta"), l'app lo mostra come "nominato ma escluso": è la prova che le negazioni funzionano.
- **Sopra la gialla**: card "Da verificare" con bottone secondario verso la scheda.
- **Sopra la rossa**: bottone "Proposta: Apri scheda X". Il colore è rosso pieno solo per il livello urgente, giallo per eventi e monitoraggio (esempio 2: la caduta lieve all'89% propone la scheda, ma non è un allarme rosso).
- **Regola PAI** (codice dell'app, non di Jev): proposta di rivalutare il PAI se una domanda collegata al PAI supera la soglia rossa, oppure se 3 o più aree diverse superano la gialla. Un evento acuto singolo va al medico, non al PAI.

### Come calibrare le soglie davvero

Le soglie di questo prototipo sono **ragionate, non misurate**. Prima di un uso reale:

1. raccogliere diari reali pseudonimizzati con l'esito noto (es. caduta confermata dal registro, frattura confermata da RX);
2. passarli a Jev con le stesse domande e confrontare le probabilità con gli esiti;
3. scegliere per ogni domanda la soglia che dà una sensibilità accettabile per quel rischio, poi misurare quanti alert per turno produce.

## 5. Revisione del file di domande (v1 → v2)

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

## 6. Limiti

- **La simulazione locale è dimostrativa**: le probabilità sono fisse, derivate da keyword, tarate sui nove esempi. Non misurano niente.
- **Con Jev reale** le probabilità sono calcolate dal modello; sono calibrate in generale, ma **non sono validate su diari di RSA italiane**. Vanno misurate come descritto al §4 prima di fidarsi.
- **Non è validato clinicamente** e non va usato per decisioni cliniche reali. Una probabilità alta non è una diagnosi; una bassa non esclude il problema.
- Il parser legge solo alcune forme di scrittura (es. non "pressione centotrentacinque").
- Le soglie NEWS2 nella scheda sono parziali: mancano frequenza respiratoria, coscienza e ossigeno.

## 7. Privacy, quadro normativo e VMD

**Dati sanitari.** I diari contengono dati relativi alla salute (art. 9 GDPR). Per un uso reale servono:
- base giuridica e informativa agli ospiti (o a tutori / amministratori di sostegno);
- una valutazione d'impatto (DPIA, art. 35 GDPR), trattandosi di dati sanitari di persone vulnerabili trattati con tecnologie innovative;
- un contratto con il fornitore come responsabile del trattamento e la verifica dei trasferimenti extra UE;
- la **minimizzazione**: nel diario inviato a Jev non servono nome, cognome, codice fiscale o letto. L'app manda solo il testo del diario; conviene pseudonimizzarlo prima dell'invio.

**Zero Data Retention e addestramento.** L'API route invia di default `disallowPromptTraining: true` (i provider non addestrano sui diari). La **ZDR per richiesta** (`zeroDataRetention`) è invece disponibile solo sui piani Vercel Pro/Enterprise: su Hobby il Gateway risponde 403. Per questo è **spenta di default** e si attiva con la variabile `AI_GATEWAY_ZDR=true`.

Per la demo con testi inventati va bene così. **Con diari reali di ospiti serve un piano che supporti la ZDR, con `AI_GATEWAY_ZDR=true`**: senza, non c'è la garanzia che il provider non conservi i dati.

**IA in sanità.** La Legge 132/2025 (in vigore dal 10 ottobre 2025) stabilisce che l'IA in sanità è supporto e che la decisione resta al professionista, con informazione all'interessato. Se lo strumento venisse usato per orientare decisioni cliniche sul singolo ospite, andrebbe valutato anche come **software dispositivo medico** (MDR 2017/745, regola 11) e, di conseguenza, come sistema ad alto rischio secondo l'AI Act (Reg. UE 2024/1689). Il prototipo attuale non ha nessuna di queste certificazioni.

**Tracciabilità.** Ogni proposta di scheda dovrebbe registrare: domanda, probabilità, versione del file domande, operatore che ha confermato o scartato la proposta. Oggi il link della scheda porta `q` (domanda) e `p` (probabilità) come base per questo registro.

**VMD e PAI.** Jev **non sostituisce** la valutazione multidimensionale (SVaMA, InterRAI o lo strumento regionale) né l'UVMD. Può solo segnalare che le condizioni sono cambiate e proporre di anticipare la rivalutazione del PAI.

## 8. Come modificare le domande

Il file `data/jev-questions-rsa.json` è la fonte unica. Per ogni domanda:

- `question` viene inviato a Jev come `instructions` (mai come `question`, che il Gateway rifiuta con errore 400);
- `criteria.true` / `criteria.false` definiscono cosa conta come sì e come no;
- `keywords` servono solo alla simulazione: `*` indica un prefisso (`cadut*`) o una parola qualsiasi in mezzo (`perso * kg`);
- `tier`, `threshold_yellow`, `threshold_red` decidono colore e proposte;
- `scheda` e `actions` decidono cosa viene proposto.

`GET /api/analyze` controlla il file (soglie, id duplicati, schema del Gateway) e riporta eventuali errori in `schemaErrors`.
