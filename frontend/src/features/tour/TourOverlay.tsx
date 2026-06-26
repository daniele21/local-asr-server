import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
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
  onBack: () => void;
  onClose: () => void;
}

const VIEWPORT_GAP = 16;
const TARGET_PADDING = 8;
const POPOVER_MAX_WIDTH = 384;
const POPOVER_ESTIMATED_HEIGHT = 234;
const TARGET_TO_POPOVER_GAP = 24;

function measureTarget(selector?: string): SpotlightRect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return {
    top: Math.max(TARGET_PADDING, rect.top - TARGET_PADDING),
    left: Math.max(TARGET_PADDING, rect.left - TARGET_PADDING),
    width: Math.min(window.innerWidth - TARGET_PADDING * 2, rect.width + TARGET_PADDING * 2),
    height: Math.min(window.innerHeight - TARGET_PADDING * 2, rect.height + TARGET_PADDING * 2),
  };
}

function clampedPopoverTop(rect: SpotlightRect): string {
  const top = Math.min(
    Math.max(VIEWPORT_GAP, rect.top + VIEWPORT_GAP),
    Math.max(VIEWPORT_GAP, window.innerHeight - POPOVER_ESTIMATED_HEIGHT - VIEWPORT_GAP),
  );
  return `${top}px`;
}

function popoverPosition(rect: SpotlightRect | null): {
  top: string;
  left: string;
  right: string;
  bottom: string;
} {
  if (!rect) {
    return {
      top: 'auto',
      left: 'auto',
      right: `${VIEWPORT_GAP}px`,
      bottom: `${VIEWPORT_GAP}px`,
    };
  }
  const width = Math.min(POPOVER_MAX_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
  const leftCandidate = Math.min(Math.max(VIEWPORT_GAP, rect.left), window.innerWidth - width - VIEWPORT_GAP);
  const below = rect.top + rect.height + VIEWPORT_GAP;
  if (below + 220 < window.innerHeight) {
    return {
      top: `${below}px`,
      left: `${leftCandidate}px`,
      right: 'auto',
      bottom: 'auto',
    };
  }
  const above = rect.top - POPOVER_ESTIMATED_HEIGHT;
  if (above > VIEWPORT_GAP) {
    return {
      top: `${above}px`,
      left: `${leftCandidate}px`,
      right: 'auto',
      bottom: 'auto',
    };
  }
  const rightOfTarget = rect.left + rect.width + TARGET_TO_POPOVER_GAP;
  if (rightOfTarget + width <= window.innerWidth - VIEWPORT_GAP) {
    return {
      top: clampedPopoverTop(rect),
      left: `${rightOfTarget}px`,
      right: 'auto',
      bottom: 'auto',
    };
  }
  const leftOfTarget = rect.left - width - TARGET_TO_POPOVER_GAP;
  if (leftOfTarget >= VIEWPORT_GAP) {
    return {
      top: clampedPopoverTop(rect),
      left: `${leftOfTarget}px`,
      right: 'auto',
      bottom: 'auto',
    };
  }
  return {
    top: 'auto',
    left: 'auto',
    right: `${VIEWPORT_GAP}px`,
    bottom: `${VIEWPORT_GAP}px`,
  };
}

export function TourOverlay({ step, onNext, onBack, onClose }: TourOverlayProps) {
  const { t } = useTranslation();
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const currentIndex = tourStepIndex(step.id);
  const isComplete = step.id === 'complete';
  const total = TOUR_STEPS.length - 1;
  const canGoBack = currentIndex > 0 && !isComplete;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let attempts = 0;
    let didAutoScroll = false;
    const measureOnly = () => {
      setRect(measureTarget(step.target));
    };
    const updateRect = (shouldAutoScroll = false) => {
      const target = step.target ? document.querySelector(step.target) : null;
      if (target && shouldAutoScroll && !didAutoScroll) {
        target.scrollIntoView({
          block: step.scrollBlock || 'center',
          inline: 'nearest',
          behavior: attempts === 0 ? 'smooth' : 'auto',
        });
        didAutoScroll = true;
      }
      measureOnly();
      attempts += 1;
    };
    const timeout = window.setTimeout(() => updateRect(true), 80);
    const retry = window.setInterval(() => {
      if (attempts >= 12 || !step.target || document.querySelector(step.target)) {
        window.clearInterval(retry);
      }
      updateRect(!didAutoScroll);
    }, 120);
    window.addEventListener('resize', measureOnly);
    window.addEventListener('scroll', measureOnly, true);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(retry);
      window.removeEventListener('resize', measureOnly);
      window.removeEventListener('scroll', measureOnly, true);
    };
  }, [step.scrollBlock, step.target]);

  const position = useMemo(() => popoverPosition(rect), [rect]);

  return createPortal(
    <div aria-label={t('tour.ariaLabel')} data-tour="guided-tour-popover">
      {!isComplete && rect && (
        <div
          className="fixed z-[90] rounded-2xl border border-accent/80 shadow-[var(--tour-spotlight-shadow)] pointer-events-none transition-all duration-300"
          style={rect as React.CSSProperties}
        />
      )}
      <aside
        className="fixed z-[100] w-[min(24rem,calc(100vw-2rem))] bg-bg-surface border border-border-subtle rounded-2xl p-5 shadow-premium"
        style={position}
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-accent">
            {t('tour.progress', { current: Math.min(currentIndex + 1, total), total })}
          </span>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition-premium hover:bg-bg-hover hover:text-text-primary" aria-label={t('tour.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-surface">
          <div
            className="primary-gradient-surface h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, ((Math.min(currentIndex + 1, total)) / total) * 100)}%` }}
          />
        </div>
        <h2 className="mt-2 text-base font-bold text-text-primary">{t(step.titleKey)}</h2>
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">{t(step.bodyKey)}</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {canGoBack && <Button variant="secondary" size="sm" onClick={onBack}>{t('tour.back')}</Button>}
          {!isComplete && <Button variant="ghost" size="sm" onClick={onClose}>{t('tour.skip')}</Button>}
          <Button size="sm" onClick={isComplete ? onClose : onNext}>
            {isComplete ? t('tour.close') : currentIndex === total - 1 ? t('tour.finish') : t('tour.next')}
          </Button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
