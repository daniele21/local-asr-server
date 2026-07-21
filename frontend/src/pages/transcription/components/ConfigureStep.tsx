import React from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ASR_PROVIDERS, DIARIZATION_PROVIDERS, LANGUAGES, MODELS, SPEECHMATICS_MODELS, SPEECHMATICS_REGIONS, TASKS } from '../../../api/config';
import { useTranslation } from '../../../i18n/i18n';

interface ConfigureStepProps {
  selectedFile: File | null;
  selectedRecordingId: string | null;
  isProcessing: boolean;
  goToUploadStep: () => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  targetTask: string;
  setTargetTask: (task: string) => void;
  targetModel: string;
  setTargetModel: (model: string) => void;
  asrProvider: string;
  setAsrProvider: (provider: string) => void;
  speechmaticsRegion: string;
  setSpeechmaticsRegion: (region: string) => void;
  speechmaticsModel: string;
  setSpeechmaticsModel: (model: string) => void;
  diarizationProvider: string;
  setDiarizationProvider: (provider: string) => void;
  visualIntelligenceEnabled: boolean;
  setVisualIntelligenceEnabled: (enabled: boolean) => void;
  modelCacheStatus: string;
  temperature: string;
  setTemperature: (temp: string) => void;
  wordTimestamps: boolean;
  setWordTimestamps: (wt: boolean) => void;
  conditionOnPrevious: boolean;
  setConditionOnPrevious: (cop: boolean) => void;
  vadGuided: boolean;
  setVadGuided: (vg: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  startTranscription: () => void;
}

export default function ConfigureStep({
  selectedFile,
  selectedRecordingId,
  isProcessing,
  goToUploadStep,
  targetLanguage,
  setTargetLanguage,
  targetTask,
  setTargetTask,
  targetModel,
  setTargetModel,
  asrProvider,
  setAsrProvider,
  speechmaticsRegion,
  setSpeechmaticsRegion,
  speechmaticsModel,
  setSpeechmaticsModel,
  diarizationProvider,
  setDiarizationProvider,
  visualIntelligenceEnabled,
  setVisualIntelligenceEnabled,
  modelCacheStatus,
  temperature,
  setTemperature,
  wordTimestamps,
  setWordTimestamps,
  conditionOnPrevious,
  setConditionOnPrevious,
  vadGuided,
  setVadGuided,
  audioRef,
  startTranscription,
}: ConfigureStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-150">
      <div className="flex justify-between items-center p-3.5 bg-bg-elevated/40 border border-border-subtle rounded-xl">
        <div className="flex items-center gap-3 pr-2 min-w-0">
          <span className="text-xl">🎧</span>
          <div className="truncate leading-none">
            <strong className="text-xs text-text-primary font-bold truncate block">{selectedFile?.name}</strong>
            <span className="text-[10px] text-text-muted mt-1 block">
              {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : '0'} MB
            </span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={goToUploadStep} disabled={isProcessing}>
          {t('transcription.changeSource')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings parameters */}
        <Card className="lg:col-span-2 flex flex-col gap-4">
          <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider border-b border-border-subtle pb-2">
            {t('transcription.configureTitle')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select label="Provider ASR" value={asrProvider} onChange={(e) => setAsrProvider(e.target.value)}>
              {ASR_PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>{provider.label}</option>
              ))}
            </Select>

            <Select
              label={t('transcription.languageLabel')}
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>

            {asrProvider === 'local' && (
              <>
                <Select
                  label={t('transcription.taskLabel')}
                  value={targetTask}
                  onChange={(e) => setTargetTask(e.target.value)}
                >
                  {TASKS.map((tOpt) => (
                    <option key={tOpt.value} value={tOpt.value}>
                      {tOpt.label}
                    </option>
                  ))}
                </Select>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="model-select" className="text-sm font-medium text-text-secondary flex justify-between">
                    <span>{t('transcription.modelLabel')}</span>
                    <span className="text-[10px] font-bold text-text-muted">{modelCacheStatus}</span>
                  </label>
                  <Select id="model-select" value={targetModel} onChange={(e) => setTargetModel(e.target.value)}>
                    {MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <Input
                  label={t('transcription.temperatureLabel')}
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="Auto"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                />
              </>
            )}
          </div>

          {asrProvider === 'speechmatics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Speechmatics region" value={speechmaticsRegion} onChange={(e) => setSpeechmaticsRegion(e.target.value)}>
                {SPEECHMATICS_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>{region.label}</option>
                ))}
              </Select>
              <Select label="Speechmatics model" value={speechmaticsModel} onChange={(e) => setSpeechmaticsModel(e.target.value)}>
                {SPEECHMATICS_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>{model.label}</option>
                ))}
              </Select>
            </div>
          )}

          <div className="mt-3 border-t border-border-subtle pt-4 flex flex-col gap-3">
            <Select
              label={t('transcription.initialDiarizationLabel')}
              value={diarizationProvider}
              onChange={(e) => setDiarizationProvider(e.target.value)}
            >
              {DIARIZATION_PROVIDERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-text-muted">
              {t('transcription.initialDiarizationDesc')}
            </p>
            {diarizationProvider === 'speechmatics' && (
              <>
                {asrProvider !== 'speechmatics' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select label={t('transcription.rediarizationRegion')} value={speechmaticsRegion} onChange={(e) => setSpeechmaticsRegion(e.target.value)}>
                      {SPEECHMATICS_REGIONS.map((region) => (
                        <option key={region.value} value={region.value}>{region.label}</option>
                      ))}
                    </Select>
                    <Select label={t('transcription.rediarizationModel')} value={speechmaticsModel} onChange={(e) => setSpeechmaticsModel(e.target.value)}>
                      {SPEECHMATICS_MODELS.map((model) => (
                        <option key={model.value} value={model.value}>{model.label}</option>
                      ))}
                    </Select>
                  </div>
                )}
                <p className="text-xs text-warning">
                  {t('transcription.initialDiarizationCloudNotice')}
                </p>
              </>
            )}
          </div>

          {selectedRecordingId && (
            <div className="mt-3 border-t border-border-subtle pt-4 flex flex-col gap-2">
              <Checkbox
                variant="toggle"
                label={t('transcription.visualIntelligenceLabel')}
                checked={visualIntelligenceEnabled}
                onChange={(e) => setVisualIntelligenceEnabled(e.target.checked)}
              />
              <p className="text-xs text-text-muted">
                {t('transcription.visualIntelligenceDesc')}
              </p>
            </div>
          )}

          {asrProvider === 'local' && (
            <div className="flex flex-col gap-3 mt-3">
              <Checkbox
                variant="toggle"
                label={t('transcription.wordTimestampsLabel')}
                checked={wordTimestamps}
                onChange={(e) => setWordTimestamps(e.target.checked)}
              />
              <Checkbox
                variant="toggle"
                label={t('transcription.conditionLabel')}
                checked={conditionOnPrevious}
                onChange={(e) => setConditionOnPrevious(e.target.checked)}
              />
              <Checkbox
                variant="toggle"
                label={t('transcription.vadGuidedLabel')}
                checked={vadGuided}
                onChange={(e) => setVadGuided(e.target.checked)}
              />
            </div>
          )}
        </Card>

        {/* Action column & audio track */}
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider border-b border-border-subtle pb-2">
              {t('transcription.audioTrackTitle')}
            </h3>

            <audio ref={audioRef} controls className="w-full mt-2" />

            <Button size="lg" className="w-full mt-4" onClick={startTranscription}>
              🚀 {t('transcription.btnTranscribeAudio')}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
