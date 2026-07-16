const RECORDING_SOURCE_PREFIX = 'file-';
const RETRANSCRIPTION_SOURCE_PREFIX = 'retranscribe-';

export type RecordingTranscriptionMode = 'transcribe' | 'retranscribe';

export interface RecordingTranscriptionRoute {
  recordingId: string;
  mode: RecordingTranscriptionMode;
}

export function recordingTranscriptionRoute(
  recordingId: string,
  mode: RecordingTranscriptionMode = 'transcribe',
): string {
  const prefix = mode === 'retranscribe' ? RETRANSCRIPTION_SOURCE_PREFIX : RECORDING_SOURCE_PREFIX;
  return `${prefix}${recordingId}`;
}

export function parseRecordingTranscriptionRoute(detailPath: string | null): RecordingTranscriptionRoute | null {
  if (!detailPath) return null;

  if (detailPath.startsWith(RETRANSCRIPTION_SOURCE_PREFIX)) {
    const recordingId = detailPath.slice(RETRANSCRIPTION_SOURCE_PREFIX.length);
    return recordingId ? { recordingId, mode: 'retranscribe' } : null;
  }

  if (detailPath.startsWith(RECORDING_SOURCE_PREFIX)) {
    const recordingId = detailPath.slice(RECORDING_SOURCE_PREFIX.length);
    return recordingId ? { recordingId, mode: 'transcribe' } : null;
  }

  return null;
}
