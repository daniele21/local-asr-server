export type TourStepId =
  | 'home-summary'
  | 'home-actions'
  | 'home-decisions'
  | 'home-risks'
  | 'project-sidebar'
  | 'project-status'
  | 'project-actions'
  | 'project-situation'
  | 'transcription-result'
  | 'analysis-result'
  | 'complete';

export interface GuidedTourStep {
  id: TourStepId;
  route: string;
  target?: string;
  titleKey: string;
  bodyKey: string;
}

export const TOUR_STEPS: GuidedTourStep[] = [
  {
    id: 'home-summary',
    route: 'home',
    target: '[data-tour="today-summary"]',
    titleKey: 'tour.homeSummaryTitle',
    bodyKey: 'tour.homeSummaryBody',
  },
  {
    id: 'home-actions',
    route: 'home',
    target: '[data-tour="open-actions"]',
    titleKey: 'tour.homeActionsTitle',
    bodyKey: 'tour.homeActionsBody',
  },
  {
    id: 'home-decisions',
    route: 'home',
    target: '[data-tour="decision-log"]',
    titleKey: 'tour.homeDecisionsTitle',
    bodyKey: 'tour.homeDecisionsBody',
  },
  {
    id: 'home-risks',
    route: 'home',
    target: '[data-tour="risk-panel"]',
    titleKey: 'tour.homeRisksTitle',
    bodyKey: 'tour.homeRisksBody',
  },
  {
    id: 'project-sidebar',
    route: 'projects',
    target: '[data-tour="project-sidebar"]',
    titleKey: 'tour.projectSidebarTitle',
    bodyKey: 'tour.projectSidebarBody',
  },
  {
    id: 'project-status',
    route: 'projects',
    target: '[data-tour="project-status"]',
    titleKey: 'tour.projectStatusTitle',
    bodyKey: 'tour.projectStatusBody',
  },
  {
    id: 'project-actions',
    route: 'projects',
    target: '[data-tour="project-actions"]',
    titleKey: 'tour.projectActionsTitle',
    bodyKey: 'tour.projectActionsBody',
  },
  {
    id: 'project-situation',
    route: 'projects',
    target: '[data-tour="project-situation"]',
    titleKey: 'tour.projectSituationTitle',
    bodyKey: 'tour.projectSituationBody',
  },
  {
    id: 'transcription-result',
    route: 'transcription',
    target: '[data-tour="mock-transcription"]',
    titleKey: 'tour.transcriptionTitle',
    bodyKey: 'tour.transcriptionBody',
  },
  {
    id: 'analysis-result',
    route: 'analysis',
    target: '[data-tour="mock-analysis"]',
    titleKey: 'tour.analysisTitle',
    bodyKey: 'tour.analysisBody',
  },
  {
    id: 'complete',
    route: 'analysis',
    titleKey: 'tour.completeTitle',
    bodyKey: 'tour.completeBody',
  },
];

export function tourStepIndex(stepId: TourStepId): number {
  return TOUR_STEPS.findIndex((step) => step.id === stepId);
}

