import React from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Recording } from '../../../api/apiClient';
import { useTranslation } from '../../../i18n/i18n';
import { formatBytes, formatDuration, formatProjectDate, getDurationSeconds } from '../../../utils/formatters';
import { ACCEPTED_EXTENSIONS } from '../../../api/config';
import { useToast } from '../../../context/ToastContext';

interface SourceStepProps {
  sourceMode: 'recordings' | 'file';
  setSourceMode: (mode: 'recordings' | 'file') => void;
  recordings: Recording[];
  recordingsCountText: string;
  recordingsFolder: string;
  projectItemsMap: Map<string, { transcription: any; analysis: any }>;
  projectsList: string[];
  playingAudioId: string | null;
  togglePlayAudio: (e: React.MouseEvent, recId: string) => void;
  handleCardProjectChange: (recordingId: string, newProjName: string) => void;
  selectRecording: (recording: Recording) => void;
  handleSelectAudioFile: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export default function SourceStep({
  sourceMode,
  setSourceMode,
  recordings,
  recordingsCountText,
  recordingsFolder,
  projectItemsMap,
  projectsList,
  playingAudioId,
  togglePlayAudio,
  handleCardProjectChange,
  selectRecording,
  handleSelectAudioFile,
  fileInputRef,
}: SourceStepProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (ACCEPTED_EXTENSIONS.test(file.name)) {
        handleSelectAudioFile(file);
      } else {
        showToast(t('transcription.toastFileInvalid'), 'warning');
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-150">
      <div className="border-b border-border-subtle pb-2">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('transcription.sourceEyebrow')}</span>
        <h2 className="text-xl font-bold mt-1">{t('transcription.sourceHeading')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('transcription.sourceBody')}</p>
      </div>

      <div className="flex bg-bg-surface border border-border-subtle rounded-xl p-1 gap-1 max-w-xs select-none text-xs">
        <button
          onClick={() => setSourceMode('recordings')}
          className={`flex-1 py-2 rounded-lg text-center font-semibold cursor-pointer ${
            sourceMode === 'recordings' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('transcription.sourceRecordingsTab')}
        </button>
        <button
          onClick={() => setSourceMode('file')}
          className={`flex-1 py-2 rounded-lg text-center font-semibold cursor-pointer ${
            sourceMode === 'file' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('transcription.sourceFileTab')}
        </button>
      </div>

      {sourceMode === 'recordings' ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{t('transcription.recentRecordings')}</h3>
              <span className="text-[10px] text-text-muted mt-0.5">{recordingsCountText}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span>📁 {t('transcription.recordingsFolderLabel')}:</span>
              <strong className="text-text-primary truncate max-w-xs">{recordingsFolder}</strong>
            </div>
          </div>

          {recordings.length === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">{t('transcription.noRecentRecordings')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recordings.map((rec) => {
                const durationSeconds = getDurationSeconds(rec);
                const status = projectItemsMap.get(rec.id) || { transcription: null, analysis: null };
                const hasTranscription = !!status.transcription;
                const hasAnalysis = !!status.analysis;
                
                return (
                  <Card
                    key={rec.id}
                    onClick={() => selectRecording(rec)}
                    className="relative flex flex-col justify-between gap-4 border-border-subtle/40 hover:border-border-focus/30 transition-all cursor-pointer bg-gradient-to-br from-accent/5 to-bg-surface hover:from-accent/10 hover:to-bg-surface p-5 rounded-xl overflow-hidden min-h-[190px]"
                  >
                    <div className="flex flex-col gap-3.5 z-10">
                      {/* Play Row */}
                      <div className="flex items-center justify-between w-full">
                        <button
                          type="button"
                          onClick={(e) => togglePlayAudio(e, rec.id)}
                          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-border-subtle hover:bg-accent hover:border-accent hover:text-white transition-all duration-200 cursor-pointer text-text-primary"
                          title={playingAudioId === rec.id ? t('recording.btnPause') : t('transcription.listenAudio') || 'Ascolta'}
                        >
                          {playingAudioId === rec.id ? (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                              <rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 fill-current">
                              <polygon points="6 3 20 12 6 21 6 3"/>
                            </svg>
                          )}
                        </button>
                        <select
                          value={rec.project_name || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => handleCardProjectChange(rec.id, e.target.value)}
                          className="text-[10px] font-bold text-accent bg-accent/10 hover:bg-accent/15 px-2.5 py-1 rounded-lg border border-accent/20 hover:border-accent/30 uppercase tracking-wide cursor-pointer focus:outline-none max-w-[150px] transition-all"
                        >
                          <option value="" className="bg-bg-elevated text-text-primary">{t('projects.noProject') || 'Senza progetto'}</option>
                          {projectsList.map((p) => (
                            <option key={p} value={p} className="bg-bg-elevated text-text-primary">{p}</option>
                          ))}
                          <option value="__NEW_PROJECT__" className="bg-bg-elevated text-text-primary font-semibold text-accent">+ {lang === 'it' ? 'Nuovo...' : 'New...'}</option>
                        </select>
                      </div>

                      {/* Info Block */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <h4 className="text-sm font-bold text-text-primary truncate" title={rec.title}>
                          {rec.title}
                        </h4>
                      </div>

                      {/* Metadata Grid */}
                      <div className="flex flex-col gap-1.5">
                        <div className="grid grid-cols-[16px_75px_1fr] items-center gap-1.5 text-text-secondary text-[11px]">
                          <span>📅</span>
                          <span className="text-text-muted font-bold">{t('recording.metaDate') || 'Data'}:</span>
                          <strong className="text-text-primary font-semibold truncate">{formatProjectDate(rec.created_at, lang)}</strong>
                        </div>
                        <div className="grid grid-cols-[16px_75px_1fr] items-center gap-1.5 text-text-secondary text-[11px]">
                          <span>⏱</span>
                          <span className="text-text-muted font-bold">{t('recording.metaDuration') || 'Durata'}:</span>
                          <strong className="text-text-primary font-semibold truncate">{formatDuration(durationSeconds, t)}</strong>
                        </div>
                        <div className="grid grid-cols-[16px_75px_1fr] items-center gap-1.5 text-text-secondary text-[11px]">
                          <span>💾</span>
                          <span className="text-text-muted font-bold">{t('recording.metaSize') || 'Dimensione'}:</span>
                          <strong className="text-text-primary font-semibold truncate">{formatBytes(rec.bytes_written || 0)}</strong>
                        </div>
                      </div>

                      {/* Status Badges */}
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <span className={`inline-flex items-center justify-center gap-1.5 py-1 px-2.5 rounded border text-[10px] font-bold text-center leading-none ${hasTranscription ? 'border-success/30 bg-success/8 text-success' : 'border-border-subtle bg-bg-surface/30 text-text-muted'}`} title={hasTranscription ? 'Trascritto' : 'Non trascritto'}>
                          <span aria-hidden="true">📝</span>{hasTranscription ? (lang === 'it' ? 'Trascritto' : 'Transcribed') : (lang === 'it' ? 'No Trascrizione' : 'No Transcript')}
                        </span>
                        <span className={`inline-flex items-center justify-center gap-1.5 py-1 px-2.5 rounded border text-[10px] font-bold text-center leading-none ${hasAnalysis ? 'border-success/30 bg-success/8 text-success' : 'border-border-subtle bg-bg-surface/30 text-text-muted'}`} title={hasAnalysis ? 'Analizzato' : 'Non analizzato'}>
                          <span aria-hidden="true">🧠</span>{hasAnalysis ? (lang === 'it' ? 'Analizzato' : 'Analyzed') : (lang === 'it' ? 'No Analisi' : 'No Analysis')}
                        </span>
                      </div>
                    </div>

                    {/* Bottom Actions and Duration Fill Bar */}
                    <div className="relative z-10 border-t border-border-subtle/30 pt-3 flex gap-2 w-full mt-1">
                      <Button
                        size="sm"
                        className="w-full flex items-center justify-center gap-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          selectRecording(rec);
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {lang === 'it' ? 'Apri e trascrivi' : 'Open & transcribe'}
                      </Button>
                    </div>

                    {/* Duration Fill Bar */}
                    {(() => {
                      const durationFill = durationSeconds ? Math.min(100, Math.max(8, (durationSeconds / 3600) * 100)) : 8;
                      return (
                        <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-white/5 overflow-hidden rounded-b-xl pointer-events-none">
                          <div
                            className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-accent transition-all duration-300"
                            style={{ width: `${durationFill}%` }}
                          />
                        </div>
                      );
                    })()}
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <input
            type="file"
            ref={fileInputRef}
            accept="audio/*"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleSelectAudioFile(e.target.files[0]);
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
            className={`border-2 border-dashed rounded-2xl min-h-64 flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-200 ${
              isDragOver ? 'border-accent bg-accent-glow' : 'border-border-subtle hover:border-accent-hover/40'
            }`}
          >
            <div className="w-16 h-16 bg-accent-glow rounded-full flex items-center justify-center text-accent mb-4 border border-border-subtle">
              <svg className="w-7 h-7" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
              </svg>
            </div>
            <h3 className="text-base font-bold text-text-primary mb-1">{t('transcription.dropzoneTitle')}</h3>
            <p className="text-xs text-text-muted max-w-sm mb-4 leading-relaxed">{t('transcription.dropzoneMax')}</p>
            <Button size="md" variant="secondary" onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}>
              {t('transcription.browseAudio')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
