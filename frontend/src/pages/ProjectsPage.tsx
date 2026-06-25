import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  FileAudio,
  FolderKanban,
  History,
  ListChecks,
  Mic,
  MoreHorizontal,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import { ApiClient, Project, ProjectItem, Recording } from '../api/apiClient';
import { NEW_RECORDING_PROJECT_STORAGE_KEY } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ProjectPromptModal } from '../components/ui/ProjectPromptModal';
import { TimeRangeFilter } from '../components/workspace/TimeRangeFilter';
import {
  ActionChecklist,
  AdvancedDetailsAccordion,
  AnalysisCTAButton,
  DecisionLog,
  EmptyState,
  ProjectDigestPanel,
  ProjectSidebar,
  ProjectStatusPanel,
  RiskPanel,
  SectionHeader,
} from '../components/workspace/MeetingWorkspace';
import {
  TimeRangeState,
  extractActionItems,
  extractDecisions,
  extractDigest,
  extractRisks,
  formatTimeRangeLabel,
  isWithinTimeRange,
  projectItemHasAnalysis,
  projectItemStatus,
  recordingTitle,
  resolveTimeRange,
  sortByNewest,
  sourceFromProjectItem,
  uniqueInsightItems,
} from '../utils/meetingInsights';
import { formatBytes, formatDuration, formatProjectDate, getDurationSeconds } from '../utils/formatters';
import { cn } from '../utils/cn';

interface ProjectsPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
}

const PROJECT_RANGE_OPTIONS = [
  { mode: 'last7' as const, label: '7g' },
  { mode: 'last30' as const, label: '30g' },
  { mode: 'all' as const, label: 'Tutto' },
  { mode: 'custom' as const, label: 'Custom' },
];

const ACTION_SCOPE_OPTIONS = [
  { value: 'week', label: 'Settimana' },
  { value: 'month', label: 'Mese' },
  { value: 'all', label: 'Tutte' },
] as const;

type ActionScope = typeof ACTION_SCOPE_OPTIONS[number]['value'];

