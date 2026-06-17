import { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ApiClient, Transcription, TranscriptionSegment } from '../../../api/apiClient';
import { useTranslation } from '../../../i18n/i18n';
import { formatTime } from '../../../utils/formatters';
import { useToast } from '../../../context/ToastContext';

interface ResultsStepProps {
  transcriptionResult: Transcription;
  copiedText: string;
  goToUploadStep: () => void;
  copyToClipboard: () => void;
  resultTab: 'text' | 'segments' | 'raw' | 'analysis';
  setResultTab: (tab: 'text' | 'segments' | 'raw' | 'analysis') => void;
  navigateTo: (page: string, detail?: string | null) => void;
}

export default function ResultsStep({
  transcriptionResult,
  copiedText,
  goToUploadStep,
  copyToClipboard,
  resultTab,
  setResultTab,
  navigateTo,
}: ResultsStepProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();
  const [isSplitting, setIsSplitting] = useState(false);

  const handleSplit = async () => {
    const confirmMsg = lang === 'it' 
      ? 'Sei sicuro di voler dividere questa trascrizione unita? Verranno ripristinate le trascrizioni originali e questa verrà eliminata.' 
      : 'Are you sure you want to split this merged transcription? The original transcripts will be restored and this one will be deleted.';
      
    if (!confirm(confirmMsg)) return;

    try {
      setIsSplitting(true);
      await ApiClient.splitTranscription(transcriptionResult.id);
      showToast(
        lang === 'it' 
          ? 'Trascrizione divisa con successo! Trascrizioni originali ripristinate.' 
          : 'Transcription split successfully! Original transcripts restored.', 
        'success'
      );
      goToUploadStep();
    } catch (err: any) {
      showToast(`Errore durante la divisione: ${err.message}`, 'error');
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-150">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-3 gap-3">
        <div>
          <span className="text-xs font-bold text-accent tracking-widest uppercase">
            {t('transcription.resultTitle')}
          </span>
          <h2 className="text-xl font-bold text-text-primary mt-1">
            {transcriptionResult.audio_filename}
          </h2>
        </div>
        <div className="flex gap-2">
          {transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0 && (
            <Button variant="danger" onClick={handleSplit} isLoading={isSplitting} disabled={isSplitting}>
              ✂️ {lang === 'it' ? 'Dividi' : 'Split'}
            </Button>
          )}
          <Button variant="secondary" onClick={goToUploadStep} disabled={isSplitting}>
            🔄 {t('transcription.newTranscription')}
          </Button>
          <Button onClick={copyToClipboard} disabled={isSplitting}>
            📄 {copiedText}
          </Button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statTime')}
          </span>
          <strong className="text-sm font-semibold text-text-primary">
            {transcriptionResult.stats?.time_total_seconds
              ? `${transcriptionResult.stats.time_total_seconds.toFixed(2)}s`
              : 'N/A'}
          </strong>
        </Card>
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statLanguage')}
          </span>
          <strong className="text-sm font-semibold text-text-primary uppercase">
            {transcriptionResult.language}
          </strong>
        </Card>
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statModel')}
          </span>
          <strong className="text-sm font-semibold text-text-primary truncate">
            {transcriptionResult.model ? transcriptionResult.model.split('/').pop() : 'Default'}
          </strong>
        </Card>
      </div>

      {/* Audio Player for Results */}
      {transcriptionResult.recording_id && !transcriptionResult.merged_sources && (
        <Card className="flex flex-col gap-2 p-4 mt-2">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">
            {t('transcription.audioTrackTitle') || 'Traccia Audio'}
          </span>
          <audio
            controls
            src={`/v1/recordings/${transcriptionResult.recording_id}/audio`}
            className="w-full mt-1"
          />
        </Card>
      )}

      {/* Merged Sources Players */}
      {transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0 && (
        <Card className="flex flex-col gap-3.5 p-4 mt-2">
          <div className="border-b border-border-subtle pb-2">
            <span className="text-[10px] text-accent font-bold uppercase tracking-wider">
              {t('transcription.mergeTrackTitle') || 'Tracce Audio Unite'}
            </span>
            <p className="text-[10px] text-text-muted mt-0.5">
              {t('transcription.mergeTrackDesc') || 'Questa trascrizione deriva dall\'unione delle seguenti sorgenti:'}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {transcriptionResult.merged_sources.map((src, index) => (
              <div key={src.id} className="p-3 bg-bg-surface border border-border-subtle/70 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                  <span className="truncate pr-2" title={src.audio_filename}>
                    🎵 Part {index + 1}: {src.audio_filename}
                  </span>
                  {src.recording_id ? (
                    <span className="text-[9px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      Audio
                    </span>
                  ) : (
                    <span className="text-[9px] bg-text-muted/10 text-text-muted border border-border-subtle px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                      Importato
                    </span>
                  )}
                </div>
                {src.recording_id ? (
                  <audio
                    controls
                    src={`/v1/recordings/${src.recording_id}/audio`}
                    className="w-full h-8 mt-1"
                  />
                ) : (
                  <p className="text-[10px] text-text-muted italic mt-1">
                    {t('transcription.mergeAudioUnavailable') || 'Audio non riproducibile (importato)'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inline Action Card - Analyze with AI */}
      {transcriptionResult.saved_id && !transcriptionResult.analysis && (
        <div className="p-4 border border-accent/25 bg-accent/5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-2">
          <div className="flex items-center gap-3">
            <span className="text-xl">💡</span>
            <span className="text-xs text-text-secondary font-medium">
              La trascrizione è stata salvata. Vuoi estrarre riassunti e punti chiave con l'IA?
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => navigateTo('analysis', transcriptionResult.saved_id)}
          >
            🧠 {t('transcription.ctaAnalyze')}
          </Button>
        </div>
      )}

      {/* Tabs bar */}
      <div className="flex border-b border-border-subtle gap-4 text-xs font-semibold select-none mt-2">
        {[
          { id: 'text' as const, label: t('transcription.tabText') },
          { id: 'analysis' as const, label: t('transcription.tabAnalysis') || 'Analisi', hide: !transcriptionResult.analysis },
          { id: 'segments' as const, label: t('transcription.tabSegments'), hide: !transcriptionResult.segments || transcriptionResult.segments.length === 0 },
          { id: 'raw' as const, label: t('transcription.tabRaw') },
        ].map(
          (tab) =>
            !tab.hide && (
              <button
                key={tab.id}
                onClick={() => setResultTab(tab.id)}
                className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                  resultTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab.label}
              </button>
            )
        )}
      </div>

      {/* Display panels */}
      <Card className="min-h-80 select-text leading-relaxed text-sm text-text-secondary">
        {resultTab === 'analysis' && transcriptionResult.analysis && (
          <div className="flex flex-col gap-5 text-text-secondary">
            {typeof transcriptionResult.analysis === 'string' ? (
              <p className="whitespace-pre-wrap">{transcriptionResult.analysis}</p>
            ) : (
              <>
                {transcriptionResult.analysis.summary && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                      {t('analysis.sectionSummary') || 'Summary'}
                    </h4>
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {transcriptionResult.analysis.summary}
                    </p>
                  </div>
                )}

                {Array.isArray(transcriptionResult.analysis.key_points) && transcriptionResult.analysis.key_points.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                      {t('analysis.sectionKeyPoints') || 'Key Points'}
                    </h4>
                    <ul className="list-disc pl-5 text-sm leading-relaxed flex flex-col gap-1.5">
                      {transcriptionResult.analysis.key_points.map((kp: string, idx: number) => (
                        <li key={idx}>{kp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {Array.isArray(transcriptionResult.analysis.action_items) && transcriptionResult.analysis.action_items.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-accent border-b border-border-subtle pb-1">
                      {t('analysis.sectionActionItems') || 'Action Items'}
                    </h4>
                    <ul className="list-disc pl-5 text-sm leading-relaxed flex flex-col gap-1.5">
                      {transcriptionResult.analysis.action_items.map((ai: string, idx: number) => (
                        <li key={idx}>{ai}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {resultTab === 'text' && (
          <p className="whitespace-pre-wrap">{transcriptionResult.text}</p>
        )}

        {resultTab === 'raw' && (
          <pre className="font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(transcriptionResult, null, 2)}
          </pre>
        )}

        {resultTab === 'segments' && (
          <div className="flex flex-col gap-4">
            {(transcriptionResult.segments || []).map((seg: TranscriptionSegment) => (
              <div key={seg.id} className="p-4 bg-bg-surface/40 border border-border-subtle rounded-xl flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  <span>{formatTime(seg.start)} → {formatTime(seg.end)}</span>
                  <span>Segment #{seg.id}</span>
                </div>
                <p className="text-text-primary text-sm font-medium">{seg.text}</p>

                {/* Word-level pills */}
                {seg.words && seg.words.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {seg.words.map((w, wIdx) => (
                      <span
                        key={wIdx}
                        title={`${formatTime(w.start)} – ${formatTime(w.end)}`}
                        className="text-[10px] bg-bg-hover hover:bg-accent/15 text-text-secondary hover:text-accent border border-border-subtle/50 px-2 py-0.5 rounded cursor-help font-medium transition-colors"
                      >
                        {w.word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
