import { useEffect, useMemo, useState, useRef } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Info,
  ListChecks,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { ApiClient, AnalysisRun, Meeting, MeetingDiagnostics } from '../api/apiClient';
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_ORDER } from '../api/config';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { AdvancedDetailsAccordion } from '../components/workspace/MeetingWorkspace';
import { renderMarkdown } from '../utils/markdown';
import { formatBytes, formatProjectDate, getDurationSeconds } from '../utils/formatters';
import { useTranslation } from '../i18n/i18n';
import { getDemoMeetings } from '../features/demo/demoData';
import { AnalysisSetupModal, AnalysisSetupSelection } from '../components/ui/AnalysisSetupModal';
import { Sheet, SheetContent, SheetHeader, SheetBody } from '../components/ui/Sheet';
import { cn } from '../utils/cn';
import { formatJobProgress } from '../utils/jobs';
import { VisualIntelligencePanel } from '../components/meeting/VisualIntelligencePanel';
import { VisualDebugPanel } from '../components/meeting/VisualDebugPanel';
import { useVisualIntelligence } from '../hooks/useVisualIntelligence';
import { recordingTranscriptionRoute } from '../utils/transcriptionRoute';
import { SpeakerDiarizationEditor } from '../components/meeting/SpeakerDiarizationEditor';
import TranscriptTextView from '../components/transcription/TranscriptTextView';

interface MeetingDetailPageProps {
  recordingId: string | null;
  navigateTo: (page: string, detail?: string | null) => void;
  demoMode?: boolean;
}

const activeJobStatuses = new Set(['queued', 'running', 'waiting_for_service', 'retrying', 'cancelling']);

function runMarkdown(run: AnalysisRun): string {
  return run.result_markdown || run.result?.markdown || '';
}

function analysisLabel(type: string): string {
  return ANALYSIS_TYPE_LABELS[type] || type;
}

