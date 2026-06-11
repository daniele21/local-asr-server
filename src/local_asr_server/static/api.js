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

    async function recordingAudio(recordingId) {
        return (await request(`${API.recordings}/${recordingId}/audio`)).blob();
    }

    function transcribe(formData) {
        return request(API.transcribe, { method: 'POST', body: formData });
    }

    async function updateRecording(recordingId, title) {
        return (await request(`${API.recordings}/${recordingId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
        })).json();
    }

    async function getSettings() {
        return (await request('/v1/settings')).json();
    }

    async function updateSettings(transcriptionsDir) {
        return (await request('/v1/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcriptions_dir: transcriptionsDir }),
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
        recordingAudio, 
        transcribe,
        updateRecording,
        getSettings,
        updateSettings,
        listTranscriptions,
        getTranscription,
        deleteTranscription
    };
})();
