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

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: Array<{ word: string; start: number; end: number }>;
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

  transcribe(formData: FormData): Promise<Response> {
    return request('/v1/audio/transcriptions', { method: 'POST', body: formData });
  },

  async createRecording(payload: { title?: string; project_name?: string; mime_type?: string; model?: string; language?: string }): Promise<Recording> {
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

  async testAudioRoute(): Promise<any> {
    return (await request('/v1/system/audio/activate', { method: 'POST' })).json();
  },

  async testAudioRestore(): Promise<any> {
    return (await request('/v1/system/audio/restore', { method: 'POST' })).json();
  },
  
  async getAudioRouteStatus(): Promise<any> {
    return (await request('/v1/system/audio/status')).json();
  }
};
