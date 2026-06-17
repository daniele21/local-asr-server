# AGENTS.md

Guida operativa per agenti che devono comprendere, interrogare e modificare
questo repository.

## Obiettivo del progetto

ClosedRoom e un'app macOS per registrare audio locale, trascriverlo con
MLX Whisper e analizzare il testo. Lo stesso backend puo essere avviato come:

- server FastAPI da CLI;
- app menu bar con finestra nativa WKWebView;
- bundle macOS costruito con PyInstaller.

Il progetto e pensato principalmente per macOS Apple Silicon. Le funzioni di
routing audio e la build `.app` dipendono da API e strumenti macOS.

## Prima di iniziare

1. Leggi `README.md` e `pyproject.toml`.
2. Controlla `git status --short`; non sovrascrivere modifiche non correlate.
3. Cerca simboli e chiamanti con `rg` prima di leggere file interi.
4. Distingui sempre modalita sviluppo e bundle PyInstaller.
5. Se la richiesta comporta modifiche funzionali o tecniche, applica le skill
   repo-locali `skills/maintain-feature-docs` e
   `skills/structured-change-guard` prima di concludere.
6. Non usare una trascrizione Whisper reale come test rapido: puo scaricare un
   modello grande e richiedere molto tempo.

Directory generate o locali da non trattare come sorgente:

- `.cache/`
- `.venv/`
- `build/`
- `build_venv/`
- `dist/`
- `frontend/node_modules/`
- `app_output.log`

## Skill repo-locali obbligatorie

- `skills/maintain-feature-docs`: da usare per ogni feature, fix
  comportamentale, cambio API, workflow frontend, persistenza, impostazione,
  build o routing audio. La modifica non e completa finche la documentazione
  business e tecnica e aggiornata oppure il riepilogo finale spiega perche non
  servono update.
- `skills/structured-change-guard`: da usare per ogni modifica al codice. Prima
  di editare individua la fonte di verita esistente; evita valori hardcoded,
  duplicazioni di endpoint, chiavi settings, path, opzioni UI, stati e regole di
  business.

Fonte di tracciamento feature:

- `docs/features.md`: registro business/tecnico delle feature. Aggiornalo
  quando cambia cosa lo strumento permette di fare, come lo fa, dove persiste i
  dati o come si verifica.

## Mappa del repository

### Entry point e backend

- `src/local_asr_server/cli.py`: comando `local-asr`; sottocomandi `serve`,
  `doctor`, `setup-audio`, `app`.
- `src/local_asr_server/server.py`: composition root FastAPI, modelli request,
  route HTTP, trascrizione MLX, cache e serving degli asset statici.
- `src/local_asr_server/recordings.py`: stato e persistenza delle registrazioni
  a chunk.
- `src/local_asr_server/transcriptions.py`: archivio JSON/TXT delle
  trascrizioni.
- `src/local_asr_server/settings.py`: impostazioni utente persistenti.
- `src/local_asr_server/catalog.py`: catalogo SQLite centrale per metadati
  interrogabili di registrazioni, trascrizioni, progetti e analisi.
- `src/local_asr_server/llm.py`: provider di analisi `mock` e Gemini.

### Audio e app macOS

- `src/local_asr_server/audio_router.py`: lifecycle del dispositivo audio
  temporaneo, sincronizzazione e recovery dopo crash.
- `src/local_asr_server/macos_audio_helper/`: bridge Swift/Core Audio.
- `src/local_asr_server/menubar.py`: entry point del bundle, server Uvicorn in
  thread e menu `rumps`.
- `src/local_asr_server/window.py`: finestra Cocoa con WKWebView; operazioni UI
  sul main thread.
- `src/local_asr_server/launchd.py`: installazione/rimozione del LaunchAgent.
- `src/local_asr_server/paths.py`: risoluzione centralizzata dei path in dev e
  nel bundle.

### Frontend

La UI runtime servita da FastAPI vive in `src/local_asr_server/static/`. I file
statici legacy sono HTML/CSS/JavaScript senza moduli ES; se lavori su questa
superficie non introdurre bundler, moduli ES o import dinamici.

- `src/local_asr_server/static/index.html`: markup e ordine di caricamento.
- `src/local_asr_server/static/config.js`: costanti, default ed endpoint.
- `src/local_asr_server/static/api.js`: client HTTP.
- `src/local_asr_server/static/components.js`: componenti UI condivisi.
- `src/local_asr_server/static/workflow.js`: stato minimo del workflow.
- `src/local_asr_server/static/recorder.js`: MediaRecorder, mix audio, upload
  chunk e routing.
- `src/local_asr_server/static/recordings-view.js`: lista registrazioni.
- `src/local_asr_server/static/dashboard.js`: dashboard iniziale e stato vuoto.
- `src/local_asr_server/static/settings-page.js`: pagina impostazioni.
- `src/local_asr_server/static/analysis-page.js`: pagina analisi, import file,
  selezione trascrizioni e rendering risultati LLM.
- `src/local_asr_server/static/tour.js`: tour e showcase.
- `src/local_asr_server/static/app.js`: orchestratore, navigazione,
  trascrizione, storico e wiring tra controller.
