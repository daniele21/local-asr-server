import { CalendarDays } from 'lucide-react';
import { TimeRangeMode, TimeRangeState } from '../../utils/meetingInsights';
import { cn } from '../../utils/cn';

export interface TimeRangeOption {
  mode: TimeRangeMode;
  label: string;
}

interface TimeRangeFilterProps {
  value: TimeRangeState;
  options: TimeRangeOption[];
  onChange: (value: TimeRangeState) => void;
  className?: string;
}

export function TimeRangeFilter({ value, options, onChange, className }: TimeRangeFilterProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((option) => (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange({ ...value, mode: option.mode })}
            className={cn(
              'pressable inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-premium',
              value.mode === option.mode
                ? 'primary-gradient-surface border-accent text-white shadow-[0_10px_24px_var(--accent-glow)]'
                : 'border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-focus hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {value.mode === 'custom' && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1 text-text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            Range
          </span>
          <input
            type="date"
            value={value.startDate || ''}
            onChange={(event) => onChange({ ...value, startDate: event.target.value })}
            className="h-9 rounded-lg border border-border-subtle bg-bg-elevated px-3 text-xs text-text-primary outline-none transition-premium focus:border-border-focus focus:ring-2 focus:ring-accent/20"
          />
          <span className="hidden sm:inline text-text-muted">-</span>
          <input
            type="date"
            value={value.endDate || ''}
            onChange={(event) => onChange({ ...value, endDate: event.target.value })}
            className="h-9 rounded-lg border border-border-subtle bg-bg-elevated px-3 text-xs text-text-primary outline-none transition-premium focus:border-border-focus focus:ring-2 focus:ring-accent/20"
          />
        </div>
      )}
    </div>
  );
}

export default TimeRangeFilter;
