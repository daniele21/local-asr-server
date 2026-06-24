# ClosedRoom Runtime and Service Architecture Implementation Plan

## Progress tracker

Ultimo aggiornamento: 2026-06-23.

Legenda:

- `[x]` completato nel codice e documentato.
- `[~]` iniziato, resta lavoro nella fase.
- `[ ]` non iniziato.
- `[!]` bloccato da dipendenza esterna o ambiente.

| Stato | Fase | Progress attuale | Verifica |
| --- | --- | --- | --- |
| `[x]` | Fase 0 - Allineamento e preparazione | Aggiunte costanti runtime, default LLM locale coerente `1235`, settings LLM avanzati, path runtime/log e documentazione. | `PYTHONPATH=src python -m unittest discover -s test -p 'test_paths.py' -v`; `npx tsc --noEmit`. |
| `[~]` | Fase 1 - Application services skeleton | Creato `AnalysisService` e spostata la logica legacy di `/v1/analysis`; restano `TranscriptionService`, `ProjectService` e riduzione helper/router. | `python -m py_compile ...`; test API completi bloccati da ambiente `uv`. |
| `[x]` | Fase 3 - Runtime layer e LLM sidecar status | Creati `runtime/models.py`, `RuntimeServiceManager`, endpoint `/v1/runtime/status`, `/v1/runtime/services/llm` e comandi LLM start/stop/restart/logs. | `PYTHONPATH=src python -m unittest discover -s test -p 'test_runtime_services.py' -v`. |
| `[~]` | Fase 2 - JobStore persistente | Aggiunto `JobStore` SQLite con tabelle `jobs` e `job_events`, collegato ai job di trascrizione e a `GET /v1/jobs`; resta da completare `JobRunner`, recovery operativo e migrazione analysis jobs. | `PYTHONPATH=src python -m unittest discover -s test -p 'test_job_store.py' -v`; regressione FastAPI bloccata da ambiente `uv`. |
| `[~]` | Fase 4 - Auto-start LLM sidecar | Aggiunto `LocalLLMSidecar` con porta dinamica, start/stop/restart/logs, `AnalysisService.ensure_llm_ready()` per provider locali, modalita `external` compatibile e test con sidecar fake; resta verifica manuale con sidecar reale e capability/reasoning avanzate. | `PYTHONPATH=src python -m unittest discover -s test -p 'test_runtime_services.py' -v`; `PYTHONPATH=src python -m py_compile src/local_asr_server/runtime/llm_sidecar.py src/local_asr_server/runtime/service_manager.py src/local_asr_server/services/analysis_service.py src/local_asr_server/llm.py src/local_asr_server/routers/system.py`; test API FastAPI bloccato da ambiente senza `fastapi`. |
| `[x]` | Fase 5 - Analysis jobs persistenti | Aggiunti `analysis_runs`, `AnalysisJobManager`, `POST /v1/analysis-jobs`, lettura/lista run e client API; `/v1/analysis` resta compatibile. | `PYTHONPATH=src python -m unittest discover -s test -p 'test_job_store.py' -v`; `PYTHONPATH=src python -m py_compile ...`; `npx tsc --noEmit`; FastAPI bloccato da ambiente senza `fastapi` e hash mismatch `uv`. |
| `[x]` | Fase 6 - UI Service Center | Settings UI mostra LLM locale come servizio gestito con status runtime, azioni start/stop/restart/log, preset qualità, reasoning e avanzate; `local_llm_url` resta dietro advanced/developer mode. | `cd frontend && npm run build`. |
| `[x]` | Fase 7 - ASR worker runner | Introdotti `ASRWorkerRunner`, `InProcessASRWorkerRunner` e `TranscriptionService`; i router chiamano il service mantenendo cache/store invariati e compatibilità con test patch legacy. | `PYTHONPATH=src python -m py_compile src/local_asr_server/runtime/asr_worker.py src/local_asr_server/services/transcription_service.py src/local_asr_server/routers/transcriptions.py`. |
| `[x]` | Fase 8 - Mac app integration e packaging | `menubar.py` usa costanti runtime condivise, conserva riferimento alla app FastAPI e ferma sidecar gestiti allo shutdown; `ClosedRoom.spec` include moduli runtime/services/jobs. | `PYTHONPATH=src python -m py_compile src/local_asr_server/menubar.py src/local_asr_server/runtime/service_manager.py`; build bundle non eseguita in questa verifica. |

Blocco noto:

- `UV_CACHE_DIR=.cache/uv uv run ...` fallisce prima dei test per hash mismatch
  del wheel locale `local-llm-server`; usare i test con `PYTHONPATH=src` per le
  unit pure finche il wheel/lock non viene riallineato.

## 1. Obiettivo

Portare ClosedRoom verso un runtime locale unico, usato sia dalla Mac app sia
dal browser su localhost, separando chiaramente:

- logica applicativa;
- lifecycle dei processi locali;
- job persistenti;
- persistenza business e file storage.

Il target evita Docker come requisito runtime, mantiene il server FastAPI come
orchestratore HTTP locale e trasforma `local-llm-server` in sidecar gestito dal
runtime invece che in prerequisito manuale per l'utente.

## 2. Architettura target

