import React, { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ApiClient, Recording, Transcription } from '../../../api/apiClient';
import { useTranslation } from '../../../i18n/i18n';
import { formatBytes, formatDuration, formatProjectDate, getDurationSeconds } from '../../../utils/formatters';
import { ACCEPTED_EXTENSIONS } from '../../../api/config';
import { useToast } from '../../../context/ToastContext';

interface SourceStepProps {
  sourceMode: 'recordings' | 'file' | 'merge';
  setSourceMode: (mode: 'recordings' | 'file' | 'merge') => void;
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
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onMerge: (ids: string[], title: string) => void;
  isMerging: boolean;
  onSelectTranscription: (tr: Transcription) => void;
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
  onMerge,
  isMerging,
  onSelectTranscription,
}: SourceStepProps) {
  const { t, lang } = useTranslation();
  const { showToast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);

  // Merge tab state
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loadingTranscriptions, setLoadingTranscriptions] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [mergeTitle, setMergeTitle] = useState('');

  // Card multi-select state (Cmd/Ctrl + Click)
  const [selectedRecordingIds, setSelectedRecordingIds] = useState<string[]>([]);

  // Fetch transcriptions when merge tab is active
  useEffect(() => {
    if (sourceMode === 'merge') {
      const fetchTranscriptions = async () => {
        try {
          setLoadingTranscriptions(true);
          const data = await ApiClient.listTranscriptions(1, 100);
          setTranscriptions(data.items || []);
          
          const dateStr = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
            dateStyle: 'short',
            timeStyle: 'short',
          } as any);
          setMergeTitle(lang === 'it' ? `Trascrizione Unita - ${dateStr}` : `Merged Transcript - ${dateStr}`);
        } catch (err: any) {
          showToast(err.message || 'Errore nel caricamento delle trascrizioni', 'error');
        } finally {
          setLoadingTranscriptions(false);
        }
      };
      fetchTranscriptions();
    }
  }, [sourceMode, lang]);

  // Generate dynamic merge title when selected recordings change
  useEffect(() => {
    if (selectedRecordingIds.length >= 2) {
      const dateStr = new Date().toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
        dateStyle: 'short',
        timeStyle: 'short',
      } as any);
      setMergeTitle(lang === 'it' ? `Trascrizione Unita - ${dateStr}` : `Merged Transcript - ${dateStr}`);
    }
  }, [selectedRecordingIds.length, lang]);

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

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleRecordingSelection = (recordingId: string, hasTranscription: boolean) => {
    if (!hasTranscription) {
      showToast(
        lang === 'it'
          ? 'Questa registrazione non è ancora stata trascritta. Trascrivila prima di unirla.'
          : 'This recording has not been transcribed yet. Transcribe it first to merge.',
        'warning'
      );
      return;
    }
    setSelectedRecordingIds((prev) =>
      prev.includes(recordingId)
        ? prev.filter((id) => id !== recordingId)
        : [...prev, recordingId]
    );
  };

  const handleMergeClick = () => {
    if (selectedIds.length < 2) {
      showToast(t('transcription.mergeMinSelectionError'), 'warning');
      return;
    }
    onMerge(selectedIds, mergeTitle.trim());
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-150">
      <div className="border-b border-border-subtle pb-2">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('transcription.sourceEyebrow')}</span>
        <h2 className="text-xl font-bold mt-1">{t('transcription.sourceHeading')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('transcription.sourceBody')}</p>
      </div>

      <div className="flex bg-bg-surface border border-border-subtle rounded-xl p-1 gap-1 max-w-md select-none text-xs">
        <button
          onClick={() => setSourceMode('recordings')}
          className={`flex-1 py-2 rounded-lg text-center font-semibold cursor-pointer transition-colors ${
            sourceMode === 'recordings' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('transcription.sourceRecordingsTab')}
        </button>
        <button
          onClick={() => setSourceMode('file')}
          className={`flex-1 py-2 rounded-lg text-center font-semibold cursor-pointer transition-colors ${
            sourceMode === 'file' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('transcription.sourceFileTab')}
        </button>
        <button
          onClick={() => setSourceMode('merge')}
          className={`flex-1 py-2 rounded-lg text-center font-semibold cursor-pointer transition-colors ${
            sourceMode === 'merge' ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('transcription.sourceMergeTab')}
        </button>
      </div>

      {sourceMode === 'recordings' && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2 gap-4">
            <div className="flex flex-col">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">{t('transcription.recentRecordings')}</h3>
              <span className="text-[10px] text-text-muted mt-0.5">
                {recordingsCountText} · <span className="text-accent font-semibold">{lang === 'it' ? 'Premi Cmd/Ctrl + click per selezionare ed unire' : 'Hold Cmd/Ctrl + click to select and merge'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-text-muted shrink-0">
              <span>📁 {t('transcription.recordingsFolderLabel')}:</span>
              <strong className="text-text-primary truncate max-w-[150px] md:max-w-xs">{recordingsFolder}</strong>
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
                const isSelected = selectedRecordingIds.includes(rec.id);
                const isMerged = !!(status.transcription && status.transcription.merged_sources && status.transcription.merged_sources.length > 0);
                
                return (
                  <Card
                    key={rec.id}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || selectedRecordingIds.length > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleToggleRecordingSelection(rec.id, hasTranscription);
                      } else {
                        selectRecording(rec);
                      }
                    }}
                    className={`relative flex flex-col justify-between gap-4 border transition-all cursor-pointer p-5 rounded-xl overflow-hidden min-h-[190px] ${
                      isSelected
                        ? 'border-accent bg-accent/8 ring-2 ring-accent/30 scale-[0.99]'
                        : 'border-border-subtle/40 hover:border-border-focus/30 bg-gradient-to-br from-accent/5 to-bg-surface hover:from-accent/10 hover:to-bg-surface'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 z-20 bg-accent text-white rounded-full p-1.5 shadow-lg flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}

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
                        {!isSelected && (
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
                        )}
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
                        {isMerged ? (
                          <span className="inline-flex items-center justify-center gap-1.5 py-1 px-2.5 rounded border text-[10px] font-bold text-center leading-none border-accent/40 bg-accent/8 text-accent" title={lang === 'it' ? 'Questa trascrizione fa parte di un\'unione' : 'This transcription is part of a merge'}>
                            <span aria-hidden="true">🔗</span>{lang === 'it' ? 'Unito' : 'Merged'}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center justify-center gap-1.5 py-1 px-2.5 rounded border text-[10px] font-bold text-center leading-none ${hasTranscription ? 'border-success/30 bg-success/8 text-success' : 'border-border-subtle bg-bg-surface/30 text-text-muted'}`} title={hasTranscription ? 'Trascritto' : 'Non trascritto'}>
                            <span aria-hidden="true">📝</span>{hasTranscription ? (lang === 'it' ? 'Trascritto' : 'Transcribed') : (lang === 'it' ? 'No Trascrizione' : 'No Transcript')}
                          </span>
                        )}
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
                          if (selectedRecordingIds.length > 0) {
                            handleToggleRecordingSelection(rec.id, hasTranscription);
                          } else {
                            selectRecording(rec);
                          }
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {isSelected ? (
                          lang === 'it' ? 'Deseleziona' : 'Deselect'
                        ) : isMerged ? (
                          lang === 'it' ? 'Apri unione' : 'Open merged'
                        ) : hasTranscription ? (
                          lang === 'it' ? 'Apri e trascrivi' : 'Open & transcribe'
                        ) : (
                          lang === 'it' ? 'Trascrivi audio' : 'Transcribe audio'
                        )}
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
      )}

      {sourceMode === 'file' && (
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

      {sourceMode === 'merge' && (
        <Card className="flex flex-col gap-5">
          <div className="flex flex-col md:flex-row items-stretch md:items-end justify-between border-b border-border-subtle pb-3 gap-4">
            <div className="flex flex-col flex-1">
              <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
                {t('transcription.mergeListHeading')}
              </h3>
              <span className="text-[10px] text-text-muted mt-0.5">
                {selectedIds.length} {lang === 'it' ? 'selezionate' : 'selected'}
              </span>
            </div>
            <div className="flex flex-col md:w-80 gap-1.5">
              <Input
                label={t('transcription.mergeTitleLabel')}
                value={mergeTitle}
                onChange={(e) => setMergeTitle(e.target.value)}
                placeholder={t('transcription.mergeTitlePlaceholder')}
                disabled={isMerging}
              />
            </div>
          </div>

          {loadingTranscriptions ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : transcriptions.length === 0 ? (
            <p className="text-xs text-text-muted py-8 text-center">
              {lang === 'it' ? 'Nessuna trascrizione disponibile da unire.' : 'No transcripts available to merge.'}
            </p>
          ) : (
            <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
              {transcriptions.map((tr) => {
                const isSelected = selectedIds.includes(tr.id);
                return (
                  <div
                    key={tr.id}
                    onClick={() => handleToggleSelect(tr.id)}
                    className={`flex items-center gap-4 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'border-accent bg-accent/5'
                        : 'border-border-subtle hover:border-border-focus/40 bg-bg-surface/30'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}} // handled by parent div click
                      className="w-4 h-4 rounded border-border-subtle accent-accent shrink-0 cursor-pointer"
                    />
                    <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                      <strong className="text-xs text-text-primary truncate font-bold">
                        {tr.audio_filename}
                      </strong>
                      <div className="flex items-center gap-3 text-[10px] text-text-muted font-semibold mt-0.5">
                        <span>📅 {new Date(tr.timestamp).toLocaleString(lang === 'it' ? 'it-IT' : 'en-US', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}</span>
                        <span>⚙️ {tr.model ? tr.model.split('/').pop() : 'Default'}</span>
                        {tr.stats?.time_total_seconds && (
                          <span>⏱ {tr.stats.time_total_seconds.toFixed(1)}s</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTranscription(tr);
                      }}
                      className="shrink-0"
                    >
                      📂 {lang === 'it' ? 'Apri' : 'Open'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border-subtle/40 pt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedIds([]);
                setSourceMode('recordings');
              }}
              disabled={isMerging}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleMergeClick}
              disabled={selectedIds.length < 2 || isMerging}
              isLoading={isMerging}
            >
              🔗 {t('transcription.mergeBtnAction')}
            </Button>
          </div>
        </Card>
      )}

      {/* Floating merge bar when 2+ recordings are selected via card multi-select */}
      {selectedRecordingIds.length >= 2 && sourceMode === 'recordings' && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-40 bg-bg-surface/90 border border-border-focus shadow-2xl rounded-2xl p-4 flex flex-col md:flex-row items-center gap-4 max-w-2xl w-full backdrop-blur-md animate-in slide-in-from-bottom-8 duration-200">
          <div className="flex flex-col flex-1 text-left">
            <span className="text-xs font-bold text-accent uppercase tracking-wider">
              {lang === 'it' ? 'Unione Rapida Registrazioni' : 'Quick Merge Recordings'}
            </span>
            <span className="text-[10px] text-text-muted mt-0.5">
              {lang === 'it'
                ? `${selectedRecordingIds.length} audio selezionati`
                : `${selectedRecordingIds.length} audio files selected`}
            </span>
          </div>
          <div className="w-full md:w-64">
            <input
              type="text"
              className="w-full px-3 py-1.5 bg-bg-surface/50 border border-border-subtle rounded-lg text-xs font-medium focus:outline-none focus:border-border-focus text-text-primary"
              value={mergeTitle}
              onChange={(e) => setMergeTitle(e.target.value)}
              placeholder={t('transcription.mergeTitlePlaceholder')}
              disabled={isMerging}
            />
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedRecordingIds([])}
              disabled={isMerging}
            >
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const trIds = selectedRecordingIds
                  .map(id => projectItemsMap.get(id)?.transcription?.id)
                  .filter(Boolean) as string[];
                onMerge(trIds, mergeTitle.trim());
                setSelectedRecordingIds([]); // clear selection on success
              }}
              isLoading={isMerging}
              disabled={isMerging}
            >
              🔗 {t('transcription.mergeBtnAction')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
