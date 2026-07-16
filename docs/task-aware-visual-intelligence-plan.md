# Visual intelligence task-aware — piano e tracker

Ultimo aggiornamento: 14 luglio 2026.

Stato complessivo: `IN PROGRESS`.

Owner operativo: repository ClosedRoom. Questo documento e la fonte di verita
per progettare, implementare e verificare l'evoluzione della pipeline visuale
da deduplicazione globale a routing task-aware. Va aggiornato nella stessa
modifica che fa avanzare una fase, chiude una decisione o cambia un contratto.

Documenti collegati:

- [piano di pulizia del codice](visual-intelligence-code-cleanup-plan.md), per
  correttezza, persistenza, confini dei moduli e debito tecnico prima del rollout;
- [tracker E2E visual intelligence + diarizzazione](visual-diarization-e2e-readiness.md), che descrive la baseline gia implementata;
- [architettura generale](architecture.md);
- [registro feature](features.md);
- `README.md`, per il comportamento pubblico effettivamente rilasciato.

## 1. Valutazione

La direzione proposta e corretta: un solo confronto dHash full-frame non puo
servire con la stessa affidabilita tre obiettivi con dinamiche temporali diverse.
La deduplicazione corrente resta un segnale economico, ma non deve restare la
decisione finale su quali frame analizzare.

| Obiettivo | Valutazione della baseline | Strategia target |
| --- | --- | --- |
| Associare speaker visibile e cluster audio | Il dHash globale puo perdere bordi, icone e cambi colore locali; clonare l'osservazione precedente gonfia inoltre il supporto apparente. | Candidate guidate dai turni diarizzati, confronto locale/color-aware, refresh massimo e fusione basata su inferenze indipendenti. |
| Ricostruire lo stato osservabile del meeting | Il dHash globale e utile per variazioni strutturali, ma una scena stabile richiede un heartbeat. | Eventi di layout/condivisione/partecipanti piu heartbeat lento; nessuna inferenza psicologica dal solo frame. |
| Estrarre contenuto condiviso | Il full-frame puo reagire a controlli, cursori e video invece che al contenuto utile. | ROI della condivisione, stabilizzazione, policy per tipo di contenuto e rate limit. |

La semantica del meeting deve essere derivata in una fase successiva da stato
visuale osservabile, transcript, turni speaker e segnali audio. Qwen non deve
dedurre da un singolo screenshot consenso, tensione, attenzione o intenzioni.

## 2. Baseline verificata

Al 14 luglio 2026 il repository possiede gia:

- cattura opt-in di una singola finestra tramite ScreenCaptureKit;
- staging JPEG con sequenza e timestamp monotoni in `.visual-staging/`;
- frequenza visuale predefinita `0.5 fps`, validata tra `0.1` e `2.0 fps`;
- servizio post-meeting eseguito dopo la diarizzazione;
- dHash globale a 64 bit con riuso dell'osservazione per distanza di Hamming
  minore o uguale a 2;
- un unico prompt/schema per partecipanti e speaker attivo;
- persistenza incrementale in `visual_observations.jsonl`, summary, metadata e
  catalogo, seguita dal cleanup dei JPEG;
- mapping conservativo sui cluster provider tramite numero minimo di
  osservazioni e margine;
- diagnostica di errori, degradazioni e fallback.

Una cattura reale ispezionata il 14 luglio mostra un frame circa ogni due
secondi, coerente con il default `0.5 fps`. Il target di `2 fps` va quindi
trattato come esperimento da misurare, non come nuovo default implicito.

## 3. Risultato atteso e non-obiettivi

La pipeline e completa quando una sola sequenza temporizzata di frame alimenta
tre selettori indipendenti, produce inferenze Qwen task-specifiche, ricostruisce
intervalli/eventi/sessioni e fonde solo evidenza indipendente con audio e testo.

Output persistenti attesi:

1. intervalli di speaker visibili con inferenze indipendenti e supporto temporale;
2. eventi di stato osservabile del meeting;
3. sessioni di condivisione con keyframe e informazioni estratte;
4. diagnostica che spiega perche ogni candidato e stato selezionato, saltato o
   propagato;
5. artefatti versionati e leggibili anche dopo un'elaborazione parziale.

Non-obiettivi iniziali:

- riconoscimento facciale o identita dedotte senza label visibili;
- analisi psicologica o comportamentale dei partecipanti;
- inferenza VLM sincrona durante la registrazione;
- supporto universale e perfetto per ogni UI di videoconferenza nella prima
  iterazione;
