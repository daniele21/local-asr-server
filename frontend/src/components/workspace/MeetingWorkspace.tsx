import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  FileAudio,
  FolderKanban,
  Info,
  ListChecks,
  MessageSquare,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Meeting, Project } from '../../api/apiClient';
import { ANALYSIS_TYPE_LABELS } from '../../api/config';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { formatProjectDate, getDurationSeconds } from '../../utils/formatters';
import { DigestItem, InsightItem, meetingTitle } from '../../utils/meetingInsights';
import { cn } from '../../utils/cn';

const statusCopy: Record<string, { label: string; variant: 'idle' | 'success' | 'warning' | 'info' | 'danger' }> = {
  recording: { label: 'In registrazione', variant: 'warning' },
  recorded: { label: 'Audio pronto', variant: 'idle' },
  transcribed: { label: 'Trascritto', variant: 'info' },
  analyzing: { label: 'Analisi in corso', variant: 'warning' },
  ready: { label: 'Insight pronti', variant: 'success' },
  failed: { label: 'Errore', variant: 'danger' },
};

function limitText(value: string, max = 150): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function actionLabel(meeting: Meeting): string {
  if (!meeting.transcription) return 'Trascrivi';
  if (Object.keys(meeting.latest_analysis || {}).length === 0) return 'Analizza';
  return 'Apri insight';
}

