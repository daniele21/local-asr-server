export const MODELS = [
  { value: '', label: 'Predefinito del Server', badge: 'default' },
  { value: 'mlx-community/whisper-tiny', label: 'Whisper Tiny', badge: 'fast' },
  { value: 'mlx-community/whisper-base', label: 'Whisper Base', badge: '' },
  { value: 'mlx-community/whisper-small', label: 'Whisper Small', badge: '' },
  { value: 'mlx-community/whisper-medium', label: 'Whisper Medium', badge: '' },
  { value: 'mlx-community/whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo', badge: 'recommended' },
  { value: 'mlx-community/whisper-large-v3', label: 'Whisper Large V3', badge: 'accurate' },
];

export const LANGUAGES = [
  { value: 'it', label: 'Italiano' },
  { value: 'en', label: 'Inglese' },
  { value: 'es', label: 'Spagnolo' },
  { value: 'fr', label: 'Francese' },
  { value: 'de', label: 'Tedesco' },
  { value: '', label: 'Rilevamento Automatico' },
];

export const TASKS = [
  { value: 'transcribe', label: 'Trascrizione' },
  { value: 'translate', label: 'Traduzione in Inglese' },
];

export const OUTPUT_FORMATS = [
  { value: 'json', label: 'Semplice (JSON)' },
  { value: 'verbose_json', label: 'Dettagliato (Verbose JSON)' },
  { value: 'text', label: 'Solo Testo' },
];

export const DEFAULTS = {
  language: 'it',
  task: 'transcribe',
  outputFormat: 'json',
  temperature: '',
  wordTimestamps: false,
  conditionOnPreviousText: true,
  theme: 'dark' as 'dark' | 'light',
};

export const ACCEPTED_EXTENSIONS = /\.(mp3|wav|m4a|webm|flac|ogg|aac|oga)$/i;
export const ACCEPTED_MIME_PREFIX = 'audio/';
export const MAX_FILE_SIZE_MB = 25;
export const RECORDING_CHUNK_INTERVAL_MS = 5000;
export const HEALTH_CHECK_INTERVAL_MS = 15000;
export const TOAST_DURATION_MS = 4000;
