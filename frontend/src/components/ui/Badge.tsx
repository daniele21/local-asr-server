import React from 'react';
import { cn } from '../../utils/cn';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'online' | 'offline' | 'idle' | 'success' | 'warning' | 'danger' | 'info';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'idle',
  pulse = false,
  children,
  ...props
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-glass px-2.5 py-1 text-[11px] font-semibold text-text-secondary shadow-[inset_0_1px_0_var(--surface-highlight)] select-none',
        {
          'text-success border-success/30 bg-success/10': variant === 'online' || variant === 'success',
          'text-danger border-danger/30 bg-danger/10': variant === 'offline' || variant === 'danger',
          'text-warning border-warning/30 bg-warning/10': variant === 'warning',
          'text-info border-info/30 bg-info/10': variant === 'info',
        },
        className
      )}
      {...props}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', {
          'bg-success shadow-[0_0_8px_var(--success)]': variant === 'online' || variant === 'success',
          'bg-danger shadow-[0_0_6px_var(--danger)]': variant === 'offline' || variant === 'danger',
          'bg-warning': variant === 'warning',
          'bg-info': variant === 'info',
          'bg-text-muted': variant === 'idle',
          'animate-pulse': pulse || variant === 'online',
        })}
      />
      {children}
    </span>
  );
};

export default Badge;
