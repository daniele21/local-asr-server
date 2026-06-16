import React from 'react';
import { cn } from '../../utils/cn';

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  return (
    <div className={cn('relative group inline-flex', className)}>
      {children}
      <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-40 max-w-[220px] px-2 py-1 border border-border-subtle rounded bg-bg-surface text-text-primary text-[11px] font-bold leading-normal shadow-md opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-150 transform -translate-y-1 group-hover:translate-y-0 whitespace-nowrap">
        {content}
      </div>
    </div>
  );
};

export default Tooltip;
