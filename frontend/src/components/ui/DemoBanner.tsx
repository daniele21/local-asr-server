/**
 * DemoBanner.tsx
 * Persistent contextual banner displayed below the navbar when demo mode is active.
 * Informs the user they are in demo mode and provides quick actions.
 */

import { Clapperboard, X } from 'lucide-react';
import { Button } from './Button';
import { useTranslation } from '../../i18n/i18n';

export interface DemoBannerProps {
  onExitDemo: () => void;
  onStartTour?: () => void;
  isTouring?: boolean;
}

export function DemoBanner({ onExitDemo, onStartTour, isTouring = false }: DemoBannerProps) {
  const { t, lang } = useTranslation();

  return (
    <div
      className="demo-banner-surface animate-in slide-in-from-top-1 duration-300 rounded-xl border px-4 py-2.5"
      role="status"
      aria-label={lang === 'it' ? 'Demo mode attiva' : 'Demo mode active'}
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Icon + text */}
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-warning/20 bg-warning/10 text-warning">
          <Clapperboard className="h-3.5 w-3.5" />
        </span>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-xs font-semibold text-text-primary">
            {t('demo.bannerTitle')}
          </span>
          <span className="text-xs text-text-secondary">
            {t('demo.bannerDesc')}
          </span>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {onStartTour && !isTouring && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onStartTour}
              className="text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary border-border-subtle"
            >
              {t('demo.bannerTour')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onExitDemo}
            className="text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary border-border-subtle"
          >
            <X className="h-3.5 w-3.5" />
            {t('demo.bannerExit')}
          </Button>
        </div>
      </div>
    </div>
  );
}
