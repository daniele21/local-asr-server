/**
 * EmptyStateHero.tsx
 * Full-page empty state for main pages (Dashboard, Projects).
 * Shown when the user has no real data yet.
 * Provides a primary action and an optional demo mode CTA.
 */

import type { ComponentType, ReactNode } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from '../../i18n/i18n';

export interface EmptyStateHeroProps {
  /** Lucide icon to display */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Primary CTA (e.g. "Record meeting") */
  primaryAction?: ReactNode;
  /** Secondary CTA (e.g. "Explore demo") */
  secondaryAction?: ReactNode;
}

export function EmptyStateHero({
  icon: Icon = Mic,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateHeroProps) {
  const { lang } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in duration-300">
      {/* Animated icon halo */}
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-accent/20 blur-xl animate-pulse" />
        <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-border-subtle bg-bg-glass shadow-[var(--shadow-card)] backdrop-blur-sm">
          <Icon className="h-9 w-9 text-accent" />
        </div>
      </div>

      {/* Text */}
      <h2 className="text-2xl font-bold text-text-primary">{title}</h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-text-secondary">{description}</p>

      {/* Divider */}
      {(primaryAction || secondaryAction) && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}

      {/* Demo hint */}
      {secondaryAction && (
        <p className="mt-4 text-xs text-text-muted">
          {lang === 'it'
            ? 'I dati demo sono fittizi e non vengono salvati.'
            : 'Demo data is fictional and will not be saved.'}
        </p>
      )}
    </div>
  );
}