```text
React UI / WebView
  -> ClosedRoom API :1236
     -> Application Services
        -> RecordingService
        -> TranscriptionService
        -> AnalysisService
        -> ProjectService
        -> DayDigestService

     -> Runtime Layer
        -> RuntimeServiceManager
        -> NativeCaptureManager
        -> ASRWorkerRunner
        -> LocalLLMSidecar

     -> Persistence Layer
        -> CatalogStore / SQLite
        -> FileStorage
        -> JobStore
```

La regola architetturale principale e che il `RuntimeServiceManager` non deve
diventare un god object. Deve conoscere processi, pid, porte, log e readiness,
ma non scope applicativi come meeting, giornate, progetti, prompt o
`analysis_runs`.

## 3. Confini di responsabilita

| Componente | Responsabilita | Non deve fare |
| --- | --- | --- |
| `RecordingService` | Coordinare creazione, stop, recupero e metadati registrazione usando `RecordingStore` e capture runtime. | Scrivere file direttamente aggirando `RecordingStore`. |
| `TranscriptionService` | Avviare trascrizioni, normalizzare input, salvare risultati in `TranscriptionStore` e catalogo. | Gestire pid/processi o conoscere dettagli del sidecar LLM. |
| `AnalysisService` | Decidere cosa analizzare, costruire input/prompt, scegliere provider/modello, salvare `analysis_runs` e risultato business. | Avviare processi direttamente o conoscere porte interne. |
| `ProjectService` | Aggregare registrazioni, trascrizioni e analisi per progetto. | Duplicare query o stato gia posseduto da `CatalogStore`. |
| `DayDigestService` | Preparare analisi aggregate per giornata quando sara introdotta. | Salvare risultati fuori dal modello `analysis_runs`. |
| `RuntimeServiceManager` | Esporre stato runtime, ensure/start/stop/restart dei servizi gestiti, coordinare supervisor. | Decidere workflow business o salvare entita applicative. |
| `LocalLLMSidecar` | Gestire lifecycle, health, porta, pid e log di `local-llm-server`. | Comporre prompt o decidere scope di analisi. |
| `ASRWorkerRunner` | Eseguire trascrizioni in-process o out-of-process dietro interfaccia stabile. | Salvare risultati business direttamente senza `TranscriptionService`. |
| `JobStore` | Persistire job, eventi, errori, progress, result pointer e retry metadata. | Conoscere semantica di prompt, registrazioni o modelli. |
| `CatalogStore` | Persistenza interrogabile di recording, transcription, project, analysis run. | Gestire code, thread o processi. |
| `FileStorage` | Risoluzione e operazioni file centralizzate per dati utente. | Costruire path utente ad hoc nei service. |

## 4. Principi di implementazione

1. `server.py` resta composition root FastAPI: istanzia dipendenze e monta
   router, senza incorporare nuova logica di dominio.
2. Ogni nuova regola riusabile ha un owner unico.
3. Il frontend parla solo con `ClosedRoom API :1236`.
4. `local_llm_url` resta al massimo un override developer, non una dipendenza
   della UI normale.
5. Il sidecar LLM deve bindare solo su `127.0.0.1`.
6. I job lunghi devono essere persistenti e osservabili.
7. La compatibilita degli endpoint esistenti viene preservata durante la
   migrazione.
8. Nessun test rapido deve lanciare una trascrizione Whisper reale.

## 5. Stato corrente rilevante

| Area | Stato attuale |
| --- | --- |
| API/Webapp locale | `create_app()` serve UI, API, auth locale e statici. |
| Capture nativa | `NativeCaptureManager` e helper Swift sono gia sidecar-like. |
| Trascrizione job | `TranscriptionJobManager` esiste, ma i job sono in memoria. |
| Analisi | `/v1/analysis` e sincrono e chiama `LLMService` direttamente. |
| LLM locale | `NemotronLocalProvider` e `VoxtralLocalProvider` si aspettano `local-llm-server` gia avviato. |
| Porte LLM | Incoerenza: `settings.py` default `1333`, provider fallback `1235`. |
| UI | `SettingsPage.tsx` espone `local_llm_url`; `AnalysisPage.tsx` chiama `/v1/analysis` sincrono. |
| Persistenza | `CatalogStore` traccia recording/transcription; `analysis` e salvata sul record transcription. |

## 6. Target repository layout

```text
src/local_asr_server/
  services/
    __init__.py
    recording_service.py
    transcription_service.py
    analysis_service.py
    project_service.py
    day_digest_service.py

  runtime/
    __init__.py
    service_manager.py
    process_supervisor.py
    llm_sidecar.py
    asr_worker.py
    models.py

  jobs/
    __init__.py
    job_store.py
    job_runner.py
    models.py

  storage.py
  catalog.py
  settings.py
  paths.py
```

`storage.py` puo essere introdotto solo quando serve davvero a rimuovere path
duplicati. Fino ad allora `RecordingStore`, `TranscriptionStore`, `paths.py` e
`CatalogStore` restano fonti primarie.

## 7. Modello runtime

### 7.1 Servizi gestiti

| Servizio | Tipo | Avvio | Note |
| --- | --- | --- | --- |
| `api` | processo principale | CLI o Mac app | Porta pubblica locale stabile `1236` o `1237` in reload dev. |
| `capture` | helper nativo | on demand | Gia gestito da `NativeCaptureManager`. |
| `asr` | runner in-process, poi worker opzionale | on demand | Prima fase: wrapper su logica esistente. |
| `llm` | sidecar process | on demand | Gestito da `LocalLLMSidecar`; porta interna dinamica. |

