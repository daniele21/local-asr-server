# ClosedRoom Feature Registry

Questo registro e la fonte minima per tracciare le feature di ClosedRoom dal
punto di vista business e tecnico. Ogni modifica funzionale deve aggiornare
questo file oppure dichiarare nel riepilogo finale perche la documentazione non
e cambiata.

## Regole di aggiornamento

- Aggiorna questo registro quando cambi workflow utente, API, persistenza,
  impostazioni, routing audio, analisi, build, bundle o comportamento frontend.
- Mantieni separati valore business, proprietario tecnico, dati persistiti e
  verifica.
- Non copiare endpoint, chiavi settings, nomi modello o path a memoria: ricavali
  dal codice prima di aggiornare il documento.
- Se una feature usa dati condivisi, indica il modulo che fa da fonte di verita.
- Quando una feature tocca UI e backend, aggiorna entrambi i lati della riga.

## Fonti di verita tecniche

| Area | Fonte primaria |
| --- | --- |
| API FastAPI e composition root | `src/local_asr_server/server.py` |
| Path dev/bundle e directory macOS | `src/local_asr_server/paths.py` |
| Impostazioni utente e default | `src/local_asr_server/settings.py` |
| Catalogo SQLite metadati | `src/local_asr_server/catalog.py` |
| Registrazioni e chunk audio | `src/local_asr_server/recordings.py` |
| Archivio trascrizioni | `src/local_asr_server/transcriptions.py` |
| Trascrizione, cache e streaming | `src/local_asr_server/transcriber.py` |
| Routing audio macOS | `src/local_asr_server/audio_router.py` e `src/local_asr_server/macos_audio_helper/` |
| App menu bar e WKWebView | `src/local_asr_server/menubar.py` e `src/local_asr_server/window.py` |
| Frontend React sorgente | `frontend/src/` |
| Frontend statico servito | `src/local_asr_server/static/` |

## Feature attuali

