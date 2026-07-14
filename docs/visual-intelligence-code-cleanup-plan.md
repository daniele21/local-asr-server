# Visual intelligence — piano di pulizia del codice

Ultimo aggiornamento: 14 luglio 2026.

Stato complessivo: `IMPLEMENTED — RELEASE GATE OPEN`.

Owner operativo: repository ClosedRoom. Questo documento è la fonte di verità
per la pulizia tecnica della visual intelligence task-aware. Va aggiornato nella
stessa modifica che chiude una voce, cambia una priorità o introduce una nuova
regressione. Il piano funzionale resta in
[`task-aware-visual-intelligence-plan.md`](task-aware-visual-intelligence-plan.md).

## 1. Obiettivo

Portare il percorso `v2` a una struttura coerente, verificabile e promuovibile
senza cambiare prematuramente il default `v1`. La pulizia deve prima eliminare i
rischi di correttezza e persistenza, poi consolidare i confini dei moduli e
infine ridurre dimensione e accoppiamento dei file principali.

Non sono obiettivi di questo piano:

- cambiare le soglie di qualità o il frame rate;
- promuovere `v2` prima dei gate F0/F3/F5/F8;
- ridisegnare la UI;
- introdurre un nuovo framework di persistenza o frontend.

## 2. Baseline

| Area | Stato iniziale | Evidenza |
| --- | --- | --- |
| Suite completa | `KNOWN FAILURE` | 157/158 test verdi; `test_transcription_job_for_recording` dipende dalle settings utente |
| Test visuali | `GREEN` | 22/22 test verdi |
| Build frontend | `GREEN` | TypeScript + Vite completati |
| Smoke reale v2 | `GREEN` | Qwen + FluidAudio, astensione corretta, artefatti canonici e cleanup staging |
| Bundle corrente | `OPEN` | Build `.app` non autorizzata nell'ultima esecuzione |
| Default runtime | `SAFE` | `visual_routing_mode=v1` |

File sopra la soglia di attenzione al momento dell'audit:

| File | Righe indicative | Responsabilità da ridurre |
| --- | ---: | --- |
| `recordings.py` | 951 | Lifecycle registrazioni + persistenza artefatti visuali |
| `frontend/src/api/apiClient.ts` | 1.070 | Tipi e chiamate HTTP di tutti i domini |
| `frontend/src/pages/MeetingDetailPage.tsx` | 822 | Fetch, polling e rendering del workspace meeting |
| `test/test_visual_intelligence.py` | 708 | Contratti, router, temporal, fusion, store e service |
| `visual_intelligence/service.py` | 497 | Orchestrazione v1/v2, Qwen, resume, diagnostica e persistenza |

## 3. Regole di esecuzione

1. Correggere un rischio comportamentale alla volta, con test di regressione
   rosso prima della modifica quando praticabile.
2. Non combinare nello stesso passo fix di correttezza e grandi spostamenti di
   file.
3. Conservare compatibilità API e lettura degli artefatti `v1`.
4. Mantenere il default `v1` fino alla chiusura dei gate funzionali e bundle.
5. Centralizzare nomi file, enum, stati e normalizzatori prima di estrarre classi.
6. Ogni fase aggiorna questo tracker, `docs/features.md` quando cambia il
   comportamento e gli altri documenti solo se realmente coinvolti.
7. Non usare Whisper reale per le regressioni rapide.

## 4. Priorità e fasi

### C0 — Coerenza degli artefatti tra v1 e v2

Stato: `DONE`. Priorità: `P0`.

- [x] Aggiungere una regressione `v2 -> v1` che dimostri la rimozione del
  documento canonico e del routing non più validi.
- [x] Introdurre una singola operazione di sostituzione degli artefatti visuali.
- [x] Centralizzare i nomi `visual_observations.jsonl`, `visual_summary.json`,
  `visual_routing.json`, `visual_intelligence.json` e checkpoint.
- [x] Definire comportamento esplicito per run disabilitato, senza frame e
  fallback router.
- [x] Verificare che `/v1` e `/v2` non combinino generazioni diverse.

Criterio di uscita: ogni processing espone un solo set coerente di artefatti e
un rerun non rende leggibili risultati obsoleti.

### C1 — Parsing e contratti Qwen tipizzati

Stato: `DONE`. Priorità: `P0`.

- [x] Creare parser separati per `meeting_ui`, `meeting_state` e
  `shared_content` nel modulo di inferenza/contratti.
- [x] Accettare `screen_share.active` solo come booleano reale; rifiutare o
  degradare stringhe come `"false"`.
- [x] Normalizzare presenter, title, content state, liste e key information.
- [x] Validare enum e campi obbligatori senza trasformare output invalido in
  osservazione `valid`.
- [x] Persistire cause di validazione nella diagnostica per candidato.
- [x] Coprire tipi errati, campi mancanti, JSON parziale e valori fuori dominio.

Criterio di uscita: nessun valore Qwen raggiunge temporal/fusion senza passare
da un contratto tipizzato specifico del task.

### C2 — Segmentazione corretta delle share session

Stato: `DONE`. Priorità: `P0`.

