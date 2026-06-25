import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { getTourAnalysis } from './fixtures';
import { useTranslation } from '../../i18n/i18n';

export function TourAnalysisResult() {
  const { t, lang } = useTranslation();
  const analysis = getTourAnalysis(lang);

  return (
    <section className="flex flex-col gap-6" data-tour="mock-analysis">
      <div className="border-b border-border-subtle pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-accent tracking-widest uppercase">{t('tour.mockLabel')}</span>
          <Badge variant="success" data-tour="local-processing-badge">{t('tour.localProcessingBadge')}</Badge>
          <Badge variant="info" data-tour="analysis-model-badge">{t('tour.nemotronNanoBadge')}</Badge>
        </div>
        <h2 className="text-2xl font-bold text-text-primary mt-1">{analysis.title}</h2>
        <p className="text-xs text-text-secondary mt-1">{t('tour.mockAnalysisDescription')}</p>
      </div>
      <Card className="text-sm leading-relaxed text-text-secondary" data-tour="mock-analysis-summary">
        <h3 className="text-xs font-bold uppercase tracking-wider text-accent">{t('analysis.sectionSummary')}</h3>
        <p className="mt-2">{analysis.summary}</p>
      </Card>
      <div className="grid md:grid-cols-2 gap-5">
        <Card className="p-5 text-sm text-text-secondary">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent">{t('analysis.sectionKeyPoints')}</h3>
          <ul className="mt-3 list-disc pl-5 space-y-2">{analysis.key_points.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
        <Card className="p-5 text-sm text-text-secondary">
          <h3 className="text-xs font-bold uppercase tracking-wider text-accent">{t('analysis.sectionActionItems')}</h3>
          <ul className="mt-3 list-disc pl-5 space-y-2">{analysis.action_items.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
      </div>
    </section>
  );
}
