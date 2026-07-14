import type { TranscriptionJob } from '../api/apiClient';

const LOCALIZED_JOB_STEPS = new Set([
  'queued',
  'validating_audio',
  'transcribing_mic',
  'transcribing_system',
  'diarizing',
  'merging',
  'visual_processing',
  'audio_intelligence',
  'saving',
  'completed',
  'failed',
  'cancelled',
]);

export function localizeJobStep(step: string, translate: (key: string) => string): string {
  return LOCALIZED_JOB_STEPS.has(step) ? translate(`jobSteps.${step}`) : step;
}

export function formatJobProgress(job: TranscriptionJob, translate: (key: string) => string): string {
  const step = job.current_step || job.status;
  return `${localizeJobStep(step, translate)} · ${job.progress || 0}%`;
}
