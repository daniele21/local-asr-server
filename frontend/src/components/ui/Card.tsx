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
            'ui-card-default border-border-subtle': variant === 'default',
            'premium-hero rounded-2xl p-6': variant === 'premium',
            'ui-card-subtle border-border-subtle': variant === 'subtle',
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
