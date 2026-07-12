import { ASR_PROVIDERS, DEFAULTS, MODELS, SPEECHMATICS_MODELS } from '../api/config';
import { Transcription } from '../api/apiClient';

export interface TranscriptionAsrMetadata {
  provider: string;
  providerLabel: string;
  model: string;
  modelLabel: string;
  backend: string;
  providerOptions: Record<string, unknown>;
  cloud: boolean;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function modelName(value: string): string {
  if (!value) return '';
  return value.split('/').pop() || value;
}

export function getTranscriptionAsrMetadata(transcription: Transcription): TranscriptionAsrMetadata {
  const stats = transcription.stats || {};
  const providerOptions = {
    ...(stats.provider_options || {}),
    ...(transcription.provider_options || {}),
  };
  const backend = transcription.backend || stringValue(stats.backend);
  const provider = (
    transcription.asr_provider ||
    stringValue(stats.asr_provider) ||
    (backend.startsWith('speechmatics') ? 'speechmatics' : 'local')
  ).toString();
  const providerConfig = ASR_PROVIDERS.find((item) => item.value === provider);
  const rawModel = provider === 'speechmatics'
    ? stringValue(providerOptions.speechmatics_model) || transcription.model || stringValue(stats.model) || DEFAULTS.speechmaticsModel
    : transcription.model || stringValue(stats.model);
  const modelConfig = provider === 'speechmatics'
    ? SPEECHMATICS_MODELS.find((item) => item.value === rawModel)
    : MODELS.find((item) => item.value === rawModel);

  return {
    provider,
    providerLabel: providerConfig?.label || provider,
    model: rawModel || '',
    modelLabel: modelConfig?.label || modelName(rawModel) || 'Default',
    backend,
    providerOptions,
    cloud: Boolean(providerConfig?.cloud),
  };
}

export function countTranscriptWords(text: string | null | undefined): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}
