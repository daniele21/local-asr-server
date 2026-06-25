import React from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  glass?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable = false, glass = true, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'bg-bg-elevated border border-border-subtle rounded-2xl p-6 transition-all duration-300 shadow-[0_8px_30px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.06)]',
          {
            'backdrop-blur-[20px]': glass,
            'hover:border-accent/40 hover:shadow-[0_15px_35px_rgba(14,165,233,0.12),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:-translate-y-0.5 hover:scale-[1.01] ease-spring': hoverable,
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
