import { CheckCircle2, FolderKanban, Mic, MonitorSpeaker, Radio, Save } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useTranslation } from '../../i18n/i18n';

const meterBars = [28, 46, 58, 72, 64, 84, 68, 52, 76, 61, 44, 66, 89, 70, 48, 32];

export function TourRecordingMock() {
  const { t } = useTranslation();

  return (
    <section className="flex flex-col gap-6" data-tour="mock-recording">
      <div className="border-b border-border-subtle pb-3">
        <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('recording.title')}</span>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{t('tour.recordingMockTitle')}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('tour.recordingMockDescription')}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(19rem,1fr)]">
        <div className="surface-primary flex flex-col gap-5 rounded-2xl p-5">
          <div className="flex flex-col gap-3 border-b border-border-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent">{t('tour.mockLabel')}</span>
              <h3 className="mt-1 text-base font-bold text-text-primary">{t('tour.recordingSetupTitle')}</h3>
            </div>
            <Badge variant="success">{t('tour.localProcessingBadge')}</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2" data-tour="recording-source-setup">
            <Card className="flex min-h-32 flex-col gap-3 border-accent/30 bg-accent/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-accent" />
                  <span className="text-sm font-bold text-text-primary">{t('tour.recordingMicTitle')}</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">{t('tour.recordingMicBody')}</p>
            </Card>

            <Card className="flex min-h-32 flex-col gap-3 border-accent/30 bg-accent/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <MonitorSpeaker className="h-4 w-4 text-accent" />
                  <span className="text-sm font-bold text-text-primary">{t('tour.recordingSystemTitle')}</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">{t('tour.recordingSystemBody')}</p>
            </Card>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4" data-tour="recording-live-meter">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="h-3.5 w-3.5 rounded-full bg-danger shadow-[0_0_8px_var(--danger)] animate-pulse" />
                <span className="font-mono text-3xl font-bold text-text-primary">00:12:48</span>
              </div>
              <div className="text-left text-xs text-text-secondary sm:text-right">
                <span className="block font-medium text-text-primary">{t('tour.recordingLiveStatus')}</span>
                <span className="mt-0.5 block text-text-muted">{t('tour.recordingLiveSignals')}</span>
              </div>
            </div>

            <div className="mt-5 flex h-32 items-end gap-1.5 overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated px-3 py-4">
              {meterBars.map((height, index) => (
                <span
                  key={index}
                  className="flex-1 rounded-t-sm bg-accent/80"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="surface-supporting flex flex-col gap-4 rounded-2xl p-5" data-tour="recording-save-workflow">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-bold text-text-primary">{t('tour.recordingFlowTitle')}</h3>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { icon: FolderKanban, title: t('tour.recordingFlowProjectTitle'), body: t('tour.recordingFlowProjectBody') },
              { icon: Save, title: t('tour.recordingFlowSaveTitle'), body: t('tour.recordingFlowSaveBody') },
              { icon: CheckCircle2, title: t('tour.recordingFlowReadyTitle'), body: t('tour.recordingFlowReadyBody') },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 rounded-xl border border-border-subtle bg-bg-surface p-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div>
                  <p className="text-xs font-bold text-text-primary">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          <Button disabled className="mt-auto w-full justify-center">
            {t('tour.recordingMockCta')}
          </Button>
        </aside>
      </div>
    </section>
  );
}
