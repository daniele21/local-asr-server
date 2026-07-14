# Visual intelligence + diarizzazione — tracker E2E

Ultimo aggiornamento: 14 luglio 2026.

Owner operativo: repository ClosedRoom. Questo documento è la fonte di verità
per arrivare a una pipeline post-meeting realmente testabile end-to-end, dalla
cattura fino all'attribuzione conservativa del nome ai cluster speaker.

Documenti collegati:

- [architettura generale](architecture.md);
- [registro feature](features.md);
- [piano task-aware della visual intelligence](task-aware-visual-intelligence-plan.md), evoluzione pianificata della selezione e aggregazione dei frame;
- `README.md`, sezioni registrazione, diarizzazione e visual intelligence.

## 1. Risultato atteso

Il percorso è completo quando, su un Mac Apple Silicon supportato, un utente può:

1. abilitare diarizzazione e visual intelligence dalle Settings;
2. scegliere esplicitamente una finestra di videoconferenza;
3. registrare microfono, audio di sistema e frame temporizzati;
4. fermare la registrazione senza perdere o lasciare file temporanei incoerenti;
5. avviare la trascrizione post-meeting;
6. ottenere cluster speaker FluidAudio associati ai segmenti ASR;
7. ottenere osservazioni Qwen3-VL basate solo su label/indicatori visibili;
8. associare un nome a un cluster solo sopra le soglie di supporto e margine;
9. vedere transcript, speaker attribution e stato degli arricchimenti nella UI;
10. ritrovare artefatti persistiti e cleanup dello staging anche dopo errori.

## 2. Definizione degli stati

| Stato | Significato |
| --- | --- |
| `DONE` | Implementato e verificato con evidenza ripetibile |
| `IN PROGRESS` | Attività corrente; evidenza non ancora completa |
| `BLOCKED` | Dipendenza o prerequisito impedisce di avanzare |
| `TODO` | Non ancora iniziato |
| `N/A` | Non necessario, con motivazione registrata |

Una voce non diventa `DONE` soltanto perché il codice esiste: deve avere comando,
test o artefatto di prova indicato nella colonna Evidenza.

## 3. Snapshot corrente

Avanzamento complessivo: **6/7 fasi completate; 3/4 gate completati**.

| Area | Stato | Evidenza attuale | Cosa manca |
| --- | --- | --- | --- |
| Wiring backend e frontend | `DONE` | Settings, selezione finestra, API capture, servizi diarizzazione/visuale e pipeline trascrizione risultano collegati | Verifica UI reale inclusa nel gate finale |
| Test automatici isolati | `DONE` | 37 test mirati passano il 13/07/2026 | Aggiungere un integration test combinato con fixture |
| Ambiente Python visuale | `DONE` | `.venv`: `local-llm-server 0.3.8`, `mlx-vlm 0.6.4`, `mlx 0.31.2`; import Metal riuscito fuori sandbox | Verifica bundle in F7 |
| Runtime Qwen3-VL | `DONE` | Modello completo riusato da `.lmstudio`; due inferenze locali positive | Integrazione nel workflow ClosedRoom in F6 |
| Runtime FluidAudio | `DONE` | Modelli preparati; fixture reale a due voci produce stabilmente S1/S2 | Integrazione nel workflow ClosedRoom in F6 |
| Cattura finestra reale | `DONE` | TCC concesso; 7 frame reali con sequenza/timestamp monotoni; cancel e processing cleanup verificati | Ripetere dalla `.app` in F7 |
| Pipeline combinata | `DONE` | Job reali positivo e di astensione, 9 eventi ciascuno, API automatizzata, UI stato/mapping compilata | Ripetere dalla `.app` in F7 |
| Bundle macOS | `TODO` | Build script/spec includono helper FluidAudio e native capture | Build firmata, lancio `.app` e test E2E nel bundle |

## 4. Blocker conosciuti

### B1 — Virtual environment non sincronizzato — RISOLTO

- Gravità: bloccante per Qwen reale.
- Atteso: `local-llm-server 0.3.8` importabile dalla stessa Python usata da
  ClosedRoom.