- modifica automatica del testo trascritto usando contenuto visuale non
  verificato.

## 4. Fonti di verita e confini dei moduli

`PostMeetingVisualService` resta l'orchestratore e non deve accumulare le
singole policy. La struttura target e:

| Responsabilita | Owner previsto |
| --- | --- |
| Limiti, enum task/trigger, schema pubblico versionato | `visual_intelligence/contracts.py` |
| Firma globale, colore, griglia e ROI | nuovo `visual_intelligence/signatures.py` |
| Selettori speaker, meeting state e shared content | nuovo package `visual_intelligence/selectors/` |
| Composizione e deduplicazione dei candidati | nuovo `visual_intelligence/router.py` |
| Prompt, chiamata Qwen e parsing per task | nuovo `visual_intelligence/inference.py` |
| Intervalli, eventi, share session e propagazione di stato | nuovo `visual_intelligence/temporal.py` |
| Mapping cluster e fusione multimodale | `visual_intelligence/fusion.py` |
| Staging, scritture atomiche, artefatti e cleanup | `recordings.py` |
| Default utente e tuning persistito | `settings.py` + relativa validazione |
| Coordinamento della pipeline e job progress | `services/transcription_service.py` |
| Contratto HTTP e rendering | router/schemi backend e `frontend/src/api/apiClient.ts` |
| Copy UI | `frontend/src/i18n/` |

Le soglie non vanno sparse tra i selettori. Un unico `VisualRoutingConfig`
tipizzato deve essere costruito dai default applicativi e passato ai moduli.
Il manifest di cattura resta append-only e non deve contenere decisioni Qwen:
selezione e inferenza sono artefatti post-meeting separati e ripetibili.

## 5. Architettura target

```text
frame temporizzati + timeline diarizzazione
                  |
                  v
          calcolo firme economiche
                  |
                  v
             frame router
        /          |           \
 speaker       meeting state   shared content
 selector        selector        selector
        \          |           /
                  v
       candidati con task + trigger
                  |
                  v
        inferenza Qwen task-specifica
                  |
                  v
       aggregazione temporale versionata
        /          |           \
 speaker       state events    share sessions
        \          |           /
                  v
        fusione audio + transcript
```

Il router deve poter funzionare in `shadow mode`: calcola firme e decisioni,
ma lascia invariato il numero di chiamate e l'output utente. Questo consente di
misurare recall e costo prima di sostituire la policy esistente.

## 6. Contratti da introdurre

### 6.1 Candidato

Ogni candidato deve conservare almeno:

```json
{
  "schema_version": 1,
  "sequence": 42,
  "timestamp": 124.5,
  "task": "active_speaker",
  "trigger": "diarization_turn_start",
  "roi": null,
  "independent_inference": true,
  "selector_version": 1
}
```

Se piu selettori scelgono lo stesso frame, il router puo riusare il caricamento
dell'immagine, ma non deve confondere i contratti o i prompt dei task.

### 6.2 Stato temporale

Una risposta Qwen indipendente e uno stato propagato sono entita diverse:

```json
{
  "observation_id": "visual-42",
  "task": "active_speaker",
  "inference_timestamp": 124.5,
  "valid_from": 124.5,
  "valid_to": 128.0,
  "independent_inferences": 1,
  "supporting_frames": 7,
  "source": "qwen"
}
```

`supporting_frames` e durata non devono incrementare il conteggio di inferenze
indipendenti usato per accettare un nome.

### 6.3 Artefatto persistente

L'evoluzione deve mantenere leggibili i file v1 e introdurre un documento v2
canonico, preferibilmente `visual_intelligence.json`, con sezioni separate:

- `observations` indipendenti;
- `speaker_intervals`;
- `meeting_state_events`;
- `share_sessions`;
- `routing_summary` e diagnostica;
- versioni di schema, prompt, selettori e configurazione effettiva.

La scelta finale tra documento unico e piu JSON/JSONL va chiusa nella fase F1,
prima di cambiare `RecordingStore`. Metadata e catalogo devono conservare solo
il riepilogo interrogabile, non duplicare tutti gli eventi.

## 7. Decisioni architetturali

