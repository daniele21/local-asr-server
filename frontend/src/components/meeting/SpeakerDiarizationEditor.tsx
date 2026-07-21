import { useEffect, useMemo, useState } from 'react';
import { ApiClient, Transcription } from '../../api/apiClient';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../i18n/i18n';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface SpeakerDiarizationEditorProps {
  transcription: Transcription;
  onUpdated: (transcription: Transcription) => void;
  readOnly?: boolean;
}

export function SpeakerDiarizationEditor({
  transcription,
  onUpdated,
  readOnly = false,
}: SpeakerDiarizationEditorProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [speakerNames, setSpeakerNames] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const mappings = transcription.stats?.speaker_attribution?.mappings || [];
  const diarization = transcription.stats?.speaker_diarization;

  // Se non ci sono mapping espliciti dalla diarizzazione, estraiamo
  // le speaker label distinte dai segmenti per permettere la rinomina manuale.
  const effectiveMappings = useMemo(() => {
    if (mappings.length > 0) return mappings;
    const segments = transcription.segments || [];
    const labels = new Set<string>();
    segments.forEach((seg) => {
      if (seg.speaker_label) labels.add(seg.speaker_label);
    });
    return Array.from(labels).map((label, _i) => ({
      speaker_cluster: label,
      display_name: null as string | null,
      status: 'pending',
      source: 'segment',
      transcript_segment_count: segments.filter((s) => s.speaker_label === label).length,
    }));
  }, [mappings, transcription.segments]);

  useEffect(() => {
    setSpeakerNames(Object.fromEntries(
      effectiveMappings.map((mapping) => [mapping.speaker_cluster, mapping.display_name || '']),
    ));
  }, [transcription]);

  const save = async () => {
    const transcriptionId = transcription.id || transcription.saved_id;
    if (!transcriptionId) return;
    try {
      setSaving(true);
      const updated = await ApiClient.updateTranscriptionSpeakers(transcriptionId, speakerNames);
      onUpdated(updated);
      showToast(t('transcription.speakerNamesSaved'), 'success');
    } catch (err: any) {
      showToast(t('transcription.speakerNamesSaveError', { error: err.message }), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border-subtle bg-bg-glass p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('meeting.diarizationAndSpeakersTitle')}
            </h3>
            <Badge variant={diarization?.status === 'completed' ? 'success' : diarization?.status ? 'warning' : 'idle'}>
              {diarization?.status || t('transcription.enrichmentNotRun')}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-secondary">
            {t('transcription.speakerNamesDesc')}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
            {diarization?.provider && <span>{t('meeting.diarizationProviderLabel')}: <b>{diarization.provider}</b></span>}
            {typeof diarization?.cluster_count === 'number' && (
              <span>{t('transcription.detectedSpeakerCount', { count: diarization.cluster_count })}</span>
            )}
            {typeof diarization?.assigned_segments === 'number' && (
              <span>{t('transcription.assignedSegmentCount', { count: diarization.assigned_segments })}</span>
            )}
          </div>
        </div>
        {!readOnly && effectiveMappings.length > 0 && (
          <Button size="sm" onClick={save} isLoading={saving} disabled={saving}>
            {t('transcription.speakerNamesSave')}
          </Button>
        )}
      </div>

      {effectiveMappings.length > 0 ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {effectiveMappings.map((mapping, index) => (
            <label key={mapping.speaker_cluster} className="rounded-xl border border-border-subtle bg-bg-surface p-3">
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
                className="mt-2 w-full rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-border-focus disabled:opacity-70"
                maxLength={120}
                disabled={readOnly || saving}
              />
              <span className="mt-1.5 block text-[10px] text-text-muted">
                {mapping.transcript_segment_count === 0
                  ? t('transcription.speakerWithoutTranscript')
                  : mapping.source === 'visual'
                    ? t('transcription.speakerNameVisual')
                    : mapping.source === 'manual'
                      ? t('transcription.speakerNameManual')
                      : mapping.source === 'segment'
                        ? t('transcription.speakerNameDiarization')
                        : t('transcription.speakerNameDiarization')}
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-border-subtle bg-bg-surface px-3 py-3 text-xs text-text-muted">
          {t('meeting.noSpeakerClusters')}
        </p>
      )}
    </section>
  );
}
