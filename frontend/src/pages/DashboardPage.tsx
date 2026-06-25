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
import { TimeRangeFilter } from '../components/workspace/TimeRangeFilter';
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
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        <span className="text-sm text-text-secondary">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 border-b border-border-subtle pb-4" data-tour="today-summary">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">{rangeLabel}</span>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{t('dashboard.title')}</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
              {t('dashboard.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigateTo('recording')} disabled={demoMode}>
              <Mic className="h-4 w-4" />
              {t('dashboard.btnRecord')}
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('transcription')} disabled={demoMode}>
              <FileAudio className="h-4 w-4" />
              {t('dashboard.btnImport')}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div data-tour="time-range-filter">
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

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: t('dashboard.statPeriodMeetings'), value: periodMeetings.length, icon: FileAudio, color: 'text-accent', bgColor: 'bg-accent/10 border-accent/20' },
          { label: t('dashboard.statToTranscribe'), value: periodMeetings.length - transcribedCount, icon: Clock3, color: 'text-warning', bgColor: 'bg-warning/10 border-warning/20' },
          { label: t('dashboard.statAnalyzing'), value: analyzingCount, icon: Activity, color: 'text-info', bgColor: 'bg-info/10 border-info/20' },
          { label: t('dashboard.statOpenActions'), value: actionItems.length, icon: ListChecks, color: 'text-success', bgColor: 'bg-success/10 border-success/20' },
        ].map((item) => (
          <div key={item.label} className="group relative overflow-hidden rounded-xl border border-border-subtle bg-bg-surface/50 p-4 transition-all duration-300 hover:border-border-focus hover:bg-bg-hover hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
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
          <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface/20 p-4 theme-audio">
            <SectionHeader
              icon={FileAudio}
              title={t('dashboard.statPeriodMeetings')}
              description={lang === 'it' ? 'Il filtro selezionato governa questa lista e tutti i blocchi della pagina.' : 'The selected filter rules this list and all blocks on the page.'}
              tooltip={lang === 'it' ? 'Default: solo i meeting di oggi. Estendi il periodo con i chip o un range custom.' : "Default: today's meetings only. Extend the period with chips or a custom range."}
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
            <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface/20 p-4 theme-tasks" data-tour="open-actions">
              <SectionHeader
                icon={ListChecks}
                title={t('dashboard.statOpenActions')}
                description={lang === 'it' ? 'Task derivati dalle analisi action item già disponibili.' : 'Tasks derived from available action item analyses.'}
                tooltip={lang === 'it' ? 'Le azioni sono lette dagli ultimi risultati strutturati dei meeting nel periodo.' : 'Actions are read from the latest structured results of meetings in the period.'}
              />
              <ActionChecklist items={actionItems.slice(0, 8)} />
            </div>
            <div className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface/20 p-4 theme-decisions" data-tour="decision-log">
              <SectionHeader
                icon={Target}
                title={lang === 'it' ? 'Decisioni recenti' : 'Recent decisions'}
                description={lang === 'it' ? 'Decision log ordinato dai meeting più recenti del periodo.' : 'Decision log ordered by the most recent meetings of the period.'}
                tooltip={lang === 'it' ? 'Non rilegge i transcript: usa l\'ultimo output decisioni salvato per ciascun meeting.' : 'Does not reread transcripts: uses the last saved decisions output for each meeting.'}
              />
              <DecisionLog items={decisions.slice(0, 8)} />
            </div>
          </section>
        </main>

        <aside className="flex flex-col gap-4">
          <DigestPanel items={digestItems} title={t('dashboard.digestTitle')} />

          <section className="rounded-xl border border-border-subtle bg-bg-surface/20 p-4 theme-pipeline">
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
                  className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-1.5 text-left transition-colors hover:border-border-focus hover:bg-bg-hover"
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

          <section className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-bg-surface/20 p-4 theme-risks" data-tour="risk-panel">
            <SectionHeader
              icon={Sparkles}
              title={lang === 'it' ? 'Rischi e blocker' : 'Risks and blockers'}
              description={lang === 'it' ? 'Segnali aggregati dalle analisi rischi del periodo.' : 'Aggregated signals from risk analyses of the period.'}
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
