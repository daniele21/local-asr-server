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
        CollapsiblePanel.init();
        FileDropzone.init({ onFileSelected: handleFileSelected });

        // Bind event handlers
        bindEvents();

        // Set initial step
        StepIndicator.setStep('upload');

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

        // Tabs
        document.querySelectorAll('.tabs__btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn));
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
            const res = await fetch(API.health);
            if (res.ok) {
                const data = await res.json();
                const modelShort = data.default_model.split('/').pop();
                setServerStatus(true, `${LABELS.statusOnline} (${modelShort})`);
            } else {
                setServerStatus(false, LABELS.statusError);
            }
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
        selectedFile = file;

        // Update file preview
        dom.previewFilename.textContent = file.name;
        dom.previewFilesize.textContent = Utils.formatBytes(file.size);

        // Load audio preview
        const url = URL.createObjectURL(file);
        dom.audioElement.src = url;

        // Transition to Step 2
        StepIndicator.setStep('transcribe');
    }

    /** Go back to the upload step (reset state) */
    function goToUploadStep() {
        selectedFile = null;
        FileDropzone.reset();
        dom.audioElement.removeAttribute('src');

        // Reset processing UI
        dom.processingCard.style.display = 'none';

        StepIndicator.setStep('upload');
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
            const response = await fetch(API.transcribe, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errText = await response.text();
                let detail = 'Operazione fallita';
                try {
                    const parsed = JSON.parse(errText);
                    detail = parsed.detail || detail;
                } catch (_) { /* ignore parse error */ }
                throw new Error(detail);
            }

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
        });
        document.querySelectorAll('.tabs__panel').forEach(p => {
            p.classList.remove('tabs__panel--active');
        });

        // Activate selected
        btn.classList.add('tabs__btn--active');
        btn.setAttribute('aria-selected', 'true');
        const panel = document.getElementById(btn.dataset.tab);
        if (panel) panel.classList.add('tabs__panel--active');
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
