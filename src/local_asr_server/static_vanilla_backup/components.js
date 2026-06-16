/**
 * components.js — Reusable UI Components for ASR Whisper Studio
 *
 * Provides self-contained, configurable components that the main app.js
 * orchestrator uses. Each component encapsulates its own DOM manipulation
 * and event handling.
 */

/* ═══════════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATION SYSTEM
   Non-blocking notifications that slide in from top-right.
   ═══════════════════════════════════════════════════════════════════════════════ */

const Toast = (() => {
    /** @type {HTMLElement|null} */
    let container = null;

    /** Ensure the toast container exists in the DOM */
    function _ensureContainer() {
        if (container) return;
        container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
    }

    /**
     * Show a toast notification.
     * @param {string}  message  - Text to display
     * @param {'success'|'error'|'info'|'warning'} [type='info'] - Visual style
     * @param {number}  [duration] - Auto-dismiss in ms (defaults to config)
     */
    function show(message, type = 'info', duration = TOAST_DURATION_MS) {
        _ensureContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.setAttribute('role', 'alert');

        // Icon per type
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
            error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        };

        toast.innerHTML = `
            <span class="toast__icon">${icons[type] || icons.info}</span>
            <span class="toast__message">${message}</span>
            <button class="toast__close" aria-label="Chiudi">&times;</button>
        `;

        // Close on click
        toast.querySelector('.toast__close').addEventListener('click', () => _dismiss(toast));

        container.appendChild(toast);

        // Trigger enter animation (requestAnimationFrame ensures CSS transition fires)
        requestAnimationFrame(() => toast.classList.add('toast--visible'));

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => _dismiss(toast), duration);
        }
    }

    /** Animate out and remove a toast element */
    function _dismiss(toast) {
        toast.classList.remove('toast--visible');
        toast.classList.add('toast--exit');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Fallback in case transitionend doesn't fire
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 500);
    }

    return { show };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   STEP INDICATOR
   Visual 3-step progress bar: Upload → Transcribe → Results
   ═══════════════════════════════════════════════════════════════════════════════ */

