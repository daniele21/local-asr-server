/**
 * InsightDetailDialog.tsx
 * Reusable drawer for viewing actions, decisions, and risks in detail.
 *
 * Features:
 * - Tab switcher: Actions | Decisions | Risks
 * - Inline search/filter
 * - Full item detail: text, owner, due date, priority, source meeting, project
 * - Empty state per tab
 */

import { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Search,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogBody } from '../ui/Dialog';
import { Badge } from '../ui/Badge';
import { cn } from '../../utils/cn';
import { useTranslation } from '../../i18n/i18n';
import type { InsightItem } from '../../utils/meetingInsights';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InsightTab = 'actions' | 'decisions' | 'risks';

export interface InsightDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to show initially */
  initialTab?: InsightTab;
  actions?: InsightItem[];
  decisions?: InsightItem[];
  risks?: InsightItem[];
  dataTour?: string;
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof ListChecks;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
        active
          ? 'bg-accent text-white shadow-sm'
          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
          active ? 'bg-white/20 text-white' : 'bg-bg-glass text-text-muted',
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Action item card ────────────────────────────────────────────────────────

function metadata(items: Array<string | null | undefined>): string {
  return items.filter(Boolean).join(' · ');
}

function ActionCard({ item }: { item: InsightItem }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 transition-all hover:border-border-focus hover:bg-bg-hover">
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border',
            item.completed
              ? 'border-success/40 bg-success/15 text-success'
              : 'border-border-subtle bg-bg-glass text-transparent',
          )}
        >
          <CheckCircle2 className="h-3 w-3" />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              'text-sm leading-snug text-text-primary',
              item.completed && 'text-text-muted line-through',
            )}
          >
            {item.text}
          </p>
          <p className="mt-1 truncate text-[11px] text-text-muted">
            {metadata([
              item.owner,
              item.dueDate ? `${t('workspace.dueDateLabel')} ${item.dueDate}` : null,
              item.priority,
              item.sourceTitle,
            ])}
          </p>
        </div>
        {item.priority && (
          <Badge
            className="ml-auto shrink-0"
            variant={
              item.priority.toLowerCase().includes('high') || item.priority.toLowerCase().includes('alta')
                ? 'warning'
                : 'idle'
            }
          >
            {item.priority}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ─── Decision card ───────────────────────────────────────────────────────────

function DecisionCard({ item }: { item: InsightItem }) {
  const { lang } = useTranslation();
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 transition-all hover:border-border-focus hover:bg-bg-hover">
      <p className="text-sm leading-snug text-text-primary">{item.text}</p>
      <p className="mt-1 truncate text-[11px] text-text-muted">
        {metadata([
          item.projectName,
          item.sourceDate ? new Date(item.sourceDate).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-US') : null,
          item.sourceTitle,
        ])}
      </p>
    </div>
  );
}

// ─── Risk card ───────────────────────────────────────────────────────────────

function RiskCard({ item }: { item: InsightItem }) {
  return (
    <div className="rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 transition-all hover:border-warning/40 hover:bg-warning/10">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-sm leading-snug text-text-primary">{item.text}</p>
        </div>
        {item.severity && <Badge variant="warning">{item.severity}</Badge>}
      </div>
      <p className="mt-1 truncate pl-5 text-[11px] text-text-muted">{metadata([item.projectName, item.sourceTitle])}</p>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export function InsightDetailDialog({
  open,
  onOpenChange,
  initialTab = 'actions',
  actions = [],
  decisions = [],
  risks = [],
  dataTour,
}: InsightDetailDialogProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<InsightTab>(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setQuery('');
  }, [open, initialTab]);

  const tabs = [
    { id: 'actions' as InsightTab, label: t('projects.actionsTitle'), icon: ListChecks, items: actions },
    { id: 'decisions' as InsightTab, label: t('projects.decisionsTitle'), icon: Target, items: decisions },
    { id: 'risks' as InsightTab, label: t('projects.risksTitle'), icon: ShieldAlert, items: risks },
  ];

  const activeItems = useMemo(() => {
    const tabItems = tabs.find((tab) => tab.id === activeTab)?.items ?? [];
    if (!query.trim()) return tabItems;
    const needle = query.toLowerCase();
    return tabItems.filter((item) => item.text.toLowerCase().includes(needle));
  }, [activeTab, query, actions, decisions, risks]);

  const titleMap: Record<InsightTab, string> = {
    actions: t('projects.actionsTitle'),
    decisions: t('projects.decisionsTitle'),
    risks: t('projects.risksTitle'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dataTour={dataTour}
        size="lg"
        className="max-h-[85vh] flex flex-col"
      >
        <DialogHeader title={titleMap[activeTab]} />

        {/* Tabs + Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-bg-surface px-5 py-3">
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <TabButton
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => { setActiveTab(tab.id); setQuery(''); }}
                icon={tab.icon}
                label={tab.label}
                count={tab.items.length}
              />
            ))}
          </div>

          {/* Search */}
          <label className="flex h-8 items-center gap-2 rounded-lg border border-border-subtle bg-bg-glass px-3 text-xs shadow-[inset_0_1px_0_var(--surface-highlight)] focus-within:border-border-focus">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtra..."
              className="min-w-0 bg-transparent text-text-primary outline-none placeholder:text-text-muted w-28"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-text-muted hover:text-text-primary">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        </div>

        {/* Content */}
        <DialogBody className="flex flex-col gap-2 p-4 overflow-y-auto">
          {activeItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-muted">
              {query
                ? 'Nessun risultato per la ricerca.'
                : activeTab === 'actions'
                  ? t('workspace.emptyActionsTitle')
                  : activeTab === 'decisions'
                    ? t('workspace.emptyDecisionsTitle')
                    : t('workspace.emptyRisksTitle')}
            </div>
          ) : (
            activeItems.map((item) =>
              activeTab === 'actions' ? (
                <ActionCard key={item.id} item={item} />
              ) : activeTab === 'decisions' ? (
                <DecisionCard key={item.id} item={item} />
              ) : (
                <RiskCard key={item.id} item={item} />
              ),
            )
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
