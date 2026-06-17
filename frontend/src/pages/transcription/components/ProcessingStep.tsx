import { Card } from '../../../components/ui/Card';
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

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-150">
      <Card className="flex flex-col gap-5 p-8 text-center items-center justify-center min-h-80 animate-in fade-in duration-200">
        <div className="flex gap-1.5 items-center justify-center py-2">
          <span className="w-3 h-3 bg-accent rounded-full animate-bounce delay-100"></span>
          <span className="w-3 h-3 bg-accent rounded-full animate-bounce delay-200"></span>
          <span className="w-3 h-3 bg-accent rounded-full animate-bounce delay-300"></span>
        </div>
        <h3 className="text-lg font-bold text-text-primary mt-1">{t('transcription.processingTitle')}</h3>
        <p className="text-sm text-text-secondary -mt-1 leading-snug">{progressStatus}</p>

        {/* Progress bar */}
        <div className="w-full max-w-md flex items-center gap-4 mt-2">
          <div className="flex-1 h-3 bg-bg-surface border border-border-subtle rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <span className="text-xs font-bold font-mono text-text-primary w-10 text-right">
            {progressPercent}%
          </span>
        </div>

        {/* Live preview boxes */}
        {livePreviewText && (
          <div className="w-full max-w-xl text-left border border-border-subtle bg-bg-surface/30 p-4 rounded-xl max-h-40 overflow-y-auto mt-2">
            <span className="text-[10px] font-bold text-accent block tracking-wider uppercase mb-1.5">
              {t('transcription.livePreview')}
            </span>
            <p className="text-xs text-text-secondary leading-relaxed">{livePreviewText}</p>
          </div>
        )}

        {/* Console log collapsible */}
        <div className="w-full max-w-xl text-left border border-border-subtle rounded-xl overflow-hidden mt-2">
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

        <div className="text-[11px] text-text-muted mt-2 font-medium">
          {t('transcription.elapsedTime').replace('{time}s', elapsedTime)}
        </div>
      </Card>
    </div>
  );
}
