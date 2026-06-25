# Piano di refactoring UX/UI — Local ASR Meeting Intelligence Workspace

## 1. Obiettivo del refactoring

L’obiettivo del refactoring UX/UI è trasformare l’attuale applicazione da uno strumento tecnico per registrare, trascrivere e analizzare audio in un vero **workspace locale di meeting intelligence**.

L’utente deve poter registrare meeting , trascriverli, analizzarli e ritrovare facilmente insight utili a diversi livelli:

* singolo meeting;
* singola giornata;
* settimana;
* progetto;
* storico multi-meeting;
* action item e decisioni trasversali.

La nuova esperienza deve ridurre al minimo la complessità tecnica visibile, mantenendo però accessibili le funzionalità avanzate quando servono. Il principio guida è la **progressive disclosure**: ogni vista deve mostrare solo ciò che è utile in quel momento, evitando di esporre configurazioni, prompt, job, provider LLM o dettagli tecnici se non necessari.

---

## 2. Problema da risolvere

L’esperienza attuale è ancora troppo orientata alle capability tecniche:

```text
Recording → Transcription → Analysis → Projects → Settings
```

Questo flusso riflette l’architettura del sistema, ma non il modo in cui l’utente pensa al proprio lavoro.

L’utente non vuole “fare una trascrizione” o “lanciare un job di analisi”. Vuole:

```text
Registrare un meeting
Capire cosa è successo
Estrarre decisioni e azioni
Rivedere cosa è successo oggi
Seguire l’evoluzione di un progetto nel tempo
```

Il refactoring deve quindi spostare il centro dell’esperienza da:

```text
strumenti tecnici
```

a:

```text
meeting, giornate, progetti, azioni e decisioni
```

---

## 3. Principi UX guida

### 3.1 Outcome-first

La UI deve partire dall’obiettivo dell’utente, non dalla tecnologia sottostante.

Non:

```text
Scegli file audio → scegli modello ASR → scegli prompt → lancia analisi
```

Ma:

```text
Registra meeting → ottieni brief, decisioni, azioni e follow-up
```

### 3.2 Progressive disclosure

Ogni vista deve avere tre livelli di complessità:

```text
Livello 1 — Informazioni essenziali
Livello 2 — Dettaglio operativo
Livello 3 — Dettaglio tecnico / avanzato
```

Esempio su un meeting:

```text
Livello 1
- Sintesi
- Decisioni
- Action item
- Stato elaborazione

Livello 2
- Transcript
- Run precedenti
- Evidenze con timestamp
- Rilancio analisi

Livello 3
- Prompt usato
- Provider LLM
- Modello
- Input hash
- Job ID
- Error logs
```

### 3.3 Automazione come default

Il percorso standard deve essere automatico:

```text
Stop registrazione
  → trascrizione automatica
  → pipeline di analisi automatica
  → meeting pronto
```

Le pagine manuali di trascrizione e analisi devono restare disponibili, ma come strumenti avanzati o di recupero.

### 3.4 Persistenza e storicizzazione

Nessuna analisi deve sovrascrivere una precedente.

Ogni run LLM deve essere:

* salvato;
* datato;
* associato a uno scope;
* associato a un tipo di analisi;
* associato a una versione del prompt;
* consultabile nello storico.

La UI deve mostrare per default solo l’ultima analisi valida per ogni tipo, ma deve permettere di aprire i run precedenti.

### 3.5 Scope coerenti

Lo stesso modello di esperienza deve valere per:

```text
Meeting
Daily digest
Weekly digest
Project digest
Custom collection
```

Questo evita di avere logiche diverse per ogni vista e rende il prodotto più scalabile.

---

## 4. Nuova information architecture

La navigazione principale dovrebbe essere semplificata.

### Navigazione proposta

```text
Oggi
Progetti
Azioni
Cerca
Impostazioni
```

La registrazione non dovrebbe essere una sezione isolata, ma un’azione globale sempre disponibile:

```text
+ Registra meeting
```

### Razionale

| Sezione      | Obiettivo                                                               |
| ------------ | ----------------------------------------------------------------------- |
| Oggi         | Gestire la giornata corrente, meeting registrati, digest, azioni emerse |
| Progetti     | Vedere evoluzione, decisioni, rischi e storico per progetto             |
| Azioni       | Raccogliere tutti gli action item estratti dai meeting                  |
| Cerca        | Cercare in transcript, decisioni, azioni, summary e progetti            |
| Impostazioni | Configurare audio, ASR, LLM, prompt, storage e privacy                  |

---

## 5. Flusso utente target

### 5.1 Primo avvio

Il primo avvio deve essere guidato da un setup wizard.

```text
1. Scegli cartella di salvataggio
2. Concedi permessi microfono
3. Concedi permessi cattura audio sistema / screen recording
4. Test microfono
5. Test audio sistema
6. Scegli configurazione ASR default
7. Scegli configurazione LLM default
8. Scegli pipeline di analisi default
9. Fine setup
```

#### Razionale

La configurazione audio su macOS può essere complessa. Deve essere affrontata una volta sola, in modo guidato, e poi nascosta nell’uso quotidiano.

---

### 5.2 Registrazione meeting

La registrazione deve essere avviabile da qualsiasi vista.