export default function ProjectsPage({ navigateTo }: ProjectsPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [projectRange, setProjectRange] = useState<TimeRangeState>({ mode: 'last7' });
  const [actionScope, setActionScope] = useState<ActionScope>('week');
  const [projectDigestGeneratedAt, setProjectDigestGeneratedAt] = useState<string | null>(null);
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [activeRecordingForProject, setActiveRecordingForProject] = useState<Recording | null>(null);
  const [existingProjectsList, setExistingProjectsList] = useState<string[]>([]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.listProjects();
      setProjects(data.items || []);
    } catch (err: any) {
      showToast(err.message || 'Errore nel caricamento dei progetti', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectName('');
      return;
    }
    if (!selectedProjectName || !projects.some((project) => project.name === selectedProjectName)) {
      setSelectedProjectName(projects[0].name);
    }
  }, [projects, selectedProjectName]);

  useEffect(() => {
    setProjectDigestGeneratedAt(null);
  }, [selectedProjectName, projectRange.mode, projectRange.startDate, projectRange.endDate]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.name === selectedProjectName) || projects[0],
    [projects, selectedProjectName]
  );

  const resolvedProjectRange = useMemo(() => resolveTimeRange(projectRange), [projectRange]);
  const projectRangeLabel = useMemo(() => formatTimeRangeLabel(projectRange, lang), [projectRange, lang]);

  const periodItems = useMemo(() => {
    if (!selectedProject) return [];
    return selectedProject.items.filter((item) => isWithinTimeRange(item.recording.created_at, resolvedProjectRange));
  }, [selectedProject, resolvedProjectRange]);

  const sources = useMemo(
    () => selectedProject ? periodItems.map((item) => sourceFromProjectItem(item, selectedProject.name)) : [],
    [periodItems, selectedProject]
  );

  const actionItemsAll = useMemo(
    () => sortByNewest(uniqueInsightItems(sources.flatMap(extractActionItems))).filter((item) => !item.completed),
    [sources]
  );
  const decisions = useMemo(
    () => sortByNewest(uniqueInsightItems(sources.flatMap(extractDecisions))),
    [sources]
  );
  const risks = useMemo(
    () => sortByNewest(uniqueInsightItems(sources.flatMap(extractRisks))),
    [sources]
  );
  const digestItems = useMemo(
    () => sortByNewest(sources.map(extractDigest).filter((item): item is NonNullable<typeof item> => Boolean(item))),
    [sources]
  );

  const actionScopeRange = useMemo(() => {
    if (actionScope === 'week') return resolveTimeRange({ mode: 'last7' });
    if (actionScope === 'month') return resolveTimeRange({ mode: 'last30' });
    return resolveTimeRange({ mode: 'all' });
  }, [actionScope]);
  const actionItems = useMemo(
    () => actionItemsAll.filter((item) => isWithinTimeRange(item.sourceDate, actionScopeRange)),
    [actionItemsAll, actionScopeRange]
  );

  const handleRenameClick = (recording: Recording) => {
    setEditingRecordingId(recording.id);
    setEditTitleValue(recording.title);
  };

  const handleSaveRename = async (recording: Recording) => {
    const title = editTitleValue.trim();
    if (!title) {
      showToast(t('transcription.titleEmptyError'), 'error');
      return;
    }
    try {
      await ApiClient.updateRecording(recording.id, { title });
      showToast(t('transcription.titleSaveSuccess'), 'success');
      setEditingRecordingId(null);
      loadProjects();
    } catch (err: any) {
      showToast(t('transcription.titleSaveError', { error: err.message }), 'error');
    }
  };

  const handleAssignProject = async (recording: Recording) => {
    let list: string[] = [];
    try {
      const projsData = await ApiClient.listProjects();
      list = (projsData.items || [])
        .filter((project) => !project.is_unassigned)
        .map((project) => project.name);
    } catch {}

    setExistingProjectsList(list);
    setActiveRecordingForProject(recording);
    setIsProjectModalOpen(true);
  };

  const handleConfirmProject = async (projectName: string) => {
    if (!activeRecordingForProject) return;
    try {
      await ApiClient.updateRecording(activeRecordingForProject.id, { project_name: projectName });
      showToast(t('transcription.projectUpdateSuccess'), 'success');
      setIsProjectModalOpen(false);
      setActiveRecordingForProject(null);
      loadProjects();
    } catch (err: any) {
      showToast(t('transcription.projectUpdateError', { error: err.message }), 'error');
    }
  };

  const handleNewMeetingForProject = () => {
    if (selectedProject && !selectedProject.is_unassigned) {
      sessionStorage.setItem(NEW_RECORDING_PROJECT_STORAGE_KEY, selectedProject.name);
    }
    navigateTo('recording');
  };

  const handleGenerateProjectSituation = () => {
    const timestamp = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    setProjectDigestGeneratedAt(timestamp);
    const insightCount = digestItems.length + actionItemsAll.length + decisions.length + risks.length;
    showToast(
      insightCount > 0
        ? 'Situazione progetto composta dagli insight disponibili.'
        : 'Nessun insight strutturato disponibile nel range selezionato.',
      insightCount > 0 ? 'success' : 'info'
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <span className="text-sm text-text-secondary">{t('common.loading')}</span>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title={t('projects.empty')}
        description="Assegna un progetto a un meeting o crea una nuova registrazione per iniziare."
        action={<Button onClick={() => navigateTo('recording')}>Registra meeting</Button>}
      />
    );
  }

  const transcribedCount = periodItems.filter((item) => Boolean(item.transcription)).length;
  const readyCount = periodItems.filter(projectItemHasAnalysis).length;
  const latestProjectUpdate = digestItems[0]?.text;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <ProjectSidebar
        projects={projects}
        selectedName={selectedProject.name}
        query={sidebarQuery}
        onQueryChange={setSidebarQuery}
        onSelect={setSelectedProjectName}
      />

      <main className="flex min-w-0 flex-col gap-6">
        <section className="flex flex-col gap-5 border-b border-border-subtle pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <span className="text-xs font-semibold uppercase tracking-widest text-accent">Progetto</span>
              <h2 className="mt-1 truncate text-3xl font-semibold text-text-primary">{selectedProject.name}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
                Stato, azioni, decisioni e rischi derivati dagli insight già generati sui meeting collegati.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={handleNewMeetingForProject}>
                <Mic className="h-4 w-4" />
                Nuovo meeting in questo progetto
              </Button>
              <AnalysisCTAButton
                onClick={handleGenerateProjectSituation}
                disabled={periodItems.length === 0}
                isGenerated={Boolean(projectDigestGeneratedAt)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <TimeRangeFilter value={projectRange} options={PROJECT_RANGE_OPTIONS} onChange={setProjectRange} />
            <div className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-xs text-text-muted">
              <CalendarDays className="h-4 w-4" />
              {projectRangeLabel}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={Sparkles}
            title="Stato progetto"
            description={latestProjectUpdate || 'Sintesi basata sulle ultime analisi disponibili, non sulle trascrizioni grezze.'}
            tooltip="L'MVP compone lo stato da latest_analysis e analysis_runs dei meeting nel range."
          />
          <ProjectStatusPanel
            meetingCount={periodItems.length}
            transcribedCount={transcribedCount}
            readyCount={readyCount}
            actionCount={actionItemsAll.length}
            decisionCount={decisions.length}
            riskCount={risks.length}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3">
              <SectionHeader
                icon={ListChecks}
                title="Ultime azioni"
                description="Checklist operativa estratta dalle analisi action item del progetto."
                action={
                  <div className="flex rounded-lg border border-border-subtle bg-bg-elevated p-1">
                    {ACTION_SCOPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setActionScope(option.value)}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                          actionScope === option.value
                            ? 'bg-accent text-white'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                }
              />
              <ActionChecklist items={actionItems.slice(0, 12)} />
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <SectionHeader
                  icon={Target}
                  title="Decisioni recenti"
                  description="Decision log ordinato per data dei meeting collegati."
                />
                <DecisionLog items={decisions.slice(0, 10)} />
              </div>
              <div className="flex flex-col gap-3">
                <SectionHeader
                  icon={ShieldAlert}
                  title="Rischi e blocchi"
                  description="Rischi, dipendenze e prossimi passi emersi dalle analisi."
                />
                <RiskPanel items={risks.slice(0, 10)} />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeader
                icon={History}
                title="Timeline meeting"
                description="Meeting collegati al progetto nel range selezionato."
              />
              {periodItems.length === 0 ? (
                <EmptyState
                  icon={FileAudio}
                  title="Nessun meeting nel range"
                  description="Allarga il periodo o registra un nuovo meeting collegato a questo progetto."
                  action={<Button onClick={handleNewMeetingForProject}>Nuovo meeting</Button>}
                />
              ) : (
                <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated">
                  {periodItems.map((item) => (
                    <ProjectTimelineItem
                      key={item.recording.id}
                      item={item}
                      lang={lang}
                      isEditing={editingRecordingId === item.recording.id}
                      editTitleValue={editTitleValue}
                      setEditTitleValue={setEditTitleValue}
                      onRename={() => handleRenameClick(item.recording)}
                      onSaveRename={() => handleSaveRename(item.recording)}
                      onCancelRename={() => setEditingRecordingId(null)}
                      onAssignProject={() => handleAssignProject(item.recording)}
                      onOpen={() => navigateTo('meeting', item.recording.id)}
                      onTranscribe={() => navigateTo('transcription', `file-${item.recording.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            <ProjectDigestPanel
              items={projectDigestGeneratedAt ? digestItems : []}
              generatedAt={projectDigestGeneratedAt}
            />

            <section className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
              <SectionHeader
                icon={MoreHorizontal}
                title="Analisi progetto"
                description="Azioni disponibili sul progetto selezionato."
              />
              <div className="mt-4 flex flex-col gap-2">
                <AnalysisCTAButton
                  onClick={handleGenerateProjectSituation}
                  disabled={periodItems.length === 0}
                  isGenerated={Boolean(projectDigestGeneratedAt)}
                />
                <Button variant="secondary" size="sm" onClick={() => navigateTo('analysis')}>
                  <Sparkles className="h-4 w-4" />
                  Domanda custom sul progetto
                </Button>
              </div>
            </section>

            <AdvancedDetailsAccordion>
              <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-xs">
                <dt className="text-text-muted">Meeting totali</dt>
                <dd className="text-text-secondary">{selectedProject.items.length}</dd>
                <dt className="text-text-muted">Nel range</dt>
                <dd className="text-text-secondary">{periodItems.length}</dd>
                <dt className="text-text-muted">Analysis run</dt>
                <dd className="text-text-secondary">
                  {periodItems.reduce((count, item) => count + (item.analysis_runs?.length || 0), 0)}
                </dd>
                <dt className="text-text-muted">Range</dt>
                <dd className="truncate text-text-secondary">{projectRangeLabel}</dd>
              </dl>
            </AdvancedDetailsAccordion>
          </aside>
        </section>
      </main>

      <ProjectPromptModal
        isOpen={isProjectModalOpen}
        initialValue={activeRecordingForProject?.project_name || ''}
        onConfirm={handleConfirmProject}
        onCancel={() => {
          setIsProjectModalOpen(false);
          setActiveRecordingForProject(null);
        }}
        existingProjects={existingProjectsList}
      />
    </div>
  );
}

function ProjectTimelineItem({
  item,
  lang,
  isEditing,
  editTitleValue,
  setEditTitleValue,
  onRename,
  onSaveRename,
  onCancelRename,
  onAssignProject,
  onOpen,
  onTranscribe,
}: {
  item: ProjectItem;
  lang: string;
  isEditing: boolean;
  editTitleValue: string;
  setEditTitleValue: (value: string) => void;
  onRename: () => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  onAssignProject: () => void;
  onOpen: () => void;
  onTranscribe: () => void;
}) {
  const status = projectItemStatus(item);
  const duration = getDurationSeconds(item.recording);
  const statusMeta = {
    recorded: { label: 'Da trascrivere', variant: 'warning' as const },
    transcribed: { label: 'Da analizzare', variant: 'info' as const },
    ready: { label: 'Insight pronti', variant: 'success' as const },
  }[status];

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_180px_220px] lg:items-center">
      <div className="min-w-0">
        {isEditing ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={editTitleValue}
              onChange={(event) => setEditTitleValue(event.target.value)}
              maxLength={200}
              className="min-w-0 rounded-lg border border-border-focus bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={onSaveRename}>Salva</Button>
              <Button size="sm" variant="ghost" onClick={onCancelRename}>Annulla</Button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">{recordingTitle(item.recording)}</h3>
            <button
              type="button"
              onClick={onRename}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label="Rinomina meeting"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-text-muted">
          <span>{formatProjectDate(item.recording.created_at, lang)}</span>
          <span>{formatDuration(duration, (key, options) => {
            if (key === 'recording.durationNotAvailable') return 'Durata n/d';
            if (key === 'recording.durationFormat') return `${options.mins}m ${options.secs}s`;
            return key;
          })}</span>
          <span>{formatBytes(item.recording.bytes_written || 0)}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        {item.transcription && <CheckCircle2 className="h-4 w-4 text-success" />}
        {projectItemHasAnalysis(item) && <Sparkles className="h-4 w-4 text-accent" />}
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button size="sm" onClick={onOpen}>
          Apri
        </Button>
        {!item.transcription && (
          <Button size="sm" variant="secondary" onClick={onTranscribe}>
            Trascrivi
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onAssignProject}>
          Progetto
        </Button>
      </div>
    </div>
  );
}
