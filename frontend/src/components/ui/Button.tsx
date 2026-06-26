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
            'button-primary focus-visible:outline-accent': variant === 'primary',
            'button-secondary focus-visible:outline-border-focus': variant === 'secondary',
            'button-ghost bg-transparent focus-visible:outline-border-focus': variant === 'ghost',
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
          <span
            className="loader-orb -ml-0.5 h-4 w-4 rounded-full"
            role="status"
            aria-label="Caricamento"
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
export default Button;