### 7.2 Stati servizio

Usare stati comuni dove possibile:

```text
not_configured
binary_missing
model_missing
stopped
starting
loading_model
ready
busy
failed
crashed
stopping
unknown
```

Gli stati sono esposti dalla Runtime API, non dal frontend inventati localmente.

### 7.3 Stato runtime volatile

Persistenza proposta:

```text
~/Library/Application Support/ClosedRoom/runtime-state.json
~/Library/Logs/ClosedRoom/api.log
~/Library/Logs/ClosedRoom/asr-worker.log
~/Library/Logs/ClosedRoom/llm-server.log
~/Library/Logs/ClosedRoom/capture-helper.log
```

Lo stato runtime serve per diagnostica, cleanup e recovery dopo crash. Non e un
record business. I dati autorevoli restano in SQLite e file storage.

Payload indicativo:

```json
{
  "api": {
    "pid": 1111,
    "host": "127.0.0.1",
    "port": 1236,
    "started_at": "2026-06-23T10:00:00Z"
  },
  "llm": {
    "pid": 2222,
    "host": "127.0.0.1",
    "port": 49321,
    "status": "ready",
    "model": "nemotron-nano-4b",
    "started_at": "2026-06-23T10:00:10Z"
  }
}
```

## 8. Configurazione LLM

### 8.1 Nuova direzione

Il frontend non deve piu configurare normalmente un URL LLM. Deve scegliere:

- provider;
- modello;
- eventuale path modello custom;
- task audio/testo;
- qualita analisi;
- reasoning policy;
- credenziali cloud dove necessarie.

Il runtime decide host/porta del sidecar locale.

### 8.2 Settings proposte

```json
{
  "llm_provider": "mock",
  "local_llm_mode": "auto",
  "local_llm_model": "nemotron-nano-4b",
  "local_llm_quality_preset": "balanced",
  "local_llm_temperature": null,
  "local_llm_reasoning": "auto",
  "local_llm_max_output_tokens": null,
  "local_llm_json_mode": true,
  "local_llm_model_path": "",
  "local_llm_model_paths": {},
  "local_llm_url": ""
}
```

Regole:

- `local_llm_mode`: `auto | external | disabled`.
- `auto`: ClosedRoom avvia e gestisce il sidecar.
- `external`: ClosedRoom usa `local_llm_url`, solo per dev/advanced mode.
- `disabled`: provider locali non avviabili.
- `local_llm_url`: mantenuto per backward compatibility, non mostrato nella UI
  standard.
- `local_llm_quality_preset`: `precise | balanced | creative`.
- `local_llm_temperature`: override avanzato opzionale; `null` significa che
  `AnalysisService` sceglie il default per task.
- `local_llm_reasoning`: `auto | on | off`.
- `local_llm_json_mode`: default `true` per analisi strutturate.
- `local_llm_max_output_tokens`: limite avanzato opzionale.

### 8.3 Opzioni qualita analisi

La UI standard non deve obbligare l'utente a ragionare sempre su parametri LLM
grezzi. Deve esporre una scelta semplice:

```text
Precisa
Bilanciata
Creativa
```

Mapping iniziale consigliato:

| Modalita UI | Temperatura indicativa | Uso |
| --- | --- | --- |
| Precisa | `0.0 - 0.2` | Action item, decisioni, estrazioni strutturate. |
| Bilanciata | `0.2 - 0.4` | Sintesi meeting e analisi standard. |
| Creativa | `0.5 - 0.8` | Insight esplorativi e brainstorming. |

Default per task:

| Task | Temperatura default |
| --- | --- |
| Meeting analysis | `0.2` |
| Project/day summary | `0.3` |
| Structured extraction JSON | `0.0` |
| Exploratory analysis | `0.5` |

`AnalysisService` e la fonte di verita per questi default. Il frontend mostra
label e preset, ma non duplica la tabella decisionale se il backend espone i
default in runtime/settings metadata.

La temperatura e per-request: non richiede restart, reload o riattivazione del
sidecar.

### 8.4 Reasoning policy

Reasoning deve essere esposto come policy, non come toggle booleano globale:

```text
auto
on
off
```

Regole:

- `auto`: ClosedRoom decide in base a modello, registry/capability e task.
- `on`: usa reasoning se il modello lo supporta.
- `off`: forza modalita piu veloce/semplice quando possibile.
- `show_thinking`: default sempre `false` nella UI normale.

`LocalLLMSidecar` deve decidere come applicare la policy:

- se il backend/modello supporta override per-request, applicarlo nella singola
  chiamata;
- se richiede model activation, usare l'endpoint di activation del sidecar e
  trattarlo come operazione pesante;
- se richiede restart completo, evitarlo nel flusso utente normale e restituire
  errore/diagnostica chiara.

La scelta `reasoning` deve essere salvata sul job e su `analysis_runs`.
`effective_reasoning` deve tracciare il comportamento applicato davvero dopo la
risoluzione di `auto` e delle capability modello.

### 8.5 Costanti

Aggiungere una fonte di verita backend, per esempio:

```text
src/local_asr_server/runtime/models.py
```

Con:

```python
LOCAL_SERVICE_HOST = "127.0.0.1"
DEFAULT_API_PORT = 1236
DEFAULT_DEV_RELOAD_PORT = 1237
DEFAULT_LOCAL_LLM_PORT = 1235
```

