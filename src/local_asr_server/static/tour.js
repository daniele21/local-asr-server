/**
 * tour.js — Guided Tour & Automated Showcase Engine for ASR Whisper Studio
 *
 * Provides an interactive step-by-step tour highlighting DOM elements and a
 * hands-free automated demonstration of the ASR transcription flow.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// GUIDED TOUR MODULE
// ═══════════════════════════════════════════════════════════════════════════

const Tour = (() => {
    let currentStepIdx = -1;
    let backdropEl = null;
    let popoverEl = null;
    let activeHighlightEl = null;

    const STEPS = [
        {
            elementId: 'app-header',
            title: 'ASR Whisper Studio',
            text: 'Benvenuto! Questa è la tua console di trascrizione locale alimentata da MLX Whisper. L\'elaborazione avviene interamente sul tuo dispositivo, garantendo privacy e velocità.',
            position: 'bottom'
        },
        {
            elementId: 'server-status',
            title: 'Stato del Server',
            text: 'Visualizza lo stato di connessione del backend locale. Mostra la disponibilità in tempo reale e il modello Whisper predefinito attualmente caricato.',
            position: 'bottom-right'
        },
        {
            elementId: 'stepper',
            title: 'Flusso di Lavoro',
            text: 'L\'interfaccia è strutturata in 3 semplici passaggi: Carica Audio, Trascrivi (con impostazioni) e Visualizza Risultati.',
            position: 'bottom'
        },
        {
            elementId: 'dropzone',
            title: 'Area di Caricamento',
            text: 'Trascina qui qualsiasi file audio comune (MP3, WAV, M4A, FLAC, WEBM) fino a 25MB, oppure clicca su "Seleziona File" per sfogliare il tuo computer.',
            position: 'bottom'
        },
        {
            elementId: 'settings-trigger',
            title: 'Impostazioni Avanzate',
            text: 'Da qui puoi personalizzare il modello Whisper, forzare la lingua di trascrizione, abilitare i timestamp a livello di parola e impostare altri parametri avanzati.',
            position: 'top',
            onBeforeShow: () => {
                // Return step 2 visible to point settings if needed
                StepIndicator.setStep('transcribe');
                // Ensure settings is collapsed for the showcase point
                const body = document.getElementById('settings-body');
                if (body && !body.classList.contains('collapsible--collapsed')) {
                    document.getElementById('settings-trigger').click();
                }
            }
        }
    ];

    function init() {
        _createDOM();
    }

    function _createDOM() {
        if (backdropEl) return;

        // Create backdrop overlay
        backdropEl = document.createElement('div');
        backdropEl.className = 'tour-backdrop';
        document.body.appendChild(backdropEl);

        // Create popover
        popoverEl = document.createElement('div');
        popoverEl.className = 'tour-popover';
        document.body.appendChild(popoverEl);

        // Close on backdrop click
        backdropEl.addEventListener('click', end);
    }

    function start() {
        // If Showcase is running, stop it
        Showcase.stop();
        
        _createDOM();
        currentStepIdx = 0;
        
        // Go to upload step first so dropzone is visible
        StepIndicator.setStep('upload');

        backdropEl.classList.add('tour-backdrop--visible');
        popoverEl.classList.add('tour-popover--visible');
        
        showStep(currentStepIdx);
    }

    function end() {
        if (activeHighlightEl) {
            activeHighlightEl.classList.remove('tour-highlight');
            activeHighlightEl = null;
        }
        if (backdropEl) backdropEl.classList.remove('tour-backdrop--visible');
        if (popoverEl) popoverEl.classList.remove('tour-popover--visible');
        currentStepIdx = -1;
    }

    function showStep(idx) {
        if (idx < 0 || idx >= STEPS.length) {
            end();
            return;
        }

        currentStepIdx = idx;
        const step = STEPS[idx];

        // Clean previous highlight
        if (activeHighlightEl) {
            activeHighlightEl.classList.remove('tour-highlight');
        }

        // Run hook if defined
        if (typeof step.onBeforeShow === 'function') {
            step.onBeforeShow();
        }

        const target = document.getElementById(step.elementId);
        if (!target) {
            // Target not found, skip to next
            next();
            return;
        }

        // Highlight new target
        activeHighlightEl = target;
        activeHighlightEl.classList.add('tour-highlight');
        activeHighlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Update Popover content
        popoverEl.innerHTML = `
            <div class="tour-popover__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                <span>${step.title}</span>
            </div>
            <div class="tour-popover__text">${step.text}</div>
            <div class="tour-popover__footer">
                <span class="tour-popover__step">${idx + 1} di ${STEPS.length}</span>
                <div class="tour-popover__buttons">
                    <button class="tour-btn tour-btn--ghost" style="padding: 4px 10px; font-size: 0.75rem;" id="tour-prev-btn" ${idx === 0 ? 'disabled' : ''}>Indietro</button>
                    <button class="tour-btn tour-btn--primary" style="padding: 4px 10px; font-size: 0.75rem;" id="tour-next-btn">${idx === STEPS.length - 1 ? 'Fine' : 'Avanti'}</button>
                </div>
            </div>
        `;

        // Bind events
        document.getElementById('tour-prev-btn').addEventListener('click', prev);
        document.getElementById('tour-next-btn').addEventListener('click', next);

        // Position popover (requires DOM reflow to get dimensions)
        setTimeout(() => _positionPopover(target, step.position), 50);
    }

    function next() {
        if (currentStepIdx < STEPS.length - 1) {
            showStep(currentStepIdx + 1);
        } else {
            end();
            Toast.show('Tour completato! Clicca su "Showcase Automatico" per vedere l\'app in azione.', 'success');
        }
    }

    function prev() {
        if (currentStepIdx > 0) {
            showStep(currentStepIdx - 1);
        }
    }

    function _positionPopover(target, preferredPosition = 'bottom') {
        const targetRect = target.getBoundingClientRect();
        const popoverRect = popoverEl.getBoundingClientRect();

        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        let top = 0;
        let left = 0;

        const gap = 12;

        if (preferredPosition === 'bottom') {
            top = targetRect.bottom + scrollY + gap;
            left = targetRect.left + scrollX + (targetRect.width / 2) - (popoverRect.width / 2);
        } else if (preferredPosition === 'bottom-right') {
            top = targetRect.bottom + scrollY + gap;
            left = targetRect.right + scrollX - popoverRect.width;
        } else if (preferredPosition === 'top') {
            top = targetRect.top + scrollY - popoverRect.height - gap;
            left = targetRect.left + scrollX + (targetRect.width / 2) - (popoverRect.width / 2);
        }

        // Boundary adjustments
        if (left < 10) left = 10;
        if (left + popoverRect.width > window.innerWidth - 10) {
            left = window.innerWidth - popoverRect.width - 10;
        }
        if (top < 10) top = 10;

        popoverEl.style.top = `${top}px`;
        popoverEl.style.left = `${left}px`;
    }

    return { init, start, end };
})();


// ═══════════════════════════════════════════════════════════════════════════════
// AUTOMATED SHOWCASE (DEMO MODE)
// ═══════════════════════════════════════════════════════════════════════════

const Showcase = (() => {
    let running = false;
    let bannerEl = null;
    let timeouts = [];
    let progressInterval = null;

    // Simulated dialogue segments for transcription demo
    const MOCK_SEGMENTS = [
        { start: 0.0, end: 4.2, text: "Benvenuti ad ASR Whisper Studio." },
        { start: 4.2, end: 11.5, text: "Questo strumento consente di trascrivere qualsiasi traccia audio in locale." },
        { start: 11.5, end: 19.8, text: "Garantisce la privacy totale in quanto nessun dato lascia la memoria del dispositivo." },
        { start: 19.8, end: 26.5, text: "Supporta modelli Whisper Tiny, Small, Medium e Large Turbo." },
        { start: 26.5, end: 32.0, text: "La trascrizione guidata è ora completata con successo!" }
    ];

    function start() {
        // If Tour is active, stop it
        Tour.end();

        if (running) return;
        running = true;

        _createBanner();
        bannerEl.classList.add('showcase-banner--active');
        
        Toast.show("Inizio della Demo Automatica...", "info");

        // Step 1: Force upload screen and scroll there
        StepIndicator.setStep('upload');
        document.getElementById('section-upload').scrollIntoView({ behavior: 'smooth' });

        // Step 2: Show loading fake file after 1.5s
        _schedule(() => {
            _updateStatusText("Caricamento del file audio simulato...");
            
            // Simulating selected file in the UI
            const previewFilename = document.getElementById('preview-filename');
            const previewFilesize = document.getElementById('preview-filesize');
            const audioElement = document.getElementById('audio-element');

            if (previewFilename) previewFilename.textContent = "conferenza_tecnica_privacy.mp3";
            if (previewFilesize) previewFilesize.textContent = "3.8 MB";
            if (audioElement) audioElement.src = "dummy-url";

            StepIndicator.setStep('transcribe');
            document.getElementById('section-transcribe').scrollIntoView({ behavior: 'smooth' });
            Toast.show("Audio mock caricato con successo", "success");
        }, 1500);

        // Step 3: Expand settings and select options after 3.5s
        _schedule(() => {
            _updateStatusText("Configurazione impostazioni...");
            
            const settingsBody = document.getElementById('settings-body');
            const settingsTrigger = document.getElementById('settings-trigger');
            
            if (settingsBody && settingsBody.classList.contains('collapsible--collapsed')) {
                settingsTrigger.click();
            }

            // Mock options
            const modelSelect = document.getElementById('model-select');
            const langSelect = document.getElementById('language-select');
            const tsCheck = document.getElementById('timestamps-check');

            if (modelSelect) modelSelect.value = "mlx-community/whisper-large-v3-turbo";
            if (langSelect) langSelect.value = "it";
            if (tsCheck) tsCheck.checked = true;

            Toast.show("Selezionato Whisper Large V3 Turbo (Lingua: Italiano)", "info");
        }, 3800);

        // Step 4: Click transcribe button and start processing after 6.5s
        _schedule(() => {
            _updateStatusText("Avvio trascrizione in corso...");
            
            // Collapse settings again
            const settingsBody = document.getElementById('settings-body');
            const settingsTrigger = document.getElementById('settings-trigger');
            if (settingsBody && !settingsBody.classList.contains('collapsible--collapsed')) {
                settingsTrigger.click();
            }

            // Set transcription state UI
            const transcribeBtn = document.getElementById('transcribe-btn');
            const transcribeBtnText = document.getElementById('transcribe-btn-text');
            const btnSpinner = document.getElementById('btn-spinner');
            const changeFileBtn = document.getElementById('change-file-btn');
            
            if (transcribeBtn) transcribeBtn.disabled = true;
            if (transcribeBtnText) transcribeBtnText.textContent = "Trascrizione in corso...";
            if (btnSpinner) btnSpinner.style.display = "inline-block";
            if (changeFileBtn) changeFileBtn.disabled = true;

            // Reset and show processing card
            const processingCard = document.getElementById('processing-card');
            const progressStatus = document.getElementById('progress-status');
            const progressBarFill = document.getElementById('progress-bar-fill');
            const progressLabel = document.getElementById('progress-label');
            const liveConsole = document.getElementById('live-console');
            const livePreviewContainer = document.getElementById('live-preview-container');
            const livePreviewText = document.getElementById('live-preview-text');

            if (progressBarFill) {
                progressBarFill.style.width = '0%';
                progressBarFill.className = 'progress__fill';
            }
            if (progressLabel) progressLabel.textContent = '0%';
            if (progressStatus) progressStatus.textContent = "Avvio modulo MLX Whisper...";
            if (liveConsole) liveConsole.innerHTML = `<div class="console__line console__line--placeholder">Caricamento pesi modello...</div>`;
            if (livePreviewContainer) livePreviewContainer.style.display = 'none';
            if (livePreviewText) livePreviewText.textContent = '';

            if (processingCard) {
                processingCard.style.display = 'block';
                processingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 6500);

        // Step 5: Start live transcript streaming simulation at 8.5s
        _schedule(() => {
            _updateStatusText("Trascrizione live in streaming...");
            
            const liveConsole = document.getElementById('live-console');
            const livePreviewContainer = document.getElementById('live-preview-container');
            const livePreviewText = document.getElementById('live-preview-text');
            const progressBarFill = document.getElementById('progress-bar-fill');
            const progressLabel = document.getElementById('progress-label');
            const progressStatus = document.getElementById('progress-status');
            
            if (liveConsole) liveConsole.innerHTML = "";
            if (livePreviewContainer) livePreviewContainer.style.display = "block";
            if (progressStatus) progressStatus.textContent = "Analisi traccia audio e generazione testo...";

            let segmentIdx = 0;
            const duration = 32.0;

            progressInterval = setInterval(() => {
                if (segmentIdx >= MOCK_SEGMENTS.length) {
                    clearInterval(progressInterval);
                    return;
                }

                const seg = MOCK_SEGMENTS[segmentIdx];
                
                // Add console line
                const line = document.createElement('div');
                line.className = 'console__line';
                line.textContent = `[${_pad(seg.start)} --> ${_pad(seg.end)}] ${seg.text}`;
                if (liveConsole) {
                    liveConsole.appendChild(line);
                    liveConsole.scrollTop = liveConsole.scrollHeight;
                }

                // Append live preview
                if (livePreviewText) {
                    livePreviewText.textContent += (livePreviewText.textContent ? ' ' : '') + seg.text;
                    livePreviewText.scrollTop = livePreviewText.scrollHeight;
                }

                // Update progress bar
                const percent = Math.round((seg.end / duration) * 100);
                if (progressBarFill) progressBarFill.style.width = `${percent}%`;
                if (progressLabel) progressLabel.textContent = `${percent}%`;

                segmentIdx++;
            }, 1200);

        }, 8500);

        // Step 6: Transition to results card at 15.5s
        _schedule(() => {
            _updateStatusText("Generazione risultati finali...");
            
            if (progressInterval) clearInterval(progressInterval);

            // Re-enable UI
            const transcribeBtn = document.getElementById('transcribe-btn');
            const transcribeBtnText = document.getElementById('transcribe-btn-text');
            const btnSpinner = document.getElementById('btn-spinner');
            const changeFileBtn = document.getElementById('change-file-btn');
            const processingCard = document.getElementById('processing-card');

            if (transcribeBtn) transcribeBtn.disabled = false;
            if (transcribeBtnText) transcribeBtnText.textContent = "Trascrivi Audio";
            if (btnSpinner) btnSpinner.style.display = "none";
            if (changeFileBtn) changeFileBtn.disabled = false;
            if (processingCard) processingCard.style.display = "none";

            // Render simulated results data
            const fullText = MOCK_SEGMENTS.map(s => s.text).join(' ');
            const mockData = {
                text: fullText,
                language: "it",
                model: "mlx-community/whisper-large-v3-turbo",
                stats: {
                    time_total_seconds: 4.86,
                    tokens_per_second: 52.4
                },
                segments: MOCK_SEGMENTS.map((s, i) => ({
                    id: i + 1,
                    start: s.start,
                    end: s.end,
                    text: s.text,
                    words: s.text.split(' ').map((w, wi) => ({
                        word: w,
                        start: s.start + (wi * 0.3),
                        end: s.start + 0.35 + (wi * 0.3)
                    }))
                }))
            };

            // Set result fields
            const transcriptText = document.getElementById('transcript-text');
            const statTime = document.getElementById('stat-time');
            const statLang = document.getElementById('stat-lang');
            const statModel = document.getElementById('stat-model');
            const rawJson = document.getElementById('raw-json');
            const segmentsList = document.getElementById('segments-list');
            const segmentsTabBtn = document.getElementById('segments-tab-btn');

            if (transcriptText) transcriptText.textContent = mockData.text;
            if (statTime) statTime.textContent = "4.86s";
            if (statLang) statLang.textContent = "Italiano (it)";
            if (statModel) statModel.textContent = "Whisper Large V3 Turbo";
            if (rawJson) rawJson.textContent = JSON.stringify(mockData, null, 2);

            if (segmentsList) {
                segmentsList.innerHTML = "";
                mockData.segments.forEach(seg => {
                    const el = document.createElement('div');
                    el.className = 'segment-item';
                    el.innerHTML = `
                        <div class="segment-header">
                            <span class="segment-time">${_pad(seg.start)} → ${_pad(seg.end)}</span>
                            <span class="segment-id">Segmento #${seg.id}</span>
                        </div>
                        <div class="segment-text">${seg.text}</div>
                        <div class="segment-words">
                            ${seg.words.map(w => `<span class="word-pill">${w.word}</span>`).join('')}
                        </div>
                    `;
                    segmentsList.appendChild(el);
                });
            }
            if (segmentsTabBtn) segmentsTabBtn.style.display = "inline-block";

            StepIndicator.setStep('results');
            document.getElementById('section-results').scrollIntoView({ behavior: 'smooth' });
        }, 15500);

        // Step 7: Tab navigation showcase
        _schedule(() => {
            _updateStatusText("Visualizzazione dettagli per segmenti...");
            const segmentsTab = document.querySelector('[data-tab="segments-tab"]');
            if (segmentsTab) segmentsTab.click();
        }, 18000);

        _schedule(() => {
            _updateStatusText("Visualizzazione JSON completo...");
            const rawTab = document.querySelector('[data-tab="raw-tab"]');
            if (rawTab) rawTab.click();
        }, 20500);

        _schedule(() => {
            _updateStatusText("Visualizzazione Testo finale...");
            const textTab = document.querySelector('[data-tab="text-tab"]');
            if (textTab) textTab.click();
        }, 23000);

        // Finalize showcase
        _schedule(() => {
            stop();
            Toast.show("Showcase Automatico completato con successo!", "success");
        }, 25000);
    }

    function stop() {
        if (!running) return;
        running = false;

        if (bannerEl) bannerEl.classList.remove('showcase-banner--active');
        
        if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
        }

        timeouts.forEach(clearTimeout);
        timeouts = [];

        // Reset elements that were disabled
        const transcribeBtn = document.getElementById('transcribe-btn');
        const transcribeBtnText = document.getElementById('transcribe-btn-text');
        const btnSpinner = document.getElementById('btn-spinner');
        const changeFileBtn = document.getElementById('change-file-btn');
        const processingCard = document.getElementById('processing-card');

        if (transcribeBtn) transcribeBtn.disabled = false;
        if (transcribeBtnText) transcribeBtnText.textContent = "Trascrivi Audio";
        if (btnSpinner) btnSpinner.style.display = "none";
        if (changeFileBtn) changeFileBtn.disabled = false;
        if (processingCard) processingCard.style.display = "none";
        
        Toast.show("Demo terminata", "info");
    }

    function _createBanner() {
        if (bannerEl) return;

        bannerEl = document.createElement('div');
        bannerEl.className = 'showcase-banner';
        bannerEl.innerHTML = `
            <div class="showcase-banner__label">
                <div class="showcase-banner__spinner"></div>
                <span id="showcase-banner-text">Demo Automatica...</span>
            </div>
            <button class="showcase-banner__btn" id="showcase-stop-btn">Salta / Ferma</button>
        `;
        document.body.appendChild(bannerEl);

        document.getElementById('showcase-stop-btn').addEventListener('click', stop);
    }

    function _updateStatusText(msg) {
        const textEl = document.getElementById('showcase-banner-text');
        if (textEl) textEl.textContent = msg;
    }

    function _schedule(fn, delay) {
        const t = setTimeout(fn, delay);
        timeouts.push(t);
    }

    function _pad(val) {
        const mins = Math.floor(val / 60);
        const secs = Math.floor(val % 60);
        const ms = Math.floor((val % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    return { start, stop };
})();
