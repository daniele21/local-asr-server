import { useState, useEffect } from 'react';
import { AccessibilityStatus, ApiClient, Settings } from '../api/apiClient';
import { ASR_PROVIDERS, DEFAULTS, GEMINI_MODELS, LANGUAGES, LLM_PROVIDERS, MODELS, SPEECHMATICS_DIARIZATION, SPEECHMATICS_MODELS, SPEECHMATICS_REGIONS, TASKS } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Checkbox } from '../components/ui/Checkbox';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { asrConfigFromSettings, asrSettingsPatch } from '../features/config/asrConfig';
import { llmConfigFromSettings, llmSettingsPatch } from '../features/config/llmConfig';

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
  const [asrProvider, setAsrProvider] = useState(DEFAULTS.asrProvider);
  const [speechmaticsApiKey, setSpeechmaticsApiKey] = useState('');
  const [speechmaticsKeyConfigured, setSpeechmaticsKeyConfigured] = useState(false);
  const [speechmaticsRegion, setSpeechmaticsRegion] = useState(DEFAULTS.speechmaticsRegion);
  const [speechmaticsModel, setSpeechmaticsModel] = useState(DEFAULTS.speechmaticsModel);
  const [speechmaticsDiarization, setSpeechmaticsDiarization] = useState(DEFAULTS.speechmaticsDiarization);
  const [speechmaticsTimeout, setSpeechmaticsTimeout] = useState('900');
  const [speechmaticsPollInterval, setSpeechmaticsPollInterval] = useState('5');
  const [defaultTemperature, setDefaultTemperature] = useState('');
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [conditionOnPrevious, setConditionOnPrevious] = useState(true);
  const [llmProvider, setLlmProvider] = useState(DEFAULTS.llmProvider);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(DEFAULTS.geminiModel);
  const [customGeminiModel, setCustomGeminiModel] = useState('');
  const [localLlmUrl, setLocalLlmUrl] = useState('');
  const [localLlmMode, setLocalLlmMode] = useState<'auto' | 'external' | 'disabled'>('auto');
  const [localLlmModel, setLocalLlmModel] = useState(DEFAULTS.localLlmModel);
  const [localLlmModelPath, setLocalLlmModelPath] = useState('');
  const [localLlmQualityPreset, setLocalLlmQualityPreset] = useState<'precise' | 'balanced' | 'creative'>(DEFAULTS.localLlmQualityPreset as 'precise' | 'balanced' | 'creative');
  const [localLlmTemperature, setLocalLlmTemperature] = useState('');
  const [localLlmReasoning, setLocalLlmReasoning] = useState<'auto' | 'on' | 'off'>(DEFAULTS.localLlmReasoning as 'auto' | 'on' | 'off');
  const [localLlmMaxOutputTokens, setLocalLlmMaxOutputTokens] = useState('');
  const [localLlmJsonMode, setLocalLlmJsonMode] = useState(DEFAULTS.localLlmJsonMode);
  const [meetingAutoAnalysis, setMeetingAutoAnalysis] = useState(false);
  const [meetingDefaultPipeline, setMeetingDefaultPipeline] = useState('meeting_default');
  const [speakerDiarizationEnabled, setSpeakerDiarizationEnabled] = useState(false);
  const [visualIntelligenceEnabled, setVisualIntelligenceEnabled] = useState(false);
  const [showAdvancedLlm, setShowAdvancedLlm] = useState(false);
  const [llmService, setLlmService] = useState<any>(null);
  const [llmAction, setLlmAction] = useState('');
  const [llmLogs, setLlmLogs] = useState('');
  const [accessibility, setAccessibility] = useState<AccessibilityStatus | null>(null);

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
      const asr = asrConfigFromSettings(settings);
      const llm = llmConfigFromSettings(settings);
      setRecordingsDir(settings.recordings_dir || '');
      setTranscriptionsDir(settings.transcriptions_dir || '');
      setDefaultModel(asr.model);
      setDefaultLanguage(asr.language);
      setDefaultTask(asr.task);
      setAsrProvider(asr.provider);
      setSpeechmaticsApiKey('');
      setSpeechmaticsKeyConfigured(asr.speechmaticsKeyConfigured);
      setSpeechmaticsRegion(asr.speechmaticsRegion);
      setSpeechmaticsModel(asr.speechmaticsModel);
      setSpeechmaticsDiarization(asr.speechmaticsDiarization);
      setSpeechmaticsTimeout(asr.speechmaticsTimeout);
      setSpeechmaticsPollInterval(asr.speechmaticsPollInterval);
      setDefaultTemperature(asr.temperature);
      setWordTimestamps(asr.wordTimestamps);
      setConditionOnPrevious(asr.conditionOnPrevious);
      setLlmProvider(llm.provider);
      setGeminiApiKey('');
      setGeminiModel(llm.geminiModel);
      setCustomGeminiModel(llm.customGeminiModel);
      setLocalLlmUrl(llm.localUrl);
      setLocalLlmMode(llm.localMode);
      setLocalLlmModel(llm.localModel);
      setLocalLlmModelPath(llm.localModelPath);
      setLocalLlmQualityPreset(llm.qualityPreset);
      setLocalLlmTemperature(llm.temperature);
      setLocalLlmReasoning(llm.reasoning);
      setLocalLlmMaxOutputTokens(llm.maxOutputTokens);
      setLocalLlmJsonMode(llm.jsonMode);
      setMeetingAutoAnalysis(settings.meeting_auto_analysis || false);
      setMeetingDefaultPipeline(settings.meeting_default_pipeline || 'meeting_default');
      setSpeakerDiarizationEnabled(Boolean(settings.speaker_diarization_enabled));
      setVisualIntelligenceEnabled(Boolean(settings.visual_intelligence_enabled));
      refreshLlmService();
      ApiClient.accessibilityStatus()
        .then(setAccessibility)
        .catch((err) => setAccessibility({
          available: false,
          trusted: false,
          required_for: ['global_hotkeys'],
          reason: 'accessibility_status_unavailable',
          error: err instanceof Error ? err.message : String(err),
        }));

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
        ...asrSettingsPatch({
          provider: asrProvider,
          model: defaultModel,
          language: defaultLanguage,
          task: defaultTask,
          temperature: defaultTemperature,
          wordTimestamps,
          conditionOnPrevious,
          speechmaticsRegion,
          speechmaticsModel,
          speechmaticsDiarization,
          speechmaticsTimeout,
          speechmaticsPollInterval,
          speechmaticsKeyConfigured,
        }),
        ...llmSettingsPatch({
          provider: llmProvider,
          geminiModel,
          customGeminiModel,
          localMode: localLlmMode,
          localUrl: localLlmUrl,
          localModel: localLlmModel,
          localModelPath: localLlmModelPath,
          qualityPreset: localLlmQualityPreset,
          temperature: localLlmTemperature,
          reasoning: localLlmReasoning,
          maxOutputTokens: localLlmMaxOutputTokens,
          jsonMode: localLlmJsonMode,
        }, showAdvancedLlm),
        meeting_auto_analysis: meetingAutoAnalysis,
        meeting_default_pipeline: meetingDefaultPipeline,
        speaker_diarization_enabled: speakerDiarizationEnabled,
        visual_intelligence_enabled: visualIntelligenceEnabled,
      };
      if (geminiApiKey.trim()) payload.gemini_api_key = geminiApiKey.trim();
      if (speechmaticsApiKey.trim()) payload.speechmatics_api_key = speechmaticsApiKey.trim();

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
              label="Provider ASR"
              value={asrProvider}
              onChange={(e) => setAsrProvider(e.target.value)}
            >
              {ASR_PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </Select>

            {asrProvider === 'local' && (
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
            )}

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

            {asrProvider === 'local' && (
              <>
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
              </>
            )}
          </div>

          {asrProvider === 'speechmatics' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-bg-surface p-4">
              <Select label="Speechmatics region" value={speechmaticsRegion} onChange={(e) => setSpeechmaticsRegion(e.target.value)}>
                {SPEECHMATICS_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>{region.label}</option>
                ))}
              </Select>
              <Select label="Speechmatics model" value={speechmaticsModel} onChange={(e) => setSpeechmaticsModel(e.target.value)}>
                {SPEECHMATICS_MODELS.map((model) => (
                  <option key={model.value} value={model.value}>{model.label}</option>
                ))}
              </Select>
              <Select label="Diarization" value={speechmaticsDiarization} onChange={(e) => setSpeechmaticsDiarization(e.target.value)}>
                {SPEECHMATICS_DIARIZATION.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </Select>
              <Input
                label={`API key${speechmaticsKeyConfigured ? ' configurata' : ''}`}
                type="password"
                value={speechmaticsApiKey}
                onChange={(e) => setSpeechmaticsApiKey(e.target.value)}
                placeholder={speechmaticsKeyConfigured ? 'Lascia vuoto per mantenere la chiave salvata' : 'Speechmatics API key'}
              />
            </div>
          )}

          {asrProvider === 'local' && (
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
          )}
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
                if (provider === 'nemotron_local') setLocalLlmModel(DEFAULTS.localLlmModel);
                if (provider === 'voxtral_local') setLocalLlmModel('voxtral-mini-3b');
              }}
            >
              {LLM_PROVIDERS.map((item) => (
                <option key={item.value} value={item.value}>{t(item.settingsLabelKey)}</option>
              ))}
            </Select>

            {llmProvider === 'gemini' && (
              <div className="flex flex-col gap-4">
                <Select label="Modello Gemini" value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}>
                  {GEMINI_MODELS.map((model) => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </Select>
                {geminiModel === 'custom' && (
                  <Input
                    label="Gemini model ID"
                    value={customGeminiModel}
                    onChange={(e) => setCustomGeminiModel(e.target.value)}
                    placeholder="gemini-..."
                  />
                )}
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

            {(llmProvider === 'nemotron_local' || llmProvider === 'voxtral_local' || visualIntelligenceEnabled) && (
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
            <Checkbox
              variant="toggle"
              label={t('settings.speakerDiarization')}
              checked={speakerDiarizationEnabled}
              onChange={(e) => setSpeakerDiarizationEnabled(e.target.checked)}
            />
            <p className="text-xs text-text-muted">{t('settings.speakerDiarizationDesc')}</p>
            <Checkbox
              variant="toggle"
              label={t('settings.visualIntelligence')}
              checked={visualIntelligenceEnabled}
              onChange={(e) => setVisualIntelligenceEnabled(e.target.checked)}
            />
            <p className="text-xs text-text-muted">{t('settings.visualIntelligenceDesc')}</p>
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

        {accessibility && !accessibility.trusted && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-text-secondary" role="alert">
            <strong className="text-warning">{t('settings.accessibilityWarningTitle')}</strong>
            <p className="mt-1">{t('settings.accessibilityWarningDesc')}</p>
            <p className="mt-2 font-medium text-text-primary">{t('settings.accessibilityWarningAction')}</p>
            {accessibility.error && <p className="mt-2 text-danger">{accessibility.error}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
