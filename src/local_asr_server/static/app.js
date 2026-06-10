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
        dom.recordingPageContent.appendChild(dom.recorderPanel);
        dom.recorderPanel.hidden = false;
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
    // Server Health
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
        switchPage('transcription');
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
        if (pageName === 'transcription') loadRecordings();
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

    init();
});
