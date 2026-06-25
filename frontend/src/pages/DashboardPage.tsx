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
}

const HOME_RANGE_OPTIONS = [
  { mode: 'today' as const, label: 'Oggi' },
  { mode: 'last3' as const, label: 'Ultimi 3 giorni' },
  { mode: 'week' as const, label: 'Settimana' },
  { mode: 'custom' as const, label: 'Range custom' },
];

export default function DashboardPage({ navigateTo }: DashboardPageProps) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeState>({ mode: 'today' });

  const load = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.listMeetings(120);
      setMeetings(data.items || []);
    } catch (error) {
      console.error('Failed to load meetings:', error);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5 border-b border-border-subtle pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-widest text-accent">{rangeLabel}</span>
            <h2 className="mt-1 text-3xl font-semibold text-text-primary">Oggi</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-text-secondary">
              Cosa è successo nei meeting selezionati e cosa richiede attenzione adesso.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigateTo('recording')}>
              <Mic className="h-4 w-4" />
              Registra meeting
            </Button>
            <Button variant="secondary" onClick={() => navigateTo('transcription')}>
              <FileAudio className="h-4 w-4" />
              Importa audio
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <TimeRangeFilter value={timeRange} options={HOME_RANGE_OPTIONS} onChange={setTimeRange} />
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cerca meeting, progetto o testo"
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            />
          </label>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle lg:grid-cols-4">
        {[
          { label: 'Meeting nel periodo', value: periodMeetings.length, icon: FileAudio },
          { label: 'Da trascrivere', value: periodMeetings.length - transcribedCount, icon: Clock3 },
          { label: 'Analisi in corso', value: analyzingCount, icon: Activity },
          { label: 'Azioni aperte', value: actionItems.length, icon: ListChecks },
        ].map((item) => (
          <div key={item.label} className="bg-bg-elevated px-4 py-3">
            <item.icon className="mb-2 h-4 w-4 text-text-muted" />
            <div className="text-2xl font-semibold text-text-primary">{item.value}</div>
            <div className="text-[11px] uppercase tracking-wider text-text-muted">{item.label}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-6">
          <section className="flex flex-col gap-3">
            <SectionHeader
              icon={FileAudio}
              title="Meeting nel periodo"
              description="Il filtro selezionato governa questa lista e tutti i blocchi della pagina."
              tooltip="Default: solo i meeting di oggi. Estendi il periodo con i chip o un range custom."
            />
            {periodMeetings.length === 0 ? (
              <EmptyState
                icon={Mic}
                title="Nessun meeting nel periodo"
                description="Registra un meeting o importa un audio. I meeting fuori dal periodo restano nascosti finché non cambi filtro."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigateTo('recording')}>Registra meeting</Button>
                    <Button variant="secondary" onClick={() => navigateTo('transcription')}>Importa audio</Button>
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

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <SectionHeader
                icon={ListChecks}
                title="Azioni aperte"
                description="Task derivati dalle analisi action item già disponibili."
                tooltip="Le azioni sono lette dagli ultimi risultati strutturati dei meeting nel periodo."
              />
              <ActionChecklist items={actionItems.slice(0, 8)} />
            </div>
            <div className="flex flex-col gap-3">
              <SectionHeader
                icon={Target}
                title="Decisioni recenti"
                description="Decision log ordinato dai meeting più recenti del periodo."
                tooltip="Non rilegge i transcript: usa l'ultimo output decisioni salvato per ciascun meeting."
              />
              <DecisionLog items={decisions.slice(0, 8)} />
            </div>
          </section>
        </main>

        <aside className="flex flex-col gap-5">
          <DigestPanel items={digestItems} title="Digest del periodo" />

          <section className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
            <SectionHeader
              icon={AlertTriangle}
              title="Da completare"
              description="Meeting del periodo che richiedono trascrizione, analisi o revisione."
            />
            <div className="mt-4 flex flex-col gap-2">
              {incompleteMeetings.slice(0, 6).map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => navigateTo('meeting', meeting.id)}
                  className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-left transition-colors hover:border-border-focus hover:bg-bg-hover"
                >
                  <div className="truncate text-xs font-semibold text-text-primary">{meetingTitle(meeting)}</div>
                  <div className="mt-1 text-[11px] text-text-muted">
                    {!meeting.transcription ? 'Trascrizione mancante' : 'Insight da completare'}
                  </div>
                </button>
              ))}
              {incompleteMeetings.length === 0 && (
                <p className="text-xs text-text-muted">Nessuna pipeline aperta nel periodo.</p>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeader
              icon={Sparkles}
              title="Rischi e blocker"
              description="Segnali aggregati dalle analisi rischi del periodo."
            />
            <RiskPanel items={risks.slice(0, 5)} />
          </section>

          <AdvancedDetailsAccordion>
            <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-2 text-xs">
              <dt className="text-text-muted">Meeting caricati</dt>
              <dd className="text-text-secondary">{meetings.length}</dd>
              <dt className="text-text-muted">Meeting filtrati</dt>
              <dd className="text-text-secondary">{periodMeetings.length}</dd>
              <dt className="text-text-muted">Pronti</dt>
              <dd className="text-text-secondary">{readyCount}</dd>
              <dt className="text-text-muted">Job attivi</dt>
              <dd className="text-text-secondary">{analyzingCount}</dd>
              <dt className="text-text-muted">Range</dt>
              <dd className="truncate text-text-secondary">{rangeLabel}</dd>
            </dl>
          </AdvancedDetailsAccordion>
        </aside>
      </section>
    </div>
  );
}
