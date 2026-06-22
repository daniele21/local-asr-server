# Piano integrazione Audio Intelligence con Silero VAD

## Obiettivo

Portare ClosedRoom da "registrazione + trascrizione + analisi testuale" a una
pipeline meeting intelligence locale che usa le tracce separate `mic` e
`system` per generare:

- trascrizione con timestamp e canale;
- segmentazione parlato/silenzio;
- metriche leggere su tempo parlato, pause, overlap, speech rate ed energia;
- placeholder mock per insight futuri, basati su eventi misurabili.

## Stato implementazione MVP

Il primo passo implementato usa un backend leggero `energy-rms-v1`, non include
ancora il modello Silero ONNX e non aggiunge dipendenze runtime. La scelta e
intenzionale: abilita persistenza, schema, arricchimento segmenti e test senza
vendorizzare modelli grandi o complicare subito il bundle PyInstaller.

Il backend legge WAV direttamente e usa `ffmpeg` come fallback in pipe, senza
generare clip audio persistenti. Salva solo `intelligence.json` e un summary in
`stats.audio_intelligence`. Silero VAD ONNX resta il backend target per la fase
successiva, quando saranno verificati packaging, dimensione modello e firma del
bundle.

La UI MVP e disponibile nel dettaglio registrazione/progetto: mostra una card
`Audio intelligence` con speaking time, pause lunghe, overlap, momenti da
riascoltare e placeholder mock. La pagina risultati trascrizione mostra badge
per segmento quando sono disponibili pausa, WPM, energia o overlap.

Il valore principale non e estrarre feature audio complesse, ma collegare
trascrizione, pause, sovrapposizioni e intensita per predisporre segnali utili:

- possibile obiezione sul prezzo;
- punti da riascoltare;
- cliente/interlocutore che parla piu del previsto;
- interruzioni;
- momenti densi della conversazione.

## Stato attuale del repo

ClosedRoom ha gia i pezzi fondamentali per integrare questa pipeline senza
riscrivere la cattura:

- `RecordingStore` salva tracce `mixed`, `mic`, `system` e sa restituire le
  tracce transcrivibili.
- La cattura nativa produce `mic.wav`, `system.wav` e `recording.wav` a 16 kHz
  mono, con `timeline.json` e `quality_report.json`.
- `run_recording_transcription()` trascrive le tracce sorgente e
  `_merge_track_transcriptions()` fonde i segmenti ordinandoli per timestamp,
  aggiungendo `track_id`, `source` e `speaker_label`.
- `TranscriptionStore` e `CatalogStore` salvano `segments`, `stats` e
  `source_tracks` come JSON, quindi possono contenere metriche nuove senza una
  migrazione immediata del database. `analysis` resta riservato al risultato
  LLM futuro.
- `/v1/analysis` oggi passa testo a `LLMService`, con provider `mock` e Gemini.

La direzione migliore e quindi aggiungere un layer di "audio intelligence" tra
tracce finalizzate, trascrizione e analisi, non spostare logica dentro
`server.py`.

## Verifica esterna rapida

Silero VAD e una scelta coerente. Il progetto ufficiale documenta l'uso ONNX e
`onnxruntime` per il modello VAD, e specifica che usando solo ONNX Runtime
bisogna implementare I/O audio e post-processing nel proprio caso d'uso:
https://github.com/snakers4/silero-vad

ONNX Runtime fornisce installazione Python CPU via `pip install onnxruntime`,
con pacchetti separati per altri target:
https://onnxruntime.ai/docs/install/

Per ClosedRoom questo implica una decisione importante: non conviene portarsi
dietro PyTorch solo per VAD nel bundle macOS. Conviene usare ONNX Runtime con un
wrapper locale e I/O audio basato su `ffmpeg`/WAV/numpy.

## Architettura proposta

### Nuovo modulo domain

Modulo dedicato corrente:

```text
src/local_asr_server/audio_intelligence/
+-- __init__.py
+-- audio_io.py
+-- features.py
+-- pipeline.py
```

Responsabilita:

- `audio_io.py`: normalizza una traccia in PCM mono 16 kHz float32 usando i
  path gia centralizzati (`get_ffmpeg_path()` se serve) e lavora senza file
  temporanei persistenti.
