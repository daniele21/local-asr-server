import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface TaskProcessingLoaderProps {
  title: string;
  description: string;
  steps: string[];
  activeStep?: number;
  progress?: number;
  variant?: 'transcription' | 'analysis' | 'project';
  compact?: boolean;
  helperText?: string;
}

const variantTone = {
  transcription: 'from-sky-400 to-cyan-300',
  analysis: 'from-violet-400 to-sky-300',
  project: 'from-emerald-300 to-sky-300',
};

export function TaskProcessingLoader({
  title,
  description,
  steps,
  activeStep = 0,
  progress,
  variant = 'analysis',
  compact = false,
  helperText,
}: TaskProcessingLoaderProps) {
  const clampedProgress = typeof progress === 'number' ? Math.max(0, Math.min(100, progress)) : undefined;
  const safeActiveStep = Math.max(0, Math.min(activeStep, Math.max(steps.length - 1, 0)));

  return (
    <section
      className={cn(
        'task-loader relative overflow-hidden rounded-2xl animate-page-in',
        compact ? 'p-4' : 'p-6 sm:p-8'
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent/15 blur-3xl" />
      <div className="absolute -left-16 bottom-0 h-36 w-36 rounded-full bg-teal/10 blur-3xl" />
      <div className={cn('relative z-10 flex gap-4', compact ? 'items-start' : 'flex-col sm:flex-row sm:items-start')}>
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-bg-glass shadow-[inset_0_1px_0_var(--surface-highlight)]">
          <span className={cn('absolute inset-1 rounded-[1rem] bg-gradient-to-br opacity-30 blur-md animate-soft-pulse', variantTone[variant])} />
          <span className="loader-orb relative h-8 w-8 rounded-full" />
          <Sparkles className="absolute right-3 top-3 h-3 w-3 text-white/80" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className={cn('font-semibold text-text-primary', compact ? 'text-sm' : 'text-lg')}>{title}</h3>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-text-secondary">{description}</p>
            </div>
            {clampedProgress !== undefined && (
              <span className="font-mono text-xs font-semibold text-text-secondary">{Math.round(clampedProgress)}%</span>
            )}
          </div>

          {clampedProgress !== undefined && (
            <div className="mt-4 h-2 overflow-hidden rounded-full border border-border-subtle bg-bg-surface">
              <div
                className="primary-gradient-surface h-full rounded-full transition-all duration-300 animate-shimmer"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          )}

          <ol className={cn('stagger-list mt-5 grid gap-2', compact ? 'grid-cols-1' : 'sm:grid-cols-2')}>
            {steps.map((step, index) => {
              const completed = index < safeActiveStep;
              const active = index === safeActiveStep;
              return (
                <li
                  key={step}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-premium',
                    completed && 'border-success/25 bg-success/10 text-success',
                    active && 'border-accent/45 bg-accent/10 text-text-primary shadow-[0_0_24px_var(--accent-glow)]',
                    !completed && !active && 'border-border-subtle bg-bg-glass text-text-muted'
                  )}
                >
                  {completed ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : active ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0" />
                  )}
                  <span className="min-w-0 truncate">{step}</span>
                </li>
              );
            })}
          </ol>

          {helperText && (
            <p className="guidance-callout mt-4 rounded-xl px-3 py-2 text-xs leading-relaxed text-text-secondary">
              {helperText}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

export default TaskProcessingLoader;