- [x] Aggiungere fixture con due cicli share start/stop e keyframe intermedi.
- [x] Partizionare i keyframe usando gli eventi osservabili di condivisione.
- [x] Definire fallback quando meeting state e shared content sono incompleti.
- [x] Evitare che keyframe fuori sessione vengano accorpati silenziosamente.
- [x] Verificare ID stabili, ordinamento e link transcript per più sessioni.

Criterio di uscita: due condivisioni distinte producono due sessioni distinte e
nessun keyframe viene associato alla sessione sbagliata.

### C3 — Isolamento completo dei test

Stato: `DONE`. Priorità: `P0`.

- [x] Centralizzare una fixture settings deterministica per `create_app()`.
- [x] Eliminare dipendenze da `~/Library/Application Support/ClosedRoom`.
- [x] Rendere esplicito `use_settings_dir=False` nei test degli store.
- [x] Correggere `test_transcription_job_for_recording` senza cambiare il
  comportamento produttivo per soddisfare il test.
- [x] Eseguire la suite con settings utente sia attive sia assenti.

Criterio di uscita: suite completa verde e invariata dalla configurazione della
macchina che la esegue.

### C4 — Recovery ordinato e retention post-crash

Stato: `DONE`. Priorità: `P1`.

- [x] Riprodurre candidato fallito seguito da osservazione shared-content più
  recente e successivo resume.
- [x] Ricostruire lo stato della cadenza scorrendo candidati e osservazioni
  nello stesso ordine originale.
- [x] Validare schema, task, prompt e ID delle osservazioni recuperate.
- [x] Definire TTL centralizzato per checkpoint e staging orfani.
- [x] Aggiungere cleanup startup/manutenzione senza distruggere run recuperabili.
- [x] Verificare hard crash, eccezione controllata, checkpoint corrotto e retry.

Criterio di uscita: il resume produce lo stesso documento di una run pulita e
nessun frame sensibile resta indefinitamente senza una policy esplicita.

### C5 — Commit coerente della generazione visuale

Stato: `DONE`. Priorità: `P1`.

- [x] Definire un ID/fingerprint di generazione condiviso da summary, documento,
  routing e metadata.
- [x] Scrivere una generazione completa in staging temporaneo.
- [x] Promuovere gli artefatti come unità e aggiornare metadata/catalogo per
  ultimi.
- [x] Definire recovery di file `.tmp` e generazioni interrotte.
- [x] Testare crash simulati tra ogni passaggio di persistenza.

Criterio di uscita: API, metadata e catalogo non possono osservare versioni
diverse della stessa elaborazione.

### C6 — Separazione dei processor backend

Stato: `DONE`. Priorità: `P2`.

- [x] Estrarre il percorso legacy in `LegacyVisualProcessor`.
- [x] Estrarre il percorso task-aware in `TaskAwareVisualProcessor`.
- [x] Lasciare `PostMeetingVisualService` responsabile solo di configurazione,
  scelta policy, fallback e risultato finale.
- [x] Spostare parsing task-specifico fuori dal service.
- [x] Valutare `VisualArtifactStore` delegato da `RecordingStore`, senza creare
  una seconda radice o lifecycle parallelo.
- [x] Conservare lazy import e compatibilità bundle.

Criterio di uscita: per modificare una policy di inferenza non è necessario
toccare orchestration, store o percorso legacy.

### C7 — Pulizia frontend e concorrenza richieste

Stato: `DONE`. Priorità: `P2`.

- [x] Spostare contratti visuali in `frontend/src/api/visualIntelligence.ts`.
- [x] Estrarre `useVisualIntelligence(recordingId)` con loading/error/abort.
- [x] Impedire che una risposta lenta aggiorni il meeting precedente.
- [x] Evitare che il fetch visuale ritardi il rendering dei dati meeting.
- [x] Mantenere `MeetingDetailPage` come coordinatore del workspace.
- [x] Verificare cambio meeting rapido, polling, 404 v2 e unmount.

Criterio di uscita: il fetch visuale è indipendente, cancellabile e non può
mostrare dati appartenenti a un altro meeting.

### C8 — Organizzazione della suite visuale

Stato: `DONE`. Priorità: `P2`.

- [x] Dividere `test_visual_intelligence.py` in contratti, router, temporal,
  fusion, persistence e service.
- [x] Centralizzare client, runtime, immagini e recording fixture condivise.
- [x] Mantenere test end-to-end del service separati dai test puramente unitari.
- [x] Conservare un comando mirato documentato per l'intera area visuale.
- [x] Verificare che lo split non riduca casi o assertion.

Criterio di uscita: ogni failure indica immediatamente il layer proprietario e
le fixture non duplicano setup o regole di business.

## 5. Dipendenze

```text
C0 artefatti ─┐
C1 parsing ───┼──> C2 share session ──> C4 recovery ──> C5 commit coerente
C3 test ──────┘                              |
                                             v
                                      C6 processor backend

C1 contratti ───────────────────────────────> C7 frontend
C0-C7 stabilizzati ─────────────────────────> C8 split test
```

Ordine operativo raccomandato: `C0 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6 -> C7 -> C8`.

## 6. Gate