Se si usa porta dinamica, `DEFAULT_LOCAL_LLM_PORT` e solo fallback dev o
compatibilita.

## 9. API runtime target

### 9.1 Runtime status

```http
GET /v1/runtime/status
```

Risposta:

```json
{
  "api": {
    "status": "ready",
    "host": "127.0.0.1",
    "port": 1236
  },
  "services": {
    "capture": { "status": "ready" },
    "asr": { "status": "ready" },
    "llm": {
      "status": "stopped",
      "model": "nemotron-nano-4b",
      "mode": "auto"
    }
  }
}
```

### 9.2 Services

```http
GET  /v1/runtime/services
GET  /v1/runtime/services/llm
POST /v1/runtime/services/llm/start
POST /v1/runtime/services/llm/stop
POST /v1/runtime/services/llm/restart
GET  /v1/runtime/services/llm/logs?tail=200
```

I comandi `start/stop/restart` devono essere protetti da auth locale e origin
check come le altre POST sensibili.

### 9.3 Compatibility

Nella fase iniziale si possono aggiungere alias:

```http
GET /v1/services
GET /v1/services/llm/status
```

ma il namespace canonico deve restare `/v1/runtime/*`.

## 10. Job system target

### 10.1 Modello comune

```sql
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  scope_type TEXT,
  scope_id TEXT,
  status TEXT NOT NULL,
  current_step TEXT,
  progress INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scope ON jobs(scope_type, scope_id);
CREATE INDEX idx_jobs_type_created ON jobs(type, created_at DESC);
```

Eventi:

```sql
CREATE TABLE job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  status TEXT NOT NULL,
  current_step TEXT,
  progress INTEGER NOT NULL,
  message TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
);
```

### 10.2 Stati job

```text
queued
running
waiting_for_service
cancel_requested
cancelled
completed
failed
retrying
```

### 10.3 API job

Endpoint esistenti da preservare:

```http
GET  /v1/jobs/{job_id}
GET  /v1/jobs/{job_id}/events
POST /v1/jobs/{job_id}/cancel
```

Estensioni:

```http
GET /v1/jobs?type=analysis&scope_type=recording&scope_id=...
```

Gli eventi possono restare SSE nella API, ma la fonte deve diventare
persistente. Per evitare polling duplicato, `JobRunner` deve scrivere sia
snapshot sia evento in una transazione logica.

## 11. Analysis runs

### 11.1 Tabella

```sql
CREATE TABLE analysis_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  transcription_id TEXT,
  recording_id TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  temperature REAL,
  reasoning TEXT NOT NULL DEFAULT 'auto',
  effective_reasoning INTEGER,
  show_thinking INTEGER NOT NULL DEFAULT 0,
  max_output_tokens INTEGER,
  json_mode INTEGER NOT NULL DEFAULT 1,
  llm_options_json TEXT,
  prompt_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

CREATE INDEX idx_analysis_runs_scope ON analysis_runs(scope_type, scope_id, created_at DESC);
CREATE INDEX idx_analysis_runs_transcription ON analysis_runs(transcription_id);
CREATE INDEX idx_analysis_runs_input_hash ON analysis_runs(input_hash);
```

### 11.2 Scope supportati

```text
transcription
recording
day
project
inline_text
```

`meeting` puo essere un alias product, ma nel codice attuale il concetto piu
vicino e `recording`. Evitare di introdurre `meeting` come nuovo tipo finche non
esiste una entita dedicata.

### 11.3 Opzioni LLM salvate

Ogni run deve salvare le opzioni che possono cambiare il risultato:

```json
{
  "provider": "local",
  "model": "nemotron-nano-4b",
  "temperature": 0.2,
  "reasoning": "auto",
  "effective_reasoning": true,
  "show_thinking": false,
  "max_output_tokens": null,
  "json_mode": true,
  "prompt_version": "meeting_summary_v1",
  "input_hash": "...",
  "result_json": {}
}
```

Questo rende confrontabili due analisi generate sullo stesso input con opzioni
diverse. `llm_options_json` puo conservare parametri provider-specific non
normalizzati, ma i campi comuni sopra devono restare queryable.

### 11.4 Prompt version

Introdurre prompt version stabili:

```text
summary_v1
minutes_v1
actions_v1
custom
voxtral_audio_analysis_v1
meeting_summary_v1
day_digest_v1
project_summary_v1
```

La versione deve essere salvata in `analysis_runs`, non dedotta dal testo
prompt a posteriori.

## 12. API analysis target

### 12.1 Nuovo endpoint async

```http
POST /v1/analysis-jobs
```

Request:

```json
{
  "scope_type": "transcription",
  "scope_id": "transcription-id",
  "provider": "nemotron_local",
  "model": "nemotron-nano-4b",
  "prompt_version": "summary_v1",
  "custom_prompt": null,
  "llm_options": {
    "quality_preset": "balanced",
    "temperature": 0.2,
    "reasoning": "auto",
    "show_thinking": false,
    "max_output_tokens": null,
    "json_mode": true
  },
  "audio_task": "analysis",
  "question": null
}
```

Response `202`:

```json
{
  "job_id": "job-id",
  "analysis_run_id": "run-id",
  "status": "queued"
}
```

### 12.2 Read endpoints

```http
GET /v1/analysis-runs/{analysis_run_id}
GET /v1/analysis-runs?scope_type=recording&scope_id=...
```

