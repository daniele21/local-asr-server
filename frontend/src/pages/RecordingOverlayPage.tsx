import { useState, useEffect, useRef } from 'react';
import { ApiClient } from '../api/apiClient';

export default function RecordingOverlayPage() {
  const [timer, setTimer] = useState('00:00');
  const [signalLevelMic, setSignalLevelMic] = useState('-∞ dB');
  const [signalLevelSystem, setSignalLevelSystem] = useState('-∞ dB');
  const [progressText, setProgressText] = useState('In attesa...');
  const [isRecording, setIsRecording] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [title, setTitle] = useState('Nessuna registrazione attiva');
  const [captureBackend, setCaptureBackend] = useState<'browser' | 'native'>('browser');
  const [captureMode, setCaptureMode] = useState<string>('both');
  const [bytesWritten, setBytesWritten] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const timerIntervalRef = useRef<any>(null);
  const startedAtRef = useRef<number | null>(null);

  // Formatter helpers
  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 KB';
    if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const getPercentage = (dbVal: number) => {
    const minDb = -48;
    const maxDb = 0;
    return Math.min(100, Math.max(0, ((dbVal - minDb) / (maxDb - minDb)) * 100));
  };

  const formatDb = (db: number) => {
    return db <= -47.5 ? '-∞ dB' : `${db.toFixed(1)} dB`;
  };

  // Poll/Check state on mount and connect SSE/BroadcastChannel
  useEffect(() => {
    const bc = new BroadcastChannel('closedroom-recording');

    const handleBroadcastMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'status') {
        // If we get status, update state (useful for browser capture where SSE is not active,
        // or as local fast sync for signal levels)
        setIsRecording(data.isRecording);
        setTimer(data.timer);
        setSignalLevelMic(data.signalLevelMic || '-∞ dB');
        setSignalLevelSystem(data.signalLevelSystem || '-∞ dB');
        setProgressText(data.progressText);

        // Auto-close browser popup after a short delay when recording completes
        if (!data.isRecording && window.name === 'ClosedRoomOverlay') {
          setTimeout(() => {
            window.close();
          }, 1500);
        }
      } else if (data.type === 'ack' && data.action === 'stop') {
        // Broadcast ACK received! Stop is being handled.
        setIsStopping(false);
      }
    };

    bc.addEventListener('message', handleBroadcastMessage);

    // Initial check of active recording via backend
    const checkActiveRecording = async () => {
      try {
        const activeData = await ApiClient.getActiveRecording();
        if (activeData.active && activeData.recording_id) {
          setRecordingId(activeData.recording_id);
          setIsRecording(true);
          setTitle(activeData.title || 'Registrazione');
          setCaptureBackend(activeData.capture_backend || 'browser');
          setCaptureMode(activeData.capture_mode || 'both');
          setBytesWritten(activeData.bytes_written || 0);
          setWarnings(activeData.warnings || []);
          
          if (activeData.started_at) {
            startedAtRef.current = activeData.started_at * 1000;
            // Setup local smooth timer
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = setInterval(() => {
              if (startedAtRef.current) {
                const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                setTimer(`${mins}:${secs}`);
              }
            }, 500);
          }

          // Connect SSE event stream for native capture (or unified active stream)
          connectSSE(activeData.recording_id);
        } else {
          setIsRecording(false);
          setTimer('00:00');
          // Request status via BC in case it's a browser capture and server is out of sync
          bc.postMessage({ type: 'request-status' });
        }
      } catch (err) {
        console.error('Failed to get active recording from backend, falling back to BroadcastChannel:', err);
        bc.postMessage({ type: 'request-status' });
      }
    };

    const connectSSE = (recId: string) => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      const sse = new EventSource(`/v1/recordings/${recId}/overlay/events`);
      eventSourceRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data.active) {
            setIsRecording(false);
            setIsStopping(false);
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            setTimer('00:00');
            sse.close();
            
            // Auto close if popup window
            if (window.name === 'ClosedRoomOverlay') {
              setTimeout(() => window.close(), 1000);
            }
            return;
          }

          setIsRecording(true);
          setBytesWritten(data.bytes_written || 0);
          setSignalLevelMic(formatDb(data.mic_db));
          setSignalLevelSystem(formatDb(data.system_db));
          setWarnings(data.warnings || []);

          if (data.started_at && !startedAtRef.current) {
            startedAtRef.current = data.started_at * 1000;
          }
        } catch (err) {
          console.error('Error parsing SSE event:', err);
        }
      };

      sse.onerror = (err) => {
        console.warn('SSE event stream error, falling back:', err);
        sse.close();
      };
    };

    checkActiveRecording();

    return () => {
      bc.removeEventListener('message', handleBroadcastMessage);
      bc.close();
      if (eventSourceRef.current) eventSourceRef.current.close();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const handleStop = async () => {
    setIsStopping(true);
    setErrorMsg(null);

    // 1. Post command via BroadcastChannel (for browser UI fallback)
    const bc = new BroadcastChannel('closedroom-recording');
    bc.postMessage({ type: 'command', action: 'stop' });
    bc.close();

    // 2. Call direct backend endpoint
    if (recordingId) {
      try {
        await ApiClient.stopRecordingControl(recordingId);
        setIsStopping(false);
      } catch (err: any) {
        console.error('Stop control endpoint failed:', err);
        // Fallback: wait for BroadcastChannel timeout
        setTimeout(() => {
          setIsStopping((stillStopping) => {
            if (stillStopping) {
              setErrorMsg('Timeout stop backend. Riprova o torna alla finestra principale.');
              return false;
            }
            return stillStopping;
          });
        }, 2500);
      }
    } else {
      // If no recording ID found on backend, wait 1.5s for browser ACK
      setTimeout(() => {
        setIsStopping((stillStopping) => {
          if (stillStopping) {
            setErrorMsg('Nessun riscontro dal registratore browser.');
            return false;
          }
          return stillStopping;
        });
      }, 1500);
    }
  };

  const handleCloseOverlay = async () => {
    if (window.name === 'ClosedRoomOverlay') {
      window.close();
    } else {
      await ApiClient.toggleOverlay(false);
    }
  };

  const toggleExpand = async () => {
    const nextState = !isExpanded;
    setIsExpanded(nextState);
    const targetW = 300;
    const targetH = nextState ? 240 : 130;
    
    // Call Native Resize API
    try {
      await ApiClient.resizeOverlay(targetW, targetH);
    } catch (err) {
      console.warn('Resize overlay window failed:', err);
    }
  };

  // Convert dB levels to percentages
  const micVal = parseFloat(signalLevelMic.replace(' dB', ''));
  const sysVal = parseFloat(signalLevelSystem.replace(' dB', ''));
  const micPercentage = getPercentage(isNaN(micVal) ? -120 : micVal);
  const systemPercentage = getPercentage(isNaN(sysVal) ? -120 : sysVal);

  // Device health status check
  const getDeviceHealth = (dbStr: string) => {
    const val = parseFloat(dbStr.replace(' dB', ''));
    if (isNaN(val) || val <= -100) return { label: 'Assente/Muto', color: 'text-red-400 font-semibold' };
    if (val <= -45) return { label: 'Silente', color: 'text-yellow-400 font-semibold' };
    return { label: 'Attivo', color: 'text-green-400 font-semibold' };
  };

  const micHealth = getDeviceHealth(signalLevelMic);
  const systemHealth = getDeviceHealth(signalLevelSystem);

  return (
    <div className="h-screen w-screen bg-[rgba(15,12,38,0.95)] text-white p-3 select-none flex flex-col justify-between overflow-hidden border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isStopping
                ? 'bg-yellow-500 animate-ping'
                : isRecording
                ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)] animate-pulse'
                : 'bg-gray-500'
            }`}
          ></span>
          <span className="text-[10px] uppercase font-bold tracking-wider text-white/60">
            ClosedRoom
          </span>
        </div>
        
        {/* Monospace Timer */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/10 text-white/90">
            {timer}
          </span>
          {/* Toggle Expand/Collapse */}
          <button
            onClick={toggleExpand}
            className="text-[10px] text-white/60 hover:text-white transition-colors cursor-pointer w-5 h-5 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded"
            title={isExpanded ? 'Riduci' : 'Dettagli'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
        
        {/* Close Button */}
        <button
          onClick={handleCloseOverlay}
          className="text-white/40 hover:text-white transition-colors cursor-pointer w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-white/5 hover:bg-white/10 rounded-full"
          title="Nascondi"
        >
          ✕
        </button>
      </div>

      {/* Main content viewport */}
      <div className="flex-1 flex flex-col justify-center my-1.5 overflow-hidden">
        {isExpanded ? (
          // Expanded view
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-white/70 animate-fadeIn">
            <div className="col-span-2 font-medium truncate text-white border-b border-white/5 pb-1 mb-1">
              🎙️ {title}
            </div>
            <div>
              <span className="opacity-50">Backend:</span> <span className="font-semibold text-white/90 capitalize">{captureBackend}</span>
            </div>
            <div>
              <span className="opacity-50">Files:</span> <span className="font-semibold text-white/90">{formatBytes(bytesWritten)}</span>
            </div>
            <div>
              <span className="opacity-50">Mic:</span> <span className={micHealth.color}>{micHealth.label}</span>
            </div>
            <div>
              <span className="opacity-50">System:</span> <span className={systemHealth.color}>{systemHealth.label}</span>
            </div>
            {warnings.length > 0 && (
              <div className="col-span-2 text-yellow-400 truncate text-[9px] mt-0.5">
                ⚠️ {warnings[warnings.length - 1]}
              </div>
            )}
            {errorMsg && (
              <div className="col-span-2 text-red-400 text-[9px] mt-0.5 leading-snug">
                {errorMsg}
              </div>
            )}
          </div>
        ) : (
          // Compact view
          <div className="text-[11px] text-white/80 truncate font-medium flex items-center justify-between">
            <span className="truncate pr-2">{isStopping ? 'Terminazione...' : isRecording ? `In registrazione: ${title}` : 'In attesa...'}</span>
            {errorMsg && <span className="text-red-400 text-[9px] shrink-0 font-semibold">⚠️ Errore</span>}
          </div>
        )}
      </div>

      {/* Bottom Bar: dB Signal Level + Stop Control */}
      <div className="flex items-center gap-3">
        {/* dB Signal Level Visualizer */}
        <div className="flex-1 flex flex-col gap-1.5">
          {/* Mic level */}
          {captureMode !== 'pc_only' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] opacity-70" title="Microfono">🎙️</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-75 rounded-full"
                  style={{ width: `${micPercentage}%` }}
                ></div>
              </div>
              <span className="text-[8px] font-mono font-bold text-white/60 min-w-[32px] text-right">{signalLevelMic}</span>
            </div>
          )}

          {/* System level */}
          {captureMode !== 'mic_only' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] opacity-70" title="Audio di Sistema">🖥️</span>
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-75 rounded-full"
                  style={{ width: `${systemPercentage}%` }}
                ></div>
              </div>
              <span className="text-[8px] font-mono font-bold text-white/60 min-w-[32px] text-right">{signalLevelSystem}</span>
            </div>
          )}
        </div>

        {/* Circular Stop Button */}
        <button
          onClick={handleStop}
          disabled={isStopping || !isRecording}
          className={`w-9 h-9 rounded-full transition-all flex items-center justify-center shadow-lg cursor-pointer ${
            isStopping 
              ? 'bg-yellow-600 cursor-not-allowed opacity-60' 
              : !isRecording 
              ? 'bg-gray-700 cursor-not-allowed opacity-40' 
              : 'bg-red-500 hover:bg-red-600 active:scale-90 hover:shadow-red-500/20'
          }`}
          title="Ferma Registrazione"
        >
          {isStopping ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <div className="w-3 h-3 bg-white rounded-sm"></div>
          )}
        </button>
      </div>
    </div>
  );
}
