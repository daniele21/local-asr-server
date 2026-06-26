/**
 * DashboardPage.tsx
 * Main "Today" view — progressive disclosure layout.
 *
 * Information hierarchy:
 *   Level 1 (Hero)      — Period selector, record CTA, 4 smart KPIs
 *   Level 2 (Spotlight) — Top 3 meetings, top 3 actions, top 2 digest snippets
 *   Level 3 (On-demand) — Full lists, decisions, risks open in Dialog
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileAudio,
  ListChecks,
  Mic,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { ApiClient, Meeting } from '../api/apiClient';
import { getDemoMeetings } from '../features/demo/demoData';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Tooltip } from '../components/ui/Tooltip';
import { TaskProcessingLoader } from '../components/workspace/TaskProcessingLoader';
import { InsightDetailDialog, InsightTab } from '../components/workspace/InsightDetailDialog';
import { MeetingListDialog } from '../components/workspace/MeetingListDialog';
import {
  AdvancedDetailsAccordion,
  DigestPanel,
  EmptyState,
  GuidanceCallout,
  MeetingCard,
  SectionHeader,
} from '../components/workspace/MeetingWorkspace';
import { EmptyStateHero } from '../components/ui/EmptyStateHero';
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
import { cn } from '../utils/cn';

interface DashboardPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
  demoMode?: boolean;
  onActivateDemo?: () => void;
}

// ─── Small "view all" action link ────────────────────────────────────────────

function ViewAllLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="view-all-link">
      {label}
      <ChevronRight className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Smart KPI card — hides when value is 0 ──────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  alwaysShow = false,
}: {
  label: string;
  value: number;
  icon: typeof FileAudio;
  color: string;
  bgColor: string;
  alwaysShow?: boolean;
}) {
  if (value === 0 && !alwaysShow) return null;
  return (
    <div className="metric-card group relative overflow-hidden rounded-xl border border-border-subtle p-4 transition-premium hover-lift hover:border-border-focus hover:bg-bg-hover hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-accent/5 blur-xl transition-all duration-500 group-hover:scale-150" />
      <div className="flex items-center justify-between">
        <span className="text-min-readable font-medium uppercase text-text-muted transition-colors group-hover:text-text-secondary">
          {label}
        </span>
        <span className={`inline-flex items-center justify-center rounded-lg border p-1.5 ${bgColor}`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-text-primary">{value}</span>
      </div>
    </div>
  );
}

// ─── Compact insight preview (actions/decisions/risks) ────────────────────────

function InsightPreviewCard({
  text,
  meta,
  onClick,
  variant = 'default',
}: {
  text: string;
  meta?: string;
  onClick?: () => void;
  variant?: 'default' | 'warning';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'insight-card-compact w-full text-left',
        variant === 'warning' && 'border-warning/20 bg-warning/5 hover:border-warning/40 hover:bg-warning/10',
      )}
    >
      <p className="line-clamp-2 text-sm leading-snug text-text-primary">{text}</p>
      {meta && <p className="mt-1 truncate text-xs text-text-muted">{meta}</p>}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage({
  navigateTo,
  demoMode = false,
  onActivateDemo,
}: DashboardPageProps) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeState>({ mode: 'today' });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dialog state
  const [insightDialogOpen, setInsightDialogOpen] = useState(false);
  const [insightDialogTab, setInsightDialogTab] = useState<InsightTab>('actions');
  const [meetingListDialogOpen, setMeetingListDialogOpen] = useState(false);

  useEffect(() => {
    if (isDropdownOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownCoords({ top: rect.bottom + window.scrollY, left: rect.left + window.scrollX });
    }
  }, [isDropdownOpen]);

  const rangeOptions = useMemo(() => [
    { mode: 'today' as const, label: lang === 'it' ? 'Oggi' : 'Today' },
    { mode: 'last3' as const, label: lang === 'it' ? 'Ultimi 3 giorni' : 'Last 3 days' },
    { mode: 'week' as const, label: lang === 'it' ? 'Settimana' : 'This week' },
    { mode: 'custom' as const, label: lang === 'it' ? 'Range custom' : 'Custom range' },
  ], [lang]);

  const load = async () => {
    try {
      setLoading(true);
      if (demoMode) { setMeetings(getDemoMeetings(lang)); return; }
      const data = await ApiClient.listMeetings(120);
      setMeetings(data.items || []);
    } catch (error) {
      console.error('Failed to load meetings:', error);
      setMeetings(demoMode ? getDemoMeetings(lang) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [demoMode, lang]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setIsSearchOpen(true); }
      if (e.key === 'Escape') { setIsSearchOpen(false); setIsDropdownOpen(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ─── Computed data ──────────────────────────────────────────────────────────

  const resolvedRange = useMemo(() => resolveTimeRange(timeRange), [timeRange]);
  const rangeLabel = useMemo(() => formatTimeRangeLabel(timeRange, lang), [timeRange, lang]);

  const searchedMeetings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return meetings;
    return meetings.filter((m) =>
      [meetingTitle(m), m.project_name, m.transcription?.text?.slice(0, 800)].join(' ').toLowerCase().includes(needle),
    );
  }, [meetings, query]);

  const periodMeetings = useMemo(
    () => searchedMeetings.filter((m) => isWithinTimeRange(m.created_at, resolvedRange)),
    [searchedMeetings, resolvedRange],
  );

  const sources = useMemo(() => periodMeetings.map(sourceFromMeeting), [periodMeetings]);
  const actionItems = useMemo(
    () => sortByNewest(uniqueInsightItems(sources.flatMap(extractActionItems))).filter((item) => !item.completed),
    [sources],
  );
  const decisions = useMemo(() => sortByNewest(uniqueInsightItems(sources.flatMap(extractDecisions))), [sources]);
  const risks = useMemo(() => sortByNewest(uniqueInsightItems(sources.flatMap(extractRisks))), [sources]);
  const digestItems = useMemo(
    () => sortByNewest(sources.map(extractDigest).filter((item): item is NonNullable<typeof item> => Boolean(item))),
    [sources],
  );

  const incompleteMeetings = useMemo(
    () => periodMeetings.filter((m) => m.status !== 'ready'),
    [periodMeetings],
  );
  const transcribedCount = periodMeetings.filter((m) => Boolean(m.transcription)).length;
  const analyzingCount = periodMeetings.filter(
    (m) => m.status === 'analyzing' || m.jobs.some((j) => !['completed', 'failed', 'cancelled', 'interrupted'].includes(j.status)),
  ).length;
  const readyCount = periodMeetings.filter((m) => m.status === 'ready').length;

  const hasAnyData = meetings.length > 0;

  // ─── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-16">
        <TaskProcessingLoader
          title={t('workspace.loaderDashboardTitle')}
          description={t('workspace.loaderDashboardDesc')}
          steps={[t('workspace.loaderDashboardStep1'), t('workspace.loaderDashboardStep2'), t('workspace.loaderDashboardStep3')]}
          activeStep={1}
          progress={66}
          variant="analysis"
          helperText={t('workspace.loaderLocalHelper')}
        />
      </div>
    );
  }

  const activeOption = rangeOptions.find((opt) => opt.mode === timeRange.mode);
  const activeLabel = activeOption ? activeOption.label : '';

  // ─── Empty state (no data, not demo) ────────────────────────────────────────

  if (!hasAnyData && !demoMode) {
    return (
      <EmptyStateHero
        icon={Mic}
        title={t('demo.emptyTitle')}
        description={t('demo.emptyDesc')}
        primaryAction={
          <Button size="lg" onClick={() => navigateTo('recording')}>
            <Mic className="h-5 w-5" />
            {t('demo.emptyCta')}
          </Button>
        }
        secondaryAction={
          onActivateDemo ? (
            <Button size="lg" variant="secondary" onClick={onActivateDemo}>
              <Sparkles className="h-5 w-5" />
              {t('demo.emptyCtaDemo')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5 animate-page-in">
      {/* ── LEVEL 1: Hero — period picker + record CTA ── */}
      <section
        data-tour="today-summary"
        className="premium-hero page-hero rounded-2xl p-5 sm:p-6"
      >
        <span className="hero-orbital-line" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title + period picker */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase text-accent">{rangeLabel}</span>
              <Badge variant="success">{t('dashboard.localBadge')}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Period dropdown */}
              <div className="relative">
                <button
                  ref={triggerRef}
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 rounded-xl bg-transparent px-0 py-0 text-3xl font-bold text-text-primary outline-none transition-colors hover:text-accent sm:text-4xl"
                >
                  <span>{activeLabel}</span>
                  <ChevronDown className="h-6 w-6 shrink-0 text-text-muted" />
                </button>
                {isDropdownOpen && dropdownCoords && createPortal(
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)} />
                    <div
                      style={{ position: 'absolute', top: `${dropdownCoords.top + 6}px`, left: `${dropdownCoords.left}px` }}
                      className="z-50 w-48 rounded-xl border border-border-subtle bg-bg-elevated p-1 shadow-premium animate-in fade-in slide-in-from-top-1 duration-150"
                    >
                      {rangeOptions.map((option) => (
                        <button
                          key={option.mode}
                          type="button"
                          onClick={() => { setTimeRange({ ...timeRange, mode: option.mode }); setIsDropdownOpen(false); }}
                          className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition-all ${
                            timeRange.mode === option.mode
                              ? 'bg-accent/15 text-accent'
                              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>,
                  document.body,
                )}
              </div>

              {/* Custom date range */}
              {timeRange.mode === 'custom' && (
                <div className="flex items-center gap-1.5 text-xs animate-in fade-in slide-in-from-left-2 duration-200">
                  <input
                    type="date"
                    value={timeRange.startDate || ''}
                    onChange={(e) => setTimeRange({ ...timeRange, startDate: e.target.value })}
                    className="h-8 rounded-lg border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary outline-none transition-premium focus:border-border-focus"
                  />
                  <span className="text-text-muted">-</span>
                  <input
                    type="date"
                    value={timeRange.endDate || ''}
                    onChange={(e) => setTimeRange({ ...timeRange, endDate: e.target.value })}
                    className="h-8 rounded-lg border border-border-subtle bg-bg-elevated px-2 text-xs text-text-primary outline-none transition-premium focus:border-border-focus"
                  />
                </div>
              )}

              {/* Search icon */}
              <Tooltip content={t('dashboard.searchPlaceholder')}>
                <button
                  type="button"
                  onClick={() => setIsSearchOpen(true)}
                  className="pressable p-2 text-text-muted hover:text-text-primary hover:bg-bg-hover rounded-xl border border-transparent hover:border-border-focus transition-premium"
                >
                  <Search className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-text-secondary">{t('dashboard.subtitle')}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg" onClick={() => navigateTo('recording')} disabled={demoMode}>
              <Mic className="h-5 w-5" />
              {t('dashboard.btnRecord')}
            </Button>
            <GuidanceCallout
              icon={ShieldCheck}
              title={t('dashboard.heroGuidanceTitle')}
              description={demoMode ? t('dashboard.demoReadonlyHint') : t('dashboard.heroGuidanceDesc')}
              className="hidden xl:block max-w-xs"
            />
          </div>
        </div>
      </section>

      {/* ── LEVEL 1: Smart KPIs (hidden when 0) ── */}
      {periodMeetings.length > 0 && (
        <section className="stagger-list grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label={t('dashboard.statPeriodMeetings')}
            value={periodMeetings.length}
            icon={FileAudio}
            color="text-accent"
            bgColor="bg-accent/10 border-accent/20"
            alwaysShow
          />
          <KpiCard
            label={t('dashboard.statToTranscribe')}
            value={periodMeetings.length - transcribedCount}
            icon={Clock3}
            color="text-warning"
            bgColor="bg-warning/10 border-warning/20"
          />
          <KpiCard
            label={t('dashboard.statAnalyzing')}
            value={analyzingCount}
            icon={Activity}
            color="text-info"
            bgColor="bg-info/10 border-info/20"
          />
          <KpiCard
            label={t('dashboard.statOpenActions')}
            value={actionItems.length}
            icon={ListChecks}
            color="text-success"
            bgColor="bg-success/10 border-success/20"
          />
        </section>
      )}

      {/* ── LEVEL 2: Main content — Spotlight ── */}
      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="flex min-w-0 flex-col gap-5">

          {/* Meetings spotlight — top 3 */}
          <section className="surface-primary flex flex-col gap-3 rounded-2xl p-4 theme-audio" data-tour="today-meetings">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader
                icon={FileAudio}
                title={t('dashboard.meetingsTitle')}
                description={t('dashboard.meetingsDesc')}
                tooltip={t('dashboard.meetingsTooltip')}
              />
              {periodMeetings.length > 3 && (
                <ViewAllLink
                  onClick={() => setMeetingListDialogOpen(true)}
                  label={`${t('demo.viewAllMeetings').replace('→', '')}(${periodMeetings.length}) →`}
                />
              )}
            </div>

            {/* Active search filter banner */}
            {query && (
              <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-elevated p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <span className="text-xs text-text-secondary">
                  {lang === 'it' ? 'Filtro:' : 'Filter:'}{' '}
                  <strong className="text-text-primary">"{query}"</strong>{' '}
                  ({periodMeetings.length} {lang === 'it' ? 'risultati' : 'results'})
                </span>
                <button onClick={() => setQuery('')} className="text-xs font-semibold text-accent hover:underline">
                  {lang === 'it' ? 'Azzera' : 'Clear'}
                </button>
              </div>
            )}

            {periodMeetings.length === 0 ? (
              <EmptyState
                icon={Mic}
                title={t('dashboard.emptyMeetingsTitle')}
                description={t('dashboard.emptyMeetingsDesc')}
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => navigateTo('recording')} disabled={demoMode}>{t('dashboard.btnRecord')}</Button>
                  </div>
                }
              />
            ) : (
              <div className="flex flex-col gap-3">
                {/* Show top 3, rest accessible via dialog */}
                {periodMeetings.slice(0, 3).map((meeting) => (
                  <MeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    lang={lang}
                    onOpen={() => navigateTo('meeting', meeting.id)}
                  />
                ))}
                {/* View all trigger */}
                {periodMeetings.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setMeetingListDialogOpen(true)}
                    className="rounded-xl border border-dashed border-border-subtle py-3 text-center text-xs font-semibold text-text-muted transition-all hover:border-border-focus hover:bg-bg-hover hover:text-accent"
                  >
                    {lang === 'it'
                      ? `+ ${periodMeetings.length - 3} altri meeting`
                      : `+ ${periodMeetings.length - 3} more meetings`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Actions preview — top 3, rest in dialog */}
          <section
            className="surface-primary flex flex-col gap-3 rounded-2xl p-4 theme-tasks"
            data-tour="open-actions"
          >
            <div className="flex items-center justify-between gap-3">
              <SectionHeader
                icon={ListChecks}
                title={t('dashboard.statOpenActions')}
                description={t('dashboard.openActionsDesc')}
                tooltip={t('dashboard.openActionsTooltip')}
              />
              {actionItems.length > 3 && (
                <ViewAllLink
                  onClick={() => { setInsightDialogTab('actions'); setInsightDialogOpen(true); }}
                  label={t('demo.viewAllActions')}
                />
              )}
            </div>

            {actionItems.length === 0 ? (
              <p className="text-xs text-text-muted py-3">{t('workspace.emptyActionsTitle')}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {actionItems.slice(0, 3).map((item) => (
                  <InsightPreviewCard
                    key={item.id}
                    text={item.text}
                    meta={[item.owner, item.dueDate ? `Due: ${item.dueDate}` : '', item.sourceTitle].filter(Boolean).join(' · ')}
                    onClick={() => { setInsightDialogTab('actions'); setInsightDialogOpen(true); }}
                  />
                ))}
                {actionItems.length > 3 && (
                  <button
                    type="button"
                    onClick={() => { setInsightDialogTab('actions'); setInsightDialogOpen(true); }}
                    className="view-all-link py-1"
                  >
                    {lang === 'it' ? `Vedi tutte le ${actionItems.length} azioni` : `View all ${actionItems.length} actions`}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Decisions + Risks row — compact preview */}
          {(decisions.length > 0 || risks.length > 0) && (
            <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {decisions.length > 0 && (
                <div className="surface-primary flex flex-col gap-3 rounded-2xl p-4 theme-decisions" data-tour="decision-log">
                  <div className="flex items-center justify-between gap-3">
                    <SectionHeader icon={Target} title={t('dashboard.decisionsTitle')} description={t('dashboard.decisionsDesc')} />
                    {decisions.length > 2 && (
                      <ViewAllLink
                        onClick={() => { setInsightDialogTab('decisions'); setInsightDialogOpen(true); }}
                        label={t('demo.viewAllDecisions')}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {decisions.slice(0, 2).map((item) => (
                      <InsightPreviewCard
                        key={item.id}
                        text={item.text}
                        meta={item.sourceTitle}
                        onClick={() => { setInsightDialogTab('decisions'); setInsightDialogOpen(true); }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {risks.length > 0 && (
                <div className="surface-primary flex flex-col gap-3 rounded-2xl p-4 theme-risks" data-tour="risk-panel">
                  <div className="flex items-center justify-between gap-3">
                    <SectionHeader icon={ShieldAlert} title={t('dashboard.risksTitle')} description={t('dashboard.risksDesc')} />
                    {risks.length > 2 && (
                      <ViewAllLink
                        onClick={() => { setInsightDialogTab('risks'); setInsightDialogOpen(true); }}
                        label={t('demo.viewAllRisks')}
                      />
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {risks.slice(0, 2).map((item) => (
                      <InsightPreviewCard
                        key={item.id}
                        text={item.text}
                        meta={item.sourceTitle}
                        variant="warning"
                        onClick={() => { setInsightDialogTab('risks'); setInsightDialogOpen(true); }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </main>

        {/* ── Aside ── */}
        <aside className="flex flex-col gap-4">
          {/* Digest */}
          <DigestPanel items={digestItems.slice(0, 2)} title={t('dashboard.digestTitle')} />

          {/* Incomplete pipeline */}
          {incompleteMeetings.length > 0 && (
            <section className="surface-supporting rounded-2xl p-4 theme-pipeline">
              <SectionHeader icon={AlertTriangle} title={t('dashboard.toCompleteTitle')} description={t('dashboard.toCompleteDesc')} />
              <div className="mt-3 flex flex-col gap-2">
                {incompleteMeetings.slice(0, 4).map((meeting) => (
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
                {incompleteMeetings.length > 4 && (
                  <button
                    type="button"
                    onClick={() => setMeetingListDialogOpen(true)}
                    className="view-all-link py-1"
                  >
                    {lang === 'it' ? `+ ${incompleteMeetings.length - 4} altri` : `+ ${incompleteMeetings.length - 4} more`}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Technical details */}
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

      {/* ── LEVEL 3: On-demand dialogs ── */}
      <InsightDetailDialog
        open={insightDialogOpen}
        onOpenChange={setInsightDialogOpen}
        initialTab={insightDialogTab}
        actions={actionItems}
        decisions={decisions}
        risks={risks}
      />

      <MeetingListDialog
        open={meetingListDialogOpen}
        onOpenChange={setMeetingListDialogOpen}
        meetings={periodMeetings}
        onOpenMeeting={(id) => navigateTo('meeting', id)}
      />

      {/* ── Search overlay ── */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-md pt-[10vh] px-4 animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setIsSearchOpen(false)} />
          <div className="relative w-full max-w-2xl bg-bg-surface border border-border-subtle rounded-2xl shadow-premium overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle bg-bg-elevated">
              <Search className="h-5 w-5 text-text-muted shrink-0" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('dashboard.searchPlaceholder')}
                className="w-full bg-transparent text-text-primary placeholder:text-text-muted outline-none text-base"
              />
              {query && (
                <button onClick={() => setQuery('')} className="p-1 hover:bg-bg-hover rounded-full text-text-muted hover:text-text-primary transition-all">
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setIsSearchOpen(false)}
                className="text-xs px-2.5 py-1 border border-border-subtle hover:border-border-focus hover:bg-bg-hover rounded-lg text-text-secondary transition-all"
              >
                Esc
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {searchedMeetings.length === 0 ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  {lang === 'it' ? 'Nessun meeting trovato' : 'No meetings found'}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <div className="px-3 py-1.5 text-xs font-semibold text-text-muted uppercase">
                    {lang === 'it' ? 'Risultati' : 'Results'} ({searchedMeetings.length})
                  </div>
                  {searchedMeetings.map((meeting) => (
                    <button
                      key={meeting.id}
                      onClick={() => { navigateTo('meeting', meeting.id); setIsSearchOpen(false); }}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-transparent hover:border-border-focus hover:bg-bg-hover text-left transition-all group"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-text-primary group-hover:text-accent transition-colors truncate">
                          {meetingTitle(meeting)}
                        </div>
                        <div className="text-xs text-text-muted truncate mt-0.5">
                          {meeting.project_name || (lang === 'it' ? 'Nessun Progetto' : 'No Project')}
                        </div>
                      </div>
                      <div className="text-xs text-text-muted shrink-0 ml-4">
                        {new Date(meeting.created_at).toLocaleDateString(lang)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