export default function MeetingDetailPage({ recordingId, navigateTo, demoMode = false }: MeetingDetailPageProps) {
  const { t, lang } = useTranslation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [diagnosticReport, setDiagnosticReport] = useState<MeetingDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedAnalysisType, setSelectedAnalysisType] = useState('meeting_brief');
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [analysisSetupOpen, setAnalysisSetupOpen] = useState(false);
  const [analysisPipelineTarget, setAnalysisPipelineTarget] = useState('meeting_default');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [activeTab, setActiveTab] = useState<'transcript' | 'analysis' | 'speakers'>('transcript');
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleTimestampClick = (time: number) => {
    setShowAudioPlayer(true);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.currentTime = time;
        audioRef.current.play().catch(() => {});
      }
    }, 100);
  };
  const visualEnabled = meeting?.transcription?.stats?.visual_intelligence?.version === 2;
  const { data: visualData, loading: visualLoading, error: visualError } = useVisualIntelligence(
    demoMode ? null : recordingId, visualEnabled,
  );


  const load = async () => {
    if (!recordingId) return;
    try {
      setError(null);
      let data: Meeting;
      if (demoMode) {
        const demoMeetings = getDemoMeetings(lang);
        const matched = demoMeetings.find((m) => m.id === recordingId);
        if (!matched) {
          throw new Error(t('meeting.errorNotFound'));
        }
        data = matched;
        setDiagnosticReport(null);
      } else {
        const [meetingData, diagnosticsData] = await Promise.all([
          ApiClient.getMeeting(recordingId),
          ApiClient.getMeetingDiagnostics(recordingId),
        ]);
        data = meetingData;
        setDiagnosticReport(diagnosticsData);
      }
      setMeeting(data);
      const availableTypes = Object.keys(data.latest_analysis || {});
      if (availableTypes.length > 0 && !data.latest_analysis[selectedAnalysisType]) {
        setSelectedAnalysisType(availableTypes[0]);
      }
    } catch (err: any) {
      setError(err?.message || t('meeting.errorNotAvailable'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [recordingId, demoMode, lang]);

  const activeJobs = useMemo(
    () => (meeting?.jobs || []).filter((job) => activeJobStatuses.has(job.status)),
    [meeting],
  );

  const isBusy = activeJobs.length > 0 || (meeting?.analysis_runs || []).some((run) => activeJobStatuses.has(run.status));

  useEffect(() => {
    if (!meeting) return;
    const hasActiveRun = meeting.analysis_runs.some((run) => activeJobStatuses.has(run.status));
    if (!hasActiveRun && activeJobs.length === 0) return;
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [meeting?.id, activeJobs.length, meeting?.analysis_runs.length]);

  const openTranscriptionWorkflow = () => {
    if (!meeting || demoMode || isBusy) return;
    navigateTo(
      'transcription',
      recordingTranscriptionRoute(meeting.id, meeting.transcription ? 'retranscribe' : 'transcribe'),
    );
  };

  const openAnalysisSetup = (pipelineId = 'meeting_default') => {
    setAnalysisPipelineTarget(pipelineId);
    setAnalysisSetupOpen(true);
  };

  const startPipeline = async (pipelineId = 'meeting_default', selection: AnalysisSetupSelection = {}) => {
    if (!meeting) return;
    if (demoMode) return;
    setBusyAction(pipelineId);
    try {
      await ApiClient.createAnalysisPipeline({
        recording_id: meeting.id,
        transcription_id: meeting.transcription?.id,
        pipeline_id: pipelineId,
        ...selection,
      });
      window.setTimeout(load, 700);
    } catch (err: any) {
      setError(err?.message || t('meeting.errorPipelineNotStarted'));
    } finally {
      setBusyAction(null);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (demoMode) return;
    try {
      await ApiClient.cancelJob(jobId);
      load();
    } catch (err: any) {
      setError(err?.message || (lang === 'it' ? 'Impossibile annullare il job' : 'Failed to cancel job'));
    }
  };

  if (!recordingId) {
    return (
      <div className="border border-border-subtle rounded-lg p-8 text-center">
        <p className="text-text-secondary">{t('meeting.selectMeetingFromToday')}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigateTo('home')}>{t('meeting.backToToday')}</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <span className="text-sm text-text-secondary">{t('meeting.loadingMeeting')}</span>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="border border-border-subtle rounded-lg p-8 text-center">
        <p className="text-danger">{error || t('meeting.errorNotFound')}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigateTo('home')}>{t('meeting.backToToday')}</Button>
      </div>
    );
  }

  const title = meeting.recording.title || `Meeting ${meeting.id.slice(0, 8)}`;
  const analysisTypes = Array.from(new Set([
    ...ANALYSIS_TYPE_ORDER,
    ...meeting.analysis_runs.map((run) => run.analysis_type),
  ])).filter((type) => type !== 'custom_question' || meeting.latest_analysis[type]);
  const selectedRun = meeting.latest_analysis?.[selectedAnalysisType];
  const selectedHistory = meeting.analysis_runs.filter((run) => run.analysis_type === selectedAnalysisType);
  const recordingDuration = getDurationSeconds(meeting.recording);
  const canAnalyze = Boolean(meeting.transcription) && !demoMode;
  const diarization = meeting.transcription?.stats?.speaker_diarization;
  const visualIntelligence = meeting.transcription?.stats?.visual_intelligence;
  const diagnostics = diagnosticReport?.diagnostics || meeting.transcription?.stats?.diagnostics || [];
  const outcomeStatus = diagnosticReport?.outcome_status || meeting.transcription?.stats?.outcome_status;
  const diagnosticWarnings = diagnostics.filter((item) =>
    item.status === 'failed' || item.status === 'degraded' || item.fallback_used,
  );
  const acceptedSpeakerMappings = (meeting.transcription?.stats?.speaker_attribution?.mappings || [])
    .filter((mapping) => mapping.status === 'accepted' && mapping.display_name);
  const speakerMappings = meeting.transcription?.stats?.speaker_attribution?.mappings || [];

  const enrichmentBadge = (status?: string) => {
    if (status === 'completed') return <Badge variant="success">{t('meeting.enrichmentCompleted')}</Badge>;
    if (status === 'failed' || status === 'degraded' || status === 'completed_with_warnings') {
      return <Badge variant="warning">{t('meeting.enrichmentFailed')}</Badge>;
    }
    return <Badge variant="idle">{t('meeting.enrichmentUnavailable')}</Badge>;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Redesigned Header Block */}
      <section className="flex flex-col gap-4 border-b border-border-subtle pb-4">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigateTo('home')}
            className="inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('dashboard.title')}</span>
          </button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold text-text-primary tracking-tight truncate">{title}</h2>
              {meeting.project_name && (
                <span className="rounded-md border border-border-subtle bg-bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted">
                  {meeting.project_name}
                </span>
              )}
              <Badge variant={meeting.status === 'ready' ? 'success' : meeting.status === 'analyzing' ? 'warning' : 'idle'}>
                {meeting.status}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span>{formatProjectDate(meeting.created_at, lang)}</span>
              <span>•</span>
              <span>{recordingDuration > 0 ? `${Math.round(recordingDuration / 60)} min` : t('projects.durationNotAvailable')}</span>
              <span>•</span>
              <span>{formatBytes(meeting.recording.bytes_written || 0)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 mt-2 sm:mt-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAudioPlayer((prev) => !prev)}
              className={cn("h-8 px-2.5", showAudioPlayer && "bg-bg-hover text-text-primary")}
            >
              <PlayCircle className="w-4 h-4 text-accent" />
              <span>{t('meeting.audioTitle')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={load} className="h-8 px-2.5">
              <RefreshCw className="w-4 h-4" />
              <span>{t('meeting.btnUpdate')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)} className="h-8 px-2.5">
              <Info className="w-4 h-4 text-text-muted" />
              <span>{lang === 'it' ? 'Dettagli' : 'Details'}</span>
            </Button>
          </div>
        </div>

        {/* Inline Toggleable Audio Player */}
        {showAudioPlayer && (
          <div className="workspace-panel rounded-xl border border-border-subtle p-3.5 animate-in slide-in-from-top-3 duration-250">
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <PlayCircle className="h-3.5 h-3.5 text-accent" />
                {t('meeting.audioTitle')}
              </span>
              <button
                onClick={() => setShowAudioPlayer(false)}
                className="text-[10px] text-text-muted hover:text-text-primary transition-colors font-semibold cursor-pointer"
              >
                {lang === 'it' ? 'Nascondi' : 'Hide'}
              </button>
            </div>
            <audio
              ref={audioRef}
              controls
              src={`/v1/recordings/${meeting.id}/audio`}
              className="h-9 w-full"
              autoPlay
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          </div>
        )}
      </section>

      {outcomeStatus === 'completed_with_warnings' && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-text-secondary">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-warning">{t('meeting.completedWithWarnings')}</p>
              <p className="mt-1">{t('meeting.completedWithWarningsDesc')}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
              {t('meeting.showDiagnostics')}
            </Button>
          </div>
        </section>
      )}

      {/* Busy / Processing State */}
      {(activeJobs.length > 0 || meeting.analysis_runs.some((run) => activeJobStatuses.has(run.status))) && (
        <section className="border border-warning/30 bg-warning/5 rounded-xl px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary shrink-0">
              <Clock3 className="w-4 h-4 text-warning" />
              <span>{t('meeting.processingTitle')}</span>
            </div>

            {diagnostics.length > 0 && (
              <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">
                  {t('meeting.diagnosticsTitle')}
                </h4>
                <div className="flex flex-col gap-3">
                  {diagnostics.map((item, index) => (
                    <div key={`${item.component}-${index}`} className="border-b border-border-subtle pb-3 last:border-0 last:pb-0 text-xs">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-text-primary">{item.component}</span>
                        {enrichmentBadge(item.status)}
                      </div>
                      {(item.requested_backend || item.actual_backend) && (
                        <p className="mt-1 text-text-muted font-mono break-all">
                          {item.requested_backend || '—'} → {item.actual_backend || '—'}
                        </p>
                      )}
                      {(item.fallback_used || item.fallback_reason) && (
                        <p className="mt-1 text-warning">{t('meeting.fallbackLabel')}: {item.fallback_reason || 'fallback'}</p>
                      )}
                      {item.error && <p className="mt-1 text-danger break-words">{item.error}</p>}
                      {Boolean(item.details?.model_path) && (
                        <p className="mt-1 text-text-muted font-mono break-all">
                          {t('meeting.modelPathLabel')}: {String(item.details?.model_path)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {diagnosticWarnings.length === 0 && (
                  <p className="mt-3 text-xs text-text-muted">{t('meeting.noDiagnosticWarnings')}</p>
                )}
                {diagnosticReport?.log_file && (
                  <div className="mt-4 border-t border-border-subtle pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{t('meeting.logFileLabel')}</p>
                    <button
                      type="button"
                      className="mt-1 text-left text-xs font-mono text-accent hover:underline break-all"
                      onClick={() => navigator.clipboard?.writeText(diagnosticReport.log_file || '')}
                      title={t('meeting.copyLogPath')}
                    >
                      {diagnosticReport.log_file}
                    </button>
                    {diagnosticReport.log_lines.length > 0 && (
                      <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-bg-elevated p-2 text-[10px] text-text-muted">
                        {diagnosticReport.log_lines.join('\n')}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-secondary">
              {activeJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{job.type}: {formatJobProgress(job, t)}</span>
                  <button
                    type="button"
                    onClick={() => handleCancelJob(job.id)}
                    className="text-danger hover:text-danger-hover transition-colors font-semibold text-[11px] flex items-center gap-1 cursor-pointer bg-danger/10 hover:bg-danger/20 px-2 py-0.5 rounded"
                  >
                    <XCircle className="w-3 h-3" />
                    {t('common.cancel')}
                  </button>
                </div>
              ))}
              {meeting.analysis_runs.filter((run) => activeJobStatuses.has(run.status)).map((run) => (
                <div key={run.id} className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{analysisLabel(run.analysis_type)}: {run.status}</span>
                  {run.job_id && (
                    <button
                      type="button"
                      onClick={() => handleCancelJob(run.job_id!)}
                      className="text-danger hover:text-danger-hover transition-colors font-semibold text-[11px] flex items-center gap-1 cursor-pointer bg-danger/10 hover:bg-danger/20 px-2 py-0.5 rounded"
                    >
                      <XCircle className="w-3 h-3" />
                      {t('common.cancel')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Main Single Column Layout */}
      <div className="flex flex-col gap-5 w-full">
        {/* Next Step Contestual CTA Banners */}
        {!isBusy && !meeting.transcription && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-warning/25 bg-warning/5">
            <div className="flex items-start gap-2.5 min-w-0">
              <FileText className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-text-primary">{lang === 'it' ? 'Passo successivo: Trascrizione' : 'Next Step: Transcription'}</h4>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">{t('meeting.transcribeDescription')}</p>
              </div>
            </div>
            <Button
              size="sm"
              disabled={demoMode}
              onClick={openTranscriptionWorkflow}
              className="shrink-0 w-full sm:w-auto shadow-cta"
            >
              <FileText className="h-4 w-4" />
              {t('meeting.btnTranscribe')}
            </Button>
          </div>
        )}

        {!isBusy && meeting.transcription && Object.keys(meeting.latest_analysis || {}).length === 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-accent/25 bg-accent-soft">
            <div className="flex items-start gap-2.5 min-w-0">
              <Sparkles className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-text-primary">{lang === 'it' ? 'Passo successivo: Analisi AI' : 'Next Step: AI Analysis'}</h4>
                <p className="text-[11px] text-text-secondary leading-relaxed mt-0.5">{t('meeting.analyzeDescription')}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <Button
                size="sm"
                onClick={() => openAnalysisSetup('meeting_default')}
                isLoading={busyAction === 'meeting_default'}
                className="flex-1 sm:flex-none shadow-cta animate-pulse"
              >
                <Sparkles className="h-4 w-4" />
                {t('meeting.btnAnalyze')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openAnalysisSetup('meeting_deep')}
                isLoading={busyAction === 'meeting_deep'}
                className="flex-1 sm:flex-none"
              >
                <ListChecks className="h-4 w-4" />
                {t('meeting.btnDeep')}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-fade-in">
            {error}
          </div>
        )}

        {/* Content Section: Analysis Card (Full Width) */}
        <main className="flex flex-col gap-5 w-full">
          {/* Tab bar */}
          <div className="flex border border-border-subtle bg-bg-surface/30 p-1 rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('transcript')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer",
                activeTab === 'transcript'
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              )}
            >
              <FileText className="w-4 h-4" />
              <span>{t('meeting.tabTranscript')}</span>
              {meeting.transcription && (
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border",
                  activeTab === 'transcript' ? "bg-white/20 border-white/20 text-white" : "bg-bg-elevated border-border-subtle text-text-secondary"
                )}>
                  {meeting.transcription.segments?.length || 0}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('analysis')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer",
                activeTab === 'analysis'
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              )}
            >
              <Sparkles className="w-4 h-4" />
              <span>{t('meeting.tabAnalysis')}</span>
              {meeting.analysis_runs.length > 0 && (
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border",
                  activeTab === 'analysis' ? "bg-white/20 border-white/20 text-white" : "bg-bg-elevated border-border-subtle text-text-secondary"
                )}>
                  {meeting.analysis_runs.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('speakers')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer",
                activeTab === 'speakers'
                  ? "bg-accent text-white shadow-sm"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              )}
            >
              <Users className="w-4 h-4" />
              <span>{t('meeting.tabSpeakers')}</span>
              {speakerMappings.length > 0 && (
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border",
                  activeTab === 'speakers' ? "bg-white/20 border-white/20 text-white" : "bg-bg-elevated border-border-subtle text-text-secondary"
                )}>
                  {speakerMappings.length}
                </span>
              )}
            </button>
          </div>

          {/* Active Tab Content */}
          <div className="flex flex-col gap-5 w-full">
            {activeTab === 'transcript' && (
              <div className="surface-primary rounded-xl border border-border-subtle shadow-premium overflow-hidden">
                {meeting.transcription && !demoMode && (
                  <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated flex items-center justify-between gap-3">
                    <span className="text-xs text-text-secondary font-medium">
                      {meeting.transcription?.text && (
                        <span>
                          {meeting.transcription.text.split(/\s+/).filter(Boolean).length} {lang === 'it' ? 'parole' : 'words'}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigateTo('transcription', meeting.transcription?.id || null)}
                    >
                      {t('meeting.openTranscriptTools')}
                    </Button>
                  </div>
                )}
                {meeting.transcription?.segments?.length ? (
                  <div className="p-4 sm:p-5 bg-bg-elevated">
                    <TranscriptTextView
                      segments={meeting.transcription.segments}
                      speakerMappings={speakerMappings}
                      onTimestampClick={handleTimestampClick}
                      currentTime={currentTime}
                    />
                  </div>
                ) : meeting.transcription?.text ? (
                  <div className="p-5 bg-bg-elevated">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                      {meeting.transcription.text}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-16 bg-bg-elevated">
                    <FileText className="w-8 h-8 mx-auto text-text-muted mb-3" />
                    <p className="text-sm text-text-secondary">{t('meeting.transcriptNotAvailable')}</p>
                    {!isBusy && !demoMode && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={openTranscriptionWorkflow}
                        className="mt-4"
                      >
                        {t('meeting.btnTranscribe')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && (
              <div className="surface-primary rounded-xl overflow-hidden border border-border-subtle shadow-premium">
                <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-accent animate-pulse" />
                    <h3 className="text-sm font-semibold text-text-primary">{t('meeting.analysisTitle')}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {meeting.transcription && (
                      <div className="relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setMoreOpen((open) => !open)}
                          aria-expanded={moreOpen}
                          className="h-7 text-xs text-text-muted hover:text-text-primary"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-accent" />
                          <span>{lang === 'it' ? 'Esegui Analisi' : 'Run Analysis'}</span>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        {moreOpen && (
                          <div className="absolute right-0 top-8 z-40 w-48 rounded-lg border border-border-subtle bg-bg-surface p-1 shadow-premium">
                            <button
                              type="button"
                              disabled={demoMode || isBusy}
                              onClick={() => {
                                setMoreOpen(false);
                                openAnalysisSetup('meeting_default');
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {t('meeting.analyzeDetail')}
                            </button>
                            <button
                              type="button"
                              disabled={demoMode || isBusy}
                              onClick={() => {
                                setMoreOpen(false);
                                openAnalysisSetup('meeting_deep');
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
                            >
                              <ListChecks className="h-3.5 w-3.5" />
                              {t('meeting.deepDetail')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <span className="text-xs text-text-muted border-l border-border-subtle pl-2.5">
                      {meeting.analysis_runs.length} run
                    </span>
                  </div>
                </div>

                {/* Smart Analysis Tabs (Show only generated or default brief if none exist) */}
                <div className="flex flex-wrap gap-1 p-2 border-b border-border-subtle bg-bg-surface/50">
                  {analysisTypes
                    .filter((type) => meeting.latest_analysis?.[type] || (!Object.keys(meeting.latest_analysis || {}).length && type === 'meeting_brief'))
                    .map((type) => {
                      const run = meeting.latest_analysis?.[type];
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedAnalysisType(type)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 cursor-pointer ${
                            selectedAnalysisType === type
                              ? 'bg-accent text-white border-accent shadow-sm'
                              : 'bg-bg-elevated text-text-secondary border-border-subtle hover:bg-bg-hover hover:text-text-primary'
                          }`}
                        >
                          {analysisLabel(type)}
                          {run && <CheckCircle2 className="inline-block ml-1.5 w-3.5 h-3.5 text-white" />}
                        </button>
                      );
                    })}
                </div>

                <div className="p-5 sm:p-6 bg-bg-elevated min-h-[220px]">
                  {selectedRun ? (
                    <div className="max-w-none prose prose-invert prose-sm animate-in fade-in duration-200">
                      {renderMarkdown(runMarkdown(selectedRun))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Sparkles className="w-8 h-8 mx-auto text-text-muted mb-3" />
                      <p className="text-sm text-text-secondary">{t('meeting.noAnalysisAvailable', { type: analysisLabel(selectedAnalysisType) })}</p>
                      {!isBusy && meeting.transcription && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openAnalysisSetup('meeting_default')}
                          className="mt-4"
                        >
                          {lang === 'it' ? 'Avvia analisi ora' : 'Start analysis now'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'speakers' && (
              <div className="animate-in fade-in duration-200">
                {meeting.transcription ? (
                  <SpeakerDiarizationEditor
                    transcription={meeting.transcription}
                    readOnly={demoMode}
                    onUpdated={(transcription) => setMeeting((current) => (
                      current ? { ...current, transcription } : current
                    ))}
                  />
                ) : (
                  <div className="text-center py-16 bg-bg-elevated rounded-xl border border-border-subtle">
                    <Users className="w-8 h-8 mx-auto text-text-muted mb-3" />
                    <p className="text-sm text-text-secondary">{t('meeting.noSpeakerClusters')}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {(visualData || visualLoading || visualError) && (
            <VisualIntelligencePanel
              data={visualData}
              mappings={speakerMappings}
              loading={visualLoading}
              error={visualError}
            />
          )}

          {recordingId && visualEnabled && (
            <VisualDebugPanel recordingId={recordingId} />
          )}
        </main>
      </div>

      {/* Right Drawer Slide-Over Sheet for Details */}
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="bg-bg-elevated border-l border-border-subtle w-full sm:w-[380px]">
          <SheetHeader
            title={t('meeting.statusTitle')}
            description={t('workspace.advancedDesc')}
          />
          <SheetBody className="flex flex-col gap-5 overflow-y-auto pt-2">
            {/* 1. Component Status Card */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">
                {lang === 'it' ? 'Stato Componenti' : 'Component Status'}
              </h4>
              <div className="flex flex-col gap-3 text-xs text-text-secondary">
                <div className="flex items-center justify-between gap-3">
                  <span>{t('meeting.audioTitle')}</span>
                  <Badge variant="success">{t('meeting.statusSaved')}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('meeting.transcriptionLabel')}</span>
                  <Badge variant={meeting.transcription ? 'success' : 'warning'}>
                    {meeting.transcription ? t('meeting.statusReady') : t('meeting.statusMissing')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('meeting.analysisLabel')}</span>
                  <Badge variant={Object.keys(meeting.latest_analysis || {}).length > 0 ? 'success' : 'idle'}>
                    {Object.keys(meeting.latest_analysis || {}).length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('meeting.diarizationLabel')}</span>
                  {enrichmentBadge(diarization?.status)}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t('meeting.visualEvidenceLabel')}</span>
                  {enrichmentBadge(visualIntelligence?.status)}
                </div>
              </div>
            </div>

            {meeting.transcription && (
              <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">
                  {t('meeting.speakerAttributionLabel')}
                </h4>
                {acceptedSpeakerMappings.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {acceptedSpeakerMappings.map((mapping) => (
                      <div key={mapping.speaker_cluster} className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-mono text-text-muted">{mapping.speaker_cluster}</span>
                        <span className="font-semibold text-text-primary">{mapping.display_name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">{t('meeting.noSpeakerAttribution')}</p>
                )}
              </div>
            )}

            {/* 2. Available Actions Card */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">
                {lang === 'it' ? 'Azioni Disponibili' : 'Available Actions'}
              </h4>
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={demoMode || isBusy}
                  onClick={() => {
                    setDetailsOpen(false);
                    openTranscriptionWorkflow();
                  }}
                  className="w-full justify-start text-left text-xs"
                >
                  <FileText className="h-3.5 w-3.5 mr-2 text-text-muted" />
                  {t('meeting.btnTranscribe')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canAnalyze || isBusy}
                  onClick={() => {
                    setDetailsOpen(false);
                    openAnalysisSetup('meeting_default');
                  }}
                  className="w-full justify-start text-left text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-2 text-accent" />
                  {t('meeting.btnAnalyze')} (Pipeline rapida)
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canAnalyze || isBusy}
                  onClick={() => {
                    setDetailsOpen(false);
                    openAnalysisSetup('meeting_deep');
                  }}
                  className="w-full justify-start text-left text-xs"
                >
                  <ListChecks className="h-3.5 w-3.5 mr-2 text-accent" />
                  {t('meeting.btnDeep')} (Pipeline completa)
                </Button>
              </div>
            </div>

            {/* 3. Run History Card */}
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="flex items-center gap-2 mb-3">
                <History className="w-3.5 h-3.5 text-text-muted" />
                <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-wider">
                  {t('meeting.runHistoryTitle')}
                </h4>
              </div>
              <div className="flex flex-col gap-2 max-h-[220px] overflow-auto">
                {selectedHistory.length === 0 ? (
                  <p className="text-xs text-text-muted">{t('meeting.noRunForType')}</p>
                ) : (
                  selectedHistory.map((run) => (
                    <div key={run.id} className="rounded-lg border border-border-subtle bg-bg-surface/50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text-primary">{analysisLabel(run.analysis_type)}</span>
                        <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}>
                          {run.status}
                        </Badge>
                      </div>
                      <div className="mt-1 text-[10px] text-text-muted">
                        {new Date(run.created_at * 1000).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US')}
                      </div>
                      {run.error && <div className="mt-1 text-[10px] text-danger">{run.error}</div>}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 4. Technical Details Accordion */}
            <AdvancedDetailsAccordion title={t('meeting.techDetailsTitle')}>
              <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-2 text-[11px] pt-1">
                <dt className="text-text-muted">Recording ID</dt>
                <dd className="text-text-secondary truncate select-all" title={meeting.id}>{meeting.id}</dd>
                <dt className="text-text-muted">{t('meeting.transcriptionLabel')}</dt>
                <dd className="text-text-secondary truncate select-all" title={meeting.transcription?.id || ''}>{meeting.transcription?.id || '-'}</dd>
                <dt className="text-text-muted">Backend</dt>
                <dd className="text-text-secondary">{meeting.recording.capture_backend || '-'}</dd>
                <dt className="text-text-muted">Modalità</dt>
                <dd className="text-text-secondary">{meeting.recording.capture_mode || '-'}</dd>
              </dl>
            </AdvancedDetailsAccordion>
          </SheetBody>
        </SheetContent>
      </Sheet>

      <AnalysisSetupModal
        isOpen={analysisSetupOpen}
        onConfirm={(selection) => {
          setAnalysisSetupOpen(false);
          startPipeline(analysisPipelineTarget, selection);
        }}
        onCancel={() => setAnalysisSetupOpen(false)}
        demoMode={demoMode}
      />
    </div>
  );
}
