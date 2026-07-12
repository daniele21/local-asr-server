import type { AnalysisSetupPayload, Settings } from '../../api/apiClient';
import { DEFAULTS, GEMINI_MODELS } from '../../api/config';
import { nullableNumberInput, numberOrNull } from './asrConfig';

export type LocalLlmMode = 'auto' | 'external' | 'disabled';
export type LocalLlmQualityPreset = 'precise' | 'balanced' | 'creative';
export type LocalLlmReasoning = 'auto' | 'on' | 'off';

export interface LlmConfigForm {
  provider: string;
  geminiModel: string;
  customGeminiModel: string;
  localMode: LocalLlmMode;
  localUrl: string;
  localModel: string;
  localModelPath: string;
  qualityPreset: LocalLlmQualityPreset;
  temperature: string;
  reasoning: LocalLlmReasoning;
  maxOutputTokens: string;
  jsonMode: boolean;
}

export function isLocalLlmProvider(provider: string): boolean {
  return provider === 'nemotron_local' || provider === 'voxtral_local';
}

export function effectiveGeminiModel(model: string, customModel: string): string {
  return model === 'custom' ? customModel.trim() : model;
}

export function llmConfigFromSettings(settings: Settings): LlmConfigForm {
  const hasCatalogGeminiModel = GEMINI_MODELS.some((model) => model.value === settings.gemini_model);
  return {
    provider: settings.llm_provider || DEFAULTS.llmProvider,
    geminiModel: settings.gemini_model && !hasCatalogGeminiModel ? 'custom' : settings.gemini_model || DEFAULTS.geminiModel,
    customGeminiModel: settings.gemini_model && !hasCatalogGeminiModel ? settings.gemini_model : '',
    localMode: settings.local_llm_mode || 'auto',
    localUrl: settings.local_llm_url || '',
    localModel: settings.local_llm_model || DEFAULTS.localLlmModel,
    localModelPath: settings.local_llm_model_path || '',
    qualityPreset: settings.local_llm_quality_preset || DEFAULTS.localLlmQualityPreset as LocalLlmQualityPreset,
    temperature: nullableNumberInput(settings.local_llm_temperature),
    reasoning: settings.local_llm_reasoning || DEFAULTS.localLlmReasoning as LocalLlmReasoning,
    maxOutputTokens: nullableNumberInput(settings.local_llm_max_output_tokens),
    jsonMode: settings.local_llm_json_mode ?? DEFAULTS.localLlmJsonMode,
  };
}

export function llmAnalysisPayload(config: LlmConfigForm, apiKey = ''): AnalysisSetupPayload {
  const payload: AnalysisSetupPayload = { llm_provider: config.provider };
  if (config.provider === 'gemini') {
    payload.gemini_model = effectiveGeminiModel(config.geminiModel, config.customGeminiModel);
    if (apiKey.trim()) payload.gemini_api_key = apiKey.trim();
  }
  if (isLocalLlmProvider(config.provider)) {
    payload.local_llm_model = config.localModel;
    payload.local_llm_model_path = config.localModelPath.trim();
    payload.local_llm_quality_preset = config.qualityPreset;
    payload.local_llm_temperature = numberOrNull(config.temperature);
    payload.local_llm_reasoning = config.reasoning;
    payload.local_llm_max_output_tokens = numberOrNull(config.maxOutputTokens);
    payload.local_llm_json_mode = config.jsonMode;
  }
  return payload;
}

export function llmSettingsPatch(config: LlmConfigForm, includeExternalUrl: boolean): Partial<Settings> {
  return {
    llm_provider: config.provider,
    gemini_model: effectiveGeminiModel(config.geminiModel, config.customGeminiModel),
    local_llm_mode: config.localMode,
    local_llm_url: includeExternalUrl ? config.localUrl.trim() : undefined,
    local_llm_model: config.localModel,
    local_llm_quality_preset: config.qualityPreset,
    local_llm_temperature: numberOrNull(config.temperature),
    local_llm_reasoning: config.reasoning,
    local_llm_max_output_tokens: numberOrNull(config.maxOutputTokens),
    local_llm_json_mode: config.jsonMode,
    local_llm_model_path: config.localModelPath.trim(),
  };
}
