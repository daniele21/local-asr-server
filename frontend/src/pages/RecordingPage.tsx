import { useState, useEffect } from 'react';
import { ApiClient, ProjectItem, Recording } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { useRecorder, openBrowserPopup } from '../hooks/useRecorder';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { ProjectPromptModal } from '../components/ui/ProjectPromptModal';
import { formatBytes, formatProjectDate } from '../utils/formatters';

interface RecordingPageProps {
  detailId: string | null;
  navigateTo: (page: string, detail?: string | null) => void;
}

export default function RecordingPage({ detailId, navigateTo }: RecordingPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [projectDetail, setProjectDetail] = useState<ProjectItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');

  // New Recording Form State
  const [title, setTitle] = useState('');
  const [projectName, setProjectName] = useState('');
  const [sourceMode, setSourceMode] = useState<'both' | 'mic_only' | 'pc_only'>('both');
  const [recordingsDir, setRecordingsDir] = useState('');

  // Project suggestions (datalist)
  const [projectsList, setProjectsList] = useState<string[]>([]);
  const [showAdvancedAudio, setShowAdvancedAudio] = useState(false);
  const [showSetupInfo, setShowSetupInfo] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

  const onRecordingSaved = (recording: Recording) => {
    // Navigate directly to the project view
    navigateTo('recording', recording.id);
  };

  const recorder = useRecorder(onRecordingSaved);

  // Load Settings for recordings directory
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await ApiClient.getSettings();
        setRecordingsDir(settings.recordings_dir || '');
        
        const projs = await ApiClient.listProjects();
        setProjectsList(
          (projs.items || [])
            .filter((p) => !p.is_unassigned)
            .map((p) => p.name)
        );
      } catch {}
    };
    loadSettings();
  }, []);

  // Load Project Detail if detailId is provided
  useEffect(() => {
    const loadProjectDetail = async () => {
      if (!detailId) {
        setProjectDetail(null);
        return;
      }
      try {
        setDetailLoading(true);
        const data = await ApiClient.recordingProject(detailId);
        setProjectDetail(data);
      } catch (err: any) {
        showToast(err.message || 'Errore nel caricamento dei dettagli del progetto', 'error');
        navigateTo('recording');
      } finally {
        setDetailLoading(false);
      }
    };
    loadProjectDetail();
  }, [detailId, navigateTo, showToast]);

  const handleConfirmProject = async (newProj: string) => {
    if (!projectDetail) return;
    try {
      await ApiClient.updateRecording(projectDetail.recording.id, { project_name: newProj });
      showToast('Progetto aggiornato!', 'success');
      const updated = await ApiClient.recordingProject(projectDetail.recording.id);
      setProjectDetail(updated);
      setIsProjectModalOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Errore durante l\'aggiornamento del progetto', 'error');
    }
  };

  const handleSaveTitle = async () => {
    if (!projectDetail) return;
    const cleanTitle = editTitleValue.trim();
    if (!cleanTitle) {
      showToast(t('transcription.titleEmptyError') || 'Il titolo non può essere vuoto', 'error');
      return;
    }
    try {
      await ApiClient.updateRecording(projectDetail.recording.id, { title: cleanTitle });
      showToast(t('transcription.titleSaveSuccess') || 'Titolo aggiornato!', 'success');
      setIsEditingTitle(false);
      const updated = await ApiClient.recordingProject(projectDetail.recording.id);
      setProjectDetail(updated);
    } catch (err: any) {
      showToast(t('transcription.titleSaveError', { error: err.message }) || 'Impossibile salvare il titolo', 'error');
    }
  };

  const handleSaveSettings = async () => {
    try {
      await ApiClient.updateSettings({ recordings_dir: recordingsDir.trim() });
      showToast(t('transcription.saveSuccessAudioDir'), 'success');
    } catch (err: any) {
      showToast(err.message || 'Impossibile salvare la directory', 'error');
    }
  };

  const handleBrowseDir = async () => {
    try {
      const result = await ApiClient.selectDirectory();
      if (result && result.path) {
        setRecordingsDir(result.path);
        showToast(t('transcription.browseSelectDir'), 'info');
      }
    } catch (err: any) {
      showToast(err.message || t('transcription.browseError'), 'error');
    }
  };



  // 1. NESTED PROJECT DETAIL VIEW
  if (detailId && projectDetail) {
    const recording = projectDetail.recording;
    const transcription = projectDetail.transcription;
    const analysis = projectDetail.analysis;

    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-3 gap-2">
          <div>
            <span className="text-[10px] font-bold text-accent tracking-wider uppercase">RECORDINGS</span>
            {isEditingTitle ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  className="px-3 py-1.5 bg-bg-surface border border-border-focus rounded-lg text-sm focus:outline-none text-text-primary font-bold text-xl"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  maxLength={200}
                />
                <Button size="sm" onClick={handleSaveTitle}>
                  Salva
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingTitle(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1">
                <h2 className="text-2xl font-bold text-text-primary">{recording.title}</h2>
                <button
                  onClick={() => {
                    setIsEditingTitle(true);
                    setEditTitleValue(recording.title);
                  }}
                  className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                  title="Rinomina"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4">
                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </div>
            )}
            <p className="text-xs text-text-secondary mt-1">
              {formatProjectDate(recording.created_at, lang)} · {formatBytes(recording.bytes_written || 0)}
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigateTo('recording')}>
            {t('recording.btnBackToRecording')}
          </Button>
        </div>

        {detailLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Audio card */}
            <Card className="flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-accent font-bold">01</span>
                  <h3 className="text-sm font-bold text-text-primary">Audio</h3>
                </div>
                <audio
                  controls
                  src={`/v1/recordings/${recording.id}/audio`}
                  className="w-full mt-2"
                ></audio>
                <p className="text-xs text-text-secondary mt-2 truncate">
                  {recording.audio_file || 'Audio locale'}
                </p>
                {recording.audio_tracks && recording.audio_tracks.length > 1 && (
                  <div className="flex flex-col gap-2 mt-2">
                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
                      Tracce sorgente
                    </span>
                    {recording.audio_tracks
                      .filter((track) => !track.primary)
                      .map((track) => (
                        <div key={track.id} className="flex flex-col gap-1.5 p-2 rounded-lg border border-border-subtle/70 bg-bg-surface/40">
                          <div className="flex items-center justify-between text-[10px] text-text-secondary font-bold uppercase tracking-wider">
                            <span>{track.source === 'mic' ? '🎙️' : '🖥️'} {track.label}</span>
                            <span>{formatBytes(track.bytes_written || 0)}</span>
                          </div>
                          <audio
                            controls
                            src={`/v1/recordings/${recording.id}/tracks/${track.id}/audio`}
                            className="w-full h-8"
                          />
                        </div>
                      ))}
                  </div>
                )}
                <p className="text-xs text-text-secondary">
                  <strong>Progetto:</strong> {recording.project_name || 'Senza progetto'}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => setIsProjectModalOpen(true)}
              >
                Cambia progetto
              </Button>
            </Card>

            {/* Transcription card */}
            <Card className="flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-accent font-bold">02</span>
                  <h3 className="text-sm font-bold text-text-primary">{t('projects.transcription')}</h3>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed mt-2 line-clamp-5">
                  {transcription ? transcription.text : 'Nessuna trascrizione collegata.'}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  if (transcription) {
                    navigateTo('transcription', transcription.id);
                  } else {
                    navigateTo('transcription', `file-${recording.id}`);
                  }
                }}
              >
                {transcription ? 'Apri trascrizione' : 'Trascrivi audio'}
              </Button>
            </Card>

            {/* Analysis card */}
            <Card className="flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-accent font-bold">03</span>
                  <h3 className="text-sm font-bold text-text-primary">{t('projects.analysis')}</h3>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed mt-2 line-clamp-5">
                  {analysis ? (analysis.summary || analysis.title || 'Analisi disponibile.') : 'Nessuna analisi collegata.'}
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={!transcription}
                onClick={() => {
                  if (analysis) {
                    navigateTo('analysis', transcription.id);
                  } else {
                    navigateTo('analysis', transcription.id);
                  }
                }}
              >
                {analysis ? 'Apri analisi' : 'Genera analisi'}
              </Button>
            </Card>
          </div>
        )}
        <ProjectPromptModal
          isOpen={isProjectModalOpen}
          initialValue={recording.project_name || ''}
          onConfirm={handleConfirmProject}
          onCancel={() => setIsProjectModalOpen(false)}
          existingProjects={projectsList}
        />
      </div>
    );
  }

  // 2. RECORDER DASHBOARD VIEW
  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border-subtle pb-3">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('recording.title')}</span>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{t('recording.panelTitle')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('recording.panelDesc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Controls Panel */}
        <Card className="lg:col-span-2 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              {t('recording.recordingLocal')}
            </h3>
            <Badge variant={recorder.isRecording ? 'online' : 'idle'} pulse={recorder.isRecording}>
              {recorder.statusText}
            </Badge>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label={t('recording.formTitleLabel')}
                placeholder={t('recording.formTitlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={recorder.isRecording}
              />

              <div className="flex flex-col gap-1.5 w-full relative">
                <label htmlFor="recording-project" className="text-sm font-medium text-text-secondary">
                  {t('recording.formProjectLabel')}
                </label>
                <input
                  id="recording-project"
                  type="text"
                  list="projects-datalist"
                  placeholder={t('recording.formProjectPlaceholder') || 'Nome progetto o meeting'}
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={recorder.isRecording}
                  className="px-4 py-2 bg-bg-surface border border-border-subtle rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-all duration-150 disabled:opacity-50"
                />
                <datalist id="projects-datalist">
                  {projectsList.map((p, idx) => (
                    <option key={idx} value={p} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Signal panel & timer */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-bg-surface border border-border-subtle rounded-xl gap-4">
              <div className="flex items-center gap-4">
                <span className={`w-3.5 h-3.5 rounded-full bg-danger shadow-[0_0_8px_var(--danger)] ${recorder.isRecording ? 'animate-pulse' : 'opacity-40'}`}></span>
                <span className="text-3xl font-mono font-bold">{recorder.timer}</span>
              </div>
              <div className="text-xs text-text-secondary text-right">
                <span className="block font-medium">{recorder.progressText}</span>
                <span className="block text-text-muted mt-0.5">{t('recording.signalInput')}: <strong>{recorder.signalLevel}</strong></span>
              </div>
            </div>

            {/* Canvas Meter */}
            <div className="relative w-full h-40 bg-bg-surface border border-border-subtle rounded-xl overflow-hidden">
              <canvas
                ref={recorder.canvasRef}
                width="960"
                height="240"
                className="w-full h-full object-cover"
              ></canvas>
              <div className="absolute bottom-2 right-4 flex gap-4 text-[10px] text-text-muted select-none">
                <span>-48</span><span>-36</span><span>-24</span><span>-12</span><span>-6</span><span>0 dB</span>
              </div>
            </div>

            {/* Controls Actions */}
            <div className="flex flex-wrap gap-4 mt-2">
              {!recorder.isRecording ? (
                <>
                  <Button
                    size="lg"
                    className="flex-1 min-w-[200px]"
                    onClick={() => recorder.startRecording(title, projectName, '', sourceMode)}
                    disabled={recorder.isVerifying}
                  >
                    🎙️ {t('recording.btnStart')}
                  </Button>
                   <Button
                    size="lg"
                    variant="secondary"
                    className="px-4"
                    onClick={async () => {
                      try {
                        const res = await ApiClient.toggleOverlay(true);
                        if (!res.success) openBrowserPopup();
                      } catch {
                        openBrowserPopup();
                      }
                    }}
                    title="Mostra la miniatura fluttuante di registrazione"
                  >
                    🖥️ {t('recording.btnShowOverlay') || 'Miniatura'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    variant="danger"
                    className="flex-1 min-w-[200px]"
                    onClick={recorder.stopRecording}
                  >
                    ⏹ {t('recording.btnStop')}
                  </Button>
                   <Button
                    size="lg"
                    variant="secondary"
                    className="px-4"
                    onClick={async () => {
                      try {
                        const res = await ApiClient.toggleOverlay(true);
                        if (!res.success) openBrowserPopup();
                      } catch {
                        openBrowserPopup();
                      }
                    }}
                    title="Mostra la miniatura fluttuante di registrazione"
                  >
                    🖥️ {t('recording.btnShowOverlay') || 'Miniatura'}
                  </Button>
                </>
              )}
            </div>

            {/* Advanced configurations collapsible */}
            <div className="border border-border-subtle rounded-xl overflow-hidden mt-2">
              <button
                type="button"
                onClick={() => setShowAdvancedAudio(!showAdvancedAudio)}
                className="w-full p-4 flex items-center justify-between text-sm font-semibold text-text-primary bg-bg-surface/30 cursor-pointer"
              >
                <span>⚙️ {t('recording.advancedAudioConfig')}</span>
                <span className={`transform transition-transform ${showAdvancedAudio ? 'rotate-180' : ''}`}>▼</span>
              </button>

              {showAdvancedAudio && (
                <div className="p-4 flex flex-col gap-4 border-t border-border-subtle bg-bg-surface/10 animate-in fade-in duration-200">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label={t('recording.microphone')}
                      value={recorder.selectedMicrophone}
                      onChange={(e) => recorder.setSelectedMicrophone(e.target.value)}
                    >
                      <option value="">{t('recording.deviceAuto')}</option>
                      {recorder.microphones.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label}
                        </option>
                      ))}
                    </Select>

                    <Select
                      label={t('recording.computerAudio')}
                      value={recorder.selectedSystemDevice}
                      onChange={(e) => recorder.setSelectedSystemDevice(e.target.value)}
                    >
                      {recorder.systemDevices.length === 0 ? (
                        <option value="">{t('recording.searchingBlackhole')}</option>
                      ) : (
                        recorder.systemDevices.map((d) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label}
                          </option>
                        ))
                      )}
                    </Select>
                  </div>

                  <Select
                    label="Modalità di acquisizione"
                    value={sourceMode}
                    onChange={(e) => setSourceMode(e.target.value as any)}
                  >
                    <option value="both">Voce + Audio computer (Aggregate)</option>
                    <option value="mic_only">Solo Voce (Microfono)</option>
                    <option value="pc_only">Solo Audio computer (BlackHole)</option>
                  </Select>

                  <div className="flex gap-3 mt-1">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={recorder.toggleTestAudioRoute}
                      disabled={recorder.isVerifying}
                    >
                      {recorder.isTestRouted ? t('recording.btnRestoreOriginalAudio') : t('recording.testAudioRoute')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowSetupInfo(true)}
                    >
                      ℹ️ Info Routing
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Right column: Storage settings */}
        <div className="flex flex-col gap-6">
          {/* Readiness check panel */}
          <Card className="flex flex-col gap-3.5 border-border-subtle/50">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border-subtle pb-2">
              {t('recording.audioSetupTitle')}
            </h3>

            <div className="flex items-start gap-3 mt-1">
              <span className="text-xl">
                {recorder.audioRouteStatus?.ready_to_record ? '✅' : '⚠️'}
              </span>
              <div className="flex flex-col leading-snug">
                <strong className="text-xs text-text-primary font-bold">
                  {recorder.audioRouteStatus?.ready_to_record ? t('recording.audioSetupTitleReady') : t('recording.configRequiredStatus')}
                </strong>
                <span className="text-[11px] text-text-secondary mt-1">
                  {recorder.audioRouteStatus?.ready_to_record ? t('recording.readyConfigStatus') : t('recording.verifyConfigRequiredStatus')}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={recorder.verifyAudioSetup}
              disabled={recorder.isVerifying}
              className="mt-2"
            >
              🔄 {t('recording.btnVerifyConfig')}
            </Button>
          </Card>

          {/* Folder storage settings card */}
          <Card className="flex flex-col gap-4">
            <div className="border-b border-border-subtle pb-2">
              <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                {t('recording.storageConfigTitle')}
              </h3>
              <p className="text-[10px] text-text-muted mt-0.5">{t('recording.storageConfigDesc')}</p>
            </div>

            <div className="flex flex-col gap-3">
              <Input
                value={recordingsDir}
                onChange={(e) => setRecordingsDir(e.target.value)}
                placeholder={t('recording.storagePlaceholder')}
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={handleBrowseDir}>
                  {t('settings.btnBrowse')}
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSaveSettings}>
                  {t('transcription.save')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Helper Dialog / Setup modal panel */}
      {showSetupInfo && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                {t('recording.computerAudioHeading')}
              </h3>
              <button
                onClick={() => setShowSetupInfo(false)}
                className="text-text-muted hover:text-text-primary text-xl cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="text-xs leading-relaxed text-text-secondary flex flex-col gap-3">
              <p>{t('recording.audioSetupIntro')}</p>
              <p><strong>{t('recording.audioSetupStepsTitle')}</strong></p>
              <ol className="list-decimal pl-5 flex flex-col gap-1.5 font-medium">
                <li>{t('recording.audioSetupStep1')}</li>
                <li>{t('recording.audioSetupStep2')}</li>
                <li>{t('recording.audioSetupStep3')}</li>
                <li>{t('recording.audioSetupStep4')}</li>
              </ol>
              <p className="text-[10px] text-text-muted border-t border-border-subtle/50 pt-2 mt-1">
                {t('recording.blackholeRequirement')}
              </p>
            </div>

            <Button onClick={() => setShowSetupInfo(false)} className="w-full mt-2">
              {t('common.cancel')}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