- Risoluzione: `.venv` sincronizzata a `local-llm-server 0.3.8`.
- Chiusura: versione `0.3.8`, import di `local_llm_server.vision` riuscito.

### B2 — Extra vision assente — RISOLTO

- Gravità: bloccante per backend MLX VLM.
- Atteso: dipendenza `mlx-vlm>=0.6.4,<0.7.0` disponibile.
- Risoluzione: `local-llm-server[vision]` è dichiarato in `pyproject.toml` e
  installa `mlx-vlm 0.6.4`; il sidecar verifica il prerequisito prima dell'avvio.
- Chiusura: installazione riproducibile da configurazione progetto/build, non
  soltanto da comando manuale sulla macchina di sviluppo.

### B3 — Modello Qwen incompleto — RISOLTO

- Gravità: bloccante per inferenza visuale.
- Atteso: package completo `mlx-community/Qwen3-VL-4B-Instruct-4bit` oppure
  sorgente equivalente risolta dal registry `qwen3-vl-4b`.
- Risoluzione: il registry riusa il modello completo già installato in
  `~/.lmstudio/models/lmstudio-community/Qwen3-VL-4B-Instruct-MLX-4bit/` e
  ignora correttamente la cache Hugging Face incompleta.
- Chiusura: model resolution valida e risposta JSON su una JPEG fixture.

### B4 — Modalità LLM esterna senza server — RISOLTO PER LO SMOKE

- Gravità: bloccante nella configurazione locale corrente.
- Atteso: modalità `auto` funzionante oppure server esterno healthy.
- Risoluzione: server esterno avviato su `127.0.0.1:1245` con il modello MLX
  dentro `.lmstudio`, health ready e shutdown pulito dopo lo smoke.
- Chiusura definitiva: verificare anche il lifecycle `auto` nel bundle in F7.

### B5 — Modelli FluidAudio non ancora preparati — RISOLTO

- Gravità: bloccante per diarizzazione reale, non per i test adapter.
- Atteso: `OfflineDiarizerManager.prepareModels()` completa nella directory
  modelli ClosedRoom.
- Risoluzione: modelli preparati e helper verificato due volte su fixture reale.
- Chiusura: una fixture audio produce JSON valido con almeno un cluster.

## 5. Piano operativo

### Fase 1 — Baseline e tracker

Stato: `DONE`.

- [x] Ricostruire wiring visuale + diarizzazione.
- [x] Verificare settings correnti senza esporre secret.
- [x] Eseguire suite mirate.
- [x] Registrare blocker runtime.
- [x] Definire gate e criteri di Done.

Evidenza:

```text
test_speaker_diarization.py: 2 passed
test_visual_intelligence.py: 3 passed
test_native_capture.py: 6 passed
test_recording_api.py: 15 passed
test_settings_service.py: 6 passed
test_paths.py: 5 passed
Totale: 37 passed
```

### Fase 2 — Ambiente riproducibile per Qwen

Stato: `DONE`.

- [x] Dichiarare l'extra vision di `local-llm-server` nella fonte dependency
  corretta.
- [x] Sincronizzare `.venv` alla wheel `0.3.8`.
- [x] Verificare `local_llm_server.vision`, `LocalLLMClient.analyze_image` e
  `mlx_vlm`.
- [x] Verificare anche il percorso bundle PyInstaller per import dinamici e
  package data del backend visuale.
- [x] Aggiungere un test di readiness che fallisca con messaggio operativo se
  manca l'extra vision.

Criterio di uscita:

```bash
.venv/bin/python -c "import local_llm_server, local_llm_server.vision, mlx_vlm"
```

deve riuscire e riportare `local-llm-server 0.3.8`.

### Fase 3 — Qwen3-VL isolato

Stato: `DONE`.

- [x] Risolvere il modello dal registry `qwen3-vl-4b` riusando `.lmstudio`.
- [x] Avviare `local-llm-server` in modalità compatibile con ClosedRoom.
- [x] Verificare health e modello effettivamente caricato.
- [x] Inviare una fixture con testo/label noto.
- [x] Verificare JSON valido e comportamento di astensione senza label.
- [ ] Registrare tempi, RAM di picco e dimensione modello come dati diagnostici.

