import React, { useState, useEffect, useRef } from 'react';
import { ApiClient, Recording, Transcription } from '../api/apiClient';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';
import SourceStep from './transcription/components/SourceStep';
import ConfigureStep from './transcription/components/ConfigureStep';
import ProcessingStep from './transcription/components/ProcessingStep';
import ResultsStep from './transcription/components/ResultsStep';

interface TranscriptionPageProps {
  detailPath: string | null;
  navigateTo: (page: string, detail?: string | null) => void;
}

export default function TranscriptionPage({ detailPath, navigateTo }: TranscriptionPageProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();

  const [projectItemsMap, setProjectItemsMap] = useState<Map<string, { transcription: any; analysis: any }>>(new Map());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
    };
  }, []);

  const togglePlayAudio = (e: React.MouseEvent, recId: string) => {
    e.stopPropagation();
    if (playingAudioId === recId) {
      currentAudioRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
      }
      const audio = new Audio(`/v1/recordings/${recId}/audio`);
      currentAudioRef.current = audio;
      setPlayingAudioId(recId);
      audio.play().catch(() => {
        setPlayingAudioId(null);
      });
      audio.onended = () => {
        setPlayingAudioId(null);
      };
    }
  };

  const handleCardProjectChange = async (recordingId: string, newProjName: string) => {
    if (newProjName === '__NEW_PROJECT__') {
      const promptMsg = lang === 'it' ? 'Inserisci il nome del nuovo progetto:' : 'Enter the new project name:';
      const newName = prompt(promptMsg);
      if (newName && newName.trim()) {
        const trimmed = newName.trim();
        try {
          await ApiClient.updateRecording(recordingId, { project_name: trimmed });
          showToast(t('transcription.projectUpdateSuccess') || 'Progetto aggiornato!', 'success');
          loadRecordings();
        } catch (err: any) {
          showToast(t('transcription.projectUpdateError', { error: err.message }) || 'Errore', 'error');
        }
      }
    } else {
      try {
        await ApiClient.updateRecording(recordingId, { project_name: newProjName });
        showToast(t('transcription.projectUpdateSuccess') || 'Progetto aggiornato!', 'success');
        loadRecordings();
      } catch (err: any) {
        showToast(t('transcription.projectUpdateError', { error: err.message }) || 'Errore', 'error');
      }
    }
  };

  const handleCardTitleChange = async (recordingId: string, newTitle: string) => {
    try {
      await ApiClient.updateRecording(recordingId, { title: newTitle });
      showToast(t('transcription.titleSaveSuccess') || 'Titolo aggiornato!', 'success');
      loadRecordings();
    } catch (err: any) {
      showToast(t('transcription.titleSaveError', { error: err.message }) || 'Errore', 'error');
    }
  };

  const [step, setStep] = useState<'upload' | 'transcribe' | 'results'>('upload');
  const [sourceMode, setSourceMode] = useState<'recordings' | 'file' | 'merge'>('recordings');
  const [isMerging, setIsMerging] = useState(false);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recordingsCountText, setRecordingsCountText] = useState('0 elementi');
  const [recordingsFolder, setRecordingsFolder] = useState('');
  const [projectsList, setProjectsList] = useState<string[]>([]);
  
  // Selection
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [selectedObjectUrl, setSelectedObjectUrl] = useState<string | null>(null);

  // Settings Form
  const [targetLanguage, setTargetLanguage] = useState('');
  const [targetTask, setTargetTask] = useState('transcribe');
  const [targetModel, setTargetModel] = useState('');
  const [temperature, setTemperature] = useState('');
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [conditionOnPrevious, setConditionOnPrevious] = useState(true);
  const [modelCacheStatus, setModelCacheStatus] = useState('Verifica...');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [liveConsoleLines, setLiveConsoleLines] = useState<string[]>([]);
  const [livePreviewText, setLivePreviewText] = useState('');
  const [elapsedTime, setElapsedTime] = useState('0.0s');

  // Results State
  const [transcriptionResult, setTranscriptionResult] = useState<Transcription | null>(null);
  const [resultTab, setResultTab] = useState<'text' | 'segments' | 'raw' | 'analysis'>('text');
  const [copiedText, setCopiedText] = useState(t('transcription.copy'));

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timerIntervalRef = useRef<any>(null);

  const loadRecordings = async () => {
    try {
      const sourceData = await ApiClient.transcriptionSourceData();
      const list = sourceData.recordings || [];
      setRecordings(list);
      setRecordingsCountText(`${list.length} ${list.length === 1 ? 'elemento' : 'elementi'}`);

      const map = new Map<string, { transcription: any; analysis: any }>();
      const projs: string[] = [];
      (sourceData.projects || []).forEach((proj: any) => {
        if (!proj.is_unassigned && proj.name) {
          projs.push(proj.name);
        }
        (proj.items || []).forEach((item: any) => {
          if (item.recording?.id) {
            map.set(item.recording.id, {
              transcription: item.transcription,
              analysis: item.analysis,
            });
          }
        });
      });
      setProjectItemsMap(map);
      setProjectsList(projs);
      
      const settings = sourceData.settings || {};
      setRecordingsFolder(settings.recordings_dir || '-');
      if (!targetModel) setTargetModel(settings.default_model || '');
      if (!targetLanguage) setTargetLanguage(settings.default_language || 'it');
      if (!targetTask) setTargetTask(settings.default_task || 'transcribe');
      setWordTimestamps(settings.default_word_timestamps || false);
      setConditionOnPrevious(settings.default_condition_on_previous !== false);
    } catch {}
  };

  useEffect(() => {
    loadRecordings();
  }, [t]);

  // Check model cache on model select change
  useEffect(() => {
    const checkCache = async () => {
      if (!targetModel) return;
      setModelCacheStatus('Verifica...');
      try {
        const res = await ApiClient.checkModelCache(targetModel);
        if (res.cached) {
          setModelCacheStatus('Modello pronto ✅');
        } else {
          setModelCacheStatus('Richiede download 📥');
        }
      } catch {
        setModelCacheStatus('Errore verifica');
      }
    };
    checkCache();
  }, [targetModel]);

  // Handle URL Preselections (e.g. from Recording detail action)
  useEffect(() => {
    if (detailPath) {
      if (detailPath.startsWith('file-')) {
        const recordingId = detailPath.replace('file-', '');
        // Load recording details and select it
        ApiClient.getRecording(recordingId).then(async (rec: Recording) => {
          setSelectedRecordingId(rec.id);
          // Fetch audio blob
          const blob = await ApiClient.recordingAudio(rec.id);
          const ext = rec.audio_file.split('.').pop() || 'webm';
          const fileObj = new File([blob], `${rec.title}.${ext}`, { type: rec.mime_type || blob.type });
          
          handleSelectAudioFile(fileObj);
        }).catch(() => {});
      } else {
        // It's a transcription ID, load and display results
        ApiClient.getTranscription(detailPath).then((tr) => {
          setTranscriptionResult(tr);
          setStep('results');
          if (tr.analysis) {
            setResultTab('analysis');
          } else {
            setResultTab('text');
          }
        }).catch(() => {});
      }
    }
  }, [detailPath]);

  const handleSelectAudioFile = (file: File) => {
    if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl);
    
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setSelectedObjectUrl(objectUrl);
    
    // Load duration dynamically using a temporary Audio element
    const tempAudio = new Audio(objectUrl);
    tempAudio.addEventListener('loadedmetadata', () => {
      if (!isNaN(tempAudio.duration) && isFinite(tempAudio.duration)) {
        setAudioDuration(tempAudio.duration);
      }
    });

    if (audioRef.current) {
      audioRef.current.src = objectUrl;
    }
    
    setStep('transcribe');
  };

  const selectTranscription = (tr: Transcription) => {
    setTranscriptionResult(tr);
    setStep('results');
    if (tr.analysis) {
      setResultTab('analysis');
    } else {
      setResultTab('text');
    }
    navigateTo('transcription', tr.id);
  };

  const selectRecording = async (recording: Recording) => {
    const status = projectItemsMap.get(recording.id);
    if (status?.transcription?.id) {
      try {
        const tr = await ApiClient.getTranscription(status.transcription.id);
        setTranscriptionResult(tr);
        setStep('results');
        if (tr.analysis) {
          setResultTab('analysis');
        } else {
          setResultTab('text');
        }
        navigateTo('transcription', tr.id);
      } catch (err: any) {
        showToast(`Errore nel caricamento della trascrizione: ${err.message}`, 'error');
      }
      return;
    }

    try {
      setSelectedRecordingId(recording.id);
      let blob: Blob;
      try {
        blob = await ApiClient.recordingAudio(recording.id);
      } catch (audioErr) {
        console.warn('Could not load recording audio, falling back to empty blob:', audioErr);
        blob = new Blob([], { type: recording.mime_type || 'audio/webm' });
      }
      const extension = recording.audio_file.split('.').pop() || 'webm';
      const fileObj = new File(
        [blob],
        `${recording.title}.${extension}`,
        { type: recording.mime_type || blob.type }
      );
      handleSelectAudioFile(fileObj);
    } catch (err: any) {
      showToast(`Impossibile caricare l'audio: ${err.message}`, 'error');
    }
  };

  const handleMergeTranscriptions = async (ids: string[], title: string) => {
    try {
      setIsMerging(true);
      const result = await ApiClient.mergeTranscriptions(ids, title);
      setTranscriptionResult(result);
      setStep('results');
      setResultTab('text');
      showToast(t('transcription.successTitle'), 'success');
      if (result.id) {
        navigateTo('transcription', result.id);
      }
    } catch (err: any) {
      showToast(`Impossibile unire le trascrizioni: ${err.message}`, 'error');
    } finally {
      setIsMerging(false);
    }
  };

  const goToUploadStep = () => {
    setSelectedFile(null);
    setSelectedRecordingId(null);
    setTranscriptionResult(null);
    setAudioDuration(0);
    if (selectedObjectUrl) {
      URL.revokeObjectURL(selectedObjectUrl);
      setSelectedObjectUrl(null);
    }
    setStep('upload');
    navigateTo('transcription');
  };

  // Live Audio Streaming Transcription parser
  const startTranscription = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setLiveConsoleLines([]);
    setLivePreviewText('');
    setProgressPercent(0);
    setProgressStatus(t('transcription.preparing'));

    const timerStart = performance.now();
    setElapsedTime('0.0s');
    timerIntervalRef.current = setInterval(() => {
      const elapsed = ((performance.now() - timerStart) / 1000).toFixed(1);
      setElapsedTime(`${elapsed}s`);
    }, 100);

    abortControllerRef.current = new AbortController();

    try {
      if (selectedRecordingId) {
        setProgressStatus(lang === 'it' ? 'Trascrizione tracce della registrazione...' : 'Transcribing recording tracks...');
        setProgressPercent(10);
        const job = await ApiClient.createTranscriptionJob(selectedRecordingId, {
          model: targetModel || undefined,
          language: targetLanguage || undefined,
          task: targetTask,
          response_format: 'verbose_json',
          word_timestamps: wordTimestamps,
          condition_on_previous_text: conditionOnPrevious,
          temperature: temperature ? Number(temperature) : null,
        });
        let currentJob = job;
        while (!['completed', 'failed', 'cancelled'].includes(currentJob.status)) {
          setProgressPercent(currentJob.progress || 10);
          setProgressStatus(currentJob.current_step || currentJob.status);
          await new Promise((resolve) => setTimeout(resolve, 800));
          currentJob = await ApiClient.getJob(job.id);
        }
        if (currentJob.status !== 'completed' || !currentJob.result) {
          throw new Error(currentJob.error || currentJob.status);
        }
        const result = currentJob.result;
        setProgressPercent(100);
        setTranscriptionResult(result);
        setStep('results');
        setResultTab('text');
        showToast(t('transcription.successTitle'), 'success');
        if (result.saved_id) {
          navigateTo('transcription', result.saved_id);
        }
        return;
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('stream', 'true');
      if (targetModel) formData.append('model', targetModel);
      if (targetLanguage) formData.append('language', targetLanguage);
      formData.append('task', targetTask);
      formData.append('response_format', 'verbose_json');
      formData.append('word_timestamps', String(wordTimestamps));
      formData.append('condition_on_previous_text', String(conditionOnPrevious));
      if (temperature) formData.append('temperature', temperature);

      const duration = audioDuration || audioRef.current?.duration || 0;
      const response = await ApiClient.transcribe(formData);
      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      if (!reader) throw new Error('Streaming response is empty.');

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete last line

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const sanitized = line.replace(/:\s*NaN\b/g, ': null');
            const event = JSON.parse(sanitized);

            if (event.type === 'progress') {
              setProgressStatus(event.message);

              if (event.step === 'downloading' && event.percent !== undefined) {
                setProgressPercent(Math.round(event.percent));
              } else if (event.step === 'transcribing') {
                setLiveConsoleLines((prev) => [...prev, event.message]);
                
                const textMatch = event.message.match(/\]\s*(.*)$/);
                if (textMatch && textMatch[1].trim()) {
                  setLivePreviewText((prev) => prev + (prev ? ' ' : '') + textMatch[1].trim());
                }

                const match = event.message.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\s*-->\s*(\d{2}):(\d{2})\.(\d{2,3})\]/);
                if (match && duration > 0) {
                  const endMin = parseInt(match[4], 10);
                  const endSec = parseInt(match[5], 10);
                  const endMs  = parseInt(match[6], 10);
                  const seconds = (endMin * 60) + endSec + (endMs / (match[6].length === 2 ? 100 : 1000));
                  const percent = Math.min(Math.round((seconds / duration) * 100), 100);
                  setProgressPercent(percent);
                }
              }
            } else if (event.type === 'error') {
              throw new Error(event.message);
            } else if (event.type === 'completed') {
              setProgressPercent(100);
              setTranscriptionResult(event.data);
              setStep('results');
              setResultTab('text');
              showToast(t('transcription.successTitle'), 'success');
              if (event.data.saved_id) {
                navigateTo('transcription', event.data.saved_id);
              }
            }
          } catch (err) {
            console.error('Line parse error:', err, line);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showToast(`${t('transcription.toastTranscriptionError')}: ${err.message}`, 'error');
      }
    } finally {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setIsProcessing(false);
      loadRecordings();
    }
  };

  const copyToClipboard = () => {
    if (!transcriptionResult) return;
    let text = '';
    if (resultTab === 'text') {
      text = transcriptionResult.text || '';
    } else if (resultTab === 'raw') {
      text = JSON.stringify(transcriptionResult, null, 2);
    } else {
      text = (transcriptionResult.segments || []).map((s) => s.text).join('\n');
    }

    navigator.clipboard.writeText(text).then(() => {
      showToast(t('transcription.toastFileCopied'), 'success');
      setCopiedText(t('transcription.copied') || 'Copiato!');
      setTimeout(() => setCopiedText(t('transcription.copy')), 2000);
    }).catch(() => {
      showToast(t('transcription.copyFailed'), 'error');
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Stepper progress indicator */}
      <nav className="flex items-center justify-center p-2 select-none border border-border-subtle bg-bg-elevated/20 rounded-full max-w-xl mx-auto w-full">
        <button
          onClick={() => step !== 'upload' && setStep('upload')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${
            step === 'upload' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary cursor-pointer'
          }`}
        >
          <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px]">1</span>
          <span>Sorgente</span>
        </button>
        <div className="w-8 h-[2px] bg-border-subtle mx-2"></div>
        <button
          onClick={() => step === 'results' && setStep('transcribe')}
          disabled={!selectedFile}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${
            step === 'transcribe' ? 'bg-accent text-white' : 'text-text-muted hover:text-text-secondary disabled:pointer-events-none'
          }`}
        >
          <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px]">2</span>
          <span>Configura</span>
        </button>
        <div className="w-8 h-[2px] bg-border-subtle mx-2"></div>
        <button
          disabled={!transcriptionResult}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold ${
            step === 'results' ? 'bg-accent text-white' : 'text-text-muted disabled:pointer-events-none'
          }`}
        >
          <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px]">3</span>
          <span>Risultato</span>
        </button>
      </nav>

      {/* Steps contents rendering */}
      {step === 'upload' && (
        <SourceStep
          sourceMode={sourceMode}
          setSourceMode={setSourceMode}
          recordings={recordings}
          recordingsCountText={recordingsCountText}
          recordingsFolder={recordingsFolder}
          projectItemsMap={projectItemsMap}
          projectsList={projectsList}
          playingAudioId={playingAudioId}
          togglePlayAudio={togglePlayAudio}
          handleCardProjectChange={handleCardProjectChange}
          handleCardTitleChange={handleCardTitleChange}
          selectRecording={selectRecording}
          handleSelectAudioFile={handleSelectAudioFile}
          fileInputRef={fileInputRef}
          onMerge={handleMergeTranscriptions}
          isMerging={isMerging}
          onSelectTranscription={selectTranscription}
        />
      )}

      {step === 'transcribe' && !isProcessing && (
        <ConfigureStep
          selectedFile={selectedFile}
          isProcessing={isProcessing}
          goToUploadStep={goToUploadStep}
          targetLanguage={targetLanguage}
          setTargetLanguage={setTargetLanguage}
          targetTask={targetTask}
          setTargetTask={setTargetTask}
          targetModel={targetModel}
          setTargetModel={setTargetModel}
          modelCacheStatus={modelCacheStatus}
          temperature={temperature}
          setTemperature={setTemperature}
          wordTimestamps={wordTimestamps}
          setWordTimestamps={setWordTimestamps}
          conditionOnPrevious={conditionOnPrevious}
          setConditionOnPrevious={setConditionOnPrevious}
          audioRef={audioRef}
          startTranscription={startTranscription}
        />
      )}

      {step === 'transcribe' && isProcessing && (
        <ProcessingStep
          progressStatus={progressStatus}
          progressPercent={progressPercent}
          livePreviewText={livePreviewText}
          liveConsoleLines={liveConsoleLines}
          elapsedTime={elapsedTime}
        />
      )}

      {step === 'results' && transcriptionResult && (
        <ResultsStep
          transcriptionResult={transcriptionResult}
          copiedText={copiedText}
          goToUploadStep={goToUploadStep}
          copyToClipboard={copyToClipboard}
          resultTab={resultTab}
          setResultTab={setResultTab}
          navigateTo={navigateTo}
        />
      )}
    </div>
  );
}
