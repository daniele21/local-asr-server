const ApiClient = (() => {
    async function request(url, options = {}) {
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

    async function health() {
        return (await request(API.health)).json();
    }

    async function listRecordings() {
        return (await request(API.recordings)).json();
    }

    async function listProjects() {
        return (await request('/v1/projects')).json();
    }

    async function recordingAudio(recordingId) {
        return (await request(`${API.recordings}/${recordingId}/audio`)).blob();
    }

    async function recordingProject(recordingId) {
        return (await request(`${API.recordings}/${recordingId}/project`)).json();
    }

    function transcribe(formData) {
        return request(API.transcribe, { method: 'POST', body: formData });
    }

    async function updateRecording(recordingId, titleOrPatch) {
        const body = typeof titleOrPatch === 'object'
            ? titleOrPatch
            : { title: titleOrPatch };
        return (await request(`${API.recordings}/${recordingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })).json();
    }

    async function getSettings() {
        return (await request(API.settings)).json();
    }

    async function checkModelCache(modelName) {
        return (await request(`/v1/models/check-cache?model=${encodeURIComponent(modelName)}`)).json();
    }

    async function updateSettings(settingsObjOrDir, recordingsDir = '', geminiApiKey = '', llmProvider = 'mock') {
        let bodyObj = {};
        if (typeof settingsObjOrDir === 'object') {
            bodyObj = settingsObjOrDir;
        } else {
            bodyObj = {
                transcriptions_dir: settingsObjOrDir,
                recordings_dir: recordingsDir,
                gemini_api_key: geminiApiKey,
                llm_provider: llmProvider
            };
        }
        return (await request(API.settings, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyObj),
        })).json();
    }

    async function stats() {
        return (await request(API.stats)).json();
    }

    async function analyze(payload) {
        return (await request('/v1/analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })).json();
    }

    async function selectDirectory() {
        return (await request(API.selectDirectory, {
            method: 'POST'
        })).json();
    }

    async function listTranscriptions(page = 1, limit = 10) {
        return (await request(`/v1/transcriptions?page=${page}&limit=${limit}`)).json();
    }

    async function getTranscription(id) {
        return (await request(`/v1/transcriptions/${id}`)).json();
    }

    async function deleteTranscription(id) {
        return (await request(`/v1/transcriptions/${id}`, { method: 'DELETE' })).json();
    }

    return { 
        health, 
        listRecordings, 
        listProjects,
        recordingAudio, 
        recordingProject,
        transcribe,
        updateRecording,
        getSettings,
        checkModelCache,
        updateSettings,
        stats,
        analyze,
        selectDirectory,
        listTranscriptions,
        getTranscription,
        deleteTranscription
    };
})();