#### CTA globale

```text
+ Registra meeting
```

#### Modal di avvio

Campi essenziali:

```text
Titolo meeting
Progetto
Modalità audio
Pipeline di analisi
```

Campi avanzati nascosti dietro “Opzioni avanzate”:

```text
Backend cattura audio
Dispositivo microfono
Dispositivo sistema
Formato file
Directory specifica
Trascrizione automatica sì/no
Analisi automatica sì/no
```

#### Default consigliato

```text
Titolo: Meeting HH:mm
Progetto: ultimo progetto usato oppure "Inbox"
Audio: microfono + audio sistema
Pipeline: Meeting default
Trascrizione automatica: sì
Analisi automatica: sì
```

---

### 5.3 Durante la registrazione

La UI deve mostrare solo elementi essenziali:

```text
Timer
Titolo meeting
Progetto
Indicatore audio microfono
Indicatore audio sistema
Pausa
Stop
```

In overlay compatto:

```text
● 12:34  Smart Planning Sync
Mic ✓  System ✓
[Pausa] [Stop]
```

#### Razionale

Durante un meeting l’utente non deve gestire configurazioni. Deve solo capire che la registrazione sta funzionando.

---

### 5.4 Fine registrazione

Alla pressione di Stop:

```text
1. Salvataggio audio
2. Creazione meeting
3. Avvio trascrizione
4. Avvio pipeline analisi
5. Meeting pronto
```

La UI deve mostrare uno stato progressivo:

```text
Meeting salvato
Trascrizione in corso...
Analisi in corso: 2 di 6 completate
Meeting pronto
```

Se qualcosa fallisce:

```text
Trascrizione fallita
[Riprova] [Apri dettagli tecnici]
```

oppure:

```text
Analisi "Decisioni" fallita
Ultimo risultato valido disponibile
[Riprova]
```

---

## 6. Concetti di prodotto da introdurre

### 6.1 Meeting

Un meeting è il contenitore principale dell’esperienza.

```text
Meeting
- id
- title
- project_id
- started_at
- ended_at
- duration
- recording_id
- transcription_id
- status
- created_at
- updated_at
```

#### Stati possibili

```text
recording
recorded
transcribing
transcribed
analyzing
ready
partial_error
failed
```

---

### 6.2 Analysis Template

Un template definisce un tipo di analisi.

```text
AnalysisTemplate
- id
- scope_type
- analysis_type
- name
- description
- prompt
- output_schema
- version
- enabled
- auto_run_default
- order_index
```

Esempi:

```text
meeting_brief
meeting_minutes
action_items
decisions
risks_blockers
open_questions
project_update
daily_brief
weekly_summary
project_status
```

---

### 6.3 Analysis Run

Un run è una singola esecuzione LLM.

Deve essere immutabile.

```text
AnalysisRun
- id
- scope_type
- scope_id
- analysis_type
- template_id
- template_version
- pipeline_run_id
- provider
- model
- prompt_hash
- input_hash
- source_ids
- period_start
- period_end
- status
- result_json
- result_markdown
- error
- created_at
- started_at
- completed_at
```

#### Regola chiave

```text
Ogni rerun crea un nuovo AnalysisRun.
Nessun run completato viene mai sovrascritto.
```

---

### 6.4 Analysis Pipeline

Una pipeline è un insieme ordinato di analisi da eseguire su uno scope.

```text
AnalysisPipeline
- id
- name
- scope_type
- analysis_types
- default_provider
- default_model
- enabled
```

Esempio:

```text
Meeting default pipeline
- meeting_brief
- action_items
- decisions
```

```text
Meeting deep pipeline
- meeting_brief
- meeting_minutes
- action_items
- decisions
- risks_blockers
- open_questions
- project_update
```

---

### 6.5 Digest

Un digest è una vista analitica aggregata.

Può essere generato su:

```text
day
week
project
custom collection
```

Esempio:

```text
Daily digest 2026-06-23
Weekly digest 2026-W26
Project digest Smart Planning
```

Anche i digest devono usare lo stesso sistema di `AnalysisRun`.

---

## 7. Tipi di analisi per singolo meeting

### 7.1 Meeting brief

#### Obiettivo

Dare una comprensione rapida del meeting.

#### Output

```text
- Sintesi executive
- Contesto
- Outcome
- Punti più importanti
- Prossimi step principali
```

#### Razionale UX

Deve essere la prima cosa visibile nella pagina meeting.

---

### 7.2 Meeting minutes

#### Obiettivo

Produrre un verbale più completo.

#### Output

```text
- Agenda implicita
- Temi discussi
- Dettaglio per tema
- Decisioni
- Follow-up
```

#### Razionale UX

Serve quando l’utente vuole condividere o archiviare un verbale più formale.

---

### 7.3 Action items

#### Obiettivo

Estrarre attività operative.

#### Output strutturato

```text
- Task
- Owner
- Scadenza
- Priorità
- Stato
- Evidenza dal transcript
```

#### Razionale UX

Gli action item devono alimentare anche la vista globale “Azioni”.

---

### 7.4 Decisions

#### Obiettivo

Costruire un decision log.

#### Output

```text
- Decisione
- Razionale
- Impatto
- Persone coinvolte
- Evidenza
```

#### Razionale UX