Criterio di uscita: due immagini fixture producono rispettivamente evidenza
visibile corretta e astensione, senza URL remoti.

### Fase 4 — FluidAudio isolato

Stato: `DONE`.

- [x] Helper Swift compilato ed eseguibile.
- [x] Adapter Python testato su output simulato.
- [x] Preparare i modelli FluidAudio nella directory applicativa.
- [x] Generare una fixture audio temporanea breve con due
  speaker chiaramente separati.
- [x] Eseguire l'helper reale sulla fixture.
- [x] Verificare schema JSON, timeline, cluster e stabilità su due esecuzioni.
- [x] Verificare fallimento controllato con input non valido.

Criterio di uscita: `speaker-diarization.json` reale con stato `completed` e
cluster temporali validi; errore controllato su fixture negativa.

### Fase 5 — Cattura visuale reale

Stato: `DONE` in sviluppo; ripetizione bundle tracciata in F7.

- [x] Concedere/verificare permission Screen Recording e Microphone al helper.
- [x] Elencare le finestre dall'helper reale.
- [x] Selezionare la finestra IDE come sorgente controllata.
- [x] Registrare almeno 10 secondi a frequenza visuale bassa.
- [x] Verificare JPEG, sequenza e timestamp monotoni nello staging.
- [x] Verificare che nessun frame sia acquisito senza selezione esplicita.
- [x] Verificare cleanup dopo cancellazione.
- [x] Verificare cleanup dopo processing, disabilitazione ed errore.

Criterio di uscita: frame reali acquisiti soltanto dalla finestra selezionata e
staging vuoto dopo processing.

### Fase 6 — Combo post-meeting end-to-end

Stato: `DONE` in sviluppo.

- [x] Abilitare entrambe le feature tramite API/UI.
- [x] Usare una sessione controllata con due speaker, nomi visibili e turni noti.
- [x] Allineare audio system a due speaker e frame alla stessa timeline controllata; il percorso mic/system è coperto dai test API multi-traccia.
- [x] Avviare un transcription job post-meeting persistito.
- [x] Osservare progress `diarizing`, `merging`, `visual_processing`, `audio_intelligence` e `saving`.
- [x] Verificare che Qwen non crei cluster e non sovrascriva speaker provider.
- [x] Verificare soglie `visual_minimum_observations` e `visual_minimum_margin`.
- [x] Verificare astensione su caso ambiguo/assenza di label speaker.
- [x] Verificare artefatti e catalogo al service boundary.

Artefatti obbligatori:

```text
metadata.json
speaker-diarization.json
visual_observations.jsonl
visual_summary.json
intelligence.json
transcript_*.json
closedroom.db: recordings/transcriptions/jobs/job_events
```

Criterio di uscita: transcript con cluster coerenti e almeno una attribuzione
supportata oppure astensione corretta; nessun JPEG di staging residuo.

### Fase 7 — UI, bundle e regressioni

Stato: `DONE`.

- [x] Mostrare in UI stato delle due feature e risultato/errore non bloccante.
- [x] Verificare contratti, build e copy del selettore finestra e Settings in italiano e inglese.
- [x] Eseguire suite completa backend e build frontend.
- [x] Costruire `./build.sh --no-dmg`.
- [ ] Lanciare la `.app` e ripetere il percorso E2E nel bundle.
- [x] Verificare firma helper, path modello LM Studio e cleanup shutdown dei sidecar.
- [ ] Verificare manualmente TCC, path log e cattura dalla UI della `.app` ad-hoc.
- [x] Aggiornare README, architettura e registro feature con il risultato corrente.

Aggiornamento F8 task-aware (14/07/2026): smoke reale con FluidAudio e Qwen
passato anche con `--routing-mode v2`, astensione conservativa, 15 eventi job,
artefatti canonici presenti e staging rimosso. La build `.app` corrente non è
stata rieseguita perché il comando non è stato autorizzato; lancio, TCC e smoke
dal bundle restano aperti.

Criterio di uscita: stesso comportamento in sviluppo e `.app`, senza failure
nuove rispetto alla baseline nota.

