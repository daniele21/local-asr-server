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

    /**
     * Set the active step and update DOM classes.
     * @param {'upload'|'transcribe'|'results'} stepName
     */
    function setStep(stepName) {
        currentStep = stepName;
        const idx = STEPS.indexOf(stepName);

        STEPS.forEach((name, i) => {
            const el = document.getElementById(`step-${name}`);
            if (!el) return;

            el.classList.toggle('step--active', i === idx);
            el.classList.toggle('step--completed', i < idx);
            el.classList.toggle('step--pending', i > idx);
        });

        // Toggle section visibility
        document.querySelectorAll('[data-step]').forEach(section => {
            const sectionStep = section.getAttribute('data-step');
            if (sectionStep === stepName) {
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

    return { setStep, getStep };
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

            // Start collapsed
            body.style.maxHeight = '0px';
            body.classList.add('collapsible--collapsed');
            trigger.setAttribute('aria-expanded', 'false');

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
     * Called once on page load.
     */
    function populate() {
        _populateSelect('model-select', MODELS, '', 'badge');
        _populateSelect('language-select', LANGUAGES, DEFAULTS.language);
        _populateSelect('task-select', TASKS, DEFAULTS.task);
        // Set default checkbox states
        const wordTs = document.getElementById('timestamps-check');
        const condPrev = document.getElementById('condition-check');
        if (wordTs) wordTs.checked = DEFAULTS.wordTimestamps;
        if (condPrev) condPrev.checked = DEFAULTS.conditionOnPreviousText;
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
