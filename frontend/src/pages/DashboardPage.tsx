import { useState, useEffect } from 'react';
import { ApiClient, Recording, Transcription, Project } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface DashboardPageProps {
  navigateTo: (page: string, detail?: string | null) => void;
}

export default function DashboardPage({ navigateTo }: DashboardPageProps) {
  const { t, lang } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ recordingsCount: 0, transcriptionsCount: 0, analysesCount: 0, projectsCount: 0 });
  const [recentRecordings, setRecentRecordings] = useState<Recording[]>([]);
  const [recentTranscriptions, setRecentTranscriptions] = useState<Transcription[]>([]);
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [untranscribedCount, setUntranscribedCount] = useState(0);
  const [firstUntranscribed, setFirstUntranscribed] = useState<Recording | null>(null);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsData, recordingsData, transcriptionsData, projectsData] = await Promise.all([
          ApiClient.stats().catch(() => ({ recordings_count: 0, transcriptions_count: 0 })),
          ApiClient.listRecordings().catch(() => ({ items: [] })),
          ApiClient.listTranscriptions(1, 5).catch(() => ({ items: [], total: 0 })),
          ApiClient.listProjects().catch(() => ({ items: [] }))
        ]);

        const recs = recordingsData.items || [];
        const trans = transcriptionsData.items || [];
        const projs = projectsData.items || [];

        setRecentRecordings(recs);
        setRecentTranscriptions(trans);

        // Filter projects
        const realProjects = projs.filter((p) => !p.is_unassigned);
        
        // Sort projects by latest recording date
        const sortedProjects = [...realProjects].map((p) => {
          let latestDate = 0;
          p.items.forEach((item) => {
            if (item.recording?.created_at) {
              const d = new Date(item.recording.created_at).getTime();
              if (d > latestDate) latestDate = d;
            }
          });
          return { ...p, latestDate };
        }).sort((a, b) => b.latestDate - a.latestDate);
        setRecentProjects(sortedProjects.slice(0, 3));

        // Count analyses (simulated from local storage counts or API)
        let localAnalyses = 0;
        try {
          localAnalyses = parseInt(localStorage.getItem('analyses_count') || '0', 10);
        } catch {}

        setStats({
          recordingsCount: statsData.recordings_count || recs.length,
          transcriptionsCount: statsData.transcriptions_count || transcriptionsData.total || trans.length,
          analysesCount: localAnalyses,
          projectsCount: realProjects.length,
        });

        // Untranscribed calculation
        const transcribedFilenames = new Set(trans.map((t) => t.audio_filename));
        const untranscribed = recs.filter((r) => {
          const expectedName = r.audio_file ? r.audio_file.split('/').pop() : '';
          return expectedName && !transcribedFilenames.has(expectedName);
        });
        setUntranscribedCount(untranscribed.length);
        if (untranscribed.length > 0) {
          setFirstUntranscribed(untranscribed[0]);
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [t]);

  const hasActivity = recentRecordings.length > 0 || recentTranscriptions.length > 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <span className="text-text-secondary text-sm">{t('common.loading')}</span>
      </div>
    );
  }

  // 1. EMPTY STATE
  if (!hasActivity) {
    return (
      <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full py-6">
        <div className="text-center py-12 px-6 bg-bg-elevated/40 border border-border-subtle rounded-2xl backdrop-blur-[20px] flex flex-col gap-4">
          <span className="text-xs font-semibold text-accent tracking-widest uppercase">{t('dashboard.eyebrow')}</span>
          <h2 className="text-3xl md:text-4xl font-bold">ClosedRoom</h2>
          <p className="text-text-secondary text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            {t('dashboard.emptyBody')}
          </p>
        </div>

        <Card className="flex flex-col gap-5">
          <h3 className="text-lg font-semibold border-b border-border-subtle pb-3">{t('dashboard.firstStepsTitle')}</h3>
          <ul className="flex flex-col gap-3.5 text-sm text-text-secondary leading-relaxed">
            <li className="flex items-start gap-2.5">
              <span>🎙️</span>
              <span dangerouslySetInnerHTML={{ __html: t('dashboard.step1') }} />
            </li>
            <li className="flex items-start gap-2.5">
              <span>📝</span>
              <span dangerouslySetInnerHTML={{ __html: t('dashboard.step2') }} />
            </li>
            <li className="flex items-start gap-2.5">
              <span>📊</span>
              <span dangerouslySetInnerHTML={{ __html: t('dashboard.step3') }} />
            </li>
          </ul>
        </Card>

        <div className="flex flex-wrap items-center justify-center gap-4 mt-4">
          <Button size="lg" onClick={() => navigateTo('recording')}>
            {t('dashboard.quickActionRecord')}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigateTo('transcription')}>
            {t('dashboard.quickActionTranscribe')}
          </Button>
        </div>
      </div>
    );
  }

  // 2. DASHBOARD ACTIVE STATE
  return (
    <div className="flex flex-col gap-6">
      {/* Hero Banner */}
      <div className="py-8 px-6 bg-bg-elevated/50 border border-border-subtle rounded-2xl backdrop-blur-[20px] flex flex-col gap-4 relative overflow-hidden">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('dashboard.eyebrow')}</span>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-text-primary to-accent bg-clip-text text-transparent">
          ClosedRoom
        </h2>
        <p className="text-text-secondary text-sm max-w-2xl leading-relaxed">{t('dashboard.productBody')}</p>
        <div className="flex flex-wrap gap-3 mt-2 z-10">
          <Button onClick={() => navigateTo('recording')}>{t('dashboard.quickActionRecord')}</Button>
          <Button variant="secondary" onClick={() => navigateTo('transcription')}>
            {t('dashboard.quickActionTranscribe')}
          </Button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t('dashboard.statsRecordings'), value: stats.recordingsCount, icon: '🎙️' },
          { label: t('dashboard.statsTranscriptions'), value: stats.transcriptionsCount, icon: '📝' },
          { label: t('dashboard.statsAnalyses'), value: stats.analysesCount, icon: '📊' },
          { label: t('dashboard.statsProjects'), value: stats.projectsCount, icon: '🗂️' },
        ].map((item, idx) => (
          <Card key={idx} className="flex items-center gap-4">
            <span className="text-3xl" role="img" aria-hidden="true">
              {item.icon}
            </span>
            <div className="flex flex-col">
              <span className="text-2xl font-bold text-text-primary">{item.value}</span>
              <span className="text-xs text-text-muted font-medium uppercase tracking-wider">{item.label}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Suggestions Banner */}
      {untranscribedCount > 0 && firstUntranscribed && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-warning/20 bg-warning/5 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span className="text-sm font-medium text-text-secondary">
              {t('dashboard.untranscribedWarning', { count: untranscribedCount })}
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="border-warning/30 hover:border-warning/70 hover:bg-warning/10 text-warning"
            onClick={() => {
              // Preselect the file and navigate
              navigateTo('transcription', `file-${firstUntranscribed.id}`);
            }}
          >
            {t('dashboard.transcribeNow')}
          </Button>
        </div>
      )}

      {/* Main Grid Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Quick Actions & Recent Projects */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Quick Actions */}
          <Card className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
              {t('dashboard.quickActionsTitle')}
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => navigateTo('recording')}>
                🎙️ {t('dashboard.quickActionRecord').replace('🎙️ ', '')}
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => navigateTo('transcription')}>
                📝 {t('dashboard.quickActionTranscribe').replace('📝 ', '')}
              </Button>
              <Button variant="ghost" className="flex-1" onClick={() => navigateTo('settings')}>
                ⚙️ {t('dashboard.quickActionSettings').replace('⚙️ ', '')}
              </Button>
            </div>
          </Card>

          {/* Recent Projects */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                {t('dashboard.projectsTitle')}
              </h3>
              <button
                onClick={() => navigateTo('projects')}
                className="text-xs text-accent hover:text-accent-hover font-semibold cursor-pointer"
              >
                {lang === 'it' ? 'Vedi tutti →' : 'View all →'}
              </button>
            </div>

            <div className="flex flex-col gap-3.5">
              {recentProjects.length === 0 ? (
                <p className="text-xs text-text-muted py-4">{t('dashboard.noProjects')}</p>
              ) : (
                recentProjects.map((project, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3.5 bg-bg-surface/50 border border-border-subtle/50 rounded-xl hover:border-border-focus/40 transition-colors duration-150">
                    <div className="flex items-center gap-3.5 min-width-0">
                      <span className="text-xl p-2 bg-warning-yellow/10 rounded-lg">📁</span>
                      <div className="flex flex-col">
                        <strong className="text-sm text-text-primary">{project.name}</strong>
                        <span className="text-xs text-text-muted mt-0.5">
                          {lang === 'it'
                            ? `${project.items.length} audio · ${project.items.filter((i) => i.transcription).length} trascrizioni`
                            : `${project.items.length} audio · ${project.items.filter((i) => i.transcription).length} transcriptions`}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => navigateTo('projects')}>
                      {t('projects.btnView')}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Right column: Recent Activity Feed */}
        <Card className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary border-b border-border-subtle pb-2">
            {t('dashboard.activityTitle')}
          </h3>

          <div className="flex flex-col gap-4">
            {recentRecordings.length === 0 && recentTranscriptions.length === 0 ? (
              <p className="text-xs text-text-muted py-8 text-center">{t('dashboard.noActivity')}</p>
            ) : (
              // Build chronological feed
              [
                ...recentRecordings.map((r) => ({
                  type: 'recording' as const,
                  id: r.id,
                  title: r.title || `Recording ${r.id.substring(0, 8)}`,
                  date: new Date(r.created_at),
                  projectName: r.project_name,
                })),
                ...recentTranscriptions.map((t) => ({
                  type: 'transcription' as const,
                  id: t.id,
                  title: t.audio_filename,
                  date: new Date(t.timestamp),
                  projectName: t.recording_id ? 'Recording' : '',
                })),
              ]
                .sort((a, b) => b.date.getTime() - a.date.getTime())
                .slice(0, 5)
                .map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      if (item.type === 'recording') {
                        navigateTo('transcription', `file-${item.id}`);
                      } else {
                        navigateTo('analysis', item.id);
                      }
                    }}
                    className="flex items-start gap-3 p-3 bg-bg-surface/30 border border-border-subtle/40 rounded-xl hover:border-border-focus/30 hover:bg-bg-surface/60 transition-all duration-150 cursor-pointer"
                  >
                    <span className="text-xl p-2 bg-bg-hover rounded-lg">
                      {item.type === 'recording' ? '🎙️' : '📝'}
                    </span>
                    <div className="flex flex-col min-w-0 flex-1">
                      <strong className="text-xs text-text-primary font-semibold truncate leading-tight">
                        {item.title}
                      </strong>
                      <span className="text-[10px] text-text-muted mt-1">
                        {item.date.toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* macOS Tip banner */}
      <div className="relative p-5 bg-bg-elevated/70 border border-border-subtle rounded-2xl backdrop-blur-md flex gap-4 pr-10 items-start">
        <div className="text-2xl mt-0.5">🎙️</div>
        <div className="flex flex-col gap-1.5 min-w-0">
          <strong className="text-sm font-semibold">{t('dashboard.macOSBarAlertTitle')}</strong>
          <p className="text-xs text-text-secondary leading-relaxed">{t('dashboard.macOSBarAlertBody')}</p>
          <span className="text-[10px] text-text-muted">{t('dashboard.macOSBarAlertTroubleshoot')}</span>
        </div>
      </div>
    </div>
  );
}
