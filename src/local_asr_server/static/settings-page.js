/**
 * settings-page.js — Settings controller for ClosedRoom
 */

const SettingsPageController = (() => {
    let container = null;

    async function init() {
        container = document.getElementById('page-settings');
        if (!container) return;

        // Listen for language changes to re-render settings labels
        window.addEventListener('languagechanged', () => {
            if (container.classList.contains('app-page--active')) {
                loadSettings();
            }
        });
    }

    async function loadSettings() {
        if (!container) return;

        try {
            // Show loading
            container.innerHTML = `
                <div class="loading-panel">
                    <span class="spinner"></span>
                    <span data-i18n="common.loading">${i18n.t('common.loading')}</span>
                </div>
            `;

            const settings = await ApiClient.getSettings();

            // Populate system info from API (could fetch dynamically or hardcode package defaults)
            const systemInfo = {
                server: '127.0.0.1:1236',
                activeModel: settings.default_model || i18n.t('common.notAvailable'),
                version: '1.0.0',
                menubar: i18n.t('settings.sysActive')
            };

            container.innerHTML = `
                <div class="workspace-heading">
                    <div>
                        <span class="workspace-heading__eyebrow" data-i18n="settings.title">${i18n.t('settings.title')}</span>
                        <h2 data-i18n="settings.title">${i18n.t('settings.title')}</h2>
                    </div>
                </div>

                <form id="settings-form" class="settings-form">
                    <!-- Storage Settings Section -->
                    <div class="settings-section card">
                        <h3 class="section-title" data-i18n="settings.storageTitle">${i18n.t('settings.storageTitle')}</h3>
                        
                        <div class="form-group">
                            <label for="settings-recordings-dir" data-i18n="settings.recordingsFolderLabel">${i18n.t('settings.recordingsFolderLabel')}</label>
                            <div class="input-browse-group">
                                <input type="text" id="settings-recordings-dir" name="recordings_dir" value="${settings.recordings_dir || ''}" required>
                                <button type="button" class="btn btn--secondary btn-browse" data-target="settings-recordings-dir">${i18n.t('settings.btnBrowse')}</button>
                            </div>
                        </div>

                        <div class="form-group">
                            <label for="settings-transcriptions-dir" data-i18n="settings.transcriptionsFolderLabel">${i18n.t('settings.transcriptionsFolderLabel')}</label>
                            <div class="input-browse-group">
                                <input type="text" id="settings-transcriptions-dir" name="transcriptions_dir" value="${settings.transcriptions_dir || ''}" required>
                                <button type="button" class="btn btn--secondary btn-browse" data-target="settings-transcriptions-dir">${i18n.t('settings.btnBrowse')}</button>
                            </div>
                        </div>
                    </div>

                    <!-- Transcription Default Settings Section -->
                    <div class="settings-section card">
                        <h3 class="section-title" data-i18n="settings.transcriptionDefaultsTitle">${i18n.t('settings.transcriptionDefaultsTitle')}</h3>
                        <p class="section-desc" data-i18n="settings.transcriptionDefaultsDesc">${i18n.t('settings.transcriptionDefaultsDesc')}</p>

                        <div class="form-group">
                            <label for="settings-default-model" data-i18n="transcription.modelLabel">${i18n.t('transcription.modelLabel')}</label>
                            <select id="settings-default-model" name="default_model">
                                ${MODELS.map(m => `<option value="${m.value}" ${settings.default_model === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="settings-default-language" data-i18n="transcription.languageLabel">${i18n.t('transcription.languageLabel')}</label>
                            <select id="settings-default-language" name="default_language">
                                ${LANGUAGES.map(l => `<option value="${l.value}" ${settings.default_language === l.value ? 'selected' : ''}>${l.label}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="settings-default-task" data-i18n="transcription.taskLabel">${i18n.t('transcription.taskLabel')}</label>
                            <select id="settings-default-task" name="default_task">
                                ${TASKS.map(t => `<option value="${t.value}" ${settings.default_task === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="settings-default-temperature" data-i18n="transcription.temperatureLabel">${i18n.t('transcription.temperatureLabel')}</label>
                            <input type="number" step="0.1" min="0" max="1" placeholder="Auto" id="settings-default-temperature" name="default_temperature" value="${settings.default_temperature !== undefined && settings.default_temperature !== null ? settings.default_temperature : ''}">
                        </div>

                        <div class="form-checkbox-group">
                            <label class="checkbox-container">
                                <input type="checkbox" id="settings-default-word-timestamps" name="default_word_timestamps" ${settings.default_word_timestamps ? 'checked' : ''}>
                                <span class="checkbox-checkmark"></span>
                                <span data-i18n="transcription.wordTimestampsLabel">${i18n.t('transcription.wordTimestampsLabel')}</span>
                            </label>
                        </div>

                        <div class="form-checkbox-group">
                            <label class="checkbox-container">
                                <input type="checkbox" id="settings-default-condition-on-previous" name="default_condition_on_previous" ${settings.default_condition_on_previous ? 'checked' : ''}>
                                <span class="checkbox-checkmark"></span>
                                <span data-i18n="transcription.conditionLabel">${i18n.t('transcription.conditionLabel')}</span>
                            </label>
                        </div>
                    </div>

                    <!-- AI Analysis Settings Section -->
                    <div class="settings-section card">
                        <h3 class="section-title" data-i18n="settings.aiAnalysisTitle">${i18n.t('settings.aiAnalysisTitle')}</h3>
                        
                        <div class="form-group">
                            <label for="settings-llm-provider" data-i18n="settings.providerLabel">${i18n.t('settings.providerLabel')}</label>
                            <select id="settings-llm-provider" name="llm_provider">
                                <option value="mock" ${settings.llm_provider === 'mock' ? 'selected' : ''}>Mock (Offline / Demo)</option>
                                <option value="gemini" ${settings.llm_provider === 'gemini' ? 'selected' : ''}>Google Gemini API</option>
                            </select>
                        </div>

                        <div class="form-group" id="gemini-key-group" style="${settings.llm_provider === 'gemini' ? '' : 'display:none;'}">
                            <label for="settings-gemini-api-key" data-i18n="settings.apiKeyLabel">${i18n.t('settings.apiKeyLabel')}</label>
                            <input type="password" id="settings-gemini-api-key" name="gemini_api_key" value="${settings.gemini_api_key || ''}" placeholder="AIzaSy...">
                            <span class="form-help-text" data-i18n="settings.apiKeyDesc">${i18n.t('settings.apiKeyDesc')}</span>
                        </div>
                    </div>



                    <div class="settings-actions">
                        <button type="submit" class="btn btn--primary btn--lg" data-i18n="settings.btnSave">${i18n.t('settings.btnSave')}</button>
                    </div>
                </form>

                <!-- System Info Card -->
                <div class="settings-section card system-info-card" style="margin-top:2rem;">
                    <h3 class="section-title" data-i18n="settings.systemInfoTitle">${i18n.t('settings.systemInfoTitle')}</h3>
                    <div class="system-info-grid">
                        <div class="info-row">
                            <span class="info-label" data-i18n="settings.sysServer">${i18n.t('settings.sysServer')}</span>
                            <span class="info-value">${systemInfo.server}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label" data-i18n="settings.sysActiveModel">${i18n.t('settings.sysActiveModel')}</span>
                            <span class="info-value select-model-name">${systemInfo.activeModel}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label" data-i18n="settings.sysVersion">${i18n.t('settings.sysVersion')}</span>
                            <span class="info-value">${systemInfo.version}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label" data-i18n="settings.sysMacosMenu">${i18n.t('settings.sysMacosMenu')}</span>
                            <span class="info-value">${systemInfo.menubar}</span>
                        </div>
                    </div>
                </div>
            `;

            // Bind events
            bindEvents();

            i18n.applyAll(container);

        } catch (err) {
            console.error('Error loading settings:', err);
            container.innerHTML = `
                <div class="error-panel card">
                    <h3>${i18n.t('common.error')}</h3>
                    <p>${err.message}</p>
                </div>
            `;
        }
    }

    function bindEvents() {
        const form = container.querySelector('#settings-form');
        const providerSelect = container.querySelector('#settings-llm-provider');
        const geminiGroup = container.querySelector('#gemini-key-group');
        const browseBtns = container.querySelectorAll('.btn-browse');

        // Toggle Gemini Key input based on provider
        providerSelect.addEventListener('change', () => {
            if (providerSelect.value === 'gemini') {
                geminiGroup.style.display = '';
            } else {
                geminiGroup.style.display = 'none';
            }
        });

        // Folder browse action
        browseBtns.forEach(btn => {
            btn.addEventListener('click', async () => {
                const targetId = btn.getAttribute('data-target');
                const targetInput = container.querySelector(`#${targetId}`);
                if (!targetInput) return;

                try {
                    const result = await ApiClient.selectDirectory();
                    if (result && result.path) {
                        targetInput.value = result.path;
                    }
                } catch (err) {
                    console.error('Failed to select directory:', err);
                    if (window.Toast) {
                        window.Toast.show(err.message, 'error');
                    }
                }
            });
        });

        // Form Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;

            const recordings_dir = form.querySelector('#settings-recordings-dir').value.trim();
            const transcriptions_dir = form.querySelector('#settings-transcriptions-dir').value.trim();
            const default_model = form.querySelector('#settings-default-model').value;
            const default_language = form.querySelector('#settings-default-language').value;
            const default_task = form.querySelector('#settings-default-task').value;
            const default_temperature = form.querySelector('#settings-default-temperature').value.trim();
            const default_word_timestamps = form.querySelector('#settings-default-word-timestamps').checked;
            const default_condition_on_previous = form.querySelector('#settings-default-condition-on-previous').checked;
            const llm_provider = providerSelect.value;
            const gemini_api_key = form.querySelector('#settings-gemini-api-key').value.trim();



            try {


                // 2. Save backend settings
                const payload = {
                    transcriptions_dir,
                    recordings_dir,
                    default_model,
                    default_language,
                    default_task,
                    default_temperature: default_temperature === '' ? null : parseFloat(default_temperature),
                    default_word_timestamps,
                    default_condition_on_previous,
                    llm_provider,
                    gemini_api_key
                };

                await ApiClient.updateSettings(payload);

                if (window.Toast) {
                    window.Toast.show(i18n.t('settings.successSave'), 'success');
                }

                // 3. Re-render components and trigger updates
                loadSettings();

            } catch (err) {
                console.error('Failed to save settings:', err);
                if (window.Toast) {
                    window.Toast.show(err.message, 'error');
                }
            } finally {
                submitBtn.disabled = false;
            }
        });
    }

    return { init, render: loadSettings };
})();

window.SettingsPageController = SettingsPageController;
