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

    return { health, listRecordings, recordingAudio, transcribe };
})();
