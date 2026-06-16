import React from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { Input } from '../../../components/ui/Input';
import { Checkbox } from '../../../components/ui/Checkbox';
import { MODELS, LANGUAGES, TASKS } from '../../../api/config';
import { useTranslation } from '../../../i18n/i18n';

interface ConfigureStepProps {
  selectedFile: File | null;
  isProcessing: boolean;
  goToUploadStep: () => void;
  targetLanguage: string;
  setTargetLanguage: (lang: string) => void;
  targetTask: string;
  setTargetTask: (task: string) => void;
  targetModel: string;
  setTargetModel: (model: string) => void;
  modelCacheStatus: string;
  temperature: string;
  setTemperature: (temp: string) => void;
  wordTimestamps: boolean;
  setWordTimestamps: (wt: boolean) => void;
  conditionOnPrevious: boolean;
  setConditionOnPrevious: (cop: boolean) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  startTranscription: () => void;
}

export default function ConfigureStep({
  selectedFile,
  isProcessing,
  goToUploadStep,
  targetLanguage,
  setTargetLanguage,
  targetTask,
  setTargetTask,
  targetModel,
  setTargetModel,
  modelCacheStatus,
  temperature,
  setTemperature,
  wordTimestamps,
  setWordTimestamps,
  conditionOnPrevious,
  setConditionOnPrevious,
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
          </div>

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
          </div>
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
