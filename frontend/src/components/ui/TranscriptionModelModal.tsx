import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { Button } from './Button';
import { Select } from './Select';
import { MODELS } from '../../api/config';
import { ApiClient } from '../../api/apiClient';
import { useTranslation } from '../../i18n/i18n';

interface TranscriptionModelModalProps {
  isOpen: boolean;
  onConfirm: (model: string) => void;
  onCancel: () => void;
  demoMode?: boolean;
}

export function TranscriptionModelModal({
  isOpen,
  onConfirm,
  onCancel,
  demoMode = false,
}: TranscriptionModelModalProps) {
  const { t, lang } = useTranslation();
  const [selectedModel, setSelectedModel] = useState('');
  const [cacheStatus, setCacheStatus] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const checkCache = async () => {
      if (demoMode) {
        setCacheStatus(lang === 'it' ? 'Modello pronto ✅' : 'Model ready ✅');
        return;
      }
      setCacheStatus(lang === 'it' ? 'Verifica...' : 'Checking...');
      try {
        const res = await ApiClient.checkModelCache(selectedModel);
        if (res?.cached) {
          setCacheStatus(lang === 'it' ? 'Modello pronto ✅' : 'Model ready ✅');
        } else {
          setCacheStatus(lang === 'it' ? 'Richiede download' : 'Requires download');
        }
      } catch {
        setCacheStatus(lang === 'it' ? 'Errore verifica' : 'Verification error');
      }
    };

    checkCache();
  }, [selectedModel, isOpen, demoMode, lang]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent size="sm">
        <DialogHeader
          title={t('meeting.selectModelTitle')}
          description={t('meeting.selectModelDescription')}
        />
        <DialogBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-model-select" className="text-sm font-medium text-text-secondary flex justify-between">
              <span>{t('transcription.modelLabel')}</span>
              <span className="text-[10px] font-bold text-text-muted">{cacheStatus}</span>
            </label>
            <Select
              id="modal-model-select"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => onConfirm(selectedModel)}>
            Ok
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TranscriptionModelModal;
