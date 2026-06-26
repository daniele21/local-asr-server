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
import { getDemoProjects } from '../features/demo/demoData';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ProjectPromptModal } from '../components/ui/ProjectPromptModal';
import { TimeRangeFilter } from '../components/workspace/TimeRangeFilter';
import { TaskProcessingLoader } from '../components/workspace/TaskProcessingLoader';
import { InsightDetailDialog } from '../components/workspace/InsightDetailDialog';
import type { InsightTab } from '../components/workspace/InsightDetailDialog';
import {
  ActionChecklist,
  AdvancedDetailsAccordion,
  AnalysisCTAButton,
  DecisionLog,
  EmptyState,
  ProjectDigestPanel,
  ProjectSidebar,
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
  demoMode?: boolean;
}



const ACTION_SCOPE_OPTIONS = [
  { value: 'week', label: 'Settimana' },
  { value: 'month', label: 'Mese' },
  { value: 'all', label: 'Tutte' },
] as const;

type ActionScope = typeof ACTION_SCOPE_OPTIONS[number]['value'];

export default function ProjectsPage({ navigateTo, demoMode = false }: ProjectsPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState('');
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [projectRange, setProjectRange] = useState<TimeRangeState>({ mode: 'last7' });
  const [actionScope, setActionScope] = useState<ActionScope>('week');
  const [projectDigestGeneratedAt, setProjectDigestGeneratedAt] = useState<string | null>(null);
  const [isProjectGenerating, setIsProjectGenerating] = useState(false);
  const [editingRecordingId, setEditingRecordingId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [activeRecordingForProject, setActiveRecordingForProject] = useState<Recording | null>(null);
  const [existingProjectsList, setExistingProjectsList] = useState<string[]>([]);

  // Insight dialog state
  const [insightDialogOpen, setInsightDialogOpen] = useState(false);
  const [insightDialogTab, setInsightDialogTab] = useState<InsightTab>('actions');

  const openInsightDialog = (tab: InsightTab) => {
    setInsightDialogTab(tab);
    setInsightDialogOpen(true);
  };

  const projectRangeOptions = useMemo(() => [
    { mode: 'last7' as const, label: '7g' },
    { mode: 'last30' as const, label: '30g' },
    { mode: 'all' as const, label: lang === 'it' ? 'Tutto' : 'All' },
    { mode: 'custom' as const, label: lang === 'it' ? 'Custom' : 'Custom' },
  ], [lang]);

  const actionScopeOptions = useMemo(() => [
    { value: 'week' as const, label: lang === 'it' ? 'Settimana' : 'Week' },
    { value: 'month' as const, label: lang === 'it' ? 'Mese' : 'Month' },
    { value: 'all' as const, label: lang === 'it' ? 'Tutte' : 'All' },
  ], [lang]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      if (demoMode) {
        setProjects(getDemoProjects(lang));
        setSelectedProjectName('ClosedRoom Beta Launch');
        return;
      }
      const data = await ApiClient.listProjects();
      setProjects(data.items || []);
    } catch (err: any) {
      if (demoMode) {
        setProjects(getDemoProjects(lang));
        setSelectedProjectName('ClosedRoom Beta Launch');
        return;
      }
      showToast(err.message || t('projects.loading') || 'Errore', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [demoMode, lang]);

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
    setIsProjectGenerating(false);
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
    if (demoMode) return;
    setEditingRecordingId(recording.id);
    setEditTitleValue(recording.title);
  };

  const handleSaveRename = async (recording: Recording) => {
    if (demoMode) return;
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
    if (demoMode) {
      showToast(t('dashboard.toastDemoNoModify'), 'info');
      return;
    }
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
    if (demoMode) return;
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
    if (demoMode) {
      showToast(t('dashboard.toastDemoNoRecord'), 'info');
      return;
    }
    if (selectedProject && !selectedProject.is_unassigned) {
      sessionStorage.setItem(NEW_RECORDING_PROJECT_STORAGE_KEY, selectedProject.name);
    }
    navigateTo('recording');
  };

  const handleGenerateProjectSituation = () => {
    const insightCount = digestItems.length + actionItemsAll.length + decisions.length + risks.length;
    setIsProjectGenerating(true);
    window.setTimeout(() => {
      const timestamp = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      setProjectDigestGeneratedAt(timestamp);
      setIsProjectGenerating(false);
      showToast(
        insightCount > 0
          ? t('projects.toastDigestSuccess')
          : t('projects.toastDigestEmpty'),
        insightCount > 0 ? 'success' : 'info'
      );
    }, 850);
  };

  if (loading) {
    return (
      <div className="py-16">
        <TaskProcessingLoader
          title={t('workspace.loaderProjectsTitle')}
          description={t('workspace.loaderProjectsDesc')}
          steps={[t('workspace.loaderProjectsStep1'), t('workspace.loaderProjectsStep2'), t('workspace.loaderProjectsStep3')]}
          activeStep={1}
          progress={62}
          variant="project"
          helperText={t('workspace.loaderLocalHelper')}
        />
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <EmptyState
        icon={FolderKanban}
        title={t('projects.empty')}
        description={lang === 'it' ? 'Assegna un progetto a un meeting o crea una nuova registrazione per iniziare.' : 'Assign a project to a meeting or create a new recording to start.'}
        action={<Button onClick={() => navigateTo('recording')}>{lang === 'it' ? 'Registra meeting' : 'Record meeting'}</Button>}
      />
    );
  }

  const readyCount = periodItems.filter(projectItemHasAnalysis).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] animate-page-in">
      <div data-tour="project-sidebar">
        <ProjectSidebar
          projects={projects}
          selectedName={selectedProject.name}
          query={sidebarQuery}
          onQueryChange={setSidebarQuery}
          onSelect={setSelectedProjectName}
        />
      </div>

      <main className="flex min-w-0 flex-col gap-6">
        {/* Hero — compact: title + actions + period filter inline */}
        <section className="premium-hero page-hero rounded-2xl p-5 sm:p-6" data-tour="project-situation">
          <span className="hero-orbital-line" aria-hidden="true" />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase text-accent">{t('projects.projectLabel')}</span>
                <Badge variant={readyCount > 0 ? 'success' : 'info'}>{projectRangeLabel}</Badge>
              </div>
              <h2 className="mt-2 break-words text-3xl font-bold text-text-primary sm:text-4xl">
                {selectedProject.name}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary">{t('projects.heroDesc')}</p>

              {/* Inline period filter — no more floating controls */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="surface-supporting rounded-xl p-2">
                  <TimeRangeFilter value={projectRange} options={projectRangeOptions} onChange={setProjectRange} />
                </div>
                <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-border-subtle bg-bg-elevated px-3 text-xs text-text-muted">
                  <CalendarDays className="h-4 w-4" />
                  {projectRangeLabel}
                </div>
              </div>

              {/* Compact project status pills */}
              {periodItems.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2.5" data-tour="project-status">
                  <button
                    type="button"
                    onClick={() => {
                      const timelineSec = document.querySelector('[data-tour="project-situation"]')?.nextElementSibling;
                      timelineSec?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-glass/40 hover:bg-bg-hover hover:border-border-focus px-3 py-1.5 text-xs font-semibold text-text-secondary transition-premium hover-lift"
                  >
                    <FileAudio className="h-3.5 w-3.5 text-accent" />
                    <span>
                      <strong>{periodItems.length}</strong> {lang === 'it' ? 'Meeting' : 'Meetings'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openInsightDialog('actions')}
                    className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-glass/40 hover:bg-bg-hover hover:border-border-focus px-3 py-1.5 text-xs font-semibold text-text-secondary transition-premium hover-lift"
                  >
                    <ListChecks className="h-3.5 w-3.5 text-success" />
                    <span>
                      <strong>{actionItemsAll.length}</strong> {lang === 'it' ? 'Azioni aperte' : 'Open actions'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openInsightDialog('decisions')}
                    className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-glass/40 hover:bg-bg-hover hover:border-border-focus px-3 py-1.5 text-xs font-semibold text-text-secondary transition-premium hover-lift"
                  >
                    <Target className="h-3.5 w-3.5 text-info" />
                    <span>
                      <strong>{decisions.length}</strong> {lang === 'it' ? 'Decisioni' : 'Decisions'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => openInsightDialog('risks')}
                    className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-glass/40 hover:bg-bg-hover hover:border-border-focus px-3 py-1.5 text-xs font-semibold text-text-secondary transition-premium hover-lift"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-warning" />
                    <span>
                      <strong>{risks.length}</strong> {lang === 'it' ? 'Rischi' : 'Risks'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {/* CTA actions */}
            <div className="flex flex-col gap-2">
              <AnalysisCTAButton
                onClick={handleGenerateProjectSituation}
                disabled={periodItems.length === 0 || isProjectGenerating}
                isGenerated={Boolean(projectDigestGeneratedAt)}
              />
              <Button size="lg" variant="secondary" onClick={handleNewMeetingForProject} disabled={demoMode}>
                <Mic className="h-5 w-5" />
                {t('projects.btnNewMeeting')}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="surface-primary flex flex-col gap-3 rounded-2xl p-4" data-tour="project-actions">
              <SectionHeader
                icon={ListChecks}
                title={t('projects.actionsTitle')}
                description={t('projects.actionsDesc')}
                action={
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-border-subtle bg-bg-elevated p-1">
                      {actionScopeOptions.map((option) => (
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
                    {actionItems.length > 5 && (
                      <button type="button" onClick={() => openInsightDialog('actions')} className="view-all-link">
                        {t('demo.viewAll')} ({actionItems.length})
                      </button>
                    )}
                  </div>
                }
              />
              <ActionChecklist items={actionItems.slice(0, 5)} />
            </section>

            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="surface-primary flex flex-col gap-3 rounded-2xl p-4">
                <SectionHeader
                  icon={Target}
                  title={t('projects.decisionsTitle')}
                  description={t('projects.decisionsDesc')}
                  action={
                    decisions.length > 4 ? (
                      <button type="button" onClick={() => openInsightDialog('decisions')} className="view-all-link">
                        {t('demo.viewAll')} ({decisions.length})
                      </button>
                    ) : undefined
                  }
                />
                <DecisionLog items={decisions.slice(0, 4)} />
              </div>
              <div className="surface-primary flex flex-col gap-3 rounded-2xl p-4">
                <SectionHeader
                  icon={ShieldAlert}
                  title={t('projects.risksTitle')}
                  description={t('projects.risksDesc')}
                  action={
                    risks.length > 4 ? (
                      <button type="button" onClick={() => openInsightDialog('risks')} className="view-all-link">
                        {t('demo.viewAll')} ({risks.length})
                      </button>
                    ) : undefined
                  }
                />
                <RiskPanel items={risks.slice(0, 4)} />
              </div>
            </section>

            <section className="surface-supporting flex flex-col gap-3 rounded-2xl p-4">
              <SectionHeader
                icon={History}
                title={t('projects.timelineTitle')}
                description={t('projects.timelineDesc')}
              />
              {periodItems.length === 0 ? (
                <EmptyState
                  icon={FileAudio}
                  title={t('projects.emptyTimelineTitle')}
                  description={t('projects.emptyTimelineDesc')}
                  action={<Button onClick={handleNewMeetingForProject} disabled={demoMode}>{t('projects.btnNewMeetingShort')}</Button>}
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border-subtle bg-bg-glass shadow-[var(--shadow-soft)]">
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
                      demoMode={demoMode}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-5">
            {isProjectGenerating ? (
              <TaskProcessingLoader
                title={t('workspace.loaderProjectSituationTitle')}
                description={t('workspace.loaderProjectSituationDesc')}
                steps={[
                  t('workspace.loaderProjectSituationStep1'),
                  t('workspace.loaderProjectSituationStep2'),
                  t('workspace.loaderProjectSituationStep3'),
                  t('workspace.loaderProjectSituationStep4'),
                ]}
                activeStep={2}
                progress={72}
                variant="project"
                compact
                helperText={t('workspace.loaderLocalHelper')}
              />
            ) : (
              <ProjectDigestPanel
                items={projectDigestGeneratedAt ? digestItems : []}
                generatedAt={projectDigestGeneratedAt}
              />
            )}

            <section className="surface-supporting rounded-2xl p-4">
              <SectionHeader
                icon={MoreHorizontal}
                title={t('projects.analysisTitle')}
                description={t('projects.analysisDesc')}
              />
              <div className="mt-4 flex flex-col gap-2">
                <AnalysisCTAButton
                  onClick={handleGenerateProjectSituation}
                  disabled={periodItems.length === 0 || isProjectGenerating}
                  isGenerated={Boolean(projectDigestGeneratedAt)}
                />
                <Button variant="secondary" size="sm" onClick={() => navigateTo('analysis')}>
                  <Sparkles className="h-4 w-4" />
                  {t('projects.btnCustomQuestion')}
                </Button>
              </div>
            </section>

            <AdvancedDetailsAccordion>
              <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 text-xs">
                <dt className="text-text-muted">{t('projects.techTotalMeetings')}</dt>
                <dd className="text-text-secondary">{selectedProject.items.length}</dd>
                <dt className="text-text-muted">{t('projects.techInRange')}</dt>
                <dd className="text-text-secondary">{periodItems.length}</dd>
                <dt className="text-text-muted">{t('projects.techAnalysisRuns')}</dt>
                <dd className="text-text-secondary">
                  {periodItems.reduce((count, item) => count + (item.analysis_runs?.length || 0), 0)}
                </dd>
                <dt className="text-text-muted">{t('projects.techRange')}</dt>
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

      {/* Insight detail dialog — progressive disclosure */}
      <InsightDetailDialog
        open={insightDialogOpen}
        onOpenChange={setInsightDialogOpen}
        initialTab={insightDialogTab}
        actions={actionItemsAll}
        decisions={decisions}
        risks={risks}
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
  demoMode,
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
  demoMode?: boolean;
}) {
  const status = projectItemStatus(item);
  const duration = getDurationSeconds(item.recording);
  const statusMeta = {
    recorded: { label: lang === 'it' ? 'Da trascrivere' : 'To transcribe', variant: 'warning' as const },
    transcribed: { label: lang === 'it' ? 'Da analizzare' : 'To analyze', variant: 'info' as const },
    ready: { label: lang === 'it' ? 'Insight pronti' : 'Insights ready', variant: 'success' as const },
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
              <Button size="sm" onClick={onSaveRename}>{lang === 'it' ? 'Salva' : 'Save'}</Button>
              <Button size="sm" variant="ghost" onClick={onCancelRename}>{lang === 'it' ? 'Annulla' : 'Cancel'}</Button>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">{recordingTitle(item.recording)}</h3>
            <button
              type="button"
              onClick={onRename}
              disabled={demoMode}
              className="text-text-muted transition-colors hover:text-text-primary"
              aria-label={lang === 'it' ? 'Rinomina meeting' : 'Rename meeting'}
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-text-muted">
          <span>{formatProjectDate(item.recording.created_at, lang)}</span>
          <span>{formatDuration(duration, (key, options) => {
            if (key === 'recording.durationNotAvailable') return lang === 'it' ? 'Durata n/d' : 'Duration n/a';
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
          {lang === 'it' ? 'Apri' : 'Open'}
        </Button>
        {!item.transcription && !demoMode && (
          <Button size="sm" variant="secondary" onClick={onTranscribe}>
            {lang === 'it' ? 'Trascrivi' : 'Transcribe'}
          </Button>
        )}
        {!demoMode && (
          <Button size="sm" variant="ghost" onClick={onAssignProject}>
            {lang === 'it' ? 'Progetto' : 'Project'}
          </Button>
        )}
      </div>
    </div>
  );
}
