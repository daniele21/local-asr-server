import { useState, useEffect } from 'react';
import { ApiClient, Settings } from '../api/apiClient';
import { MODELS, LANGUAGES, TASKS } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

export default function SettingsPage() {
  const { t } = useTranslation();
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
  const [localLlmMode, setLocalLlmMode] = useState<'auto' | 'external' | 'disabled'>('auto');
  const [localLlmModel, setLocalLlmModel] = useState('nemotron-nano-4b-q8');
  const [localLlmModelPath, setLocalLlmModelPath] = useState('');
  const [localLlmQualityPreset, setLocalLlmQualityPreset] = useState<'precise' | 'balanced' | 'creative'>('balanced');
  const [localLlmTemperature, setLocalLlmTemperature] = useState('');
  const [localLlmReasoning, setLocalLlmReasoning] = useState<'auto' | 'on' | 'off'>('auto');
  const [localLlmMaxOutputTokens, setLocalLlmMaxOutputTokens] = useState('');
  const [localLlmJsonMode, setLocalLlmJsonMode] = useState(true);
  const [meetingAutoAnalysis, setMeetingAutoAnalysis] = useState(false);
  const [meetingDefaultPipeline, setMeetingDefaultPipeline] = useState('meeting_default');
  const [showAdvancedLlm, setShowAdvancedLlm] = useState(false);
  const [llmService, setLlmService] = useState<any>(null);
  const [llmAction, setLlmAction] = useState('');
  const [llmLogs, setLlmLogs] = useState('');

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
      setConditionOnPrevious(settings.default_condition_on_previous ?? false);
      setLlmProvider(settings.llm_provider || 'mock');
      setGeminiApiKey('');
      setLocalLlmUrl(settings.local_llm_url || '');
      setLocalLlmMode(settings.local_llm_mode || 'auto');
      setLocalLlmModel(settings.local_llm_model || 'nemotron-nano-4b-q8');
      setLocalLlmModelPath(settings.local_llm_model_path || '');
      setLocalLlmQualityPreset(settings.local_llm_quality_preset || 'balanced');
      setLocalLlmTemperature(
        settings.local_llm_temperature !== undefined && settings.local_llm_temperature !== null
          ? String(settings.local_llm_temperature)
          : ''
      );
      setLocalLlmReasoning(settings.local_llm_reasoning || 'auto');
      setLocalLlmMaxOutputTokens(
        settings.local_llm_max_output_tokens !== undefined && settings.local_llm_max_output_tokens !== null
          ? String(settings.local_llm_max_output_tokens)
          : ''
      );
      setLocalLlmJsonMode(settings.local_llm_json_mode !== false);
      setMeetingAutoAnalysis(settings.meeting_auto_analysis || false);
      setMeetingDefaultPipeline(settings.meeting_default_pipeline || 'meeting_default');
      refreshLlmService();

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

  const refreshLlmService = async () => {
    try {
      setLlmService(await ApiClient.getLlmService());
    } catch (err: any) {
      setLlmService({ name: 'llm', status: 'unknown', error: err.message });
    }
  };

  const runLlmAction = async (action: 'start' | 'stop' | 'restart' | 'logs') => {
    setLlmAction(action);
    try {
      if (action === 'start') await ApiClient.startLlmService();
      if (action === 'stop') await ApiClient.stopLlmService();
      if (action === 'restart') await ApiClient.restartLlmService();
      if (action === 'logs') {
        const logs = await ApiClient.getLlmLogs(200);
        setLlmLogs(logs.text || t('common.notAvailable'));
      }
      await refreshLlmService();
    } catch (err: any) {
      showToast(err.message || t('common.error'), 'error');
    } finally {
      setLlmAction('');
    }
  };

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
        local_llm_mode: localLlmMode,
        local_llm_url: showAdvancedLlm ? localLlmUrl.trim() : undefined,
        local_llm_model: localLlmModel,
        local_llm_quality_preset: localLlmQualityPreset,
        local_llm_temperature: localLlmTemperature === '' ? null : parseFloat(localLlmTemperature),
        local_llm_reasoning: localLlmReasoning,
        local_llm_max_output_tokens: localLlmMaxOutputTokens === '' ? null : parseInt(localLlmMaxOutputTokens, 10),
        local_llm_json_mode: localLlmJsonMode,
        local_llm_model_path: localLlmModelPath.trim(),
        meeting_auto_analysis: meetingAutoAnalysis,
        meeting_default_pipeline: meetingDefaultPipeline,
      };
      if (geminiApiKey.trim()) payload.gemini_api_key = geminiApiKey.trim();

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
              onChange={(e) => {
                const provider = e.target.value;
                setLlmProvider(provider);
                if (provider === 'nemotron_local') setLocalLlmModel('nemotron-nano-4b-q8');
                if (provider === 'voxtral_local') setLocalLlmModel('voxtral-mini-3b');
              }}
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
                <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-surface p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-text-primary">{t('settings.localLlmServiceTitle')}</h4>
                        <Badge variant={llmService?.status === 'ready' ? 'success' : llmService?.status === 'failed' || llmService?.status === 'crashed' ? 'danger' : 'warning'}>
                          {llmService?.status || 'unknown'}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-1">{t('settings.localLlmServiceDesc')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="secondary" onClick={() => runLlmAction('start')} isLoading={llmAction === 'start'}>
                        {t('settings.localLlmStart')}
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => runLlmAction('stop')} isLoading={llmAction === 'stop'}>
                        {t('settings.localLlmStop')}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => runLlmAction('restart')} isLoading={llmAction === 'restart'}>
                        {t('settings.localLlmRestart')}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => runLlmAction('logs')} isLoading={llmAction === 'logs'}>
                        {t('settings.localLlmLogs')}
                      </Button>
                    </div>
                  </div>
                  {showAdvancedLlm && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-muted">
                      <span>{t('settings.localLlmManaged')}: {llmService?.managed ? 'yes' : 'no'}</span>
                      <span>{t('settings.localLlmPort')}: {llmService?.port || t('common.notAvailable')}</span>
                      {llmService?.loaded_model && (
                        <span className="md:col-span-2">
                          <strong>{t('settings.localLlmActiveModel')}</strong>: {llmService.loaded_model}{' '}
                          {llmService.loaded_model_id && `(${llmService.loaded_model_id})`}{' '}
                          {llmService.loaded_model_backend ? `[${llmService.loaded_model_backend}]` : ''}
                        </span>
                      )}
                      {llmService?.url && (
                        <span className="md:col-span-2">
                          <strong>{t('settings.localLlmWebUi')}</strong>:{' '}
                          <a
                            href={llmService.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline inline-flex items-center gap-1 font-mono"
                          >
                            {llmService.url} ↗
                          </a>
                        </span>
                      )}
                      {llmService?.url && (
                        <span className="md:col-span-2 text-[10px] text-text-muted italic">
                          💡 {t('settings.localLlmChangeModelNote')}
                        </span>
                      )}
                      {llmService?.error && <span className="md:col-span-2 text-danger">{llmService.error}</span>}
                    </div>
                  )}
                  {llmLogs && showAdvancedLlm && (
                    <pre className="max-h-48 overflow-auto rounded-md bg-bg-base p-3 text-[11px] text-text-secondary whitespace-pre-wrap">{llmLogs}</pre>
                  )}
                </div>

                <Select
                  label={t('settings.localLlmMode')}
                  value={localLlmMode}
                  onChange={(e) => setLocalLlmMode(e.target.value as 'auto' | 'external' | 'disabled')}
                >
                  <option value="auto">{t('settings.localLlmModeAuto')}</option>
                  <option value="external">{t('settings.localLlmModeExternal')}</option>
                  <option value="disabled">{t('settings.localLlmModeDisabled')}</option>
                </Select>

                {localLlmMode === 'external' && (
                  <Checkbox
                    variant="toggle"
                    label={t('settings.localLlmAdvanced')}
                    checked={showAdvancedLlm}
                    onChange={(e) => setShowAdvancedLlm(e.target.checked)}
                  />
                )}

                {localLlmMode === 'external' && showAdvancedLlm && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label={t('settings.localLlmUrl')}
                      value={localLlmUrl}
                      onChange={(e) => setLocalLlmUrl(e.target.value)}
                      placeholder="http://127.0.0.1:1235"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
            {t('settings.meetingWorkflowTitle')}
          </h3>
          <p className="text-xs text-text-muted">{t('settings.meetingWorkflowDesc')}</p>
          <div className="flex flex-col gap-4">
            <Checkbox
              variant="toggle"
              label={t('settings.meetingAutoAnalysis')}
              checked={meetingAutoAnalysis}
              onChange={(e) => setMeetingAutoAnalysis(e.target.checked)}
            />
            <Select
              label={t('settings.meetingDefaultPipeline')}
              value={meetingDefaultPipeline}
              onChange={(e) => setMeetingDefaultPipeline(e.target.value)}
            >
              <option value="meeting_default">{t('settings.meetingPipelineDefault')}</option>
              <option value="meeting_deep">{t('settings.meetingPipelineDeep')}</option>
            </Select>
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
