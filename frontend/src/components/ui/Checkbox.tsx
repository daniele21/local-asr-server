import React from 'react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  variant?: 'checkbox' | 'toggle';
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, variant = 'checkbox', id, ...props }, ref) => {
    return (
      <label className="inline-flex items-center gap-3 cursor-pointer select-none text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-150">
        <input
          id={id}
          type="checkbox"
          ref={ref}
          className="sr-only peer"
          {...props}
        />
        {variant === 'toggle' ? (
          // Toggle slider
          <div className="relative w-10 h-6 bg-border-subtle peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
        ) : (
          // Standard custom checkbox
          <div className="w-5 h-5 bg-bg-surface border border-border-subtle rounded flex items-center justify-center transition-all peer-checked:bg-accent peer-checked:border-accent">
            <svg
              className="w-3.5 h-3.5 text-white scale-0 transition-transform peer-checked:scale-100"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3.5"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}
        {label && <span>{label}</span>}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;
