import { AnalysisRun, Meeting, ProjectItem, Recording } from '../api/apiClient';

export type TimeRangeMode = 'today' | 'last3' | 'week' | 'last7' | 'last30' | 'all' | 'custom';

export interface TimeRangeState {
  mode: TimeRangeMode;
  startDate?: string;
  endDate?: string;
}

export interface ResolvedTimeRange {
  start: Date | null;
  end: Date | null;
}

export interface InsightItem {
  id: string;
  text: string;
  owner?: string;
  dueDate?: string;
  status?: string;
  priority?: string;
  severity?: string;
  sourceId: string;
  sourceTitle: string;
  sourceDate: string;
  projectName?: string;
  evidence?: string;
  completed?: boolean;
}

export interface DigestItem {
  id: string;
  title: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
  sourceDate: string;
  projectName?: string;
}

interface InsightSource {
  id: string;
  title: string;
  projectName?: string;
  createdAt: string;
  status?: string;
  recording?: Recording;
  transcription?: unknown;
  analysisRuns?: AnalysisRun[];
  latestAnalysis?: Record<string, AnalysisRun>;
  legacyAnalysis?: unknown;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const COMPLETED_STATUSES = new Set(['done', 'completed', 'closed', 'resolved', 'fixed']);

export function localDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date): Date {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  return new Date(start.getTime() - mondayOffset * DAY_MS);
}

export function resolveTimeRange(range: TimeRangeState, now = new Date()): ResolvedTimeRange {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  if (range.mode === 'all') return { start: null, end: null };
  if (range.mode === 'today') return { start: todayStart, end: todayEnd };
  if (range.mode === 'last3') return { start: new Date(todayStart.getTime() - 2 * DAY_MS), end: todayEnd };
  if (range.mode === 'week') return { start: startOfWeek(now), end: todayEnd };
  if (range.mode === 'last7') return { start: new Date(todayStart.getTime() - 6 * DAY_MS), end: todayEnd };
  if (range.mode === 'last30') return { start: new Date(todayStart.getTime() - 29 * DAY_MS), end: todayEnd };

  const customStart = parseDateInput(range.startDate);
  const customEnd = parseDateInput(range.endDate);
  if (customStart && customEnd && customStart > customEnd) {
    return { start: startOfDay(customEnd), end: endOfDay(customStart) };
  }
  return {
    start: customStart ? startOfDay(customStart) : null,
    end: customEnd ? endOfDay(customEnd) : null,
  };
}

export function formatTimeRangeLabel(range: TimeRangeState, lang: string, now = new Date()): string {
  const locale = lang === 'it' ? 'it-IT' : 'en-US';
  const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' });
  if (range.mode === 'today') return `${lang === 'it' ? 'Oggi' : 'Today'}, ${date.format(now)}`;
  if (range.mode === 'last3') return lang === 'it' ? 'Ultimi 3 giorni' : 'Last 3 days';
  if (range.mode === 'week') return lang === 'it' ? 'Settimana corrente' : 'This week';
  if (range.mode === 'last7') return lang === 'it' ? 'Ultimi 7 giorni' : 'Last 7 days';
  if (range.mode === 'last30') return lang === 'it' ? 'Ultimi 30 giorni' : 'Last 30 days';
  if (range.mode === 'all') return lang === 'it' ? 'Tutto lo storico' : 'All time';
  const resolved = resolveTimeRange(range, now);
  const start = resolved.start ? date.format(resolved.start) : '';
  const end = resolved.end ? date.format(resolved.end) : '';
  if (start && end) return `${start} - ${end}`;
  if (start) return `${lang === 'it' ? 'Dal' : 'From'} ${start}`;
  if (end) return `${lang === 'it' ? 'Fino al' : 'Until'} ${end}`;
  return lang === 'it' ? 'Range custom' : 'Custom range';
}

export function isWithinTimeRange(value: string | undefined, range: ResolvedTimeRange): boolean {
  if (!range.start && !range.end) return true;
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

export function meetingTitle(meeting: Meeting): string {
  return meeting.recording.title || `Meeting ${meeting.id.slice(0, 8)}`;
}

export function recordingTitle(recording: Recording): string {
  return recording.title || `Meeting ${recording.id.slice(0, 8)}`;
}

export function sourceFromMeeting(meeting: Meeting): InsightSource {
  return {
    id: meeting.id,
    title: meetingTitle(meeting),
    projectName: meeting.project_name,
    createdAt: meeting.created_at || meeting.recording.created_at,
    status: meeting.status,
    recording: meeting.recording,
    transcription: meeting.transcription,
    analysisRuns: meeting.analysis_runs,
    latestAnalysis: meeting.latest_analysis,
  };
}

export function sourceFromProjectItem(item: ProjectItem, projectName: string): InsightSource {
  const runs = item.analysis_runs || [];
  const latestAnalysis: Record<string, AnalysisRun> = {};
  for (const run of [...runs].sort((a, b) => (b.created_at || 0) - (a.created_at || 0))) {
    if (run.status === 'completed' && !latestAnalysis[run.analysis_type]) {
      latestAnalysis[run.analysis_type] = run;
    }
  }
  return {
    id: item.recording.id,
    title: recordingTitle(item.recording),
    projectName: item.recording.project_name || projectName,
    createdAt: item.recording.created_at,
    status: item.recording.status,
    recording: item.recording,
    transcription: item.transcription,
    analysisRuns: runs,
    latestAnalysis,
    legacyAnalysis: item.analysis,
  };
}

export function projectItemHasAnalysis(item: ProjectItem): boolean {
  return Boolean(item.analysis || (item.analysis_runs || []).some((run) => run.status === 'completed'));
}

export function projectItemStatus(item: ProjectItem): 'recorded' | 'transcribed' | 'ready' {
  if (projectItemHasAnalysis(item)) return 'ready';
  if (item.transcription) return 'transcribed';
  return 'recorded';
}

function latestRun(source: InsightSource, analysisType: string): AnalysisRun | undefined {
  const fromMap = source.latestAnalysis?.[analysisType];
  if (fromMap?.status === 'completed' || fromMap?.result || fromMap?.result_markdown) return fromMap;
  return [...(source.analysisRuns || [])]
    .filter((run) => run.analysis_type === analysisType && run.status === 'completed')
    .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
}

function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(stringifyValue).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const preferred = [
      object.task,
      object.action,
      object.decision,
      object.risk,
      object.blocker,
      object.title,
      object.description,
      object.summary,
      object.text,
      object.item,
      object.name,
    ].map(stringifyValue).find(Boolean);
    if (preferred) return preferred;
    return Object.entries(object)
      .filter(([, entryValue]) => typeof entryValue === 'string' || typeof entryValue === 'number')
      .map(([key, entryValue]) => `${key}: ${entryValue}`)
      .join(', ');
  }
  return '';
}

