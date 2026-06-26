import React from 'react';
import { cn } from '../../utils/cn';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'pressable is-disabled-surface inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-premium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed cursor-pointer',
          // Variants
          {
            'primary-gradient-surface text-white hover:-translate-y-0.5 hover:shadow-[0_16px_34px_var(--accent-glow)] shadow-[0_10px_28px_var(--accent-glow),inset_0_1px_0px_rgba(255,255,255,0.22)] focus-visible:outline-accent': variant === 'primary',
            'bg-bg-elevated text-text-primary border border-border-subtle hover:-translate-y-0.5 hover:border-border-focus hover:bg-bg-hover shadow-[0_8px_24px_rgba(0,0,0,0.12),inset_0_1px_0px_rgba(255,255,255,0.08)] focus-visible:outline-border-focus': variant === 'secondary',
            'bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text-primary focus-visible:outline-border-focus': variant === 'ghost',
            'bg-danger/10 text-danger border border-danger/30 hover:bg-danger/15 hover:border-danger/45 focus-visible:outline-danger': variant === 'danger',
            'bg-warning/10 text-warning border border-warning/30 hover:bg-warning/15 hover:border-warning/45 focus-visible:outline-warning': variant === 'warning',
          },
          // Sizes
          {
            'px-3 py-1.5 text-xs rounded-md': size === 'sm',
            'px-4 py-2 text-sm': size === 'md',
            'px-6 py-3 text-base rounded-xl': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            role="status"
            aria-label="Caricamento"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
