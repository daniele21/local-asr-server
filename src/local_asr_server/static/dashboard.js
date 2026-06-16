/**
 * dashboard.js — Home Dashboard controller for ClosedRoom
 */

const DashboardController = (() => {
    let container = null;
    let recentRecordings = [];
    let recentTranscriptions = [];

    async function init() {
        container = document.getElementById('page-home');
        if (!container) return;

        // Listen for language changes to re-render
        window.addEventListener('languagechanged', () => {
            if (container.classList.contains('app-page--active')) {
                render();
            }
        });
    }

    async function render() {
        if (!container) return;

        try {
            // Fetch stats, recent recordings, recent transcriptions, and projects
            const [statsData, recordingsData, transcriptionsData, projectsData] = await Promise.all([
                ApiClient.stats().catch(() => ({ recordings_count: 0, transcriptions_count: 0 })),
                ApiClient.listRecordings().catch(() => ({ items: [] })),
                ApiClient.listTranscriptions(1, 5).catch(() => ({ items: [], total: 0 })),
                ApiClient.listProjects().catch(() => ({ items: [] }))
            ]);

            const recordings = recordingsData.items || [];
            const transcriptions = transcriptionsData.items || [];
            recentRecordings = recordings;
            recentTranscriptions = transcriptions;
            const transTotal = transcriptionsData.total || transcriptions.length;

            const projects = projectsData.items || [];
            const realProjects = projects.filter(p => !p.is_unassigned);
            const projectsCount = realProjects.length;

            // Total analyses count
            let analysesCount = 0;
            try {
                // Approximate from localStorage where manual analyses are stored
                analysesCount = parseInt(localStorage.getItem('analyses_count') || '0', 10);
            } catch {}

            // Check if there is any activity
            const hasActivity = recordings.length > 0 || transcriptions.length > 0;

            if (!hasActivity) {
                renderEmptyState();
                return;
            }

            container.innerHTML = `
                <div class="home-hero home-hero--dashboard">
                    <span class="workspace-heading__eyebrow" data-i18n="dashboard.eyebrow">${i18n.t('dashboard.eyebrow')}</span>
                    <h2>ClosedRoom</h2>
                    <p data-i18n="dashboard.productBody">${i18n.t('dashboard.productBody')}</p>
                    <div class="home-hero__actions">
                        <button type="button" class="btn btn--primary btn--lg" data-page-target="recording">
                            ${i18n.t('dashboard.quickActionRecord')}
                        </button>
                        <button type="button" class="btn btn--secondary btn--lg" data-page-target="transcription">
                            ${i18n.t('dashboard.quickActionTranscribe')}
                        </button>
                    </div>
                </div>

                <div class="dashboard-grid">
                    <!-- Stats section -->
                    <div class="dashboard-section dashboard-section--stats">
                        <div class="stats-grid">
                            ${StatsCard.render(i18n.t('dashboard.statsRecordings'), statsData.recordings_count || recordings.length, '🎙️')}
                            ${StatsCard.render(i18n.t('dashboard.statsTranscriptions'), statsData.transcriptions_count || transTotal, '📝')}
                            ${StatsCard.render(i18n.t('dashboard.statsAnalyses'), analysesCount, '📊')}
                            ${StatsCard.render(i18n.t('dashboard.statsProjects'), projectsCount, '🗂️')}
                        </div>
                    </div>

                    <!-- Left Column: Quick Actions & Recent Projects -->
                    <div class="dashboard-section dashboard-section--left" style="display: flex; flex-direction: column; gap: 24px;">
                        <!-- Quick Actions -->
                        <div class="dashboard-section--actions card">
                            <h3 class="section-title" data-i18n="dashboard.quickActionsTitle">${i18n.t('dashboard.quickActionsTitle')}</h3>
                            <div class="quick-actions-list">
                                <button type="button" class="btn btn--primary" data-page-target="recording">
                                    ${i18n.t('dashboard.quickActionRecord')}
                                </button>
                                <button type="button" class="btn btn--secondary" data-page-target="transcription">
                                    ${i18n.t('dashboard.quickActionTranscribe')}
                                </button>
                                <button type="button" class="btn btn--ghost" data-page-target="settings">
                                    ${i18n.t('dashboard.quickActionSettings')}
                                </button>
                            </div>
                        </div>

                        <!-- Recent Projects -->
                        <div class="dashboard-section--projects card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                                <h3 class="section-title" style="margin: 0;" data-i18n="dashboard.projectsTitle">${i18n.t('dashboard.projectsTitle')}</h3>
                                <button type="button" class="btn btn--ghost btn--sm" data-page-target="projects" style="padding: 4px 8px; font-size: 0.8rem;">
                                    ${i18n.getLang() === 'it' ? 'Vedi tutti →' : 'View all →'}
                                </button>
                            </div>
                            <div class="activity-feed">
                                ${renderRecentProjects(projects)}
                            </div>
                        </div>
                    </div>

                    <!-- Smart Suggestions -->
                    <div class="dashboard-section dashboard-section--suggestions" id="dashboard-suggestions">
                        <!-- Rendered dynamically -->
                    </div>

                    <!-- Recent Activity Feed -->
                    <div class="dashboard-section dashboard-section--activity card">
                        <h3 class="section-title" data-i18n="dashboard.activityTitle">${i18n.t('dashboard.activityTitle')}</h3>
                        <div class="activity-feed">
                            ${renderActivityFeed(recordings, transcriptions)}
                        </div>
                    </div>
                </div>

                <!-- macOS Tip banner -->
                <div class="card macos-tip-banner" id="macos-tip-banner">
                    <div class="macos-tip-banner__icon">🎙️</div>
                    <div class="macos-tip-banner__body">
                        <strong data-i18n="dashboard.macOSBarAlertTitle">${i18n.t('dashboard.macOSBarAlertTitle')}</strong>
                        <p data-i18n="dashboard.macOSBarAlertBody">${i18n.t('dashboard.macOSBarAlertBody')}</p>
                        <span class="tip-troubleshoot" data-i18n="dashboard.macOSBarAlertTroubleshoot">${i18n.t('dashboard.macOSBarAlertTroubleshoot')}</span>
                    </div>
                    <button type="button" class="macos-tip-banner__close" onclick="this.parentElement.remove()" aria-label="Close">&times;</button>
                </div>
            `;

            // Bind page switches
            container.querySelectorAll('[data-page-target]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = btn.getAttribute('data-page-target');
                    if (window.App && typeof window.App.switchPage === 'function') {
                        window.App.switchPage(target);
                    }
                });
            });

            // Render suggestions
            renderSuggestions(recordings, transcriptions);

            // Translate static elements (in case of switch)
            i18n.applyAll(container);

        } catch (err) {
            console.error('Error rendering dashboard:', err);
            container.innerHTML = `
                <div class="error-panel card">
                    <h3>${i18n.t('common.error')}</h3>
                    <p>${err.message}</p>
                </div>
            `;
        }
    }

    function renderEmptyState() {
        container.innerHTML = `
            <div class="dashboard-empty-state">
                <div class="home-hero">
                    <span class="workspace-heading__eyebrow" data-i18n="dashboard.eyebrow">${i18n.t('dashboard.eyebrow')}</span>
                    <h2>ClosedRoom</h2>
                    <p data-i18n="dashboard.emptyBody">${i18n.t('dashboard.emptyBody')}</p>
                </div>

                <div class="card empty-steps-card">
                    <h3 data-i18n="dashboard.firstStepsTitle">${i18n.t('dashboard.firstStepsTitle')}</h3>
                    <ul class="empty-steps-list">
                        <li data-i18n="dashboard.step1">${i18n.t('dashboard.step1')}</li>
                        <li data-i18n="dashboard.step2">${i18n.t('dashboard.step2')}</li>
                        <li data-i18n="dashboard.step3">${i18n.t('dashboard.step3')}</li>
                    </ul>
                </div>

                <div class="empty-state-actions">
                    <button type="button" class="btn btn--primary btn--lg" data-page-target="recording">
                        ${i18n.t('dashboard.quickActionRecord')}
                    </button>
                    <button type="button" class="btn btn--secondary btn--lg" data-page-target="transcription">
                        ${i18n.t('dashboard.quickActionTranscribe')}
                    </button>
                </div>
            </div>
        `;

        // Bind page switches
        container.querySelectorAll('[data-page-target]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-page-target');
                if (window.App && typeof window.App.switchPage === 'function') {
                    window.App.switchPage(target);
                }
            });
        });

        i18n.applyAll(container);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#039;');
    }

    function renderRecentProjects(projects) {
        const realProjects = projects.filter(p => !p.is_unassigned);
        if (realProjects.length === 0) {
            return `<p class="text-muted" data-i18n="dashboard.noProjects">${i18n.t('dashboard.noProjects')}</p>`;
        }

        // Sort projects by the latest recording date inside them
        const sortedProjects = [...realProjects].map(p => {
            let latestDate = 0;
            p.items.forEach(item => {
                const dateStr = item.recording?.created_at;
                if (dateStr) {
                    const d = new Date(dateStr).getTime();
                    if (d > latestDate) latestDate = d;
                }
            });
            return { ...p, latestDate };
        }).sort((a, b) => b.latestDate - a.latestDate);

        // Limit to 3
        const recent = sortedProjects.slice(0, 3);

        return recent.map(project => {
            const audioCount = project.items.length;
            const transcribedCount = project.items.filter(item => item.transcription).length;
            
            const metaText = i18n.getLang() === 'it'
                ? `${audioCount} audio &middot; ${transcribedCount} trascrizioni`
                : `${audioCount} audio &middot; ${transcribedCount} transcriptions`;

            return `
                <div class="activity-item recent-project-item">
                    <div class="activity-item__icon" style="background: rgba(255, 193, 7, 0.1);">📁</div>
                    <div class="activity-item__details">
                        <span class="activity-item__title">${escapeHtml(project.name)}</span>
                        <span class="activity-item__meta">${metaText}</span>
                    </div>
                    <div class="activity-item__actions">
                        <button type="button" class="btn btn--secondary btn--sm" data-page-target="projects">
                            ${i18n.t('projects.btnView') || 'Visualizza'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderActivityFeed(recordings, transcriptions) {
        // Build items list
        const items = [];

        recordings.forEach(rec => {
            items.push({
                type: 'recording',
                id: rec.id,
                title: rec.title || `Recording ${rec.id.substring(0, 8)}`,
                date: new Date(rec.created_at || Date.now()),
                status: rec.status,
                raw: rec
            });
        });

        transcriptions.forEach(tr => {
            items.push({
                type: 'transcription',
                id: tr.id,
                title: tr.audio_filename || `Transcript ${tr.id}`,
                date: new Date(tr.created_at || tr.timestamp || Date.now()),
                raw: tr
            });
        });

        // Sort by date desc
        items.sort((a, b) => b.date - a.date);

        // Limit to 5
        const feedItems = items.slice(0, 5);

        if (feedItems.length === 0) {
            return `<p class="text-muted" data-i18n="dashboard.noActivity">${i18n.t('dashboard.noActivity')}</p>`;
        }

        return feedItems.map(item => ActivityItem.render(item)).join('');
    }

    function renderSuggestions(recordings, transcriptions) {
        const suggestionDiv = document.getElementById('dashboard-suggestions');
        if (!suggestionDiv) return;

        // Check for untranscribed recordings (i.e. recordings not in transcription list)
        const transcribedFilenames = new Set(transcriptions.map(t => t.audio_filename));
        const untranscribed = recordings.filter(r => {
            // Find if recording has an associated transcript file
            const expectedName = r.audio_path ? r.audio_path.split('/').pop() : '';
            return expectedName && !transcribedFilenames.has(expectedName) && r.status === 'completed';
        });

        if (untranscribed.length > 0) {
            suggestionDiv.innerHTML = SuggestionBanner.render(
                i18n.t('dashboard.untranscribedWarning', { count: untranscribed.length }),
                i18n.t('dashboard.transcribeNow'),
                () => {
                    // Set context to load first untranscribed recording
                    Workflow.update({
                        navigateContext: {
                            preselectedRecording: untranscribed[0]
                        }
                    });
                    if (window.App && typeof window.App.switchPage === 'function') {
                        window.App.switchPage('transcription');
                    }
                }
            );
            
            // Add click handler to button
            const btn = suggestionDiv.querySelector('.suggestion-banner__btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    Workflow.update({
                        navigateContext: {
                            preselectedRecording: untranscribed[0]
                        }
                    });
                    if (window.App && typeof window.App.switchPage === 'function') {
                        window.App.switchPage('transcription');
                    }
                });
            }
        } else {
            suggestionDiv.style.display = 'none';
        }
    }

    function handleRecordingClick(id) {
        const rec = recentRecordings.find(r => r.id === id);
        if (rec) {
            Workflow.update({
                navigateContext: {
                    preselectedRecording: rec
                }
            });
            if (window.App && typeof window.App.switchPage === 'function') {
                window.App.switchPage('transcription');
            }
        }
    }

    function handleTranscriptionClick(id) {
        Workflow.update({
            navigateContext: {
                preselectedTranscriptionId: id
            }
        });
        if (window.App && typeof window.App.switchPage === 'function') {
            window.App.switchPage('analysis');
        }
    }

    return { init, render, handleRecordingClick, handleTranscriptionClick };
})();

window.DashboardController = DashboardController;
