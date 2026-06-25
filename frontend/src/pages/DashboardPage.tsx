import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileAudio,
  FolderKanban,
  ListChecks,
  Mic,
  Search,
  Sparkles,
} from 'lucide-react';
import { ApiClient, Meeting } from '../api/apiClient';
import { ANALYSIS_TYPE_LABELS } from '../api/config';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { formatProjectDate, getDurationSeconds } from '../utils/formatters';
import { useTranslation } from '../i18n/i18n';

interface DashboardPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
}

const statusCopy: Record<string, { label: string; variant: 'idle' | 'success' | 'warning' | 'info' }> = {
  recording: { label: 'In registrazione', variant: 'warning' },
  recorded: { label: 'Audio pronto', variant: 'idle' },
  transcribed: { label: 'Trascritto', variant: 'info' },
  analyzing: { label: 'Analisi in corso', variant: 'warning' },
  ready: { label: 'Pronto', variant: 'success' },
};

function meetingTitle(meeting: Meeting): string {
  return meeting.recording.title || `Meeting ${meeting.id.slice(0, 8)}`;
}

function sameDay(value: string | undefined, date: Date): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  return parsed.getFullYear() === date.getFullYear()
    && parsed.getMonth() === date.getMonth()
    && parsed.getDate() === date.getDate();
}

