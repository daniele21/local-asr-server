import { useState, useEffect } from 'react';
import { BarChart3, ChevronDown, FolderKanban, Languages, Mic, Moon, Palette, PlayCircle, Settings, Sparkles, Sun } from 'lucide-react';
import { I18nProvider, useTranslation } from './i18n/i18n';
import { ToastProvider, useToast } from './context/ToastContext';
import { ApiClient } from './api/apiClient';
import { HEALTH_CHECK_INTERVAL_MS } from './api/config';
import DashboardPage from './pages/DashboardPage';
import RecordingPage from './pages/RecordingPage';
import TranscriptionPage from './pages/TranscriptionPage';
import ProjectsPage from './pages/ProjectsPage';
import AnalysisPage from './pages/AnalysisPage';
import SettingsPage from './pages/SettingsPage';
import RecordingOverlayPage from './pages/RecordingOverlayPage';
import MeetingDetailPage from './pages/MeetingDetailPage';
import { Badge } from './components/ui/Badge';
import { Button } from './components/ui/Button';
import { Tooltip } from './components/ui/Tooltip';
import { DemoBanner } from './components/ui/DemoBanner';
import { TourOverlay } from './features/tour/TourOverlay';
import { TourRecordingMock } from './features/tour/TourRecordingMock';
import { TOUR_STEPS, TourStepId, tourStepIndex } from './features/tour/tourSteps';

