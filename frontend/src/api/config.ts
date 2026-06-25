export const MODELS = [
  { value: '', label: 'Predefinito del Server', badge: 'default' },
  { value: 'mlx-community/whisper-large-v3-turbo', label: 'Whisper Large V3 Turbo', badge: 'recommended' },
  { value: 'mlx-community/nemotron-3.5-asr-streaming-0.6b', label: 'Nemotron 3.5 ASR Streaming 0.6B', badge: 'streaming' },
];

export const LOCAL_LLM_MODELS = [
  { value: 'nemotron-nano-4b-q8', label: 'Nemotron Nano 4B Q8 (Default)' },
  { value: 'voxtral-mini-3b', label: 'Voxtral Mini 3B (Audio Multimodal)' },
  { value: 'custom', label: 'File .gguf personalizzato...' },
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
  temperature: '0.0',
  wordTimestamps: false,
  conditionOnPreviousText: false,
  vadGuided: false,
  theme: 'dark' as 'dark' | 'light',
};

export const ANALYSIS_TYPE_ORDER = [
  'meeting_brief',
  'action_items',
  'decisions',
  'risks_blockers',
  'meeting_minutes',
  'open_questions',
  'project_update',
  'custom_question',
];

export const ANALYSIS_TYPE_LABELS: Record<string, string> = {
  meeting_brief: 'Brief',
  action_items: 'Azioni',
  decisions: 'Decisioni',
  risks_blockers: 'Rischi',
  meeting_minutes: 'Verbale',
  open_questions: 'Domande',
  project_update: 'Progetto',
  custom_question: 'Custom',
};

export const ACCEPTED_EXTENSIONS = /\.(mp3|wav|m4a|webm|flac|ogg|aac|oga)$/i;
export const ACCEPTED_MIME_PREFIX = 'audio/';
export const MAX_FILE_SIZE_MB = 25;
export const RECORDING_CHUNK_INTERVAL_MS = 5000;
export const HEALTH_CHECK_INTERVAL_MS = 15000;
export const TOAST_DURATION_MS = 4000;
