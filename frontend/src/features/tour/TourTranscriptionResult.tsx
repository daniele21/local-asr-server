import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { TOUR_TRANSCRIPTION } from './fixtures';
import { useTranslation } from '../../i18n/i18n';

export function TourTranscriptionResult() {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-5" data-tour="mock-transcription">
      <div className="border-b border-border-subtle pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('tour.mockLabel')}</span>
          <Badge variant="success" data-tour="local-processing-badge">{t('tour.localProcessingBadge')}</Badge>
          <Badge variant="info" data-tour="asr-model-badge">{t('tour.nemotronAsrBadge')}</Badge>
        </div>
        <h2 className="text-xl font-bold text-text-primary mt-1">{TOUR_TRANSCRIPTION.audio_filename}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('tour.mockTranscriptionDescription')}</p>
      </div>
      <Card className="text-sm leading-relaxed text-text-secondary" data-tour="mock-transcription-text">
        <p className="whitespace-pre-line">{TOUR_TRANSCRIPTION.text}</p>
      </Card>
      <div className="grid sm:grid-cols-3 gap-3">
        {TOUR_TRANSCRIPTION.segments?.map((segment, index) => (
          <Card key={index} className="p-4 text-xs text-text-secondary">
            <span className="font-bold text-accent">{segment.start.toFixed(1)}s — {segment.end.toFixed(1)}s · {segment.speaker_label}</span>
            <p className="mt-2">{segment.text}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