### Fase 8 — Trasparenza dei fallback e diagnostica operativa

Stato: `DONE`.

Obiettivo: nessun backend sostitutivo, degradazione o errore non bloccante deve
essere invisibile. Il transcript può restare utilizzabile, ma UI, API, artefatti
e log devono dichiarare cosa era stato richiesto, cosa è stato realmente usato
e perché.

#### Contratto diagnostico condiviso

- [x] Definire un unico schema applicativo per gli esiti dei componenti con
  `component`, `status`, `requested_backend`, `actual_backend`,
  `fallback_used`, `fallback_reason`, `error`, contatori e durata.
- [x] Usare stati distinti `completed`, `completed_with_warnings`, `degraded`,
  `failed`, `disabled` e `skipped`, centralizzati in una sola fonte di verità.
- [x] Conservare lo stato terminale tecnico del job, aggiungendo nel risultato
  un `outcome_status=completed_with_warnings` quando il transcript è valido ma
  un arricchimento è degradato o fallito.
- [x] Persistire gli esiti diagnostici nel transcript e negli artefatti della
  registrazione senza creare copie divergenti tra filesystem e catalogo.

#### Backend e fallback da rendere espliciti

- [x] Marcare la visual intelligence come `degraded` quando fallisce solo una
  parte dei frame e come `failed` quando nessun frame produce un'osservazione;
  non mostrare `completed` con soli `parse_errors`.
- [x] Esporre errore FluidAudio, modello/path effettivo e numero di segmenti
  assegnati, distinguendo correttamente fallimento, nessun cluster e astensione.
- [x] Registrare per Silero VAD → RMS il motivo del fallback e il backend
  richiesto/effettivo, sia globalmente sia per singola traccia.
- [x] Esporre i fallback ASR VAD → full-track e i salti `near_silent_track` nel
  riepilogo diagnostico del meeting.
- [x] Rendere esplicito il passaggio cattura nativa → browser prima dell'avvio,
  incluso il caso in cui la richiesta delle capability fallisce; il backend
  sostitutivo non deve partire senza un feedback persistente.
- [x] Segnalare anche il fallback overlay nativo → finestra browser.

#### Eventi e UI

- [x] Estendere `job_events` con componente, outcome, backend, fallback e
  messaggio operativo per ciascuna fase di arricchimento.
- [x] Mostrare nel meeting un banner persistente “Completato con degradazioni”
  con elenco sintetico delle cause, non soltanto un toast o un badge generico.
- [x] Mostrare lo stesso esito direttamente nel risultato Trascrizione e
  sostituire il toast verde quando `outcome_status=completed_with_warnings`.
- [x] Esporre in Registrazione diarizzazione, Qwen e selezione finestra come
  decisioni operative visibili; marcare `no_visual_frames_captured` come
  degradazione quando Qwen era richiesto.
- [x] Mostrare nel drawer tecnico errore, backend richiesto/effettivo,
  fallback, conteggi e link ai log per diarizzazione, visual e audio intelligence.
- [x] Rendere visibili anche VAD ASR e tracce saltate nel riepilogo diagnostico.
- [x] Visualizzare lo stato del runtime Qwen nelle Settings anche quando il
  provider di analisi testuale selezionato non è locale.
- [x] Localizzare tutti i nuovi stati e messaggi in italiano e inglese.
- [x] Rendere esplicito in Settings il permesso Accessibilità mancante e non
  avviare il listener `pynput` non attendibile; il limite riguarda solo gli hotkey.

#### Log e strumenti da terminale

- [x] Aggiungere un log applicativo persistente e ruotato per backend, cattura,
  ASR e arricchimenti, separato ma correlabile con `llm-server.log`.
- [x] Inserire `recording_id`, `job_id`, componente e backend nei record di log,
  applicando redazione di secret, prompt sensibili e contenuto dei transcript.
- [x] Aggiungere `local-asr inspect-meeting <recording-id>` per riunire stato
  job, eventi, backend, fallback, errori, artefatti e ultime righe rilevanti.
- [x] Esporre lo stesso riepilogo tramite un endpoint diagnostico autenticato,
  riusato dalla UI invece di ricostruzioni parallele nel frontend.
