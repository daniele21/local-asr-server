import { useState, useEffect } from 'react';
import { ApiClient, Settings } from '../api/apiClient';
import { MODELS, LANGUAGES, TASKS, LOCAL_LLM_MODELS } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Button } from '../components/ui/Button';

export default function SettingsPage() {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Settings Form State
  const [recordingsDir, setRecordingsDir] = useState('');
  const [transcriptionsDir, setTranscriptionsDir] = useState('');
  const [defaultModel, setDefaultModel] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('it');
  const [defaultTask, setDefaultTask] = useState('transcribe');
  const [defaultTemperature, setDefaultTemperature] = useState('');
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [conditionOnPrevious, setConditionOnPrevious] = useState(true);
  const [llmProvider, setLlmProvider] = useState('mock');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [localLlmUrl, setLocalLlmUrl] = useState('');
  const [localLlmModel, setLocalLlmModel] = useState('nemotron-nano-4b');
  const [localLlmModelPath, setLocalLlmModelPath] = useState('');

  // System Info
  const [sysInfo, setSysInfo] = useState({
    server: '127.0.0.1:1236',
    activeModel: '',
    version: '1.0.0',
    menubar: '',
  });

  const loadSettings = async () => {
    try {
      setLoading(true);
      const settings = await ApiClient.getSettings();
      setRecordingsDir(settings.recordings_dir || '');
      setTranscriptionsDir(settings.transcriptions_dir || '');
      setDefaultModel(settings.default_model || '');
      setDefaultLanguage(settings.default_language || 'it');
      setDefaultTask(settings.default_task || 'transcribe');
      setDefaultTemperature(
        settings.default_temperature !== undefined && settings.default_temperature !== null
          ? String(settings.default_temperature)
          : ''
      );
      setWordTimestamps(settings.default_word_timestamps || false);
      setConditionOnPrevious(settings.default_condition_on_previous !== false);
      setLlmProvider(settings.llm_provider || 'mock');
      setGeminiApiKey(settings.gemini_api_key || '');
      setLocalLlmUrl(settings.local_llm_url || '');
      setLocalLlmModel(settings.local_llm_model || 'nemotron-nano-4b');
      setLocalLlmModelPath(settings.local_llm_model_path || '');

      setSysInfo({
        server: '127.0.0.1:1236',
        activeModel: settings.default_model || t('common.notAvailable'),
        version: '1.0.0',
        menubar: t('settings.sysActive'),
      });
    } catch (err: any) {
      showToast(err.message || 'Errore nel caricamento delle impostazioni', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [t]);

  const handleBrowse = async (target: 'recordings' | 'transcriptions' | 'model') => {
    try {
      let result;
      if (target === 'model') {
        result = await ApiClient.selectFile();
      } else {
        result = await ApiClient.selectDirectory();
      }
      if (result && result.path) {
        if (target === 'recordings') {
          setRecordingsDir(result.path);
        } else if (target === 'transcriptions') {
          setTranscriptionsDir(result.path);
        } else if (target === 'model') {
          setLocalLlmModelPath(result.path);
        }
        showToast(t('transcription.browseSelectDir'), 'info');
      }
    } catch (err: any) {
      showToast(err.message || t('transcription.browseError'), 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload: Partial<Settings> = {
        transcriptions_dir: transcriptionsDir.trim(),
        recordings_dir: recordingsDir.trim(),
        default_model: defaultModel,
        default_language: defaultLanguage,
        default_task: defaultTask,
        default_temperature: defaultTemperature === '' ? null : parseFloat(defaultTemperature),
        default_word_timestamps: wordTimestamps,
        default_condition_on_previous: conditionOnPrevious,
        llm_provider: llmProvider,
        gemini_api_key: geminiApiKey.trim(),
        local_llm_url: localLlmUrl.trim(),
        local_llm_model: localLlmModel,
        local_llm_model_path: localLlmModelPath.trim(),
      };

      await ApiClient.updateSettings(payload);
      showToast(t('settings.successSave'), 'success');
      loadSettings();
    } catch (err: any) {
      showToast(err.message || 'Errore nel salvataggio delle impostazioni', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <span className="text-text-secondary text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      <div className="border-b border-border-subtle pb-3">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('settings.title')}</span>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{t('settings.title')}</h2>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Storage settings */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
            {t('settings.storageTitle')}
          </h3>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5 w-full">
              <label htmlFor="settings-recordings-dir" className="text-sm font-medium text-text-secondary">
                {t('settings.recordingsFolderLabel')}
              </label>
              <div className="flex gap-2 w-full">
                <Input
                  id="settings-recordings-dir"
                  value={recordingsDir}
                  onChange={(e) => setRecordingsDir(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={() => handleBrowse('recordings')}>
                  {t('settings.btnBrowse')}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 w-full">
              <label htmlFor="settings-transcriptions-dir" className="text-sm font-medium text-text-secondary">
                {t('settings.transcriptionsFolderLabel')}
              </label>
              <div className="flex gap-2 w-full">
                <Input
                  id="settings-transcriptions-dir"
                  value={transcriptionsDir}
                  onChange={(e) => setTranscriptionsDir(e.target.value)}
                  required
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={() => handleBrowse('transcriptions')}>
                  {t('settings.btnBrowse')}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Transcription Defaults */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
            {t('settings.transcriptionDefaultsTitle')}
          </h3>
          <p className="text-xs text-text-muted">{t('settings.transcriptionDefaultsDesc')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label={t('transcription.modelLabel')}
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </Select>

            <Select
              label={t('transcription.languageLabel')}
              value={defaultLanguage}
              onChange={(e) => setDefaultLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>

            <Select
              label={t('transcription.taskLabel')}
              value={defaultTask}
              onChange={(e) => setDefaultTask(e.target.value)}
            >
              {TASKS.map((tOpt) => (
                <option key={tOpt.value} value={tOpt.value}>
                  {tOpt.label}
                </option>
              ))}
            </Select>

            <Input
              label={t('transcription.temperatureLabel')}
              type="number"
              step="0.1"
              min="0"
              max="1"
              placeholder="Auto"
              value={defaultTemperature}
              onChange={(e) => setDefaultTemperature(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <Checkbox
              variant="toggle"
              label={t('transcription.wordTimestampsLabel')}
              checked={wordTimestamps}
              onChange={(e) => setWordTimestamps(e.target.checked)}
            />
            <Checkbox
              variant="toggle"
              label={t('transcription.conditionLabel')}
              checked={conditionOnPrevious}
              onChange={(e) => setConditionOnPrevious(e.target.checked)}
            />
          </div>
        </Card>

        {/* AI Analysis settings */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
            {t('settings.aiAnalysisTitle')}
          </h3>

          <div className="flex flex-col gap-4">
            <Select
              label={t('settings.providerLabel')}
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value)}
            >
              <option value="mock">{t('settings.providerMock')}</option>
              <option value="gemini">{t('settings.providerGemini')}</option>
              <option value="nemotron_local">{t('settings.providerNemotron')}</option>
              <option value="voxtral_local">{t('settings.providerVoxtral')}</option>
            </Select>

            {llmProvider === 'gemini' && (
              <div className="flex flex-col gap-1.5">
                <Input
                  label={t('settings.apiKeyLabel')}
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
                <span className="text-[10px] text-text-muted">{t('settings.apiKeyDesc')}</span>
              </div>
            )}

            {(llmProvider === 'nemotron_local' || llmProvider === 'voxtral_local') && (
              <div className="flex flex-col gap-4">
                <Input
                  label={t('settings.localLlmUrl')}
                  value={localLlmUrl}
                  onChange={(e) => setLocalLlmUrl(e.target.value)}
                  placeholder="http://127.0.0.1:1235"
                />
                <Select
                  label={lang === 'it' ? 'Modello LLM locale' : 'Local LLM model'}
                  value={localLlmModel}
                  onChange={(e) => setLocalLlmModel(e.target.value)}
                >
                  {LOCAL_LLM_MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>

                {localLlmModel === 'custom' && (
                  <div className="flex flex-col gap-1.5 w-full">
                    <label className="text-sm font-medium text-text-secondary">
                      {lang === 'it' ? 'Percorso file .gguf modello' : 'Model .gguf file path'}
                    </label>
                    <div className="flex gap-2 w-full">
                      <Input
                        value={localLlmModelPath}
                        onChange={(e) => setLocalLlmModelPath(e.target.value)}
                        placeholder="/Users/.../models/model.gguf"
                        required
                        className="flex-1"
                      />
                      <Button type="button" variant="secondary" onClick={() => handleBrowse('model')}>
                        {t('settings.btnBrowse')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="lg" isLoading={saving} className="w-full sm:w-auto">
            {t('settings.btnSave')}
          </Button>
        </div>
      </form>

      {/* System info */}
      <Card className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
          {t('settings.systemInfoTitle')}
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <span className="text-text-muted">{t('settings.sysServer')}</span>
          <span className="text-text-primary font-mono">{sysInfo.server}</span>

          <span className="text-text-muted">{t('settings.sysActiveModel')}</span>
          <span className="text-text-primary font-medium">{sysInfo.activeModel}</span>

          <span className="text-text-muted">{t('settings.sysVersion')}</span>
          <span className="text-text-primary font-mono">{sysInfo.version}</span>

          <span className="text-text-muted">{t('settings.sysMacosMenu')}</span>
          <span className="text-text-primary font-medium text-success">{sysInfo.menubar}</span>
        </div>
      </Card>
    </div>
  );
}