| ID | Decisione | Stato | Evidenza richiesta per chiuderla |
| --- | --- | --- | --- |
| D1 | Conservare il dHash globale come segnale, non come gate unico | `ACCEPTED` | Baseline codice e failure mode noti |
| D2 | Restare post-meeting per la prima release | `ACCEPTED` | Ordine pipeline gia compatibile e cattura non bloccante |
| D3 | Separare i tre task, prompt e contratti | `ACCEPTED` | Obiettivi e cadenze incompatibili con un prompt unico |
| D4 | Distinguere inferenza indipendente da stato propagato | `ACCEPTED` | La baseline clona osservazioni e puo gonfiare il supporto |
| D5 | Portare il default di cattura da 0.5 a 2 fps | `OPEN` | Benchmark F0 su spazio, CPU, durata e recall speaker |
| D6 | Individuare ROI con euristiche generiche o adapter per piattaforma | `OPEN` | Fixture Meet/Zoom/Teams e fallback full-frame |
| D7 | Documento v2 unico o artefatti separati | `ACCEPTED` | Documento canonico unico `visual_intelligence.json`; endpoint v1 invariato ed endpoint v2 tipizzato verificati |
| D8 | Esporre soglie avanzate in UI o mantenerle interne | `ACCEPTED` | Soglie interne; la UI mostra risultato, confidence operativa, review e astensione senza controlli di tuning |

## 8. Piano operativo

### F0 — Dataset, baseline e budget

Stato: `IN PROGRESS`.

- [ ] Preparare fixture temporizzate per Meet, Zoom e Teams: gallery, speaker
  highlight, share start/stop, slide, scroll, video e caso ambiguo.
- [ ] Definire ground truth per turni, eventi e keyframe rilevanti.
- [x] Aggiungere un benchmark ripetibile del router senza Whisper o Qwen reali.
- [x] Misurare una cattura reale alle densita disponibili `0.5`, `1.0` e `2.0 fps` senza Whisper reale.
- [ ] Registrare spazio/minuto, CPU, durata routing, chiamate Qwen/minuto, tempi
  Qwen e qualità per ciascun obiettivo.
- [ ] Ratificare soglie di accettazione e chiudere D5.

Criterio di uscita: dataset ripetibile, report baseline e budget esplicito. Non
si cambia il default di cattura prima di questo gate.

### F1 — Contratti v2 e compatibilita

Stato: `DONE`.

- [x] Definire enum task/trigger e `VisualRoutingConfig`.
- [x] Versionare candidati, osservazioni, intervalli, eventi e share session.
- [x] Chiudere D7 e definire lettura dei dati v1.
- [x] Introdurre scrittura atomica dell'artefatto canonico v2 e mantenere cleanup.
- [x] Aggiungere test di readback v2 e compatibilita del percorso v1.
- [x] Specificare e testare resume idempotente dopo crash a meta processing.

Criterio di uscita: contratto approvato e testato senza cambiare ancora il
risultato utente.

### F2 — Firme e router in shadow mode

Stato: `DONE`.

- [x] Estrarre il dHash da `service.py` mantenendo il wrapper compatibile.
- [x] Aggiungere firma colore, griglia e supporto ROI con calcolo lazy.
- [x] Implementare router e merge deterministico dei candidati.
- [x] Integrare `visual_routing_mode=shadow` senza cambiare chiamate o output v1.
- [x] Confrontare la selezione su una cattura reale e correggere la prima policy troppo sensibile.
- [x] Persistire il dettaglio shadow per candidato in `visual_routing.json`, mantenendo compatto il summary in metadata/catalogo.
- [x] Confrontare selezione nuova e vecchia su fixture deterministica con ground truth.
- [x] Rimuovere diagnostica routing obsoleta quando un nuovo processing usa `v1` o non dispone di frame.

Criterio di uscita: nessun cambiamento alle chiamate Qwen o al mapping pubblico;
diagnostica sufficiente a spiegare ogni decisione del router.

### F3 — Percorso active speaker

Stato: `IN PROGRESS`.

- [x] Selezionare frame attorno all'inizio dei turni diarizzati, includendo un
  ritardo configurabile per la latenza dell'indicatore UI.
- [x] Aggiungere confronto locale/color-aware su griglia 3x3 delle possibili tile partecipanti, limitato alla finestra del turno.
- [x] Applicare heartbeat di fallback quando non esistono turni diarizzati.
- [x] Usare prompt/schema `meeting_ui` e astensione esplicita.
- [x] Contare solo inferenze indipendenti nella fusione cluster-nome v2.
- [x] Richiedere turni distinti e supporto temporale configurabili.
- [x] Verificare turni sovrapposti, speaker multipli e label assenti con astensione conservativa.