| Feature | Valore business | Superficie tecnica | Persistenza e configurazione | Verifica minima |
| --- | --- | --- | --- | --- |
| Avvio server locale | Espone ClosedRoom come servizio locale per registrare, trascrivere e analizzare audio con accesso protetto same-origin. | CLI `local-asr serve`, `create_app()`, endpoint pubblici `/health` e `/v1/session`, static serving, middleware auth locale. | Token sessione generato in app state o `LOCAL_ASR_API_TOKEN`; CORS solo da `LOCAL_ASR_ALLOWED_ORIGINS`; cache in `.cache/` dev o `~/Library/Caches/ClosedRoom/` bundle. | `UV_CACHE_DIR=.cache/uv uv run local-asr serve --reload`, `curl http://127.0.0.1:1236/health` e bootstrap cookie via `/v1/session` prima delle API protette. |
| App macOS menu bar | Offre avvio nativo, finestra WKWebView e accesso rapido da barra menu. | `local-asr app`, `menubar.py`, `window.py`, `launchd.py`, `ClosedRoom.spec`. | Risorse bundle risolte da `paths.py`; dati utente in Application Support. | Build mirata con `./build.sh --no-dmg` solo quando cambiano bundle, risorse o helper nativo. |
| Registrazione audio locale | Salva audio progressivamente senza avviare automaticamente Whisper e permette di recuperare sessioni interrotte da crash o tab chiusa. | Frontend recording UI, `RecordingStore`, endpoint `/v1/recordings`, `/chunks`, `/tracks/{track_id}/chunks`, `/stop`, `/recover`, `/discard`, `/audio`; client React con retry upload e bootstrap sessione. | `<recordings_dir>/<data>/<uuid>/metadata.json` con ledger chunk `sequence`/SHA-256/dimensione; file `.part` finche non finalizzati; stati `interrupted` e `recoverable`; metadati anche in `CatalogStore`. | `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recordings.py' -v` e `test_recording_api.py`. |
| Cattura nativa macOS | Registra microfono e audio computer senza configurazione BlackHole quando macOS 13+, permessi macOS e helper nativo sono disponibili, rendendo evidente il fallback solo quando serve. | Helper Swift `native_capture_helper` con AVFoundation e ScreenCaptureKit, `NativeCaptureManager`, endpoint `/v1/capture/capabilities`, `/v1/capture/permissions`, `/v1/capture/request-permissions`, `/v1/capture/ensure-permissions`, `/v1/capture/diagnostics` e `/v1/recordings/{id}/capture/*` (incluso l'event-stream di volume in tempo reale), frontend capability check e pannello backend registrazione con CTA permessi mode-aware; il preflight di avvio richiede i permessi necessari alla modalità selezionata prima di creare la cattura e timer/overlay partono solo sull'evento `ready`. | Tracce WAV `mic.wav`, `system.wav` (16 kHz mono downsampled) e `recording.wav` (mixed via ffmpeg post-stop); `RecordingStore.finalize()` preserva i WAV scritti direttamente dal helper quando esistono placeholder `.part` vuoti; capability/permission/diagnostics separate per Screen Recording/Microfono; `capture_backend`, `capture_status`, `timeline.json` (allineato con offset), `quality_report.json`; `build.sh` crea `ClosedRoomNativeCapture.app` con bundle id `com.closedroom.nativecapture`, lo copia manualmente in `Contents/Helpers` dopo PyInstaller per preservare l'estensione `.app`, blocca packaging `__dot__app`, verifica diagnostics helper dopo firma, e `paths.py` risolve il nuovo bundle helper da `ClosedRoom.app/Contents` con fallback legacy al binario nudo. | `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_native_capture.py' -v`; `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recordings.py' -v`; `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_paths.py' -v`; build frontend quando cambia la schermata registrazione; `./build.sh --no-dmg` quando cambia helper/bundle. |
| Routing audio macOS | Cattura microfono e audio computer con ripristino dell'uscita originale. | `AudioRouter`, helper Swift/Core Audio, endpoint `/v1/system/audio/*`. | Stato routing in `.cache/audio-routing-state.json`; requisiti BlackHole/helper. | `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_audio_router.py' -v`, confrontando la baseline nota in `AGENTS.md`. |
| Trascrizione audio | Converte upload o registrazioni locali in testo con MLX Whisper. | Endpoint `/v1/audio/transcriptions` e `/path`, `transcriber.py`, `TranscriptionStore`, frontend Transcription. | Cache SHA-256; JSON/TXT in `transcriptions_dir`; indice in `CatalogStore`. | Test API mirati quando disponibili; evitare test rapido con Whisper reale per non scaricare modelli grandi. |
| Job trascrizione locale | Esegue trascrizioni di registrazioni come job monitorabili e cancellabili, mantenendo compatibili gli endpoint sincroni. | `TranscriptionJobManager`, endpoint `/v1/recordings/{id}/transcription-jobs`, `/v1/jobs/{job_id}`, `/events`, `/cancel`; frontend Transcription polling. | Stato job in memoria nel processo locale; risultato salvato in `TranscriptionStore` e `CatalogStore`. | `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v`. |
| Storico trascrizioni | Permette consultazione, eliminazione, merge e split delle trascrizioni. | Endpoint `/v1/transcriptions`, `/merge`, `/{id}/split`, `TranscriptionStore`, `CatalogStore`. | File `transcript_<timestamp>_<id>.json/.txt`, flag `hidden` e `merged_into` nel catalogo. | `UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_transcription_merge.py' -v`. |
| Progetti | Raggruppa audio, trascrizioni e analisi per contesto di lavoro o meeting. | `project_name` su registrazioni, `_build_projects()`, endpoint `/v1/projects` e `/v1/recordings/{id}/project`, frontend Projects. | Campo `project_name` in metadata registrazione e tabella `recordings`. | Verifica API `/v1/projects` e flusso UI di cambio progetto. |
| Analisi AI | Trasforma trascrizioni in sintesi, punti chiave e azioni. | Endpoint `/v1/analysis`, `LLMService`, provider `mock` e Gemini, frontend Analysis. | Provider e API key in `settings.json`; risultati analisi nel catalogo trascrizioni. | Verifica provider mock senza chiamate esterne; usare Gemini solo con credenziali locali esplicite. |
| Impostazioni | Centralizza directory, default trascrizione, tema e provider LLM. | Endpoint `/v1/settings`, `settings.py`, Settings UI, directory picker macOS. | `~/Library/Application Support/ClosedRoom/settings.json`, merge con `DEFAULT_SETTINGS`. | Testare lettura/salvataggio e regressioni su `RecordingStore.root` quando cambia `recordings_dir`. |
| Dashboard e suggerimenti | Mostra stato, statistiche, attivita recenti e azioni rapide. | Frontend Dashboard, endpoint `/v1/stats`, `/v1/projects`, `/v1/transcription/source-data`. | Deriva da catalogo, registrazioni e trascrizioni; non deve duplicare conteggi lato UI. | Verifica empty state, dati recenti e coerenza conteggi dopo registrazione/trascrizione. |
| Tour e showcase | Guida l'utente nei workflow principali e abilita demo controllate. | `tour.js`, target in `index.html`, skill `build-guided-product-tours`. | Stato demo deve essere ripristinato dopo uscita o errore. | `python3 skills/build-guided-product-tours/scripts/check_tour_targets.py src/local_asr_server/static/tour.js src/local_asr_server/static/index.html`. |
| Miniatura di registrazione fluttuante (Overlay) | Permette di monitorare visivamente lo stato della registrazione (timer, dB segnale, chunk e MB) in primo piano su tutti i desktop virtuali, con supporto per Stage Manager, fullscreen spaces, drag handle nativo e angoli arrotondati. | NSPanel fluttuante in `window.py`, DragHandleView nativo in primo piano per il drag, rotte `/v1/system/window/overlay`, `/v1/system/window/overlay/resize`, `/v1/recordings/active`, `/v1/recordings/{id}/control/stop` e `/v1/recordings/{id}/overlay/events` in Python backend, `apiClient.ts`, `useRecorder.ts` e `RecordingOverlayPage.tsx`. | Posizione salvata in `settings.json`; trasparenza WKWebView (`drawsBackground = False`); corner radius (22px) con layer clipping nativo su contentView e webview; sincronizzazione robusta tramite SSE con fallback su `BroadcastChannel('closedroom-recording')`. | Avvio di `local-asr serve/app`, click su Start registrazione, verifica comparsa overlay fluttuante e dB meter attivo, interruzione tramite pulsante rosso dell'overlay con ack e arresto diretto backend, e drag-positioning persistente. |

## Template per nuove feature

Quando aggiungi una feature, inserisci o aggiorna una riga con:

| Feature | Valore business | Superficie tecnica | Persistenza e configurazione | Verifica minima |
| --- | --- | --- | --- | --- |
| Nome feature | Risultato utente o decisione business supportata. | Moduli, route, pagine, controller e client coinvolti. | File, database, settings, cache, path e owner dei dati. | Test automatizzati o controllo manuale minimo e ripetibile. |
