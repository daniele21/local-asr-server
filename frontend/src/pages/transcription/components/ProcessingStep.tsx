import { Card } from '../../../components/ui/Card';
import { TaskProcessingLoader } from '../../../components/workspace/TaskProcessingLoader';
import { useTranslation } from '../../../i18n/i18n';
import type { VisualProcessingProgress } from '../../../api/apiClient';
import { CheckCircle2, ChevronDown, Circle, Loader2 } from 'lucide-react';
import { formatVisualEta, getTranscriptionFinalizationSteps } from '../../../utils/jobs';

interface ProcessingStepProps {
  progressStatus: string;
  progressPercent: number;
  activeStep: number;
  currentStep: string;
  livePreviewText: string;
  liveConsoleLines: string[];
  elapsedTime: string;
  visualProgress: VisualProcessingProgress | null;
}

export default function ProcessingStep({
  progressStatus,
  progressPercent,
  activeStep,
  currentStep,
  livePreviewText,
  liveConsoleLines,
  elapsedTime,
  visualProgress,
}: ProcessingStepProps) {
  const { t } = useTranslation();
  const steps = [
    t('workspace.loaderTranscriptionStep1'),
    t('workspace.loaderTranscriptionStep2'),
    t('workspace.loaderTranscriptionStep3'),
    t('workspace.loaderTranscriptionStep4'),
    t('workspace.loaderTranscriptionStep5'),
  ];
  const finalizationSteps = getTranscriptionFinalizationSteps(currentStep, t);
  const activeFinalizationStep = finalizationSteps.find((item) => item.status === 'active');

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
        {activeFinalizationStep && (
          <section className="w-full text-left" aria-labelledby="finalization-status-title" aria-live="polite">
            <div className="flex items-start gap-3">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
              <div>
                <h3 id="finalization-status-title" className="text-sm font-semibold text-text-primary">
                  {activeFinalizationStep.label}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                  {activeFinalizationStep.description}
                </p>
              </div>
            </div>

            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {finalizationSteps.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs">
                  {item.status === 'completed' ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                  ) : item.status === 'active' ? (
                    <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-accent" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
                  )}
                  <span className={item.status === 'pending' ? 'text-text-muted' : 'font-medium text-text-primary'}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {visualProgress && (
          <div className="w-full border-y border-border-subtle py-3 text-left" aria-live="polite">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-xs font-semibold text-text-primary">
                {visualProgress.unit === 'candidates'
                  ? t('transcription.visualTasksProcessed', { processed: visualProgress.processed, total: visualProgress.total })
                  : t('transcription.visualFramesProcessed', { processed: visualProgress.processed, total: visualProgress.total })}
              </span>
              <span className="text-[11px] font-medium text-text-secondary">
                {t('transcription.visualRemainingEta', {
                  remaining: visualProgress.remaining,
                  eta: formatVisualEta(visualProgress.eta_seconds, t),
                })}
              </span>
            </div>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] font-medium text-text-muted hover:text-text-secondary">
                {t('transcription.visualDetails')}
                <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-text-muted">
                <span>{t('transcription.visualCaptured', { count: visualProgress.captured_frames })}</span>
                <span>{t('transcription.visualSelected', { count: visualProgress.selected_candidates })}</span>
                <span>{t('transcription.visualRejected', { count: visualProgress.rejected_candidates })}</span>
                <span>{t('transcription.visualInferred', { count: visualProgress.inferred })}</span>
                <span>{t('transcription.visualReused', { count: visualProgress.reused })}</span>
                <span>{t('transcription.visualSkipped', { count: visualProgress.skipped })}</span>
                {visualProgress.failed > 0 && (
                  <span className="text-amber-500">{t('transcription.visualFailed', { count: visualProgress.failed })}</span>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Live preview boxes */}
        {livePreviewText && (
          <div className="w-full text-left border border-border-subtle bg-bg-surface/30 p-4 rounded-xl max-h-40 overflow-y-auto">
            <span className="text-[10px] font-bold text-accent block tracking-wider uppercase mb-1.5">
              {t('transcription.livePreview')}
            </span>
            <p className="text-xs text-text-secondary leading-relaxed">{livePreviewText}</p>
          </div>
        )}

        <details className="group w-full overflow-hidden rounded-xl border border-border-subtle text-left">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-bg-surface/50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider">
            <span>{t('transcription.technicalActivity')}</span>
            <span className="flex items-center gap-1.5 font-medium normal-case tracking-normal text-text-muted">
              {t('transcription.logEntries', { count: liveConsoleLines.length })}
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" aria-hidden="true" />
            </span>
          </summary>
          <div className="flex h-32 select-text flex-col gap-1 overflow-y-auto bg-black p-3 font-mono text-[10px] leading-relaxed text-emerald-400">
            {liveConsoleLines.length === 0 ? (
              <span className="text-gray-500">{t('transcription.waitingBackend')}</span>
            ) : (
              liveConsoleLines.map((line, idx) => <span key={idx}>{line}</span>)
            )}
          </div>
        </details>

        <div className="text-[11px] text-text-muted font-medium">
          {t('transcription.elapsedTime').replace('{time}s', elapsedTime)}
        </div>
      </Card>
    </div>
  );
}