function field(object: unknown, keys: string[]): string | undefined {
  if (!object || typeof object !== 'object' || Array.isArray(object)) return undefined;
  const record = object as Record<string, unknown>;
  for (const key of keys) {
    const value = stringifyValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function coerceList(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const nested = record.items || record.results || record.entries;
    if (Array.isArray(nested)) return nested;
  }
  if (typeof value === 'string') {
    return value
      .split(/\n+/)
      .map((line) => line.replace(/^[-*]\s*/, '').trim())
      .filter((line) => line.length > 0);
  }
  return [];
}

function resultCandidates(source: InsightSource, analysisType: string, keys: string[]): unknown[] {
  const run = latestRun(source, analysisType);
  const values: unknown[] = [];
  if (run?.result) values.push(run.result);
  if (source.legacyAnalysis) values.push(source.legacyAnalysis);

  const lists: unknown[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      lists.push(value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (record[key]) lists.push(record[key]);
    }
  }
  return lists.flatMap(coerceList);
}

function itemBase(source: InsightSource, kind: string, index: number, text: string): Pick<InsightItem, 'id' | 'sourceId' | 'sourceTitle' | 'sourceDate' | 'projectName'> {
  return {
    id: `${source.id}:${kind}:${index}:${hashText(text)}`,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceDate: source.createdAt,
    projectName: source.projectName,
  };
}

function isCompletedStatus(status?: string): boolean {
  if (!status) return false;
  return COMPLETED_STATUSES.has(status.trim().toLowerCase());
}

export function extractActionItems(source: InsightSource): InsightItem[] {
  return resultCandidates(source, 'action_items', ['action_items', 'actions', 'tasks', 'items']).map((entry, index) => {
    const text = stringifyValue(entry);
    return {
      ...itemBase(source, 'action', index, text),
      text,
      owner: field(entry, ['owner', 'assignee', 'responsible', 'persona']),
      dueDate: field(entry, ['due_date', 'due', 'deadline', 'scadenza']),
      status: field(entry, ['status', 'stato']),
      priority: field(entry, ['priority', 'priorita']),
      evidence: field(entry, ['evidence', 'quote', 'citazione']),
      completed: isCompletedStatus(field(entry, ['status', 'stato'])),
    };
  }).filter((item) => item.text);
}

export function extractDecisions(source: InsightSource): InsightItem[] {
  return resultCandidates(source, 'decisions', ['decisions', 'decision_log', 'items']).map((entry, index) => {
    const text = stringifyValue(entry);
    return {
      ...itemBase(source, 'decision', index, text),
      text,
      evidence: field(entry, ['evidence', 'quote', 'citazione', 'rationale', 'razionale']),
    };
  }).filter((item) => item.text);
}

export function extractRisks(source: InsightSource): InsightItem[] {
  return resultCandidates(source, 'risks_blockers', ['risks', 'blockers', 'risks_blockers', 'items']).map((entry, index) => {
    const text = stringifyValue(entry);
    return {
      ...itemBase(source, 'risk', index, text),
      text,
      severity: field(entry, ['severity', 'gravita', 'level', 'priority']),
      evidence: field(entry, ['evidence', 'quote', 'citazione', 'next_step', 'prossimo_passo']),
    };
  }).filter((item) => item.text);
}

function firstTextField(value: unknown, keys: string[]): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return stringifyValue(value);
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const text = stringifyValue(record[key]);
    if (text) return text;
  }
  return '';
}

function trimDigest(text: string): string {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);
  return lines.slice(0, 3).join(' ');
}

export function extractDigest(source: InsightSource): DigestItem | null {
  const run = latestRun(source, 'meeting_brief') || latestRun(source, 'project_update');
  const resultText = firstTextField(run?.result, ['summary', 'markdown', 'title', 'key_points']);
  const markdownText = run?.result_markdown || '';
  const text = trimDigest(resultText || markdownText);
  if (!text) return null;
  return {
    id: `${source.id}:digest:${run?.id || hashText(text)}`,
    title: run?.analysis_type === 'project_update' ? 'Aggiornamento progetto' : 'Brief meeting',
    text,
    sourceId: source.id,
    sourceTitle: source.title,
    sourceDate: source.createdAt,
    projectName: source.projectName,
  };
}

export function uniqueInsightItems(items: InsightItem[]): InsightItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.sourceId}:${item.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sortByNewest<T extends { sourceDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.sourceDate).getTime() - new Date(a.sourceDate).getTime());
}