Le decisioni sono spesso più importanti della trascrizione stessa, soprattutto a livello progetto.

---

### 7.5 Risks and blockers

#### Obiettivo

Identificare rischi, problemi, dipendenze e blocchi.

#### Output

```text
- Rischio / blocker
- Severità
- Probabilità
- Impatto
- Owner suggerito
- Prossima azione
```

---

### 7.6 Open questions

#### Obiettivo

Identificare punti rimasti aperti.

#### Output

```text
- Domanda aperta
- Contesto
- Chi dovrebbe rispondere
- Urgenza
- Prossimo step
```

---

### 7.7 Project update

#### Obiettivo

Capire cosa cambia per il progetto dopo il meeting.

#### Output

```text
- Avanzamenti
- Nuove decisioni
- Nuovi rischi
- Cambi di priorità
- Dipendenze
- Impatto sul piano progetto
```

---

## 8. Tipi di digest

### 8.1 Daily digest

#### Scope

```text
scope_type = day
scope_id = YYYY-MM-DD
```

#### Tipi di analisi

```text
daily_brief
daily_by_project
daily_action_items
daily_decisions
daily_risks
tomorrow_prep
```

#### Vista utente

```text
Oggi
- Recap giornata
- Meeting registrati
- Decisioni prese oggi
- Action item emersi oggi
- Rischi / blocker emersi oggi
- Preparazione per domani
```

---

### 8.2 Weekly digest

#### Scope

```text
scope_type = week
scope_id = YYYY-Www
```

#### Tipi di analisi

```text
weekly_summary
weekly_project_updates
weekly_decisions
weekly_open_actions
weekly_risk_trends
next_week_prep
```

#### Razionale

Serve per avere una review di fine settimana o preparare aggiornamenti manageriali.

---

### 8.3 Project digest

#### Scope

```text
scope_type = project
scope_id = project_id
```

#### Tipi di analisi

```text
project_status
project_timeline
project_decision_log
project_open_actions
project_risks
project_changes_since_last_digest
stakeholder_update
```

#### Periodi supportati

```text
Tutto il progetto
Ultimi 7 giorni
Ultimi 30 giorni
Da ultimo digest
Range custom
```

---

## 9. Nuova esperienza per le viste principali

## 9.1 Vista “Oggi”

### Obiettivo

Essere la home operativa quotidiana.

### Contenuto visibile di default

```text
- CTA Registra meeting
- Meeting di oggi
- Stato elaborazioni in corso
- Action item emersi oggi
- Daily digest
```

### Layout suggerito

```text
Header
  Oggi, 23 giugno 2026
  + Registra meeting

Sezione: Meeting di oggi
  - Meeting A · pronto
  - Meeting B · analisi in corso
  - Meeting C · trascrizione fallita

Sezione: Daily digest
  - Ultimo digest generato alle 18:30
  - Sintesi breve
  - [Apri digest] [Rigenera]

Sezione: Azioni di oggi
  - Task 1
  - Task 2
  - Task 3
```

### Progressive disclosure

Default:

```text
mostra meeting, digest e azioni
```

Espanso:

```text
mostra stato job, run analysis, errori
```

Avanzato:

```text
log tecnici e dettagli modello
```

---

## 9.2 Vista Meeting Detail

### Obiettivo

Consentire di capire, validare e riusare tutto ciò che è emerso da un meeting.

### Tab principali

```text
Overview
Analisi
Transcript
Azioni & decisioni
File
Dettagli tecnici
```

### Overview

Contenuto:

```text
- Titolo meeting
- Progetto
- Data e durata
- Stato
- Meeting brief
- Decisioni principali
- Action item principali
- Rischi principali
```

### Tab Analisi

La tab Analisi deve essere organizzata per tipo di analisi, non per run cronologico.

Esempio:

```text
Meeting brief
Ultimo run: 23/06/2026 15:42
[contenuto]
[Storico] [Rilancia]

Action items
Ultimo run: 23/06/2026 15:43
[tabella]
[Storico] [Rilancia]

Decisioni
Ultimo run: 23/06/2026 15:44
[decision log]
[Storico] [Rilancia]
```

### Storico run

Quando l’utente apre “Storico”:

```text
Run precedenti — Action items

- 23/06/2026 15:43 · completed · prompt v3 · local LLM
- 23/06/2026 12:20 · completed · prompt v2 · local LLM
- 22/06/2026 18:02 · failed · prompt v2 · cloud LLM
```

Ogni run può essere aperto per vedere:

```text
- risultato
- prompt version
- modello
- provider
- input usato
- timestamp
- eventuale errore
```

---

## 9.3 Vista Progetto

### Obiettivo

Mostrare l’evoluzione del progetto nel tempo.

### Contenuto visibile di default

```text
- Stato progetto
- Ultimo project digest
- Action item aperti
- Decisioni recenti
- Rischi aperti
- Timeline meeting
```

### Layout suggerito

```text
Header
  Progetto: Smart Planning
  [Genera digest] [Nuovo meeting]

Sezione: Project status
  Ultimo run: 23/06/2026
  Sintesi stato corrente

Sezione: Cosa è cambiato
  Cambiamenti dagli ultimi meeting

Sezione: Action item aperti
  Lista task

Sezione: Decision log
  Decisioni ordinate per data

Sezione: Timeline meeting
  Meeting collegati al progetto
```

