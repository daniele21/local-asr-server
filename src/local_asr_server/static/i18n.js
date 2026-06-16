/**
 * i18n.js — Internationalization Module for ClosedRoom
 */

const I18N = {
    it: {
        nav: {
            home: 'Dashboard',
            recording: 'Registrazione',
            transcription: 'Trascrizione',
            analysis: 'Analisi',
            settings: 'Impostazioni'
        },
        header: {
            subtitle: 'Trascrizione audio locale e ultrarapida',
            statusOnline: 'Online',
            statusOffline: 'Offline',
            statusConnecting: 'Connessione...'
        },
        dashboard: {
            title: 'Dashboard',
            eyebrow: 'AUDIO INTELLIGENCE LOCALE',
            welcome: 'Benvenuto in ClosedRoom!',
            welcomeBack: 'Bentornato su ClosedRoom!',
            productBody: 'Registra, trascrivi e analizza audio in locale. Parti da una nuova registrazione o continua dal materiale recente.',
            emptyBody: 'Il tuo studio locale per registrare audio, trascriverlo con Whisper e trasformarlo in testo utile.',
            statsRecordings: 'Registrazioni',
            statsTranscriptions: 'Trascrizioni',
            statsAnalyses: 'Analisi AI',
            quickActionsTitle: 'Azioni Rapide',
            quickActionRecord: '🎙️ Nuova Registrazione',
            quickActionTranscribe: '📝 Trascrivi un File',
            quickActionSettings: '⚙️ Apri Impostazioni',
            activityTitle: 'Attività Recente',
            noActivity: 'Nessuna attività registrata.',
            suggestionsTitle: 'Suggerimenti smart',
            untranscribedWarning: 'Hai {count} registrazioni non trascritte.',
            transcribeNow: 'Trascrivile ora →',
            firstStepsTitle: 'Inizia in 3 semplici passi:',
            step1: '1. 🎙️ Registra un meeting o una chiamata locale.',
            step2: '2. 📝 Trascrivi con Whisper AI (100% offline su Apple Silicon).',
            step3: '3. 📊 Analizza il testo per riassunti ed elementi chiave.',
            macOSBarAlertTitle: 'ClosedRoom è anche nella Barra dei Menu!',
            macOSBarAlertBody: 'Cerca l\'icona del microfono 🎙️ nella barra superiore del Mac per avviare registrazioni rapide, trascinare file per trascriverli all\'istante o gestire le hotkey globali.',
            macOSBarAlertTroubleshoot: 'Nota: Assicurati che l\'app sia abilitata in Impostazioni di Sistema ➔ Privacy ➔ Accessibilità per sbloccare queste funzioni.'
        },
        recording: {
            title: 'Registrazione',
            panelTitle: 'Registra una nuova sorgente',
            panelDesc: 'L’audio viene salvato progressivamente e sarà disponibile qui al termine.',
            formTitleLabel: 'Titolo registrazione',
            formTitlePlaceholder: 'Titolo Registrazione',
            statusReady: 'Pronto',
            statusRecording: 'Registrazione in corso...',
            statusPaused: 'In pausa',
            btnStart: 'Avvia Registrazione',
            btnPause: 'Pausa',
            btnResume: 'Riprendi',
            btnStop: 'Interrompi e Salva',
            successTitle: 'Registrazione completata con successo!',
            successBody: 'L\'audio è stato salvato localmente. Ora puoi procedere direttamente alla trascrizione.',
            ctaTranscribe: 'Trascrivi ora ➜',
            recentRecordings: 'Registrazioni recenti'
        },
        transcription: {
            title: 'Trascrizione',
            sourceEyebrow: 'SORGENTE AUDIO',
            sourceHeading: 'Cosa vuoi trascrivere?',
            sourceBody: 'Scegli una registrazione recente oppure importa un audio dal computer.',
            sourceSelector: 'Sorgente audio',
            sourceRecordingsTab: 'Registrazioni',
            sourceFileTab: 'File audio',
            recordingsFolderLabel: 'Cartella registrazioni',
            recordingsFolderAction: 'Modifica in Impostazioni',
            sourceSelectTitle: 'Sorgente audio',
            recentRecordings: 'Registrazioni recenti',
            refreshRecordings: 'Aggiorna',
            noRecentRecordings: 'Nessuna registrazione recente trovata.',
            fileImportTitle: 'Trascrivi un audio',
            fileImportBody: 'Seleziona o trascina un file dal computer.',
            dropzoneTitle: 'Trascina qui un file audio o clicca per sfogliare',
            dropzoneCompactTitle: 'Trascina qui il file',
            dropzoneMax: 'Supporta MP3, WAV, M4A, WEBM ecc.',
            dropzoneMaxShort: 'MP3, WAV, M4A, WEBM, FLAC · Max 25 MB',
            browseAudio: 'Seleziona audio',
            changeSource: 'Cambia sorgente',
            selectedFileLabel: 'File selezionato:',
            transcriptionCardTitle: 'Trascrizione',
            configureTitle: 'Opzioni trascrizione',
            modelLabel: 'Modello Whisper',
            languageLabel: 'Lingua parlata',
            taskLabel: 'Operazione',
            taskTranscribe: 'Trascrivi in testo',
            taskTranslate: 'Traduci in inglese',
            temperatureLabel: 'Temperatura (creatività)',
            wordTimestampsLabel: 'Genera timestamp per singola parola',
            conditionLabel: 'Condiziona su testo precedente',
            advancedOptions: 'Opzioni avanzate',
            audioTrackTitle: 'Traccia audio',
            btnTranscribe: 'Trascrivi',
            btnTranscribeAudio: 'Trascrivi audio',
            transcribingStatus: 'Trascrizione in corso...',
            successTitle: 'Trascrizione completata!',
            successBody: 'La trascrizione è stata salvata localmente nella cartella ClosedRoom. Ora puoi analizzarla con l\'intelligenza artificiale.',
            ctaAnalyze: 'Analizza con AI ➜',
            historyTitle: 'Storico trascrizioni',
            resultTitle: 'Risultato Trascrizione',
            copy: 'Copia',
            statTime: 'Tempo impiegato',
            statLanguage: 'Lingua rilevata',
            statModel: 'Modello',
            tabText: 'Testo Unito',
            tabSegments: 'Segmenti',
            tabRaw: 'JSON Grezzo',
            newTranscription: 'Nuova Trascrizione',
            historyFolderLabel: 'Cartella salvataggio trascrizioni:',
            save: 'Salva',
            previous: 'Precedente',
            next: 'Successiva'
        },
        analysis: {
            title: 'Analisi',
            panelTitle: 'Analisi del Testo',
            panelDesc: 'Genera riassunti, individua temi principali ed estrai action items dalle tue trascrizioni.',
            selectTranscriptionLabel: 'Seleziona una trascrizione da analizzare',
            noTranscriptionsAvailable: 'Nessuna trascrizione disponibile. Trascrivi prima un audio.',
            textPreviewTitle: 'Anteprima testo:',
            optionsTitle: 'Configura analisi AI',
            promptLabel: 'Tipo di analisi / Istruzioni',
            promptSummary: 'Riepilogo generale e Punti chiave',
            promptMinutes: 'Verbale formale del meeting',
            promptActions: 'Action Items (Cose da fare)',
            promptCustom: 'Istruzioni personalizzate...',
            customPromptPlaceholder: 'Es. "Crea un elenco puntato delle decisioni prese..."',
            btnAnalyze: 'Analizza',
            analyzingStatus: 'Analisi in corso con il provider LLM...',
            resultTitle: 'Risultato dell\'Analisi',
            btnCopyMarkdown: 'Copia Markdown',
            btnGoDashboard: 'Vai alla Dashboard',
            successTitle: 'Analisi completata!',
            successBody: 'L\'analisi del testo è pronta. Puoi copiarla come file Markdown per condividerla.'
        },
        settings: {
            title: 'Impostazioni',
            storageTitle: 'Archiviazione',
            recordingsFolderLabel: 'Cartella registrazioni audio',
            transcriptionsFolderLabel: 'Cartella trascrizioni',
            btnBrowse: 'Sfoglia',
            transcriptionDefaultsTitle: 'Trascrizione (Default)',
            transcriptionDefaultsDesc: 'Questi valori saranno usati come default nella schermata di trascrizione. Potrai comunque modificarli al volo per ogni singolo file.',
            aiAnalysisTitle: 'Analisi AI',
            providerLabel: 'Provider LLM',
            apiKeyLabel: 'Gemini API Key',
            apiKeyDesc: 'La API key viene salvata in locale sul tuo Mac.',
            interfaceTitle: 'Interfaccia',
            languageLabel: 'Lingua UI',
            themeLabel: 'Tema',
            themeDark: 'Scuro',
            themeLight: 'Chiaro',
            btnSave: '💾 Salva impostazioni',
            systemInfoTitle: 'Info sistema',
            sysServer: 'Server:',
            sysActiveModel: 'Modello attivo:',
            sysVersion: 'Versione:',
            sysMacosMenu: 'macOS Menu Bar:',
            sysActive: 'Attiva 🎙️',
            sysInactive: 'Non attiva/Accessibilità mancante ⚠️',
            successSave: 'Impostazioni salvate con successo!'
        },
        common: {
            loading: 'Caricamento...',
            error: 'Errore',
            success: 'Successo',
            cancel: 'Annulla',
            delete: 'Elimina',
            confirmDelete: 'Sei sicuro di voler eliminare questo elemento?',
            notAvailable: 'N/D',
            help: 'Aiuto',
            settings: 'Impostazioni',
            theme: 'Cambia tema',
            refresh: 'Aggiorna'
        }
    },
    en: {
        nav: {
            home: 'Dashboard',
            recording: 'Recording',
            transcription: 'Transcription',
            analysis: 'Analysis',
            settings: 'Settings'
        },
        header: {
            subtitle: 'Local and ultra-fast audio transcription',
            statusOnline: 'Online',
            statusOffline: 'Offline',
            statusConnecting: 'Connecting...'
        },
        dashboard: {
            title: 'Dashboard',
            eyebrow: 'LOCAL AUDIO INTELLIGENCE',
            welcome: 'Welcome to ClosedRoom!',
            welcomeBack: 'Welcome back to ClosedRoom!',
            productBody: 'Record, transcribe, and analyze audio locally. Start a new recording or continue from recent material.',
            emptyBody: 'Your local studio for recording audio, transcribing it with Whisper, and turning it into useful text.',
            statsRecordings: 'Recordings',
            statsTranscriptions: 'Transcriptions',
            statsAnalyses: 'AI Analyses',
            quickActionsTitle: 'Quick Actions',
            quickActionRecord: '🎙️ New Recording',
            quickActionTranscribe: '📝 Transcribe Audio',
            quickActionSettings: '⚙️ Open Settings',
            activityTitle: 'Recent Activity',
            noActivity: 'No recent activity.',
            suggestionsTitle: 'Smart Suggestions',
            untranscribedWarning: 'You have {count} untranscribed recordings.',
            transcribeNow: 'Transcribe them now →',
            firstStepsTitle: 'Start in 3 simple steps:',
            step1: '1. 🎙️ Record a local meeting or call.',
            step2: '2. 📝 Transcribe with Whisper AI (100% offline on Apple Silicon).',
            step3: '3. 📊 Analyze the text for summaries and key items.',
            macOSBarAlertTitle: 'ClosedRoom is also in the Menu Bar!',
            macOSBarAlertBody: 'Look for the microphone 🎙️ icon in the Mac top bar to start quick recordings, drag-and-drop audio files for instant transcription, or manage global shortcuts.',
            macOSBarAlertTroubleshoot: 'Note: Ensure the app is enabled in System Settings ➔ Privacy ➔ Accessibility to unlock these features.'
        },
        recording: {
            title: 'Recording',
            panelTitle: 'Record a new source',
            panelDesc: 'Audio is saved progressively and will be available here when finished.',
            formTitleLabel: 'Recording title',
            formTitlePlaceholder: 'Recording Title',
            statusReady: 'Ready',
            statusRecording: 'Recording in progress...',
            statusPaused: 'Paused',
            btnStart: 'Start Recording',
            btnPause: 'Pause',
            btnResume: 'Resume',
            btnStop: 'Stop and Save',
            successTitle: 'Recording completed successfully!',
            successBody: 'The audio has been saved locally. You can now proceed directly to transcription.',
            ctaTranscribe: 'Transcribe now ➜',
            recentRecordings: 'Recent recordings'
        },
        transcription: {
            title: 'Transcription',
            sourceEyebrow: 'AUDIO SOURCE',
            sourceHeading: 'What do you want to transcribe?',
            sourceBody: 'Choose a recent recording or import an audio file from your computer.',
            sourceSelector: 'Audio source',
            sourceRecordingsTab: 'Recordings',
            sourceFileTab: 'Audio file',
            recordingsFolderLabel: 'Recordings folder',
            recordingsFolderAction: 'Change in Settings',
            sourceSelectTitle: 'Audio source',
            recentRecordings: 'Recent recordings',
            refreshRecordings: 'Refresh',
            noRecentRecordings: 'No recent recordings found.',
            fileImportTitle: 'Transcribe audio',
            fileImportBody: 'Select or drag a file from your computer.',
            dropzoneTitle: 'Drag an audio file here or click to browse',
            dropzoneCompactTitle: 'Drop the file here',
            dropzoneMax: 'Supports MP3, WAV, M4A, WEBM etc.',
            dropzoneMaxShort: 'MP3, WAV, M4A, WEBM, FLAC · Max 25 MB',
            browseAudio: 'Select audio',
            changeSource: 'Change source',
            selectedFileLabel: 'Selected file:',
            transcriptionCardTitle: 'Transcription',
            configureTitle: 'Transcription options',
            modelLabel: 'Whisper Model',
            languageLabel: 'Spoken language',
            taskLabel: 'Operation',
            taskTranscribe: 'Transcribe to text',
            taskTranslate: 'Translate to English',
            temperatureLabel: 'Temperature (creativity)',
            wordTimestampsLabel: 'Generate word-level timestamps',
            conditionLabel: 'Condition on previous text',
            advancedOptions: 'Advanced options',
            audioTrackTitle: 'Audio track',
            btnTranscribe: 'Transcribe',
            btnTranscribeAudio: 'Transcribe audio',
            transcribingStatus: 'Transcription in progress...',
            successTitle: 'Transcription completed!',
            successBody: 'The transcript has been saved locally inside the ClosedRoom folder. You can now analyze it with AI.',
            ctaAnalyze: 'Analyze with AI ➜',
            historyTitle: 'Transcription history',
            resultTitle: 'Transcription result',
            copy: 'Copy',
            statTime: 'Elapsed time',
            statLanguage: 'Detected language',
            statModel: 'Model',
            tabText: 'Full text',
            tabSegments: 'Segments',
            tabRaw: 'Raw JSON',
            newTranscription: 'New transcription',
            historyFolderLabel: 'Transcriptions folder:',
            save: 'Save',
            previous: 'Previous',
            next: 'Next'
        },
        analysis: {
            title: 'Analysis',
            panelTitle: 'Text Analysis',
            panelDesc: 'Generate summaries, identify main topics and extract action items from your transcriptions.',
            selectTranscriptionLabel: 'Select a transcription to analyze',
            noTranscriptionsAvailable: 'No transcriptions available. Transcribe an audio file first.',
            textPreviewTitle: 'Text preview:',
            optionsTitle: 'Configure AI analysis',
            promptLabel: 'Analysis type / Instructions',
            promptSummary: 'General summary and Key points',
            promptMinutes: 'Formal meeting minutes',
            promptActions: 'Action Items (To-do list)',
            promptCustom: 'Custom instructions...',
            customPromptPlaceholder: 'e.g. "Create a bulleted list of decisions made..."',
            btnAnalyze: 'Analyze',
            analyzingStatus: 'Analysis in progress with LLM provider...',
            resultTitle: 'Analysis Result',
            btnCopyMarkdown: 'Copy Markdown',
            btnGoDashboard: 'Go to Dashboard',
            successTitle: 'Analysis completed!',
            successBody: 'The text analysis is ready. You can copy it as a Markdown file for sharing.'
        },
        settings: {
            title: 'Settings',
            storageTitle: 'Storage',
            recordingsFolderLabel: 'Audio recordings folder',
            transcriptionsFolderLabel: 'Transcriptions folder',
            btnBrowse: 'Browse',
            transcriptionDefaultsTitle: 'Transcription (Defaults)',
            transcriptionDefaultsDesc: 'These values will be used as defaults in the transcription screen. You can still modify them on the fly for each file.',
            aiAnalysisTitle: 'AI Analysis',
            providerLabel: 'LLM Provider',
            apiKeyLabel: 'Gemini API Key',
            apiKeyDesc: 'The API key is saved locally on your Mac.',
            interfaceTitle: 'Interface',
            languageLabel: 'UI Language',
            themeLabel: 'Theme',
            themeDark: 'Dark',
            themeLight: 'Light',
            btnSave: '💾 Save settings',
            systemInfoTitle: 'System info',
            sysServer: 'Server:',
            sysActiveModel: 'Active model:',
            sysVersion: 'Version:',
            sysMacosMenu: 'macOS Menu Bar:',
            sysActive: 'Active 🎙️',
            sysInactive: 'Inactive/Accessibility permission missing ⚠️',
            successSave: 'Settings saved successfully!'
        },
        common: {
            loading: 'Loading...',
            error: 'Error',
            success: 'Success',
            cancel: 'Cancel',
            delete: 'Delete',
            confirmDelete: 'Are you sure you want to delete this item?',
            notAvailable: 'N/A',
            help: 'Help',
            settings: 'Settings',
            theme: 'Toggle theme',
            refresh: 'Refresh'
        }
    }
};

