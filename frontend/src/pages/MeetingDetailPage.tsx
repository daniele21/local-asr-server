import { useEffect, useMemo, useState } from 'react';
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
  XCircle,
} from 'lucide-react';
import { ApiClient, AnalysisRun, Meeting, TranscriptionJob } from '../api/apiClient';
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_ORDER } from '../api/config';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { AdvancedDetailsAccordion } from '../components/workspace/MeetingWorkspace';
import { renderMarkdown } from '../utils/markdown';
import { formatBytes, formatProjectDate, getDurationSeconds } from '../utils/formatters';
import { useTranslation } from '../i18n/i18n';
import { getDemoMeetings } from '../features/demo/demoData';
import { TranscriptionModelModal } from '../components/ui/TranscriptionModelModal';
import { Sheet, SheetContent, SheetHeader, SheetBody } from '../components/ui/Sheet';
import { cn } from '../utils/cn';

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

function jobProgress(job: TranscriptionJob): string {
  const step = job.current_step || job.status;
  return `${step} · ${job.progress || 0}%`;
}

export default function MeetingDetailPage({ recordingId, navigateTo, demoMode = false }: MeetingDetailPageProps) {
  const { t, lang } = useTranslation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedAnalysisType, setSelectedAnalysisType] = useState('meeting_brief');
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);


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
      } else {
        data = await ApiClient.getMeeting(recordingId);
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

  const startTranscription = async (model?: string) => {
    if (!meeting) return;
    if (demoMode) return;
    setBusyAction('transcription');
    try {
      await ApiClient.createTranscriptionJob(meeting.id, { model: model || undefined });
      window.setTimeout(load, 700);
    } catch (err: any) {
      setError(err?.message || t('meeting.errorTranscriptionNotStarted'));
    } finally {
      setBusyAction(null);
    }
  };

  const startPipeline = async (pipelineId = 'meeting_default') => {
    if (!meeting) return;
    if (demoMode) return;
    setBusyAction(pipelineId);
    try {
      await ApiClient.createAnalysisPipeline({
        recording_id: meeting.id,
        transcription_id: meeting.transcription?.id,
        pipeline_id: pipelineId,
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
            <audio controls src={`/v1/recordings/${meeting.id}/audio`} className="h-9 w-full" autoPlay />
          </div>
        )}
      </section>

      {/* Busy / Processing State */}
      {(activeJobs.length > 0 || meeting.analysis_runs.some((run) => activeJobStatuses.has(run.status))) && (
        <section className="border border-warning/30 bg-warning/5 rounded-xl px-4 py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-primary shrink-0">
              <Clock3 className="w-4 h-4 text-warning" />
              <span>{t('meeting.processingTitle')}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-text-secondary">
              {activeJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">{job.type}: {jobProgress(job)}</span>
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
              onClick={() => setModelModalOpen(true)}
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
                onClick={() => startPipeline('meeting_default')}
                isLoading={busyAction === 'meeting_default'}
                className="flex-1 sm:flex-none shadow-cta animate-pulse"
              >
                <Sparkles className="h-4 w-4" />
                {t('meeting.btnAnalyze')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => startPipeline('meeting_deep')}
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
                            startPipeline('meeting_default');
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
                            startPipeline('meeting_deep');
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
                <div className="max-w-none prose prose-invert prose-sm">
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
                      onClick={() => startPipeline('meeting_default')}
                      className="mt-4"
                    >
                      {lang === 'it' ? 'Avvia analisi ora' : 'Start analysis now'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Collapsible Transcript Panel */}
          <div className="surface-supporting rounded-xl overflow-hidden border border-border-subtle transition-premium shadow-soft">
            <button
              onClick={() => setTranscriptExpanded((prev) => !prev)}
              className="w-full px-4 py-3 flex items-center justify-between gap-3 bg-bg-surface/60 hover:bg-bg-hover/80 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-text-muted" />
                <h3 className="text-sm font-semibold text-text-primary">{t('meeting.transcriptTitle')}</h3>
                {meeting.transcription?.text && (
                  <span className="text-[11px] text-text-muted">
                    ({meeting.transcription.text.split(/\s+/).filter(Boolean).length} {lang === 'it' ? 'parole' : 'words'})
                  </span>
                )}
              </div>
              <span className="text-xs text-accent font-semibold flex items-center gap-1">
                {transcriptExpanded ? (lang === 'it' ? 'Nascondi' : 'Hide') : (lang === 'it' ? 'Mostra' : 'Show')}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-250", transcriptExpanded && "rotate-180")} />
              </span>
            </button>

            {transcriptExpanded && (
              <div className="border-t border-border-subtle p-5 bg-bg-elevated max-h-[520px] overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
                {meeting.transcription?.text ? (
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary font-sans">
                    {meeting.transcription.text}
                  </pre>
                ) : (
                  <p className="text-sm text-text-muted">{t('meeting.transcriptNotAvailable')}</p>
                )}
              </div>
            )}
          </div>
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
              </div>
            </div>

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
                    setModelModalOpen(true);
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
                    startPipeline('meeting_default');
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
                    startPipeline('meeting_deep');
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

      <TranscriptionModelModal
        isOpen={modelModalOpen}
        onConfirm={(model) => {
          setModelModalOpen(false);
          startTranscription(model);
        }}
        onCancel={() => setModelModalOpen(false)}
        demoMode={demoMode}
      />
    </div>
  );
}
