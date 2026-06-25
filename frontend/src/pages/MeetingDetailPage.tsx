import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  ListChecks,
  Loader2,
  PlayCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ApiClient, AnalysisRun, Meeting, TranscriptionJob } from '../api/apiClient';
import { ANALYSIS_TYPE_LABELS, ANALYSIS_TYPE_ORDER } from '../api/config';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { renderMarkdown } from '../utils/markdown';
import { formatBytes, formatProjectDate, getDurationSeconds } from '../utils/formatters';
import { useTranslation } from '../i18n/i18n';

interface MeetingDetailPageProps {
  recordingId: string | null;
  navigateTo: (page: string, detail?: string | null) => void;
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

export default function MeetingDetailPage({ recordingId, navigateTo }: MeetingDetailPageProps) {
  const { lang } = useTranslation();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedAnalysisType, setSelectedAnalysisType] = useState('meeting_brief');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!recordingId) return;
    try {
      setError(null);
      const data = await ApiClient.getMeeting(recordingId);
      setMeeting(data);
      const availableTypes = Object.keys(data.latest_analysis || {});
      if (availableTypes.length > 0 && !data.latest_analysis[selectedAnalysisType]) {
        setSelectedAnalysisType(availableTypes[0]);
      }
    } catch (err: any) {
      setError(err?.message || 'Meeting non disponibile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [recordingId]);

  const activeJobs = useMemo(
    () => (meeting?.jobs || []).filter((job) => activeJobStatuses.has(job.status)),
    [meeting],
  );

  useEffect(() => {
    if (!meeting) return;
    const hasActiveRun = meeting.analysis_runs.some((run) => activeJobStatuses.has(run.status));
    if (!hasActiveRun && activeJobs.length === 0) return;
    const timer = window.setInterval(load, 2500);
    return () => window.clearInterval(timer);
  }, [meeting?.id, activeJobs.length, meeting?.analysis_runs.length]);

  const startTranscription = async () => {
    if (!meeting) return;
    setBusyAction('transcription');
    try {
      await ApiClient.createTranscriptionJob(meeting.id, {});
      window.setTimeout(load, 700);
    } catch (err: any) {
      setError(err?.message || 'Trascrizione non avviata.');
    } finally {
      setBusyAction(null);
    }
  };

  const startPipeline = async (pipelineId = 'meeting_default') => {
    if (!meeting) return;
    setBusyAction(pipelineId);
    try {
      await ApiClient.createAnalysisPipeline({
        recording_id: meeting.id,
        transcription_id: meeting.transcription?.id,
        pipeline_id: pipelineId,
      });
      window.setTimeout(load, 700);
    } catch (err: any) {
      setError(err?.message || 'Pipeline non avviata.');
    } finally {
      setBusyAction(null);
    }
  };

  if (!recordingId) {
    return (
      <div className="border border-border-subtle rounded-lg p-8 text-center">
        <p className="text-text-secondary">Seleziona un meeting da Oggi.</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigateTo('home')}>Torna a Oggi</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
        <span className="text-sm text-text-secondary">Caricamento meeting...</span>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="border border-border-subtle rounded-lg p-8 text-center">
        <p className="text-danger">{error || 'Meeting non trovato.'}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigateTo('home')}>Torna a Oggi</Button>
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

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 border-b border-border-subtle pb-5">
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => navigateTo('home')}
            className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Oggi
          </button>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4" />
            Aggiorna
          </Button>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge variant={meeting.status === 'ready' ? 'success' : meeting.status === 'analyzing' ? 'warning' : 'idle'}>
                {meeting.status}
              </Badge>
              {meeting.project_name && <span className="text-xs text-text-muted">{meeting.project_name}</span>}
            </div>
            <h2 className="text-3xl font-semibold text-text-primary truncate">{title}</h2>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-muted">
              <span>{formatProjectDate(meeting.created_at, lang)}</span>
              <span>{recordingDuration > 0 ? `${Math.round(recordingDuration / 60)} min` : 'Durata n/d'}</span>
              <span>{formatBytes(meeting.recording.bytes_written || 0)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!meeting.transcription && (
              <Button onClick={startTranscription} isLoading={busyAction === 'transcription'}>
                <FileText className="w-4 h-4" />
                Trascrivi
              </Button>
            )}
            <Button
              variant={meeting.transcription ? 'primary' : 'secondary'}
              disabled={!meeting.transcription}
              onClick={() => startPipeline('meeting_default')}
              isLoading={busyAction === 'meeting_default'}
            >
              <Sparkles className="w-4 h-4" />
              Analizza
            </Button>
            <Button
              variant="secondary"
              disabled={!meeting.transcription}
              onClick={() => startPipeline('meeting_deep')}
              isLoading={busyAction === 'meeting_deep'}
            >
              <ListChecks className="w-4 h-4" />
              Deep
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}
      </section>

      {(activeJobs.length > 0 || meeting.analysis_runs.some((run) => activeJobStatuses.has(run.status))) && (
        <section className="border border-warning/30 bg-warning/5 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <Clock3 className="w-4 h-4 text-warning" />
            Elaborazione in corso
          </div>
          <div className="mt-2 flex flex-col gap-1 text-xs text-text-secondary">
            {activeJobs.map((job) => <span key={job.id}>{job.type}: {jobProgress(job)}</span>)}
            {meeting.analysis_runs.filter((run) => activeJobStatuses.has(run.status)).map((run) => (
              <span key={run.id}>{analysisLabel(run.analysis_type)}: {run.status}</span>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <main className="flex flex-col gap-6 min-w-0">
          <div className="border border-border-subtle rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated flex items-center gap-2">
              <PlayCircle className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">Audio</h3>
            </div>
            <div className="p-4 bg-bg-surface">
              <audio controls src={`/v1/recordings/${meeting.id}/audio`} className="w-full" />
            </div>
          </div>

          <div className="border border-border-subtle rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-text-primary">Analisi</h3>
              </div>
              <span className="text-xs text-text-muted">{meeting.analysis_runs.length} run</span>
            </div>
            <div className="flex flex-wrap gap-1 p-3 border-b border-border-subtle bg-bg-surface">
              {analysisTypes.map((type) => {
                const run = meeting.latest_analysis?.[type];
                return (
                  <button
                    key={type}
                    onClick={() => setSelectedAnalysisType(type)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                      selectedAnalysisType === type
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg-elevated text-text-secondary border-border-subtle hover:text-text-primary'
                    }`}
                  >
                    {analysisLabel(type)}
                    {run && <CheckCircle2 className="inline-block ml-1 w-3 h-3" />}
                  </button>
                );
              })}
            </div>
            <div className="p-5 bg-bg-elevated min-h-[260px]">
              {selectedRun ? (
                <div className="prose prose-invert max-w-none">
                  {renderMarkdown(runMarkdown(selectedRun))}
                </div>
              ) : (
                <div className="text-center py-10">
                  <Sparkles className="w-8 h-8 mx-auto text-text-muted mb-3" />
                  <p className="text-sm text-text-secondary">Nessuna analisi “{analysisLabel(selectedAnalysisType)}” disponibile.</p>
                </div>
              )}
            </div>
          </div>

          <div className="border border-border-subtle rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle bg-bg-elevated flex items-center gap-2">
              <FileText className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">Transcript</h3>
            </div>
            <div className="p-5 bg-bg-elevated max-h-[520px] overflow-auto">
              {meeting.transcription?.text ? (
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary font-sans">
                  {meeting.transcription.text}
                </pre>
              ) : (
                <p className="text-sm text-text-muted">La trascrizione non è ancora disponibile.</p>
              )}
            </div>
          </div>
        </main>

        <aside className="flex flex-col gap-5">
          <section className="border border-border-subtle rounded-lg p-4 bg-bg-elevated">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Stato meeting</h3>
            <div className="flex flex-col gap-3 text-xs text-text-secondary">
              <div className="flex items-center justify-between gap-3">
                <span>Audio</span>
                <Badge variant="success">Salvato</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Trascrizione</span>
                <Badge variant={meeting.transcription ? 'success' : 'warning'}>{meeting.transcription ? 'Pronta' : 'Manca'}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Analisi</span>
                <Badge variant={Object.keys(meeting.latest_analysis || {}).length > 0 ? 'success' : 'idle'}>
                  {Object.keys(meeting.latest_analysis || {}).length}
                </Badge>
              </div>
            </div>
          </section>

          <section className="border border-border-subtle rounded-lg p-4 bg-bg-elevated">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">Storico run</h3>
            </div>
            <div className="flex flex-col gap-2 max-h-[340px] overflow-auto">
              {selectedHistory.length === 0 ? (
                <p className="text-xs text-text-muted">Nessuna run per questo tipo.</p>
              ) : (
                selectedHistory.map((run) => (
                  <div key={run.id} className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-text-primary">{analysisLabel(run.analysis_type)}</span>
                      <Badge variant={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}>
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted">
                      {new Date(run.created_at * 1000).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US')}
                    </div>
                    {run.error && <div className="mt-1 text-[11px] text-danger">{run.error}</div>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="border border-border-subtle rounded-lg p-4 bg-bg-elevated">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Dettagli tecnici</h3>
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 text-xs">
              <dt className="text-text-muted">Recording ID</dt>
              <dd className="text-text-secondary truncate">{meeting.id}</dd>
              <dt className="text-text-muted">Trascrizione</dt>
              <dd className="text-text-secondary truncate">{meeting.transcription?.id || '-'}</dd>
              <dt className="text-text-muted">Backend</dt>
              <dd className="text-text-secondary">{meeting.recording.capture_backend || '-'}</dd>
              <dt className="text-text-muted">Modalità</dt>
              <dd className="text-text-secondary">{meeting.recording.capture_mode || '-'}</dd>
            </dl>
          </section>
        </aside>
      </section>
    </div>
  );
}
