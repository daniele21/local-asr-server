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
5. Non usare una trascrizione Whisper reale come test rapido: puo scaricare un
   modello grande e richiedere molto tempo.

Directory generate o locali da non trattare come sorgente:

- `.cache/`
- `.venv/`
- `build/`
- `build_venv/`
- `dist/`
- `app_output.log`

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

Il frontend e HTML/CSS/JavaScript statico, senza bundler e senza moduli ES.

- `src/local_asr_server/static/index.html`: markup e ordine di caricamento.
- `src/local_asr_server/static/config.js`: costanti, default ed endpoint.
- `src/local_asr_server/static/api.js`: client HTTP.
- `src/local_asr_server/static/components.js`: componenti UI condivisi.
- `src/local_asr_server/static/workflow.js`: stato minimo del workflow.
- `src/local_asr_server/static/recorder.js`: MediaRecorder, mix audio, upload
  chunk e routing.
- `src/local_asr_server/static/recordings-view.js`: lista registrazioni.
- `src/local_asr_server/static/tour.js`: tour e showcase.
- `src/local_asr_server/static/app.js`: orchestratore, navigazione,
  trascrizione, storico e analisi.
- `src/local_asr_server/static/styles.css`: stili completi dell'app.

`public/` e `website/` non sono la UI servita normalmente da FastAPI. La UI
runtime e `src/local_asr_server/static/`.

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

# ID HTML e relativi accessi JavaScript
rg -n 'id="NOME"|getElementById\(.NOME.|querySelector.*NOME' \
  src/local_asr_server/static

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

- Mantieni `server.py` come composition root. Sposta logica riusabile nei
  moduli di dominio invece di aggiungere altro stato globale.
- Per le registrazioni conserva sequenze chunk monotone, lock per sessione,
  scritture atomiche e transizioni in `VALID_STATUSES`.
- Non costruire path di dati utente direttamente se esiste un helper in
  `paths.py` o un valore in `settings.py`.
- Una modifica al contratto API richiede controllo coordinato di
  `server.py`, `static/config.js`, `static/api.js`, chiamanti frontend e test.
- Nel frontend l'ordine degli `<script>` in `index.html` e un contratto:
  i file espongono globali come `ApiClient`, `Workflow` e
  `RecordingController`.
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
UV_CACHE_DIR=.cache/uv uv run python -m unittest test.test_recordings -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest test.test_recording_api -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest test.test_audio_router -v
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
- Contratti backend e frontend sono ancora coerenti?
- I path funzionano sia in dev sia nel bundle?
- Stato e file sono lasciati consistenti in caso di errore?
- Il routing audio viene sempre ripristinato?
- Sono stati eseguiti i test mirati, con risultati riportati chiaramente?
- Per cambi UI e stato verificati anche ID HTML, ordine script e chiamate API?