const StepIndicator = (() => {
    const STEPS = ['upload', 'transcribe', 'results'];
    let currentStep = 'upload';
    let maxReachableIndex = 0;

    /**
     * Set the active step and update DOM classes.
     * @param {'upload'|'transcribe'|'results'} stepName
     */
    function setStep(stepName) {
        currentStep = stepName;
        const idx = STEPS.indexOf(stepName);
        maxReachableIndex = Math.max(maxReachableIndex, idx);

        STEPS.forEach((name, i) => {
            const el = document.getElementById(`step-${name}`);
            if (!el) return;

            el.classList.toggle('step--active', i === idx);
            el.classList.toggle('step--completed', i < idx);
            el.classList.toggle('step--pending', i > idx);
            el.classList.toggle('stepper__step--clickable', i <= maxReachableIndex);
            el.classList.toggle('stepper__step--locked', i > maxReachableIndex);
            el.setAttribute('aria-disabled', String(i > maxReachableIndex));
        });

        // Toggle section visibility
        document.querySelectorAll('[data-step]').forEach(section => {
            const sectionStep = section.getAttribute('data-step') || '';
            const allowedSteps = sectionStep.split(',').map(s => s.trim());
            if (allowedSteps.includes(stepName)) {
                section.classList.add('section--active');
                section.classList.remove('section--hidden');
            } else {
                section.classList.remove('section--active');
                section.classList.add('section--hidden');
            }
        });
    }

    /** @returns {'upload'|'transcribe'|'results'} */
    function getStep() {
        return currentStep;
    }

    function canGoTo(stepName) {
        const idx = STEPS.indexOf(stepName);
        return idx >= 0 && idx <= maxReachableIndex;
    }

    function reset(stepName = 'upload') {
        maxReachableIndex = STEPS.indexOf(stepName);
        setStep(stepName);
    }

    return { setStep, getStep, canGoTo, reset };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   COLLAPSIBLE PANEL
   Handles expand/collapse with smooth height animation.
   ═══════════════════════════════════════════════════════════════════════════════ */

const CollapsiblePanel = (() => {
    /**
     * Initialise all collapsible panels on the page.
     * Expects markup: [data-collapsible-trigger] and [data-collapsible-body]
     */
    function init() {
        document.querySelectorAll('[data-collapsible-trigger]').forEach(trigger => {
            const targetId = trigger.getAttribute('data-collapsible-trigger');
            const body = document.getElementById(targetId);
            if (!body) return;

            // Respect initial state from HTML
            const isInitiallyExpanded = trigger.getAttribute('aria-expanded') === 'true' || 
                                        trigger.closest('.collapsible')?.classList.contains('collapsible--expanded');

            if (isInitiallyExpanded) {
                body.style.maxHeight = 'none';
                body.classList.remove('collapsible--collapsed');
                trigger.classList.add('collapsible-trigger--open');
                trigger.setAttribute('aria-expanded', 'true');
            } else {
                body.style.maxHeight = '0px';
                body.classList.add('collapsible--collapsed');
                trigger.setAttribute('aria-expanded', 'false');
            }

            trigger.addEventListener('click', () => toggle(trigger, body));
        });
    }

    /**
     * Toggle a collapsible panel.
     * @param {HTMLElement} trigger
     * @param {HTMLElement} body
     */
    function toggle(trigger, body) {
        const isCollapsed = body.classList.contains('collapsible--collapsed');

        if (isCollapsed) {
            body.classList.remove('collapsible--collapsed');
            body.style.maxHeight = body.scrollHeight + 'px';
            trigger.classList.add('collapsible-trigger--open');
            trigger.setAttribute('aria-expanded', 'true');

            const onTransitionEnd = (e) => {
                if (e.propertyName === 'max-height') {
                    body.style.maxHeight = 'none';
                    body.removeEventListener('transitionend', onTransitionEnd);
                }
            };
            body.addEventListener('transitionend', onTransitionEnd);
        } else {
            // Reset to scrollHeight first so transition to 0px works from a numeric value
            body.style.maxHeight = body.scrollHeight + 'px';
            // Force reflow
            body.offsetHeight;
            requestAnimationFrame(() => {
                body.style.maxHeight = '0px';
                body.classList.add('collapsible--collapsed');
                trigger.classList.remove('collapsible-trigger--open');
                trigger.setAttribute('aria-expanded', 'false');
            });
        }
    }

    return { init };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   FILE DROPZONE
   Encapsulates drag-and-drop + browse file selection logic.
   ═══════════════════════════════════════════════════════════════════════════════ */

const FileDropzone = (() => {
    let _onFileSelected = null;

    /**
     * Initialise the dropzone with callbacks.
     * @param {Object}   opts
     * @param {Function} opts.onFileSelected - Called with the selected File object
     */
    function init({ onFileSelected }) {
        _onFileSelected = onFileSelected;

        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('file-input');
        const browseBtn = document.getElementById('browse-btn');

        if (!dropzone || !fileInput || !browseBtn) return;

        // Drag events
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
            if (files.length > 0) _validateAndSelect(files[0]);
        });

        // Browse button
        browseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                _validateAndSelect(fileInput.files[0]);
            }
        });
    }

    /** Validate file type and invoke callback */
    function _validateAndSelect(file) {
        const isValidType = file.type.startsWith(ACCEPTED_MIME_PREFIX) || ACCEPTED_EXTENSIONS.test(file.name);
        if (!isValidType) {
            Toast.show(LABELS.toastFileInvalid, 'error');
            return;
        }
        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            Toast.show(`Il file supera il limite di ${MAX_FILE_SIZE_MB} MB.`, 'error');
            return;
        }
        if (_onFileSelected) _onFileSelected(file);
    }

    /** Reset the file input */
    function reset() {
        const fileInput = document.getElementById('file-input');
        if (fileInput) fileInput.value = '';
    }

    return { init, reset };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   SETTINGS FORM BUILDER
   Dynamically populates select elements from config arrays.
   ═══════════════════════════════════════════════════════════════════════════════ */

