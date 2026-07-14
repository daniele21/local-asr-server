import { EnrichmentDiagnostic, Transcription } from '../api/apiClient';

const WARNING_STATUSES = new Set(['completed_with_warnings', 'degraded', 'failed']);

export function transcriptionDiagnostics(transcription?: Transcription | null): EnrichmentDiagnostic[] {
  if (!transcription) return [];
  const direct = (transcription as Transcription & { diagnostics?: EnrichmentDiagnostic[] }).diagnostics;
  return transcription.stats?.diagnostics || direct || [];
}

export function diagnosticWarnings(diagnostics: EnrichmentDiagnostic[]): EnrichmentDiagnostic[] {
  return diagnostics.filter((item) => (
    item.fallback_used === true
    || WARNING_STATUSES.has(item.status)
    || Boolean(item.error)
  ));
}

export function transcriptionHasWarnings(transcription?: Transcription | null): boolean {
  if (!transcription) return false;
  return transcription.stats?.outcome_status === 'completed_with_warnings'
    || diagnosticWarnings(transcriptionDiagnostics(transcription)).length > 0;
}