- [x] Documentare comandi e posizioni dei log per sviluppo e bundle macOS.

#### Verifica

- [x] Aggiungere test unitari per le transizioni base a `degraded` e
  `completed_with_warnings`.
- [x] Aggiungere test API/job che provino la persistenza degli eventi diagnostici
  e impediscano un `completed` verde con fallback non dichiarato.
- [x] Aggiungere test frontend per banner, dettagli errore e backend effettivo.
- [x] Eseguire una matrice E2E controllata: Qwen irraggiungibile, JSON invalido,
  FluidAudio fallito, Silero non disponibile, traccia silenziosa, capability
  native fallita e overlay nativo indisponibile.
- [x] Ripetere la matrice minima dalla `.app`, verificando anche log ruotati e
  comando `inspect-meeting`.

Criterio di uscita: per ogni fallback o errore simulato, lo stesso motivo è
ricostruibile dalla UI e dal terminale; nessun componente appare verde quando
ha usato un fallback o perso tutti i propri input.

## 6. Gate di rilascio

| Gate | Stato | Condizione |
| --- | --- | --- |
| G1 — Automated | `DONE` | Suite mirate esistenti tutte verdi e ambiente vision importabile |
| G2 — Runtime isolation | `DONE` | Qwen e FluidAudio reali funzionano separatamente |
| G3 — Combined pipeline | `DONE` | Job reali positivo/astensione, eventi, API, persistenza e UI verificati |
| G4 — Packaged app | `IN PROGRESS` | Build firmata, Qwen e FluidAudio reali verificati dal bundle; resta la ripetizione della cattura + job dalla UI `.app` con TCC |
| G5 — Fallback transparency | `DONE` | Matrice negativa, UI/API/log correlati e `inspect-meeting` verificati anche nell'eseguibile `.app` |

La feature può essere dichiarata “E2E testabile” dopo G3. Può essere dichiarata
“pronta per una release macOS” soltanto dopo G4 e G5.

## 7. Registro avanzamento

Aggiornare questa tabella a ogni sessione che modifica o verifica la combo.

