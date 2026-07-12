import type { Settings } from '../../api/apiClient';
import { DEFAULTS } from '../../api/config';

export interface AsrConfigForm {
  provider: string;
  model: string;
  language: string;
  task: string;
  temperature: string;
  wordTimestamps: boolean;
  conditionOnPrevious: boolean;
  speechmaticsRegion: string;
  speechmaticsModel: string;
  speechmaticsDiarization: string;
  speechmaticsTimeout: string;
  speechmaticsPollInterval: string;
  speechmaticsKeyConfigured: boolean;
}

export interface AsrSelection {
  model?: string;
  asr_provider?: string;
  speechmatics_region?: string;
  speechmatics_model?: string;
  speechmatics_diarization?: string;
}

export function nullableNumberInput(value: number | null | undefined, fallback = ''): string {
  return value == null ? fallback : String(value);
}

export function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asrConfigFromSettings(settings: Partial<Settings>): AsrConfigForm {
  return {
    provider: settings.asr_provider || DEFAULTS.asrProvider,
    model: settings.default_model || '',
    language: settings.default_language || DEFAULTS.language,
    task: settings.default_task || DEFAULTS.task,
    temperature: nullableNumberInput(settings.default_temperature),
    wordTimestamps: settings.default_word_timestamps ?? DEFAULTS.wordTimestamps,
    conditionOnPrevious: settings.default_condition_on_previous ?? DEFAULTS.conditionOnPreviousText,
    speechmaticsRegion: settings.speechmatics_region || DEFAULTS.speechmaticsRegion,
    speechmaticsModel: settings.speechmatics_model || DEFAULTS.speechmaticsModel,
    speechmaticsDiarization: settings.speechmatics_diarization || DEFAULTS.speechmaticsDiarization,
    speechmaticsTimeout: nullableNumberInput(settings.speechmatics_timeout_seconds, '900'),
    speechmaticsPollInterval: nullableNumberInput(settings.speechmatics_poll_interval_seconds, '5'),
    speechmaticsKeyConfigured: Boolean(settings.speechmatics_api_key_configured),
  };
}

export function asrSettingsPatch(config: AsrConfigForm): Partial<Settings> {
  return {
    default_model: config.model,
    default_language: config.language,
    default_task: config.task,
    default_temperature: numberOrNull(config.temperature),
    default_word_timestamps: config.wordTimestamps,
    default_condition_on_previous: config.conditionOnPrevious,
    asr_provider: config.provider,
    speechmatics_region: config.speechmaticsRegion,
    speechmatics_model: config.speechmaticsModel,
    speechmatics_diarization: config.speechmaticsDiarization,
    speechmatics_timeout_seconds: numberOrNull(config.speechmaticsTimeout),
    speechmatics_poll_interval_seconds: numberOrNull(config.speechmaticsPollInterval),
  };
}

export function asrSelection(config: Pick<AsrConfigForm, 'provider' | 'model' | 'speechmaticsRegion' | 'speechmaticsModel' | 'speechmaticsDiarization'>): AsrSelection {
  return {
    model: config.provider === 'local' ? config.model || undefined : undefined,
    asr_provider: config.provider,
    speechmatics_region: config.speechmaticsRegion,
    speechmatics_model: config.speechmaticsModel,
    speechmatics_diarization: config.speechmaticsDiarization,
  };
}
