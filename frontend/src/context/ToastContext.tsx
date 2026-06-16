import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { cn } from '../utils/cn';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-remove toast after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Expose to window for backward compatibility with non-React legacy scripts if needed
  useEffect(() => {
    (window as any).Toast = {
      show: (msg: string, t?: ToastType) => showToast(msg, t || 'info'),
    };
    return () => {
      delete (window as any).Toast;
    };
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() => removeToast(toast.id)}
            className={cn(
              'p-4 rounded-xl shadow-lg border text-sm font-medium flex items-center justify-between gap-3 pointer-events-auto cursor-pointer animate-in fade-in slide-in-from-top-4 duration-200',
              {
                'bg-bg-elevated border-success text-success': toast.type === 'success',
                'bg-bg-elevated border-danger text-danger': toast.type === 'error',
                'bg-bg-elevated border-warning text-warning': toast.type === 'warning',
                'bg-bg-elevated border-info text-info': toast.type === 'info',
              }
            )}
          >
            <span>{toast.message}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(toast.id);
              }}
              className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
