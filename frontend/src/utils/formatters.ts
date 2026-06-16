export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = 2;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const formatProjectDate = (value: string, lang: string): string => {
  try {
    return new Intl.DateTimeFormat(lang === 'it' ? 'it-IT' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value || '';
  }
};

export const formatDuration = (seconds: number | undefined, t: (key: string, options?: any) => string): string => {
  if (!seconds) return t('recording.durationNotAvailable');
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return t('recording.durationFormat', { mins, secs });
};

export const getDurationSeconds = (recording: {
  duration_seconds?: number;
  duration?: number;
  metadata?: {
    duration_seconds?: number;
    duration?: number;
  };
  created_at?: string;
  stopped_at?: string;
}): number => {
  const candidates = [
    recording.duration_seconds,
    recording.duration,
    recording.metadata?.duration_seconds,
    recording.metadata?.duration,
  ];
  const value = candidates.find(candidate => candidate !== undefined && candidate !== null && Number.isFinite(Number(candidate)));
  if (value !== undefined) return Math.max(0, Number(value) || 0);

  const startedAt = new Date(recording.created_at || 0).getTime();
  const stoppedAt = new Date(recording.stopped_at || 0).getTime();
  if (startedAt && stoppedAt && stoppedAt > startedAt) {
    return Math.round((stoppedAt - startedAt) / 1000);
  }
  return 0;
};
