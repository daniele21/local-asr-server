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
    let sourceStreams = [];
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
    let routeActivated = false;
    let deviceManuallySelected = false;
    let dom = {};

    function init(options = {}) {
        onSaved = options.onSaved;
        dom = {
            title: document.getElementById('recording-title'),
            project: document.getElementById('recording-project'),
            device: document.getElementById('recording-device'),
            systemDevice: document.getElementById('recording-system-device'),
            start: document.getElementById('recording-start'),
            stop: document.getElementById('recording-stop'),
            status: document.getElementById('recording-status'),
            dot: document.getElementById('recording-dot'),
            timer: document.getElementById('recording-timer'),
            progress: document.getElementById('recording-progress'),
            canvas: document.getElementById('audio-level-canvas'),
            levelLabel: document.getElementById('signal-level-label'),
            sourceMode: document.getElementById('recording-source-mode'),
            language: document.getElementById('recording-language-select'),
            testRoute: document.getElementById('test-audio-route'),
            audioSetupStatus: document.getElementById('audio-setup-status'),
            audioSetupTitle: document.getElementById('audio-setup-title'),
            audioReadiness: document.getElementById('audio-readiness'),
            setupOpen: document.getElementById('audio-setup-open'),
            setupPanel: document.getElementById('audio-setup-panel'),
            setupClose: document.getElementById('audio-setup-close'),
            setupLater: document.getElementById('audio-setup-later'),
            setupVerify: document.getElementById('audio-setup-verify'),
            setupIntro: document.getElementById('audio-setup-intro'),
            profileName: document.getElementById('audio-profile-name'),
        };
        if (!dom.start) return;

        dom.start.addEventListener('click', start);
        dom.stop.addEventListener('click', stop);
        dom.device?.addEventListener('change', () => {
            deviceManuallySelected = true;
        });
        dom.setupOpen?.addEventListener('click', openSetupPanel);
        dom.setupClose?.addEventListener('click', closeSetupPanel);
        dom.setupLater?.addEventListener('click', closeSetupPanel);
        dom.setupVerify?.addEventListener('click', verifyAudioSetup);
        if (dom.testRoute) dom.testRoute.addEventListener('click', toggleTestAudioRoute);
        navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
        window.addEventListener('beforeunload', warnBeforeUnload);
        window.addEventListener('pagehide', restoreAudioRouteOnUnload);
        loadDevices();
        refreshAudioStatus();
        restoreSession();
    }

    async function loadDevices() {
        if (!navigator.mediaDevices?.enumerateDevices || !dom.device) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const current = dom.device.value;
            const inputs = devices.filter(device => device.kind === 'audioinput');
            dom.device.innerHTML = `<option value="">${i18n.t('recording.deviceAuto')}</option>`;
            if (dom.systemDevice) {
                dom.systemDevice.innerHTML = `<option value="">${i18n.t('recording.blackholeNotFound')}</option>`;
            }
            inputs.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || i18n.t('recording.audioInputLabel', { index: index + 1 });
                const isBlackHole = option.textContent.toLowerCase().includes('blackhole');
                const isAggregate = isAggregateInput(option.textContent);
                if (isBlackHole && dom.systemDevice) {
                    dom.systemDevice.appendChild(option);
                } else if (!isAggregate) {
                    dom.device.appendChild(option);
                }
            });
            const hasCustomValue = deviceManuallySelected && current;
            if (hasCustomValue && [...dom.device.options].some(option => option.value === current)) {
                dom.device.value = current;
            }
            if (dom.systemDevice && dom.systemDevice.options.length > 1) {
                dom.systemDevice.remove(0);
                dom.systemDevice.selectedIndex = 0;
            }
        } catch (error) {
            console.warn('Unable to enumerate audio devices:', error);
        }
    }

    async function start() {
        if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
            Toast.show(i18n.t('recording.unsupportedBrowser'), 'error');
            return;
        }

        lockControls(true);
        setStatus(i18n.t('recording.audioSetupTitle'), 'working');
        try {
            const mode = dom.sourceMode ? dom.sourceMode.value : 'both';
            if (mode !== 'mic_only') {
                const routing = await activateAudioRoute();
                if (routing.success) {
                    await delay(500);
                    await loadDevices();
                } else {
                    openSetupPanel();
                    throw new Error(i18n.t('recording.setupAudioError'));
                }
            }

            setStatus(i18n.t('recording.accessingSources'), 'working');
            sourceStreams = [];
            let micStream = null;
            if (mode !== 'pc_only') {
                micStream = await getAudioStream(dom.device?.value, true);
                sourceStreams.push(micStream);
                assertSingleMicrophone(micStream);
                await loadDevices();
            } else if (!dom.systemDevice?.value) {
                await unlockAudioDeviceLabels();
                await loadDevices();
            }
            const systemStream = mode !== 'mic_only'
                ? await getAudioStream(dom.systemDevice?.value, false)
                : null;
            if (systemStream) sourceStreams.push(systemStream);
            mediaStream = sourceStreams[0] || null;

            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioContext = new AudioContextClass();
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            const destNode = audioContext.createMediaStreamDestination();
            destNode.channelCount = 2;
            const mixBus = audioContext.createGain();
            mixBus.gain.value = 1;
            sourceStreams.forEach(stream => {
                audioContext.createMediaStreamSource(stream).connect(mixBus);
            });
            mixBus.connect(destNode);

            // Chrome Workaround: Force the audio graph to stay active by connecting it to destination via zero gain
            const silentGain = audioContext.createGain();
            silentGain.gain.value = 0.0;
            mixBus.connect(silentGain);
            silentGain.connect(audioContext.destination);

            startAudioMeter(mixBus);

            const mimeType = chooseMimeType();
            const response = await fetch(API.recordings, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: dom.title.value || i18n.t('recording.untitledRecording'),
                    project_name: dom.project?.value || '',
                    mime_type: mimeType,
                    model: null,
                    language: dom.language?.value || null,
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
                Toast.show(i18n.t('recording.error', { error: event.error?.message || (i18n.getLang() === 'it' ? 'sconosciuto' : 'unknown') }), 'error');
            });
            mediaRecorder.start(RECORDING_CHUNK_INTERVAL_MS);

            startedAt = Date.now();
            timerHandle = setInterval(updateTimer, 250);
            dom.stop.disabled = false;
            dom.dot.classList.add('recorder__dot--active');
            setStatus(i18n.t('recording.statusRecording'), 'recording');
            dom.progress.textContent = i18n.t('recording.progressSaving');
        } catch (error) {
            releaseMedia();
            await restoreAudioRoute();
            lockControls(false);
            setStatus(i18n.t('common.error'), 'error');
            Toast.show(i18n.t('recording.startFailed', { error: error.message }), 'error');
        }
    }

    function onDataAvailable(event) {
        if (!event.data || event.data.size === 0 || !sessionId) return;
        const currentSequence = sequence++;
        uploadChain = uploadChain.then(() => uploadChunk(event.data, currentSequence));
        uploadChain.catch(error => {
            setStatus(i18n.t('common.error'), 'error');
            Toast.show(i18n.t('recording.chunkSaveFailed', { error: error.message }), 'error', 0);
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
        dom.progress.textContent = i18n.t('recording.chunksSaved', { count: metadata.chunk_count, size: Utils.formatBytes(bytesSaved) });
    }

    async function stop() {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
        dom.stop.disabled = true;
        setStatus(i18n.t('recording.finalizing'), 'working');

        // Flush any buffered audio data before stopping.
        // requestData() triggers an immediate 'dataavailable' event,
        // ensuring short recordings (< chunk interval) are captured.
        if (mediaRecorder.state === 'recording') {
            try { mediaRecorder.requestData(); } catch { /* ignore */ }
            await delay(100);
        }

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
            setStatus(i18n.t('recording.saved'), 'success');
            dom.progress.textContent = i18n.t('recording.audioCompleteSaved');
            lockControls(false);
            if (onSaved) onSaved(recording);
        } catch (error) {
            setStatus(i18n.t('common.error'), 'error');
            dom.start.disabled = false;
            Toast.show(i18n.t('recording.finalizationFailed', { error: error.message }), 'error', 0);
        } finally {
            await restoreAudioRoute();
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
                setStatus(i18n.t('recording.sessionInterrupted'), 'error');
                dom.progress.textContent = i18n.t('recording.pageClosedWarning');
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
        if (dom.systemDevice) dom.systemDevice.disabled = locked;
        if (dom.sourceMode) dom.sourceMode.disabled = locked;
        if (!locked) dom.stop.disabled = true;
    }

    function releaseMedia() {
        stopAudioMeter();
        sourceStreams.forEach(stream => stream.getTracks().forEach(track => track.stop()));
        sourceStreams = [];
        mediaStream = null;
        mediaRecorder = null;
        dom.dot.classList.remove('recorder__dot--active');
    }

    function startAudioMeter(streamOrNode) {
        stopAudioMeter(false);
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
        const accentHover = styles.getPropertyValue('--accent-hover').trim() || '#a78bfa';
        const muted = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,.08)';
        const barCount = 60;
        const gap = 4;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        let sumSquares = 0;

        context.clearRect(0, 0, width, height);

        // Linear gradient for active audio bars
        const gradient = context.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, accentHover);
        gradient.addColorStop(0.5, accent);
        gradient.addColorStop(1, accentHover);

        for (let index = 0; index < barCount; index += 1) {
            const sampleIndex = Math.floor(index * meterData.length / barCount);
            const normalized = meterData[sampleIndex] / 255;
            sumSquares += normalized * normalized;
            
            // Symmetric height (centered vertically)
            const minHeight = 6;
            const barHeight = Math.max(minHeight, normalized * (height * 0.85));
            const y = (height - barHeight) / 2;

            context.fillStyle = normalized > 0.05 ? gradient : muted;
            
            context.beginPath();
            if (context.roundRect) {
                context.roundRect(index * (barWidth + gap), y, barWidth, barHeight, barWidth / 2);
            } else {
                context.rect(index * (barWidth + gap), y, barWidth, barHeight);
            }
            context.fill();
        }

        const rms = Math.sqrt(sumSquares / barCount);
        const decibels = rms > 0 ? Math.max(-48, 20 * Math.log10(rms)) : -48;
        dom.levelLabel.textContent = decibels <= -47.5 ? '-∞ dB' : `${decibels.toFixed(1)} dB`;
        meterFrame = requestAnimationFrame(drawAudioMeter);
    }

    function stopAudioMeter(closeContext = true) {
        if (meterFrame) cancelAnimationFrame(meterFrame);
        meterFrame = null;
        analyser = null;
        meterData = null;
        if (closeContext && audioContext) {
            audioContext.close().catch(() => {});
            audioContext = null;
        }
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

    function restoreAudioRouteOnUnload() {
        if (!routeActivated) return;
        navigator.sendBeacon?.('/v1/system/audio/restore');
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
                const response = await fetch('/v1/system/audio/activate', { method: 'POST' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.success) {
                    isTestRouted = true;
                    routeActivated = true;
                    dom.testRoute.textContent = i18n.t('recording.btnRestoreOriginalAudio');
                    dom.testRoute.style.background = 'var(--success)';
                    dom.testRoute.style.color = 'white';
                    Toast.show(i18n.t('recording.routingActive', { devices: `${data.output_device} / ${data.input_device}` }), 'success');
                } else {
                    Toast.show(i18n.t('recording.routingActiveFailed'), 'error');
                }
            } else {
                const response = await fetch('/v1/system/audio/restore', { method: 'POST' });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (data.success) {
                    isTestRouted = false;
                    routeActivated = false;
                    dom.testRoute.textContent = i18n.t('recording.testAudioRoute');
                    dom.testRoute.style.background = '';
                    dom.testRoute.style.color = '';
                    Toast.show(i18n.t('recording.routingRestoreSuccess'), 'success');
                } else {
                    Toast.show(i18n.t('recording.routingRestoreFailed'), 'error');
                }
            }
        } catch (error) {
            Toast.show(i18n.t('recording.routingTestError', { error: error.message }), 'error');
        } finally {
            dom.testRoute.disabled = false;
        }
    }

    async function activateAudioRoute() {
        const response = await fetch('/v1/system/audio/activate', { method: 'POST' });
        if (!response.ok) throw new Error(await responseDetail(response));
        const status = await response.json();
        routeActivated = Boolean(status.success);
        renderAudioStatus(status);
        return status;
    }

    async function restoreAudioRoute() {
        if (!routeActivated) return;
        try {
            const response = await fetch('/v1/system/audio/restore', { method: 'POST' });
            if (!response.ok) throw new Error(await responseDetail(response));
        } catch (error) {
            console.warn('Unable to restore the original audio route:', error);
        } finally {
            routeActivated = false;
            isTestRouted = false;
            if (dom.testRoute) {
                dom.testRoute.textContent = i18n.t('recording.testAudioRoute');
                dom.testRoute.style.background = '';
                dom.testRoute.style.color = '';
            }
            refreshAudioStatus();
        }
    }

    async function refreshAudioStatus() {
        if (!dom.audioSetupStatus) return;
        try {
            const response = await fetch('/v1/system/audio/status');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            renderAudioStatus(await response.json());
        } catch {
            dom.audioSetupStatus.textContent = i18n.t('recording.audioStatusNotAvailable');
        }
    }

    function renderAudioStatus(status) {
        if (!dom.audioSetupStatus) return;

        // Auto-routing mode: no manual profile setup needed
        const isAutoRouting = status.auto_routing;

        if (status.ready_to_record) {
            dom.audioReadiness.dataset.state = 'ready';
            if (status.routing_active) {
                dom.audioSetupTitle.textContent = i18n.t('recording.routingActiveTitle');
                dom.audioSetupStatus.textContent = status.physical_output
                    ? i18n.t('recording.routingActiveStatus', { output: status.physical_output })
                    : i18n.t('recording.tempRoutingActiveStatus');
            } else {
                dom.audioSetupTitle.textContent = i18n.t('recording.audioSetupTitleReady');
                dom.audioSetupStatus.textContent = status.physical_output
                    ? i18n.t('recording.readyAutoStatus', { output: status.physical_output })
                    : i18n.t('recording.readyConfigStatus');
            }
            if (dom.setupOpen) dom.setupOpen.hidden = true;
            closeSetupPanel();
            return;
        }

        // Not ready
        dom.audioReadiness.dataset.state = 'missing';
        const missingItems = status.missing || [];
        if (missingItems.includes('blackhole')) {
            dom.audioSetupTitle.textContent = i18n.t('recording.blackholeNotInstalled');
            dom.audioSetupStatus.textContent = i18n.t('recording.missingBlackholeStatus');
        } else if (missingItems.includes('audio_helper')) {
            dom.audioSetupTitle.textContent = i18n.t('recording.audioHelperNotAvailable');
            dom.audioSetupStatus.textContent = i18n.t('recording.missingHelperStatus');
        } else {
            dom.audioSetupTitle.textContent = i18n.t('recording.configRequiredStatus');
            dom.audioSetupStatus.textContent = i18n.t('recording.verifyConfigRequiredStatus');
        }
        if (dom.setupOpen) dom.setupOpen.hidden = !isAutoRouting;
    }

    async function getAudioStream(deviceId, voiceProcessing) {
        if (!deviceId && !voiceProcessing) {
            throw new Error(i18n.t('recording.blackholeInputRequiredError'));
        }
        const constraints = {
            echoCancellation: voiceProcessing,
            noiseSuppression: voiceProcessing,
            autoGainControl: voiceProcessing,
        };
        if (deviceId) constraints.deviceId = { exact: deviceId };
        return navigator.mediaDevices.getUserMedia({ audio: constraints });
    }

    async function handleDeviceChange() {
        await loadDevices();
        await refreshAudioStatus();
    }

    function isAggregateInput(label) {
        const normalized = label.toLowerCase();
        return normalized.includes('aggregate')
            || normalized.includes('combinat')
            || normalized.includes('local asr input');
    }

    function assertSingleMicrophone(stream) {
        const track = stream.getAudioTracks()[0];
        if (track && isAggregateInput(track.label || '')) {
            throw new Error(i18n.t('recording.aggregateDeviceError'));
        }
    }

    async function unlockAudioDeviceLabels() {
        const permissionStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        permissionStream.getTracks().forEach(track => track.stop());
    }

    function openSetupPanel() {
        if (!dom.setupPanel) return;
        dom.setupPanel.hidden = false;
        dom.setupPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function closeSetupPanel() {
        if (dom.setupPanel) dom.setupPanel.hidden = true;
    }

    async function verifyAudioSetup() {
        dom.setupVerify.disabled = true;
        dom.setupVerify.textContent = i18n.t('recording.verifyingStatus');
        await loadDevices();
        await refreshAudioStatus();
        dom.setupVerify.disabled = false;
        dom.setupVerify.textContent = i18n.t('recording.verifyDoneStatus');
    }

    function delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function isRecording() {
        return !!mediaRecorder && mediaRecorder.state === 'recording';
    }

    return {
        init,
        start,
        stop,
        isRecording
    };
})();
