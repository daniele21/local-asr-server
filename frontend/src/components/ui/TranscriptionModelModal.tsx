import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogBody, DialogFooter } from './Dialog';
import { Button } from './Button';
import { Select } from './Select';
import {
  ASR_PROVIDERS,
  DEFAULTS,
  MODELS,
  SPEECHMATICS_DIARIZATION,
  SPEECHMATICS_MODELS,
  SPEECHMATICS_REGIONS,
} from '../../api/config';
import { ApiClient, Settings } from '../../api/apiClient';
import { useTranslation } from '../../i18n/i18n';
import {
  asrConfigFromSettings,
  asrSelection,
  type AsrSelection,
} from '../../features/config/asrConfig';

export interface TranscriptionModelSelection extends AsrSelection {}

interface TranscriptionModelModalProps {
  isOpen: boolean;
  onConfirm: (selection: TranscriptionModelSelection) => void;
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
  const [asrProvider, setAsrProvider] = useState(DEFAULTS.asrProvider);
  const [speechmaticsRegion, setSpeechmaticsRegion] = useState(DEFAULTS.speechmaticsRegion);
  const [speechmaticsModel, setSpeechmaticsModel] = useState(DEFAULTS.speechmaticsModel);
  const [speechmaticsDiarization, setSpeechmaticsDiarization] = useState(DEFAULTS.speechmaticsDiarization);
  const [speechmaticsKeyConfigured, setSpeechmaticsKeyConfigured] = useState(false);
  const [cacheStatus, setCacheStatus] = useState('');

  useEffect(() => {
    if (!isOpen || demoMode) return;
    let mounted = true;
    ApiClient.getSettings().then((settings: Settings) => {
      if (!mounted) return;
      const config = asrConfigFromSettings(settings);
      setSelectedModel(config.model);
      setAsrProvider(config.provider);
      setSpeechmaticsRegion(config.speechmaticsRegion);
      setSpeechmaticsModel(config.speechmaticsModel);
      setSpeechmaticsDiarization(config.speechmaticsDiarization);
      setSpeechmaticsKeyConfigured(config.speechmaticsKeyConfigured);
    }).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen, demoMode]);

  useEffect(() => {
    if (!isOpen) return;

    const checkCache = async () => {
      if (asrProvider !== 'local') {
        setCacheStatus(speechmaticsKeyConfigured ? 'Speechmatics' : (lang === 'it' ? 'API key mancante' : 'Missing API key'));
        return;
      }
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
  }, [asrProvider, selectedModel, speechmaticsKeyConfigured, isOpen, demoMode, lang]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent size="sm">
        <DialogHeader
          title={t('meeting.selectModelTitle')}
          description={t('meeting.selectModelDescription')}
        />
        <DialogBody className="flex flex-col gap-4">
          <Select label="Provider ASR" value={asrProvider} onChange={(e) => setAsrProvider(e.target.value)}>
            {ASR_PROVIDERS.map((provider) => (
              <option key={provider.value} value={provider.value}>{provider.label}</option>
            ))}
          </Select>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="modal-model-select" className="text-sm font-medium text-text-secondary flex justify-between">
              <span>{asrProvider === 'speechmatics' ? 'Speechmatics model' : t('transcription.modelLabel')}</span>
              <span className="text-[10px] font-bold text-text-muted">{cacheStatus}</span>
            </label>
            {asrProvider === 'speechmatics' ? (
              <Select
                id="modal-model-select"
                value={speechmaticsModel}
                onChange={(e) => setSpeechmaticsModel(e.target.value)}
              >
                {SPEECHMATICS_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>{model.label}</option>
                ))}
              </Select>
            ) : (
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
            )}
          </div>

          {asrProvider === 'speechmatics' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Region" value={speechmaticsRegion} onChange={(e) => setSpeechmaticsRegion(e.target.value)}>
                {SPEECHMATICS_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>{region.label}</option>
                ))}
              </Select>
              <Select label="Diarization" value={speechmaticsDiarization} onChange={(e) => setSpeechmaticsDiarization(e.target.value)}>
                {SPEECHMATICS_DIARIZATION.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </Select>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(asrSelection({
              provider: asrProvider,
              model: selectedModel,
              speechmaticsRegion,
              speechmaticsModel,
              speechmaticsDiarization,
            }))}
          >
            Ok
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default TranscriptionModelModal;