### 12.3 Endpoint legacy

`POST /v1/analysis` resta per compatibilita durante la migrazione.

Opzione consigliata:

- per `mock`: puo restare sincrono nei test;
- per provider locali/cloud: crea job e, se richiesto, attende con timeout
  limitato;
- la UI React nuova deve usare `/v1/analysis-jobs`.

## 13. Service flow target

### 13.1 Analisi testo

```text
AnalysisPage
  -> POST /v1/analysis-jobs
  -> AnalysisService.create_job()
  -> JobStore.create()
  -> JobRunner.run()
  -> AnalysisService.resolve_input()
  -> AnalysisService.resolve_llm_options()
  -> RuntimeServiceManager.ensure_llm_ready(model, reasoning_policy)
  -> LLMService.get_provider(...)
  -> provider.analyze(..., temperature, reasoning, response_format)
  -> CatalogStore.save_analysis_run()
  -> TranscriptionStore.save_analysis() for compatibility summary
  -> JobStore.complete()
```

### 13.2 Analisi audio Voxtral

```text
AnalysisService.resolve_audio_input()
  -> RecordingStore.audio_path(recording_id)
  -> RuntimeServiceManager.ensure_llm_ready(model, capability="audio", reasoning_policy)
  -> VoxtralLocalProvider.analyze_audio(...)
  -> analysis_runs.result_json
```

### 13.3 Trascrizione registrazione

```text
TranscriptionPage
  -> POST /v1/recordings/{id}/transcription-jobs
  -> TranscriptionService.create_job()
  -> JobStore.create(type="transcription")
  -> ASRWorkerRunner.transcribe_recording(...)
  -> TranscriptionStore.save()
  -> CatalogStore.upsert_transcription()
  -> JobStore.complete()
```

Nella prima fase `ASRWorkerRunner` puo chiamare la funzione esistente nello
stesso processo. Il processo separato e una fase successiva.

## 14. Sicurezza localhost

Requisiti minimi da mantenere o introdurre:

- bind API e sidecar solo su `127.0.0.1`;
- mai `0.0.0.0` di default;
- auth token/cookie obbligatorio per API protette;
- CORS solo da origini esplicite;
- origin check sulle POST sensibili;
- token runtime generato a ogni avvio salvo override dev;
- LLM sidecar non esposto direttamente al frontend;
- log senza API key, prompt completi sensibili o path non necessari;
- endpoint logs con tail e limite massimo.

## 15. Piano per fasi

### Fase 0 - Allineamento e preparazione

Obiettivo: rimuovere incoerenze e preparare owner senza cambiare workflow.

Modifiche:

- Aggiungere costanti runtime per host/porte.
- Allineare default `local_llm_url` fra `settings.py` e `llm.py`, oppure
  renderlo vuoto quando `local_llm_mode=auto`.
- Aggiungere campi settings `local_llm_mode` con default `auto`.
- Aggiungere campi settings per qualita analisi: preset, temperature override,
  reasoning policy, max output tokens e JSON mode.
- Documentare `local_llm_url` come developer override.
- Aggiungere path helper per logs/runtime state in `paths.py`.

File probabili:

