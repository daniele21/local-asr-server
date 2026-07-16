import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { ApiClient, RecordingVisualFrame, Transcription, TranscriptionSegment } from '../../../api/apiClient';
import { useTranslation } from '../../../i18n/i18n';
import { formatTime } from '../../../utils/formatters';
import { countTranscriptWords, getTranscriptionAsrMetadata } from '../../../utils/transcriptionMetadata';
import { renderMarkdown } from '../../../utils/markdown';
import { useToast } from '../../../context/ToastContext';
import { ProjectPromptModal } from '../../../components/ui/ProjectPromptModal';
import { Badge } from '../../../components/ui/Badge';
import { diagnosticWarnings, transcriptionDiagnostics, transcriptionHasWarnings } from '../../../utils/diagnostics';
import { recordingTranscriptionRoute } from '../../../utils/transcriptionRoute';

function energyLabel(energy?: string | null) {
  if (!energy) return null;
  return energy.replace('_', ' ');
}

interface ResultsStepProps {
  transcriptionResult: Transcription;
  copiedText: string;
  goToUploadStep: () => void;
  copyToClipboard: () => void;
  resultTab: 'text' | 'segments' | 'raw' | 'analysis';
  setResultTab: (tab: 'text' | 'segments' | 'raw' | 'analysis') => void;
  navigateTo: (page: string, detail?: string | null) => void;
  onTranscriptionUpdated: (transcription: Transcription) => void;
}