- `features.py`: calcola speaking time, pause, overlap, speech rate ed energia.
- `pipeline.py`: orchestra il backend energy/VAD, l'arricchimento transcript e
  i placeholder mock.

Moduli futuri possibili, quando servono davvero:

```text
+-- schema.py
+-- vad.py
+-- segmentation.py
+-- insights.py
```

- `vad.py`: backend Silero VAD ONNX.
- `segmentation.py`: clipping VAD-guided ASR e mapping timestamp.
- `insights.py`: insight deterministici e poi prompt LLM.

Questo mantiene `routers/transcriptions.py` come orchestratore API e lascia la
logica riusabile fuori dal router.

### Contratto interno

Formato consigliato:

```json
{
  "version": 1,
  "channels": {
    "mic": {
      "label": "Tu",
      "display_name": "Daniele"
    },
    "system": {
      "label": "Computer",
      "display_name": "Others"
    }
  },
  "speech_windows": [
    {
      "channel": "system",
      "start": 124.2,
      "end": 139.8,
      "speech": true,
      "pause_before": 2.6,
      "padding_before_ms": 500,
      "padding_after_ms": 500,
      "source_start": 124.7,
      "source_end": 139.3
    }
  ],
  "segments": [
    {
      "id": 17,
      "channel": "system",
      "track_id": "system",
      "start": 812.4,
      "end": 827.1,
      "text": "Il prezzo pero dobbiamo capirlo meglio.",
      "pause_before": 2.8,
      "energy": "medium_low",
      "speech_rate_wpm": 118
    }
  ],
  "conversation_metrics": {
    "duration_seconds": 2450.0,
    "speaking_time_seconds": {
      "mic": 1029.0,
      "system": 1421.0
    },
    "speaking_time_pct": {
      "mic": 42,
      "system": 58
    },
    "speech_rate_wpm": {
      "mic": 151,
      "system": 128
    },
    "long_pauses": [
      {
        "start": 861.0,
        "duration": 3.2,
        "after_question": true
      }
    ],
    "overlaps": [
      {
        "start": 1330.0,
        "end": 1331.4,
        "duration": 1.4,
        "channels": ["mic", "system"]
      }
    ],
    "high_energy_moments": [
      {
        "start": 1862.0,
        "end": 1885.0,
        "channels": ["system"]
      }
    ]
  },
  "insight_candidates": [
    {
      "type": "possible_price_objection",
      "start": 812.4,
      "confidence": "medium",
      "evidence": [
        "price_topic_mentioned",
        "long_pause_before",
        "short_reply_after"
      ]
    }
  ]
}
```

Nota: `analysis` deve restare il risultato LLM salvato su `TranscriptionStore`.
Le metriche audio dovrebbero stare in `stats.audio_intelligence` e nei
`segments` arricchiti, piu un file completo nella directory della registrazione.

## Pipeline consigliata

### Fase 1 - VAD in shadow mode

Obiettivo: aggiungere valore senza cambiare subito il comportamento ASR.

Flusso:

1. Dopo `RecordingStore.finalize()`, usare le tracce transcrivibili.
2. Per ogni traccia `mic` e `system`, caricare PCM 16 kHz mono.
3. Eseguire il backend VAD configurato. Nell'MVP corrente e `energy-rms-v1`;
   Silero VAD ONNX e il backend target successivo.
4. Salvare `speech_windows`, pause e speaking time.
5. Continuare a trascrivere come oggi, cioe full-track ASR.
6. Arricchire i segmenti Whisper esistenti con metriche derivate dal VAD.

Vantaggi:

- rischio basso;
- nessun cambio drastico della qualita ASR;
- dati reali per tarare soglie;
- nessun problema iniziale di stitching dei clip.

Persistenza:

```text
<recordings_dir>/<date>/<recording_id>/intelligence.json
```

e nel transcript:

```json
{
  "stats": {
    "time_total_seconds": 123.4,
    "track_count": 2,
    "audio_intelligence": {
      "enabled": true,
      "vad_backend": "silero-onnx",
      "speaking_time_pct": {
        "mic": 42,
        "system": 58
      }
    }
  }
}
```

