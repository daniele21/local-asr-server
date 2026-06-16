import React, { useState, useEffect } from 'react';
import { useTranslation } from '../../i18n/i18n';
import { Card } from './Card';
import { Button } from './Button';
import { Input } from './Input';

interface ProjectPromptModalProps {
  isOpen: boolean;
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  existingProjects: string[];
}

export function ProjectPromptModal({
  isOpen,
  initialValue,
  onConfirm,
  onCancel,
  existingProjects,
}: ProjectPromptModalProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-md w-full flex flex-col gap-5 border-border-subtle bg-bg-surface p-6 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-border-subtle pb-3">
          <h3 className="text-base font-bold text-text-primary">
            {t('transcription.assignProjectTitle')}
          </h3>
          <button
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary text-xl cursor-pointer"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-secondary">
              {t('transcription.assignProjectBody')}
            </p>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('recording.formProjectPlaceholder')}
              autoFocus
            />
          </div>

          {existingProjects.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                {t('recording.formProjectLabel')}
              </span>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1 border border-border-subtle/30 rounded-lg">
                {existingProjects.map((proj) => (
                  <button
                    key={proj}
                    type="button"
                    onClick={() => setValue(proj)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      value === proj
                        ? 'bg-accent/20 border-accent text-accent font-semibold'
                        : 'bg-bg-hover border-border-subtle text-text-secondary hover:text-text-primary hover:border-border-focus'
                    }`}
                  >
                    {proj}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-border-subtle pt-4 mt-2">
            <Button type="button" variant="secondary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">
              Ok
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default ProjectPromptModal;