### Progressive disclosure

Default:

```text
mostra stato, azioni, decisioni, rischi
```

Espanso:

```text
mostra digest per periodo, meeting sorgenti, confronti
```

Avanzato:

```text
mostra run LLM, template, prompt, input hash
```

---

## 9.4 Vista Azioni

### Obiettivo

Centralizzare gli action item estratti automaticamente.

### Filtri principali

```text
Progetto
Data
Meeting
Owner
Stato
Priorità
```

### Campi action item

```text
- Task
- Progetto
- Meeting sorgente
- Owner
- Due date
- Priorità
- Stato
- Evidenza transcript
```

### Azioni disponibili

```text
- segna come completato
- modifica owner
- modifica scadenza
- apri meeting sorgente
- apri evidenza transcript
```

---

## 9.5 Vista Cerca

### Obiettivo

Permettere ricerca trasversale.

### Oggetti ricercabili

```text
Transcript
Meeting
Decisioni
Action item
Rischi
Open questions
Digest
Progetti
```

### Risultati

I risultati devono essere raggruppati per tipo:

```text
Meeting
Decisioni
Action item
Transcript matches
Digest
```

---

## 9.6 Vista Impostazioni

### Obiettivo

Tenere fuori dalla UX quotidiana la complessità tecnica.

### Sezioni

```text
Audio
ASR
LLM
Pipeline
Prompt template
Storage
Privacy
Debug
```

### Progressive disclosure

Default:

```text
configurazioni principali
```

Avanzato:

```text
device, backend, parametri modello, temperatura, directory, log
```

---

## 10. Gestione dei run e dello storico

### Regole funzionali

1. Ogni analisi genera un nuovo run.
2. Un run completato non viene mai modificato.
3. La UI mostra l’ultimo run completato per ogni `analysis_type`.
4. I run falliti restano nello storico.
5. Un fallimento non cancella l’ultimo risultato valido.
6. Se cambia transcript, prompt o modello, i run precedenti vengono marcati come potenzialmente obsoleti.
7. Il rerun può essere fatto per singolo tipo di analisi o per intera pipeline.

### Badge utili

```text
Latest
Outdated
Prompt updated
Model changed
Transcript updated
Failed last run
Partial result
Generated from digest
Generated from raw transcript
```

---

## 11. Pipeline di analisi

### 11.1 Pipeline meeting default

```text
meeting_brief
action_items
decisions
```

### 11.2 Pipeline meeting deep

```text
meeting_brief
meeting_minutes
action_items
decisions
risks_blockers
open_questions
project_update
```

### 11.3 Pipeline daily digest

```text
daily_brief
daily_by_project
daily_action_items
daily_decisions
daily_risks
tomorrow_prep
```

### 11.4 Pipeline weekly digest

```text
weekly_summary
weekly_project_updates
weekly_decisions
weekly_open_actions
weekly_risk_trends
next_week_prep
```

### 11.5 Pipeline project digest

```text
project_status
project_timeline
project_decision_log
project_open_actions
project_risks
project_changes_since_last_digest
stakeholder_update
```

---

## 12. Strategia di generazione dei digest

I digest aggregati non dovrebbero rileggere sempre tutti i transcript grezzi.

### Strategia consigliata

```text
Transcript meeting
  → analisi meeting strutturate

Analisi meeting del giorno
  → daily digest

Daily digest + analisi meeting
  → weekly digest

Analisi meeting + digest progetto precedente
  → project digest aggiornato
```

### Razionale

Questo approccio:

* riduce costo computazionale;
* riduce latenza;
* rende i digest più coerenti;
* permette continuità nel tempo;
* evita di superare limiti di contesto del modello;
* mantiene tracciabilità sulle fonti.

### Opzione avanzata

Deve comunque esistere un comando:

```text
Rigenera da zero
```

utile quando:

* cambia il prompt;
* cambia il modello;
* si corregge una trascrizione;
* si vuole una review completa del progetto.

---

## 13. Output strutturato delle analisi

Ogni analisi deve salvare sia una versione leggibile sia una versione strutturata.

```text
result_markdown
result_json
```

### Esempio action item

```json
{
  "items": [
    {
      "task": "Preparare proposta UX per la vista progetto",
      "owner": "Daniele",
      "due_date": null,
      "priority": "high",
      "status": "open",
      "evidence": [
        {
          "timestamp": "00:18:42",
          "quote": "Discussione sulla necessità di rivedere la UX progetto"
        }
      ]
    }
  ]
}
```

### Razionale

Il JSON serve per:

* viste dedicate;
* filtri;
* ricerca;
* digest successivi;
* export;
* automazioni future.

Il Markdown serve per:

* lettura;
* copia/incolla;
* export;
* condivisione.

---

## 14. UX delle analisi custom

L’utente deve poter fare domande custom sul transcript, ma senza confondere queste analisi con i template canonici.

### Regola

Le analisi custom devono avere:

```text
analysis_type = custom_question
custom_title
custom_prompt
```

### UI

```text
Analisi custom
- Cosa devo dire al mio manager?
- Quali rischi lato Data Science sono emersi?
- Quali follow-up servono con il team X?
```