const SettingsForm = (() => {
    /**
     * Populate all select elements from config data.
     * Called once on page load or when settings are updated.
     * @param {Object} [settings] - Optional backend settings object
     */
    function populate(settings = null) {
        const defaults = settings || {};

        // Resolve setting values from backend payload or config defaults
        const modelVal = defaults.default_model !== undefined ? defaults.default_model : (DEFAULTS.model || '');
        const langVal = defaults.default_language !== undefined ? defaults.default_language : (DEFAULTS.language || 'it');
        const taskVal = defaults.default_task !== undefined ? defaults.default_task : (DEFAULTS.task || 'transcribe');

        const localizedModels = MODELS.map(item => item.value === ''
            ? { ...item, label: i18n.getLang() === 'it' ? 'Predefinito del server' : 'Server default' }
            : item
        );
        const localizedLanguages = LANGUAGES.map(item => {
            const labels = {
                it: { it: 'Italiano', en: 'Inglese', es: 'Spagnolo', fr: 'Francese', de: 'Tedesco', '': 'Rilevamento automatico' },
                en: { it: 'Italian', en: 'English', es: 'Spanish', fr: 'French', de: 'German', '': 'Auto-detect' },
            };
            return { ...item, label: labels[i18n.getLang()][item.value] || item.label };
        });
        const localizedTasks = TASKS.map(item => {
            const labels = {
                it: { transcribe: 'Trascrizione', translate: 'Traduzione in inglese' },
                en: { transcribe: 'Transcription', translate: 'Translate to English' },
            };
            return { ...item, label: labels[i18n.getLang()][item.value] || item.label };
        });

        _populateSelect('model-select', localizedModels, modelVal, 'badge');
        _populateSelect('language-select', localizedLanguages, langVal);
        _populateSelect('task-select', localizedTasks, taskVal);

        // Set checkbox states
        const wordTs = document.getElementById('timestamps-check');
        const condPrev = document.getElementById('condition-check');

        const wordTsVal = defaults.default_word_timestamps !== undefined ? defaults.default_word_timestamps : (DEFAULTS.wordTimestamps || false);
        const condPrevVal = defaults.default_condition_on_previous !== undefined ? defaults.default_condition_on_previous : (DEFAULTS.conditionOnPreviousText || false);

        if (wordTs) wordTs.checked = wordTsVal;
        if (condPrev) condPrev.checked = condPrevVal;

        // Set temperature if available
        const tempInput = document.getElementById('temperature-input');
        if (tempInput) {
            const tempVal = defaults.default_temperature !== undefined ? defaults.default_temperature : (DEFAULTS.temperature !== undefined ? DEFAULTS.temperature : '');
            tempInput.value = tempVal !== null && tempVal !== undefined ? tempVal : '';
        }
    }

    /**
     * Populate a <select> from an array of {value, label} objects.
     * @param {string} selectId
     * @param {Array}  items
     * @param {string} [defaultValue]
     * @param {string} [badgeField]  - optional field name for badge text
     */
    function _populateSelect(selectId, items, defaultValue, badgeField) {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '';

        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.value;
            let label = item.label;
            if (badgeField && item[badgeField]) {
                label += ` (${item[badgeField]})`;
            }
            opt.textContent = label;
            if (item.value === defaultValue) opt.selected = true;
            select.appendChild(opt);
        });
    }

    /**
     * Collect current form values into a FormData-ready object.
     * @returns {Object} key-value pairs of form parameters
     */
    function getValues() {
        const form = document.getElementById('transcribe-form');
        if (!form) return {};

        const elements = form.elements;
        return {
            model: elements.model?.value || '',
            language: elements.language?.value || '',
            task: elements.task?.value || DEFAULTS.task,
            word_timestamps: elements.word_timestamps?.checked ? 'true' : 'false',
            condition_on_previous_text: elements.condition_on_previous_text?.checked ? 'true' : 'false',
            temperature: elements.temperature?.value || '',
        };
    }

    return { populate, getValues };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════════════ */