- `src/local_asr_server/settings.py`
- `src/local_asr_server/paths.py`
- `src/local_asr_server/llm.py`
- `src/local_asr_server/schemas.py`
- `docs/features.md`
- `README.md` se cambia configurazione pubblica

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_paths.py' -v
```

### Fase 1 - Application services skeleton

Obiettivo: togliere logica applicativa dai router senza cambiare endpoint.

Modifiche:

- Creare `services/analysis_service.py`.
- Creare `services/transcription_service.py`.
- Creare `services/project_service.py`.
- Spostare la logica di `/v1/analysis` in `AnalysisService`.
- Spostare la costruzione progetti da helper/router in `ProjectService` o
  mantenere helper come wrapper temporaneo.
- Lasciare router come thin controllers.

File probabili:

- `src/local_asr_server/services/*`
- `src/local_asr_server/routers/system.py`
- `src/local_asr_server/routers/transcriptions.py`
- `src/local_asr_server/routers/helpers.py`
- `src/local_asr_server/server.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_transcription_merge.py' -v
```

### Fase 2 - JobStore persistente

Obiettivo: sostituire i job solo in memoria con job persistenti.

Modifiche:

- Creare `jobs/models.py`, `jobs/job_store.py`, `jobs/job_runner.py`.
- Aggiungere tabelle `jobs` e `job_events`.
- Adattare `TranscriptionJobManager` o sostituirlo con adapter compatibile.
- Preservare response shape di `/v1/jobs/{job_id}`.
- Su startup, marcare job `running` non terminali come `failed` o
  `interrupted` con policy esplicita.

File probabili:

- `src/local_asr_server/jobs/*`
- `src/local_asr_server/catalog.py`
- `src/local_asr_server/transcription_jobs.py`
- `src/local_asr_server/routers/transcriptions.py`
- `test/test_recording_api.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
```

Nuovi test:

- job creato e recuperabile dopo riapertura `CatalogStore`;
- eventi ordinati per sequence;
- cancel idempotente;
- startup recovery per job non terminale.

### Fase 3 - Runtime layer e LLM sidecar status

Obiettivo: introdurre il runtime manager senza ancora auto-avviare modelli in
produzione.

Modifiche:

- Creare `runtime/models.py`.
- Creare `runtime/process_supervisor.py` con implementazione testabile usando
  comandi fake.
- Creare `runtime/llm_sidecar.py` con `status()`, `start()`, `stop()`,
  `restart()`, `logs()`.
- Creare `runtime/service_manager.py`.
- Aggiungere router `/v1/runtime/*`.
- Collegare `RuntimeServiceManager` in `create_app()`.

File probabili:

- `src/local_asr_server/runtime/*`
- `src/local_asr_server/routers/runtime.py`
- `src/local_asr_server/server.py`
- `src/local_asr_server/paths.py`
- `src/local_asr_server/settings.py`
- `test/test_runtime_services.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_runtime_services.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
```

Nuovi test:

- status `not_configured` senza modello;
- status `model_missing` con path inesistente;
- start usa host `127.0.0.1`;
- stop idempotente;
- logs limitati da `tail`.
- temperature non causa start, restart o reload;
- reasoning `auto` produce `effective_reasoning` coerente con capability fake;
- reasoning `on/off` usa model activation quando richiesto dal sidecar fake.

### Fase 4 - Auto-start LLM sidecar

Obiettivo: provider locali usano sidecar gestito quando `local_llm_mode=auto`.

Modifiche:

- `AnalysisService` chiama `runtime.ensure_llm_ready(model, capability)`.
- `LocalLLMSidecar` seleziona porta interna disponibile.
- `LLMService.get_provider()` riceve base URL dal runtime, non dai settings UI.
- `LocalLLMSidecar` risolve `reasoning=auto|on|off` contro capability modello
  e decide se usare override per-request o model activation/reload.
- `AnalysisService` passa `temperature` per request senza richiedere reload.
- In modalita `external`, usare `local_llm_url`.
- Migliorare errori utente: `model_missing`, `binary_missing`,
  `failed_to_start`, `loading_model`.

File probabili:

- `src/local_asr_server/services/analysis_service.py`
- `src/local_asr_server/runtime/llm_sidecar.py`
- `src/local_asr_server/runtime/service_manager.py`
- `src/local_asr_server/llm.py`
- `src/local_asr_server/settings.py`
- `test/test_analysis_api.py`
- `test/test_runtime_services.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_runtime_services.py' -v
```

Manuale con sidecar reale solo quando serve:

```bash
UV_CACHE_DIR=.cache/uv uv run local-asr serve --reload
curl -b /tmp/closedroom.cookies http://127.0.0.1:1237/v1/runtime/services/llm
```

### Fase 5 - Analysis jobs persistenti

Obiettivo: spostare analisi locali/cloud su job persistenti.

Modifiche:

- Aggiunta tabella `analysis_runs`.
- Creati metodi `CatalogStore` per creare, aggiornare e interrogare
  `analysis_runs`.
- Aggiunto `POST /v1/analysis-jobs`.
- Aggiunti `GET /v1/analysis-runs/{id}` e list per scope.
- Salvati in `analysis_runs` temperature, reasoning richiesto,
  `effective_reasoning`, `show_thinking`, max output tokens e JSON mode.
- Salvate nel payload job le opzioni LLM risolte e `input_hash`.
- Client API React espone `createAnalysisJob()`, `getAnalysisRun()` e
  `listAnalysisRuns()`; migrazione pagina UI resta in Fase 6.
- `/v1/analysis` resta compatibile per test e chiamanti legacy.

File probabili:

- `src/local_asr_server/catalog.py`
- `src/local_asr_server/schemas.py`
- `src/local_asr_server/services/analysis_service.py`
- `src/local_asr_server/routers/analysis.py`
- `src/local_asr_server/routers/system.py`
- `frontend/src/api/apiClient.ts`
- `frontend/src/pages/AnalysisPage.tsx`
- `frontend/src/i18n/*`
- `docs/features.md`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
cd frontend && npm run build
```

Nuovi test:

- analysis job mock completa e salva `analysis_runs`;
- risultato compatibile salvato su transcription quando applicabile;
- job fallito salva errore e non corrompe transcription;
- rigenerazione crea nuova run con stesso `input_hash` ma id diverso;
- query per scope restituisce run piu recenti.
- due run con temperature diverse sono distinte e tracciabili;
- reasoning `auto` salva sia valore richiesto sia valore effettivo;
- `show_thinking` resta `false` di default.

### Fase 6 - UI Service Center

Obiettivo: mostrare stato LLM locale come componente gestito, non URL tecnico.

Modifiche:

- Rimuovere campo `local_llm_url` dalla UI standard.
- Aggiungere card "LLM locale" in Settings o pagina Runtime.
- Mostrare stati runtime da `/v1/runtime/services/llm`.
- Azioni: avvia, arresta, riavvia, apri log, seleziona/scarica modello dove
  supportato.
- Esporre "Qualita analisi" come preset `Precisa`, `Bilanciata`, `Creativa`.
- Esporre "Reasoning" come `Auto`, `Attivo`, `Disattivo`.
- In advanced settings mostrare slider temperatura `0.0 -> 1.0`, max output
  tokens e JSON mode.
- Nascondere developer override dietro modalita avanzata.
- Mettere `show_thinking`, URL/porta LLM, health raw, logs e activation params
  solo in developer mode.

File probabili:

- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/AnalysisPage.tsx`
- `frontend/src/api/apiClient.ts`
- `frontend/src/i18n/locales/it.ts`
- `frontend/src/i18n/locales/en.ts`
- eventuale `frontend/src/components/LocalServiceStatusCard.tsx`

Verifica:

```bash
cd frontend && npm run build
```

Manuale:

- provider locale con modello mancante mostra `model_missing`;
- stato spento mostra azione avvia;
- stato pronto mostra modello e porta solo come diagnostica;
- analisi usa API `:1236`, non URL sidecar.
- preset qualita imposta una temperatura coerente senza obbligare l'utente ad
  aprire advanced settings;
- reasoning Auto/Attivo/Disattivo e visibile senza mostrare ragionamenti
  intermedi;
- `show_thinking` non appare nella UI normale.

### Fase 7 - ASR worker runner

Obiettivo: preparare separazione ASR senza forzare subito processo separato.

Modifiche:

- Introdurre `ASRWorkerRunner` come interfaccia stabile.
- Prima implementazione: `InProcessASRWorkerRunner`.
- Seconda implementazione opzionale: processo `closedroom-asr-worker`.
- Collegare `TranscriptionService` al runner, non direttamente a funzioni sparse.
- Mantenere cache Whisper e `TranscriptionStore` invariati.

File probabili:

- `src/local_asr_server/runtime/asr_worker.py`
- `src/local_asr_server/services/transcription_service.py`
- `src/local_asr_server/routers/transcriptions.py`
- `src/local_asr_server/server.py`
- `test/test_recording_api.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
```

### Fase 8 - Mac app integration e packaging

Obiettivo: rendere il bundle proprietario del runtime e dei sidecar.

Modifiche:

- `menubar.py` avvia runtime e controlla stato API.
- Bundle include eventuali script/binari necessari al sidecar.
- `ClosedRoom.spec` include moduli `runtime`, `services`, `jobs`.
- Log path e runtime state funzionano in bundle.
- Shutdown della Mac app ferma sidecar gestiti.

File probabili:

- `src/local_asr_server/menubar.py`
- `src/local_asr_server/window.py`
- `ClosedRoom.spec`
- `build.sh`
- `src/local_asr_server/paths.py`

Verifica:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_paths.py' -v
./build.sh --no-dmg
```

Eseguire `./build.sh --no-dmg` solo quando vengono toccati bundle, helper,
risorse PyInstaller o path bundle.

## 16. Router target

Layout consigliato:

```text
src/local_asr_server/routers/
  recordings.py
  transcriptions.py
  analysis.py
  runtime.py
  system.py
```

`system.py` dovrebbe restare per health, settings, window/overlay e capability
di sistema. Analysis e runtime non dovrebbero crescere dentro `system.py`.

## 17. Frontend target

### 17.1 API client

Aggiungere in `frontend/src/api/apiClient.ts`:

```ts
runtimeStatus()
listRuntimeServices()
getLlmService()
startLlmService()
stopLlmService()
restartLlmService()
getLlmLogs()
createAnalysisJob()
getAnalysisRun()
listAnalysisRuns()
getAnalysisDefaults()
```

### 17.2 Settings

Settings deve mostrare:

- provider;
- modello locale;
- path modello custom;
- qualita analisi: `Precisa`, `Bilanciata`, `Creativa`;
- reasoning: `Auto`, `Attivo`, `Disattivo`;
- stato servizio LLM;
- azioni runtime.

Non deve mostrare `local_llm_url` nel percorso principale.
Temperature slider, max output tokens e JSON mode appartengono alle advanced
settings. `show_thinking`, URL/porta LLM, health raw, logs e parametri di model
activation appartengono solo al developer mode.

### 17.3 Analysis page

Analysis page deve:

- creare job;
- mostrare progress/status;
- includere nel job le opzioni LLM risolte da preset o advanced settings;
- leggere risultato da job o analysis run;
- permettere rigenerazione;
- mostrare errori del runtime con azione chiara.

## 18. Compatibilita e migrazione dati

### 18.1 Settings esistenti

Se `settings.json` contiene `local_llm_url`:

- non cancellarlo;
- usarlo solo se `local_llm_mode=external`;
- se manca `local_llm_mode`, default `auto`.

### 18.2 Transcription analysis esistente

Le analisi gia salvate nel campo `transcriptions.analysis` restano valide.

Migrazione lazy consigliata:

- quando si legge una transcription con `analysis` ma senza `analysis_run`,
  mostrarla come legacy;
- non creare automaticamente run storiche senza input_hash affidabile;
- le nuove analisi creano sempre `analysis_runs`;
- per compatibilita, salvare anche un summary su `transcriptions.analysis`
  quando scope e `transcription`.

### 18.3 Job in memoria esistenti

Non esiste migrazione utile per job in memoria dopo restart. La nuova versione
deve solo gestire job persistenti creati da quel momento.

## 19. Error handling

Errori utente da normalizzare:

| Codice | Messaggio UI | Owner |
| --- | --- | --- |
| `local_llm_not_configured` | Configura un modello locale prima di avviare l'analisi. | `AnalysisService` |
| `local_llm_model_missing` | Il file modello non e disponibile. | `LocalLLMSidecar` |
| `local_llm_binary_missing` | Il runtime LLM locale non e installato o incluso nel bundle. | `LocalLLMSidecar` |
| `local_llm_start_failed` | Avvio del servizio LLM non riuscito. | `RuntimeServiceManager` |
| `local_llm_not_ready` | Il modello e ancora in caricamento. | `RuntimeServiceManager` |
| `local_llm_reasoning_reload_required` | Il reasoning richiede riattivazione del modello. | `LocalLLMSidecar` |
| `local_llm_reasoning_unsupported` | Il modello selezionato non supporta reasoning. | `LocalLLMSidecar` |
| `analysis_input_empty` | Il testo da analizzare e vuoto. | `AnalysisService` |
| `analysis_scope_missing` | Seleziona una trascrizione, registrazione, giornata o progetto. | `AnalysisService` |
| `job_cancelled` | Job annullato. | `JobRunner` |

La UI deve ricevere codici e dettagli brevi, non fare parsing di stringhe
generiche.

## 20. Osservabilita locale

Requisiti:

- endpoint status per ogni servizio;
- endpoint logs con tail massimo;
- job events persistenti;
- `health` esteso solo con stato sintetico, senza path sensibili;
- log separati per sidecar;
- errori sidecar collegati a job tramite `job_id` e `analysis_run_id`.

Formato minimo log:

```text
timestamp level service message context_json
```

## 21. Testing strategy

### 21.1 Unit test backend

Nuovi file probabili:

```text
test/test_runtime_services.py
test/test_job_store.py
test/test_analysis_jobs.py
test/test_application_services.py
```

Copertura minima:

- `RuntimeServiceManager` non salva entita business;
- `AnalysisService` non avvia processi direttamente;
- `LocalLLMSidecar` usa solo `127.0.0.1`;
- `JobStore` persiste e recupera job/eventi;
- `AnalysisService` salva `analysis_runs`;
- fallback legacy `/v1/analysis` resta compatibile.

### 21.2 API test

Comandi mirati:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_paths.py' -v
```

### 21.3 Frontend

```bash
cd frontend && npm run build
```

Controlli manuali:

- Settings mostra stato LLM locale;
- Analysis crea job e mostra progress;
- errori `model_missing` e `binary_missing` sono leggibili;
- nessuna UI standard richiede URL sidecar;
- provider `mock` continua a funzionare senza sidecar.

### 21.4 Full suite

Da eseguire prima di merge ampio:

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
```

Confrontare eventuali failure con la baseline nota in `AGENTS.md`, senza
nascondere regressioni nuove.

## 22. Sequenza consigliata dei PR

1. Docs e costanti: piano, default LLM coerente, settings `local_llm_mode`.
2. Application services: estrazione thin dei router senza nuovo comportamento.
3. JobStore persistente: trascrizione usa job persistenti.
4. Runtime API: status e controlli LLM con process fake nei test.
5. LLM auto-start: sidecar gestito per provider locali.
6. Analysis jobs: endpoint async, `analysis_runs`, UI polling.
7. Service Center UI: stato LLM e rimozione URL dalla UI standard.
8. ASR runner abstraction: preparazione worker separato.
9. Bundle integration: log, runtime state, PyInstaller e shutdown.

Ogni PR deve aggiornare `docs/features.md` solo quando cambia comportamento
effettivo, API, persistenza, settings o UI. Questo piano da solo non cambia la
feature registry.

## 23. Definition of done

La migrazione e completa quando:

- Mac app e browser usano lo stesso runtime locale;
- il frontend non dipende da porta/URL del sidecar LLM;
- provider locali avviano o verificano automaticamente il sidecar;
- analisi e trascrizioni lunghe sono job persistenti;
- `analysis_runs` conserva provider, modello, prompt version, input hash,
  temperature, reasoning richiesto, reasoning effettivo, JSON mode, status,
  result ed error;
- temperature e applicata per-request senza reload;
- reasoning Auto/Attivo/Disattivo e risolto dal sidecar con activation/reload
  solo quando necessario;
- `show_thinking` non appare nella UI normale ed e `false` di default;
- `RuntimeServiceManager` gestisce solo lifecycle e readiness;
- `AnalysisService` possiede logica di analisi e salvataggio;
- settings, API client, router, test e docs sono coerenti;
- lo shutdown della Mac app ferma i sidecar gestiti;
- i log locali permettono diagnosi senza esporre dati sensibili inutili.

## 24. Rischi principali

| Rischio | Mitigazione |
| --- | --- |
| `RuntimeServiceManager` cresce troppo | Vietare dipendenze da `TranscriptionStore`, `RecordingStore` e prompt logic nel runtime layer. |
| Doppia fonte per job | Migrare `TranscriptionJobManager` dietro adapter o sostituirlo in un solo PR. |
| UI continua a usare URL LLM | Rimuovere campo dalla UI standard e aggiungere test/build review su `local_llm_url`. |
| Sidecar non incluso nel bundle | Trattare bundle integration come fase dedicata con `./build.sh --no-dmg`. |
| Persistenza analysis duplicata | `analysis_runs` e fonte completa; `transcriptions.analysis` solo compatibility summary. |
| Porta dinamica difficile da debuggare | Esporla in runtime status/logs, non come setting UI principale. |
| Reasoning causa reload costosi inattesi | Distinguere per-request override, model activation e restart; mostrare stato `loading_model`. |
| Output diversi non spiegabili | Salvare temperature, reasoning, effective reasoning, max tokens e prompt version in ogni run. |
| Test lenti con modelli reali | Usare fake process, mock provider e client stub; niente Whisper reale nei test rapidi. |