Ogni domanda custom ha il suo storico run.

---

## 15. Refactoring componenti UI

### Componenti principali da creare

```text
MeetingCard
MeetingStatusBadge
AnalysisTypeCard
AnalysisRunHistoryDrawer
AnalysisPipelineProgress
DigestCard
ProjectDigestPanel
ActionItemTable
DecisionLog
TranscriptViewer
EvidenceLink
RerunAnalysisButton
AdvancedDetailsAccordion
```

### Pattern comune: AnalysisTypeCard

Ogni tipo di analisi dovrebbe usare lo stesso componente.

```text
Title
Description
Latest run metadata
Status
Result preview
Actions:
  - Open
  - Rerun
  - History
  - Copy
```

### Pattern comune: Run History Drawer

```text
Lista run
Filtro stato
Dettaglio run
Confronto opzionale tra run
```

---

## 16. API consigliate

### Template

```text
GET /v1/analysis-templates
GET /v1/analysis-templates?scope_type=meeting
POST /v1/analysis-templates
PUT /v1/analysis-templates/{id}
```

### Run

```text
GET /v1/analysis-runs
GET /v1/analysis-runs/latest
GET /v1/analysis-runs/{id}
POST /v1/analysis-runs
POST /v1/analysis-runs/{id}/rerun
```

### Pipeline

```text
GET /v1/analysis-pipelines
POST /v1/analysis-pipeline-runs
GET /v1/analysis-pipeline-runs/{id}
```

### Meeting

```text
GET /v1/meetings
GET /v1/meetings/{id}
POST /v1/meetings/{id}/analysis-pipeline-runs
GET /v1/meetings/{id}/analysis-runs/latest
```

### Daily / weekly / project digest

```text
POST /v1/days/{date}/analysis-pipeline-runs
POST /v1/weeks/{week}/analysis-pipeline-runs
POST /v1/projects/{project_id}/analysis-pipeline-runs

GET /v1/days/{date}/analysis-runs/latest
GET /v1/weeks/{week}/analysis-runs/latest
GET /v1/projects/{project_id}/analysis-runs/latest
```

---

## 17. Piano di delivery revisionato

Questo piano rende il refactoring consegnabile per incrementi verticali. La
direzione del documento è corretta, ma non va implementata come riscrittura
unica: il repository ha già registrazioni, trascrizioni, progetti, job
persistenti e `analysis_runs`. La delivery deve quindi evolvere questi punti
senza creare un modello parallelo.

### 17.1 Tesi di revisione

#### Cosa ha senso mantenere

```text
- Outcome-first
- Progressive disclosure
- Meeting come centro dell'esperienza
- Analysis run immutabili e storicizzati
- Pipeline automatiche come default
- Digest giornalieri, settimanali e progetto come layer successivi
```

#### Cosa va rivisto

```text
- Non creare subito una tabella Meeting se Recording può già fare da aggregate iniziale.
- Non introdurre Azioni, Decisioni e Cerca prima di avere output JSON affidabili.
- Non spostare prompt e provider nella UI principale: devono vivere in template e settings.
- Non rendere la pipeline post-stop sincrona: stop e salvataggio audio devono restare rapidi.
- Non moltiplicare endpoint se gli endpoint esistenti possono essere estesi compatibilmente.
```

#### Principio operativo

```text
Prima cambiare la percezione del prodotto usando dati esistenti.
Poi rendere solidi analysis_type, template e pipeline.
Solo dopo aggiungere digest, azioni globali e ricerca.
```

### 17.2 Impostazione UX/UI

#### Visual thesis

ClosedRoom deve diventare un workspace operativo calmo, denso e leggibile:
meno hero, meno glow, meno card decorative; più liste, stati, tab, inspector e
azioni contestuali.

#### Content plan

```text
Oggi
  Stato giornata, meeting, processing, azioni principali.

Meeting detail
  Brief, decisioni, action item, transcript, run history, dettagli tecnici.

Progetti
  Timeline meeting, digest progetto, decision log, rischi, azioni aperte.

Importa
  Trascrizione manuale, file esterni, recupero errori.

Impostazioni
  Audio, ASR, LLM, template, pipeline, storage, privacy, debug.
```

#### Interaction thesis

```text
- CTA globale "Registra meeting" disponibile da ogni vista.
- Drawer/accordion per dettagli tecnici, run history e opzioni avanzate.
- Progress indicator persistente per trascrizione e pipeline post-registrazione.
```

### 17.3 Fonti di verità da rispettare

| Area | Owner da usare | Nota di delivery |
| --- | --- | --- |
| Registrazioni e audio | `RecordingStore`, `CatalogStore.recordings` | Non duplicare lifecycle o stati chunk. |
| Trascrizioni | `TranscriptionStore`, `CatalogStore.transcriptions` | Il transcript resta evidenza, non centro della UX. |
| Analisi versionate | `CatalogStore.analysis_runs` | Estendere con `analysis_type`, template e markdown/json. |
| Job asincroni | `JobStore`, `AnalysisJobManager`, `TranscriptionJobManager` | La pipeline usa job osservabili, mai lavoro bloccante post-stop. |
| Impostazioni | `settings.py`, Settings UI | Auto-transcribe e auto-analysis diventano default persistenti. |
| Frontend API | `frontend/src/api/apiClient.ts` | Nessun endpoint duplicato hardcoded nelle pagine. |
| Cataloghi UI | `frontend/src/api/config.ts` e i18n | Analysis type, tab e copy riusabili devono essere centralizzati. |
| Documentazione | `docs/features.md`, README se cambia uso pubblico | Ogni fase implementata aggiorna il registro feature. |

