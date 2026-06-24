import { useEffect } from 'react';
import { Button } from '../../components/ui/Button';
import { useTranslation } from '../../i18n/i18n';

export type TourStep = 'transcription' | 'analysis' | 'complete';

interface TourOverlayProps {
  step: TourStep;
  onNext: () => void;
  onClose: () => void;
}

export function TourOverlay({ step, onNext, onClose }: TourOverlayProps) {
  const { t } = useTranslation();
  const isComplete = step === 'complete';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const content = step === 'transcription'
    ? { title: t('tour.transcriptionTitle'), body: t('tour.transcriptionBody'), next: t('tour.nextAnalysis') }
    : step === 'analysis'
      ? { title: t('tour.analysisTitle'), body: t('tour.analysisBody'), next: t('tour.finish') }
      : { title: t('tour.completeTitle'), body: t('tour.completeBody'), next: t('tour.close') };

  return (
    <aside
      className="fixed z-[60] right-4 bottom-4 w-[min(24rem,calc(100vw-2rem))] bg-bg-elevated border border-accent/50 rounded-2xl shadow-2xl p-5"
      aria-live="polite"
      aria-label={t('tour.ariaLabel')}
      data-tour="guided-tour-popover"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent">{t('tour.progress', { current: step === 'transcription' ? 1 : 2, total: 2 })}</span>
        <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none" aria-label={t('tour.close')}>×</button>
      </div>
      <h2 className="mt-2 text-base font-bold text-text-primary">{content.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-text-secondary">{content.body}</p>
      <div className="mt-4 flex justify-end gap-2">
        {!isComplete && <Button variant="ghost" size="sm" onClick={onClose}>{t('tour.skip')}</Button>}
        <Button size="sm" onClick={isComplete ? onClose : onNext}>{content.next}</Button>
      </div>
    </aside>
  );
}
