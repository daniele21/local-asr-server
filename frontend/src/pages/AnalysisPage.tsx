import { useState, useEffect, useRef } from 'react';
import { ApiClient, Transcription } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { LOCAL_LLM_MODELS } from '../api/config';
import { TourAnalysisResult } from '../features/tour/TourAnalysisResult';

interface AnalysisPageProps {
  detailId: string | null;
  navigateTo: (page: string, detail?: string | null) => void;
  demoMode?: boolean;
}

interface AnalysisResult {
  title?: string;
  summary?: string;
  key_points?: string[] | null;
  action_items?: string[] | null;
  // Allow arbitrary additional fields from different LLM providers
  [key: string]: unknown;
}

export default function AnalysisPage({ detailId, navigateTo: _navigateTo, demoMode = false }: AnalysisPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'history' | 'import'>('history');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [selectedTranscriptionId, setSelectedTranscriptionId] = useState('');
  
  // File Import State
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Settings & Provider State
  const [provider, setProvider] = useState('mock');
  const [apiKey, setApiKey] = useState('');
  const [audioTask, setAudioTask] = useState('analysis');
  const [question, setQuestion] = useState('');
  const [promptType, setPromptType] = useState('summary');
  const [customPrompt, setCustomPrompt] = useState('');
  const [localLlmModel, setLocalLlmModel] = useState('nemotron-nano-4b');
  const [localLlmModelPath, setLocalLlmModelPath] = useState('');

  const DEFAULT_PROMPTS: Record<string, { it: string; en: string }> = {
    summary: {
      it: 'Analizza la seguente trascrizione e genera un titolo breve, un riassunto di 3-4 frasi, i punti chiave principali (almeno 3) e le azioni pratiche da intraprendere.',
      en: 'Analyze the following transcription and generate a short title, a summary of 3-4 sentences, the main key points (at least 3), and actionable items to be taken.'
    },
    minutes: {
      it: 'Genera un verbale di riunione formale basato sulla trascrizione, strutturando i punti chiave e le decisioni in modo formale.',
      en: 'Generate formal meeting minutes based on the transcription, structuring key points and decisions in a formal manner.'
    },
    actions: {
      it: 'Estrai tutti gli "action items" (le attività pratiche da svolgere, i responsabili e le scadenze se menzionate) in modo dettagliato.',
      en: 'Extract all action items (practical tasks, assignees, and deadlines if mentioned) in a detailed manner.'
    },
    custom: {
      it: '',
      en: ''
    }
  };

  useEffect(() => {
    if (promptType !== 'custom') {
      setCustomPrompt(DEFAULT_PROMPTS[promptType]?.[lang === 'it' ? 'it' : 'en'] || '');
    }
  }, [promptType, lang]);

  // Results & Progress State
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [copiedText, setCopiedText] = useState(t('analysis.resultCopy'));

  const loadTranscriptions = async () => {
    try {
      const { items } = await ApiClient.listTranscriptions(1, 100);
      setTranscriptions(items || []);
    } catch {}
  };

  const loadSettings = async () => {
    try {
      const settings = await ApiClient.getSettings();
      setProvider(settings.llm_provider || 'mock');
      setApiKey('');
      setLocalLlmModel(settings.local_llm_model || 'nemotron-nano-4b');
      setLocalLlmModelPath(settings.local_llm_model_path || '');
    } catch {}
  };

  useEffect(() => {
    if (demoMode) return;
    loadTranscriptions();
    loadSettings();
  }, [demoMode]);

  // Preselected transcription from URL/Router Detail
  useEffect(() => {
    if (demoMode) return;
    if (detailId) {
      // Find if we have loaded it
      setSelectedTranscriptionId(detailId);
      
      // Proactively fetch and check if it already has an analysis
      ApiClient.getTranscription(detailId).then((tr) => {
        if (tr.analysis) {
          setAnalysisResult(tr.analysis);
        }
      }).catch(() => {});
    }
  }, [demoMode, detailId, transcriptions]);

  const handleBrowseModel = async () => {
    try {
      const result = await ApiClient.selectFile();
      if (result && result.path) {
        setLocalLlmModelPath(result.path);
        showToast(t('transcription.browseSelectDir'), 'info');
      }
    } catch (err: any) {
      showToast(err.message || t('transcription.browseError'), 'error');
    }
  };

  const handleImportFile = (file: File) => {
    setImportedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleImportFile(e.dataTransfer.files[0]);
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(lang === 'it' ? 'Errore durante la lettura del file.' : 'Error reading file.'));
      reader.readAsText(file);
    });
  };

  const runAnalysis = async () => {
    setLoading(true);
    setAnalysisResult(null);

    try {
      let payload: any = {
        llm_provider: provider,
        gemini_api_key: apiKey.trim(),
      };

      if (provider === 'voxtral_local') {
        payload.audio_task = audioTask;
        if (audioTask === 'qa') {
          payload.question = question;
        }
      } else {
        payload.prompt = customPrompt;
      }

      if (activeTab === 'history') {
        if (!selectedTranscriptionId) {
          throw new Error(t('analysis.selectSourceError'));
        }
        payload.transcription_id = selectedTranscriptionId;
        const selectedTr = transcriptions.find((t) => t.id === selectedTranscriptionId);
        if (selectedTr?.recording_id) {
          payload.recording_id = selectedTr.recording_id;
        }
        setStatusText(t('analysis.preparing'));
      } else {
        if (!importedFile) {
          throw new Error(t('analysis.selectSourceError'));
        }
        const fileName = importedFile.name.toLowerCase();

        if (fileName.endsWith('.txt')) {
          setStatusText(lang === 'it' ? 'Lettura file di testo...' : 'Reading text file...');
          const text = await readFileAsText(importedFile);
          payload.text = text;
        } else if (fileName.endsWith('.json')) {
          setStatusText(lang === 'it' ? 'Lettura file JSON...' : 'Reading JSON file...');
          const text = await readFileAsText(importedFile);
          try {
            const parsed = JSON.parse(text);
            payload.text = parsed.text || parsed.transcript || text;
          } catch {
            payload.text = text;
          }
        } else {
          // It's an audio file, must transcribe it first!
          setStatusText(t('transcription.transcribingStatus'));
          const formData = new FormData();
          formData.append('file', importedFile);
          formData.append('stream', 'false');

          const response = await ApiClient.transcribe(formData);
          const data = await response.json();
          if (!data.text) {
            throw new Error(t('analysis.selectSourceError'));
          }
          payload.text = data.text;
        }
        setStatusText(t('analysis.analyzingStatus'));
      }

      const created = await ApiClient.createAnalysisJob(payload);
      let job = await ApiClient.getJob(created.job_id);
      while (!['completed', 'failed', 'cancelled', 'interrupted'].includes(job.status)) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        job = await ApiClient.getJob(created.job_id);
      }
      if (job.status !== 'completed') {
        throw new Error(job.error || `Analysis job ${job.status}`);
      }
      setAnalysisResult(job.result?.analysis || job.result);

      // Save counts and settings update
      try {
        const currentCount = parseInt(localStorage.getItem('analyses_count') || '0', 10);
        localStorage.setItem('analyses_count', String(currentCount + 1));
      } catch {}

      showToast(t('analysis.successTitle'), 'success');

      // Update provider settings in background
      await ApiClient.updateSettings({
        llm_provider: provider,
        local_llm_model: localLlmModel,
        local_llm_model_path: localLlmModelPath.trim(),
        ...(apiKey.trim() ? { gemini_api_key: apiKey.trim() } : {}),
      });

    } catch (err: any) {
      showToast(`Analisi fallita: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyResults = () => {
    if (!analysisResult) return;
    const keyPoints = (analysisResult.key_points || []).map((kp) => `- ${kp}`).join('\n');
    const actionItems = (analysisResult.action_items || []).map((ai) => `- ${ai}`).join('\n');
    const formatted = `# ${analysisResult.title || ''}\n\n## Riassunto\n${analysisResult.summary || ''}\n\n## Punti Chiave\n${keyPoints}\n\n## Prossimi Passi\n${actionItems}`;

    navigator.clipboard.writeText(formatted).then(() => {
      showToast(t('analysis.copySuccess'), 'success');
      setCopiedText(t('transcription.copied') || 'Copiato!');
      setTimeout(() => setCopiedText(t('analysis.resultCopy')), 2000);
    }).catch(() => {
      showToast(t('analysis.copyError'), 'error');
    });
  };

  const isStartButtonDisabled = () => {
    if (loading) return true;
    if (provider === 'voxtral_local' && audioTask === 'qa' && !question.trim()) return true;
    if (activeTab === 'history') {
      return !selectedTranscriptionId;
    }
    return !importedFile;
  };

  if (demoMode) return <TourAnalysisResult />;

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-border-subtle pb-3">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('analysis.title')}</span>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{t('analysis.panelTitle')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('analysis.panelDesc')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Settings */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Source Select Tab */}
          <Card className="flex flex-col gap-4">
            <div className="flex bg-bg-surface border border-border-subtle rounded-lg p-0.5 gap-1 w-full select-none text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-1.5 rounded-md text-center font-semibold cursor-pointer transition-colors ${
                  activeTab === 'history' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('analysis.historyTab')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('import')}
                className={`flex-1 py-1.5 rounded-md text-center font-semibold cursor-pointer transition-colors ${
                  activeTab === 'import' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('analysis.importTab')}
              </button>
            </div>

            {activeTab === 'history' ? (
              <Select
                label={t('analysis.chooseExisting')}
                value={selectedTranscriptionId}
                onChange={(e) => {
                  setSelectedTranscriptionId(e.target.value);
                  setAnalysisResult(null);
                }}
              >
                <option value="">-- {t('analysis.selectTranscriptionLabel')} --</option>
                {transcriptions.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {new Date(tr.timestamp).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}{' '}
                    - {tr.audio_filename}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex flex-col gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/*,application/json,text/plain"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleImportFile(e.target.files[0]);
                    }
                  }}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                    isDragOver ? 'border-accent bg-accent-glow' : 'border-border-subtle hover:border-accent-hover/40'
                  }`}
                >
                  <span className="text-3xl p-2 bg-accent-glow rounded-full mb-3">📥</span>
                  <strong className="text-xs font-semibold block text-text-primary mb-1">
                    {t('analysis.dropzoneImportTitle')}
                  </strong>
                  <span className="text-[10px] text-text-muted mb-3 block">JSON, TXT, MP3, WAV, WEBM</span>
                  <Button type="button" size="sm" variant="secondary" onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}>
                    {t('analysis.selectFile')}
                  </Button>
                </div>

                {importedFile && (
                  <div className="p-3 bg-bg-surface border border-border-subtle rounded-xl flex items-center justify-between text-xs">
                    <div className="truncate pr-2">
                      <strong className="block truncate text-text-primary">{importedFile.name}</strong>
                      <span className="text-[10px] text-text-muted mt-0.5 block">
                        {(importedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    <button
                      onClick={() => setImportedFile(null)}
                      className="text-text-muted hover:text-text-primary text-base px-1.5 cursor-pointer"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* AI Settings */}
          <Card className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider border-b border-border-subtle pb-2">
              {t('analysis.llmConfig')}
            </h3>

            <div className="flex flex-col gap-4">
              <Select label="Provider LLM" value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="mock">{t('analysis.providerMock')}</option>
                <option value="gemini">{t('analysis.providerGemini')}</option>
                <option value="nemotron_local">{t('analysis.providerNemotron')}</option>
                <option value="voxtral_local">{t('analysis.providerVoxtral')}</option>
              </Select>

              {(provider === 'nemotron_local' || provider === 'voxtral_local') && (
                <div className="flex flex-col gap-4">
                  <Select
                    label={lang === 'it' ? 'Modello LLM locale' : 'Local LLM model'}
                    value={localLlmModel}
                    onChange={(e) => setLocalLlmModel(e.target.value)}
                  >
                    {LOCAL_LLM_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>

                  {localLlmModel === 'custom' && (
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="text-xs font-semibold text-text-secondary">
                        {lang === 'it' ? 'Percorso file .gguf modello' : 'Model .gguf file path'}
                      </label>
                      <div className="flex gap-2 w-full">
                        <Input
                          value={localLlmModelPath}
                          onChange={(e) => setLocalLlmModelPath(e.target.value)}
                          placeholder="/Users/.../models/model.gguf"
                          required
                          className="flex-1"
                        />
                        <Button type="button" variant="secondary" onClick={handleBrowseModel}>
                          {t('settings.btnBrowse')}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {provider === 'gemini' && (
                <Input
                  label={t('settings.apiKeyLabel')}
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              )}

              {provider === 'voxtral_local' && (
                <div className="flex flex-col gap-4">
                  <Select
                    label={lang === 'it' ? 'Task Audio' : 'Audio Task'}
                    value={audioTask}
                    onChange={(e) => setAudioTask(e.target.value)}
                  >
                    <option value="analysis">{lang === 'it' ? 'Analisi completa' : 'Full analysis'}</option>
                    <option value="summary">{lang === 'it' ? 'Riassunto' : 'Summary'}</option>
                    <option value="transcribe">{lang === 'it' ? 'Trascrizione diretta' : 'Direct transcription'}</option>
                    <option value="insights">{lang === 'it' ? 'Insight e azioni' : 'Insights and actions'}</option>
                    <option value="qa">{lang === 'it' ? 'Domanda (Q&A)' : 'Question (Q&A)'}</option>
                  </Select>

                  {audioTask === 'qa' && (
                    <Input
                      label={lang === 'it' ? 'La tua domanda' : 'Your question'}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder={lang === 'it' ? 'Es. Quali sono state le decisioni sul budget?' : 'e.g. What were the decisions on the budget?'}
                      required
                    />
                  )}
                  
                  {activeTab === 'history' && selectedTranscriptionId && !transcriptions.find(t => t.id === selectedTranscriptionId)?.recording_id && (
                    <span className="text-[10px] text-text-muted">
                      {lang === 'it' 
                        ? '⚠️ Questa trascrizione non ha una registrazione audio associata. Verrà usata l\'analisi del testo.'
                        : '⚠️ This transcription has no associated audio recording. Text analysis fallback will be used.'}
                    </span>
                  )}
                  {activeTab === 'import' && (
                    <span className="text-[10px] text-text-muted">
                      {lang === 'it'
                        ? '⚠️ I file importati non supportano l\'analisi audio diretta. Verrà usata l\'analisi del testo.'
                        : '⚠️ Imported files do not support direct audio analysis. Text analysis fallback will be used.'}
                    </span>
                  )}
                </div>
              )}

              {provider !== 'voxtral_local' && (
                <div className="flex flex-col gap-3">
                  <Select
                    label={t('analysis.promptLabel')}
                    value={promptType}
                    onChange={(e) => setPromptType(e.target.value)}
                  >
                    <option value="summary">{t('analysis.promptSummary')}</option>
                    <option value="minutes">{t('analysis.promptMinutes')}</option>
                    <option value="actions">{t('analysis.promptActions')}</option>
                    <option value="custom">{t('analysis.promptCustom')}</option>
                  </Select>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-text-secondary">
                      {lang === 'it' ? 'Istruzioni prompt' : 'Prompt instructions'}
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => {
                        setPromptType('custom');
                        setCustomPrompt(e.target.value);
                      }}
                      placeholder={t('analysis.customPromptPlaceholder')}
                      className="w-full bg-bg-surface border border-border-subtle rounded-xl p-3 text-xs text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y min-h-[100px] leading-relaxed"
                    />
                  </div>
                </div>
              )}

              <Button
                size="lg"
                onClick={runAnalysis}
                disabled={isStartButtonDisabled()}
                isLoading={loading}
                className="w-full mt-2"
              >
                📊 {t('analysis.btnStartAnalysis')}
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Display Panel */}
        <div className="lg:col-span-2">
          {loading ? (
            <Card className="h-96 flex flex-col items-center justify-center text-center gap-4">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
              <strong className="text-sm font-semibold">{t('analysis.analyzingStatus')}</strong>
              <p className="text-xs text-text-secondary">{statusText}</p>
            </Card>
          ) : analysisResult ? (
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center bg-bg-elevated/40 border border-border-subtle rounded-xl px-4 py-3.5">
                <h3 className="text-sm font-bold text-text-primary">
                  {analysisResult.title || t('analysis.resultTitle')}
                </h3>
                <Button size="sm" variant="secondary" onClick={copyResults}>
                  📄 {copiedText}
                </Button>
              </div>

              <Card className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                    {t('analysis.sectionSummary')}
                  </h4>
                  <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                    {analysisResult.summary}
                  </p>
                </div>

                {Array.isArray(analysisResult.key_points) && analysisResult.key_points.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                      {t('analysis.sectionKeyPoints')}
                    </h4>
                    <ul className="list-disc pl-5 text-sm text-text-secondary leading-relaxed flex flex-col gap-1.5">
                      {analysisResult.key_points.map((kp, idx) => (
                        <li key={idx}>{kp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(analysisResult.action_items) && analysisResult.action_items.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                      {t('analysis.sectionActionItems')}
                    </h4>
                    <ul className="list-disc pl-5 text-sm text-text-secondary leading-relaxed flex flex-col gap-1.5">
                      {analysisResult.action_items.map((ai, idx) => (
                        <li key={idx}>{ai}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            </div>
          ) : (
            <Card className="h-96 flex flex-col items-center justify-center text-center p-6 gap-3">
              <span className="text-4xl bg-bg-hover rounded-full p-4">🧠</span>
              <strong className="text-sm font-bold text-text-primary mt-2">{t('analysis.waitingAnalysis')}</strong>
              <p className="text-xs text-text-secondary max-w-sm leading-relaxed">
                {t('analysis.waitingAnalysisDesc')}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
