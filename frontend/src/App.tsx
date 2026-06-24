import { useState, useEffect } from 'react';
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
import { Badge } from './components/ui/Badge';
import { Tooltip } from './components/ui/Tooltip';
import { TourOverlay, TourStep } from './features/tour/TourOverlay';

function MainApp() {
  const { t, lang, setLang } = useTranslation();
  const { showToast } = useToast();

  const [activePage, setActivePage] = useState<string>('home');
  const [serverOnline, setServerOnline] = useState(false);
  const [defaultModel, setDefaultModel] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [helpOpen, setHelpOpen] = useState(false);
  const [routeDetail, setRouteDetail] = useState<string | null>(null);
  const [tourStep, setTourStep] = useState<TourStep | null>(null);
  const [tourReturnHash, setTourReturnHash] = useState('');

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
    };
    const route = pageRouteMap[page] || page;
    window.location.hash = detail ? `${route}/${detail}` : route;
  };

  const startTour = () => {
    setTourReturnHash(window.location.hash || '#home');
    setTourStep('transcription');
    navigateTo('transcription');
  };

  const advanceTour = () => {
    if (tourStep === 'transcription') {
      setTourStep('analysis');
      navigateTo('analysis');
    } else if (tourStep === 'analysis') {
      setTourStep('complete');
    }
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
  }, []);

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
        return <DashboardPage navigateTo={navigateTo} />;
      case 'recording':
        return <RecordingPage detailId={routeDetail} navigateTo={navigateTo} />;
      case 'transcription':
        return <TranscriptionPage detailPath={routeDetail} navigateTo={navigateTo} demoMode={tourStep === 'transcription'} />;
      case 'projects':
        return <ProjectsPage navigateTo={navigateTo} />;
      case 'analysis':
        return <AnalysisPage detailId={routeDetail} navigateTo={navigateTo} demoMode={tourStep === 'analysis' || tourStep === 'complete'} />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage navigateTo={navigateTo} />;
    }
  };

  if (activePage === 'overlay') {
    return <RecordingOverlayPage />;
  }

  return (
    <div className="relative min-h-screen z-10 w-full max-w-[1440px] px-4 md:px-10 py-6 mx-auto flex flex-col gap-6">
      {/* Background glow decorations */}
      <div className="glow-bg glow-bg--1 -top-[200px] -right-[150px] bg-accent-glow-lg"></div>
      <div className="glow-bg glow-bg--2 -bottom-[250px] -left-[150px] bg-[rgba(16,185,129,0.04)]"></div>

      {/* Header */}
      <header className="flex flex-col lg:flex-row items-start lg:items-center justify-between border-b border-border-subtle pb-5 gap-4">
        {/* Brand */}
        <button
          onClick={() => navigateTo('home')}
          className="flex items-center gap-4.5 bg-transparent border-0 text-inherit text-left cursor-pointer p-0 select-none group focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-border-focus focus-visible:rounded-lg"
        >
          <div className="w-14 h-14 bg-bg-elevated border border-border-subtle rounded-xl p-2 shadow-md shadow-accent/5 hover:scale-105 hover:border-accent-hover transition-all duration-200 flex items-center justify-center relative overflow-hidden">
            <img src="/logo-dark.svg" alt="Logo" className="w-full h-full object-contain dark:block hidden" />
            <img src="/logo-light.svg" alt="Logo" className="w-full h-full object-contain dark:hidden block" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-text-primary to-accent-hover bg-clip-text text-transparent">
              ClosedRoom
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">{t('header.subtitle')}</p>
          </div>
        </button>

        {/* Navigation */}
        <nav className="flex bg-bg-elevated border border-border-subtle rounded-full p-1 gap-1 mx-auto lg:mx-0 w-full lg:w-auto overflow-x-auto select-none">
          {[
            { id: 'projects', label: t('nav.projects'), icon: '🗂️' },
            { id: 'recording', label: t('nav.recording'), icon: '🎙️' },
            { id: 'transcription', label: t('nav.transcription'), icon: '📝' },
            { id: 'analysis', label: t('nav.analysis'), icon: '🧠' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer ${
                activePage === item.id
                  ? 'bg-accent text-white shadow-md shadow-accent/15'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              <span>{item.icon}</span>
              <span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3 self-stretch lg:self-auto justify-end lg:justify-start">
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
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
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
                  🚀 {t('help.tour')}
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
              <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.39a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </Tooltip>

          {/* Theme toggler */}
          <Tooltip content={t('common.theme')}>
            <button
              onClick={toggleTheme}
              className="w-9 h-9 border border-border-subtle hover:border-border-focus text-text-secondary hover:text-text-primary rounded-lg flex items-center justify-center transition-all bg-transparent cursor-pointer"
            >
              {theme === 'dark' ? (
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.42 1.42M2 12h2M20 12h2M6.34 17.66l-1.42 1.42M19.07 4.93l-1.42 1.42" />
                </svg>
              ) : (
                <svg className="w-[18px] h-[18px]" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
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
      {tourStep && <TourOverlay step={tourStep} onNext={advanceTour} onClose={closeTour} />}
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