| Gate | Stato | Condizione |
| --- | --- | --- |
| CL0 — Correctness | `DONE` | C0-C3 completate; suite interamente verde |
| CL1 — Recovery/privacy | `DONE` | C4-C5 completate; equivalenza clean/resume e retention verificate |
| CL2 — Backend boundaries | `DONE` | C6 completata senza regressioni v1/v2 |
| CL3 — Frontend boundaries | `DONE` | C7 completata; cambio meeting/polling verificati |
| CL4 — Test maintainability | `DONE` | C8 completata e copertura preservata |
| CL5 — Release cleanup | `TODO` | Tutti i gate verdi e smoke reale/bundle ripetuti |

## 7. Verifica minima per fase

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_visual_intelligence*.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -v
cd frontend && pnpm run build
git diff --check
```

Quando cambiano bundle, risorse o import dinamici:

```bash
./build.sh --no-dmg
```

Non usare una trascrizione Whisper reale come test rapido.

## 8. Checklist pre-merge

- [ ] Il fix possiede una regressione al livello corretto.
- [ ] Nessuna regola o filename è stata duplicata.
- [ ] Artefatti v1 e v2 restano compatibili e coerenti.
- [ ] Errori, retry e cleanup lasciano uno stato deterministico.
- [ ] Le settings dei test non dipendono dalla macchina.
- [ ] Documentazione e registro avanzamento sono aggiornati.
- [ ] Suite mirate, suite completa, build frontend e diff check sono riportati.
- [ ] Smoke reale e bundle sono ripetuti quando il rischio lo richiede.

## 9. Registro avanzamento

| Data | Fase | Modifica/verifica | Esito | Evidenza o prossimo passo |
| --- | --- | --- | --- | --- |
| 2026-07-14 | Audit | Review architetturale e di correttezza dopo F8 | Piano creato | Priorità iniziale: artefatti obsoleti, parsing Qwen, share session e isolamento test; iniziare da C0 |
| 2026-07-14 | C0 | Sostituzione terminale degli artefatti, filename centralizzati e regressione API `v2 -> v1` | Completata | Il run disabilitato preserva gli ultimi artefatti; no-frame e fallback terminali sostituiscono il set; `/v2` torna 404 dopo un nuovo v1 |
| 2026-07-14 | C1 | Contratti task-specifici e diagnostica per candidato | Completata | Output con tipi errati o campi mancanti viene degradato e non raggiunge temporal/fusion |
| 2026-07-14 | C2 | Sessioni share delimitate dagli stati osservabili | Completata | Due cicli start/stop generano ID stabili distinti; keyframe esterni sono esposti in `unassigned_share_keyframes` |
| 2026-07-14 | Verifica C0-C2 | Test visuali, API, suite completa isolata e build frontend | Mirati verdi | Visual 25/25; recording API 16/16; build Vite verde. Suite 158/161: tre errori ambientali non correlati (socket runtime vietato e download Silero bloccato) |
| 2026-07-14 | C3 | Fixture settings condivisa e test senza download impliciti | Completata | Percorsi API/store isolati; test Silero live eseguiti solo con modello già presente |
| 2026-07-14 | C4 | Resume validato, cadenza ricostruita in ordine e retention 24h | Completata | Checkpoint recenti restano recuperabili; staging scaduto viene eliminato all'avvio dello store |
| 2026-07-14 | C5 | Staging di generazione e `generation_id` coerente | Completata | Metadata/catalogo aggiornati per ultimi; letture di promozioni parziali rifiutate |
| 2026-07-14 | Verifica C3-C5 | Suite completa isolata e regressioni crash | Verde | 164 test verdi, 2 skip Silero espliciti perché il modello non è in cache; visual 28/28 e recording API 16/16 |
| 2026-07-14 | C6 | Processor legacy/task-aware e parsing fuori dall'orchestratore | Completata | `processors.py` possiede la costruzione delle osservazioni; `inference.py` parsing/validazione; store invariato come owner della persistenza |
| 2026-07-14 | C7 | Contratti frontend di dominio e hook cancellabile | Completata | Fetch v2 indipendente dal meeting, abort su cambio ID/unmount e guard contro risposte tardive |
| 2026-07-14 | C8 | Suite visuale separata per layer e fixture condivise | Completata | File dedicati per contracts/router/temporal/fusion/persistence/service; comando wildcard preservato |
| 2026-07-14 | Verifica C6-C8 | Suite completa, test frontend, build e controlli statici | Verde | 170 test verdi, 2 skip Silero espliciti; area visuale 34/34; build Vite e `git diff --check` verdi |

## 10. Protocollo di aggiornamento

Per ogni intervento:

1. aggiornare stato complessivo, fase e gate interessati;
2. spuntare solo attività supportate da test o evidenza ripetibile;
3. registrare eventuali decisioni o variazioni di priorità;
4. aggiungere una riga al registro avanzamento;
5. riportare test verdi, failure note e artefatti prodotti;
6. non segnare `DONE` una fase solo perché il codice è stato spostato.

Stati ammessi: `PLANNED`, `IN PROGRESS`, `BLOCKED`, `DONE`, `N/A`.
