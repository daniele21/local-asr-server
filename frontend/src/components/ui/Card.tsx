import React from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  glass?: boolean;
  variant?: 'default' | 'premium' | 'subtle';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, glass = true, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'relative overflow-hidden rounded-2xl border p-6 transition-premium',
          {
            'backdrop-blur-[20px]': glass,
            'bg-bg-elevated border-border-subtle shadow-[var(--shadow-card)]': variant === 'default',
            'premium-hero rounded-2xl p-6': variant === 'premium',
            'bg-bg-glass border-border-subtle shadow-[var(--shadow-soft)]': variant === 'subtle',
            'hover-lift hover:border-accent/40 hover:shadow-[var(--shadow-premium)]': hoverable,
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
export default Card;