### 17.4 Roadmap di consegna

| Fase | Obiettivo | Deliverable principali | Esito atteso |
| --- | --- | --- | --- |
| 0 | Allineamento prodotto/tecnico | Decision record su scope MVP, stati, analysis types, pipeline default, migrazione dati esistenti. | Team allineato prima di toccare contratti. |
| 1 | UX reframe senza backend profondo | Nav `Oggi`, `Progetti`, `Importa`, `Impostazioni`; CTA globale; `Analysis` declassata; dashboard convertita in home operativa. | L'app smette di sembrare un pannello tecnico. |
| 2 | Fondazione analysis run | `analysis_type`, `template_id`, `template_version`, `result_markdown`, `result_json`; endpoint latest/history. | Più analisi per stesso meeting senza overwrite. |
| 3 | Template e pipeline registry | Registry backend dei template; pipeline meeting default/deep; prompt fuori dalle pagine. | Analisi ripetibili, versionabili e configurabili. |
| 4 | Automazione post-registrazione | Dopo stop: job trascrizione, poi pipeline; progressivo con retry per step. | Flusso standard automatico ma recuperabile. |
| 5 | Meeting detail MVP | Overview, tab analisi, transcript, action/decision preview, run history drawer, dettagli tecnici. | Il meeting diventa l'oggetto di lavoro principale. |
| 6 | Vista Oggi + daily digest base | Meeting del giorno, job in corso, ultimo daily brief, azioni emerse oggi. | L'utente capisce cosa è successo oggi. |
| 7 | Project intelligence | Project detail con timeline, project digest, decision log, rischi, azioni aperte. | Valore longitudinale per progetto. |
| 8 | Ricerca e workspace conoscenza | Search full-text e risultati raggruppati su transcript, run JSON, digest, action item. | Il contenuto resta ritrovabile su storico lungo. |

### 17.5 Fase 0 — Alignment e contratti

#### Obiettivo

Ridurre ambiguità prima di iniziare l'implementazione.

#### Decisioni da chiudere

```text
- `Meeting` MVP = aggregate derivato da recording + transcription + analysis_runs.
- `meeting_id` iniziale = `recording_id`, salvo necessità successive.
- `Project` resta basato su `project_name` finché non serve un'entità project_id.
- `AnalysisRun` diventa la fonte di verità per ogni risultato LLM.
- `Transcription.analysis` diventa legacy/latest compatibility, non fonte primaria futura.
- Pipeline post-stop è configurabile e asincrona.
```

#### Deliverable

```text
- Sezione aggiornata in questo documento con MVP/Next/Later.
- Elenco `analysis_type` iniziali.
- Matrice stati meeting derivati da recording/transcription/jobs/runs.
- Piano di migrazione per run esistenti senza analysis_type.
```

#### Verifica

```text
- Review tecnica su `CatalogStore`, `AnalysisJobManager`, `apiClient.ts`.
- Nessuna modifica runtime in questa fase.
```

### 17.6 Fase 1 — UX reframe a basso rischio

#### Obiettivo

Cambiare l'information architecture senza aspettare la nuova persistenza.

#### Cambi frontend

```text
- `DashboardPage` diventa `TodayPage` o mantiene il file ma mostra "Oggi".
- Nav principale: Oggi, Progetti, Importa, Impostazioni.
- CTA globale: "+ Registra meeting".
- `RecordingPage` diventa avvio/monitoraggio registrazione raggiungibile da CTA.
- `TranscriptionPage` viene rinominata in UX come "Importa & trascrivi".
- `AnalysisPage` resta raggiungibile come "Analisi custom" o area avanzata, non nav primaria.
- Riduzione UI card-heavy: liste e pannelli al posto di hero e mosaici.
- Rimozione graduale di emoji come icone funzionali, usando `lucide-react`.
```

#### Cambi backend

```text
Nessuno obbligatorio, salvo eventuali dati aggregati per evitare conteggi duplicati lato UI.
```

#### Acceptance criteria

```text
- Da qualsiasi vista è chiaro come registrare un meeting.
- La home mostra meeting/recording recenti e stato elaborazioni, non una landing page.
- Le configurazioni tecniche non sono visibili nel percorso quotidiano.
- Build frontend passa.
```

#### Verifica

```bash
cd frontend && npm run build
```

### 17.7 Fase 2 — Analysis run versionati per tipo

#### Obiettivo

Permettere più analisi canoniche sullo stesso scope senza sovrascritture.

#### Cambi dati

Estendere `analysis_runs` in `CatalogStore` con:

```text
analysis_type TEXT NOT NULL DEFAULT 'meeting_brief'
template_id TEXT
template_version TEXT
pipeline_run_id TEXT
result_markdown TEXT
source_ids TEXT
period_start TEXT
period_end TEXT
```

