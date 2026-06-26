/**
 * Sheet.tsx
 * Side panel / drawer built on @radix-ui/react-dialog.
 *
 * Used for long-form content: full transcript, analysis run detail, history.
 * On mobile becomes a full-width bottom sheet (inherits Dialog overlay behavior).
 */

import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

// ─── Overlay (shared visual with Dialog) ────────────────────────────────────

function SheetOverlay() {
  return (
    <RadixDialog.Overlay
      className={cn(
        'fixed inset-0 z-[50] bg-bg-base/65 backdrop-blur-sm',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
        'duration-200',
      )}
    />
  );
}

// ─── Content ─────────────────────────────────────────────────────────────────

export interface SheetContentProps {
  children: ReactNode;
  /** Side from which the sheet slides in */
  side?: 'right' | 'left';
  /** Width class — defaults to w-[440px] */
  widthClass?: string;
  className?: string;
  hideClose?: boolean;
  dataTour?: string;
}

function SheetContent({
  children,
  side = 'right',
  widthClass = 'w-full sm:w-[440px]',
  className,
  hideClose = false,
  dataTour,
}: SheetContentProps) {
  const sideClasses =
    side === 'right'
      ? 'right-0 rounded-l-2xl data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right'
      : 'left-0 rounded-r-2xl data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left';

  return (
    <RadixDialog.Portal>
      <SheetOverlay />
      <RadixDialog.Content
        data-tour={dataTour}
        className={cn(
          // Fixed to viewport edge, full height
          'fixed top-0 z-[60] flex h-full flex-col',
          'border-border-subtle ui-overlay-surface',
          widthClass,
          sideClasses,
          // Radix animations
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'duration-250',
          // Mobile: full-width bottom sheet
          'max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:h-[85vh] max-sm:w-full',
          'max-sm:rounded-b-none max-sm:rounded-t-2xl',
          'max-sm:data-[state=open]:slide-in-from-bottom max-sm:data-[state=closed]:slide-out-to-bottom',
          // Border
          side === 'right' ? 'border-l' : 'border-r',
          'max-sm:border-l-0 max-sm:border-r-0 max-sm:border-t',
          className,
        )}
      >
        {!hideClose && (
          <RadixDialog.Close
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-lg border border-border-subtle text-text-muted transition-all hover:border-border-focus hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </RadixDialog.Close>
        )}
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

export interface SheetHeaderProps {
  title: string;
  description?: string;
  className?: string;
}

function SheetHeader({ title, description, className }: SheetHeaderProps) {
  return (
    <div className={cn('ui-overlay-bar border-b border-border-subtle px-5 py-4 pr-12 shrink-0', className)}>
      <RadixDialog.Title className="text-base font-semibold text-text-primary">
        {title}
      </RadixDialog.Title>
      {description && (
        <RadixDialog.Description className="mt-0.5 text-xs leading-relaxed text-text-muted">
          {description}
        </RadixDialog.Description>
      )}
    </div>
  );
}

// ─── Body (scrollable) ───────────────────────────────────────────────────────

export interface SheetBodyProps {
  children: ReactNode;
  className?: string;
}

function SheetBody({ children, className }: SheetBodyProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto p-5', className)}>
      {children}
    </div>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

export interface SheetFooterProps {
  children: ReactNode;
  className?: string;
}

function SheetFooter({ children, className }: SheetFooterProps) {
  return (
    <div className={cn('ui-overlay-bar flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3 shrink-0', className)}>
      {children}
    </div>
  );
}

// ─── Exports ─────────────────────────────────────────────────────────────────

/**
 * Usage:
 *
 * <Sheet open={open} onOpenChange={setOpen}>
 *   <SheetContent side="right">
 *     <SheetHeader title="Trascrizione completa" />
 *     <SheetBody>...</SheetBody>
 *     <SheetFooter>
 *       <SheetClose asChild><Button variant="secondary">Chiudi</Button></SheetClose>
 *     </SheetFooter>
 *   </SheetContent>
 * </Sheet>
 */
export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;
export { SheetContent, SheetHeader, SheetBody, SheetFooter };
