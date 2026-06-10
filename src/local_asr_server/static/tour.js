/**
 * tour.js — Guided Tour & Automated Showcase Engine for ASR Whisper Studio
 *
 * Provides a single, unified list of steps for both the interactive manual tour
 * and the automated showcase simulation (which is captured by screen recording).
 */

const Tour = (() => {
    let currentStepIdx = -1;
    let backdropContainer = null;
    let blockers = [];
    let spotlightOutlineEl = null;
    let popoverEl = null;
    let activeHighlightEl = null;
    let isShowcaseMode = false;
    
    let showcaseTimer = null;
    let countdownInterval = null;
    let progressInterval = null;
    let countdownSeconds = 0;

    // Screen Recording State
    let mediaRecorder = null;
    let recordedChunks = [];
    let recordStream = null;

    // Unified Steps definition (shared by interactive manual tour and showcase)
    // Unified Steps definition (shared by interactive manual tour and showcase)
    const STEPS = [
        {
            elementId: 'app-header',
            title: 'ASR Whisper Studio',
            text: 'Benvenuto! Questa è la tua console di trascrizione locale alimentata da MLX Whisper. L\'elaborazione avviene interamente sul tuo dispositivo, garantendo privacy e velocità.',
            position: 'bottom',
            onBeforeShow: () => {
                window.AppNavigation?.switchPage('transcription');
                StepIndicator.setStep('upload');
            },
            nextDelay: 3
        },
        {
            elementId: 'server-status',
            title: 'Stato del Server',
            text: 'Visualizza lo stato di connessione del backend locale. Mostra la disponibilità in tempo reale e il modello Whisper predefinito attualmente caricato.',
            position: 'bottom-right',
            nextDelay: 3
        },
        {
            elementId: 'section-upload',
            title: 'Flusso di Lavoro',
            text: 'Parti dalla sorgente audio. Puoi registrare, scegliere una registrazione recente oppure importare un file.',
            position: 'bottom',
            nextDelay: 3
        },
        {
            elementId: 'dropzone',
            title: 'Trascrivi un audio',
            text: 'Seleziona o trascina un file audio comune fino a 25 MB per passare alla configurazione.',
            position: 'bottom',
            onBeforeShow: () => {
                if (isShowcaseMode) {
                    // Showcase mode simulates a mockup audio file immediately
                    const previewFilename = document.getElementById('preview-filename');
                    const previewFilesize = document.getElementById('preview-filesize');
                    const audioElement = document.getElementById('audio-element');
                    if (previewFilename) previewFilename.textContent = "conferenza_tecnica.mp3";
                    if (previewFilesize) previewFilesize.textContent = "3.8 MB";
                    if (audioElement) audioElement.src = "dummy-url";

                    StepIndicator.setStep('transcribe');
                    document.getElementById('section-transcribe').scrollIntoView({ behavior: 'auto', block: 'center' });
                } else {
                    // Manual mode check
                    const fileCard = document.getElementById('file-card');
                    const isFileLoaded = fileCard && !fileCard.closest('.section').classList.contains('section--hidden');
                    if (isFileLoaded) {
                        StepIndicator.setStep('transcribe');
                    } else {
                        StepIndicator.setStep('upload');
                    }
                }
            },
            nextDelay: 4
        },
        {
            elementId: 'settings-collapsible',
            title: 'Impostazioni Avanzate',
            text: 'Da qui puoi personalizzare il modello Whisper, forzare la lingua di trascrizione, abilitare i timestamp a livello di parola e impostare altri parametri avanzati.',
            position: 'top',
            onBeforeShow: () => {
                // Ensure a mock file is loaded so the transcribe screen has content to display
                const previewFilename = document.getElementById('preview-filename');
                const previewFilesize = document.getElementById('preview-filesize');
                const audioElement = document.getElementById('audio-element');
                if (!previewFilename.textContent || previewFilename.textContent === 'file.mp3') {
                    previewFilename.textContent = "conferenza_tecnica.mp3";
                    previewFilesize.textContent = "3.8 MB";
                    audioElement.src = "dummy-url";
                }

                StepIndicator.setStep('transcribe');

                // Open advanced settings if collapsed
                const body = document.getElementById('settings-body');
                if (body && body.classList.contains('collapsible--collapsed')) {
                    document.getElementById('settings-trigger').click();
                }

                // If showcase, pre-populate options
                if (isShowcaseMode) {
                    const modelSelect = document.getElementById('model-select');
                    const langSelect = document.getElementById('language-select');
                    const tsCheck = document.getElementById('timestamps-check');
                    if (modelSelect) modelSelect.value = "mlx-community/whisper-large-v3-turbo";
                    if (langSelect) langSelect.value = "it";
                    if (tsCheck) tsCheck.checked = true;
                }

                // Hide processing card if we came back
                const processingCard = document.getElementById('processing-card');
                if (processingCard) processingCard.style.display = 'none';
            },
            nextDelay: 5
        },
        {
            elementId: 'processing-card',
            title: 'Elaborazione in Tempo Reale',
            text: 'I blocchi audio vengono inviati in streaming. Puoi vedere i timestamp generati live nella console e il testo unito nell\'anteprima superiore.',
            position: 'top',
            onBeforeShow: () => {
                // Collapse settings
                const settingsBody = document.getElementById('settings-body');
                const settingsTrigger = document.getElementById('settings-trigger');
                if (settingsBody && !settingsBody.classList.contains('collapsible--collapsed')) {
                    settingsTrigger.click();
                }

                // Setup mock processing view
                const processingCard = document.getElementById('processing-card');
                const progressStatus = document.getElementById('progress-status');
                const progressBarFill = document.getElementById('progress-bar-fill');
                const progressLabel = document.getElementById('progress-label');
                const liveConsole = document.getElementById('live-console');
                const livePreviewContainer = document.getElementById('live-preview-container');
                const livePreviewText = document.getElementById('live-preview-text');

                // Clean and show processing card
                if (progressBarFill) {
                    progressBarFill.style.width = '0%';
                    progressBarFill.className = 'progress__fill';
                }
                if (progressLabel) progressLabel.textContent = '0%';
                if (progressStatus) progressStatus.textContent = "Avvio modulo MLX Whisper...";
                if (liveConsole) liveConsole.innerHTML = `<div class="console__line console__line--placeholder">Caricamento pesi modello...</div>`;
                if (livePreviewContainer) livePreviewContainer.style.display = 'none';
                if (livePreviewText) livePreviewText.textContent = '';

                StepIndicator.setStep('transcribe');
                if (processingCard) {
                    processingCard.style.display = 'block';
                }

                if (isShowcaseMode) {
                    // Run live streaming simulation
                    setTimeout(() => {
                        if (liveConsole) liveConsole.innerHTML = "";
                        if (livePreviewContainer) livePreviewContainer.style.display = "block";
                        if (progressStatus) progressStatus.textContent = "Analisi traccia audio e generazione testo...";

                        const mockData = [
                            { start: 0.0, end: 4.2, text: "Benvenuti ad ASR Whisper Studio." },
                            { start: 4.2, end: 11.5, text: "Questo strumento consente di trascrivere qualsiasi traccia audio in locale." },
                            { start: 11.5, end: 19.8, text: "Garantisce la privacy totale in quanto nessun dato lascia la memoria del dispositivo." },
                            { start: 19.8, end: 26.5, text: "Supporta modelli Whisper Tiny, Small, Medium e Large Turbo." },
                            { start: 26.5, end: 32.0, text: "La trascrizione guidata è ora completata con successo!" }
                        ];

                        let segmentIdx = 0;
                        progressInterval = setInterval(() => {
                            if (segmentIdx >= mockData.length || !isShowcaseMode) {
                                clearInterval(progressInterval);
                                return;
                            }
                            const seg = mockData[segmentIdx];
                            const line = document.createElement('div');
                            line.className = 'console__line';
                            line.textContent = `[${_pad(seg.start)} --> ${_pad(seg.end)}] ${seg.text}`;
                            if (liveConsole) {
                                liveConsole.appendChild(line);
                                liveConsole.scrollTop = liveConsole.scrollHeight;
                            }
                            if (livePreviewText) {
                                livePreviewText.textContent += (livePreviewText.textContent ? ' ' : '') + seg.text;
                                livePreviewText.scrollTop = livePreviewText.scrollHeight;
                            }
                            const percent = Math.round((seg.end / 32.0) * 100);
                            if (progressBarFill) progressBarFill.style.width = `${percent}%`;
                            if (progressLabel) progressLabel.textContent = `${percent}%`;
                            segmentIdx++;
                        }, 750);
                    }, 400);

                } else {
                    // Static representation for manual mode
                    if (progressBarFill) progressBarFill.style.width = '45%';
                    if (progressLabel) progressLabel.textContent = '45%';
                    if (progressStatus) progressStatus.textContent = "Analisi traccia audio e generazione testo...";
                    if (livePreviewContainer) livePreviewContainer.style.display = 'block';
                    if (livePreviewText) livePreviewText.textContent = "Benvenuti ad ASR Whisper Studio. Questo strumento consente di trascrivere qualsiasi traccia audio in locale.";
                    if (liveConsole) {
                        liveConsole.innerHTML = `
                            <div class="console__line">[00:00.00 --> 00:04.20] Benvenuti ad ASR Whisper Studio.</div>
                            <div class="console__line">[00:04.20 --> 00:11.50] Questo strumento consente di trascrivere qualsiasi traccia audio in locale.</div>
                        `;
                    }
                }
            },
            nextDelay: 6
        },
        {
            elementId: 'results-card',
            title: 'Visualizzazione Risultati',
            text: 'Trascrizione completata! Ora puoi navigare tra le schede per visualizzare il testo unito, i singoli segmenti con parole e i dati JSON grezzi.',
            position: 'top',
            onBeforeShow: () => {
                // Hide processing card
                const processingCard = document.getElementById('processing-card');
                if (processingCard) processingCard.style.display = 'none';

                // Build Mock Results
                const mockText = "Benvenuti ad ASR Whisper Studio. Questo strumento consente di trascrivere qualsiasi traccia audio in locale. Garantisce la privacy totale in quanto nessun dato lascia la memoria del dispositivo. Supporta modelli Whisper Tiny, Small, Medium e Large Turbo. La trascrizione guidata è ora completata con successo!";
                const transcriptText = document.getElementById('transcript-text');
                const statTime = document.getElementById('stat-time');
                const statLang = document.getElementById('stat-lang');
                const statModel = document.getElementById('stat-model');
                const rawJson = document.getElementById('raw-json');
                const segmentsList = document.getElementById('segments-list');
                const segmentsTabBtn = document.getElementById('segments-tab-btn');

                if (transcriptText) transcriptText.textContent = mockText;
                if (statTime) statTime.textContent = "4.86s";
                if (statLang) statLang.textContent = "Italiano (it)";
                if (statModel) statModel.textContent = "Whisper Large V3 Turbo";
                if (rawJson) rawJson.textContent = JSON.stringify({ text: mockText, model: "whisper-large-v3-turbo", stats: { time_total_seconds: 4.86 } }, null, 2);

                if (segmentsList) {
                    segmentsList.innerHTML = `
                        <div class="segment-item">
                            <div class="segment-header"><span class="segment-time">00:00.00 → 00:11.50</span><span class="segment-id">Segmento #1</span></div>
                            <div class="segment-text">Benvenuti ad ASR Whisper Studio. Questo strumento consente di trascrivere qualsiasi traccia audio in locale.</div>
                            <div class="segment-words"><span class="word-pill">Benvenuti</span><span class="word-pill">ad</span><span class="word-pill">ASR</span><span class="word-pill">Whisper</span></div>
                        </div>
                        <div class="segment-item">
                            <div class="segment-header"><span class="segment-time">00:11.50 → 00:32.00</span><span class="segment-id">Segmento #2</span></div>
                            <div class="segment-text">Garantisce la privacy totale in quanto nessun dato lascia la memoria del dispositivo. Supporta modelli Whisper. La trascrizione guidata è ora completata!</div>
                            <div class="segment-words"><span class="word-pill">Garantisce</span><span class="word-pill">la</span><span class="word-pill">privacy</span><span class="word-pill">totale</span></div>
                        </div>
                    `;
                }
                if (segmentsTabBtn) segmentsTabBtn.style.display = "inline-block";

                StepIndicator.setStep('results');

                if (isShowcaseMode) {
                    // Cycle tabs
                    setTimeout(() => {
                        if (!isShowcaseMode) return;
                        const segTab = document.querySelector('[data-tab="segments-tab"]');
                        if (segTab) segTab.click();
                    }, 1500);

                    setTimeout(() => {
                        if (!isShowcaseMode) return;
                        const rawTab = document.querySelector('[data-tab="raw-tab"]');
                        if (rawTab) rawTab.click();
                    }, 3000);

                    setTimeout(() => {
                        if (!isShowcaseMode) return;
                        const textTab = document.querySelector('[data-tab="text-tab"]');
                        if (textTab) textTab.click();
                    }, 4500);
                }
            },
            nextDelay: 6
        }
    ];

    function init() {
        _createDOM();
    }

    function _createDOM() {
        if (backdropContainer) return;

        // Create container overlay
        backdropContainer = document.createElement('div');
        backdropContainer.id = 'tour-backdrop-container';
        backdropContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9990; pointer-events: none; opacity: 0; transition: opacity 0.3s;';
        
        // Create 4 blocker divs for the cutout strategy
        blockers = [];
        for (let i = 0; i < 4; i++) {
            const blocker = document.createElement('div');
            blocker.className = 'tour-blocker';
            blocker.style.cssText = 'position: fixed; background: rgba(10, 10, 15, 0.65); backdrop-filter: blur(2.5px); -webkit-backdrop-filter: blur(2.5px); pointer-events: auto; transition: opacity 0.3s ease;';
            // Click any blocker to end the tour
            blocker.addEventListener('click', end);
            backdropContainer.appendChild(blocker);
            blockers.push(blocker);
        }

        // Create glowing spotlight outline box
        spotlightOutlineEl = document.createElement('div');
        spotlightOutlineEl.className = 'tour-spotlight-outline';
        backdropContainer.appendChild(spotlightOutlineEl);

        document.body.appendChild(backdropContainer);

        // Create Popover tooltip
        popoverEl = document.createElement('div');
        popoverEl.className = 'tour-popover';
        document.body.appendChild(popoverEl);

        // Listen for resize and scroll to adjust highlight cutout dynamically
        window.addEventListener('resize', _updateCutout);
        window.addEventListener('scroll', _updateCutout, { passive: true });
    }

    function startInteractive() {
        _cleanupTimers();
        isShowcaseMode = false;
        _createDOM();
        
        // Hide floating triggers
        const triggers = document.getElementById('tour-triggers');
        if (triggers) triggers.style.display = 'none';
        
        StepIndicator.setStep('upload');
        backdropContainer.style.opacity = '1';
        spotlightOutlineEl.classList.add('tour-spotlight-outline--visible');
        popoverEl.classList.add('tour-popover--visible');
        
        showStep(0);
    }

    function startShowcase() {
        _cleanupTimers();
        isShowcaseMode = true;
        _createDOM();

        // Hide floating triggers
        const triggers = document.getElementById('tour-triggers');
        if (triggers) triggers.style.display = 'none';

        backdropContainer.style.opacity = '1';
        spotlightOutlineEl.classList.add('tour-spotlight-outline--visible');
        popoverEl.classList.add('tour-popover--visible');

        Toast.show("Inizio Showcase Automatico...", "info");
        showStep(0);
    }

    async function startRecordingShowcase() {
        try {
            recordStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "browser"
                },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: "include"
            });

            recordedChunks = [];
            mediaRecorder = new MediaRecorder(recordStream, { mimeType: 'video/webm;codecs=vp9' });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunks.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ASR_Whisper_Studio_Showcase.webm`;
                a.click();
                URL.revokeObjectURL(url);
                Toast.show("Video salvato e scaricato!", "success");
            };

            mediaRecorder.start();
            Toast.show("Registrazione dello schermo avviata!", "success");

            startShowcase();

        } catch (err) {
            console.error("Screen recording failed:", err);
            Toast.show("Registrazione non avviata.", "warning");
        }
    }

    function end() {
        _cleanupTimers();
        _hideCutout();

        // Show floating triggers
        const triggers = document.getElementById('tour-triggers');
        if (triggers) triggers.style.display = 'flex';

        activeHighlightEl = null;

        backdropContainer.style.opacity = '0';
        if (spotlightOutlineEl) {
            spotlightOutlineEl.classList.remove('tour-spotlight-outline--visible');
        }
        popoverEl.classList.remove('tour-popover--visible');
        
        const transcribeBtn = document.getElementById('transcribe-btn');
        const transcribeBtnText = document.getElementById('transcribe-btn-text');
        const btnSpinner = document.getElementById('btn-spinner');
        const changeFileBtn = document.getElementById('change-file-btn');
        if (transcribeBtn) transcribeBtn.disabled = false;
        if (transcribeBtnText) transcribeBtnText.textContent = "Trascrivi Audio";
        if (btnSpinner) btnSpinner.style.display = "none";
        if (changeFileBtn) changeFileBtn.disabled = false;

        currentStepIdx = -1;

        // Cleanup mockup file and results if loaded during tour
        const previewFilename = document.getElementById('preview-filename');
        const audioElement = document.getElementById('audio-element');
        if (audioElement && audioElement.getAttribute('src') === 'dummy-url') {
            audioElement.removeAttribute('src');
            if (previewFilename) previewFilename.textContent = 'file.mp3';
            
            // Hide processing card
            const processingCard = document.getElementById('processing-card');
            if (processingCard) processingCard.style.display = 'none';

            // Reset results text & stats
            const transcriptText = document.getElementById('transcript-text');
            const statTime = document.getElementById('stat-time');
            const statLang = document.getElementById('stat-lang');
            const statModel = document.getElementById('stat-model');
            const rawJson = document.getElementById('raw-json');
            const segmentsList = document.getElementById('segments-list');
            const segmentsTabBtn = document.getElementById('segments-tab-btn');

            if (transcriptText) transcriptText.textContent = 'La trascrizione apparirà qui...';
            if (statTime) statTime.textContent = '-';
            if (statLang) statLang.textContent = '-';
            if (statModel) statModel.textContent = '-';
            if (rawJson) rawJson.textContent = '{}';
            if (segmentsList) segmentsList.innerHTML = '';
            if (segmentsTabBtn) segmentsTabBtn.style.display = 'none';

            StepIndicator.setStep('upload');
        }
        
        // Collapse advanced settings if it was opened by the tour
        const settingsBody = document.getElementById('settings-body');
        if (settingsBody && !settingsBody.classList.contains('collapsible--collapsed')) {
            document.getElementById('settings-trigger').click();
        }

        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
            if (recordStream) {
                recordStream.getTracks().forEach(track => track.stop());
            }
        }
    }

    function showStep(idx) {
        if (idx < 0 || idx >= STEPS.length) {
            end();
            if (isShowcaseMode) {
                Toast.show("Showcase completato!", "success");
            } else {
                Toast.show("Tour completato!", "success");
            }
            return;
        }

        currentStepIdx = idx;
        const step = STEPS[idx];

        if (typeof step.onBeforeShow === 'function') {
            step.onBeforeShow();
        }

        // Dynamically compute target elementId, title, and description text based on state/mode
        let elementId = step.elementId;
        let title = step.title;
        let text = step.text;

        if (idx === 3) {
            if (isShowcaseMode) {
                elementId = 'file-card';
                title = '1. Selezione File (Demo)';
                text = 'Il file audio di prova conferenza_tecnica.mp3 è stato caricato. L\'interfaccia passerà ora allo step di configurazione.';
            } else {
                const fileCard = document.getElementById('file-card');
                const isFileLoaded = fileCard && !fileCard.closest('.section').classList.contains('section--hidden');
                if (isFileLoaded) {
                    elementId = 'file-card';
                    title = 'Audio Caricato';
                    text = 'Il tuo file audio è caricato e pronto per la trascrizione. Puoi ascoltarlo nel player o cambiarlo cliccando "Cambia file".';
                } else {
                    elementId = 'dropzone';
                    title = 'Area di Caricamento';
                    text = 'Trascina qui qualsiasi file audio comune (MP3, WAV, M4A, FLAC, WEBM) fino a 25MB, oppure clicca su "Seleziona File" per sfogliare il tuo computer.';
                }
            }
        } else if (idx === 4) {
            if (isShowcaseMode) {
                title = '2. Configurazione Opzioni (Demo)';
                text = 'Espandiamo le impostazioni avanzate selezionando il modello Whisper Large V3 Turbo e impostando la lingua su Italiano.';
            } else {
                title = 'Impostazioni Avanzate';
                text = 'Da qui puoi personalizzare il modello Whisper, forzare la lingua di trascrizione, abilitare i timestamp a livello di parola e impostare altri parametri avanzati.';
            }
        } else if (idx === 5) {
            if (isShowcaseMode) {
                title = '3. Trascrizione in Tempo Reale (Demo)';
                text = 'L\'audio viene decodificato ed inviato live in streaming, riempiendo la console log e l\'anteprima superiore.';
            } else {
                title = 'Elaborazione in Tempo Reale';
                text = 'I blocchi audio vengono inviati in streaming. Puoi vedere i timestamp generati live nella console e il testo unito nell\'anteprima superiore.';
            }
        } else if (idx === 6) {
            if (isShowcaseMode) {
                title = '4. Visualizzazione Risultati (Demo)';
                text = 'La trascrizione è terminata. Puoi scorrere le schede per copiare il testo o analizzare i segmenti con i timestamp per singola parola.';
            } else {
                title = 'Visualizzazione Risultati';
                text = 'Trascrizione completata! Ora puoi navigare tra le schede per visualizzare il testo unito, i singoli segmenti con parole e i dati JSON grezzi.';
            }
        }

        const target = document.getElementById(elementId);
        if (!target) {
            next();
            return;
        }

        activeHighlightEl = target;
        activeHighlightEl.scrollIntoView({ behavior: 'auto', block: 'center' });

        // Track the element's position continuously while the step is active to follow scrolling, page resize, and CSS animations
        function trackSpotlight() {
            if (activeHighlightEl === target) {
                // For step 3 in manual mode, dynamically switch between dropzone and file-card if visibility changes
                if (idx === 3 && !isShowcaseMode) {
                    const fileCard = document.getElementById('file-card');
                    const isFileLoaded = fileCard && !fileCard.closest('.section').classList.contains('section--hidden');
                    const currentTargetId = isFileLoaded ? 'file-card' : 'dropzone';
                    if (target.id !== currentTargetId) {
                        showStep(3);
                        return;
                    }
                }

                _updateCutout();
                _positionPopover(target, step.position);
                requestAnimationFrame(trackSpotlight);
            }
        }
        requestAnimationFrame(trackSpotlight);

        const isLast = idx === STEPS.length - 1;
        
        popoverEl.innerHTML = `
            <div class="tour-popover__title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
                </svg>
                <span>${title}</span>
            </div>
            <div class="tour-popover__text">${text}</div>
            <div class="tour-popover__footer">
                <span class="tour-popover__step">${idx + 1} di ${STEPS.length} ${isShowcaseMode ? '(Auto)' : ''}</span>
                <div class="tour-popover__buttons">
                    <button class="tour-btn tour-btn--ghost" style="padding: 4px 10px; font-size: 0.75rem;" id="tour-prev-btn" ${idx === 0 ? 'disabled' : ''}>Indietro</button>
                    <button class="tour-btn tour-btn--primary" style="padding: 4px 10px; font-size: 0.75rem;" id="tour-next-btn">${isLast ? 'Fine' : 'Avanti'}</button>
                </div>
            </div>
        `;

        const prevBtn = document.getElementById('tour-prev-btn');
        const nextBtn = document.getElementById('tour-next-btn');

        prevBtn.addEventListener('click', () => {
            _cleanupTimers();
            if (currentStepIdx > 0) showStep(currentStepIdx - 1);
        });

        nextBtn.addEventListener('click', () => {
            _cleanupTimers();
            next();
        });

        // Auto step transitions
        if (isShowcaseMode && step.nextDelay) {
            countdownSeconds = step.nextDelay;
            nextBtn.textContent = isLast ? 'Fine' : `Avanti (${countdownSeconds}s)`;

            countdownInterval = setInterval(() => {
                countdownSeconds--;
                if (countdownSeconds > 0) {
                    nextBtn.textContent = isLast ? 'Fine' : `Avanti (${countdownSeconds}s)`;
                } else {
                    clearInterval(countdownInterval);
                }
            }, 1000);

            showcaseTimer = setTimeout(() => {
                nextBtn.classList.add('tour-btn--active');
                setTimeout(() => {
                    next();
                }, 200);
            }, step.nextDelay * 1000);
        }
    }

    function next() {
        if (currentStepIdx < STEPS.length - 1) {
            showStep(currentStepIdx + 1);
        } else {
            end();
        }
    }

    function _cleanupTimers() {
        if (showcaseTimer) clearTimeout(showcaseTimer);
        if (countdownInterval) clearInterval(countdownInterval);
        if (progressInterval) clearInterval(progressInterval);
        showcaseTimer = null;
        countdownInterval = null;
        progressInterval = null;
    }

    function _updateCutout() {
        if (!blockers || blockers.length < 4 || !activeHighlightEl) return;
        
        const rect = activeHighlightEl.getBoundingClientRect();
        const padding = 6;
        
        const topLimit = rect.top - padding;
        const bottomLimit = rect.bottom + padding;
        const leftLimit = rect.left - padding;
        const rightLimit = rect.right + padding;
        
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // 1. Top blocker: covers everything from top of viewport to top of highlighted element
        blockers[0].style.top = '0px';
        blockers[0].style.left = '0px';
        blockers[0].style.width = '100vw';
        blockers[0].style.height = `${Math.max(0, topLimit)}px`;

        // 2. Bottom blocker: covers everything from bottom of highlighted element to bottom of viewport
        blockers[1].style.top = `${bottomLimit}px`;
        blockers[1].style.left = '0px';
        blockers[1].style.width = '100vw';
        blockers[1].style.height = `${Math.max(0, viewportHeight - bottomLimit)}px`;

        // 3. Left blocker: covers the left side of the highlighted element
        blockers[2].style.top = `${Math.max(0, topLimit)}px`;
        blockers[2].style.left = '0px';
        blockers[2].style.width = `${Math.max(0, leftLimit)}px`;
        blockers[2].style.height = `${Math.max(0, bottomLimit - topLimit)}px`;

        // 4. Right blocker: covers the right side of the highlighted element
        blockers[3].style.top = `${Math.max(0, topLimit)}px`;
        blockers[3].style.left = `${rightLimit}px`;
        blockers[3].style.width = `${Math.max(0, viewportWidth - rightLimit)}px`;
        blockers[3].style.height = `${Math.max(0, bottomLimit - topLimit)}px`;

        // Update spotlight outline position and size
        if (spotlightOutlineEl) {
            spotlightOutlineEl.style.top = `${topLimit}px`;
            spotlightOutlineEl.style.left = `${leftLimit}px`;
            spotlightOutlineEl.style.width = `${rightLimit - leftLimit}px`;
            spotlightOutlineEl.style.height = `${bottomLimit - topLimit}px`;
        }
    }

    function _hideCutout() {
        blockers.forEach(blocker => {
            blocker.style.width = '0px';
            blocker.style.height = '0px';
        });
        if (spotlightOutlineEl) {
            spotlightOutlineEl.style.width = '0px';
            spotlightOutlineEl.style.height = '0px';
        }
    }

    function _positionPopover(target, preferredPosition = 'bottom') {
        const targetRect = target.getBoundingClientRect();
        const popoverRect = popoverEl.getBoundingClientRect();

        const scrollY = window.scrollY;
        const scrollX = window.scrollX;

        let top = 0;
        let left = 0;
        const gap = 14;

        if (preferredPosition === 'bottom') {
            top = targetRect.bottom + scrollY + gap;
            left = targetRect.left + scrollX + (targetRect.width / 2) - (popoverRect.width / 2);
        } else if (preferredPosition === 'bottom-right') {
            top = targetRect.top + scrollY + targetRect.height + gap; // Fix bottom-right overflow placement
            left = targetRect.right + scrollX - popoverRect.width;
        } else if (preferredPosition === 'top') {
            top = targetRect.top + scrollY - popoverRect.height - gap;
            left = targetRect.left + scrollX + (targetRect.width / 2) - (popoverRect.width / 2);
        }

        if (left < 10) left = 10;
        if (left + popoverRect.width > window.innerWidth - 10) {
            left = window.innerWidth - popoverRect.width - 10;
        }
        if (top < 10) top = 10;

        popoverEl.style.top = `${top}px`;
        popoverEl.style.left = `${left}px`;
    }

    function _pad(val) {
        const mins = Math.floor(val / 60);
        const secs = Math.floor(val % 60);
        const ms = Math.floor((val % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    return { init, startInteractive, startShowcase, startRecordingShowcase, end };
})();

const Showcase = {
    start: () => Tour.startShowcase(),
    startRecording: () => Tour.startRecordingShowcase(),
    stop: () => Tour.end()
};
