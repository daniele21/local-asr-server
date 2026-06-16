/**
 * config.js — UI Configuration for ClosedRoom
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

// ─── UI Labels (Dynamic Translation) ───────────────────────────────────────────
const LABELS = {
    // Header
    get appTitle() { return 'ClosedRoom'; },
    get appSubtitle() { return i18n.t('header.subtitle'); },

    // Server status
    get statusConnecting() { return i18n.t('header.statusConnecting'); },
    get statusOnline() { return i18n.t('header.statusOnline'); },
    get statusOffline() { return i18n.t('header.statusOffline'); },
    get statusError() { return i18n.t('common.error') + ' Server'; },

    // Step indicator
    get step1() { return i18n.t('recording.title'); },
    get step2() { return i18n.t('transcription.title'); },
    get step3() { return i18n.t('analysis.title'); },

    // Dropzone
    get dropzoneTitle() { return i18n.t('transcription.dropzoneTitle'); },
    get dropzoneHint() { return i18n.t('transcription.dropzoneMax'); },
    get dropzoneBrowse() { return i18n.t('settings.btnBrowse'); },

    // File preview
    get changeFile() { return i18n.t('transcription.changeSource'); },
    get transcribeAction() { return i18n.t('transcription.btnTranscribe'); },
    get transcribing() { return i18n.t('transcription.transcribingStatus'); },

    // Advanced settings
    get settingsTitle() { return i18n.t('transcription.configureTitle'); },
    get labelModel() { return i18n.t('transcription.modelLabel'); },
    get labelLanguage() { return i18n.t('transcription.languageLabel'); },
    get labelTask() { return i18n.t('transcription.taskLabel'); },
    get labelFormat() { return i18n.t('transcription.outputFormatLabel') || 'Formato Output'; },
    get labelTemperature() { return i18n.t('transcription.temperatureLabel'); },
    get labelWordTimestamps() { return i18n.t('transcription.wordTimestampsLabel'); },
    get labelCondition() { return i18n.t('transcription.conditionLabel'); },

    // Processing
    get processingTitle() { return i18n.t('transcription.processingTitle') || 'Elaborazione in corso...'; },
    get processingPreparing() { return i18n.t('transcription.preparing') || 'Preparazione della trascrizione...'; },
    get processingConnecting() { return i18n.t('header.statusConnecting'); },
    get processingConsoleWaiting() { return i18n.t('transcription.waitingBackend') || 'In attesa del backend...'; },
    get processingLivePreview() { return i18n.t('transcription.livePreview') || 'ANTEPRIMA TESTO LIVE'; },
    get processingConsoleHeader() { return i18n.t('transcription.transcriptionLog') || 'LOG DI TRASCRIZIONE'; },
    get processingTimer() { return i18n.t('transcription.elapsedTime').replace(': {time}s', '') || 'Tempo trascorso'; },

    // Results
    get resultsTitle() { return i18n.t('transcription.resultTitle'); },
    get tabText() { return i18n.t('transcription.tabText'); },
    get tabSegments() { return i18n.t('transcription.tabSegments'); },
    get tabRaw() { return i18n.t('transcription.tabRaw'); },
    get copy() { return i18n.t('transcription.copy'); },
    get copied() { return i18n.t('transcription.copied') || 'Copiato!'; },
    get newTranscription() { return i18n.t('transcription.newTranscription'); },
    get statTime() { return i18n.t('transcription.statTime'); },
    get statLanguage() { return i18n.t('transcription.statLanguage'); },
    get statModel() { return i18n.t('transcription.statModel'); },

    // Toasts
    get toastFileCopied() { return i18n.t('transcription.toastFileCopied') || 'Testo copiato negli appunti'; },
    get toastFileInvalid() { return i18n.t('transcription.toastFileInvalid') || 'Per favore seleziona un file audio valido.'; },
    get toastTranscriptionError() { return i18n.t('transcription.toastTranscriptionError') || 'Errore di trascrizione'; },
    get toastCacheHit() { return i18n.t('transcription.toastCacheHit') || 'Risultato caricato dalla cache locale'; },

    // Footer
    get footerText() { return i18n.t('common.powerBy'); },
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
    settings: '/v1/settings',
    stats: '/v1/stats',
    selectDirectory: '/v1/system/select-directory'
};

const RECORDING_CHUNK_INTERVAL_MS = 5000;

// ─── Health Check Interval (ms) ────────────────────────────────────────────────
const HEALTH_CHECK_INTERVAL_MS = 15000;

// ─── Toast Duration (ms) ───────────────────────────────────────────────────────
const TOAST_DURATION_MS = 4000;
