/**
 * config.js — UI Configuration for ASR Whisper Studio
 *
 * All user-facing labels, model lists, language options, default values,
 * and theme overrides are centralised here. Edit this file to customise
 * the interface without touching HTML or application logic.
 */

// ─── Model Catalogue ──────────────────────────────────────────────────────────
const MODELS = [
    { value: '',                                          label: 'Predefinito del Server',            badge: 'default' },
    { value: 'mlx-community/whisper-tiny',                label: 'Whisper Tiny',                      badge: 'fast' },
    { value: 'mlx-community/whisper-base',                label: 'Whisper Base',                      badge: '' },
    { value: 'mlx-community/whisper-small',               label: 'Whisper Small',                     badge: '' },
    { value: 'mlx-community/whisper-medium',              label: 'Whisper Medium',                    badge: '' },
    { value: 'mlx-community/whisper-large-v3-turbo',      label: 'Whisper Large V3 Turbo',            badge: 'recommended' },
    { value: 'mlx-community/whisper-large-v3',            label: 'Whisper Large V3',                  badge: 'accurate' },
];

// ─── Language Options ──────────────────────────────────────────────────────────
const LANGUAGES = [
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'Inglese' },
    { value: 'es', label: 'Spagnolo' },
    { value: 'fr', label: 'Francese' },
    { value: 'de', label: 'Tedesco' },
    { value: '',   label: 'Rilevamento Automatico' },
];

// ─── Task Options ──────────────────────────────────────────────────────────────
const TASKS = [
    { value: 'transcribe', label: 'Trascrizione' },
    { value: 'translate',  label: 'Traduzione in Inglese' },
];

// ─── Output Format Options ─────────────────────────────────────────────────────
const OUTPUT_FORMATS = [
    { value: 'json',         label: 'Semplice (JSON)' },
    { value: 'verbose_json', label: 'Dettagliato (Verbose JSON)' },
    { value: 'text',         label: 'Solo Testo' },
];

// ─── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
    language: 'it',
    task: 'transcribe',
    outputFormat: 'json',
    temperature: null,          // null = auto
    wordTimestamps: false,
    conditionOnPreviousText: true,
    theme: 'dark',
};

// ─── UI Labels (Italian) ───────────────────────────────────────────────────────
const LABELS = {
    // Header
    appTitle: 'ASR Whisper Studio',
    appSubtitle: 'Trascrizione audio locale e ultrarapida',

    // Server status
    statusConnecting: 'Connessione...',
    statusOnline: 'Online',
    statusOffline: 'Offline',
    statusError: 'Errore Server',

    // Step indicator
    step1: 'Carica Audio',
    step2: 'Trascrivi',
    step3: 'Risultati',

    // Dropzone
    dropzoneTitle: 'Trascina qui il tuo file audio',
    dropzoneHint: 'Supporta MP3, WAV, M4A, WEBM, FLAC e altri formati (Max 25MB)',
    dropzoneBrowse: 'Seleziona File',

    // File preview
    changeFile: 'Cambia file',
    transcribeAction: 'Trascrivi Audio',
    transcribing: 'Trascrizione in corso...',

    // Advanced settings
    settingsTitle: 'Impostazioni avanzate',
    labelModel: 'Modello',
    labelLanguage: 'Lingua',
    labelTask: 'Operazione',
    labelFormat: 'Formato Output',
    labelTemperature: 'Temperatura',
    labelWordTimestamps: 'Timestamp per parola',
    labelCondition: 'Condiziona su testo precedente',

    // Processing
    processingTitle: 'Elaborazione in corso...',
    processingPreparing: 'Preparazione della trascrizione...',
    processingConnecting: 'Connessione in corso...',
    processingConsoleWaiting: 'In attesa del backend...',
    processingLivePreview: 'ANTEPRIMA TESTO LIVE',
    processingConsoleHeader: 'LOG DI TRASCRIZIONE LIVE',
    processingTimer: 'Tempo trascorso',

    // Results
    resultsTitle: 'Risultato Trascrizione',
    tabText: 'Testo Unito',
    tabSegments: 'Segmenti',
    tabRaw: 'JSON Grezzo',
    copy: 'Copia',
    copied: 'Copiato!',
    newTranscription: 'Nuova Trascrizione',
    statTime: 'Tempo impiegato',
    statLanguage: 'Lingua rilevata',
    statModel: 'Modello',

    // Toasts
    toastFileCopied: 'Testo copiato negli appunti',
    toastFileInvalid: 'Per favore seleziona un file audio valido.',
    toastTranscriptionError: 'Errore di trascrizione',
    toastCacheHit: 'Risultato caricato dalla cache locale',

    // Footer
    footerText: 'Powered by <strong>MLX Whisper</strong> & <strong>FastAPI</strong>. Eseguito in locale su Apple Silicon.',
};

// ─── Accepted File Types ───────────────────────────────────────────────────────
const ACCEPTED_EXTENSIONS = /\.(mp3|wav|m4a|webm|flac|ogg|aac|oga)$/i;
const ACCEPTED_MIME_PREFIX = 'audio/';
const MAX_FILE_SIZE_MB = 25;

// ─── API Endpoints ─────────────────────────────────────────────────────────────
const API = {
    health: '/health',
    transcribe: '/v1/audio/transcriptions',
    recordings: '/v1/recordings',
};

const RECORDING_CHUNK_INTERVAL_MS = 5000;

// ─── Health Check Interval (ms) ────────────────────────────────────────────────
const HEALTH_CHECK_INTERVAL_MS = 15000;

// ─── Toast Duration (ms) ───────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;
