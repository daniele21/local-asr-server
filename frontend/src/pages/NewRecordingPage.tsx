import { useEffect, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  ChevronDown,
  FolderOpen,
  Info,
  Mic,
  Monitor,
  PanelTopOpen,
  RefreshCw,
  SlidersHorizontal,
  Square,
  TriangleAlert,
} from 'lucide-react';
import { ApiClient, CaptureWindow, Recording } from '../api/apiClient';
import { NEW_RECORDING_PROJECT_STORAGE_KEY } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { openBrowserPopup, useRecorder } from '../hooks/useRecorder';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';

interface NewRecordingPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
}

const captureWindowLabel = (source: CaptureWindow) =>
  [source.application_name, source.title].filter(Boolean).join(' — ');

export default function NewRecordingPage({ navigateTo }: NewRecordingPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [sourceMode, setSourceMode] = useState<'both' | 'mic_only' | 'pc_only'>('both');
  const [recordingsDir, setRecordingsDir] = useState('');
  const [storageConfigured, setStorageConfigured] = useState(false);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  const [visualIntelligenceEnabled, setVisualIntelligenceEnabled] = useState(false);
  const [speakerDiarizationEnabled, setSpeakerDiarizationEnabled] = useState(false);
  const [visualModel, setVisualModel] = useState('');
  const [captureWindows, setCaptureWindows] = useState<CaptureWindow[]>([]);
  const [selectedVisualWindowId, setSelectedVisualWindowId] = useState('');
  const [captureWindowsLoading, setCaptureWindowsLoading] = useState(false);
  const [captureWindowsError, setCaptureWindowsError] = useState('');
  const [enrichmentSaving, setEnrichmentSaving] = useState<'diarization' | 'visual' | null>(null);
  const [permissionLoading, setPermissionLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [storageSaving, setStorageSaving] = useState(false);

  const recorder = useRecorder((recording: Recording) => {
    // Meetings are addressed by recording id throughout the meeting API.
    navigateTo('meeting', recording.id);
  });

  const nativeCaptureReady = recorder.captureCapabilities?.default_backend === 'native'
    && recorder.captureCapabilities.native.available;
  const nativeCaptureChecked = Boolean(recorder.captureCapabilities);
  const nativeCaptureUnavailableReason = recorder.captureCapabilities?.native.reason
    || recorder.captureCapabilities?.native.error
    || '';
  const nativeCaptureUnavailableMessage = (() => {
    if (nativeCaptureUnavailableReason === 'screen_capture_stream_pending') return t('recording.nativeCapturePendingReason');
    if (nativeCaptureUnavailableReason === 'helper_missing') return t('recording.nativeCaptureHelperMissingReason');
    if (nativeCaptureUnavailableReason === 'macos_required' || nativeCaptureUnavailableReason === 'macos_14_required') {
      return t('recording.nativeCaptureMacosRequiredReason');
    }
    if (nativeCaptureUnavailableReason === 'screen_recording_permission_required') return t('recording.nativeCaptureScreenPermissionReason');
    if (nativeCaptureUnavailableReason === 'microphone_permission_required') return t('recording.nativeCaptureMicPermissionReason');
    return nativeCaptureUnavailableReason || t('recording.nativeCaptureUnavailableUnknown');
  })();

  const visualCaptureSelected = visualIntelligenceEnabled && selectedVisualWindowId !== '';
  const selectedVisualWindow = captureWindows.find((window) => String(window.id) === selectedVisualWindowId);
  const visualCaptureLabel = selectedVisualWindow ? captureWindowLabel(selectedVisualWindow) : '';
  const needsComputerAudio = sourceMode !== 'mic_only';
  const micReady = nativeCaptureReady
    ? (sourceMode === 'pc_only' || recorder.capturePermissions?.microphone === 'authorized')
    : (sourceMode === 'pc_only' || recorder.microphones.length > 0 || recorder.selectedMicrophone === '');
  const computerReady = nativeCaptureReady
    ? ((sourceMode === 'mic_only' && !visualCaptureSelected) || recorder.capturePermissions?.screen_capture === 'granted')
    : (!needsComputerAudio || Boolean(recorder.audioRouteStatus?.ready_to_record) || recorder.systemDevices.length > 0);
  const storageReady = storageConfigured && recordingsDir.trim().length > 0;
  const readyToRecord = micReady && computerReady && storageReady;

  const captureModeOptions = [
    { value: 'both', label: t('recording.captureModeBoth') },
    { value: 'mic_only', label: t('recording.captureModeMicOnly') },
    {
      value: 'pc_only',
      label: nativeCaptureReady
        ? t('recording.captureModeComputerOnly')
        : t('recording.captureModeComputerOnlyFallback'),
    },
  ] as const;

  useEffect(() => {
    const projectFromWorkspace = sessionStorage.getItem(NEW_RECORDING_PROJECT_STORAGE_KEY);
    if (projectFromWorkspace) {
      setProjectName(projectFromWorkspace);
      sessionStorage.removeItem(NEW_RECORDING_PROJECT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await ApiClient.getSettings();
        const configuredDir = settings.recordings_dir || '';
        setRecordingsDir(configuredDir);
        setStorageConfigured(Boolean(configuredDir.trim()));
        setSpeakerDiarizationEnabled(Boolean(settings.speaker_diarization_enabled));
        setVisualIntelligenceEnabled(Boolean(settings.visual_intelligence_enabled));
        setVisualModel(settings.visual_llm_model || '');
        const projects = await ApiClient.listProjects();
        setProjectsList((projects.items || []).filter((project) => !project.is_unassigned).map((project) => project.name));
      } catch {
        // Readiness below exposes configuration gaps without blocking the rest of the app shell.
      }
    };
    void loadSettings();
  }, []);

  const refreshCaptureWindows = async () => {
    setCaptureWindowsLoading(true);
    setCaptureWindowsError('');
    try {
      const result = await ApiClient.captureWindows();
      setCaptureWindows(result.windows || []);
    } catch (err) {
      setCaptureWindows([]);
      setCaptureWindowsError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptureWindowsLoading(false);
    }
  };

  useEffect(() => {
    if (!nativeCaptureReady || !visualIntelligenceEnabled) {
      setCaptureWindows([]);
      setSelectedVisualWindowId('');
      return;
    }
    void refreshCaptureWindows();
  }, [nativeCaptureReady, visualIntelligenceEnabled]);

  const updateEnrichmentSetting = async (
    setting: 'speaker_diarization_enabled' | 'visual_intelligence_enabled',
    enabled: boolean,
  ) => {
    const previous = setting === 'speaker_diarization_enabled'
      ? speakerDiarizationEnabled
      : visualIntelligenceEnabled;
    const savingKey = setting === 'speaker_diarization_enabled' ? 'diarization' : 'visual';
    if (setting === 'speaker_diarization_enabled') setSpeakerDiarizationEnabled(enabled);
    else setVisualIntelligenceEnabled(enabled);
    setEnrichmentSaving(savingKey);
    try {
      await ApiClient.updateSettings({ [setting]: enabled });
    } catch (err) {
      if (setting === 'speaker_diarization_enabled') setSpeakerDiarizationEnabled(previous);
      else setVisualIntelligenceEnabled(previous);
      showToast(err instanceof Error ? err.message : String(err), 'error');
    } finally {
      setEnrichmentSaving(null);
    }
  };

  const handleAuthorizeCapture = async () => {
    setPermissionLoading(true);
    setPermissionError(null);
    try {
      const permissionMode = visualCaptureSelected && sourceMode === 'mic_only' ? 'both' : sourceMode;
      const result = await ApiClient.ensureCapturePermissions(permissionMode);
      await recorder.refreshCapturePermissions();
      if (!result.ok) {
        const message = result.diagnostics?.code_signature && result.diagnostics.code_signature !== 'signed'
          ? t('recording.permissionsUnsignedHelper')
          : result.diagnostics?.bundle_identifier && result.diagnostics.bundle_identifier !== 'com.closedroom.nativecapture'
            ? t('recording.permissionsInvalidHelper')
            : t('recording.permissionsRequired');
        setPermissionError(message);
      }
    } catch (err) {
      setPermissionError(err instanceof Error ? err.message : String(err));
    } finally {
      setPermissionLoading(false);
    }
  };

  const persistStorageDir = async (path: string) => {
    if (!path.trim()) return;
    setStorageSaving(true);
    try {
      await ApiClient.updateSettings({ recordings_dir: path.trim() });
      setRecordingsDir(path.trim());
      setStorageConfigured(true);
      showToast(t('transcription.saveSuccessAudioDir'), 'success');
    } catch (err) {
      setStorageConfigured(false);
      showToast(err instanceof Error ? err.message : t('common.error'), 'error');
    } finally {
      setStorageSaving(false);
    }
  };

  const handleBrowseDir = async () => {
    try {
      const result = await ApiClient.selectDirectory();
      if (result?.path) await persistStorageDir(result.path);
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('transcription.browseError'), 'error');
    }
  };

  const statusSummary = (() => {
    if (recorder.isRecording) {
      return { tone: 'recording', title: t('recording.statusRecording'), detail: recorder.progressText };
    }
    if (recorder.statusState === 'error') {
      return {
        tone: 'blocked',
        title: recorder.statusText || t('common.error'),
        detail: recorder.progressText || (lang === 'it' ? 'Controlla il problema e riprova.' : 'Check the issue and try again.'),
      };
    }
    if (readyToRecord) {
      return {
        tone: 'ready',
        title: lang === 'it' ? 'Pronto per registrare' : 'Ready to record',
        detail: sourceMode === 'both'
          ? (lang === 'it' ? 'Microfono e audio del computer sono pronti.' : 'Microphone and computer audio are ready.')
          : sourceMode === 'mic_only'
            ? (lang === 'it' ? 'Il microfono è pronto.' : 'Microphone is ready.')
            : (lang === 'it' ? 'L’audio del computer è pronto.' : 'Computer audio is ready.'),
      };
    }
    if (!storageReady) {
      return {
        tone: 'blocked',
        title: lang === 'it' ? 'Scegli dove salvare i meeting' : 'Choose where meetings are saved',
        detail: lang === 'it'
          ? 'Serve una cartella locale prima della prima registrazione.'
          : 'A local folder is required before the first recording.',
      };
    }
    if (nativeCaptureReady && (!micReady || !computerReady)) {
      return {
        tone: 'blocked',
        title: lang === 'it' ? 'ClosedRoom ha bisogno di un permesso' : 'ClosedRoom needs a permission',
        detail: !micReady
          ? (lang === 'it' ? 'Consenti l’accesso al microfono per continuare.' : 'Allow microphone access to continue.')
          : (lang === 'it'
            ? 'Consenti Registrazione schermo per acquisire l’audio del computer.'
            : 'Allow Screen Recording to capture computer audio.'),
      };
    }
    return {
      tone: 'blocked',
      title: lang === 'it' ? 'Configurazione audio da completare' : 'Audio setup needs attention',
      detail: lang === 'it'
        ? 'Apri le opzioni audio e verifica il dispositivo da usare.'
        : 'Open audio options and verify the device to use.',
    };
  })();

  const start = () => recorder.startRecording(
    title,
    projectName,
    '',
    sourceMode,
    visualCaptureSelected ? Number(selectedVisualWindowId) : undefined,
    visualCaptureSelected ? visualCaptureLabel : '',
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="border-b border-border-subtle pb-4">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">{t('header.newMeeting')}</span>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{t('recording.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-text-secondary">
          {lang === 'it'
            ? 'Aggiungi solo il contesto che ti serve. ClosedRoom verifica automaticamente il resto.'
            : 'Add only the context you need. ClosedRoom checks the rest automatically.'}
        </p>
      </header>

      <Card className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t('recording.titleLabel')}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={recorder.isRecording}
            placeholder={t('recording.titlePlaceholder')}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="new-meeting-project" className="text-sm font-medium text-text-secondary">
              {t('recording.projectLabel')}
            </label>
            <input
              id="new-meeting-project"
              list="new-meeting-projects"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              disabled={recorder.isRecording}
              placeholder={t('recording.projectPlaceholder')}
              className="h-10 w-full rounded-lg border border-border-subtle bg-bg-surface px-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-border-focus disabled:cursor-not-allowed disabled:opacity-60"
            />
            <datalist id="new-meeting-projects">
              {projectsList.map((project) => <option key={project} value={project} />)}
            </datalist>
          </div>
        </div>

        <section
          className={`rounded-xl border px-4 py-4 ${
            statusSummary.tone === 'ready'
              ? 'border-success/30 bg-success/10'
              : statusSummary.tone === 'recording'
                ? 'border-danger/30 bg-danger/10'
                : 'border-warning/30 bg-warning/10'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {statusSummary.tone === 'ready' ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              ) : statusSummary.tone === 'recording' ? (
                <Mic className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text-primary">{statusSummary.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{statusSummary.detail}</p>
                {permissionError && <p className="mt-2 text-xs text-danger">{permissionError}</p>}
                {recorder.fallbackNotice && <p className="mt-2 text-xs text-warning">{recorder.fallbackNotice}</p>}
              </div>
            </div>

            {!recorder.isRecording && !readyToRecord && nativeCaptureReady && storageReady && (
              <Button type="button" size="sm" onClick={handleAuthorizeCapture} isLoading={permissionLoading} className="shrink-0">
                {lang === 'it' ? 'Consenti accesso' : 'Allow access'}
              </Button>
            )}
            {!recorder.isRecording && !storageReady && (
              <Button type="button" size="sm" variant="secondary" onClick={handleBrowseDir} isLoading={storageSaving} className="shrink-0">
                <FolderOpen className="h-4 w-4" />
                {t('settings.btnBrowse')}
              </Button>
            )}
            {!recorder.isRecording && !nativeCaptureReady && nativeCaptureChecked && !readyToRecord && storageReady && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setShowOptions(true)} className="shrink-0">
                <SlidersHorizontal className="h-4 w-4" />
                {lang === 'it' ? 'Configura audio' : 'Configure audio'}
              </Button>
            )}
          </div>
        </section>

        {!storageReady && (
          <section className="rounded-xl border border-border-subtle bg-bg-surface/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Input
                  label={t('settings.recordingsFolderLabel')}
                  value={recordingsDir}
                  onChange={(event) => {
                    setRecordingsDir(event.target.value);
                    setStorageConfigured(false);
                  }}
                  placeholder="~/ClosedRoom/Recordings"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={handleBrowseDir} isLoading={storageSaving}>
                  <FolderOpen className="h-4 w-4" />
                  {t('settings.btnBrowse')}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => persistStorageDir(recordingsDir)}
                  isLoading={storageSaving}
                  disabled={!recordingsDir.trim()}
                >
                  {lang === 'it' ? 'Salva' : 'Save'}
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Keep the canvas mounted so useRecorder can bind its visualizer before capture starts. */}
        <section className={recorder.isRecording ? 'rounded-xl border border-border-subtle bg-bg-elevated p-4' : 'hidden'}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">{t('recording.statusRecording')}</p>
              <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-text-primary">{recorder.timer}</p>
            </div>
            <div className="grid min-w-[240px] grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2">
                <span className="block text-text-muted">{lang === 'it' ? 'Microfono' : 'Microphone'}</span>
                <strong className="mt-1 block font-mono text-text-primary">{recorder.signalLevelMic}</strong>
              </div>
              <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2">
                <span className="block text-text-muted">Computer</span>
                <strong className="mt-1 block font-mono text-text-primary">{recorder.signalLevelSystem}</strong>
              </div>
            </div>
          </div>
          <canvas ref={recorder.canvasRef} width={900} height={70} className="mt-4 h-16 w-full rounded-lg bg-bg-surface" aria-hidden="true" />
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          {!recorder.isRecording ? (
            <Button
              type="button"
              size="lg"
              onClick={start}
              disabled={recorder.isVerifying || !readyToRecord}
              className="min-h-12 flex-1 shadow-cta"
            >
              <Mic className="h-5 w-5" />
              {t('recording.btnStart')}
            </Button>
          ) : (
            <Button type="button" size="lg" variant="danger" onClick={() => recorder.stopRecording()} className="min-h-12 flex-1">
              <Square className="h-5 w-5" />
              {t('recording.btnStop')}
            </Button>
          )}

          {recorder.isRecording && (
            <Button type="button" size="lg" variant="secondary" onClick={() => openBrowserPopup()} className="min-h-12">
              <PanelTopOpen className="h-5 w-5" />
              {t('recording.btnOverlay')}
            </Button>
          )}
        </div>

        <section className="rounded-xl border border-border-subtle bg-bg-surface/20">
          <button
            type="button"
            onClick={() => setShowOptions((open) => !open)}
            aria-expanded={showOptions}
            aria-controls="new-meeting-options"
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-xs font-semibold text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-text-muted" aria-hidden="true" />
              {lang === 'it' ? 'Opzioni meeting' : 'Meeting options'}
            </span>
            <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${showOptions ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showOptions && (
            <div id="new-meeting-options" className="flex flex-col gap-5 border-t border-border-subtle p-4">
              <Select
                label={lang === 'it' ? 'Audio da registrare' : 'Audio to record'}
                value={sourceMode}
                onChange={(event) => {
                  setSourceMode(event.target.value as 'both' | 'mic_only' | 'pc_only');
                  setPermissionError(null);
                }}
                disabled={recorder.isRecording}
              >
                {captureModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>

              <div className="flex flex-col gap-2">
                <Checkbox
                  variant="toggle"
                  label={t('settings.speakerDiarization')}
                  checked={speakerDiarizationEnabled}
                  disabled={Boolean(enrichmentSaving) || recorder.isRecording}
                  onChange={(event) => updateEnrichmentSetting('speaker_diarization_enabled', event.target.checked)}
                />
                <p className="pl-[52px] text-xs text-text-muted">{t('recording.diarizationInlineDesc')}</p>
              </div>

              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <Checkbox
                  variant="toggle"
                  label={t('settings.visualIntelligence')}
                  checked={visualIntelligenceEnabled}
                  disabled={Boolean(enrichmentSaving) || recorder.isRecording}
                  onChange={(event) => updateEnrichmentSetting('visual_intelligence_enabled', event.target.checked)}
                />

                {visualIntelligenceEnabled && nativeCaptureReady && (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <Select
                        label={t('recording.visualWindowLabel')}
                        value={selectedVisualWindowId}
                        onChange={(event) => {
                          setSelectedVisualWindowId(event.target.value);
                          setPermissionError(null);
                        }}
                        disabled={captureWindowsLoading || recorder.isRecording}
                      >
                        <option value="">
                          {captureWindowsLoading ? t('recording.visualWindowsLoading') : t('recording.visualWindowDisabled')}
                        </option>
                        {captureWindows.map((window) => (
                          <option key={window.id} value={window.id}>{captureWindowLabel(window)}</option>
                        ))}
                      </Select>
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={refreshCaptureWindows} disabled={captureWindowsLoading || recorder.isRecording}>
                      <RefreshCw className="h-4 w-4" />
                      {t('recording.visualWindowsRefresh')}
                    </Button>
                  </div>
                )}
                {visualIntelligenceEnabled && !nativeCaptureReady && (
                  <p className="text-xs text-warning">{t('recording.visualUnavailableDesc')}</p>
                )}
                {captureWindowsError && <p className="text-xs text-danger">{captureWindowsError}</p>}
                {visualIntelligenceEnabled && nativeCaptureReady && !captureWindowsLoading && !captureWindowsError && captureWindows.length === 0 && (
                  <p className="text-xs text-warning">{t('recording.visualWindowsEmpty')}</p>
                )}
                {visualIntelligenceEnabled && (
                  <p className="text-xs text-text-muted">{t('recording.visualModelDesc', { model: visualModel || t('common.notAvailable') })}</p>
                )}
                {visualIntelligenceEnabled && !speakerDiarizationEnabled && (
                  <p className="text-xs text-warning">{t('recording.visualNeedsDiarization')}</p>
                )}
              </div>

              {!nativeCaptureReady && nativeCaptureChecked && (
                <div className="grid grid-cols-1 gap-4 border-t border-border-subtle pt-4 sm:grid-cols-2">
                  {sourceMode !== 'pc_only' && (
                    <Select
                      label={t('recording.microphoneLabel')}
                      value={recorder.selectedMicrophone}
                      onChange={(event) => recorder.setSelectedMicrophone(event.target.value)}
                      disabled={recorder.isRecording}
                    >
                      <option value="">{t('recording.microphoneDefault')}</option>
                      {recorder.microphones.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>
                      ))}
                    </Select>
                  )}
                  {sourceMode !== 'mic_only' && (
                    <Select
                      label={t('recording.systemAudioLabel')}
                      value={recorder.selectedSystemDevice}
                      onChange={(event) => recorder.setSelectedSystemDevice(event.target.value)}
                      disabled={recorder.isRecording}
                    >
                      <option value="">{t('recording.systemAudioDefault')}</option>
                      {recorder.systemDevices.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>{device.label || device.deviceId}</option>
                      ))}
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border-subtle bg-bg-surface/20">
          <button
            type="button"
            onClick={() => setShowDiagnostics((open) => !open)}
            aria-expanded={showDiagnostics}
            aria-controls="new-meeting-diagnostics"
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-xs font-semibold text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
          >
            <span className="inline-flex items-center gap-2">
              <Bug className="h-4 w-4" aria-hidden="true" />
              {lang === 'it' ? 'Diagnostica' : 'Diagnostics'}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${showDiagnostics ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>

          {showDiagnostics && (
            <div id="new-meeting-diagnostics" className="flex flex-col gap-4 border-t border-border-subtle p-4 text-xs text-text-secondary">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Capture</span>
                  <strong className="mt-1 block text-text-primary">{nativeCaptureReady ? 'Native' : 'Browser fallback'}</strong>
                  {!nativeCaptureReady && nativeCaptureChecked && <p className="mt-1 text-warning">{nativeCaptureUnavailableMessage}</p>}
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-text-muted">Storage</span>
                  <strong className="mt-1 block break-all font-mono text-text-primary">{recordingsDir || t('common.notAvailable')}</strong>
                </div>
              </div>

              {nativeCaptureReady && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                    <span className="text-text-muted">{lang === 'it' ? 'Microfono' : 'Microphone'}</span>
                    <strong className="mt-1 block text-text-primary">{recorder.capturePermissions?.microphone || 'unknown'}</strong>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                    <span className="text-text-muted">Screen Capture</span>
                    <strong className="mt-1 block text-text-primary">{recorder.capturePermissions?.screen_capture || 'unknown'}</strong>
                  </div>
                </div>
              )}

              {recorder.permissionsErrorDetails && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 font-mono text-[11px] text-text-secondary">
                  <div><strong className="text-text-primary">Executable:</strong> {recorder.permissionsErrorDetails.executable_path || 'N/A'}</div>
                  <div className="mt-1"><strong className="text-text-primary">Bundle:</strong> {recorder.permissionsErrorDetails.bundle_identifier || 'N/A'}</div>
                  <div className="mt-1"><strong className="text-text-primary">Signature:</strong> {recorder.permissionsErrorDetails.code_signature || 'unknown'}</div>
                  <div className="mt-1"><strong className="text-text-primary">Identifier:</strong> {recorder.permissionsErrorDetails.identifier || 'N/A'}</div>
                </div>
              )}

              {!nativeCaptureReady && recorder.audioRouteStatus && (
                <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                  <div><strong className="text-text-primary">Audio route:</strong> {recorder.audioRouteStatus.ready_to_record ? 'ready' : 'not ready'}</div>
                  {recorder.audioRouteStatus.physical_output && <div className="mt-1">Output: {recorder.audioRouteStatus.physical_output}</div>}
                  {recorder.audioRouteStatus.missing && recorder.audioRouteStatus.missing.length > 0 && (
                    <div className="mt-1 text-warning">Missing: {recorder.audioRouteStatus.missing.join(', ')}</div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => recorder.verifyAudioSetup()} isLoading={recorder.isVerifying}>
                  <RefreshCw className="h-4 w-4" />
                  {t('recording.verifyConfig')}
                </Button>
                {nativeCaptureReady && (
                  <Button type="button" size="sm" variant="secondary" onClick={handleAuthorizeCapture} isLoading={permissionLoading}>
                    <Info className="h-4 w-4" />
                    {t('recording.authorizeCapture')}
                  </Button>
                )}
                {!nativeCaptureReady && (
                  <Button type="button" size="sm" variant="secondary" onClick={() => recorder.toggleTestAudioRoute()} isLoading={recorder.isVerifying}>
                    <Monitor className="h-4 w-4" />
                    {recorder.isTestRouted ? t('recording.restoreRoute') : t('recording.testRoute')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
      </Card>

      <p className="text-center text-xs text-text-muted">
        {lang === 'it'
          ? 'Dopo lo stop, ClosedRoom apre il meeting e ti guida alla trascrizione.'
          : 'After you stop, ClosedRoom opens the meeting and guides you to transcription.'}
      </p>
    </div>
  );
}
