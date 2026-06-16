import { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient, Recording } from '../api/apiClient';
import { RECORDING_CHUNK_INTERVAL_MS } from '../api/config';
import { useTranslation } from '../i18n/i18n';
import { useToast } from '../context/ToastContext';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface AudioRouteStatus {
  ready_to_record: boolean;
  routing_active: boolean;
  auto_routing: boolean;
  physical_output?: string;
  missing?: string[];
}

export function useRecorder(onSaved?: (recording: Recording) => void) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState('00:00');
  const [signalLevel, setSignalLevel] = useState('-∞ dB');
  const [progressText, setProgressText] = useState(t('recording.progressNone'));
  const [statusText, setStatusText] = useState(t('recording.statusReady'));
  const [statusState, setStatusState] = useState<'ready' | 'recording' | 'paused' | 'working' | 'error' | 'success'>('ready');
  
  const [microphones, setMicrophones] = useState<AudioDevice[]>([]);
  const [systemDevices, setSystemDevices] = useState<AudioDevice[]>([]);
  const [selectedMicrophone, setSelectedMicrophone] = useState('');
  const [selectedSystemDevice, setSelectedSystemDevice] = useState('');
  const [audioRouteStatus, setAudioRouteStatus] = useState<AudioRouteStatus | null>(null);
  const [isTestRouted, setIsTestRouted] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Audio Context Ref
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]);
  const mixDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<any>(null);
  
  // Session State
  const sessionIdRef = useRef<string | null>(null);
  const sequenceRef = useRef(0);
  const uploadChainRef = useRef<Promise<any>>(Promise.resolve());
  const startedAtRef = useRef(0);
  const routeActivatedRef = useRef(false);

  // Canvas Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const isAggregateInput = (label: string) => {
    const normalized = label.toLowerCase();
    return normalized.includes('aggregate') || normalized.includes('combinat') || normalized.includes('local asr input');
  };

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');

      const mics: AudioDevice[] = [];
      const sysDevices: AudioDevice[] = [];

      inputs.forEach((device, index) => {
        const label = device.label || t('recording.audioInputLabel', { index: index + 1 });
        const isBlackHole = label.toLowerCase().includes('blackhole');
        const isAggregate = isAggregateInput(label);

        if (isBlackHole) {
          sysDevices.push({ deviceId: device.deviceId, label });
        } else if (!isAggregate) {
          mics.push({ deviceId: device.deviceId, label });
        }
      });

      setMicrophones(mics);
      setSystemDevices(sysDevices);

      if (sysDevices.length > 0 && !selectedSystemDevice) {
        setSelectedSystemDevice(sysDevices[0].deviceId);
      }
    } catch (error) {
      console.warn('Unable to enumerate audio devices:', error);
    }
  }, [t, selectedSystemDevice]);

  const refreshAudioStatus = useCallback(async () => {
    try {
      const status = await ApiClient.getAudioRouteStatus();
      setAudioRouteStatus(status);
    } catch {
      setAudioRouteStatus(null);
    }
  }, []);

  // Initialize and load devices
  useEffect(() => {
    loadDevices();
    refreshAudioStatus();

    const handleDeviceChange = () => {
      loadDevices();
      refreshAudioStatus();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    
    // Check if there was an interrupted recording session
    const storedId = localStorage.getItem('asr-active-recording-id');
    if (storedId) {
      ApiClient.getRecording(storedId).then((recording: Recording) => {
        if (recording.stopped_at === null || recording.duration_seconds === null) {
          setStatusText(t('recording.sessionInterrupted'));
          setProgressText(t('recording.pageClosedWarning'));
        }
        localStorage.removeItem('asr-active-recording-id');
      }).catch(() => {
        localStorage.removeItem('asr-active-recording-id');
      });
    }

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [loadDevices, refreshAudioStatus, t]);

  const stopAudioMeter = useCallback((closeContext = true) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    analyserRef.current = null;

    if (closeContext && audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      context?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setSignalLevel('-∞ dB');
  }, []);

  const drawAudioMeter = useCallback(() => {
    const analyser = analyserRef.current;
    const canvas = canvasRef.current;
    if (!analyser || !canvas) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const context = canvas.getContext('2d');
    if (!context) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Theme colors fallback
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#9f74ff';
    const accentHover = styles.getPropertyValue('--accent-hover').trim() || '#b89aff';
    const muted = styles.getPropertyValue('--border-subtle').trim() || 'rgba(255,255,255,.08)';
    
    const barCount = 60;
    const gap = 4;
    const barWidth = (width - gap * (barCount - 1)) / barCount;
    let sumSquares = 0;

    context.clearRect(0, 0, width, height);

    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, accentHover);
    gradient.addColorStop(0.5, accent);
    gradient.addColorStop(1, accentHover);

    for (let index = 0; index < barCount; index += 1) {
      const sampleIndex = Math.floor(index * dataArray.length / barCount);
      const normalized = dataArray[sampleIndex] / 255;
      sumSquares += normalized * normalized;
      
      const minHeight = 6;
      const barHeight = Math.max(minHeight, normalized * (height * 0.85));
      const y = (height - barHeight) / 2;

      context.fillStyle = normalized > 0.05 ? gradient : muted;
      
      context.beginPath();
      // Round Rect support
      if (context.roundRect) {
        context.roundRect(index * (barWidth + gap), y, barWidth, barHeight, barWidth / 2);
      } else {
        context.rect(index * (barWidth + gap), y, barWidth, barHeight);
      }
      context.fill();
    }

    const rms = Math.sqrt(sumSquares / barCount);
    const decibels = rms > 0 ? Math.max(-48, 20 * Math.log10(rms)) : -48;
    setSignalLevel(decibels <= -47.5 ? '-∞ dB' : `${decibels.toFixed(1)} dB`);

    animationFrameRef.current = requestAnimationFrame(drawAudioMeter);
  }, []);

  const startAudioMeter = useCallback((streamOrNode: AudioNode | MediaStream) => {
    stopAudioMeter(false);
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    
    if (streamOrNode instanceof AudioNode) {
      audioContextRef.current = streamOrNode.context as AudioContext;
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.78;
      streamOrNode.connect(analyserRef.current);
    } else {
      audioContextRef.current = new AudioContextClass();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 512;
      analyserRef.current.smoothingTimeConstant = 0.78;
      audioContextRef.current.createMediaStreamSource(streamOrNode).connect(analyserRef.current);
    }

    drawAudioMeter();
  }, [drawAudioMeter, stopAudioMeter]);

  const releaseMedia = useCallback(() => {
    stopAudioMeter();
    sourceStreamsRef.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    sourceStreamsRef.current = [];
    mediaRecorderRef.current = null;
  }, [stopAudioMeter]);

  const restoreAudioRoute = useCallback(async () => {
    if (!routeActivatedRef.current) return;
    try {
      await ApiClient.testAudioRestore();
    } catch (error) {
      console.warn('Unable to restore the original audio route:', error);
    } finally {
      routeActivatedRef.current = false;
      setIsTestRouted(false);
      refreshAudioStatus();
    }
  }, [refreshAudioStatus]);

  const stopRecording = useCallback(async () => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    setStatusText(t('recording.finalizing'));
    setStatusState('working');

    if (mediaRecorder.state === 'recording') {
      try {
        mediaRecorder.requestData();
      } catch { /* ignore */ }
      // Brief delay to flush chunks
      await new Promise((r) => setTimeout(r, 150));
    }

    const recorderStopped = new Promise<void>((resolve) => {
      mediaRecorder.addEventListener('stop', () => resolve(), { once: true });
    });
    mediaRecorder.stop();
    await recorderStopped;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    releaseMedia();

    const sessionId = sessionIdRef.current;
    try {
      await uploadChainRef.current;
      if (sessionId) {
        const recording = await ApiClient.stopRecording(sessionId);
        localStorage.removeItem('asr-active-recording-id');
        sessionIdRef.current = null;
        setStatusText(t('recording.saved'));
        setStatusState('success');
        setProgressText(t('recording.audioCompleteSaved'));
        setIsRecording(false);
        if (onSaved) onSaved(recording);
      }
    } catch (error: any) {
      setStatusText(t('common.error'));
      setStatusState('error');
      showToast(t('recording.finalizationFailed', { error: error.message }), 'error');
    } finally {
      await restoreAudioRoute();
    }
  }, [t, onSaved, releaseMedia, restoreAudioRoute, showToast]);

  const getAudioStream = async (deviceId: string, voiceProcessing: boolean) => {
    if (!deviceId && !voiceProcessing) {
      throw new Error(t('recording.blackholeInputRequiredError'));
    }
    const constraints: MediaTrackConstraints = {
      echoCancellation: voiceProcessing,
      noiseSuppression: voiceProcessing,
      autoGainControl: voiceProcessing,
    };
    if (deviceId) constraints.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ audio: constraints });
  };

  const uploadChunk = async (blob: Blob, chunkSequence: number) => {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    try {
      const metadata = await ApiClient.appendRecordingChunk(sessionId, chunkSequence, blob);
      const sizeStr = metadata.bytes_written > 1024 * 1024
        ? `${(metadata.bytes_written / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(metadata.bytes_written / 1024)} KB`;
      setProgressText(t('recording.chunksSaved', { count: metadata.chunk_count, size: sizeStr }));
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const startRecording = useCallback(async (title: string, projectName = '', language = '', mode: 'both' | 'mic_only' | 'pc_only' = 'both') => {
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) {
      showToast(t('recording.unsupportedBrowser'), 'error');
      return;
    }

    setStatusText(t('recording.audioSetupTitle'));
    setStatusState('working');
    try {
      // 1. Audio Routing
      if (mode !== 'mic_only') {
        const routing = await ApiClient.testAudioRoute();
        if (routing.success) {
          await new Promise((r) => setTimeout(r, 500));
          await loadDevices();
          routeActivatedRef.current = true;
        } else {
          throw new Error(t('recording.setupAudioError'));
        }
      }

      // 2. Audio Streams setup
      setStatusText(t('recording.accessingSources'));
      sourceStreamsRef.current = [];
      let micStream = null;

      if (mode !== 'pc_only') {
        micStream = await getAudioStream(selectedMicrophone, true);
        sourceStreamsRef.current.push(micStream);
        const track = micStream.getAudioTracks()[0];
        if (track && isAggregateInput(track.label || '')) {
          throw new Error(t('recording.aggregateDeviceError'));
        }
        await loadDevices();
      } else if (!selectedSystemDevice) {
        // Unlock permissions
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        permissionStream.getTracks().forEach((track) => track.stop());
        await loadDevices();
      }

      const systemStream = mode !== 'mic_only' ? await getAudioStream(selectedSystemDevice, false) : null;
      if (systemStream) sourceStreamsRef.current.push(systemStream);

      // 3. Audio graph mixing
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioContextClass();
      audioContextRef.current = actx;
      if (actx.state === 'suspended') {
        await actx.resume();
      }

      const destNode = actx.createMediaStreamDestination();
      destNode.channelCount = 2;
      mixDestinationRef.current = destNode;

      const mixBus = actx.createGain();
      mixBus.gain.value = 1;

      sourceStreamsRef.current.forEach((stream) => {
        actx.createMediaStreamSource(stream).connect(mixBus);
      });
      mixBus.connect(destNode);

      // Chrome Workaround for active graph
      const silentGain = actx.createGain();
      silentGain.gain.value = 0.0;
      mixBus.connect(silentGain);
      silentGain.connect(actx.destination);

      startAudioMeter(mixBus);

      // 4. Create Backend Recording
      const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || '';

      const session = await ApiClient.createRecording({
        title: title || t('recording.untitledRecording'),
        project_name: projectName,
        mime_type: mimeType,
        language: language || undefined,
      });

      sessionIdRef.current = session.id;
      localStorage.setItem('asr-active-recording-id', session.id);
      sequenceRef.current = 0;
      uploadChainRef.current = Promise.resolve();

      // 5. Start MediaRecorder
      const mediaRecorder = mimeType
        ? new MediaRecorder(destNode.stream, { mimeType })
        : new MediaRecorder(destNode.stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener('dataavailable', (event) => {
        if (!event.data || event.data.size === 0 || !sessionIdRef.current) return;
        const currentSequence = sequenceRef.current++;
        uploadChainRef.current = uploadChainRef.current.then(() => uploadChunk(event.data, currentSequence));
        uploadChainRef.current.catch((error) => {
          setStatusText(t('common.error'));
          setStatusState('error');
          showToast(t('recording.chunkSaveFailed', { error: error.message }), 'error');
        });
      });

      mediaRecorder.addEventListener('error', (event: any) => {
        showToast(t('recording.error', { error: event.error?.message || 'unknown' }), 'error');
      });

      mediaRecorder.start(RECORDING_CHUNK_INTERVAL_MS);

      // 6. Timer and state
      startedAtRef.current = Date.now();
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const secs = (elapsed % 60).toString().padStart(2, '0');
        setTimer(`${mins}:${secs}`);
      }, 250);

      setIsRecording(true);
      setStatusText(t('recording.statusRecording'));
      setStatusState('recording');
      setProgressText(t('recording.progressSaving'));

    } catch (error: any) {
      releaseMedia();
      await restoreAudioRoute();
      setStatusText(t('common.error'));
      setStatusState('error');
      showToast(t('recording.startFailed', { error: error.message }), 'error');
    }
  }, [t, selectedMicrophone, selectedSystemDevice, startAudioMeter, loadDevices, releaseMedia, restoreAudioRoute, showToast]);

  const toggleTestAudioRoute = async () => {
    setIsVerifying(true);
    try {
      if (!isTestRouted) {
        const data = await ApiClient.testAudioRoute();
        if (data.success) {
          setIsTestRouted(true);
          routeActivatedRef.current = true;
          showToast(t('recording.routingActive', { devices: `${data.output_device} / ${data.input_device}` }), 'success');
        } else {
          showToast(t('recording.routingActiveFailed'), 'error');
        }
      } else {
        const data = await ApiClient.testAudioRestore();
        if (data.success) {
          setIsTestRouted(false);
          routeActivatedRef.current = false;
          showToast(t('recording.routingRestoreSuccess'), 'success');
        } else {
          showToast(t('recording.routingRestoreFailed'), 'error');
        }
      }
      refreshAudioStatus();
    } catch (error: any) {
      showToast(t('recording.routingTestError', { error: error.message }), 'error');
    } finally {
      setIsVerifying(false);
    }
  };

  const verifyAudioSetup = async () => {
    setIsVerifying(true);
    await loadDevices();
    await refreshAudioStatus();
    setIsVerifying(false);
  };

  // Cleanups on unload
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isRecording) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    const handlePageHide = () => {
      if (routeActivatedRef.current) {
        navigator.sendBeacon?.('/v1/system/audio/restore');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isRecording]);

  return {
    isRecording,
    timer,
    signalLevel,
    progressText,
    statusText,
    statusState,
    microphones,
    systemDevices,
    selectedMicrophone,
    selectedSystemDevice,
    audioRouteStatus,
    isTestRouted,
    isVerifying,
    canvasRef,
    setSelectedMicrophone,
    setSelectedSystemDevice,
    startRecording,
    stopRecording,
    toggleTestAudioRoute,
    verifyAudioSetup,
    refreshAudioStatus,
  };
}
