/**
 * Post-call recording controller.
 *
 * MediaRecorder chunks are uploaded sequentially while recording. The stop
 * endpoint is called only after the final chunk has been persisted.
 */
const RecordingController = (() => {
    const ACTIVE_SESSION_KEY = 'asr-active-recording-id';

    let mediaRecorder = null;
    let mediaStream = null;
    let sessionId = null;
    let sequence = 0;
    let bytesSaved = 0;
    let uploadChain = Promise.resolve();
    let timerHandle = null;
    let startedAt = 0;
    let audioContext = null;
    let analyser = null;
    let meterFrame = null;
    let meterData = null;
    let onSaved = null;
    let dom = {};

    function init(options = {}) {
        onSaved = options.onSaved;
        dom = {
            title: document.getElementById('recording-title'),
            device: document.getElementById('recording-device'),
            start: document.getElementById('recording-start'),
            stop: document.getElementById('recording-stop'),
            status: document.getElementById('recording-status'),
            dot: document.getElementById('recording-dot'),
            timer: document.getElementById('recording-timer'),
            progress: document.getElementById('recording-progress'),
            canvas: document.getElementById('audio-level-canvas'),
            levelLabel: document.getElementById('signal-level-label'),
            sourceMode: document.getElementById('recording-source-mode'),
            testRoute: document.getElementById('test-audio-route'),
        };
        if (!dom.start) return;

        dom.start.addEventListener('click', start);
        dom.stop.addEventListener('click', stop);
        if (dom.testRoute) dom.testRoute.addEventListener('click', toggleTestAudioRoute);
        navigator.mediaDevices?.addEventListener?.('devicechange', loadDevices);
        window.addEventListener('beforeunload', warnBeforeUnload);
        loadDevices();
        restoreSession();
    }

    async function loadDevices() {
        if (!navigator.mediaDevices?.enumerateDevices || !dom.device) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const current = dom.device.value;
            const inputs = devices.filter(device => device.kind === 'audioinput');
            dom.device.innerHTML = '<option value="">Predefinito di sistema</option>';
            inputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Ingresso audio ${index + 1}`;
                dom.device.appendChild(option);
            });
            const hasCustomValue = current && current !== "";
            if (!hasCustomValue) {
                const aggregateOption = [...dom.device.options].find(option => 
                    option.textContent.toLowerCase().includes("combinato") || 
                    option.textContent.toLowerCase().includes("aggregate")
                );
                if (aggregateOption) {
                    dom.device.value = aggregateOption.value;
                }
            } else if ([...dom.device.options].some(option => option.value === current)) {
                dom.device.value = current;
            }
        } catch (error) {
            console.warn('Unable to enumerate audio devices:', error);
        }
    }

    async function start() {
        if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
            Toast.show('Registrazione audio non supportata da questo browser.', 'error');
            return;
        }

        lockControls(true);
        setStatus('Richiesta microfono...', 'working');
        try {
            const audioConstraints = dom.device.value
                ? { 
                    deviceId: { exact: dom.device.value },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 4
                  }
                : {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    channelCount: 4
                  };

            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            await loadDevices();

            // Web Audio API mixing and routing
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            const sourceNode = audioContext.createMediaStreamSource(mediaStream);
            const track = mediaStream.getAudioTracks()[0];
            const trackSettings = track ? track.getSettings() : {};
            const sourceChannels = trackSettings.channelCount || sourceNode.channelCount || 2;
            
            sourceNode.channelCount = sourceChannels;
            sourceNode.channelCountMode = 'explicit';
            const mode = dom.sourceMode ? dom.sourceMode.value : 'both';
            
            const destNode = audioContext.createMediaStreamDestination();
            destNode.channelCount = 2;

            let finalNodeBeforeDest;
            if (sourceChannels >= 3) {
                // Aggregate Device setup: Channel 0 is Microphone, 1 and 2 are BlackHole (system sound)
                const splitter = audioContext.createChannelSplitter(sourceChannels);
                const merger = audioContext.createChannelMerger(2);
                sourceNode.connect(splitter);

                if (mode === 'mic_only') {
                    // Send mic (channel 0) to both Left and Right
                    splitter.connect(merger, 0, 0); // Mic -> Left
                    splitter.connect(merger, 0, 1); // Mic -> Right
                } else if (mode === 'pc_only') {
                    // Send BlackHole L/R (channels 1 & 2) to Left and Right
                    splitter.connect(merger, 1, 0); // BlackHole L -> Left
                    splitter.connect(merger, 2, 1); // BlackHole R -> Right
                } else {
                    // 'both': Mix Mic into both Left/Right, and keep BlackHole L/R stereo
                    const micGain = audioContext.createGain();
                    micGain.gain.value = 1.0;

                    // Route Mic (0) to both Left (0) and Right (1) of the merger via micGain
                    splitter.connect(micGain, 0);
                    micGain.connect(merger, 0, 0);
                    micGain.connect(merger, 0, 1);

                    // Route BlackHole L/R (1 & 2) directly to Left/Right of the merger
                    splitter.connect(merger, 1, 0); // BlackHole L -> Left
                    splitter.connect(merger, 2, 1); // BlackHole R -> Right
                }
                merger.connect(destNode);
                finalNodeBeforeDest = merger;
            } else {
                // Standard 1 or 2 channel stream
                sourceNode.connect(destNode);
                finalNodeBeforeDest = sourceNode;
            }

            // Chrome Workaround: Force the audio graph to stay active by connecting it to destination via zero gain
            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0.0;
            finalNodeBeforeDest.connect(silentGain);
            silentGain.connect(audioContext.destination);

            startAudioMeter(finalNodeBeforeDest);

            const mimeType = chooseMimeType();
            const response = await fetch(API.recordings, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: dom.title.value || 'Registrazione senza titolo',
                    mime_type: mimeType,
                    model: null,
                    language: null,
                }),
            });
            if (!response.ok) throw new Error(await responseDetail(response));

            const session = await response.json();
            sessionId = session.id;
            localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
            sequence = 0;
            bytesSaved = 0;
            uploadChain = Promise.resolve();

            mediaRecorder = mimeType
                ? new MediaRecorder(destNode.stream, { mimeType })
                : new MediaRecorder(destNode.stream);
            mediaRecorder.addEventListener('dataavailable', onDataAvailable);
            mediaRecorder.addEventListener('error', event => {
                Toast.show(`Errore registrazione: ${event.error?.message || 'sconosciuto'}`, 'error');
            });
            mediaRecorder.start(RECORDING_CHUNK_INTERVAL_MS);

            startedAt = Date.now();
            timerHandle = setInterval(updateTimer, 250);
            dom.stop.disabled = false;
            dom.dot.classList.add('recorder__dot--active');
            setStatus('Registrazione', 'recording');
            dom.progress.textContent = 'Salvataggio in corso...';
        } catch (error) {
            releaseMedia();
            lockControls(false);
            setStatus('Errore', 'error');
            Toast.show(`Impossibile avviare la registrazione: ${error.message}`, 'error');
        }
    }

    function onDataAvailable(event) {
        if (!event.data || event.data.size === 0 || !sessionId) return;
        const currentSequence = sequence++;
        uploadChain = uploadChain.then(() => uploadChunk(event.data, currentSequence));
        uploadChain.catch(error => {
            setStatus('Errore salvataggio', 'error');
            Toast.show(`Chunk non salvato: ${error.message}`, 'error', 0);
        });
    }

    async function uploadChunk(blob, chunkSequence) {
        const formData = new FormData();
        formData.append('sequence', String(chunkSequence));
        formData.append('file', blob, `chunk-${chunkSequence}.webm`);
        const response = await fetch(`${API.recordings}/${sessionId}/chunks`, {
            method: 'POST',
            body: formData,
        });
        if (!response.ok) throw new Error(await responseDetail(response));
        const metadata = await response.json();
        bytesSaved = metadata.bytes_written;
        dom.progress.textContent = `${metadata.chunk_count} blocchi salvati, ${Utils.formatBytes(bytesSaved)}`;
    }

    async function stop() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        dom.stop.disabled = true;
        setStatus('Finalizzazione...', 'working');

        const recorderStopped = new Promise(resolve => {
            mediaRecorder.addEventListener('stop', resolve, { once: true });
        });
        mediaRecorder.stop();
        await recorderStopped;
        clearInterval(timerHandle);
        releaseMedia();

        try {
            await uploadChain;
            const response = await fetch(`${API.recordings}/${sessionId}/stop`, {
                method: 'POST',
            });
            if (!response.ok) throw new Error(await responseDetail(response));
            const recording = await response.json();
            localStorage.removeItem(ACTIVE_SESSION_KEY);
            sessionId = null;
            setStatus('Salvata', 'success');
            dom.progress.textContent = 'Audio completo salvato. Disponibile in Trascrizione.';
            lockControls(false);
            if (onSaved) onSaved(recording);
        } catch (error) {
            setStatus('Errore', 'error');
            dom.start.disabled = false;
            Toast.show(`Finalizzazione fallita: ${error.message}`, 'error', 0);
        }
    }

    async function restoreSession() {
        const storedId = localStorage.getItem(ACTIVE_SESSION_KEY);
        if (!storedId) return;
        try {
            const response = await fetch(`${API.recordings}/${storedId}`);
            if (!response.ok) throw new Error();
            const recording = await response.json();
            if (recording.status === 'recording') {
                setStatus('Sessione interrotta', 'error');
                dom.progress.textContent = 'La pagina è stata chiusa durante la registrazione.';
            }
            localStorage.removeItem(ACTIVE_SESSION_KEY);
        } catch {
            localStorage.removeItem(ACTIVE_SESSION_KEY);
        }
    }

    function chooseMimeType() {
        const candidates = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
        ];
        return candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
    }

    function updateTimer() {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        dom.timer.textContent = `${minutes}:${seconds}`;
    }

    function lockControls(locked) {
        dom.start.disabled = locked;
        dom.title.disabled = locked;
        dom.device.disabled = locked;
        if (dom.sourceMode) dom.sourceMode.disabled = locked;
        if (!locked) dom.stop.disabled = true;
    }

    function releaseMedia() {
        stopAudioMeter();
        mediaStream?.getTracks().forEach(track => track.stop());
        mediaStream = null;
        mediaRecorder = null;
        dom.dot.classList.remove('recorder__dot--active');
    }

    function startAudioMeter(streamOrNode) {
        stopAudioMeter();
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        
        if (streamOrNode instanceof AudioNode) {
            audioContext = streamOrNode.context;
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.78;
            streamOrNode.connect(analyser);
        } else {
            audioContext = new AudioContextClass();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.78;
            audioContext.createMediaStreamSource(streamOrNode).connect(analyser);
        }
        meterData = new Uint8Array(analyser.frequencyBinCount);
        drawAudioMeter();
    }

    function drawAudioMeter() {
        if (!analyser || !dom.canvas) return;
        analyser.getByteFrequencyData(meterData);
        const context = dom.canvas.getContext('2d');
        const width = dom.canvas.width;
        const height = dom.canvas.height;
        const styles = getComputedStyle(document.documentElement);
        const accent = styles.getPropertyValue('--accent').trim() || '#8b5cf6';
        const muted = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,.08)';
        const barCount = 48;
        const gap = 6;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        let sumSquares = 0;

        context.clearRect(0, 0, width, height);
        for (let index = 0; index < barCount; index += 1) {
            const sampleIndex = Math.floor(index * meterData.length / barCount);
            const normalized = meterData[sampleIndex] / 255;
            sumSquares += normalized * normalized;
            const barHeight = Math.max(4, normalized * height);
            context.fillStyle = normalized > 0.06 ? accent : muted;
            context.fillRect(
                index * (barWidth + gap),
                height - barHeight,
                barWidth,
                barHeight,
            );
        }

        const rms = Math.sqrt(sumSquares / barCount);
        const decibels = rms > 0 ? Math.max(-48, 20 * Math.log10(rms)) : -48;
        dom.levelLabel.textContent = decibels <= -47.5 ? '-∞ dB' : `${decibels.toFixed(1)} dB`;
        meterFrame = requestAnimationFrame(drawAudioMeter);
    }

    function stopAudioMeter() {
        if (meterFrame) cancelAnimationFrame(meterFrame);
        meterFrame = null;
        analyser = null;
        meterData = null;
        if (audioContext) audioContext.close().catch(() => {});
        audioContext = null;
        if (dom.canvas) {
            dom.canvas.getContext('2d').clearRect(0, 0, dom.canvas.width, dom.canvas.height);
        }
        if (dom.levelLabel) dom.levelLabel.textContent = '-∞ dB';
    }

    function setStatus(text, state) {
        dom.status.textContent = text;
        dom.status.dataset.state = state;
    }

    function warnBeforeUnload(event) {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        event.preventDefault();
        event.returnValue = '';
    }

    async function responseDetail(response) {
        try {
            const payload = await response.json();
            return payload.detail || `HTTP ${response.status}`;
        } catch {
            return `HTTP ${response.status}`;
        }
    }

    let isTestRouted = false;

    async function toggleTestAudioRoute() {
        if (!dom.testRoute) return;
        dom.testRoute.disabled = true;
        try {
            if (!isTestRouted) {
                const response = await fetch('/v1/system/audio-route/test-route', { method: 'POST' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.success) {
                    isTestRouted = true;
                    dom.testRoute.textContent = 'Ripristina Audio Originale';
                    dom.testRoute.style.background = 'var(--success)';
                    dom.testRoute.style.color = 'white';
                    Toast.show(`Routing attivo: Uscita -> ${data.original_output || 'Multi-Output'}, Ingresso -> ${data.original_input || 'Aggregate'}`, 'success');
                } else {
                    Toast.show('Impossibile attivare il routing audio di test.', 'error');
                }
            } else {
                const response = await fetch('/v1/system/audio-route/test-restore', { method: 'POST' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.success) {
                    isTestRouted = false;
                    dom.testRoute.textContent = 'Testa Routing Audio';
                    dom.testRoute.style.background = '';
                    dom.testRoute.style.color = '';
                    Toast.show('Audio originale ripristinato.', 'success');
                } else {
                    Toast.show('Impossibile ripristinare l\'audio di test.', 'error');
                }
            }
        } catch (error) {
            Toast.show(`Errore test routing: ${error.message}`, 'error');
        } finally {
            dom.testRoute.disabled = false;
        }
    }

    return { init };
})();