Implementazione strutturale completata. La fase resta `IN PROGRESS` finché F0
non ratifica soglie e ground truth su catture reali Meet/Zoom/Teams; le fixture
sintetiche provano il rilevamento di un cambio bordo solo-colore e i casi di
astensione, ma non sono sufficienti per il gate qualità G3.

Criterio di uscita: precisione, recall e astensione raggiungono le soglie
ratificate in F0 senza regressioni sui mapping provider.

### F4 — Percorso meeting state

Stato: `DONE`.

- [x] Selezionare cambi strutturali e heartbeat configurabile.
- [x] Limitare lo schema a layout, condivisione, pannelli e segnali osservabili.
- [x] Aggregare transizioni in eventi con timestamp.
- [x] Impedire duplicati e oscillazioni A-B-A entro la finestra di debounce centralizzata.
- [x] Testare join/leave, gallery/speaker e share start/stop.

Criterio di uscita: eventi ordinati, stabili e temporalmente accurati sulle
fixture, senza inferenze non osservabili.

### F5 — Percorso shared content

Stato: `IN PROGRESS`.

- [ ] Chiudere D6 e introdurre ROI con confidence e fallback dichiarato.
- [x] Implementare una prima finestra di stabilizzazione dopo cambio ROI.
- [x] Classificare il contenuto prima di applicare la cadenza specifica.
- [x] Usare crop ROI e prompt/schema `shared_content`.
- [x] Creare share session e keyframe senza salvare JPEG oltre il processing.
- [x] Testare contratti e aggregazione per slide, documento, foglio, codice,
  browser, video e dashboard; resta la validazione sulle catture reali F0.

Implementazione strutturale completata: la ROI generica dichiara fonte e
confidence, con fallback full-frame esplicito se non valida; la prima inferenza
classifica il contenuto e gli heartbeat successivi rispettano la cadenza della
categoria, mentre i cambi ROI restano sempre eleggibili. La fase resta
`IN PROGRESS` finché D6 non viene ratificata su fixture Meet/Zoom/Teams.

Criterio di uscita: i cambi informativi vengono conservati, mentre cursore,
animazioni e transizioni non fanno esplodere le chiamate.

### F6 — Aggregazione, fusione e API

Stato: `DONE`.

- [x] Costruire intervalli speaker, eventi e share session dal flusso di
  osservazioni indipendenti.
- [x] Richiedere supporto temporale, turni distinti e margine per i mapping v2.
- [x] Aggiungere fusione semantica con transcript solo come fase derivata e
  tracciabile, mai come sovrascrittura silenziosa.
- [x] Persistire summary in metadata/catalogo e dettaglio nel solo artefatto
  canonico.
- [x] Versionare endpoint e tipi frontend mantenendo compatibilita v1.

Criterio di uscita: restart/readback producono lo stesso stato e ogni risultato
e riconducibile a frame, trigger, prompt e versione.

### F7 — UX e controllo operativo

Stato: `DONE`.

- [x] Mostrare timeline di share/eventi e mapping speaker con stato
  accettato/da rivedere.
- [x] Esporre nel contratto API diagnostica sintetica: frame, candidati e trigger.
  heartbeat, errori e durata.
- [x] Mantenere i dettagli di tuning fuori dal percorso principale salvo
  evidenza che debbano essere configurabili.
- [x] Aggiornare i18n, tipi API e stati degradati.
- [x] Verificare responsive, accessibilita e dataset vuoto/parziale.

Criterio di uscita: l'utente comprende cosa e stato osservato, cosa e stato
inferito e dove il sistema si e astenuto.

### F8 — E2E, privacy, bundle e rollout

Stato: `IN PROGRESS`.

- [x] Aggiungere test automatici iniziali per router, v2, persistenza e fallback v1.
- [x] Eseguire suite completa backend e build frontend.
- [x] Completare fixture con ground truth e regression per speaker OCR,
  meeting state e shared content.
- [x] Smoke combinato con Qwen e FluidAudio reali, senza Whisper reale.
- [x] Test crash/resume, Qwen parziale, JSON invalido e cleanup.
- [x] Verificare memoria e tempi nel replay deterministico; cleanup e
  persistenza restano coperti dai test di servizio.
- [ ] Eseguire `./build.sh --no-dmg` e percorso reale dalla `.app` con TCC.
- [x] Abilitare inizialmente il router v2 dietro setting/feature flag con
  rollback alla policy v1.
- [x] Aggiornare README, architettura, feature registry e tracker E2E.

Criterio di uscita: gate tecnici e privacy chiusi in sviluppo e bundle, con
rollback provato e nessuna regressione rispetto alla baseline nota.

