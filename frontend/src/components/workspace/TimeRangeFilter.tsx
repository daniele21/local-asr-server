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
              'inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all duration-150',
              value.mode === option.mode
                ? 'border-accent bg-accent text-white shadow-sm shadow-accent/15'
                : 'border-border-subtle bg-bg-elevated text-text-secondary hover:border-border-focus hover:text-text-primary'
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
            className="h-9 rounded-lg border border-border-subtle bg-bg-elevated px-3 text-xs text-text-primary outline-none focus:border-border-focus"
          />
          <span className="hidden sm:inline text-text-muted">-</span>
          <input
            type="date"
            value={value.endDate || ''}
            onChange={(event) => onChange({ ...value, endDate: event.target.value })}
            className="h-9 rounded-lg border border-border-subtle bg-bg-elevated px-3 text-xs text-text-primary outline-none focus:border-border-focus"
          />
        </div>
      )}
    </div>
  );
}

export default TimeRangeFilter;
