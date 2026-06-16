import React from 'react';
import { cn } from '../../utils/cn';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, children, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <select
          id={id}
          ref={ref}
          className={cn(
            'px-4 py-2 bg-bg-surface border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer',
            {
              'border-danger focus:border-danger focus:ring-danger': error,
            },
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export default Select;