- `src/local_asr_server/static/styles.css`: stili completi dell'app.

`public/` e `website/` non sono la UI servita normalmente da FastAPI.

Nel worktree esiste anche il frontend React/Vite in `frontend/`. Quando una
modifica riguarda quella superficie, lavora sui sorgenti `frontend/src/`, usa
`frontend/src/api/config.ts` per cataloghi e costanti,
`frontend/src/api/apiClient.ts` per il contratto HTTP e
`frontend/src/i18n/i18n.tsx` per testi UI. La build Vite scrive in
`src/local_asr_server/static/`: non modificare a mano asset minificati o hashed
in `src/local_asr_server/static/assets/` se possono essere rigenerati dai
sorgenti.

Hotspot frontend da non far crescere senza motivo:

- `app.js` deve restare un orchestratore. Nuove pagine o workflow importanti
  vanno in controller dedicati caricati prima di `app.js` ed esposti su
  `window`, seguendo lo stile dei file statici esistenti.
- `styles.css` e ancora monolitico. Se aggiungi molte regole per una pagina,
  raggruppale chiaramente nella sezione della pagina; un futuro split CSS deve
  preservare l'ordine di cascade.
- `index.html` e il contratto dei globali frontend: ogni nuovo controller
  statico deve essere incluso nello stack script prima di `app.js`.

### Build e test

- `test/`: suite `unittest`; usa `TestClient` per le API.
- `build.sh`: pipeline completa `.app` e DMG.
- `ClosedRoom.spec`: inclusioni PyInstaller e entry point `menubar.py`.
- `build_assets/`: entitlements, hook e binari preparati dalla build.
- `setup.sh`: installazione locale delle dipendenze.

## Flussi da seguire

### Registrazione

`RecordingController.start()` in `recorder.js`
-> attivazione routing `/v1/system/audio/activate`
-> `getUserMedia` per microfono e BlackHole
-> mix con Web Audio API
-> `POST /v1/recordings`
-> upload sequenziale a `/chunks`
-> `POST /stop`
-> `RecordingStore.finalize()`
-> ripristino `/v1/system/audio/restore`.

La registrazione e la trascrizione sono intenzionalmente separate.

### Trascrizione

`app.js`
-> `ApiClient.transcribe()`
-> `POST /v1/audio/transcriptions`
-> file temporaneo e chiave cache SHA-256
-> `_transcribe()` con `mlx_whisper`
-> risposta JSON, testo o stream NDJSON
-> cache locale
-> `TranscriptionStore.save()`.

Esiste anche `/v1/audio/transcriptions/path` per file gia presenti sul disco.

### Analisi

`AnalysisController` in `app.js`
-> `POST /v1/analysis`
-> recupero testo da `TranscriptionStore` oppure request inline
-> `LLMService.get_provider()`
-> provider mock o Gemini.

### App nativa

`local-asr app` o bundle
-> `menubar.main()`
-> `_ServerThread`
-> `create_app()`
-> `ClosedRoomWindowManager`
-> WKWebView su `http://127.0.0.1:1236`.

## Query rapide

Usa queste query come punto di partenza:

```bash
# Tutti gli endpoint FastAPI
rg -n '@app\.(get|post|put|patch|delete)' src/local_asr_server/server.py

# Definizione e usi di un simbolo Python
rg -n 'AudioRouter|RecordingStore|TranscriptionStore' src test

# Chiamate frontend verso il backend
rg -n 'fetch\(|ApiClient\.|/v1/' src/local_asr_server/static
rg -n 'fetch\(|ApiClient\.|/v1/' frontend/src

# ID HTML e relativi accessi JavaScript
rg -n 'id="NOME"|getElementById\(.NOME.|querySelector.*NOME' \
  src/local_asr_server/static

# Documentazione e skill operative
rg -n 'Feature|feature|settings|endpoint|hardcod|centralizz' \
  docs AGENTS.md skills

# Configurazione, path e differenze bundle/dev
rg -n 'load_settings|get_.*_dir|is_bundled|sys\._MEIPASS' \
  src/local_asr_server

# Routing audio e bridge nativo
rg -n 'AudioRouter|AudioHelper|create_aggregate|restore_original_output' \
  src test

# File coinvolti nella build macOS
rg -n 'hidden_imports|extra_datas|extra_binaries|entitlements|codesign' \
  ClosedRoom.spec build.sh build_assets

# Test collegati a una route o comportamento
rg -n 'recordings|transcriptions|audio|settings' test
```

Per capire una modifica, ricostruisci in ordine:

1. evento UI o comando CLI;
2. client/API route;
3. servizio o store chiamato;
4. file e stato persistiti;
5. test esistenti e comportamento bundle.

## Regole di modifica

- Ogni feature o fix comportamentale deve aggiornare `docs/features.md` e, se
  cambia setup/uso pubblico, anche `README.md`. Se non aggiorni docs, indica il
  motivo nel riepilogo finale.
- Prima di introdurre un valore o una regola, cerca il relativo owner. Endpoint,
  stati, chiavi settings, path, opzioni modello/lingua, limiti file, timer,
  copy UI e mapping dati devono stare in una fonte centralizzata.
