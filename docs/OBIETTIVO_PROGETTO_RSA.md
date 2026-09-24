# jevd: diario assistenziale intelligente per RSA

*Prototipo dimostrativo. Dati inventati, non validato clinicamente.*

## In breve

Nelle RSA il diario assistenziale si scrive in linguaggio libero, da molte mani diverse: infermieri, OSS, fisioterapisti, educatori. Dentro quelle note ci sono segnali importanti (una caduta, un dolore, una confusione nuova, un ospite che mangia poco) che rischiano di restare sepolti nel testo.

jevd è un prototipo che **legge il diario come lo scrive chi lavora in reparto** e fa due cose:

1. **segnala** i rischi clinici e assistenziali, con una probabilità per ciascuno;
2. **propone l'azione giusta**: aprire la scheda dedicata (caduta, lesioni, dolore, delirium, nutrizione…), avvisare il medico, rivedere il PAI.

Non sostituisce la valutazione dell'operatore. Serve a non perdere nel testo libero quello che richiede un'azione o una documentazione obbligatoria.

## Perché serve

- **Tanti diari, poco tempo.** A inizio turno un coordinatore dovrebbe leggere decine di note per capire chi va visto per primo.
- **Linguaggi diversi.** Un OSS scrive "è sudato e scotta, tossisce spesso", un infermiere "TC 38,3, tosse produttiva". Dicono la stessa cosa.
- **Documentazione obbligatoria.** Cadute, dolore (Legge 38/2010), contenzioni, lesioni da pressione e malnutrizione richiedono registrazione e schede dedicate. Se il segnale resta solo nel diario, la scheda non viene aperta.

## Come funziona: il righello e il cane da tartufo

| | Il righello (parser) | Il cane da tartufo (Jev) |
|---|---|---|
| Cosa fa | Legge i numeri: pressione, frequenza, temperatura, saturazione, glicemia, peso, dolore | Legge il significato del testo e stima quanto è probabile ogni rischio |
| Esempio | "PA 135/90, FC 88" | "pallida, sudata, dice che sta per svenire" → presincope 81% |
| Dove si ferma | Non capisce negazioni ("nega caduta"), tempi ("ieri febbre, oggi no"), di chi si parla ("la vicina di camera è caduta") | Non misura i numeri: per quelli serve il righello |

Il cane da tartufo è **Jev**, un modello di TypeSafe AI usato tramite Vercel AI Gateway. Non scrive testo e non inventa: a ogni domanda chiusa ("l'ospite è caduto nelle ultime 24 ore?") risponde con una probabilità calibrata, cioè una percentuale che dovrebbe corrispondere alla frequenza reale con cui la risposta è vera.

**L'esempio che spiega tutto.** Due diari con esattamente gli stessi numeri, PA 135/90 e FC 88:

- "tranquillo, collabora" → quadro stabile;
- "pallida, sudata, dice di sentirsi svenire, confusa" → allarme per presincope.

Il righello vede due casi identici. Jev no.

## Cosa si vede nella demo

**Diario ospite.** Si scrive o si detta (anche a voce, dal microfono del browser) il diario di un ospite. Sotto compaiono i parametri letti e i rischi valutati, con i bottoni per aprire le schede proposte. Ci sono due serie di esempi pronti:

- *Demo alert*: casi tipici, dal controllo stabile alla sospetta frattura di femore, al deterioramento con sospetta sepsi.
- *Jev vs parser*: testi costruiti per mettere in difficoltà una lettura a parole chiave, come una caduta raccontata senza la parola "caduta", o la febbre che era della vicina di camera.

**Diari di reparto.** Un nucleo di 20 ospiti con 100 diari su 5 giorni, scritti da infermieri, OSS, fisioterapista ed educatrice. Si sceglie il periodo (24 ore, 48 ore, 5 giorni) e gli ospiti, e il sistema produce una **classifica per urgenza**: chi vedere per primo e perché.

Ogni diario si può **modificare**: si cambia una parola, si aggiunge una negazione o un sintomo, e si vede subito come cambia la valutazione e la posizione in classifica.

**Due modalità.** La *simulazione locale* imita Jev con regole a parole chiave: è gratuita e immediata, ed è il termine di paragone "a parser". *Jev via Gateway* chiama il modello reale. Confrontare le due modalità sugli stessi testi è il modo più rapido per capire cosa aggiunge Jev.

