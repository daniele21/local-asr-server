/**
 * app.js — Main Orchestrator for ASR Whisper Studio
 *
 * Coordinates the progressive disclosure flow: Upload → Transcribe → Results.
 * Uses components from components.js and configuration from config.js.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════════════════════════════════════════
    // DOM References
    // ═══════════════════════════════════════════════════════════════════════════

    const dom = {
        // File preview
        previewFilename: document.getElementById('preview-filename'),
        previewFilesize: document.getElementById('preview-filesize'),
        audioElement:    document.getElementById('audio-element'),
        changeFileBtn:   document.getElementById('change-file-btn'),

        // Transcribe
        transcribeBtn:     document.getElementById('transcribe-btn'),
        transcribeBtnText: document.getElementById('transcribe-btn-text'),
        btnSpinner:        document.getElementById('btn-spinner'),
        transcribePlayBtn: document.getElementById('transcribe-play-btn'),

        // Processing
        processingCard:       document.getElementById('processing-card'),
        processTimer:         document.getElementById('process-timer'),
        progressStatus:       document.getElementById('progress-status'),
        progressBarFill:      document.getElementById('progress-bar-fill'),
        progressLabel:        document.getElementById('progress-label'),
        liveConsole:          document.getElementById('live-console'),
        livePreviewContainer: document.getElementById('live-preview-container'),
        livePreviewText:      document.getElementById('live-preview-text'),

        // Results
        transcriptText:  document.getElementById('transcript-text'),
        rawJson:         document.getElementById('raw-json'),
        segmentsList:    document.getElementById('segments-list'),
        segmentsTabBtn:  document.getElementById('segments-tab-btn'),
        statTime:        document.getElementById('stat-time'),
        statLang:        document.getElementById('stat-lang'),
        statModel:       document.getElementById('stat-model'),
        copyBtn:         document.getElementById('copy-btn'),
        copyBtnText:     document.getElementById('copy-btn-text'),
        newTransBtn:     document.getElementById('new-transcription-btn'),
        recordingsList:  document.getElementById('recordings-list'),
        recordingsCount: document.getElementById('recordings-count'),
        refreshRecordings: document.getElementById('refresh-recordings'),
        recordingsPagination: document.getElementById('recordings-pagination'),
        recordingsPrevious: document.getElementById('recordings-prev'),
        recordingsNext: document.getElementById('recordings-next'),
        recordingsPageStatus: document.getElementById('recordings-page-status'),
        recorderPanel: document.getElementById('view-recording'),
        recordingPageContent: document.getElementById('recording-page-content'),
        dropzone: document.getElementById('dropzone'),
        browseBtn: document.getElementById('browse-btn'),
        helpMenuToggle: document.getElementById('help-menu-toggle'),
        helpMenuPanel: document.getElementById('help-menu-panel'),

        // Collapsible picker & columns
        sourceCollapsible: document.getElementById('source-collapsible'),
        sourceSummary: document.getElementById('source-summary'),
        transcribeWorkspace: document.getElementById('transcribe-workspace'),

        // Transcription History & Settings
        transcriptionsList: document.getElementById('transcriptions-list'),
        transcriptionsDirInput: document.getElementById('transcriptions-dir-input'),
        recordingsDirInput: document.getElementById('recordings-dir-input'),
        browseTranscriptionsDirBtn: document.getElementById('browse-transcriptions-dir-btn'),
        browseRecordingsDirBtn: document.getElementById('browse-recordings-dir-btn'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        saveRecordingsSettingsBtn: document.getElementById('save-recordings-settings-btn'),
        historyCount: document.getElementById('history-count'),
        historyPagination: document.getElementById('history-pagination'),
        historyPrev: document.getElementById('history-prev'),
        historyNext: document.getElementById('history-next'),
        historyPageStatus: document.getElementById('history-page-status'),

        // Header
        themeToggle:  document.getElementById('theme-toggle'),
        serverStatus: document.getElementById('server-status'),
    };


    // ═══════════════════════════════════════════════════════════════════════════
    // Application State
    // ═══════════════════════════════════════════════════════════════════════════

    let selectedFile = null;
    let timerInterval = null;
    let timerStart = 0;
    let selectedObjectUrl = null;
    let historyPage = 1;


    // ═══════════════════════════════════════════════════════════════════════════
    // Initialization
    // ═══════════════════════════════════════════════════════════════════════════

    /** Set up all components and start health checks */
    function init() {
        // Apply saved theme
        const savedTheme = localStorage.getItem('theme') || DEFAULTS.theme;
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Populate settings form from config
        SettingsForm.populate();

        // Initialize components
        if (dom.recordingPageContent && dom.recorderPanel) {
            dom.recordingPageContent.appendChild(dom.recorderPanel);
            dom.recorderPanel.hidden = false;
        }
        window.AppNavigation = { switchPage };
        CollapsiblePanel.init();
        FileDropzone.init({ onFileSelected: handleFileSelected });
        RecordingsView.init({
            container: dom.recordingsList,
            pagination: dom.recordingsPagination,
            previous: dom.recordingsPrevious,
            next: dom.recordingsNext,
            status: dom.recordingsPageStatus,
            onSelect: selectRecording,
            onRename: loadRecordings,
        });
        Tour.init();
        RecordingController.init({
            onSaved: () => {
                loadRecordings();
                Toast.show('Registrazione salvata. Ora puoi trascriverla dalla pagina Trascrizione.', 'success');
            },
        });

        // Bind event handlers
        bindEvents();

        // Set initial step
        StepIndicator.setStep('upload');
        switchPage(getInitialPage(), { updateHash: false });
        loadRecordings();
        loadSettings();
        loadHistory();

        // Start server health polling
        checkServerHealth();
        setInterval(checkServerHealth, HEALTH_CHECK_INTERVAL_MS);
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Event Bindings
    // ═══════════════════════════════════════════════════════════════════════════

    function bindEvents() {
        // Theme toggle
        dom.themeToggle.addEventListener('click', toggleTheme);

        // Change file → go back to upload step
        dom.changeFileBtn.addEventListener('click', goToUploadStep);

        // Transcribe button
        dom.transcribeBtn.addEventListener('click', startTranscription);

        // Copy to clipboard
        dom.copyBtn.addEventListener('click', copyToClipboard);

        // New transcription
        dom.newTransBtn.addEventListener('click', goToUploadStep);
        dom.refreshRecordings.addEventListener('click', loadRecordings);
        dom.helpMenuToggle.addEventListener('click', toggleHelpMenu);
        document.querySelectorAll('[data-page-target]').forEach(button => {
            button.addEventListener('click', () => switchPage(button.dataset.pageTarget));
        });
        window.addEventListener('hashchange', () => {
            switchPage(getInitialPage(), { updateHash: false });
        });

        document.addEventListener('click', event => {
            if (!event.target.closest('.help-menu')) closeHelpMenu();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeHelpMenu();
        });

        // Tabs
        document.querySelectorAll('.tabs__btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn));
            btn.addEventListener('keydown', handleTabKeydown);
        });

        // Guided Tour and Showcase triggers
        document.getElementById('start-tour-btn')?.addEventListener('click', () => {
            closeHelpMenu();
            switchPage('transcription');
            Tour.startInteractive();
        });
        document.getElementById('start-showcase-btn')?.addEventListener('click', () => {
            closeHelpMenu();
            switchPage('transcription');
            Showcase.start();
        });
        document.getElementById('start-recording-btn')?.addEventListener('click', () => {
            closeHelpMenu();
            Tour.startRecordingShowcase();
        });

        // Transcribe Play Button event listeners
        dom.transcribePlayBtn?.addEventListener('click', toggleTranscribePlay);
        dom.audioElement?.addEventListener('play', () => updateTranscribePlayIcon(true));
        dom.audioElement?.addEventListener('pause', () => updateTranscribePlayIcon(false));
        dom.audioElement?.addEventListener('ended', () => updateTranscribePlayIcon(false));

        // Settings Save
        dom.saveSettingsBtn?.addEventListener('click', saveFolderSettings);
        dom.saveRecordingsSettingsBtn?.addEventListener('click', saveAudioFolderSettings);
        dom.browseTranscriptionsDirBtn?.addEventListener('click', () => browseDirectory('transcription'));
        dom.browseRecordingsDirBtn?.addEventListener('click', () => browseDirectory('audio'));

        // History Pagination
        dom.historyPrev?.addEventListener('click', () => setHistoryPage(historyPage - 1));
        dom.historyNext?.addEventListener('click', () => setHistoryPage(historyPage + 1));

        // Initialize Analysis bindings
        AnalysisController.init();
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Theme
    // ═══════════════════════════════════════════════════════════════════════════

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Server Health & Configurations
    // ═══════════════════════════════════════════════════════════════════════════

    async function checkServerHealth() {
        try {
            const data = await ApiClient.health();
            const modelShort = data.default_model.split('/').pop();
            setServerStatus(true, `${LABELS.statusOnline} · ${modelShort}`);
        } catch {
            setServerStatus(false, LABELS.statusOffline);
        }
    }

    function setServerStatus(isOnline, text) {
        const dot = dom.serverStatus.querySelector('.status-badge__dot');
        const txt = dom.serverStatus.querySelector('.status-badge__text');

        dot.className = `status-badge__dot status-badge__dot--${isOnline ? 'online' : 'offline'}`;
        txt.textContent = text;
    }

    async function loadSettings() {
        if (!dom.transcriptionsDirInput) return;
        try {
            const settings = await ApiClient.getSettings();
            dom.transcriptionsDirInput.value = settings.transcriptions_dir || '';
            if (dom.recordingsDirInput) {
                dom.recordingsDirInput.value = settings.recordings_dir || '';
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
    }

    async function saveFolderSettings() {
        const transDir = dom.transcriptionsDirInput.value.trim();
        if (!transDir) {
            Toast.show('Inserisci un percorso valido per le trascrizioni.', 'warning');
            return;
        }
        dom.saveSettingsBtn.disabled = true;
        dom.saveSettingsBtn.textContent = 'Salvataggio...';
        try {
            const current = await ApiClient.getSettings();
            const settings = await ApiClient.updateSettings(
                transDir,
                current.recordings_dir || '',
                current.gemini_api_key || '',
                current.llm_provider || 'mock'
            );
            dom.transcriptionsDirInput.value = settings.transcriptions_dir;
            Toast.show('Cartella trascrizioni aggiornata con successo.', 'success');
            loadHistory();
        } catch (err) {
            Toast.show(`Errore: ${err.message}`, 'error');
        } finally {
            dom.saveSettingsBtn.disabled = false;
            dom.saveSettingsBtn.textContent = 'Salva';
        }
    }

    async function saveAudioFolderSettings() {
        const recDir = dom.recordingsDirInput.value.trim();
        if (!recDir) {
            Toast.show('Inserisci un percorso valido per le registrazioni audio.', 'warning');
            return;
        }
        dom.saveRecordingsSettingsBtn.disabled = true;
        dom.saveRecordingsSettingsBtn.textContent = 'Salvataggio...';
        try {
            const current = await ApiClient.getSettings();
            const settings = await ApiClient.updateSettings(
                current.transcriptions_dir || '',
                recDir,
                current.gemini_api_key || '',
                current.llm_provider || 'mock'
            );
            dom.recordingsDirInput.value = settings.recordings_dir;
            Toast.show('Cartella audio aggiornata con successo.', 'success');
        } catch (err) {
            Toast.show(`Errore: ${err.message}`, 'error');
        } finally {
            dom.saveRecordingsSettingsBtn.disabled = false;
            dom.saveRecordingsSettingsBtn.textContent = 'Salva';
        }
    }

    async function browseDirectory(target) {
        const btn = target === 'transcription' ? dom.browseTranscriptionsDirBtn : dom.browseRecordingsDirBtn;
        const input = target === 'transcription' ? dom.transcriptionsDirInput : dom.recordingsDirInput;
        if (!btn || !input) return;

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '...';

        try {
            const data = await ApiClient.selectDirectory();
            if (data.path) {
                input.value = data.path;
                Toast.show('Cartella selezionata. Clicca su Salva per confermare.', 'info');
            } else if (data.error) {
                console.warn('System directory dialog warning:', data.error);
            }
        } catch (err) {
            console.error('Failed to open directory dialog:', err);
            Toast.show('Impossibile aprire la selezione cartella di sistema.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Step Navigation
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Handle a newly selected file — transition from Upload to Transcribe step.
     * @param {File} file
     */
    function handleFileSelected(file) {
        if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
        selectedFile = file;
        Workflow.update({ selectedFile: file, step: 'transcribe', sourcePanel: null });

        // Update file preview
        dom.previewFilename.textContent = file.name;
        dom.previewFilesize.textContent = Utils.formatBytes(file.size);

        // Load audio preview
        selectedObjectUrl = URL.createObjectURL(file);
        dom.audioElement.src = selectedObjectUrl;

        // Transition to Step 2
        StepIndicator.setStep('transcribe');
        collapseSourcePanel();
        switchPage('transcription');
    }

    function collapseSourcePanel() {
        const body = document.getElementById('source-collapsible-body');
        const trigger = document.getElementById('source-collapsible-trigger');
        if (body && !body.classList.contains('collapsible--collapsed')) {
            body.style.maxHeight = body.scrollHeight + 'px';
            body.offsetHeight; // force reflow
            body.style.maxHeight = '0px';
            body.classList.add('collapsible--collapsed');
            trigger?.classList.remove('collapsible-trigger--open');
            trigger?.setAttribute('aria-expanded', 'false');
        }
        dom.sourceSummary.style.display = 'flex';
        dom.transcribeWorkspace.style.display = 'grid';
    }

    function expandSourcePanel() {
        const body = document.getElementById('source-collapsible-body');
        const trigger = document.getElementById('source-collapsible-trigger');
        if (body && body.classList.contains('collapsible--collapsed')) {
            body.classList.remove('collapsible--collapsed');
            body.style.maxHeight = body.scrollHeight + 'px';
            trigger?.classList.add('collapsible-trigger--open');
            trigger?.setAttribute('aria-expanded', 'true');
            const onTransitionEnd = (e) => {
                if (e.propertyName === 'max-height') {
                    body.style.maxHeight = 'none';
                    body.removeEventListener('transitionend', onTransitionEnd);
                }
            };
            body.addEventListener('transitionend', onTransitionEnd);
        }
        dom.sourceSummary.style.display = 'none';
        dom.transcribeWorkspace.style.display = 'none';
    }

    /** Go back to the upload step (reset state) */
    function goToUploadStep() {
        selectedFile = null;
        FileDropzone.reset();
        dom.audioElement.removeAttribute('src');
        if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
        selectedObjectUrl = null;

        // Reset processing UI
        dom.processingCard.style.display = 'none';

        StepIndicator.setStep('upload');
        Workflow.update({ selectedFile: null, step: 'upload', sourcePanel: null });
        expandSourcePanel();
        switchPage('transcription');
        loadRecordings();
    }

    function getInitialPage() {
        const page = window.location.hash.replace('#', '');
        return ['home', 'recording', 'transcription', 'analysis'].includes(page)
            ? page
            : 'home';
    }

    function switchPage(pageName, options = {}) {
        document.querySelectorAll('[data-app-page]').forEach(page => {
            page.classList.toggle('app-page--active', page.dataset.appPage === pageName);
        });
        document.querySelectorAll('.primary-nav [data-page-target]').forEach(button => {
            const active = button.dataset.pageTarget === pageName;
            button.classList.toggle('primary-nav__item--active', active);
            if (active) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
        if (options.updateHash !== false) {
            history.replaceState(null, '', `#${pageName}`);
        }
        if (pageName === 'transcription') {
            loadRecordings();
            loadHistory();
        } else if (pageName === 'analysis') {
            AnalysisController.loadTranscriptions();
            AnalysisController.loadSettings();
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    function toggleHelpMenu() {
        const shouldOpen = dom.helpMenuPanel.hidden;
        dom.helpMenuPanel.hidden = !shouldOpen;
        dom.helpMenuToggle.setAttribute('aria-expanded', String(shouldOpen));
    }

    function closeHelpMenu() {
        dom.helpMenuPanel.hidden = true;
        dom.helpMenuToggle.setAttribute('aria-expanded', 'false');
    }

    async function loadRecordings() {
        if (!dom.recordingsList) return;
        dom.recordingsList.innerHTML = '<p class="recordings-list__empty">Caricamento registrazioni...</p>';
        try {
            const { items } = await ApiClient.listRecordings();
            const count = RecordingsView.setItems(items);
            dom.recordingsCount.textContent = `${count} ${count === 1 ? 'elemento' : 'elementi'}`;
        } catch (error) {
            console.error('Unable to load recordings:', error);
            dom.recordingsList.innerHTML = '<p class="recordings-list__empty">Impossibile caricare le registrazioni.</p>';
        }
    }

    async function selectRecording(recording, button) {
        button.disabled = true;
        button.textContent = 'Caricamento...';
        try {
            const blob = await ApiClient.recordingAudio(recording.id);
            const extension = recording.audio_file.split('.').pop() || 'webm';
            const file = new File(
                [blob],
                `${recording.title}.${extension}`,
                { type: recording.mime_type || blob.type },
            );
            handleFileSelected(file);
        } catch (error) {
            Toast.show(`Audio non disponibile: ${error.message}`, 'error');
            button.disabled = false;
            button.textContent = 'Usa audio';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Transcribe Playback control
    // ═══════════════════════════════════════════════════════════════════════════

    function toggleTranscribePlay() {
        if (!dom.audioElement) return;
        if (dom.audioElement.paused) {
            dom.audioElement.play().catch(err => {
                console.error('Audio playback failed:', err);
                Toast.show('Errore durante la riproduzione audio', 'error');
            });
        } else {
            dom.audioElement.pause();
        }
    }

    function updateTranscribePlayIcon(isPlaying) {
        if (!dom.transcribePlayBtn) return;
        const playIcon = dom.transcribePlayBtn.querySelector('.icon-play');
        const pauseIcon = dom.transcribePlayBtn.querySelector('.icon-pause');
        if (isPlaying) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'inline-block';
            dom.transcribePlayBtn.title = 'Pausa';
        } else {
            if (playIcon) playIcon.style.display = 'inline-block';
            if (pauseIcon) pauseIcon.style.display = 'none';
            dom.transcribePlayBtn.title = 'Ascolta';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Transcription History
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadHistory() {
        if (!dom.transcriptionsList) return;
        dom.transcriptionsList.innerHTML = '<p class="transcriptions-list__empty">Caricamento storico...</p>';
        try {
            const { items, total, page, limit } = await ApiClient.listTranscriptions(historyPage, 5);
            dom.historyCount.textContent = `${total} ${total === 1 ? 'elemento' : 'elementi'}`;
            renderHistory(items, total, page, limit);
        } catch (err) {
            console.error('Failed to load history:', err);
            dom.transcriptionsList.innerHTML = '<p class="transcriptions-list__empty">Impossibile caricare lo storico.</p>';
        }
    }

    function setHistoryPage(page) {
        const totalItems = parseInt(dom.historyCount.textContent) || 0;
        const totalPages = Math.max(1, Math.ceil(totalItems / 5));
        historyPage = Math.min(Math.max(page, 1), totalPages);
        loadHistory();
    }

    function renderHistory(items, total, page, limit) {
        dom.transcriptionsList.replaceChildren();
        if (items.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'transcriptions-list__empty';
            empty.textContent = 'Nessuna trascrizione in archivio.';
            dom.transcriptionsList.appendChild(empty);
            dom.historyPagination.hidden = true;
            return;
        }

        items.forEach(item => {
            const row = document.createElement('article');
            row.className = 'transcription-row';

            const info = document.createElement('div');
            info.className = 'transcription-row__info';

            const meta = document.createElement('span');
            meta.className = 'transcription-row__meta';
            const dtStr = new Intl.DateTimeFormat('it-IT', {
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(new Date(item.timestamp));
            const modelName = item.model ? item.model.split('/').pop() : 'Default';
            meta.textContent = `${dtStr} · Modello: ${modelName} · Lingua: ${item.language || 'it'} · Audio: ${item.audio_filename}`;

            const snippet = document.createElement('div');
            snippet.className = 'transcription-row__snippet';
            snippet.textContent = item.text || '(Trascrizione vuota)';

            info.append(meta, snippet);

            const actions = document.createElement('div');
            actions.className = 'transcription-row__actions';

            const readBtn = document.createElement('button');
            readBtn.type = 'button';
            readBtn.className = 'btn btn--ghost btn--sm';
            readBtn.textContent = 'Leggi';
            readBtn.addEventListener('click', () => {
                renderResults(item);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn--ghost btn--sm btn-delete';
            deleteBtn.textContent = 'Elimina';
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Sei sicuro di voler eliminare questa trascrizione dallo storico?')) {
                    try {
                        await ApiClient.deleteTranscription(item.id);
                        Toast.show('Trascrizione eliminata', 'success');
                        loadHistory();
                    } catch (err) {
                        Toast.show(`Eliminazione fallita: ${err.message}`, 'error');
                    }
                }
            });

            actions.append(readBtn, deleteBtn);
            row.append(info, actions);
            dom.transcriptionsList.appendChild(row);
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        dom.historyPagination.hidden = totalPages <= 1;
        dom.historyPrev.disabled = page === 1;
        dom.historyNext.disabled = page === totalPages;
        dom.historyPageStatus.textContent = `Pagina ${page} di ${totalPages}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Transcription
    // ═══════════════════════════════════════════════════════════════════════════

    async function startTranscription() {
        if (!selectedFile) return;

        // ── Lock UI ──
        dom.transcribeBtn.disabled = true;
        dom.transcribeBtnText.textContent = LABELS.transcribing;
        dom.btnSpinner.style.display = 'inline-block';
        dom.changeFileBtn.disabled = true;

        // ── Show processing card ──
        resetProcessingUI();
        dom.processingCard.style.display = 'block';
        dom.processingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // ── Timer ──
        timerStart = performance.now();
        dom.processTimer.textContent = `${LABELS.processingTimer}: 0.0s`;
        timerInterval = setInterval(() => {
            const elapsed = ((performance.now() - timerStart) / 1000).toFixed(1);
            dom.processTimer.textContent = `${LABELS.processingTimer}: ${elapsed}s`;
        }, 100);

        // ── Build FormData ──
        const formData = buildFormData();

        // ── Audio duration for progress calculation ──
        const duration = dom.audioElement.duration || 0;

        try {
            const response = await ApiClient.transcribe(formData);

            // Stream response
            await processStream(response, duration);

        } catch (error) {
            console.error('Transcription error:', error);
            Toast.show(`${LABELS.toastTranscriptionError}: ${error.message}`, 'error');
        } finally {
            clearInterval(timerInterval);
            dom.processingCard.style.display = 'none';
            unlockUI();
            loadHistory();
        }
    }

    /** Build the FormData payload from selected file + settings */
    function buildFormData() {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('stream', 'true');

        const settings = SettingsForm.getValues();

        if (settings.model)      formData.append('model', settings.model);
        if (settings.language)   formData.append('language', settings.language);

        formData.append('task', settings.task);
        // Always request verbose_json to get segments for rich display
        formData.append('response_format', 'verbose_json');
        formData.append('word_timestamps', settings.word_timestamps);
        formData.append('condition_on_previous_text', settings.condition_on_previous_text);

        if (settings.temperature) {
            formData.append('temperature', settings.temperature);
        }

        return formData;
    }

    /** Process the NDJSON streaming response */
    async function processStream(response, duration) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete last line

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    // Replace unquoted NaN values with null to prevent JSON parsing errors
                    const sanitizedLine = line.replace(/:\s*NaN\b/g, ': null');
                    const event = JSON.parse(sanitizedLine);
                    console.log("[ASR] Stream event:", event);
                    handleStreamEvent(event, duration);
                } catch (err) {
                    console.error('[ASR] Line processing error:', err, line);
                    if (err.message && !err.message.includes('JSON')) {
                        throw err;
                    }
                }
            }
        }

        // Process any remaining content in the buffer (in case of no trailing newline)
        if (buffer && buffer.trim()) {
            try {
                // Replace unquoted NaN values with null to prevent JSON parsing errors
                const sanitizedBuffer = buffer.replace(/:\s*NaN\b/g, ': null');
                const event = JSON.parse(sanitizedBuffer);
                console.log("[ASR] Final buffer stream event:", event);
                handleStreamEvent(event, duration);
            } catch (err) {
                console.error('[ASR] Final buffer processing error:', err, buffer);
                if (err.message && !err.message.includes('JSON')) {
                    throw err;
                }
            }
        }
    }

    /**
     * Handle a single streamed event.
     * @param {Object} event
     * @param {number} duration - Total audio duration in seconds
     */
    function handleStreamEvent(event, duration) {
        if (event.type === 'progress') {
            dom.progressStatus.textContent = event.message;

            if (event.step === 'downloading' || event.step === 'loading_model') {
                dom.progressBarFill.classList.add('progress__fill--indeterminate');
                dom.progressLabel.textContent = '...';
            } else if (event.step === 'transcribing') {
                handleTranscribingProgress(event, duration);
            }
        } else if (event.type === 'error') {
            throw new Error(event.message);
        } else if (event.type === 'completed') {
            // Finalize progress bar
            dom.progressBarFill.classList.remove('progress__fill--indeterminate');
            dom.progressBarFill.style.width = '100%';
            dom.progressLabel.textContent = '100%';

            renderResults(event.data);
        }
    }

    /** Handle a transcribing progress event (live segment) */
    function handleTranscribingProgress(event, duration) {
        // Remove placeholder
        const placeholder = dom.liveConsole.querySelector('.console__line--placeholder');
        if (placeholder) placeholder.remove();

        // Append console line
        const lineDiv = document.createElement('div');
        lineDiv.className = 'console__line';
        lineDiv.textContent = event.message;
        dom.liveConsole.appendChild(lineDiv);
        dom.liveConsole.scrollTop = dom.liveConsole.scrollHeight;

        // Show live preview container
        if (dom.livePreviewContainer.style.display === 'none') {
            dom.livePreviewContainer.style.display = 'block';
        }

        // Parse transcribed text after timestamps
        const textMatch = event.message.match(/\]\s*(.*)$/);
        if (textMatch && textMatch[1].trim()) {
            const parsed = textMatch[1].trim();
            dom.livePreviewText.textContent += (dom.livePreviewText.textContent ? ' ' : '') + parsed;
            dom.livePreviewText.scrollTop = dom.livePreviewText.scrollHeight;
        }

        // Parse segment timestamp for progress bar
        const match = event.message.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\s*-->\s*(\d{2}):(\d{2})\.(\d{2,3})\]/);
        if (match && duration > 0) {
            const endMin = parseInt(match[4], 10);
            const endSec = parseInt(match[5], 10);
            const endMs  = parseInt(match[6], 10);
            const seconds = (endMin * 60) + endSec + (endMs / (match[6].length === 2 ? 100 : 1000));

            const percent = Math.min(Math.round((seconds / duration) * 100), 100);
            dom.progressBarFill.classList.remove('progress__fill--indeterminate');
            dom.progressBarFill.style.width = `${percent}%`;
            dom.progressLabel.textContent = `${percent}%`;
        }
    }

    /** Reset all processing UI to initial state */
    function resetProcessingUI() {
        dom.progressBarFill.style.width = '0%';
        dom.progressBarFill.className = 'progress__fill';
        dom.progressLabel.textContent = '0%';
        dom.progressStatus.textContent = LABELS.processingConnecting;
        dom.liveConsole.innerHTML = `<div class="console__line console__line--placeholder">${LABELS.processingConsoleWaiting}</div>`;
        dom.livePreviewContainer.style.display = 'none';
        dom.livePreviewText.textContent = '';
    }

    /** Re-enable all interactive elements after transcription */
    function unlockUI() {
        dom.transcribeBtn.disabled = false;
        dom.transcribeBtnText.textContent = LABELS.transcribeAction;
        dom.btnSpinner.style.display = 'none';
        dom.changeFileBtn.disabled = false;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Results Rendering
    // ═══════════════════════════════════════════════════════════════════════════

    function renderResults(data) {
        console.log("[ASR] renderResults started with data:", data);
        try {
            // Set main transcript text
            dom.transcriptText.textContent = data.text || '';

            // Set stats
            const timeVal = data.stats?.time_total_seconds;
            dom.statTime.textContent = timeVal ? `${timeVal.toFixed(2)}s` : 'N/A';
            dom.statLang.textContent = data.language || 'it';
            dom.statModel.textContent = data.model ? data.model.split('/').pop() : 'Default';

            // Set raw JSON
            dom.rawJson.textContent = JSON.stringify(data, null, 2);

            // Build segments
            dom.segmentsList.innerHTML = '';
            if (data.segments && data.segments.length > 0) {
                dom.segmentsTabBtn.style.display = 'inline-block';
                data.segments.forEach(seg => {
                    dom.segmentsList.appendChild(buildSegmentElement(seg));
                });
            } else {
                dom.segmentsTabBtn.style.display = 'none';
                // If segments tab was active, switch to text tab
                const activeTab = document.querySelector('.tabs__btn--active');
                if (activeTab && activeTab.dataset.tab === 'segments-tab') {
                    switchTab(document.querySelector('[data-tab="text-tab"]'));
                }
            }

            console.log("[ASR] Transitioning to step 'results'");
            // Transition to Step 3
            StepIndicator.setStep('results');

            // Scroll to results
            document.getElementById('section-results').scrollIntoView({ behavior: 'smooth' });
            console.log("[ASR] renderResults completed successfully");
        } catch (error) {
            console.error("[ASR] Error rendering results:", error);
            Toast.show("Errore nel rendering della trascrizione", "error");
        }
    }

    /**
     * Build a single segment DOM element.
     * @param {Object} seg - Segment data with id, start, end, text, words
     * @returns {HTMLElement}
     */
    function buildSegmentElement(seg) {
        const el = document.createElement('div');
        el.className = 'segment-item';

        const timeSpan = `${Utils.formatTime(seg.start)} → ${Utils.formatTime(seg.end)}`;

        let wordsHtml = '';
        if (seg.words && seg.words.length > 0) {
            wordsHtml = `
                <div class="segment-words">
                    ${seg.words.map(w => `
                        <span class="word-pill" title="${Utils.formatTime(w.start)} – ${Utils.formatTime(w.end)}">
                            ${w.word}
                        </span>
                    `).join('')}
                </div>
            `;
        }

        el.innerHTML = `
            <div class="segment-header">
                <span class="segment-time">${timeSpan}</span>
                <span class="segment-id">Segmento #${seg.id || 0}</span>
            </div>
            <div class="segment-text">${seg.text}</div>
            ${wordsHtml}
        `;

        return el;
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Tabs
    // ═══════════════════════════════════════════════════════════════════════════

    function switchTab(btn) {
        // Deactivate all tabs & panels
        document.querySelectorAll('.tabs__btn').forEach(t => {
            t.classList.remove('tabs__btn--active');
            t.setAttribute('aria-selected', 'false');
            t.setAttribute('tabindex', '-1');
        });
        document.querySelectorAll('.tabs__panel').forEach(p => {
            p.classList.remove('tabs__panel--active');
        });

        // Activate selected
        btn.classList.add('tabs__btn--active');
        btn.setAttribute('aria-selected', 'true');
        btn.setAttribute('tabindex', '0');
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) panel.classList.add('tabs__panel--active');
    }

    function handleTabKeydown(event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = Array.from(document.querySelectorAll('.tabs__btn'))
            .filter(tab => tab.offsetParent !== null);
        const current = tabs.indexOf(event.currentTarget);
        let next = current;
        if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        event.preventDefault();
        switchTab(tabs[next]);
        tabs[next].focus();
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Clipboard
    // ═══════════════════════════════════════════════════════════════════════════

    function copyToClipboard() {
        const activeTab = document.querySelector('.tabs__btn--active')?.dataset.tab;
        let content = '';

        if (activeTab === 'text-tab') {
            content = dom.transcriptText.textContent;
        } else if (activeTab === 'raw-tab') {
            content = dom.rawJson.textContent;
        } else if (activeTab === 'segments-tab') {
            content = Array.from(dom.segmentsList.querySelectorAll('.segment-text'))
                .map(p => p.textContent)
                .join('\n');
        }

        navigator.clipboard.writeText(content).then(() => {
            Toast.show(LABELS.toastFileCopied, 'success');
            // Briefly change button text
            const original = dom.copyBtnText.textContent;
            dom.copyBtnText.textContent = LABELS.copied;
            setTimeout(() => { dom.copyBtnText.textContent = original; }, 2000);
        }).catch(err => {
            console.error('Copy failed:', err);
            Toast.show('Copia fallita', 'error');
        });
    }


    // ═══════════════════════════════════════════════════════════════════════════
    // Boot
    // ═══════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════
    // Analysis Controller
    // ═══════════════════════════════════════════════════════════════════════════
    const AnalysisController = (() => {
        let importedFile = null;
        let activeTab = 'history'; // 'history' or 'import'

        function init() {
            // Tab Buttons
            const historyTabBtn = document.getElementById('analysis-source-history-btn');
            const importTabBtn = document.getElementById('analysis-source-import-btn');
            const panelHistory = document.getElementById('analysis-panel-history');
            const panelImport = document.getElementById('analysis-panel-import');

            historyTabBtn?.addEventListener('click', () => {
                activeTab = 'history';
                historyTabBtn.classList.add('tab-mini-btn--active');
                importTabBtn?.classList.remove('tab-mini-btn--active');
                panelHistory.style.display = 'block';
                panelImport.style.display = 'none';
                validateStartButton();
            });

            importTabBtn?.addEventListener('click', () => {
                activeTab = 'import';
                importTabBtn.classList.add('tab-mini-btn--active');
                historyTabBtn?.classList.remove('tab-mini-btn--active');
                panelHistory.style.display = 'none';
                panelImport.style.display = 'block';
                validateStartButton();
            });

            // Provider Select Key toggling
            const providerSelect = document.getElementById('analysis-provider-select');
            const keyContainer = document.getElementById('gemini-key-container');
            providerSelect?.addEventListener('change', () => {
                if (providerSelect.value === 'gemini') {
                    keyContainer.style.display = 'block';
                } else {
                    keyContainer.style.display = 'none';
                }
            });

            // Dropzone setup
            const dropzone = document.getElementById('analysis-dropzone');
            const fileInput = document.getElementById('analysis-file-input');
            const browseBtn = document.getElementById('analysis-browse-btn');
            const importInfo = document.getElementById('selected-import-info');
            const importFilename = document.getElementById('analysis-imported-filename');
            const importFilesize = document.getElementById('analysis-imported-filesize');

            if (dropzone && fileInput && browseBtn) {
                ['dragenter', 'dragover'].forEach(evt => {
                    dropzone.addEventListener(evt, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.add('dropzone--dragover');
                    }, false);
                });

                ['dragleave', 'drop'].forEach(evt => {
                    dropzone.addEventListener(evt, (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.remove('dropzone--dragover');
                    }, false);
                });

                dropzone.addEventListener('drop', (e) => {
                    const files = e.dataTransfer.files;
                    if (files.length > 0) handleImportFile(files[0]);
                });

                browseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    fileInput.click();
                });

                fileInput.addEventListener('change', () => {
                    if (fileInput.files.length > 0) {
                        handleImportFile(fileInput.files[0]);
                    }
                });
            }

            function handleImportFile(file) {
                importedFile = file;
                importFilename.textContent = file.name;
                importFilesize.textContent = Utils.formatBytes(file.size);
                importInfo.style.display = 'flex';
                validateStartButton();
            }

            // Select change validation
            const select = document.getElementById('analysis-transcription-select');
            select?.addEventListener('change', validateStartButton);

            // Start Analysis button
            const startBtn = document.getElementById('start-analysis-btn');
            startBtn?.addEventListener('click', runAnalysis);

            // Copy button
            const copyBtn = document.getElementById('analysis-copy-btn');
            copyBtn?.addEventListener('click', copyResults);
        }

        function validateStartButton() {
            const startBtn = document.getElementById('start-analysis-btn');
            if (!startBtn) return;

            let valid = false;
            if (activeTab === 'history') {
                const select = document.getElementById('analysis-transcription-select');
                valid = select && select.value !== '';
            } else if (activeTab === 'import') {
                valid = importedFile !== null;
            }

            startBtn.disabled = !valid;
        }

        async function loadTranscriptions() {
            const select = document.getElementById('analysis-transcription-select');
            if (!select) return;
            select.innerHTML = '<option value="">Caricamento...</option>';

            try {
                const { items } = await ApiClient.listTranscriptions(1, 100);
                select.innerHTML = '';
                if (items.length === 0) {
                    select.innerHTML = '<option value="">Nessuna trascrizione disponibile nello storico</option>';
                    return;
                }
                const placeholderOpt = document.createElement('option');
                placeholderOpt.value = '';
                placeholderOpt.textContent = '-- Seleziona una trascrizione --';
                select.appendChild(placeholderOpt);

                items.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.id;
                    const dateStr = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.timestamp));
                    const fileBase = item.audio_filename || 'Audio';
                    const textSnippet = item.text ? item.text.substring(0, 30) + '...' : '(Vuota)';
                    opt.textContent = `${dateStr} - ${fileBase} (${textSnippet})`;
                    select.appendChild(opt);
                });
            } catch (err) {
                console.error('Failed to load transcriptions in analysis select:', err);
                select.innerHTML = '<option value="">Errore nel caricamento storico</option>';
            }
        }

        async function loadSettings() {
            try {
                const settings = await ApiClient.getSettings();
                const providerSelect = document.getElementById('analysis-provider-select');
                const keyInput = document.getElementById('analysis-gemini-key');
                const keyContainer = document.getElementById('gemini-key-container');

                if (providerSelect && settings.llm_provider) {
                    providerSelect.value = settings.llm_provider;
                    if (settings.llm_provider === 'gemini' && keyContainer) {
                        keyContainer.style.display = 'block';
                    }
                }
                if (keyInput && settings.gemini_api_key) {
                    keyInput.value = settings.gemini_api_key;
                }
            } catch (err) {
                console.error('Failed to load settings in analysis:', err);
            }
        }

        async function runAnalysis() {
            const startBtn = document.getElementById('start-analysis-btn');
            const spinner = document.getElementById('analysis-btn-spinner');
            const processingCard = document.getElementById('analysis-processing-card');
            const progressStatus = document.getElementById('analysis-progress-status');
            const emptyCard = document.getElementById('analysis-empty-card');
            const resultCard = document.getElementById('analysis-result-card');

            const provider = document.getElementById('analysis-provider-select').value;
            const apiKey = document.getElementById('analysis-gemini-key').value.trim();

            // Lock UI
            startBtn.disabled = true;
            spinner.style.display = 'inline-block';
            emptyCard.style.display = 'none';
            resultCard.style.display = 'none';
            processingCard.style.display = 'block';

            try {
                let payload = {
                    llm_provider: provider,
                    gemini_api_key: apiKey
                };

                if (activeTab === 'history') {
                    const select = document.getElementById('analysis-transcription-select');
                    payload.transcription_id = select.value;
                    progressStatus.textContent = 'Recupero trascrizione ed elaborazione analisi...';
                } else {
                    const fileName = importedFile.name.toLowerCase();
                    if (fileName.endsWith('.txt')) {
                        progressStatus.textContent = 'Lettura file di testo...';
                        const text = await readFileAsText(importedFile);
                        payload.text = text;
                    } else if (fileName.endsWith('.json')) {
                        progressStatus.textContent = 'Lettura file JSON...';
                        const text = await readFileAsText(importedFile);
                        try {
                            const parsed = JSON.parse(text);
                            payload.text = parsed.text || parsed.transcript || text;
                        } catch {
                            payload.text = text;
                        }
                    } else {
                        progressStatus.textContent = 'Trascrizione audio in corso (MLX Whisper)...';
                        const formData = new FormData();
                        formData.append('file', importedFile);
                        formData.append('stream', 'false');
                        
                        const response = await ApiClient.transcribe(formData);
                        const data = await response.json();
                        if (!data.text) {
                            throw new Error('Nessun testo estratto dall’audio.');
                        }
                        payload.text = data.text;
                    }
                    progressStatus.textContent = 'Elaborazione analisi con l’LLM selezionato...';
                }

                const result = await ApiClient.analyze(payload);
                renderAnalysisResult(result);

                processingCard.style.display = 'none';
                resultCard.style.display = 'block';

                // Save setting update
                const settings = await ApiClient.getSettings();
                await ApiClient.updateSettings(settings.transcriptions_dir, apiKey, provider);

            } catch (err) {
                console.error('Analysis failed:', err);
                Toast.show(`Analisi fallita: ${err.message}`, 'error');
                processingCard.style.display = 'none';
                emptyCard.style.display = 'block';
            } finally {
                spinner.style.display = 'none';
                validateStartButton();
            }
        }

        function readFileAsText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Errore durante la lettura del file.'));
                reader.readAsText(file);
            });
        }

        function renderAnalysisResult(result) {
            const titleEl = document.getElementById('analysis-result-title');
            const summaryEl = document.getElementById('analysis-result-summary');
            const keyPointsUl = document.getElementById('analysis-result-key-points');
            const actionItemsUl = document.getElementById('analysis-result-action-items');

            titleEl.textContent = result.title || 'Risultato Analisi';
            summaryEl.textContent = result.summary || '';

            keyPointsUl.innerHTML = '';
            if (result.key_points && result.key_points.length > 0) {
                result.key_points.forEach(kp => {
                    const li = document.createElement('li');
                    li.textContent = kp;
                    keyPointsUl.appendChild(li);
                });
            } else {
                keyPointsUl.innerHTML = '<li>Nessun punto chiave identificato.</li>';
            }

            actionItemsUl.innerHTML = '';
            if (result.action_items && result.action_items.length > 0) {
                result.action_items.forEach(ai => {
                    const li = document.createElement('li');
                    li.textContent = ai;
                    actionItemsUl.appendChild(li);
                });
            } else {
                actionItemsUl.innerHTML = '<li>Nessuna azione identificata.</li>';
            }
        }

        function copyResults() {
            const title = document.getElementById('analysis-result-title').textContent;
            const summary = document.getElementById('analysis-result-summary').textContent;
            const keyPoints = Array.from(document.getElementById('analysis-result-key-points').querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');
            const actionItems = Array.from(document.getElementById('analysis-result-action-items').querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');

            const formatted = `# ${title}\n\n## Riassunto\n${summary}\n\n## Punti Chiave\n${keyPoints}\n\n## Prossimi Passi\n${actionItems}`;

            navigator.clipboard.writeText(formatted).then(() => {
                Toast.show('Analisi copiata negli appunti!', 'success');
                const copyText = document.getElementById('analysis-copy-text');
                const original = copyText.textContent;
                copyText.textContent = LABELS.copied;
                setTimeout(() => { copyText.textContent = original; }, 2000);
            }).catch(() => {
                Toast.show('Copia fallita', 'error');
            });
        }

        return {
            init,
            loadTranscriptions,
            loadSettings
        };
    })();

    init();
});
