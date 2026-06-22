export interface HealthResponse {
  ok: boolean;
  server: string;
  backend: string;
  default_model: string;
  status: 'recording' | 'transcribing' | 'idle';
  endpoints: string[];
  recordings: boolean;
}

export type RecordingStatus =
  | 'recording'
  | 'finalizing'
  | 'recorded'
  | 'interrupted'
  | 'recoverable'
  | 'transcribing'
  | 'completed'
  | 'failed';

export interface Recording {
  id: string;
  title: string;
  project_name: string;
  status: RecordingStatus;
  error?: string | null;
  partial?: boolean;
  capture_backend?: 'browser' | 'native';
  capture_status?: string;
  quality_report?: any;
  warnings?: string[];
  mime_type: string;
  audio_file: string;
  capture_mode?: 'both' | 'mic_only' | 'pc_only' | 'legacy_mixed';
  primary_track_id?: string;
  audio_tracks?: RecordingTrack[];
  bytes_written: number;
  created_at: string;
  stopped_at?: string;
  duration_seconds?: number;
  duration?: number;
  metadata?: {
    duration_seconds?: number;
    duration?: number;
  };
}

export interface RecordingTrack {
  id: string;
  source: 'mixed' | 'mic' | 'system';
  label: string;
  mime_type: string;
  audio_file?: string | null;
  bytes_written: number;
  chunk_count: number;
  chunks?: RecordingChunk[];
  primary: boolean;
}

export interface RecordingChunk {
  sequence: number;
  sha256: string;
  size: number;
  received_at: string;
  client_started_at_ms?: number | null;
  client_chunk_start_ms?: number | null;
  client_chunk_end_ms?: number | null;
}

export interface ExpectedSequence {
  recording_id: string;
  track_id: string;
  status: RecordingStatus;
  expected_sequence: number;
  last_committed_sequence: number;
  bytes_written: number;
  part_file_exists: boolean;
  audio_file_exists: boolean;
}

export interface CapturePermissions {
  ok: boolean;
  microphone: 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unknown';
  screen_capture: 'granted' | 'required';
  modes: {
    mic_only: { ok: boolean };
    pc_only: { ok: boolean };
    both: { ok: boolean };
  };
}

export type CaptureMode = 'both' | 'mic_only' | 'pc_only';

export interface CaptureEnsurePermissionsResult {
  ok: boolean;
  requested: boolean;
  permissions: CapturePermissions;
  diagnostics: CaptureDiagnostics;
  request_result?: any;
}

export interface CaptureCapabilities {
  default_backend: 'native' | 'browser';
  native: {
    available: boolean;
    backend: 'native';
    reason?: string;
    error?: string;
    modes?: Array<'both' | 'mic_only' | 'pc_only'>;
    minimum_macos?: string;
  };
  fallbacks: string[];
}

export interface CaptureDiagnostics {
  process_name?: string;
  executable_path?: string;
  bundle_identifier?: string;
  bundle_path?: string;
  screen_capture?: 'granted' | 'required' | string;
  microphone?: 'authorized' | 'denied' | 'restricted' | 'notDetermined' | 'unknown' | string;
  code_signature?: 'signed' | 'unsigned' | string;
  team_id?: string;
  identifier?: string;
  macos_version?: string;
}