### Fase 2 - Arricchimento transcript

Obiettivo: rendere il transcript gia utile anche senza LLM.

Per ogni segmento ASR:

- associare `channel` da `track_id`;
- calcolare `pause_before` rispetto al parlato precedente nello stesso canale o
  globale;
- calcolare `speech_rate_wpm` usando parole / durata segmento;
- calcolare `energy` dalla finestra audio corrispondente;
- flaggare segmenti vicini a overlap.

Esempio:

```json
{
  "id": 12,
  "track_id": "system",
  "channel": "system",
  "speaker_label": "Computer",
  "start": 812.4,
  "end": 827.1,
  "text": "Il prezzo pero dobbiamo capirlo meglio.",
  "pause_before": 2.8,
  "energy": "medium_low",
  "speech_rate_wpm": 118,
  "overlap": false
}
```

Questa fase puo usare solo `segments` e `stats`, senza cambiare API pubbliche in
modo incompatibile.

### Fase 3 - ASR guidata dal VAD

Obiettivo: tagliare silenzi, ridurre allucinazioni su parti mute e velocizzare.

Regole conservative:

- padding prima/dopo: default 500 ms, configurabile 300-700 ms;
- merge segmenti con gap sotto 1 secondo;
- min speech segment 250-500 ms;
- max segmento ASR 30-45 secondi, con split su silenzi interni se necessario;
- mai perdere il timestamp originale;
- salvare i silenzi come metadati, non passarli a Whisper;
- fallback automatico alla trascrizione full-track se la pipeline a finestre
  fallisce.

Strategia timestamp:

1. VAD produce finestre in tempo originale.
2. Si crea un clip temporaneo per ogni finestra padded.
3. Whisper trascrive il clip.
4. Ogni segmento ASR viene riportato a `original_start = clip_start + start`.
5. I segmenti dei clip e delle tracce vengono fusi con lo stesso ordinamento
   usato oggi da `_merge_track_transcriptions()`.

Questa fase va introdotta dietro flag:

```json
{
  "audio_intelligence_mode": "metadata_only | vad_guided_asr"
}
```

Default iniziale: `metadata_only`.

### Fase 4 - Placeholder insight mock

Obiettivo: lasciare pronta la superficie prodotto per gli insight senza
introdurre ancora una dipendenza o un prompt LLM reale.

In questa fase non si chiama un LLM. Si generano solo `insight_candidates`
deterministici e un output mock dichiaratamente provvisorio:

- `possible_price_objection`: parole chiave prezzo/costo/budget + pausa lunga +
  risposta breve o energia bassa;
- `long_silence_after_question`: domanda seguita da pausa sopra soglia;
- `interruption`: un canale inizia mentre l'altro parla e l'overlap dura oltre
  soglia;
- `customer_dominance`: `system` parla molto piu di `mic`;
- `high_energy_topic`: energia sopra percentile alto con transcript associato;
- `review_moment`: combinazione di topic importante, overlap, pausa o energia.

Il payload deve essere gia compatibile con una futura fase LLM:

```json
{
  "transcript_excerpt": [
    {
      "time": "00:13:32",
      "channel": "system",
      "text": "Il prezzo pero dobbiamo capirlo meglio.",
      "pause_before": 2.8,
      "energy": "medium_low"
    }
  ],
  "metrics": {
    "speaking_time_pct": {
      "mic": 42,
      "system": 58
    },
    "overlap_count": 4,
    "long_pause_count": 3
  },
  "candidates": [
    {
      "type": "possible_price_objection",
      "start": "00:13:32",
      "evidence": ["price_topic_mentioned", "long_pause_before"]
    }
  ]
}
```

Output utente mock:

```text
[Mock] Possibile obiezione sul prezzo a 13:32.
Motivo provvisorio: il tema viene citato esplicitamente e preceduto da una
pausa lunga. Questo testo non e ancora generato da LLM.
```

La trasformazione LLM vera resta una milestone successiva: quando verra
implementata, il provider dovra ricevere questi candidati e spiegare solo eventi
misurati, senza inventare pattern non presenti nei dati.

## Feature leggere

### Speaking time

Fonte: unione delle finestre VAD per canale.

Metriche:

