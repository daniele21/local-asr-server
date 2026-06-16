/**
 * analysis-page.js - Analysis page controller.
 *
 * Loaded before app.js and exposed as window.AnalysisController.
 */

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
        select.innerHTML = `<option value="">${i18n.t('common.loading')}</option>`;

        try {
            const { items } = await ApiClient.listTranscriptions(1, 100);
            select.innerHTML = '';
            if (items.length === 0) {
                select.innerHTML = `<option value="">${i18n.t('analysis.noTranscriptionsAvailable')}</option>`;
                return;
            }
            const placeholderOpt = document.createElement('option');
            placeholderOpt.value = '';
            placeholderOpt.textContent = `-- ${i18n.t('analysis.selectTranscriptionLabel')} --`;
            select.appendChild(placeholderOpt);

            items.forEach(item => {
                const opt = document.createElement('option');
                opt.value = item.id;
                const dateStr = new Intl.DateTimeFormat(i18n.getLang() === 'it' ? 'it-IT' : 'en-US', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.timestamp));
                const fileBase = item.audio_filename || 'Audio';
                const textSnippet = item.text ? item.text.substring(0, 30) + '...' : (i18n.getLang() === 'it' ? '(Vuota)' : '(Empty)');
                opt.textContent = `${dateStr} - ${fileBase} (${textSnippet})`;
                select.appendChild(opt);
            });

            const workflowState = Workflow.getState();
            if (workflowState.navigateContext && workflowState.navigateContext.preselectedTranscriptionId) {
                const transcriptionId = workflowState.navigateContext.preselectedTranscriptionId;
                const preselectedAnalysis = workflowState.navigateContext.preselectedAnalysis;
                Workflow.update({
                    navigateContext: Object.assign({}, workflowState.navigateContext, {
                        preselectedTranscriptionId: null,
                        preselectedAnalysis: null,
                    })
                });
                select.value = transcriptionId;
                select.dispatchEvent(new Event('change'));
                if (preselectedAnalysis) {
                    showExistingAnalysis(preselectedAnalysis);
                }
            }
        } catch (err) {
            console.error('Failed to load transcriptions in analysis select:', err);
            select.innerHTML = `<option value="">${i18n.t('common.error')}</option>`;
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
                progressStatus.textContent = i18n.t('analysis.preparing');
            } else {
                const fileName = importedFile.name.toLowerCase();
                if (fileName.endsWith('.txt')) {
                    progressStatus.textContent = i18n.getLang() === 'it' ? 'Lettura file di testo...' : 'Reading text file...';
                    const text = await readFileAsText(importedFile);
                    payload.text = text;
                } else if (fileName.endsWith('.json')) {
                    progressStatus.textContent = i18n.getLang() === 'it' ? 'Lettura file JSON...' : 'Reading JSON file...';
                    const text = await readFileAsText(importedFile);
                    try {
                        const parsed = JSON.parse(text);
                        payload.text = parsed.text || parsed.transcript || text;
                    } catch {
                        payload.text = text;
                    }
                } else {
                    progressStatus.textContent = i18n.t('transcription.transcribingStatus');
                    const formData = new FormData();
                    formData.append('file', importedFile);
                    formData.append('stream', 'false');

                    const response = await ApiClient.transcribe(formData);
                    const data = await response.json();
                    if (!data.text) {
                        throw new Error(i18n.t('analysis.selectSourceError'));
                    }
                    payload.text = data.text;
                }
                progressStatus.textContent = i18n.t('analysis.analyzingStatus');
            }

            const result = await ApiClient.analyze(payload);
            renderAnalysisResult(result);

            processingCard.style.display = 'none';
            resultCard.style.display = 'block';

            // Show SuccessCard inline
            const targetContainer = document.getElementById('analysis-result-card');
            if (targetContainer) {
                const oldCard = targetContainer.querySelector('.success-card');
                if (oldCard) oldCard.remove();

                const successCard = SuccessCard.render({
                    title: i18n.t('analysis.successTitle'),
                    body: i18n.t('analysis.successBody'),
                    ctas: [
                        {
                            label: i18n.t('analysis.btnCopyMarkdown'),
                            primary: true,
                            action: () => {
                                copyResults();
                            }
                        },
                        {
                            label: i18n.t('analysis.btnGoDashboard'),
                            primary: false,
                            action: () => {
                                window.App?.switchPage('home');
                                successCard.remove();
                            }
                        }
                    ]
                });

                targetContainer.insertBefore(successCard, targetContainer.firstChild);
            }

            // Increment manual analysis count in localStorage
            try {
                const currentCount = parseInt(localStorage.getItem('analyses_count') || '0', 10);
                localStorage.setItem('analyses_count', String(currentCount + 1));
            } catch {}
            loadTranscriptions();

            // Save setting update
            const settings = await ApiClient.getSettings();
            const payloadSettings = Object.assign({}, settings, {
                gemini_api_key: apiKey,
                llm_provider: provider
            });
            await ApiClient.updateSettings(payloadSettings);

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
            reader.onerror = () => reject(new Error(i18n.getLang() === 'it' ? 'Errore durante la lettura del file.' : 'Error reading file.'));
            reader.readAsText(file);
        });
    }

    function renderAnalysisResult(result) {
        const titleEl = document.getElementById('analysis-result-title');
        const summaryEl = document.getElementById('analysis-result-summary');
        const keyPointsUl = document.getElementById('analysis-result-key-points');
        const actionItemsUl = document.getElementById('analysis-result-action-items');

        titleEl.textContent = result.title || i18n.t('analysis.resultTitle');
        summaryEl.textContent = result.summary || '';

        keyPointsUl.innerHTML = '';
        if (result.key_points && result.key_points.length > 0) {
            result.key_points.forEach(kp => {
                const li = document.createElement('li');
                li.textContent = kp;
                keyPointsUl.appendChild(li);
            });
        } else {
            keyPointsUl.innerHTML = `<li>${i18n.getLang() === 'it' ? 'Nessun punto chiave identificato.' : 'No key points identified.'}</li>`;
        }

        actionItemsUl.innerHTML = '';
        if (result.action_items && result.action_items.length > 0) {
            result.action_items.forEach(ai => {
                const li = document.createElement('li');
                li.textContent = ai;
                actionItemsUl.appendChild(li);
            });
        } else {
            actionItemsUl.innerHTML = `<li>${i18n.getLang() === 'it' ? 'Nessuna azione identificata.' : 'No action items identified.'}</li>`;
        }
    }

    function showExistingAnalysis(result) {
        const processingCard = document.getElementById('analysis-processing-card');
        const emptyCard = document.getElementById('analysis-empty-card');
        const resultCard = document.getElementById('analysis-result-card');
        if (processingCard) processingCard.style.display = 'none';
        if (emptyCard) emptyCard.style.display = 'none';
        if (resultCard) resultCard.style.display = 'block';
        renderAnalysisResult(result);
    }

    function copyResults() {
        const title = document.getElementById('analysis-result-title').textContent;
        const summary = document.getElementById('analysis-result-summary').textContent;
        const keyPoints = Array.from(document.getElementById('analysis-result-key-points').querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');
        const actionItems = Array.from(document.getElementById('analysis-result-action-items').querySelectorAll('li')).map(li => `- ${li.textContent}`).join('\n');

        const formatted = `# ${title}\n\n## Riassunto\n${summary}\n\n## Punti Chiave\n${keyPoints}\n\n## Prossimi Passi\n${actionItems}`;

        navigator.clipboard.writeText(formatted).then(() => {
            Toast.show(i18n.t('analysis.copySuccess'), 'success');
            const copyText = document.getElementById('analysis-copy-text');
            const original = copyText.textContent;
            copyText.textContent = LABELS.copied;
            setTimeout(() => { copyText.textContent = original; }, 2000);
        }).catch(() => {
            Toast.show(i18n.t('analysis.copyError'), 'error');
        });
    }

    return {
        init,
        loadTranscriptions,
        loadSettings,
        showExistingAnalysis
    };
})();

window.AnalysisController = AnalysisController;