Valutare se mantenere `result_json` come payload completo o separare
`result_json` e `result_markdown` sempre in modo esplicito.

#### Cambi API

```text
GET /v1/analysis-runs?scope_type=&scope_id=&analysis_type=
GET /v1/analysis-runs/latest?scope_type=&scope_id=
GET /v1/analysis-runs/{id}
POST /v1/analysis-jobs
```

`POST /v1/analysis-jobs` deve accettare `analysis_type` e `template_id`, ma
restare compatibile con i payload attuali.

#### Cambi frontend

```text
- Tipi TypeScript aggiornati in `apiClient.ts`.
- Utility per raggruppare run per `analysis_type`.
- Primo `AnalysisTypeCard` riusabile.
```

#### Migrazione

```text
- Run esistenti senza tipo: `analysis_type = legacy_summary`.
- `prompt_version = custom` resta valido per analisi custom.
- `Transcription.analysis` resta leggibile ma non viene usata come storico.
```

#### Verifica

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_job_store.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_analysis_api.py' -v
cd frontend && npm run build
```

### 17.8 Fase 3 — Template e pipeline registry

#### Obiettivo

Spostare prompt, tipi di analisi e pipeline in un owner centrale.

#### Registry iniziale

```text
meeting_brief
action_items
decisions
meeting_minutes
risks_blockers
open_questions
project_update
custom_question
```

#### Pipeline iniziali

```text
meeting_default:
  - meeting_brief
  - action_items
  - decisions

meeting_deep:
  - meeting_brief
  - meeting_minutes
  - action_items
  - decisions
  - risks_blockers
  - open_questions
  - project_update
```

#### Cambi backend

```text
- Nuovo modulo owner, ad esempio `analysis_templates.py` o sezione dedicata in `services/analysis_service.py`.
- Endpoint read-only iniziali per template e pipeline.
- Versione prompt esplicita e stabile.
- Output contract richiesto: `result_json` più `result_markdown`.
```

#### Cambi frontend

```text
- `frontend/src/api/config.ts` contiene solo label/order fallback, non prompt.
- `AnalysisPage` perde prompt canonici hardcoded.
- Settings espone template/pipeline in modalità avanzata.
```

#### Acceptance criteria

```text
- Cambiare un prompt canonico richiede update in un solo owner.
- La UI può mostrare nome, descrizione e ordine dei tipi senza duplicare regole.
- Un run salva quale template/versione lo ha generato.
```

### 17.9 Fase 4 — Pipeline automatica post-registrazione

#### Obiettivo

Fare diventare automatico il percorso standard senza compromettere affidabilità audio.

#### Flusso target

```text
Stop registrazione
  -> RecordingStore.finalize()
  -> transcription job queued
  -> transcription completed
  -> analysis pipeline run queued
  -> per-analysis jobs/runs completed or failed independently
  -> meeting ready or partial_error
```

#### Regole

```text
- Stop audio non aspetta Whisper o LLM.
- Fallimento di un analysis_type non cancella l'ultimo run completato.
- Retry per singolo analysis_type.
- Retry pipeline intera solo su richiesta esplicita.
- Auto-transcribe e auto-analysis sono impostazioni persistenti.
```

#### Cambi backend

```text
- Orchestratore pipeline leggero, separato da `server.py`.
- Collegamento tra transcription job completato e pipeline successiva.
- Stato pipeline derivabile da job e analysis_runs.
- Eventi job sufficienti per progress UI.
```

#### Cambi frontend

```text
- Stato progressivo post-stop nella vista meeting e/o toast persistente.
- Pulsanti "Riprova trascrizione", "Riprova analisi", "Apri dettagli tecnici".
- Nessuna esposizione default di provider, prompt o job ID.
```

#### Verifica

```bash
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_recording_api.py' -v
UV_CACHE_DIR=.cache/uv uv run python -m unittest discover -s test -p 'test_job_store.py' -v
cd frontend && npm run build
```

### 17.10 Fase 5 — Meeting detail MVP

#### Obiettivo

Rendere la singola registrazione un workspace completo.

#### Layout MVP

```text
Header
  Titolo, progetto, data, durata, stato, azioni primarie.

Overview
  Brief, decisioni principali, action item principali, rischi.

Analisi
  Una AnalysisTypeCard per tipo canonico.

Transcript
  Segmenti, tracce, timestamp, evidence link.

File
  Audio mixed, mic, system, intelligence locale.

Dettagli tecnici
  Job, run, provider, modello, prompt version, input hash, errori.