export interface TranscriptionJob {
  id: string;
  recording_id: string;
  status: 'queued' | 'validating_audio' | 'preprocessing' | 'transcribing_mic' | 'transcribing_system' | 'merging' | 'saving' | 'completed' | 'failed' | 'cancelled';
  current_step: string;
  progress: number;
  error?: string | null;
  result?: Transcription | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectItem {
  recording: Recording;
  transcription: any;
  analysis: any;
}

export interface Project {
  name: string;
  is_unassigned: boolean;
  items: ProjectItem[];
}

export interface TranscriptionSourceData {
  recordings: Recording[];
  recordings_count: number;
  projects: Project[];
  settings: Partial<Settings>;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  track_id?: string;
  source?: 'mixed' | 'mic' | 'system';
  channel?: 'mixed' | 'mic' | 'system' | string;
  speaker_label?: string;
  pause_before?: number;
  speech_rate_wpm?: number;
  energy?: 'low' | 'medium_low' | 'medium' | 'high' | string | null;
  overlap?: boolean;
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface AudioIntelligenceEvent {
  start: number;
  end?: number;
  duration?: number;
  channels?: string[];
}

export interface AudioIntelligence {
  version: number;
  backend: string;
  mode: string;
  mock?: boolean;
  channels: Record<string, {
    track_id: string;
    label: string;
    available: boolean;
    error?: string | null;
    duration_seconds?: number;
    speech_threshold?: number;
  }>;
  speech_windows?: Array<AudioIntelligenceEvent & { channel: string; speech: boolean; pause_before?: number | null }>;
  conversation_metrics?: {
    duration_seconds?: number;
    speaking_time_seconds?: Record<string, number>;
    speaking_time_pct?: Record<string, number>;
    speech_rate_wpm?: Record<string, number>;
    long_pauses?: AudioIntelligenceEvent[];
    overlaps?: AudioIntelligenceEvent[];
    high_energy_moments?: AudioIntelligenceEvent[];
  };
  insight_candidates?: Array<{
    type: string;
    title?: string;
    start?: number;
    confidence?: string;
    evidence?: string[];
    mock?: boolean;
  }>;
  segments?: TranscriptionSegment[];
}

export interface MergedSource {
  id: string;
  audio_filename: string;
  recording_id?: string;
}

export interface Transcription {
  id: string;
  timestamp: string;
  model: string;
  language: string;
  audio_filename: string;
  text: string;
  segments?: TranscriptionSegment[];
  stats?: {
    time_total_seconds: number;
  };
  analysis?: any;
  saved_id?: string;
  recording_id?: string;
  merged_sources?: MergedSource[];
  source_tracks?: RecordingTrack[];
}

export interface Settings {
  transcriptions_dir: string;
  recordings_dir: string;
  gemini_api_key: string;
  llm_provider: string;
  default_model: string;
  default_language: string;
  default_task: string;
  default_temperature?: number | null;
  default_word_timestamps: boolean;
  default_condition_on_previous: boolean;
}

let sessionPromise: Promise<void> | null = null;

function isPublicRequest(url: string): boolean {
  return url === '/health' || url === '/v1/session';
}

async function sha256Blob(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureSession(): Promise<void> {
  if (!sessionPromise) {
    sessionPromise = fetch('/v1/session', { credentials: 'same-origin' }).then((response) => {
      if (!response.ok) {
        throw new Error(`Session bootstrap failed: HTTP ${response.status}`);
      }
    });
  }
  return sessionPromise;
}

async function request(url: string, options: RequestInit = {}, retrying = false): Promise<Response> {
  if (!isPublicRequest(url)) {
    await ensureSession();
  }
  const response = await fetch(url, { ...options, credentials: options.credentials ?? 'same-origin' });
  if (response.ok) return response;
  if (response.status === 401 && !isPublicRequest(url) && !retrying) {
    sessionPromise = null;
    await ensureSession();
    return request(url, options, true);
  }

  let detail = `HTTP ${response.status}`;
  try {
    const payload = await response.json();
    detail = payload.detail || detail;
  } catch {
    const text = await response.text();
    if (text) detail = text;
  }
  throw new Error(detail);
}

export const ApiClient = {
  async health(): Promise<HealthResponse> {
    return (await request('/health')).json();
  },

  async captureCapabilities(): Promise<CaptureCapabilities> {
    return (await request('/v1/capture/capabilities')).json();
  },

  async capturePermissions(): Promise<CapturePermissions> {
    return (await request('/v1/capture/permissions')).json();
  },

  async requestCapturePermissions(): Promise<any> {
    return (await request('/v1/capture/request-permissions', { method: 'POST' })).json();
  },

  async ensureCapturePermissions(mode: CaptureMode): Promise<CaptureEnsurePermissionsResult> {
    return (await request('/v1/capture/ensure-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })).json();
  },

  async listRecordings(): Promise<{ items: Recording[] }> {
    return (await request('/v1/recordings')).json();
  },

  async getRecording(recordingId: string): Promise<Recording> {
    return (await request(`/v1/recordings/${recordingId}`)).json();
  },

  async listProjects(): Promise<{ items: Project[] }> {
    return (await request('/v1/projects')).json();
  },

  async recordingAudio(recordingId: string): Promise<Blob> {
    return (await request(`/v1/recordings/${recordingId}/audio`)).blob();
  },

  async recordingProject(recordingId: string): Promise<ProjectItem> {
    return (await request(`/v1/recordings/${recordingId}/project`)).json();
  },

  async recordingIntelligence(recordingId: string): Promise<AudioIntelligence> {
    return (await request(`/v1/recordings/${recordingId}/intelligence`)).json();
  },

  async transcriptionSourceData(limit = 100): Promise<TranscriptionSourceData> {
    return (await request(`/v1/transcription/source-data?limit=${limit}`)).json();
  },

  transcribe(formData: FormData): Promise<Response> {
    return request('/v1/audio/transcriptions', { method: 'POST', body: formData });
  },

  async createRecording(payload: { title?: string; project_name?: string; mime_type?: string; model?: string; language?: string; capture_mode?: 'both' | 'mic_only' | 'pc_only' | 'legacy_mixed'; capture_backend?: 'browser' | 'native' }): Promise<Recording> {
    return (await request('/v1/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })).json();
  },

  async stopRecording(recordingId: string): Promise<Recording> {
    return (await request(`/v1/recordings/${recordingId}/stop`, { method: 'POST' })).json();
  },

  async startNativeCapture(recordingId: string, mode: 'both' | 'mic_only' | 'pc_only'): Promise<any> {
    return (await request(`/v1/recordings/${recordingId}/capture/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })).json();
  },

  async stopNativeCapture(recordingId: string): Promise<{ capture: any; recording: Recording }> {
    return (await request(`/v1/recordings/${recordingId}/capture/stop`, { method: 'POST' })).json();
  },

  async cancelNativeCapture(recordingId: string): Promise<any> {
    return (await request(`/v1/recordings/${recordingId}/capture/cancel`, { method: 'POST' })).json();
  },

  async recoverRecording(recordingId: string): Promise<Recording> {
    return (await request(`/v1/recordings/${recordingId}/recover`, { method: 'POST' })).json();
  },

  async discardRecording(recordingId: string): Promise<void> {
    await request(`/v1/recordings/${recordingId}/discard`, { method: 'POST' });
  },

  async appendRecordingChunk(recordingId: string, sequence: number, file: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sequence', String(sequence));
    formData.append('size', String(file.size));
    const sha256 = await sha256Blob(file);
    if (sha256) formData.append('sha256', sha256);
    return (await request(`/v1/recordings/${recordingId}/chunks`, {
      method: 'POST',
      body: formData
    })).json();
  },

  async appendRecordingTrackChunk(recordingId: string, trackId: string, sequence: number, file: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sequence', String(sequence));
    formData.append('size', String(file.size));
    const sha256 = await sha256Blob(file);
    if (sha256) formData.append('sha256', sha256);
    return (await request(`/v1/recordings/${recordingId}/tracks/${trackId}/chunks`, {
      method: 'POST',
      body: formData
    })).json();
  },

  async expectedRecordingTrackSequence(recordingId: string, trackId: string): Promise<ExpectedSequence> {
    return (await request(`/v1/recordings/${recordingId}/tracks/${trackId}/expected-sequence`)).json();
  },

  async recordingTrackAudio(recordingId: string, trackId: string): Promise<Blob> {
    return (await request(`/v1/recordings/${recordingId}/tracks/${trackId}/audio`)).blob();
  },

  transcribeRecording(recordingId: string, payload: {
    model?: string;
    language?: string;
    task?: string;
    response_format?: string;
    word_timestamps?: boolean;
    initial_prompt?: string;
    temperature?: number | null;
    condition_on_previous_text?: boolean;
  }): Promise<Transcription> {
    return request(`/v1/recordings/${recordingId}/transcriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((res) => res.json());
  },

  async createTranscriptionJob(recordingId: string, payload: {
    model?: string;
    language?: string;
    task?: string;
    response_format?: string;
    word_timestamps?: boolean;
    initial_prompt?: string;
    temperature?: number | null;
    condition_on_previous_text?: boolean;
  }): Promise<TranscriptionJob> {
    return (await request(`/v1/recordings/${recordingId}/transcription-jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).json();
  },

  async getJob(jobId: string): Promise<TranscriptionJob> {
    return (await request(`/v1/jobs/${jobId}`)).json();
  },

  async cancelJob(jobId: string): Promise<TranscriptionJob> {
    return (await request(`/v1/jobs/${jobId}/cancel`, { method: 'POST' })).json();
  },

  async updateRecording(recordingId: string, payload: { title?: string; project_name?: string }): Promise<Recording> {
    return (await request(`/v1/recordings/${recordingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).json();
  },

  async getSettings(): Promise<Settings> {
    return (await request('/v1/settings')).json();
  },

  async checkModelCache(modelName: string): Promise<{ model: string; cached: boolean }> {
    return (await request(`/v1/models/check-cache?model=${encodeURIComponent(modelName)}`)).json();
  },

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    return (await request('/v1/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })).json();
  },

  async stats(): Promise<any> {
    return (await request('/v1/stats')).json();
  },

  async analyze(payload: { transcription_id?: string; text?: string; gemini_api_key?: string; llm_provider?: string }): Promise<any> {
    return (await request('/v1/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })).json();
  },

  async selectDirectory(): Promise<{ path: string | null; error?: string }> {
    return (await request('/v1/system/select-directory', { method: 'POST' })).json();
  },

  async listTranscriptions(page = 1, limit = 10): Promise<{ items: Transcription[]; total: number; page: number; limit: number }> {
    return (await request(`/v1/transcriptions?page=${page}&limit=${limit}`)).json();
  },

  async getTranscription(id: string): Promise<Transcription> {
    return (await request(`/v1/transcriptions/${id}`)).json();
  },

  async deleteTranscription(id: string): Promise<{ ok: boolean }> {
    return (await request(`/v1/transcriptions/${id}`, { method: 'DELETE' })).json();
  },

  async mergeTranscriptions(transcriptionIds: string[], title?: string): Promise<Transcription> {
    return (await request('/v1/transcriptions/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcription_ids: transcriptionIds, title })
    })).json();
  },

  async splitTranscription(id: string): Promise<{ ok: boolean; restored_ids: string[] }> {
    return (await request(`/v1/transcriptions/${id}/split`, { method: 'POST' })).json();
  },

  async testAudioRoute(): Promise<any> {
    return (await request('/v1/system/audio/activate', { method: 'POST' })).json();
  },

  async testAudioRestore(): Promise<any> {
    return (await request('/v1/system/audio/restore', { method: 'POST' })).json();
  },
  
  async getAudioRouteStatus(): Promise<any> {
    return (await request('/v1/system/audio/status')).json();
  },

  async getActiveRecording(): Promise<{
    active: boolean;
    recording_id?: string;
    title?: string;
    capture_backend?: 'browser' | 'native';
    capture_mode?: 'both' | 'mic_only' | 'pc_only';
    started_at?: number;
    bytes_written?: number;
    mic_db?: number;
    system_db?: number;
    warnings?: string[];
  }> {
    return (await request('/v1/recordings/active')).json();
  },

  async stopRecordingControl(recordingId: string): Promise<any> {
    return (await request(`/v1/recordings/${recordingId}/control/stop`, { method: 'POST' })).json();
  },

  async resizeOverlay(width: number, height: number): Promise<{ success: boolean; error?: string }> {
    try {
      return (await request('/v1/system/window/overlay/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width, height })
      })).json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async toggleOverlay(show: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      return (await request('/v1/system/window/overlay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show })
      })).json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  async getCaptureDiagnostics(): Promise<CaptureDiagnostics> {
    return (await request('/v1/capture/diagnostics')).json();
  }
};