export function ExplainTooltip({ content }: { content: string }) {
  return (
    <Tooltip content={content}>
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border-subtle text-text-muted hover:border-border-focus hover:text-text-primary">
        <Info className="h-3.5 w-3.5" />
      </span>
    </Tooltip>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  description,
  tooltip,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tooltip?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {tooltip && <ExplainTooltip content={tooltip} />}
        </div>
        {description && <p className="mt-1 text-xs leading-relaxed text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Circle,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-dashed border-border-subtle bg-bg-elevated/55 px-5 py-8 text-center', className)}>
      <Icon className="mx-auto mb-3 h-8 w-8 text-text-muted" />
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-text-secondary">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function AdvancedDetailsAccordion({
  children,
  title = 'Dettagli avanzati',
  description = 'Stato tecnico, run e riferimenti usati per ricostruire questa vista.',
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  return (
    <details className="group rounded-lg border border-border-subtle bg-bg-elevated">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-primary">
        <span>
          {title}
          <span className="block text-xs font-normal text-text-muted">{description}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border-subtle p-4">{children}</div>
    </details>
  );
}

export function MeetingCard({
  meeting,
  lang,
  onOpen,
}: {
  meeting: Meeting;
  lang: string;
  onOpen: () => void;
}) {
  const status = statusCopy[meeting.status] || { label: meeting.status, variant: 'idle' as const };
  const duration = getDurationSeconds(meeting.recording);
  const analysisTypes = Object.keys(meeting.latest_analysis || {});
  return (
    <article className="group rounded-lg border border-border-subtle bg-bg-elevated p-4 shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-all duration-200 hover:-translate-y-0.5 hover:border-border-focus hover:bg-bg-hover">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">{meetingTitle(meeting)}</h3>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatProjectDate(meeting.created_at, lang)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {duration > 0 ? `${Math.round(duration / 60)} min` : 'Durata n/d'}
            </span>
            {meeting.project_name && (
              <span className="inline-flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5" />
                {meeting.project_name}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 lg:w-[260px]">
          <div className="flex flex-wrap gap-1.5">
            {meeting.transcription ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-success/25 bg-success/10 px-2 py-1 text-[11px] text-success">
                <CheckCircle2 className="h-3 w-3" />
                Trascrizione
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-warning/25 bg-warning/10 px-2 py-1 text-[11px] text-warning">
                <AlertTriangle className="h-3 w-3" />
                Da trascrivere
              </span>
            )}
            {analysisTypes.slice(0, 3).map((type) => (
              <span key={type} className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1 text-[11px] text-text-secondary">
                {ANALYSIS_TYPE_LABELS[type] || type}
              </span>
            ))}
          </div>
          <Button size="sm" variant={meeting.transcription ? 'primary' : 'secondary'} onClick={onOpen}>
            {actionLabel(meeting)}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ActionChecklist({
  items,
  emptyTitle = 'Nessuna azione aperta',
  emptyDescription = "Le azioni compariranno qui dopo un'analisi con output strutturato.",
}: {
  items: InsightItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription} className="py-7" />;
  }
  return (
    <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-elevated">
      {items.map((item) => (
        <div key={item.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={Boolean(item.completed)}
            readOnly
            aria-label={`Stato azione: ${item.text}`}
            className="mt-0.5 h-4 w-4 rounded border-border-subtle bg-bg-surface accent-accent"
          />
          <div className="min-w-0">
            <p className={cn('text-sm leading-snug text-text-primary', item.completed && 'line-through text-text-muted')}>
              {limitText(item.text, 180)}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-text-muted">
              {item.projectName && <span>{item.projectName}</span>}
              {item.owner && <span>Owner: {item.owner}</span>}
              {item.dueDate && <span>Scadenza: {item.dueDate}</span>}
              <span>{item.sourceTitle}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DecisionLog({
  items,
  emptyTitle = 'Nessuna decisione recente',
  emptyDescription = 'Le decisioni estratte dalle analisi del periodo compariranno in questo log.',
}: {
  items: InsightItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} className="py-7" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-border-subtle bg-bg-elevated px-4 py-3">
          <p className="text-sm leading-snug text-text-primary">{limitText(item.text, 190)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
            {item.projectName && <span>{item.projectName}</span>}
            <span>{formatProjectDate(item.sourceDate, 'it')}</span>
            <span>{item.sourceTitle}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskPanel({
  items,
  emptyTitle = 'Nessun rischio evidenziato',
  emptyDescription = 'Rischi e blocker arrivano dalle analisi dedicate, senza rileggere trascrizioni grezze.',
}: {
  items: InsightItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return <EmptyState icon={ShieldAlert} title={emptyTitle} description={emptyDescription} className="py-7" />;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-warning/25 bg-warning/5 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-snug text-text-primary">{limitText(item.text, 180)}</p>
            {item.severity && <Badge variant="warning">{item.severity}</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-text-muted">
            {item.projectName && <span>{item.projectName}</span>}
            <span>{item.sourceTitle}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DigestPanel({
  items,
  title = 'Digest del periodo',
  generatedAt,
}: {
  items: DigestItem[];
  title?: string;
  generatedAt?: string | null;
}) {
  return (
    <section className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
      <SectionHeader
        icon={Sparkles}
        title={title}
        description="Sintesi composta dagli insight già generati per i meeting filtrati."
        tooltip="Usa i brief e gli aggiornamenti progetto già disponibili. Non rilancia analisi sui transcript."
      />
      {generatedAt && <p className="mt-2 text-[11px] text-text-muted">Situazione aggiornata: {generatedAt}</p>}
      {items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Digest non ancora disponibile"
          description="Genera o completa le analisi dei meeting per alimentare questa sintesi."
          className="mt-4 py-7"
        />
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="border-l-2 border-accent/70 pl-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                <span>{item.title}</span>
                {item.projectName && <span>{item.projectName}</span>}
                <span>{item.sourceTitle}</span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">{limitText(item.text, 260)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProjectDigestPanel({
  items,
  generatedAt,
}: {
  items: DigestItem[];
  generatedAt?: string | null;
}) {
  return <DigestPanel items={items} title="Situazione progetto" generatedAt={generatedAt} />;
}

export function ProjectSidebar({
  projects,
  selectedName,
  query,
  onQueryChange,
  onSelect,
}: {
  projects: Project[];
  selectedName: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (name: string) => void;
}) {
  const filtered = projects.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <aside className="rounded-lg border border-border-subtle bg-bg-elevated p-3 lg:sticky lg:top-5 lg:max-h-[calc(100vh-8rem)] lg:overflow-auto">
      <div className="px-1 pb-3">
        <h2 className="text-sm font-semibold text-text-primary">Progetti</h2>
        <label className="mt-3 flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-bg-surface px-3">
          <Search className="h-4 w-4 text-text-muted" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search progetto"
            className="min-w-0 flex-1 border-0 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        {filtered.map((project) => (
          <button
            key={project.name}
            type="button"
            onClick={() => onSelect(project.name)}
            className={cn(
              'rounded-lg px-3 py-2 text-left transition-colors',
              selectedName === project.name
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            )}
          >
            <span className="block truncate text-sm font-medium">{project.name}</span>
            <span className={cn('mt-0.5 block text-[11px]', selectedName === project.name ? 'text-white/75' : 'text-text-muted')}>
              {project.items.length} meeting
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function ProjectStatusPanel({
  meetingCount,
  transcribedCount,
  readyCount,
  actionCount,
  decisionCount,
  riskCount,
}: {
  meetingCount: number;
  transcribedCount: number;
  readyCount: number;
  actionCount: number;
  decisionCount: number;
  riskCount: number;
}) {
  const stats = [
    { label: 'Meeting nel range', value: meetingCount, icon: FileAudio },
    { label: 'Trascritti', value: transcribedCount, icon: CheckCircle2 },
    { label: 'Con insight', value: readyCount, icon: Sparkles },
    { label: 'Azioni aperte', value: actionCount, icon: ListChecks },
    { label: 'Decisioni', value: decisionCount, icon: Target },
    { label: 'Rischi', value: riskCount, icon: ShieldAlert },
  ];
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle lg:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-bg-elevated px-4 py-3">
          <stat.icon className="mb-2 h-4 w-4 text-text-muted" />
          <div className="text-xl font-semibold text-text-primary">{stat.value}</div>
          <div className="text-[11px] uppercase tracking-wider text-text-muted">{stat.label}</div>
        </div>
      ))}
    </section>
  );
}

export function AnalysisCTAButton({
  onClick,
  disabled,
  isGenerated,
}: {
  onClick: () => void;
  disabled?: boolean;
  isGenerated?: boolean;
}) {
  return (
    <Tooltip content="Compone una situazione progetto dagli insight già estratti dai meeting del range.">
      <span>
        <Button size="sm" onClick={onClick} disabled={disabled}>
          <Sparkles className="h-4 w-4" />
          {isGenerated ? 'Aggiorna situazione' : 'Genera situazione progetto'}
        </Button>
      </span>
    </Tooltip>
  );
}