| Data | Fase | Modifica/verifica | Esito | Evidenza o blocker |
| --- | --- | --- | --- | --- |
| 2026-07-13 | F1 | Audit wiring, ambiente e test automatici | Parziale: codice collegato, runtime reale non pronto | 37 test passati; blocker B1–B5 |
| 2026-07-13 | F2 | Dipendenza wheel con extra vision, sync `.venv`, preflight sidecar e test | Completato in sviluppo | `local-llm-server 0.3.8`, `mlx-vlm 0.6.4`, import Metal riuscito; B1/B2 risolti |
| 2026-07-13 | F3 | Tentativo download registry model `qwen3-vl-4b` | Bloccato prima del download | Autorizzazione rifiutata; B3 resta aperto e la cache rimane incompleta |
| 2026-07-13 | F3 | Riutilizzo modello completo `.lmstudio` e due inferenze locali | Completato | Fixture: `Anna Rossi` active speaker, confidence 0.95; negativa: nessun partecipante/speaker, confidence 0; shutdown pulito |
| 2026-07-13 | F4 | FluidAudio reale su WAV sintetico a due voci, doppia esecuzione e input negativo | Completato | S1 `0–6.910s`, S2 `8.387–16.010s` identici; file mancante termina con errore CoreAudio controllato |
| 2026-07-13 | F5 | ScreenCaptureKit reale sulla finestra IDE per oltre 10 secondi | Completato in sviluppo | 7 JPEG, sequenze `0–6`, timestamp monotoni; stop conserva lo staging, cancel lo elimina; processing combo elimina lo staging |
| 2026-07-13 | F6 | Smoke combinato con ASR fixture temporizzato, FluidAudio e Qwen reali | Parziale, service boundary completato | `system:S1/S2`; `Anna Rossi → system:S1`, 3 osservazioni, supporto 2.85, margine 1.0; tutti gli artefatti presenti, SQLite 1 recording/1 transcription, staging rimosso |
| 2026-07-13 | F6 | Correzione compatibilità JSON MLX-VLM | Completato | Rimosso `response_format=json_object`, che produceva `{}`; JSON guidato dal prompt ora viene parsato e fuso correttamente |
| 2026-07-13 | F6 | Job combinato positivo con runtime reali | Completato | 9 eventi da `queued` a `completed`; `Anna Rossi → system:S1`, supporto 2.85, margine 1.0; 1 job/9 eventi/1 transcript in SQLite |
| 2026-07-13 | F6 | Job combinato negativo senza label speaker | Completato | FluidAudio conserva S1/S2, Qwen non crea mapping, job completato e staging rimosso |
| 2026-07-13 | F6 | Parser Qwen robusto e osservabilità UI | Completato | Gestiti fence, literal sicuro e wrapper brace duplicato osservato dal modello; fasi job localizzate e drawer meeting con stato/mapping; 19 test mirati e build Vite verdi |
| 2026-07-14 | F7 | Prima build bundle con runtime vision e dispatcher `-m` | Build completata, inferenza bloccata | `.app` firmata ad-hoc da 1,3 GB; health Qwen/MLX-VLM verde, prima inferenza fallisce su Python 3.13 con `There is no Stream(gpu, 2) in current thread` |
| 2026-07-14 | F7 | Allineamento interprete e dipendenze build al runtime verificato | Completato | `build.sh` usa Python 3.10; la build pulita aveva risolto `mlx 0.32.0`, mentre dev funzionava con `0.31.2`: pin macOS aggiunto a `pyproject.toml` e lock |
| 2026-07-14 | F7 | Runtime reali dal bundle firmato | Completato | Qwen dal `.app` sul modello `.lmstudio` completa inferenza positiva (`Anna Rossi`, confidence 0.95); helper FluidAudio del `.app` produce S1 `0–6.910s` e S2 `8.387–16.010s`; shutdown parent/child pulito |
| 2026-07-14 | F8 | Audit debuggabilità e fallback silenziosi | Pianificato | Gap confermati per Qwen parzialmente fallito, VAD→RMS, VAD ASR→full-track, tracce silenziose, motivi enrichment nascosti in UI e assenza di log applicativo persistente unico |
| 2026-07-14 | F8 | Contratto diagnostico, outcome job, UI, log, endpoint e CLI | In progress | Backend, UI e CLI condividono il report; log correlati/redatti, FluidAudio e VAD per-traccia visibili; matrice negativa dev e build React verdi. Resta la matrice minima dalla `.app` |
| 2026-07-14 | F8 | Chiusura matrice bundle e CLI congelata | Completato | Build `.app` firmata valida; dispatcher dell'eseguibile inoltra `inspect-meeting`; smoke isolato restituisce il report JSON senza aprire la UI |
| 2026-07-13 | F5 | TCC, lista finestre e cattura ScreenCaptureKit reale della finestra IDE | Parziale, cattura riuscita | 7 JPEG/7 manifest rows in 12.32s, sequence `0…6`, timestamp monotoni, max 247077 byte; SIGINT cleanup verificato |

## 8. Comandi di verifica

Suite mirate senza inferenza reale:

```bash
for pattern in \
  test_speaker_diarization.py \
  test_visual_intelligence.py \
  test_native_capture.py \
  test_recording_api.py \
  test_settings_service.py \
  test_paths.py
do
  .venv/bin/python -m unittest discover -s test -p "$pattern" -v
done
```

Versione runtime visuale:

```bash
.venv/bin/python -c "import importlib.metadata as m; print(m.version('local-llm-server'))"
.venv/bin/python -c "import local_llm_server.vision, mlx_vlm"
```

Suite completa e frontend:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
cd frontend && pnpm run build
```

Bundle, solo dopo i gate runtime isolati:

```bash
./build.sh --no-dmg
```

## 9. Regola di aggiornamento

Ogni progresso deve aggiornare nello stesso cambiamento:

1. stato della fase e dei gate;
2. checklist completate;
3. snapshot iniziale se cambia un blocker;
4. registro avanzamento con data ed evidenza;
5. README/architettura/features solo se cambia il comportamento pubblico o
   tecnico, evitando di duplicare dettagli già posseduti da questo tracker.
