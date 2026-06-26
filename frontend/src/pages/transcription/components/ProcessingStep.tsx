import { Card } from '../../../components/ui/Card';
import { TaskProcessingLoader } from '../../../components/workspace/TaskProcessingLoader';
import { useTranslation } from '../../../i18n/i18n';

interface ProcessingStepProps {
  progressStatus: string;
  progressPercent: number;
  livePreviewText: string;
  liveConsoleLines: string[];
  elapsedTime: string;
}

export default function ProcessingStep({
  progressStatus,
  progressPercent,
  livePreviewText,
  liveConsoleLines,
  elapsedTime,
}: ProcessingStepProps) {
  const { t } = useTranslation();
  const steps = [
    t('workspace.loaderTranscriptionStep1'),
    t('workspace.loaderTranscriptionStep2'),
    t('workspace.loaderTranscriptionStep3'),
    t('workspace.loaderTranscriptionStep4'),
    t('workspace.loaderTranscriptionStep5'),
  ];
  const activeStep = Math.min(steps.length - 1, Math.max(0, Math.floor(progressPercent / 22)));

  return (
    <div className="flex flex-col gap-5 animate-fade-in">
      <TaskProcessingLoader
        title={t('workspace.loaderTranscriptionTitle')}
        description={t('workspace.loaderTranscriptionDesc')}
        steps={steps}
        activeStep={activeStep}
        progress={progressPercent}
        variant="transcription"
        helperText={progressStatus || t('workspace.loaderLocalHelper')}
      />
      <Card className="flex flex-col gap-5 p-5" variant="subtle">
        {/* Live preview boxes */}
        {livePreviewText && (
          <div className="w-full text-left border border-border-subtle bg-bg-surface/30 p-4 rounded-xl max-h-40 overflow-y-auto">
            <span className="text-[10px] font-bold text-accent block tracking-wider uppercase mb-1.5">
              {t('transcription.livePreview')}
            </span>
            <p className="text-xs text-text-secondary leading-relaxed">{livePreviewText}</p>
          </div>
        )}

        {/* Console log collapsible */}
        <div className="w-full text-left border border-border-subtle rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-[10px] font-bold bg-bg-surface/50 border-b border-border-subtle tracking-wider uppercase">
            {t('transcription.transcriptionLog')}
          </div>
          <div className="p-3 bg-black font-mono text-[10px] text-emerald-400 h-32 overflow-y-auto leading-relaxed flex flex-col gap-1 select-text">
            {liveConsoleLines.length === 0 ? (
              <span className="text-gray-500">{t('transcription.waitingBackend')}</span>
            ) : (
              liveConsoleLines.map((line, idx) => <span key={idx}>{line}</span>)
            )}
          </div>
        </div>

        <div className="text-[11px] text-text-muted font-medium">
          {t('transcription.elapsedTime').replace('{time}s', elapsedTime)}
        </div>
      </Card>
    </div>
  );
}