## Cosa valuta: 38 domande in 9 aree

| Area | Esempi di domande | Scale di riferimento | Scheda proposta |
|---|---|---|---|
| Sicurezza | caduta, sospetta frattura, trauma cranico, contenzione | Conley; Raccomandazione Min. Salute n. 13 | Caduta, contenzione |
| Cute e lesioni | lesione da pressione, lesione traumatica | Braden; NPIAP/EPUAP | Lesioni |
| Nutrizione e idratazione | mangia poco, calo di peso, disidratazione, disfagia | MNA-SF; bilancio idrico | Nutrizionale |
| Deterioramento e infezioni | febbre attuale, presincope, sepsi, dispnea, infezioni respiratorie e urinarie | NEWS2; criteri McGeer | NEWS2, infezioni |
| Dolore e comfort | dolore riferito, dolore da segni comportamentali nella demenza | NRS; PAINAD; Legge 38/2010 | Dolore |
| Cognizione e comportamento | delirium, agitazione, allucinazioni, umore depresso, ideazione di morte | 4AT/CAM; NPI-NH; GDS | Delirium, BPSD |
| Autonomia e funzione | declino funzionale, globo vescicale, stipsi | Barthel; InterRAI | PAI |
| Terapia | rifiuto della terapia, sospetto effetto avverso | Criteri di Beers; STOPP/START | Segnalazione al medico |
| Organizzativo | invio in pronto soccorso | SBAR | Trasferimento |

In Italia non esiste un set nazionale obbligatorio di indicatori clinici per le RSA: le aree scelte corrispondono alle raccomandazioni ministeriali, al progetto nazionale CCM sugli indicatori per le strutture residenziali e ai requisiti di accreditamento regionali.

## Soglie e alert

Ogni domanda ha due soglie, scelte in base a quanto costa non vedere un caso rispetto a quanto costa un falso allarme:

- sopra la soglia **gialla** il rischio va verificato;
- sopra la soglia **rossa** il sistema propone di aprire la scheda dedicata.

I segni urgenti (frattura, deterioramento, delirium, dispnea, ideazione di morte) hanno soglie più basse. I segnali frequenti e meno gravi (sonno, alvo) le hanno più alte, per non sommergere il turno di notifiche.

Nella vista reparto le probabilità diventano un **punteggio di urgenza** per ospite, che ordina la classifica.

## Limiti

- È un **prototipo**: i diari sono inventati e le soglie sono ragionate, non misurate.
- La **simulazione locale** usa regole fisse a parole chiave e non misura nulla: serve solo come confronto.
- **Jev reale** fornisce probabilità calibrate in generale, ma non ancora verificate su diari di RSA italiane. Prima di un uso reale vanno misurate su diari veri, pseudonimizzati, con esito noto.
- Una probabilità alta non è una diagnosi; una bassa non esclude il problema.
- Il sistema **non sostituisce** la valutazione multidimensionale, il PAI, né il giudizio di infermieri, OSS e medici.

## Privacy e quadro normativo

- I diari contengono dati sulla salute (art. 9 GDPR). Un uso reale richiede base giuridica, informativa, valutazione d'impatto (DPIA), minimizzazione dei dati (niente nomi nel testo inviato al modello) e un piano del fornitore con conservazione zero dei dati.
- La Legge 132/2025 sull'intelligenza artificiale prevede che in sanità l'IA sia un supporto e che la decisione resti al professionista.
- Se il sistema venisse usato per orientare decisioni cliniche sul singolo ospite, andrebbe valutato come software dispositivo medico (Regolamento UE 2017/745) e secondo l'AI Act.
- **Nella demo non vanno inseriti dati reali di ospiti.**

## Prossimi passi

1. Raccogliere un campione di diari reali pseudonimizzati, con esito noto (caduta confermata, frattura confermata, invio in PS…).
2. Misurare quanto Jev e il parser trovano e quanto sbagliano, domanda per domanda.
3. Tarare le soglie su quei dati e misurare quanti alert per turno produce il sistema.
4. Integrare con la cartella esistente: registrare ogni proposta, chi l'ha confermata o scartata, e perché.
