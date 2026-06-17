export interface HealthResponse {
  ok: boolean;
  server: string;
  backend: string;
  default_model: string;
  status: 'recording' | 'transcribing' | 'idle';
  endpoints: string[];
  recordings: boolean;
}

export interface Recording {
  id: string;
  title: string;
  project_name: string;
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
  primary: boolean;
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
  speaker_label?: string;
  words?: Array<{ word: string; start: number; end: number }>;
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

async function request(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, options);
  if (response.ok) return response;

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

  async transcriptionSourceData(limit = 100): Promise<TranscriptionSourceData> {
    return (await request(`/v1/transcription/source-data?limit=${limit}`)).json();
  },

  transcribe(formData: FormData): Promise<Response> {
    return request('/v1/audio/transcriptions', { method: 'POST', body: formData });
  },

  async createRecording(payload: { title?: string; project_name?: string; mime_type?: string; model?: string; language?: string; capture_mode?: 'both' | 'mic_only' | 'pc_only' | 'legacy_mixed' }): Promise<Recording> {
    return (await request('/v1/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })).json();
  },

  async stopRecording(recordingId: string): Promise<Recording> {
    return (await request(`/v1/recordings/${recordingId}/stop`, { method: 'POST' })).json();
  },

  async appendRecordingChunk(recordingId: string, sequence: number, file: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sequence', String(sequence));
    return (await request(`/v1/recordings/${recordingId}/chunks`, {
      method: 'POST',
      body: formData
    })).json();
  },

  async appendRecordingTrackChunk(recordingId: string, trackId: string, sequence: number, file: Blob): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sequence', String(sequence));
    return (await request(`/v1/recordings/${recordingId}/tracks/${trackId}/chunks`, {
      method: 'POST',
      body: formData
    })).json();
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
  }
};