function MainApp() {
  const { t, lang, setLang } = useTranslation();
  const { showToast } = useToast();

  const [activePage, setActivePage] = useState<string>('home');
  const [serverOnline, setServerOnline] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [moreOpen, setMoreOpen] = useState(false);
  const [routeDetail, setRouteDetail] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<TourStepId | null>(null);
  const [tourReturnHash, setTourReturnHash] = useState('');
  const [demoMode, setDemoMode] = useState(() => {
    // Support ?demo=true URL param in addition to localStorage
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('demo') === 'true' || localStorage.getItem('demoMode') === 'true';
  });
  const isDemoActive = demoMode || Boolean(tourStep);

  // Demo mode uses backend-populated mock database entries and client-side flags.
  const activateDemo = async () => {
    try {
      await ApiClient.populateMockData(lang);
      setDemoMode(true);
      localStorage.setItem('demoMode', 'true');
      showToast(t('help.mockDataSuccess'), 'success');
      navigateTo('home');
      window.location.reload();
    } catch (err: any) {
      showToast(err.message || 'Error populating mock data', 'error');
    }
  };

  const exitDemo = async () => {
    try {
      await ApiClient.clearMockData();
      setDemoMode(false);
      localStorage.setItem('demoMode', 'false');
      showToast(t('common.exitDemoSuccess'), 'info');
      navigateTo('home');
      window.location.reload();
    } catch (err: any) {
      showToast(err.message || 'Error clearing mock data', 'error');
    }
  };

  // Sync hash with activePage
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      const parts = hash.split('/');
      const pageName = parts[0];
      const detail = parts.slice(1).join('/');

      const pageMap: Record<string, string> = {
        home: 'home',
        record: 'recording',
        recording: 'recording',
        transcribe: 'transcription',
        transcription: 'transcription',
        projects: 'projects',
        analysis: 'analysis',
        settings: 'settings',
        overlay: 'overlay',
        meeting: 'meeting',
      };

      const targetPage = pageMap[pageName] || 'home';
      setActivePage(targetPage);
      setRouteDetail(detail || null);
    };

    window.addEventListener('hashchange', handleHashChange);
    // Initial check
    if (!window.location.hash) {
      window.location.hash = '#home';
    } else {
      handleHashChange();
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigateTo = (page: string, detail: string | null = null) => {
    const pageRouteMap: Record<string, string> = {
      home: 'home',
      recording: 'recording',
      transcription: 'transcription',
      projects: 'projects',
      analysis: 'analysis',
      settings: 'settings',
      meeting: 'meeting',
    };
    const route = pageRouteMap[page] || page;
    window.location.hash = detail ? `${route}/${detail}` : route;
    if (tourStep === 'today-to-projects' && route === 'projects') {
      const nextStep = TOUR_STEPS[tourStepIndex(tourStep) + 1];
      if (nextStep?.id === 'project-sidebar') {
        setTourStep(nextStep.id);
      }
    }
  };

  const startTour = () => {
    setTourReturnHash(window.location.hash || '#home');
    const firstStep = TOUR_STEPS[0];
    setTourStep(firstStep.id);
    navigateTo(firstStep.route);
  };

  const advanceTour = () => {
    if (!tourStep) return;
    const nextStep = TOUR_STEPS[tourStepIndex(tourStep) + 1];
    if (!nextStep) return;
    setTourStep(nextStep.id);
    navigateTo(nextStep.route);
  };

  const retreatTour = () => {
    if (!tourStep) return;
    const previousStep = TOUR_STEPS[tourStepIndex(tourStep) - 1];
    if (!previousStep) return;
    setTourStep(previousStep.id);
    navigateTo(previousStep.route);
  };

  const closeTour = () => {
    const returnHash = tourReturnHash;
    setTourStep(null);
    setTourReturnHash('');
    if (returnHash) window.location.hash = returnHash;
  };

  // Theme Sync
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    setTheme(savedTheme as 'dark' | 'light');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  // Server health polling
  useEffect(() => {
    const checkHealth = async () => {
      if (isDemoActive) {
        return;
      }
      try {
        const data = await ApiClient.health();
        setServerOnline(true);
        setDefaultModel(data.default_model.split('/').pop() || '');
      } catch {
        setServerOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isDemoActive]);

  // Close more panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.more-menu-container')) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return (
          <DashboardPage
            navigateTo={navigateTo}
            demoMode={isDemoActive}
            onActivateDemo={!isDemoActive ? activateDemo : undefined}
          />
        );
      case 'meeting':
        return <MeetingDetailPage recordingId={routeDetail} navigateTo={navigateTo} demoMode={isDemoActive} />;
      case 'recording':
        if (isDemoActive) {
          return <TourRecordingMock />;
        }
        return <RecordingPage detailId={routeDetail} navigateTo={navigateTo} />;
      case 'transcription':
        return <TranscriptionPage detailPath={routeDetail} navigateTo={navigateTo} demoMode={isDemoActive} />;
      case 'projects':
        return <ProjectsPage navigateTo={navigateTo} demoMode={isDemoActive} />;
      case 'analysis':
        return <AnalysisPage detailId={routeDetail} navigateTo={navigateTo} demoMode={isDemoActive} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return (
          <DashboardPage
            navigateTo={navigateTo}
            demoMode={isDemoActive}
            onActivateDemo={!isDemoActive ? activateDemo : undefined}
          />
        );
    }
  };

  if (activePage === 'overlay') {
    return <RecordingOverlayPage />;
  }

  return (
    <div className="app-chrome min-h-screen">
      <div className="app-shell relative z-10 mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
      {/* Header */}
      <header className="app-header surface-supporting flex flex-col gap-3 rounded-2xl px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Brand */}
        <button
          onClick={() => navigateTo('home')}
          className="group flex min-w-0 cursor-pointer select-none items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-border-focus lg:flex-[1_1_0]"
        >
          <span className="brand-mark brand-mark-compact" aria-hidden="true">
            <span className="brand-mark-halo" />
            <img src="/logo-dark.svg" alt="" className="brand-logo brand-logo-dark" />
            <img src="/logo-light.svg" alt="" className="brand-logo brand-logo-light" />
          </span>
          <span className="min-w-0">
            <h1 className="text-lg font-bold leading-none text-text-primary transition-colors duration-200 group-hover:text-accent-hover">
              ClosedRoom
            </h1>
            <p className="mt-1 text-xs text-text-secondary">{t('header.subtitle')}</p>
          </span>
        </button>

        {/* Navigation */}
        <nav className="app-nav flex w-full gap-1 overflow-x-auto rounded-lg border border-border-subtle bg-bg-elevated/85 p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] select-none lg:w-auto lg:shrink-0">
          {[
            { id: 'home', label: t('nav.home'), icon: BarChart3 },
            { id: 'projects', label: t('nav.projects'), icon: FolderKanban },
          ].map((item) => (
            <button
              key={item.id}
              data-tour={`nav-${item.id}`}
              onClick={() => navigateTo(item.id)}
              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-xs font-semibold transition-all duration-200 ease-spring active:scale-95 cursor-pointer ${
                activePage === item.id || (item.id === 'home' && activePage === 'meeting')
                  ? 'primary-gradient-surface text-white shadow-md shadow-accent/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 lg:flex-[1_1_0] lg:justify-end">
          <Button
            data-tour="new-meeting-btn"
            onClick={() => navigateTo('recording')}
            size="md"
            disabled={isDemoActive}
            title={isDemoActive ? t('dashboard.demoReadonlyHint') : t('dashboard.btnRecord')}
            className="shrink-0"
          >
            <Mic className="w-4 h-4" />
            <span>{t('header.newMeeting')}</span>
          </Button>

          {/* Server status */}
          {!isDemoActive && (
            <Badge
              variant={serverOnline ? 'online' : 'offline'}
              pulse={serverOnline}
              title={serverOnline ? `${t('header.statusOnline')} · ${defaultModel}` : t('header.statusOffline')}
              className="hidden sm:inline-flex"
            >
              {serverOnline ? t('header.statusOnline') : t('header.statusOffline')}
            </Badge>
          )}

          {/* Settings / More */}
          <div className="relative z-20 more-menu-container">
            <Tooltip content={t('common.settings')}>
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className={`h-9 rounded-lg border px-3 text-xs font-semibold flex items-center gap-2 transition-all bg-transparent cursor-pointer ${
                  activePage === 'settings'
                    ? 'border-border-focus text-accent bg-bg-hover'
                    : 'border-border-subtle hover:border-border-focus text-text-secondary hover:text-text-primary'
                }`}
                aria-expanded={moreOpen}
              >
                <Settings className="w-[18px] h-[18px]" />
                <span className="hidden sm:inline">{t('common.settings')}</span>
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>
            </Tooltip>

            {moreOpen && (
              <div className="ui-overlay-surface absolute right-0 top-11 z-50 flex w-72 flex-col gap-2 rounded-xl border border-border-subtle p-3 animate-in fade-in slide-in-from-top-2 duration-150">
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    navigateTo('settings');
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <Settings className="h-4 w-4 text-text-muted" />
                  {t('common.settings')}
                </button>
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    startTour();
                    showToast(t('tour.started'), 'info');
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <PlayCircle className="h-4 w-4 text-text-muted" />
                  {t('help.tour')}
                </button>
                {demoMode ? (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      exitDemo();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Sparkles className="h-4 w-4 text-red-500" />
                    {t('demo.bannerExit')}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      activateDemo();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                  >
                    <Sparkles className="h-4 w-4 text-text-muted" />
                    {t('help.populateMock')}
                  </button>
                )}
                <hr className="border-border-subtle my-1" />
                <div className="rounded-lg border border-border-subtle bg-bg-elevated p-2">
                  <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase text-text-muted">
                    <Languages className="h-3.5 w-3.5" />
                    {t('common.language')}
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'it', label: 'IT' },
                      { id: 'en', label: 'EN' },
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setLang(item.id as 'it' | 'en')}
                        className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-all ${
                          lang === item.id
                            ? 'bg-accent text-white'
                            : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                >
                  <span className="inline-flex items-center gap-2">
                    <Palette className="h-4 w-4 text-text-muted" />
                    {t('common.theme')}
                  </span>
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Demo mode banner — shown below header when demo is active */}
      {isDemoActive && !tourStep && (
        <DemoBanner
          onExitDemo={exitDemo}
          onStartTour={() => {
            startTour();
            showToast(t('tour.started'), 'info');
          }}
        />
      )}

      {/* Main page content area */}
      <main className="flex-1 flex flex-col gap-5">
        {renderPage()}
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle pt-4 text-center text-[11px] text-text-muted mt-8 leading-relaxed select-none">
        <span dangerouslySetInnerHTML={{ __html: t('common.powerBy') }} />
      </footer>
      {tourStep && <TourOverlay step={TOUR_STEPS[tourStepIndex(tourStep)]} onNext={advanceTour} onBack={retreatTour} onClose={closeTour} />}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <MainApp />
      </ToastProvider>
    </I18nProvider>
  );
}