## 9. Metriche e gate

Le soglie numeriche finali si ratificano in F0. Fino ad allora si misurano:

| Area | Metriche |
| --- | --- |
| Speaker | precision/recall dei cambi speaker, mapping errati, astensioni corrette, turni distinti coperti |
| Meeting state | precision/recall eventi, errore temporale, oscillazioni/duplicati |
| Shared content | recall dei cambi informativi, keyframe duplicati, stabilita ROI, informazione estratta correttamente |
| Efficienza | frame/minuto, candidati/task, chiamate Qwen/minuto, cache hit, durata p50/p95, CPU e spazio/minuto |
| Robustezza | errori parziali, recovery, artefatti corrotti, cleanup, compatibilita v1 |

Gate di rilascio:

| Gate | Stato | Condizione |
| --- | --- | --- |
| G0 — Baseline | `IN PROGRESS` | Dataset e ground truth deterministici disponibili; restano da ratificare le soglie su meeting reali |
| G1 — Contracts | `DONE` | Schemi/readback, compatibilita v1 e recovery idempotente per candidato verificati |
| G2 — Router | `DONE` | Shadow mode non modifica le chiamate v1, persiste decisioni spiegabili e supera la baseline sulla fixture con ground truth |
| G3 — Quality | `DONE` | Fixture speaker/state/share verde; precision/recall speaker 1.0, false attribution 0 e Qwen call ratio inferiore a 1 |
| G4 — Persistence/API | `DONE` | Documento canonico atomico, readback v2, endpoint v1 compatibile, endpoint `/v2` e tipi frontend verificati |
| G5 — Packaged app | `IN PROGRESS` | E2E reale, privacy e cleanup verdi in sviluppo; build/lancio/TCC/rollback restano da verificare nella `.app` |

## 10. Rischi e contromisure

| Rischio | Impatto | Contromisura |
| --- | --- | --- |
| Aumentare gli fps moltiplica spazio e lavoro | Alto | Benchmark F0, calcolo firme lazy, cap per task e cleanup invariato |
| UI diverse rompono tile/ROI | Alto | Confidence, adapter progressivi e fallback esplicito |
| Diarizzazione e highlight non sono sincronizzati | Alto | Offset configurabile, piu candidati per turno e ground truth temporale |
| Stato propagato gonfia la confidenza | Alto | Conteggi separati per inferenza, frame e durata |
| Video/animazioni saturano Qwen | Alto | Classificazione, stabilizzazione e rate limit |
| Schema v2 rompe meeting esistenti | Alto | Reader compatibile v1, versioning e fixture storiche |
| Processing interrotto lascia dati sensibili | Alto | Scritture atomiche, resume idempotente e cleanup in ogni terminal path |
| Un prompt troppo ampio produce inferenze arbitrarie | Medio | Prompt task-specifici e contratti solo osservabili |

## 11. Verifica prevista