export default function DashboardPage({ navigateTo }: DashboardPageProps) {
  const { t, lang } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [query, setQuery] = useState('');

  const locale = lang === 'it' ? 'it-IT' : 'en-US';

  const load = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.listMeetings(80);
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

  const today = useMemo(() => new Date(), []);
  const filteredMeetings = useMemo(() => {
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

  const todayMeetings = filteredMeetings.filter((meeting) => sameDay(meeting.created_at, today));
  const backlogMeetings = filteredMeetings.filter((meeting) => meeting.status !== 'ready');
  const readyCount = meetings.filter((meeting) => meeting.status === 'ready').length;
  const actionCount = meetings.reduce((count, meeting) => {
    const run = meeting.latest_analysis?.action_items;
    const items = run?.result?.action_items;
    return count + (Array.isArray(items) ? items.length : 0);
  }, 0);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
        <span className="text-text-secondary text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-border-subtle pb-5">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-accent uppercase tracking-widest">Oggi</span>
          <h2 className="text-3xl font-semibold text-text-primary mt-1">Meeting workspace</h2>
          <p className="text-sm text-text-secondary mt-2 max-w-2xl">
            Registrazioni, trascrizioni e analisi sono raccolte per meeting. Parti da una nuova registrazione o riprendi una pipeline incompleta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigateTo('recording')}>
            <Mic className="w-4 h-4" />
            Registra meeting
          </Button>
          <Button variant="secondary" onClick={() => navigateTo('transcription')}>
            <FileAudio className="w-4 h-4" />
            Importa audio
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px border border-border-subtle rounded-lg overflow-hidden bg-border-subtle">
        {[
          { label: 'Meeting', value: meetings.length, icon: FileAudio },
          { label: 'Pronti', value: readyCount, icon: CheckCircle2 },
          { label: 'Da completare', value: backlogMeetings.length, icon: Clock3 },
          { label: 'Azioni estratte', value: actionCount, icon: ListChecks },
        ].map((item) => (
          <div key={item.label} className="bg-bg-elevated px-4 py-3 flex items-center gap-3">
            <item.icon className="w-4 h-4 text-text-muted" />
            <div>
              <div className="text-xl font-semibold text-text-primary">{item.value}</div>
              <div className="text-[11px] uppercase tracking-wider text-text-muted">{item.label}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col xl:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">Meeting recenti</h3>
              <p className="text-xs text-text-muted">Stato, output disponibili e prossima azione.</p>
            </div>
            <label className="flex items-center gap-2 bg-bg-elevated border border-border-subtle rounded-lg px-3 py-2 min-w-[240px]">
              <Search className="w-4 h-4 text-text-muted" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cerca meeting"
                className="bg-transparent border-0 outline-none text-sm text-text-primary placeholder:text-text-muted w-full"
              />
            </label>
          </div>

          {filteredMeetings.length === 0 ? (
            <div className="border border-dashed border-border-subtle rounded-lg px-5 py-10 text-center">
              <Mic className="w-8 h-8 mx-auto text-text-muted mb-3" />
              <h3 className="text-base font-semibold text-text-primary">Nessun meeting ancora</h3>
              <p className="text-sm text-text-secondary mt-1">Registra o importa un audio per creare il primo workspace.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button onClick={() => navigateTo('recording')}>Registra meeting</Button>
                <Button variant="secondary" onClick={() => navigateTo('transcription')}>Importa audio</Button>
              </div>
            </div>
          ) : (
            <div className="border border-border-subtle rounded-lg overflow-hidden">
              {filteredMeetings.slice(0, 20).map((meeting) => {
                const status = statusCopy[meeting.status] || { label: meeting.status, variant: 'idle' as const };
                const analysisTypes = Object.keys(meeting.latest_analysis || {});
                return (
                  <button
                    key={meeting.id}
                    onClick={() => navigateTo('meeting', meeting.id)}
                    className="w-full text-left grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_180px_220px] gap-3 px-4 py-3 bg-bg-elevated hover:bg-bg-hover border-b border-border-subtle last:border-b-0 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-text-primary truncate">{meetingTitle(meeting)}</strong>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                        <span>{formatProjectDate(meeting.created_at, lang)}</span>
                        <span>{getDurationSeconds(meeting.recording) > 0 ? `${Math.round(getDurationSeconds(meeting.recording) / 60)} min` : 'Durata n/d'}</span>
                        {meeting.project_name && (
                          <span className="inline-flex items-center gap-1">
                            <FolderKanban className="w-3 h-3" />
                            {meeting.project_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      {meeting.transcription ? <CheckCircle2 className="w-4 h-4 text-success" /> : <AlertCircle className="w-4 h-4 text-warning" />}
                      {meeting.transcription ? 'Trascrizione pronta' : 'Da trascrivere'}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysisTypes.length === 0 ? (
                        <span className="text-xs text-text-muted">Nessuna analisi</span>
                      ) : (
                        analysisTypes.slice(0, 4).map((type) => (
                          <span key={type} className="text-[11px] px-2 py-1 rounded-md bg-bg-surface border border-border-subtle text-text-secondary">
                            {ANALYSIS_TYPE_LABELS[type] || type}
                          </span>
                        ))
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="xl:w-[320px] flex flex-col gap-5">
          <section className="border border-border-subtle rounded-lg p-4 bg-bg-elevated">
            <div className="flex items-center gap-2 mb-3">
              <Clock3 className="w-4 h-4 text-text-muted" />
              <h3 className="text-sm font-semibold text-text-primary">In corso</h3>
            </div>
            <div className="flex flex-col gap-2">
              {backlogMeetings.slice(0, 5).map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => navigateTo('meeting', meeting.id)}
                  className="text-left rounded-md px-3 py-2 hover:bg-bg-hover transition-colors"
                >
                  <div className="text-xs font-semibold text-text-primary truncate">{meetingTitle(meeting)}</div>
                  <div className="text-[11px] text-text-muted mt-0.5">{statusCopy[meeting.status]?.label || meeting.status}</div>
                </button>
              ))}
              {backlogMeetings.length === 0 && (
                <p className="text-xs text-text-muted">Nessuna pipeline aperta.</p>
              )}
            </div>
          </section>

          <section className="border border-border-subtle rounded-lg p-4 bg-bg-elevated">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-semibold text-text-primary">Digest giornaliero</h3>
            </div>
            {todayMeetings.length === 0 ? (
              <p className="text-xs text-text-muted">Nessun meeting registrato oggi.</p>
            ) : (
              <div className="flex flex-col gap-2 text-xs text-text-secondary">
                <p>{todayMeetings.length} meeting nel giorno corrente ({today.toLocaleDateString(locale)}).</p>
                <p>{todayMeetings.filter((meeting) => meeting.status === 'ready').length} già pronti per review.</p>
              </div>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