- Non hardcodare path utente, directory macOS, URL API, nomi modello, chiavi
  JSON, estensioni supportate o messaggi UI se esiste gia un helper, costante,
  catalogo, settings, i18n o client API.
- Mantieni `server.py` come composition root. Sposta logica riusabile nei
  moduli di dominio invece di aggiungere altro stato globale.
- Per le registrazioni conserva sequenze chunk monotone, lock per sessione,
  scritture atomiche e transizioni in `VALID_STATUSES`.
- Non costruire path di dati utente direttamente se esiste un helper in
  `paths.py` o un valore in `settings.py`.
- Per metadati interrogabili o cross-feature usa `CatalogStore` invece di
  scansioni duplicate o stati paralleli non sincronizzati.
- Una modifica al contratto API richiede controllo coordinato di
  `server.py`, `static/config.js`, `static/api.js`,
  `frontend/src/api/apiClient.ts`, chiamanti frontend e test.
- Nel frontend l'ordine degli `<script>` in `index.html` e un contratto:
  i file espongono globali come `ApiClient`, `Workflow` e
  `RecordingController`.
- Quando estrai logica nel frontend statico legacy, non introdurre bundler,
  moduli ES o import dinamici: quella UI deve restare servibile come asset
  statico semplice sia in dev sia nel bundle PyInstaller.
- Per una nuova pagina usa un file `*-page.js` o `*-view.js`, inizializzato da
  `app.js`, e lascia in `app.js` solo navigazione, routing e coordinamento.
- Quando aggiungi un asset runtime, aggiorna package data e, se necessario,
  `ClosedRoom.spec`.
- Mantieni lazy gli import macOS opzionali quando il modulo deve restare
  importabile nei test o su sistemi non macOS.
- Le chiamate Cocoa/WebKit che modificano UI devono restare sul main thread.
- Il routing audio deve sempre avere rollback e cleanup dopo errori, stop,
  unload del browser e riavvio del server.
- Non modificare `public/` o `website/` pensando di cambiare automaticamente
  la UI dell'app.

## Persistenza e punti critici

- Impostazioni:
  `~/Library/Application Support/ClosedRoom/settings.json`.
- Registrazioni:
  `<recordings_dir>/<data>/<uuid>/metadata.json` e `recording.<ext>`.
- Trascrizioni:
  file `transcript_<timestamp>_<id>.json/.txt` in `transcriptions_dir`.
- Cache trascrizioni:
  `.cache/` in dev, `~/Library/Caches/ClosedRoom/` nel bundle.
- Stato routing audio:
  `.cache/audio-routing-state.json`.

Attenzione: `RecordingStore.root` consulta `settings.json` a ogni accesso. Un
`recordings_dir` globale configurato puo quindi prevalere sul `default_root`
passato al costruttore, inclusi i test con directory temporanee.

## Verifica

Suite completa:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
```

Test mirati:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recordings.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_audio_router.py' -v
```

Verifica tour/showcase dopo modifiche a `index.html` o `tour.js`:

```bash
python3 skills/build-guided-product-tours/scripts/check_tour_targets.py \
  src/local_asr_server/static/tour.js \
  src/local_asr_server/static/index.html
```

Avvio sviluppo:

```bash
UV_CACHE_DIR=.cache/uv uv run local-asr serve --reload
curl http://127.0.0.1:1236/health
```

Usa `./build.sh --no-dmg` solo per modifiche che toccano bundle, risorse,
helper nativo o configurazione PyInstaller. Richiede macOS Apple Silicon,
Swift, ffmpeg e altri strumenti di sistema.

## Baseline nota dei test

Al 12 giugno 2026 la suite contiene test non allineati al codice corrente:

- i test di `AudioRouter` chiamano metodi della precedente implementazione
  basata su `SwitchAudioSource`;
- i test di registrazione possono usare la directory globale da
  `settings.json` invece della directory temporanea;
- il test sull'arresto di una registrazione vuota contrasta con il commento e
  l'implementazione corrente, che consentono di finalizzarla.

Quando verifichi una modifica, confronta gli errori con questa baseline. Non
considerare automaticamente ogni failure una regressione, ma non nasconderla:
indica quali test passano, quali falliscono e perche.

## Checklist finale

- Il comportamento richiesto e coperto nel livello corretto?
- `skills/maintain-feature-docs` e `skills/structured-change-guard` sono state
  applicate quando la modifica lo richiedeva?
- `docs/features.md` e gli altri documenti rilevanti sono aggiornati, oppure il
  no-op documentale e motivato?
- Dati, path, endpoint, stati, opzioni e testi sono centralizzati invece che
  hardcodati?
- Contratti backend e frontend sono ancora coerenti?
- I path funzionano sia in dev sia nel bundle?
- Stato e file sono lasciati consistenti in caso di errore?
- Il routing audio viene sempre ripristinato?
- Sono stati eseguiti i test mirati, con risultati riportati chiaramente?
- Per cambi UI e stato verificati anche ID HTML, ordine script e chiamate API?