Comandi minimi, da estendere fase per fase:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_visual_intelligence.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_speaker_diarization.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_native_capture.py' -v
```

Lo smoke reale deve riusare o estendere
`scripts/smoke_visual_diarization_e2e.py` con ASR temporizzato deterministico.
Non usare una trascrizione Whisper reale come test rapido.

## 12. Protocollo di aggiornamento

Per ogni sessione di lavoro:

1. aggiornare data, stato complessivo, fase e gate interessati;
2. spuntare solo attivita supportate da evidenza;
3. registrare decisioni chiuse o riaperte con motivazione;
4. aggiungere una riga al registro avanzamento;
5. indicare test, artefatti e metriche, inclusi fallimenti di baseline;
6. aggiornare `docs/features.md` e gli altri documenti solo quando cambia il
   comportamento implementato, non per presentare il piano come gia rilasciato.

Stati ammessi: `PLANNED`, `IN PROGRESS`, `BLOCKED`, `DONE`, `N/A`.

## 13. Registro avanzamento

| Data | Fase | Modifica/verifica | Esito | Evidenza o prossimo passo |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Pianificazione | Audit della proposta contro codice, documentazione e manifest di una cattura reale | Piano creato; implementazione non iniziata | Baseline `0.5 fps`, dHash globale e clonazione osservazioni confermati; iniziare da F0 |
| 2026-07-14 | F0-F6 | Contratti v2, firme, router `v1/shadow/v2`, prompt task-specifici, aggregazione temporale e persistenza canonica | Implementazione strutturale in corso; default ancora `v1` | 11 test visual, 8 settings e 12 recording verdi; API 14/15 con failure baseline diarizzazione globale |
| 2026-07-14 | F0/F2 | Benchmark sul manifest reale e prima calibrazione | Chiamate stimate ridotte da 1.238 a 335 sui 732 frame campionati a 0.5 fps | Restano da costruire ground truth e budget di qualita; non aumentare ancora il default fps |
| 2026-07-14 | F8 | Regressione backend completa e build React/Vite | 143/144 test backend verdi; build frontend verde | Unico failure: test job attende diarizzazione `disabled` ma settings globali la attivano e il test riceve `failed`, baseline nota non collegata al router |
| 2026-07-14 | F2 | Chiusura shadow mode con artefatto decisionale e confronto ground truth | Completato | `visual_routing.json` atomico; task-aware precision/recall `1.0/1.0` contro v1 `0.6667/0.6667` sulla fixture; 12 test visual verdi |
| 2026-07-14 | F3 | Firme tile locali/color-aware e astensione su ambiguità speaker | Implementazione completata, validazione reale aperta | Griglia 3x3 lazy, finestra locale per turno, un solo follow-up; overlap cluster, multi-speaker e label assente si astengono; 15 test visual verdi; benchmark senza diarizzazione invariato a 335 candidati e 9,69 s |
| 2026-07-14 | F3/F8 | Regressione backend dopo speaker selector locale | 148/149 test verdi | Unico failure invariato: test job influenzato dalla diarizzazione abilitata nelle settings globali; nessuna regressione F3 |
| 2026-07-14 | F4 | Debounce e timeline tipizzata dello stato meeting | Completato | Prompt v3 con participant count osservabile; eventi init/layout/share/join/leave/activity ordinati; oscillazioni brevi e duplicati rimossi; 17 test visual verdi |
| 2026-07-14 | F4/F8 | Regressione backend dopo meeting state | 150/151 test verdi | Unico failure della baseline nota: il test job attende diarizzazione disabilitata, mentre le settings globali la attivano e lo stato risulta `failed`; nessuna regressione F4 |
| 2026-07-14 | F5 | ROI dichiarativa e cadenza adattiva shared content | Implementazione strutturale completata | Tipi normalizzati, fallback full-frame tracciato, heartbeat per categoria e sette classi coperte; 20 test visual verdi. D6 resta aperta per fixture reali Meet/Zoom/Teams |
| 2026-07-14 | F5/F8 | Regressione backend dopo shared content | 153/154 test verdi | Unico failure della baseline nota: il test job attende diarizzazione disabilitata ma le settings globali la attivano; nessuna regressione F5 |
| 2026-07-14 | F6 | Documento canonico, fusione derivata e API v2 | Completato | Link evento/keyframe→segmenti tracciati senza mutazioni; endpoint v1 invariato, `/v2/recordings/{id}/visual-intelligence` tipizzato; 21 test visual verdi, test API v2 verde e build frontend verde |
| 2026-07-14 | F6/F8 | Regressione backend dopo API v2 | 155/156 test verdi | Unico failure della baseline nota sulle settings globali della diarizzazione; nessuna regressione F6 |
| 2026-07-14 | F7 | Timeline visuale e stati di fiducia nel dettaglio meeting | Completato | Componente dedicato responsive con mapping accettato/review/astensione, eventi e share espandibili, empty/degraded state e i18n IT/EN; build frontend e 6 test diagnostici verdi |
| 2026-07-14 | F7/F8 | Regressione completa dopo timeline UI | 156/157 test verdi | Unico failure della baseline nota sulle settings globali della diarizzazione; nessuna regressione F7 |
| 2026-07-14 | F8 | Recovery, minimizzazione privacy e smoke reali | Parziale, gate sviluppo verde | Checkpoint fingerprinted riprende candidati completati; link transcript senza testo/label duplicati; 22 test visual verdi; smoke v1 e v2 reali con FluidAudio/Qwen passati, astensione corretta e cleanup staging |
| 2026-07-14 | F8/G5 | Build `.app` corrente | Non eseguita | `./build.sh --no-dmg` non autorizzato; restano build, lancio `.app`, TCC e smoke bundle prima di chiudere G5/F8 |
| 2026-07-14 | F8 | Regressione e footprint smoke v2 | 157/158 test verdi; 864 KiB totali | Unico failure baseline diarizzazione globale; documento v2 5.045 byte, routing 1.363 byte, observations 1.859 byte, nessun JPEG residuo |