- secondi parlati per canale;
- percentuale sul parlato totale;
- percentuale sulla durata registrazione.

Usare entrambe: la percentuale sul parlato totale e utile per confronto
conversazionale, quella sulla durata totale misura silenzi.

### Pause

Fonte: gap fra finestre VAD globali e per canale.

Metriche:

- `pause_before` per segmento;
- `long_pauses` sopra soglia, default 2.5 secondi;
- `after_question`, euristica basata su testo precedente che termina con `?` o
  contiene marker di domanda.

### Overlap e interruption

Fonte: intersezione tra finestre VAD `mic` e `system`.

Metriche:

- overlap totali e durata;
- eventi con durata sopra 300-500 ms;
- possibile interruzione quando un canale inizia durante una finestra gia
  attiva dell'altro canale.

Nota: con echo leakage o audio system che contiene anche la voce del mic, questa
metrica puo sovrastimare. Serve confronto con `quality_report` e soglie di
energia.

### Speech rate

Fonte: parole ASR / durata speech.

Metriche:

- WPM per segmento;
- WPM medio/mediano per canale;
- finestre troppo dense da riascoltare.

Usare durata speech VAD quando disponibile, altrimenti durata ASR segmento.

### Volume/Energy

Fonte: RMS su PCM normalizzato.

Non usare valori assoluti come insight prodotto. Meglio bucket relativi per
canale:

- `very_low`;
- `low`;
- `medium_low`;
- `medium`;
- `high`.

Calcolare i bucket con percentili della registrazione, cosi microfoni diversi
non rompono il significato.

## API e compatibilita

Prima versione consigliata:

- non aggiungere endpoint pubblico obbligatorio;
- arricchire la risposta di `/v1/recordings/{id}/transcriptions`;
- salvare `intelligence.json` accanto alla registrazione;
- aggiungere `stats.audio_intelligence` al transcript.

Estensione successiva:

```text
GET  /v1/recordings/{recording_id}/intelligence
POST /v1/recordings/{recording_id}/intelligence-jobs
```

Il job separato serve solo se vogliamo rigenerare metriche senza rifare ASR.
Per MVP, integrarlo nel transcription job e piu semplice e meno dispersivo.

## Dipendenze e bundle macOS

Dipendenze minime:

- `onnxruntime`;
- `numpy`;
- Silero VAD ONNX model file;
- `ffmpeg` gia usato dal progetto per normalizzazione audio quando serve.

Da evitare nell'MVP:

- `torch`;
- `torchaudio`;
- `scipy`, salvo necessita reale.

Implicazioni build:

- aggiungere extra opzionale in `pyproject.toml`, per esempio
  `audio-intelligence`;
- includere il modello ONNX come package data o risorsa build;
- aggiornare `ClosedRoom.spec` e hook PyInstaller se `onnxruntime` richiede
  dynamic libraries aggiuntive;
- verificare `./build.sh --no-dmg` solo quando si tocca packaging o risorse
  bundle.

## whisper.cpp

Non introdurrei `whisper.cpp` nella stessa milestone del VAD.

MLX Whisper e gia integrato e testato nel flusso corrente. La priorita e:

1. VAD ONNX;
2. metriche;
3. arricchimento segmenti;
4. insight.

`whisper.cpp` ha senso dopo, dietro una piccola astrazione ASR:

```text
ASRBackend
+-- MLXWhisperBackend
+-- WhisperCppBackend
```

Prima di quella astrazione, aggiungerlo aumenterebbe superficie di build,
configurazione modello e test senza risolvere il problema principale.

## Piano operativo

### Milestone 0 - Spike tecnico

- Verificare ONNX Runtime su macOS Apple Silicon in dev e bundle.
- Eseguire Silero ONNX su un WAV sintetico 16 kHz mono.
- Misurare performance su tracce `mic.wav`/`system.wav`.
- Decidere come distribuire il modello ONNX.

Output: piccolo test o script locale, senza modificare flusso utente.

### Milestone 1 - Shadow VAD

- Aggiungere modulo `audio_intelligence`.
- Calcolare `speech_windows` e metriche per traccia.
- Salvare `intelligence.json` nella directory della registrazione.
- Agganciare il calcolo al transcription job in modalita `metadata_only`.
- Non cambiare ancora come Whisper riceve audio.