const i18n = (() => {
    let lang = localStorage.getItem('ui_lang');
    if (!lang) {
        const browserLang = navigator.language || navigator.userLanguage || 'it';
        lang = browserLang.toLowerCase().startsWith('en') ? 'en' : 'it';
        localStorage.setItem('ui_lang', lang);
    }
    if (lang !== 'it' && lang !== 'en') lang = 'it';

    function t(key, replacements = {}) {
        const parts = key.split('.');
        let val = I18N[lang];
        for (const part of parts) {
            if (val && val[part] !== undefined) {
                val = val[part];
            } else {
                return key;
            }
        }
        if (typeof val === 'string') {
            let res = val;
            for (const k in replacements) {
                res = res.replace(`{${k}}`, replacements[k]);
            }
            return res;
        }
        return key;
    }

    function setLang(l) {
        if (l === 'it' || l === 'en') {
            lang = l;
            localStorage.setItem('ui_lang', l);
            applyAll();
            window.dispatchEvent(new CustomEvent('languagechanged', { detail: l }));
        }
    }

    function getLang() {
        return lang;
    }

    function applyAll(root = document) {
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            const translation = t(key);
            el.setAttribute('title', translation);
            el.setAttribute('data-tooltip', translation);
        });
        root.querySelectorAll('[data-i18n-aria]').forEach(el => {
            const key = el.getAttribute('data-i18n-aria');
            el.setAttribute('aria-label', t(key));
        });
        root.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = t(key);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.placeholder !== undefined && key.endsWith('placeholder')) {
                    el.placeholder = translation;
                } else {
                    el.value = translation;
                }
            } else {
                el.textContent = translation;
            }
        });
        document.documentElement.setAttribute('lang', lang);
    }

    return { t, setLang, getLang, applyAll };
})();

window.i18n = i18n;
