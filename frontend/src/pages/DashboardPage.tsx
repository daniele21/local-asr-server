import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Clock3,
  FileAudio,
  ListChecks,
  Mic,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { ApiClient, Meeting } from '../api/apiClient';
import { getDemoMeetings } from '../features/demo/demoData';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TimeRangeFilter } from '../components/workspace/TimeRangeFilter';
import { TaskProcessingLoader } from '../components/workspace/TaskProcessingLoader';
import {
  ActionChecklist,
  AdvancedDetailsAccordion,
  DecisionLog,
  DigestPanel,
  EmptyState,
  MeetingCard,
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
  meetingTitle,
  resolveTimeRange,
  sortByNewest,
  sourceFromMeeting,
  uniqueInsightItems,
} from '../utils/meetingInsights';
import { useTranslation } from '../i18n/i18n';

interface DashboardPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
  demoMode?: boolean;
}



export default function DashboardPage({ navigateTo, demoMode = false }: DashboardPageProps) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeState>({ mode: 'today' });

  const rangeOptions = useMemo(() => [
    { mode: 'today' as const, label: lang === 'it' ? 'Oggi' : 'Today' },
    { mode: 'last3' as const, label: lang === 'it' ? 'Ultimi 3 giorni' : 'Last 3 days' },
    { mode: 'week' as const, label: lang === 'it' ? 'Settimana' : 'This week' },
    { mode: 'custom' as const, label: lang === 'it' ? 'Range custom' : 'Custom range' },
  ], [lang]);

  const load = async () => {
    try {
      setLoading(true);
      if (demoMode) {
        setMeetings(getDemoMeetings(lang));
        return;
      }
      const data = await ApiClient.listMeetings(120);
      setMeetings(data.items || []);
    } catch (error) {
      console.error('Failed to load meetings:', error);
      setMeetings(demoMode ? getDemoMeetings(lang) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [demoMode, lang]);

  const resolvedRange = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const rangeLabel = useMemo(() => formatTimeRangeLabel(timeRange, lang), [timeRange, lang]);
  const workspaceLoadingSteps = useMemo(() => [
    t('workspace.loaderDashboardStep1'),
    t('workspace.loaderDashboardStep2'),
    t('workspace.loaderDashboardStep3'),
  ], [t]);

  const searchedMeetings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return meetings;
    return meetings.filter((meeting) => {
      const haystack = [
        meetingTitle(meeting),
        meeting.project_name,
        meeting.transcription?.text?.slice(0, 800),
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [meetings, query]);

  const periodMeetings = useMemo(
    () => searchedMeetings.filter((meeting) => isWithinTimeRange(meeting.created_at, resolvedRange)),
    [searchedMeetings, resolvedRange]
  );

  const sources = useMemo(() => periodMeetings.map(sourceFromMeeting), [periodMeetings]);
  const actionItems = useMemo(
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

  const incompleteMeetings = useMemo(
    () => periodMeetings.filter((meeting) => meeting.status !== 'ready'),
    [periodMeetings]
  );
  const transcribedCount = periodMeetings.filter((meeting) => Boolean(meeting.transcription)).length;
  const analyzingCount = periodMeetings.filter((meeting) => meeting.status === 'analyzing' || meeting.jobs.some((job) => !['completed', 'failed', 'cancelled', 'interrupted'].includes(job.status))).length;
  const readyCount = periodMeetings.filter((meeting) => meeting.status === 'ready').length;

  if (loading) {
    return (
      <div className="py-16">
        <TaskProcessingLoader
          title={t('workspace.loaderDashboardTitle')}
          description={t('workspace.loaderDashboardDesc')}
          steps={workspaceLoadingSteps}
          activeStep={1}
          progress={66}
          variant="analysis"
          helperText={t('workspace.loaderLocalHelper')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="premium-hero rounded-2xl p-5 sm:p-6" data-tour="today-summary">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-accent">{rangeLabel}</span>
              <Badge variant="success">{t('dashboard.localBadge')}</Badge>
            </div>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">{t('dashboard.title')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button onClick={() => navigateTo('recording')} disabled={demoMode}>
              <Mic className="h-4 w-4" />
              {t('dashboard.btnRecord')}
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('transcription')} disabled={demoMode}>
              <FileAudio className="h-4 w-4" />
              {t('dashboard.btnImport')}
            </Button>
            {demoMode && <p className="basis-full text-xs text-text-muted lg:text-right">{t('dashboard.demoReadonlyHint')}</p>}
          </div>
        </div>
        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] xl:items-start">
          <div data-tour="time-range-filter" className="rounded-xl border border-border-subtle bg-bg-glass p-3">
            <p className="mb-2 text-xs text-text-muted">{t('dashboard.rangeHelper')}</p>
            <TimeRangeFilter value={timeRange} options={rangeOptions} onChange={setTimeRange} />
          </div>
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-slide-up">
        {[
          { label: t('dashboard.statPeriodMeetings'), value: periodMeetings.length, icon: FileAudio, color: 'text-accent', bgColor: 'bg-accent/10 border-accent/20' },
          { label: t('dashboard.statToTranscribe'), value: periodMeetings.length - transcribedCount, icon: Clock3, color: 'text-warning', bgColor: 'bg-warning/10 border-warning/20' },
          { label: t('dashboard.statAnalyzing'), value: analyzingCount, icon: Activity, color: 'text-info', bgColor: 'bg-info/10 border-info/20' },
          { label: t('dashboard.statOpenActions'), value: actionItems.length, icon: ListChecks, color: 'text-success', bgColor: 'bg-success/10 border-success/20' },
        ].map((item) => (
          <div key={item.label} className="metric-card group relative overflow-hidden rounded-xl border border-border-subtle p-4 transition-premium hover-lift hover:border-border-focus hover:bg-bg-hover hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
            <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/5 blur-xl transition-all duration-500 group-hover:scale-150" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted transition-colors group-hover:text-text-secondary">{item.label}</span>
              <span className={`inline-flex items-center justify-center rounded-lg border p-1.5 ${item.bgColor}`}>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="text-3xl font-bold tracking-tight text-text-primary">{item.value}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-5">
          <section className="workspace-panel flex flex-col gap-3 rounded-2xl border border-border-subtle p-4 theme-audio">
            <SectionHeader
              icon={FileAudio}
              title={t('dashboard.meetingsTitle')}
              description={t('dashboard.meetingsDesc')}
              tooltip={t('dashboard.meetingsTooltip')}
            />
            {periodMeetings.length === 0 ? (
              <EmptyState
                icon={Mic}
                title={t('dashboard.emptyMeetingsTitle')}
                description={t('dashboard.emptyMeetingsDesc')}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigateTo('recording')} disabled={demoMode}>{t('dashboard.btnRecord')}</Button>
                    <Button variant="secondary" onClick={() => navigateTo('transcription')} disabled={demoMode}>{t('dashboard.btnImport')}</Button>
                  </div>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {periodMeetings.slice(0, 24).map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    lang={lang}
                    onOpen={() => navigateTo('meeting', meeting.id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="workspace-panel flex flex-col gap-3 rounded-2xl border border-border-subtle p-4 theme-tasks" data-tour="open-actions">
              <SectionHeader
                icon={ListChecks}
                title={t('dashboard.statOpenActions')}
                description={t('dashboard.openActionsDesc')}
                tooltip={t('dashboard.openActionsTooltip')}
              />
              <ActionChecklist items={actionItems.slice(0, 8)} />
            </div>
            <div className="workspace-panel flex flex-col gap-3 rounded-2xl border border-border-subtle p-4 theme-decisions" data-tour="decision-log">
              <SectionHeader
                icon={Target}
                title={t('dashboard.decisionsTitle')}
                description={t('dashboard.decisionsDesc')}
                tooltip={t('dashboard.decisionsTooltip')}
              />
              <DecisionLog items={decisions.slice(0, 8)} />
            </div>
          </section>
        </main>

        <aside className="flex flex-col gap-4">
          <DigestPanel items={digestItems} title={t('dashboard.digestTitle')} />

          <section className="workspace-panel rounded-2xl border border-border-subtle p-4 theme-pipeline">
            <SectionHeader
              icon={AlertTriangle}
              title={t('dashboard.toCompleteTitle')}
              description={t('dashboard.toCompleteDesc')}
            />
            <div className="mt-3 flex flex-col gap-2">
              {incompleteMeetings.slice(0, 6).map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => navigateTo('meeting', meeting.id)}
                  className="rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-left transition-premium hover:border-border-focus hover:bg-bg-hover"
                >
                  <div className="truncate text-xs font-semibold text-text-primary">{meetingTitle(meeting)}</div>
                  <div className="mt-0.5 text-[11px] text-text-muted">
                    {!meeting.transcription ? t('dashboard.missingTranscription') : t('dashboard.missingInsights')}
                  </div>
                </button>
              ))}
              {incompleteMeetings.length === 0 && (
                <p className="text-xs text-text-muted">{t('dashboard.noOpenPipeline')}</p>
              )}
            </div>
          </section>

          <section className="workspace-panel flex flex-col gap-3 rounded-2xl border border-border-subtle p-4 theme-risks" data-tour="risk-panel">
            <SectionHeader
              icon={Sparkles}
              title={t('dashboard.risksTitle')}
              description={t('dashboard.risksDesc')}
            />
            <RiskPanel items={risks.slice(0, 5)} />
          </section>

          <AdvancedDetailsAccordion>
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-xs">
              <dt className="text-text-muted">{t('dashboard.techLoaded')}</dt>
              <dd className="text-text-secondary">{meetings.length}</dd>
              <dt className="text-text-muted">{t('dashboard.techFiltered')}</dt>
              <dd className="text-text-secondary">{periodMeetings.length}</dd>
              <dt className="text-text-muted">{t('dashboard.techReady')}</dt>
              <dd className="text-text-secondary">{readyCount}</dd>
              <dt className="text-text-muted">{t('dashboard.techActive')}</dt>
              <dd className="text-text-secondary">{analyzingCount}</dd>
              <dt className="text-text-muted">{t('dashboard.techRange')}</dt>
              <dd className="truncate text-text-secondary">{rangeLabel}</dd>
            </dl>
          </AdvancedDetailsAccordion>
        </aside>
      </section>
    </div>
  );
}