Test:

- unit test su segmentazione padding/merge;
- test con WAV sintetici silenzio/tono, senza Whisper reale;
- route test con ASR mockata.

### Milestone 2 - Transcript arricchito

- Aggiungere `pause_before`, `energy`, `speech_rate_wpm`, `channel`,
  `overlap` ai segmenti.
- Salvare summary in `stats.audio_intelligence`.
- Aggiornare UI transcript solo se il dato esiste.

Test:

- `_merge_track_transcriptions()` o nuovo merger con segmenti mock;
- calcolo overlap mic/system;
- compatibilita con transcript storici senza metriche.

### Milestone 3 - VAD-guided ASR

- Creare clip temporanei da finestre VAD padded.
- Trascrivere finestre per traccia.
- Rimappare timestamp al tempo originale.
- Fallback automatico a full-track ASR.
- Aggiungere flag `audio_intelligence_mode`.

Test:

- timestamp mapping;
- fallback se VAD fallisce;
- nessun download Whisper nei test rapidi.

### Milestone 4 - Placeholder insight mock

- Generare `insight_candidates` deterministici.
- Generare una risposta mock stabile e marcata come provvisoria.
- Salvare il mock dentro `stats.audio_intelligence` o in `intelligence.json`,
  evitando per ora di scrivere `analysis`.
- Rimandare l'estensione di `LLMService` e il provider locale testuale a una
  milestone successiva.

Test:

- candidati deterministici con input strutturato;
- nessun salvataggio in `analysis` finche l'LLM reale resta fuori scope;
- output stabile per candidati noti.

### Milestone 4b - Insight LLM futuro

- Estendere `LLMService` con prompt che include transcript compatto e metriche.
- Aggiungere provider locale testuale, per esempio Ollama o MLX-LM, senza
  accoppiarlo alla pipeline audio.
- Salvare il risultato LLM in `analysis` tramite `TranscriptionStore`.

### Milestone 5 - UI prodotto

Stato MVP: implementata una card nel dettaglio registrazione/progetto e badge
nei segmenti della schermata risultati trascrizione.

Superfici future utili:

- filtro "solo momenti importanti".
- timeline eventi cliccabile che sincronizza audio e trascrizione.
- sintesi nella dashboard solo quando il dato e gia calcolato.

La UI deve leggere dati gia calcolati, non ricalcolare metriche lato client.

## Rischi principali

- Packaging ONNX Runtime in PyInstaller: verificare dynamic libraries e firma.
- Timestamp drift con clip ASR: serve test dedicato su offset e merge.
- VAD aggressivo: puo tagliare parole iniziali/finali. Usare padding ampio e
  shadow mode prima di abilitarlo per ASR.
- Echo/leakage tra canali: overlap puo essere rumoroso se `system` contiene voce
  locale rientrata. Usare soglie energia e quality report.
- Diarizzazione: `system` non identifica singoli speaker remoti. Nell'MVP e
  solo "Others".
- Insight LLM: fuori scope per l'MVP. Il placeholder mock non deve essere
  presentato come analisi reale.

## Decisioni consigliate

- Usare Silero VAD via ONNX Runtime.
- Non introdurre PyTorch nel bundle.
- Non introdurre `whisper.cpp` nella prima fase.
- Integrare prima nel transcription job, non come endpoint separato.
- Salvare dati completi in `intelligence.json` e summary in `stats`.
- Tenere `analysis` per il risultato LLM futuro, non per metriche audio grezze
  o placeholder mock.
- Per ora generare solo insight placeholder/mock, senza chiamare `LLMService`.
- Default iniziale: `metadata_only`, poi `vad_guided_asr` dietro flag.

## Documentazione da aggiornare quando si implementa

Quando la feature diventa codice, aggiornare:

- `docs/features.md`: nuova riga "Audio intelligence / meeting intelligence";
- `README.md`: descrizione workflow e dipendenze opzionali;
- eventuali note build se si include ONNX Runtime o modello ONNX nel bundle.

Per questo documento non aggiorno `docs/features.md`, perche descrive una
proposta e non un comportamento gia disponibile.