```

#### Componenti da costruire prima

```text
MeetingStatusBadge
AnalysisTypeCard
AnalysisRunHistoryDrawer
AnalysisPipelineProgress
TranscriptViewer
EvidenceLink
AdvancedDetailsAccordion
```

#### Acceptance criteria

```text
- Aprendo un meeting, la prima vista risponde a "cosa è successo?".
- L'utente vede l'ultimo run valido per ogni analysis_type.
- Lo storico è consultabile senza confondersi con il risultato corrente.
- Transcript e file restano disponibili come evidenza, non come primo contenuto.
```

### 17.11 Fase 6 — Oggi e Daily Digest

#### Obiettivo

Rendere la home utile ogni giorno.

#### Deliverable

```text
- Meeting del giorno raggruppati per stato.
- Processing queue visibile ma non tecnica.
- Daily brief generato da analysis_runs del giorno.
- Action item e decisioni del giorno estratti da result_json.
```

#### Nota critica

Il daily digest non deve rileggere sempre transcript grezzi. Deve usare prima
i run meeting strutturati e ricorrere al transcript solo per "rigenera da zero".

### 17.12 Fase 7 — Progetti e digest longitudinali

#### Obiettivo

Mostrare evoluzione, decisioni e rischi nel tempo.

#### Deliverable

```text
- Project detail centrato su timeline meeting.
- Project status digest.
- Decision log progetto.
- Rischi e blocker aperti.
- Azioni aperte per progetto.
- Periodi: ultimi 7 giorni, ultimi 30 giorni, tutto il progetto, custom.
```

#### Dipendenza

Questa fase dipende da action item e decisioni strutturate in `result_json`.

### 17.13 Fase 8 — Ricerca

#### Obiettivo

Rendere recuperabile lo storico.

#### Deliverable

```text
- Full-text search su transcript.
- Search su result_json di action item, decisioni, rischi e digest.
- Risultati raggruppati per Meeting, Decisioni, Azioni, Transcript, Digest.
- Link diretto a meeting, run e timestamp transcript.
```

#### Nota tecnica

La ricerca deve vivere nel catalogo SQLite o in un indice locale coerente con
`CatalogStore`, non in scansioni frontend.

---

## 18. Priorità MVP e taglio scope

### 18.1 MVP consigliato

Il primo rilascio utile dovrebbe includere:

```text
1. Reframe navigazione: Oggi, Progetti, Importa, Impostazioni.
2. CTA globale Registra meeting.
3. Meeting detail MVP basato su recording_id.
4. AnalysisRun versionati con analysis_type.
5. Template registry read-only.
6. Pipeline meeting_default manuale o semiautomatica.
7. Run history per analysis_type.
8. Dettagli tecnici nascosti dietro disclosure.
```

### 18.2 MVP esteso

Da aggiungere appena il MVP è stabile:

```text
1. Auto-transcribe post-stop.
2. Auto-analysis post-transcription.
3. Pipeline progress persistente.
4. Daily digest base.
5. Action item e decisioni aggregati da result_json.
```

### 18.3 Next

```text
1. Project digest.
2. Project decision log.
3. Project open actions.
4. Weekly digest.
5. Search trasversale.
```

### 18.4 Later

```text
speaker diarization avanzata
export PDF
integrazione calendario
workflow collaborativi
assegnazione task esterna
notifiche avanzate
confronto visuale tra run
```

### 18.5 Non-goals del primo ciclo

```text
- Riscrivere tutta la UI prima della fondazione dati.
- Creare un sistema task manager completo.
- Creare project_id e workspace multiutente prima che project_name sia insufficiente.
- Rendere obbligatorio un provider LLM specifico.
- Eseguire Whisper reale come test rapido.
```

---

## 19. Definition of Done UX

Il refactoring può considerarsi riuscito quando l’utente può:

```text
1. Avviare una registrazione in meno di 10 secondi.
2. Fermare la registrazione e ottenere automaticamente transcript e analisi.
3. Aprire un meeting e vedere subito sintesi, azioni e decisioni.
4. Vedere più tipi di analisi per lo stesso meeting.
5. Rilanciare una singola analisi senza perdere i run precedenti.
6. Aprire lo storico run di un tipo di analisi.
7. Vedere un recap della giornata.
8. Vedere un digest di progetto.
9. Capire quali analisi sono aggiornate, fallite o obsolete.
10. Usare l’app senza dover capire job, prompt, provider o file system.
```

---

## 20. Decisioni di prodotto consigliate

### Decisione 1

La pagina “Transcription” non deve essere centrale.

Deve diventare:

```text
Import & Transcribe
```

per file esterni, casi manuali e recupero errori.

### Decisione 2

La pagina “Analysis” generica non deve essere il cuore della UX.

Le analisi devono vivere dentro:

```text
Meeting
Day
Week
Project
```

### Decisione 3

Le impostazioni tecniche devono essere nascoste durante l’uso quotidiano.

Audio backend, provider LLM, prompt e modello devono stare in:

```text
Impostazioni
Opzioni avanzate
Debug
```

### Decisione 4

Ogni output LLM deve essere trattato come dato storico.

Non esiste overwrite.

Esiste solo:

```text
nuovo run
```

### Decisione 5

La UX deve privilegiare gli insight, non il transcript.

Il transcript è fondamentale come evidenza, ma l’utente deve arrivare prima a:

```text
cosa è successo
cosa è stato deciso
cosa devo fare
cosa cambia per il progetto
```

---

## 21. Visione finale

La nuova esperienza deve far percepire l’app come un assistente locale per la memoria dei meeting.

```text
Registra
  → Trascrivi
  → Analizza
  → Organizza
  → Ricorda
  → Ritrova
```

Il prodotto finale non è un semplice local ASR server.

È un sistema personale e locale per trasformare meeting in conoscenza operativa:

```text
Meeting intelligence locale
con storico versionato,
analisi multi-prompt,
digest giornalieri,
digest settimanali,
digest di progetto,
azioni,
decisioni
e ricerca trasversale.
```
