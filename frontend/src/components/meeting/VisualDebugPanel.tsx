import { useState, useEffect } from 'react';
import { ApiClient } from '../../api/apiClient';
import { useTranslation } from '../../i18n/i18n';
import { 
  Terminal, ShieldAlert, CheckCircle2, AlertTriangle, Cpu, ListFilter, 
  Search, Eye, Clock, Image as ImageIcon, ChevronRight, ChevronLeft
} from 'lucide-react';
import { Badge } from '../ui/Badge';

interface Props {
  recordingId: string;
}

function timestamp(value: number): string {
  const seconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function VisualDebugPanel({ recordingId }: Props) {
  const { t, lang } = useTranslation();
  const [activeTab, setActiveTab] = useState<'overview' | 'candidates' | 'detail' | 'timeline'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugData, setDebugData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<any>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    ApiClient.visualDebug(recordingId, page, 50, selectedTask || undefined, controller.signal)
      .then((data) => {
        setDebugData(data);
        if (data.candidates && data.candidates.length > 0 && !selectedCandidate) {
          setSelectedCandidate(data.candidates[0]);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [recordingId, page, selectedTask]);

  if (loading && !debugData) {
    return <div className="h-48 animate-pulse rounded-xl bg-bg-surface border border-border-subtle" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
        <p className="font-semibold">{lang === 'it' ? 'Errore debug visuale' : 'Visual Debug Error'}</p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }

  if (!debugData) return null;

  const { run_config, metrics, result, traces, candidates, observations, pagination } = debugData;

  // Map candidates with traces to find decisions/outcomes
  const candidatesWithDetails = (candidates || []).map((cand: any) => {
    const matchingTrace = (traces || []).find((tr: any) => tr.sequence === cand.sequence && tr.task === cand.task);
    const matchingObs = (observations || []).find((o: any) => o.sequence === cand.sequence && o.task === cand.task);
    const matchingErr = (metrics.candidate_errors || []).find((e: any) => e.sequence === cand.sequence && e.task === cand.task);
    
    return {
      ...cand,
      trace: matchingTrace,
      observation: matchingObs,
      error: matchingErr,
      decision: matchingTrace?.event === 'candidate_rejected' ? 'rejected' : 
                matchingTrace?.event === 'response_invalid' ? 'failed' :
                matchingTrace?.event === 'observation_persisted' ? 'success' : 'pending'
    };
  });

  return (
    <section className="mt-6 rounded-xl border border-border-subtle bg-bg-surface/50 shadow-soft overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border-subtle bg-bg-surface/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4.5 w-4.5 text-accent" />
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {lang === 'it' ? 'Visual Debug & Tracing' : 'Visual Debug & Tracing'}
            </h3>
            <p className="text-[11px] text-text-muted">
              {lang === 'it' ? 'Dettagli di esecuzione, metriche, prompt e tracciamento dei modelli' : 'Execution details, metrics, prompts and model tracing'}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 border-b border-border-subtle sm:border-0 overflow-x-auto">
          {(['overview', 'candidates', 'detail', 'timeline'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs font-medium border-b-2 rounded-t capitalize transition-all cursor-pointer ${
                activeTab === tab 
                  ? 'border-accent text-accent bg-accent/5' 
                  : 'border-transparent text-text-muted hover:text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 min-h-[300px]">
        {/* Tab: Overview */}
        {activeTab === 'overview' && (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Run config */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                {lang === 'it' ? 'Configurazione Run' : 'Run Configuration'}
              </h4>
              <div className="rounded-lg bg-bg-surface/80 border border-border-subtle p-3 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-text-muted">Generation ID</span><span className="font-mono text-text-primary text-[10px]">{debugData.generation_id}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">ASR Provider</span><span className="text-text-primary">{run_config.asr_provider || 'local'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">ASR Model</span><span className="text-text-primary">{run_config.asr_model || '-'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Diarization</span><span className="text-text-primary">{run_config.diarization_enabled ? `${run_config.diarization_model}` : 'Disabled'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Visual Model</span><span className="text-text-primary">{run_config.visual_model}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Routing Config</span><span className="text-text-primary font-mono text-[10px]">grid={run_config.visual_routing_config?.participant_grid_rows}x{run_config.visual_routing_config?.participant_grid_columns}</span></div>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {lang === 'it' ? 'Metriche di Performance & Qualità' : 'Performance & Quality Metrics'}
              </h4>
              <div className="rounded-lg bg-bg-surface/80 border border-border-subtle p-3 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-text-muted">Status</span><Badge variant={metrics.status === 'completed' ? 'idle' : 'warning'}>{metrics.status}</Badge></div>
                <div className="flex justify-between"><span className="text-text-muted">Elapsed Time</span><span className="text-text-primary">{metrics.elapsed_seconds}s</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Captured Frames</span><span className="text-text-primary">{metrics.frame_count}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Observations</span><span className="text-text-primary">{metrics.observation_count}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Parse Errors</span><span className={`font-semibold ${metrics.parse_errors > 0 ? 'text-warning' : 'text-text-primary'}`}>{metrics.parse_errors}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Candidates */}
        {activeTab === 'candidates' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex items-center gap-2">
                <ListFilter className="w-3.5 h-3.5 text-text-muted" />
                <select
                  value={selectedTask}
                  onChange={(e) => { setSelectedTask(e.target.value); setPage(1); }}
                  className="bg-bg-surface border border-border-subtle rounded px-2 py-1 text-xs text-text-primary"
                >
                  <option value="">All Tasks</option>
                  <option value="meeting_ui">Meeting UI</option>
                  <option value="meeting_state">Meeting State</option>
                  <option value="shared_content">Shared Content</option>
                </select>
              </div>
              <span className="text-[11px] text-text-muted">
                Showing {candidatesWithDetails.length} candidates
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-bg-surface/80 text-text-muted border-b border-border-subtle">
                    <th className="p-2 font-semibold">Seq</th>
                    <th className="p-2 font-semibold">Time</th>
                    <th className="p-2 font-semibold">Task</th>
                    <th className="p-2 font-semibold">Trigger</th>
                    <th className="p-2 font-semibold">Expected Cluster</th>
                    <th className="p-2 font-semibold">Decision</th>
                    <th className="p-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {candidatesWithDetails.map((cand: any) => (
                    <tr key={`${cand.sequence}-${cand.task}`} className="hover:bg-bg-hover/30">
                      <td className="p-2 font-mono">{cand.sequence}</td>
                      <td className="p-2 font-mono">{timestamp(cand.timestamp)}</td>
                      <td className="p-2"><Badge variant="idle">{cand.task}</Badge></td>
                      <td className="p-2 text-text-secondary">{cand.trigger}</td>
                      <td className="p-2 font-mono text-[11px] text-text-muted">{cand.expected_cluster || '-'}</td>
                      <td className="p-2">
                        <span className={`inline-flex items-center gap-1 font-semibold ${
                          cand.decision === 'success' ? 'text-green-500' :
                          cand.decision === 'rejected' ? 'text-text-muted' :
                          cand.decision === 'failed' ? 'text-warning' : 'text-accent'
                        }`}>
                          {cand.decision === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {cand.decision === 'failed' && <ShieldAlert className="w-3.5 h-3.5" />}
                          {cand.decision === 'rejected' && <AlertTriangle className="w-3.5 h-3.5" />}
                          {cand.decision}
                        </span>
                      </td>
                      <td className="p-2">
                        <button
                          onClick={() => { setSelectedCandidate(cand); setActiveTab('detail'); }}
                          className="px-2 py-0.5 text-[10px] bg-accent/10 hover:bg-accent/20 text-accent font-semibold rounded cursor-pointer"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab: Detail */}
        {activeTab === 'detail' && selectedCandidate && (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* Sidebar info */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                {lang === 'it' ? 'Anteprima Frame' : 'Frame Preview'}
              </h4>
              <div className="rounded-lg border border-border-subtle bg-bg-surface overflow-hidden aspect-video flex items-center justify-center relative group">
                {/* Visual debug endpoint serving previews directly */}
                <img
                  src={`/v2/recordings/${recordingId}/visual-runs/${debugData.generation_id}/previews/frame-${String(selectedCandidate.sequence).padStart(8, '0')}.webp`}
                  alt="Candidate Frame"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    // Fallback to placeholder icon
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      const icon = parent.querySelector('.fallback-icon');
                      if (icon) icon.classList.remove('hidden');
                    }
                  }}
                />
                <div className="fallback-icon hidden text-text-muted text-center p-4">
                  <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                  <span className="text-[10px]">{lang === 'it' ? 'Nessuna anteprima salvata' : 'No preview stored'}</span>
                </div>
              </div>
              <div className="rounded-lg bg-bg-surface p-3 space-y-2 text-xs border border-border-subtle">
                <div><span className="text-text-muted block">Sequence</span><span className="font-mono text-text-primary">{selectedCandidate.sequence}</span></div>
                <div><span className="text-text-muted block">Timestamp</span><span className="font-mono text-text-primary">{timestamp(selectedCandidate.timestamp)} ({selectedCandidate.timestamp}s)</span></div>
                <div><span className="text-text-muted block">Task type</span><span className="text-text-primary font-semibold">{selectedCandidate.task}</span></div>
                <div><span className="text-text-muted block">Trigger</span><span className="text-text-primary">{selectedCandidate.trigger}</span></div>
              </div>
            </div>

            {/* Prompt, response, parse outcome */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                {lang === 'it' ? 'Risposta del Modello & Parsing' : 'Model Response & Parsing'}
              </h4>
              
              {selectedCandidate.decision === 'rejected' && (
                <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-xs text-warning">
                  <AlertTriangle className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
                  {lang === 'it' 
                    ? 'Questo candidato è stato scartato dalla cadenza adattiva (content cadence). Nessuna inferenza LLM effettuata.' 
                    : 'This candidate was skipped by adaptive cadence. No LLM inference was executed.'}
                </div>
              )}

              {selectedCandidate.decision === 'failed' && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-xs text-red-400">
                  <ShieldAlert className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
                  <span className="font-semibold">{lang === 'it' ? 'Fallimento o Errore di Validazione:' : 'Failure or Validation Error:'}</span>
                  <pre className="mt-2 font-mono text-[10px] bg-bg-surface/50 p-2 rounded border border-border-subtle overflow-x-auto whitespace-pre-wrap">
                    {selectedCandidate.error?.error || 'Unknown error'}
                  </pre>
                </div>
              )}

              {selectedCandidate.observation && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                    <h5 className="font-semibold text-text-primary mb-2">Parsed Observation JSON</h5>
                    <pre className="font-mono text-[10px] text-text-secondary whitespace-pre-wrap bg-bg-surface/60 p-2 rounded border border-border-subtle">
                      {JSON.stringify(selectedCandidate.observation, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Timeline */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {lang === 'it' ? 'Sequenza Diagnostica' : 'Diagnostic Sequence'}
            </h4>
            
            <div className="relative border-l-2 border-border-subtle pl-4 ml-2 space-y-4">
              {(traces || []).slice(0, 100).map((tr: any, idx: number) => (
                <div key={idx} className="relative">
                  <span className={`absolute -left-[21px] top-1.5 w-2 h-2 rounded-full border-2 ${
                    tr.event === 'run_failed' ? 'bg-red-500 border-red-200' :
                    tr.event === 'run_completed' ? 'bg-green-500 border-green-200' :
                    tr.event === 'inference_started' ? 'bg-accent border-accent/30 animate-ping' :
                    'bg-text-muted border-border-subtle'
                  }`} />
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-mono text-[10px] text-text-muted">{tr.elapsed_seconds}s</span>
                    <span className="font-semibold text-text-primary">{tr.event}</span>
                    {tr.task && <Badge variant="idle">{tr.task}</Badge>}
                    {tr.sequence !== undefined && <span className="font-mono text-text-muted">seq={tr.sequence}</span>}
                    {tr.error && <span className="text-red-400 font-mono text-[10px]">{tr.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