const Utils = (() => {
    /**
     * Format byte count to human-readable string.
     * @param {number} bytes
     * @param {number} [decimals=2]
     * @returns {string}
     */
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = Math.max(0, decimals);
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     * Format seconds to MM:SS.ms display.
     * @param {number} seconds
     * @returns {string}
     */
    function formatTime(seconds) {
        if (isNaN(seconds)) return '00:00.00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }

    return { formatBytes, formatTime };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   NEW UX COMPONENTS (Dashboard, Settings, Navigation Success states)
   ═══════════════════════════════════════════════════════════════════════════════ */

const SuccessCard = (() => {
    /**
     * Render a success card with CTAs
     * @param {Object} opts
     * @param {string} opts.title
     * @param {string} opts.body
     * @param {Array<{label: string, action: string|function, primary: boolean}>} opts.ctas
     */
    function render(opts) {
        // Generate CTA buttons
        const buttonsHtml = opts.ctas.map((cta, index) => {
            const btnClass = cta.primary ? 'btn--primary' : 'btn--secondary';
            return `<button type="button" class="btn ${btnClass} cta-btn-${index}">${cta.label}</button>`;
        }).join('');

        const card = document.createElement('div');
        card.className = 'success-card card anim-scale-up';
        card.innerHTML = `
            <div class="success-card__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
            </div>
            <div class="success-card__content">
                <h4>${opts.title}</h4>
                <p>${opts.body}</p>
            </div>
            <div class="success-card__actions">
                ${buttonsHtml}
            </div>
        `;

        // Bind CTA actions
        opts.ctas.forEach((cta, index) => {
            const btn = card.querySelector(`.cta-btn-${index}`);
            if (!btn) return;
            btn.addEventListener('click', () => {
                if (typeof cta.action === 'function') {
                    cta.action();
                } else if (typeof cta.action === 'string') {
                    if (window.App && typeof window.App.switchPage === 'function') {
                        window.App.switchPage(cta.action);
                    }
                }
            });
        });

        return card;
    }

    return { render };
})();

const EmptyState = (() => {
    /**
     * Render an empty state view
     * @param {Object} opts
     * @param {string} opts.icon
     * @param {string} opts.title
     * @param {string} opts.body
     * @param {Object} [opts.cta]
     * @param {string} opts.cta.label
     * @param {string|function} opts.cta.action
     */
    function render(opts) {
        let ctaHtml = '';
        if (opts.cta) {
            ctaHtml = `<button type="button" class="btn btn--primary btn-empty-action">${opts.cta.label}</button>`;
        }

        const div = document.createElement('div');
        div.className = 'empty-state-container';
        div.innerHTML = `
            <div class="empty-state">
                <div class="empty-state__icon">${opts.icon}</div>
                <h3 class="empty-state__title">${opts.title}</h3>
                <p class="empty-state__body">${opts.body}</p>
                ${ctaHtml}
            </div>
        `;

        if (opts.cta) {
            const btn = div.querySelector('.btn-empty-action');
            if (btn) {
                btn.addEventListener('click', () => {
                    if (typeof opts.cta.action === 'function') {
                        opts.cta.action();
                    } else if (typeof opts.cta.action === 'string') {
                        if (window.App && typeof window.App.switchPage === 'function') {
                            window.App.switchPage(opts.cta.action);
                        }
                    }
                });
            }
        }

        return div;
    }

    return { render };
})();

const StatsCard = (() => {
    /**
     * Render a stats card
     * @param {string} label
     * @param {number|string} value
     * @param {string} icon
     */
    function render(label, value, icon) {
        return `
            <div class="stats-card card">
                <div class="stats-card__header">
                    <span class="stats-card__label">${label}</span>
                    <span class="stats-card__icon">${icon}</span>
                </div>
                <span class="stats-card__value">${value}</span>
            </div>
        `;
    }

    return { render };
})();

const ActivityItem = (() => {
    /**
     * Render an activity item inside dashboard feed
     * @param {Object} item
     */
    function render(item) {
        const formattedDate = item.date.toLocaleDateString(i18n.getLang() === 'it' ? 'it-IT' : 'en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        if (item.type === 'recording') {
            return `
                <div class="activity-item activity-item--recording">
                    <div class="activity-item__icon">🎙️</div>
                    <div class="activity-item__details">
                        <span class="activity-item__title">${item.title}</span>
                        <span class="activity-item__meta">${formattedDate} &middot; ${item.status}</span>
                    </div>
                    <div class="activity-item__actions">
                        <button type="button" class="btn btn--secondary btn--sm" onclick="DashboardController.handleRecordingClick('${item.id}')">
                            ${i18n.t('recording.ctaTranscribe')}
                        </button>
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="activity-item activity-item--transcription">
                    <div class="activity-item__icon">📝</div>
                    <div class="activity-item__details">
                        <span class="activity-item__title">${item.title}</span>
                        <span class="activity-item__meta">${formattedDate}</span>
                    </div>
                    <div class="activity-item__actions">
                        <button type="button" class="btn btn--secondary btn--sm" onclick="DashboardController.handleTranscriptionClick('${item.id}')">
                            ${i18n.t('transcription.ctaAnalyze')}
                        </button>
                    </div>
                </div>
            `;
        }
    }

    return { render };
})();

const SuggestionBanner = (() => {
    /**
     * Render a suggestion banner
     * @param {string} message
     * @param {string} ctaText
     * @param {function} ctaAction
     */
    function render(message, ctaText, ctaAction) {
        return `
            <div class="suggestion-banner card">
                <div class="suggestion-banner__body">
                    <span class="suggestion-banner__icon">💡</span>
                    <span class="suggestion-banner__msg">${message}</span>
                </div>
                <button type="button" class="btn btn--primary btn--sm suggestion-banner__btn">${ctaText}</button>
            </div>
        `;
    }

    return { render };
})();


/* ═══════════════════════════════════════════════════════════════════════════════
   PROJECT SELECTOR
   Centralized component to select or create a project.
   ═══════════════════════════════════════════════════════════════════════════════ */

const ProjectSelector = (() => {
    /**
     * Render a centralized project selection dropdown.
     * @param {Object} opts
     * @param {Object} [opts.recording] - The recording object (optional, for edit mode)
     * @param {string} [opts.initialValue] - Initial project value (optional, for draft mode)
     * @param {Array} opts.projectsList - All projects
     * @param {string} [opts.theme='transparent'] - Visual theme: 'transparent' or 'standard'
     * @param {Function} opts.onChange - Callback when project changes (can return promise)
     */
    function render(opts) {
        const { recording, initialValue, projectsList, theme = 'transparent', onChange } = opts;
        const isEditMode = !!recording;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'project-selector-wrapper';
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '4px';
        if (theme === 'standard') {
            wrapper.style.width = '100%';
        }

        const projectIcon = document.createElement('span');
        projectIcon.className = 'project-icon';
        projectIcon.innerHTML = '📁';
        projectIcon.style.fontSize = '0.9rem';
        if (theme === 'standard') {
            projectIcon.style.display = 'none'; // Hide folder icon for standard input group
        }

        const select = document.createElement('select');
        if (theme === 'standard') {
            select.id = 'recording-project';
            select.style.cursor = 'pointer';
        } else {
            select.className = 'project-select-dropdown-transparent';
            
            // Style override to make it transparent, borderless, with no background
            select.style.background = 'transparent';
            select.style.border = 'none';
            select.style.outline = 'none';
            select.style.boxShadow = 'none';
            select.style.padding = '0';
            select.style.margin = '0';
            select.style.fontSize = '0.8rem';
            select.style.color = 'var(--text-muted)';
            select.style.fontWeight = '600';
            select.style.cursor = 'pointer';
            select.style.width = 'auto';
            select.style.maxWidth = '180px';
            select.style.webkitAppearance = 'menulist';
        }

        let currentProject = isEditMode ? (recording.project_name || '') : (initialValue || '');

        function populateOptions(list) {
            select.innerHTML = '';
            
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = i18n.t('projects.noProject') || 'Senza progetto';
            select.appendChild(defaultOption);

            const filteredProjects = list.filter(p => !p.is_unassigned);
            filteredProjects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.textContent = p.name;
                select.appendChild(opt);
            });

            const newProjectOpt = document.createElement('option');
            newProjectOpt.value = '__NEW_PROJECT__';
            newProjectOpt.textContent = `+ ${i18n.getLang() === 'it' ? 'Nuovo progetto...' : 'New project...'}`;
            select.appendChild(newProjectOpt);

            if (currentProject && !filteredProjects.some(p => p.name === currentProject)) {
                const customOpt = document.createElement('option');
                customOpt.value = currentProject;
                customOpt.textContent = currentProject;
                select.insertBefore(customOpt, newProjectOpt);
            }
            select.value = currentProject;
        }

        populateOptions(projectsList);

        select.addEventListener('change', async () => {
            const selectedValue = select.value;
            if (selectedValue === '__NEW_PROJECT__') {
                const promptMsg = i18n.getLang() === 'it' 
                    ? 'Inserisci il nome del nuovo progetto:' 
                    : 'Enter the new project name:';
                const newProjName = prompt(promptMsg);
                if (newProjName && newProjName.trim()) {
                    const trimmedName = newProjName.trim();
                    
                    currentProject = trimmedName;
                    populateOptions(projectsList); // Redraw options to include the new local option
                    select.value = trimmedName;

                    if (isEditMode) {
                        select.disabled = true;
                        try {
                            await ApiClient.updateRecording(recording.id, { project_name: trimmedName });
                            recording.project_name = trimmedName;
                            Toast.show(i18n.t('transcription.projectUpdateSuccess'), 'success');
                            if (onChange) {
                                await onChange(trimmedName);
                            }
                        } catch (err) {
                            Toast.show(i18n.t('transcription.projectUpdateError', { error: err.message }), 'error');
                            select.value = recording.project_name || '';
                            currentProject = recording.project_name || '';
                        } finally {
                            select.disabled = false;
                        }
                    } else {
                        if (onChange) {
                            onChange(trimmedName);
                        }
                    }
                } else {
                    select.value = currentProject;
                }
            } else {
                currentProject = selectedValue;
                if (isEditMode) {
                    select.disabled = true;
                    try {
                        await ApiClient.updateRecording(recording.id, { project_name: selectedValue });
                        recording.project_name = selectedValue;
                        Toast.show(i18n.t('transcription.projectUpdateSuccess'), 'success');
                        if (onChange) {
                            await onChange(selectedValue);
                        }
                    } catch (err) {
                        Toast.show(i18n.t('transcription.projectUpdateError', { error: err.message }), 'error');
                        select.value = recording.project_name || '';
                        currentProject = recording.project_name || '';
                    } finally {
                        select.disabled = false;
                    }
                } else {
                    if (onChange) {
                        onChange(selectedValue);
                    }
                }
            }
        });

        wrapper.append(projectIcon, select);
        
        wrapper.getValue = () => select.value;
        wrapper.setValue = (val) => {
            select.value = val;
            currentProject = val;
        };
        wrapper.updateProjects = (newProjectsList) => {
            populateOptions(newProjectsList);
        };
        wrapper.selectElement = select;

        return wrapper;
    }

    return { render };
})();

