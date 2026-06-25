import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useTranslation } from '../../i18n/i18n';
import { GuidedTourStep, TOUR_STEPS, tourStepIndex } from './tourSteps';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourOverlayProps {
  step: GuidedTourStep;
  onNext: () => void;
  onClose: () => void;
}

function measureTarget(selector?: string): SpotlightRect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const padding = 8;
  return {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
    height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
  };
}

function popoverPosition(rect: SpotlightRect | null): { top?: number; left?: number; right?: number; bottom?: number } {
  if (!rect) return { right: 16, bottom: 16 };
  const width = Math.min(384, window.innerWidth - 32);
  const leftCandidate = Math.min(Math.max(16, rect.left), window.innerWidth - width - 16);
  const below = rect.top + rect.height + 14;
  if (below + 220 < window.innerHeight) return { top: below, left: leftCandidate };
  const above = rect.top - 234;
  if (above > 16) return { top: above, left: leftCandidate };
  return { right: 16, bottom: 16 };
}

export function TourOverlay({ step, onNext, onClose }: TourOverlayProps) {
  const { t } = useTranslation();
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const currentIndex = tourStepIndex(step.id);
  const isComplete = step.id === 'complete';
  const total = TOUR_STEPS.length - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let attempts = 0;
    const updateRect = () => {
      const target = step.target ? document.querySelector(step.target) : null;
      target?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: attempts === 0 ? 'smooth' : 'auto' });
      setRect(measureTarget(step.target));
      attempts += 1;
    };
    const timeout = window.setTimeout(updateRect, 80);
    const retry = window.setInterval(() => {
      if (attempts >= 12 || !step.target || document.querySelector(step.target)) {
        window.clearInterval(retry);
      }
      updateRect();
    }, 120);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(retry);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [step.target]);

  const position = useMemo(() => popoverPosition(rect), [rect]);

  return (
    <div aria-label={t('tour.ariaLabel')} data-tour="guided-tour-popover">
      {!isComplete && rect && (
        <div
          className="fixed z-[56] rounded-xl border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.48),0_0_0_6px_rgba(14,165,233,0.18)] pointer-events-none transition-all duration-200"
          style={rect}
        />
      )}
      <aside
        className="fixed z-[60] w-[min(24rem,calc(100vw-2rem))] bg-bg-elevated border border-accent/50 rounded-xl shadow-2xl p-5"
        style={position}
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
            {t('tour.progress', { current: Math.min(currentIndex + 1, total), total })}
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-lg leading-none" aria-label={t('tour.close')}>x</button>
        </div>
        <h2 className="mt-2 text-base font-bold text-text-primary">{t(step.titleKey)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{t(step.bodyKey)}</p>
        <div className="mt-4 flex justify-end gap-2">
          {!isComplete && <Button variant="ghost" size="sm" onClick={onClose}>{t('tour.skip')}</Button>}
          <Button size="sm" onClick={isComplete ? onClose : onNext}>
            {isComplete ? t('tour.close') : currentIndex === total - 1 ? t('tour.finish') : t('tour.next')}
          </Button>
        </div>
      </aside>
    </div>
  );
}
