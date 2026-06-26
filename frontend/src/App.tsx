import { useState, useEffect } from 'react';
import { BarChart3, CircleHelp, FolderKanban, Mic, Moon, Settings, Sun } from 'lucide-react';
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
import { Tooltip } from './components/ui/Tooltip';
import { TourOverlay } from './features/tour/TourOverlay';
import { TOUR_STEPS, TourStepId, tourStepIndex } from './features/tour/tourSteps';

function MainApp() {
  const { t, lang, setLang } = useTranslation();
  const { showToast } = useToast();

  const [activePage, setActivePage] = useState<string>('home');
  const [serverOnline, setServerOnline] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [helpOpen, setHelpOpen] = useState(false);
  const [routeDetail, setRouteDetail] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<TourStepId | null>(null);
  const [tourReturnHash, setTourReturnHash] = useState('');
  const demoMode = Boolean(tourStep);

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
      if (demoMode) {
        setServerOnline(false);
        setDefaultModel('');
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
  }, [demoMode]);

  // Close help panel on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.help-menu-container')) {
        setHelpOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <DashboardPage navigateTo={navigateTo} demoMode={demoMode} />;
      case 'meeting':
        return <MeetingDetailPage recordingId={routeDetail} navigateTo={navigateTo} />;
      case 'recording':
        return <RecordingPage detailId={routeDetail} navigateTo={navigateTo} />;
      case 'transcription':
        return <TranscriptionPage detailPath={routeDetail} navigateTo={navigateTo} demoMode={demoMode && activePage === 'transcription'} />;
      case 'projects':
        return <ProjectsPage navigateTo={navigateTo} demoMode={demoMode} />;
      case 'analysis':
        return <AnalysisPage detailId={routeDetail} navigateTo={navigateTo} demoMode={demoMode && activePage === 'analysis'} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage navigateTo={navigateTo} demoMode={demoMode} />;
    }
  };

  if (activePage === 'overlay') {
    return <RecordingOverlayPage />;
  }

  return (
    <div className="app-chrome min-h-screen">
      <div className="app-shell relative z-10 mx-auto flex min-h-screen w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-10">
      {/* Header */}
      <header className="app-header grid grid-cols-1 items-start gap-4 border-b border-border-subtle pb-5 xl:grid-cols-[minmax(300px,1fr)_auto_minmax(420px,1fr)] xl:items-center">
        {/* Brand */}
        <button
          onClick={() => navigateTo('home')}
          className="group flex min-w-0 cursor-pointer select-none items-center gap-4 border-0 bg-transparent p-0 text-left text-inherit focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-border-focus"
        >
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-mark-halo" />
            <img src="/logo-dark.svg" alt="" className="brand-logo brand-logo-dark" />
            <img src="/logo-light.svg" alt="" className="brand-logo brand-logo-light" />
          </span>
          <span className="min-w-0">
            <h1 className="text-[1.55rem] font-bold leading-none text-text-primary transition-colors duration-200 group-hover:text-accent-hover">
              ClosedRoom
            </h1>
            <p className="mt-1 text-xs text-text-secondary">{t('header.subtitle')}</p>
          </span>
        </button>

        {/* Navigation */}
        <nav className="app-nav flex w-full gap-1 overflow-x-auto rounded-lg border border-border-subtle bg-bg-elevated/85 p-1 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)] select-none xl:mx-0 xl:w-auto xl:justify-self-center">
          {[
            { id: 'home', label: t('nav.home'), icon: BarChart3 },
            { id: 'projects', label: t('nav.projects'), icon: FolderKanban },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3.5 py-2 text-xs font-semibold transition-all duration-200 ease-spring active:scale-95 cursor-pointer ${
                activePage === item.id || (item.id === 'home' && activePage === 'meeting')
                  ? 'bg-gradient-to-b from-accent to-accent/95 text-white shadow-md shadow-accent/15'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <item.icon className="w-4 h-4" />
              <span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 self-stretch xl:self-auto xl:justify-self-end">
          <button
            onClick={() => navigateTo('recording')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-md shadow-accent/10 hover:bg-accent-hover transition-colors"
          >
            <Mic className="w-4 h-4" />
            <span className="hidden sm:inline">{t('dashboard.btnRecord')}</span>
          </button>

          {/* Server status */}
          <Badge
            variant={serverOnline ? 'online' : 'offline'}
            pulse={serverOnline}
            title={serverOnline ? `${t('header.statusOnline')} · ${defaultModel}` : t('header.statusOffline')}
            className="hidden sm:inline-flex"
          >
            {serverOnline ? t('header.statusOnline') : t('header.statusOffline')}
          </Badge>

          {/* Help menu */}
          <div className="relative help-menu-container">
            <Tooltip content={t('common.help')}>
              <button
                onClick={() => setHelpOpen(!helpOpen)}
                className="w-9 h-9 border border-border-subtle hover:border-border-focus text-text-secondary hover:text-text-primary rounded-lg flex items-center justify-center transition-all bg-transparent cursor-pointer"
                aria-expanded={helpOpen}
              >
                <CircleHelp className="w-[18px] h-[18px]" />
              </button>
            </Tooltip>

            {helpOpen && (
              <div className="absolute right-0 top-11 z-50 w-72 bg-bg-surface border border-border-subtle rounded-xl p-4 shadow-xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
                <strong className="text-sm font-semibold">{t('help.title')}</strong>
                
                {/* Showcase demo quick launches can go here if needed */}
                <button
                  onClick={() => {
                    setHelpOpen(false);
                    startTour();
                    showToast(t('tour.started'), 'info');
                  }}
                  className="w-full py-1.5 px-3 bg-bg-hover hover:bg-bg-elevated text-xs font-medium rounded-lg text-left transition-colors cursor-pointer"
                >
                  {t('help.tour')}
                </button>
                <hr className="border-border-subtle my-1" />
                <strong className="text-xs text-text-secondary uppercase tracking-wider">{t('help.menuBarTitle')}</strong>
                <div className="text-[11px] leading-relaxed text-text-muted flex flex-col gap-1.5">
                  <p>{t('help.menuBarTitle')}</p>
                  <p><strong>{t('help.notVisible')}</strong></p>
                  <ul className="list-disc pl-4 flex flex-col gap-1">
                    <li><strong>{t('help.notchTitle')}</strong> {t('help.notchDesc')}</li>
                    <li><strong>{t('help.shortcutsTitle')}</strong> {t('help.shortcutsDesc')}</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Language Switcher */}
          <div className="flex gap-1 border-r border-border-subtle pr-3 select-none">
            <button
              onClick={() => setLang('it')}
              className={`w-9 h-8 rounded-lg flex items-center justify-center font-bold text-xs border transition-all cursor-pointer ${
                lang === 'it'
                  ? 'bg-bg-hover border-border-focus opacity-100 text-text-primary'
                  : 'bg-transparent border-transparent opacity-45 hover:opacity-80 hover:bg-bg-hover hover:border-border-subtle'
              }`}
              title="Italiano"
            >
              🇮🇹
            </button>
            <button
              onClick={() => setLang('en')}
              className={`w-9 h-8 rounded-lg flex items-center justify-center font-bold text-xs border transition-all cursor-pointer ${
                lang === 'en'
                  ? 'bg-bg-hover border-border-focus opacity-100 text-text-primary'
                  : 'bg-transparent border-transparent opacity-45 hover:opacity-80 hover:bg-bg-hover hover:border-border-subtle'
              }`}
              title="English"
            >
              🇬🇧
            </button>
          </div>

          {/* Settings */}
          <Tooltip content={t('common.settings')}>
            <button
              onClick={() => navigateTo('settings')}
              className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-all bg-transparent cursor-pointer ${
                activePage === 'settings'
                  ? 'border-border-focus text-accent bg-bg-hover'
                  : 'border-border-subtle hover:border-border-focus text-text-secondary hover:text-text-primary'
              }`}
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>
          </Tooltip>

          {/* Theme toggler */}
          <Tooltip content={t('common.theme')}>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 border border-border-subtle hover:border-border-focus text-text-secondary hover:text-text-primary rounded-lg flex items-center justify-center transition-all bg-transparent cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
          </Tooltip>
        </div>
      </header>

      {/* Main page content area */}
      <main className="flex-1 flex flex-col gap-5">
        {renderPage()}
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle pt-4 text-center text-[11px] text-text-muted mt-8 leading-relaxed select-none">
        <span dangerouslySetInnerHTML={{ __html: t('common.powerBy') }} />
      </footer>
      {tourStep && <TourOverlay step={TOUR_STEPS[tourStepIndex(tourStep)]} onNext={advanceTour} onClose={closeTour} />}
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