export default function ResultsStep({
  transcriptionResult,
  copiedText,
  goToUploadStep,
  copyToClipboard,
  resultTab,
  setResultTab,
  navigateTo,
  onTranscriptionUpdated,
}: ResultsStepProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();
  const recordingId = transcriptionResult.recording_id;
  const [isSplitting, setIsSplitting] = useState(false);
  const [projectName, setProjectName] = useState<string>('');
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectsList, setProjectsList] = useState<string[]>([]);
  const [recordingTitles, setRecordingTitles] = useState<Map<string, string>>(new Map());
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [isSavingSpeakers, setIsSavingSpeakers] = useState(false);
  const [visualFrames, setVisualFrames] = useState<RecordingVisualFrame[]>([]);

  const loadProjectInfo = async () => {
    try {
      // 1. Fetch all projects to build the suggestion list
      const projsData = await ApiClient.listProjects();
      const list = (projsData.items || [])
        .filter((p) => !p.is_unassigned)
        .map((p) => p.name);
      setProjectsList(list);

      // 2. Determine current project and fetch merged recording titles
      if (transcriptionResult.recording_id) {
        const rec = await ApiClient.getRecording(transcriptionResult.recording_id);
        setProjectName(rec.project_name || '');
      } else if (transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0) {
        // Find the first source that has a recording_id
        const firstRecSource = transcriptionResult.merged_sources.find(src => src.recording_id);
        if (firstRecSource?.recording_id) {
          const rec = await ApiClient.getRecording(firstRecSource.recording_id);
          setProjectName(rec.project_name || '');
        }

        const titlesMap = new Map<string, string>();
        await Promise.all(
          transcriptionResult.merged_sources.map(async (src) => {
            if (src.recording_id) {
              try {
                const rec = await ApiClient.getRecording(src.recording_id);
                titlesMap.set(src.recording_id, rec.title);
              } catch (err) {
                console.error(`Error loading recording ${src.recording_id}:`, err);
              }
            }
          })
        );
        setRecordingTitles(titlesMap);
      }
    } catch (err) {
      console.error('Error loading project info:', err);
    }
  };

  useEffect(() => {
    loadProjectInfo();
  }, [transcriptionResult]);

  useEffect(() => {
    if (!recordingId) {
      setVisualFrames([]);
      return;
    }
    ApiClient.recordingVisualFrames(recordingId)
      .then((result) => setVisualFrames(result.items || []))
      .catch(() => setVisualFrames([]));
  }, [recordingId]);

  useEffect(() => {
    const mappings = transcriptionResult.stats?.speaker_attribution?.mappings || [];
    setSpeakerNames(Object.fromEntries(
      mappings.map((item) => [item.speaker_cluster, item.display_name || '']),
    ));
  }, [transcriptionResult]);

  const handleSaveSpeakerNames = async () => {
    const transcriptionId = transcriptionResult.id || transcriptionResult.saved_id;
    if (!transcriptionId) return;
    try {
      setIsSavingSpeakers(true);
      const updated = await ApiClient.updateTranscriptionSpeakers(transcriptionId, speakerNames);
      onTranscriptionUpdated(updated);
      showToast(t('transcription.speakerNamesSaved'), 'success');
    } catch (err: any) {
      showToast(t('transcription.speakerNamesSaveError', { error: err.message }), 'error');
    } finally {
      setIsSavingSpeakers(false);
    }
  };

  const handleConfirmProject = async (newProjName: string) => {
    try {
      if (transcriptionResult.recording_id) {
        await ApiClient.updateRecording(transcriptionResult.recording_id, { project_name: newProjName });
      }
      if (transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0) {
        // Update all recordings in the merged sources
        const updatePromises = transcriptionResult.merged_sources
          .filter(src => src.recording_id)
          .map(src => ApiClient.updateRecording(src.recording_id!, { project_name: newProjName }));
        await Promise.all(updatePromises);
      }
      setProjectName(newProjName);
      showToast(t('transcription.projectUpdateSuccess') || 'Progetto aggiornato!', 'success');
      setIsProjectModalOpen(false);
    } catch (err: any) {
      showToast(t('transcription.projectUpdateError', { error: err.message }) || 'Errore', 'error');
    }
  };

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

  const getAnalysisMarkdown = () => {
    if (!transcriptionResult.analysis) return '';
    const obj = transcriptionResult.analysis.result || transcriptionResult.analysis;
    if (typeof obj === 'string') return obj;
    if (obj && typeof obj === 'object') {
      if (obj.markdown) return obj.markdown;
      const lines = [];
      if (obj.title) lines.push(`# ${obj.title}\n`);
      if (obj.summary) lines.push(`## Riassunto\n${obj.summary}\n`);
      if (Array.isArray(obj.key_points) && obj.key_points.length > 0) {
        lines.push("## Punti Chiave");
        obj.key_points.forEach((kp: string) => lines.push(`- ${kp}`));
        lines.push("");
      }
      if (Array.isArray(obj.action_items) && obj.action_items.length > 0) {
        lines.push("## Prossimi Passi");
        obj.action_items.forEach((ai: string) => lines.push(`- ${ai}`));
        lines.push("");
      }
      return lines.join('\n');
    }
    return '';
  };

  const asrMetadata = getTranscriptionAsrMetadata(transcriptionResult);
  const wordCount = countTranscriptWords(transcriptionResult.text);
  const diagnostics = transcriptionDiagnostics(transcriptionResult);
  const warnings = diagnosticWarnings(diagnostics);
  const hasWarnings = transcriptionHasWarnings(transcriptionResult);
  const diarization = transcriptionResult.stats?.speaker_diarization;
  const visualIntelligence = transcriptionResult.stats?.visual_intelligence;
  const speakerMappings = transcriptionResult.stats?.speaker_attribution?.mappings || [];

  return (
    <div className="flex flex-col gap-5 animate-in fade-in duration-150">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between border-b border-border-subtle pb-3 gap-3">
        <div className="min-w-0">
          <span className="text-xs font-bold text-accent tracking-widest uppercase">
            {t('transcription.resultTitle')}
          </span>
          <h2 className="text-xl font-bold text-text-primary mt-1">
            {transcriptionResult.audio_filename}
          </h2>
          <div className="flex items-center gap-2 mt-1.5 text-xs text-text-secondary">
            <span>📁 {t('recording.formProjectLabel') || 'Progetto'}:</span>
            <span className="font-semibold text-text-primary">{projectName || t('projects.empty') || 'Senza progetto'}</span>
            {(transcriptionResult.recording_id || (transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0)) && (
              <button
                onClick={() => setIsProjectModalOpen(true)}
                className="text-accent hover:text-accent-hover font-semibold transition-colors cursor-pointer ml-1"
              >
                ({lang === 'it' ? 'modifica' : 'edit'})
              </button>
            )}
          </div>
        </div>
        <div className="flex max-w-full flex-wrap justify-start gap-2 xl:justify-end">
          {transcriptionResult.merged_sources && transcriptionResult.merged_sources.length > 0 && (
            <Button variant="danger" onClick={handleSplit} isLoading={isSplitting} disabled={isSplitting}>
              ✂️ {lang === 'it' ? 'Dividi' : 'Split'}
            </Button>
          )}
          {recordingId && (
            <Button
              variant="ghost"
              onClick={() => {
                const confirmText = lang === 'it' 
                  ? "Sei sicuro di voler trascrivere nuovamente questo audio? La nuova trascrizione sostituirà quella precedente nei risultati principali."
                  : "Are you sure you want to transcribe this audio again? The new transcription will replace the previous one in the main results.";
                if (window.confirm(confirmText)) {
                  navigateTo('transcription', recordingTranscriptionRoute(recordingId, 'retranscribe'));
                }
              }}
              disabled={isSplitting}
            >
              🔄 {lang === 'it' ? 'Trascrivi di nuovo' : 'Transcribe again'}
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

      {hasWarnings && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex flex-col gap-3" role="alert">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{t('transcription.completedWithWarningsTitle')}</h3>
              <p className="text-xs text-text-secondary mt-1">{t('transcription.diagnosticsDesc')}</p>
            </div>
            <Badge variant="warning">{t('meeting.completedWithWarnings')}</Badge>
          </div>
          <div className="divide-y divide-warning/20 border-t border-warning/20">
            {warnings.map((item, index) => (
              <div key={`${item.component}-${index}`} className="py-3 text-xs flex flex-col gap-1">
                <strong className="text-text-primary">{item.component}</strong>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-text-secondary">
                  {item.requested_backend && <span>{t('transcription.requestedBackend')}: <b>{item.requested_backend}</b></span>}
                  {item.actual_backend && <span>{t('transcription.actualBackend')}: <b>{item.actual_backend}</b></span>}
                  {item.fallback_reason && <span>{t('transcription.fallbackReason')}: <b>{item.fallback_reason}</b></span>}
                  {item.error && <span className="text-danger">{item.error}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(diarization || visualIntelligence || transcriptionResult.stats?.speaker_attribution) && (
        <section className="rounded-xl border border-border-subtle p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">{t('recording.intelligenceTitle')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <span className="text-text-muted">{t('transcription.diarizationResult')}</span>
              <strong className="text-text-primary">{diarization?.status || t('transcription.enrichmentNotRun')}</strong>
              {typeof diarization?.assigned_segments === 'number' && (
                <span>{t('transcription.assignedSegmentCount', { count: diarization.assigned_segments })}</span>
              )}
              {diarization?.error && <span className="text-danger">{diarization.error}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-muted">{t('transcription.visualResult')}</span>
              <strong className="text-text-primary">{visualIntelligence?.status || t('transcription.enrichmentNotRun')}</strong>
              {visualIntelligence?.model && <span>{visualIntelligence.model}</span>}
              {typeof visualIntelligence?.observation_count === 'number' && (
                <span>{t('transcription.observationCount', { count: visualIntelligence.observation_count })}</span>
              )}
              {visualIntelligence?.error && <span className="text-danger">{visualIntelligence.error}</span>}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-text-muted">{t('transcription.speakerAttributionResult')}</span>
              <strong className="text-text-primary">
                {t('transcription.acceptedMappingCount', { count: speakerMappings.filter((item) => item.status === 'accepted').length })}
              </strong>
              {speakerMappings.filter((item) => item.status === 'accepted').map((item) => (
                <span key={item.speaker_cluster}>{item.speaker_cluster} → {item.display_name}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      {speakerMappings.length > 0 && (
        <section className="rounded-xl border border-border-subtle bg-bg-glass p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                {t('transcription.speakerNamesTitle')}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {t('transcription.speakerNamesDesc')}
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleSaveSpeakerNames}
              isLoading={isSavingSpeakers}
              disabled={isSavingSpeakers}
            >
              {t('transcription.speakerNamesSave')}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {speakerMappings.map((mapping, index) => (
              <label
                key={mapping.speaker_cluster}
                className="rounded-xl border border-border-subtle bg-bg-surface p-3"
              >
                <span className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  <span>{t('transcription.speakerCluster', { number: index + 1 })}</span>
                  <code className="normal-case tracking-normal">{mapping.speaker_cluster}</code>
                </span>
                <input
                  value={speakerNames[mapping.speaker_cluster] || ''}
                  onChange={(event) => setSpeakerNames((previous) => ({
                    ...previous,
                    [mapping.speaker_cluster]: event.target.value,
                  }))}
                  placeholder={t('transcription.speakerNamePlaceholder', { number: index + 1 })}
                  className="mt-2 w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-border-focus"
                  maxLength={120}
                />
                <span className="mt-1.5 block text-[10px] text-text-muted">
                  {mapping.source === 'visual'
                    ? t('transcription.speakerNameVisual')
                    : mapping.source === 'manual'
                      ? t('transcription.speakerNameManual')
                      : t('transcription.speakerNameDiarization')}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {visualFrames.length > 0 && (
        <section className="rounded-xl border border-border-subtle bg-bg-glass p-4">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">
              {t('transcription.capturedFramesTitle')}
            </h3>
            <p className="mt-1 text-xs text-text-secondary">
              {t('transcription.capturedFramesDesc', { count: visualFrames.length })}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visualFrames.map((frame) => (
              <figure
                key={frame.sequence}
                className="overflow-hidden rounded-xl border border-border-subtle bg-bg-surface"
              >
                <a href={frame.url} target="_blank" rel="noreferrer">
                  <img
                    src={frame.url}
                    alt={t('transcription.capturedFrameAlt', { sequence: frame.sequence })}
                    loading="lazy"
                    className="aspect-video w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                  />
                </a>
                <figcaption className="flex items-center justify-between gap-2 px-2.5 py-2 text-[10px] text-text-muted">
                  <span>#{frame.sequence}</span>
                  <span>{formatTime(frame.timestamp)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statProvider')}
          </span>
          <strong className="text-sm font-semibold text-text-primary truncate" title={asrMetadata.backend || asrMetadata.provider}>
            {asrMetadata.providerLabel}
          </strong>
        </Card>
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
            {transcriptionResult.language || 'N/A'}
          </strong>
        </Card>
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statModel')}
          </span>
          <strong
            className="text-sm font-semibold text-text-primary truncate"
            title={asrMetadata.model || asrMetadata.modelLabel}
          >
            {asrMetadata.modelLabel}
          </strong>
        </Card>
        <Card className="flex flex-col py-3 px-4">
          <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">
            {t('transcription.statWords')}
          </span>
          <strong className="text-sm font-semibold text-text-primary">
            {wordCount}
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
          {transcriptionResult.source_tracks && transcriptionResult.source_tracks.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {transcriptionResult.source_tracks.map((track) => (
                <div key={track.id} className="p-3 bg-bg-surface border border-border-subtle/70 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                    <span>{track.source === 'mic' ? '🎙️' : '🖥️'} {track.label}</span>
                    <span className="text-[9px] bg-accent/10 text-accent border border-accent/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {track.id}
                    </span>
                  </div>
                  <audio
                    controls
                    src={`/v1/recordings/${transcriptionResult.recording_id}/tracks/${track.id}/audio`}
                    className="w-full h-8"
                  />
                </div>
              ))}
            </div>
          )}
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
            {transcriptionResult.merged_sources.map((src, index) => {
              const displayTitle = src.recording_id && recordingTitles.has(src.recording_id)
                ? recordingTitles.get(src.recording_id)
                : src.audio_filename;
              return (
                <div key={src.id} className="p-3 bg-bg-surface border border-border-subtle/70 rounded-xl flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-bold text-text-primary">
                    <span className="truncate pr-2" title={displayTitle}>
                      🎵 Part {index + 1}: {displayTitle}
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
              );
            })}
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
        ].map(
          (tab) =>
            !tab.hide && (
              <button
                key={tab.id}
                onClick={() => setResultTab(tab.id as any)}
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
          <div className="prose prose-sm max-w-none text-text-secondary">
            {renderMarkdown(getAnalysisMarkdown())}
          </div>
        )}

        {resultTab === 'text' && (
          <p className="whitespace-pre-wrap">{transcriptionResult.text}</p>
        )}

        {resultTab === 'segments' && (
          <div className="flex flex-col gap-4">
            {(transcriptionResult.segments || []).map((seg: TranscriptionSegment) => (
              <div key={seg.id} className="p-4 bg-bg-surface/40 border border-border-subtle rounded-xl flex flex-col gap-2.5">
                <div className="flex justify-between items-center text-[10px] text-text-muted font-bold uppercase tracking-wider">
                  <span>{formatTime(seg.start)} → {formatTime(seg.end)}</span>
                  <span>
                    {seg.speaker_label ? `${seg.speaker_label} · ` : ''}Segment #{seg.id}
                  </span>
                </div>
                <p className="text-text-primary text-sm font-medium">{seg.text}</p>
                {(seg.pause_before != null || seg.speech_rate_wpm != null || seg.energy || seg.overlap) && (
                  <div className="flex flex-wrap gap-1.5">
                    {seg.pause_before != null && seg.pause_before >= 1 && (
                      <span className="text-[10px] border border-border-subtle/70 bg-bg-hover text-text-secondary px-2 py-0.5 rounded-full">
                        {t('audioIntelligence.longPause')} {seg.pause_before.toFixed(1)}s
                      </span>
                    )}
                    {seg.speech_rate_wpm != null && (
                      <span className="text-[10px] border border-border-subtle/70 bg-bg-hover text-text-secondary px-2 py-0.5 rounded-full">
                        {seg.speech_rate_wpm} WPM
                      </span>
                    )}
                    {seg.energy && (
                      <span className="text-[10px] border border-info/30 bg-info/10 text-info px-2 py-0.5 rounded-full">
                        {t('audioIntelligence.highEnergy')} {energyLabel(seg.energy)}
                      </span>
                    )}
                    {seg.overlap && (
                      <span className="text-[10px] border border-warning/30 bg-warning/10 text-warning px-2 py-0.5 rounded-full">
                        {t('audioIntelligence.overlap')}
                      </span>
                    )}
                  </div>
                )}

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
      <ProjectPromptModal
        isOpen={isProjectModalOpen}
        initialValue={projectName}
        onConfirm={handleConfirmProject}
        onCancel={() => setIsProjectModalOpen(false)}
        existingProjects={projectsList}
      />
    </div>
  );
}
