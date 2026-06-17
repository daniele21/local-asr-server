import { useState, useEffect } from 'react';
import { ApiClient } from '../api/apiClient';

export default function RecordingOverlayPage() {
  const [timer, setTimer] = useState('00:00');
  const [signalLevel, setSignalLevel] = useState('-∞ dB');
  const [progressText, setProgressText] = useState('In attesa...');
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    // Listen to status broadcasts from the main recorder window
    const bc = new BroadcastChannel('closedroom-recording');
    
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'status') {
        setIsRecording(data.isRecording);
        setTimer(data.timer);
        setSignalLevel(data.signalLevel);
        setProgressText(data.progressText);

        // Auto-close browser popup after a short delay when recording completes/stops
        if (!data.isRecording && window.name === 'ClosedRoomOverlay') {
          setTimeout(() => {
            window.close();
          }, 1500);
        }
      }
    };

    bc.addEventListener('message', handleMessage);
    
    // Request initial state on mount
    bc.postMessage({ type: 'request-status' });

    return () => {
      bc.removeEventListener('message', handleMessage);
      bc.close();
    };
  }, []);

  const handleStop = () => {
    const bc = new BroadcastChannel('closedroom-recording');
    bc.postMessage({ type: 'command', action: 'stop' });
    bc.close();
  };

  const handleCloseOverlay = async () => {
    if (window.name === 'ClosedRoomOverlay') {
      window.close();
    } else {
      await ApiClient.toggleOverlay(false);
    }
  };

  // Calculate dB percentage for progress bar
  const dbVal = parseFloat(signalLevel.replace(' dB', ''));
  const minDb = -48;
  const maxDb = 0;
  const dbPercentage = isNaN(dbVal)
    ? 0
    : Math.min(100, Math.max(0, ((dbVal - minDb) / (maxDb - minDb)) * 100));

  return (
    <div className="h-screen w-screen bg-[rgba(19,16,45,0.92)] text-white p-3 select-none flex flex-col justify-between overflow-hidden border border-white/10 rounded-xl">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] ${
              isRecording ? 'animate-pulse' : 'opacity-40'
            }`}
          ></span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-text-secondary">
            ClosedRoom
          </span>
        </div>
        
        {/* Monospace Timer */}
        <span className="text-sm font-mono font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5">
          {timer}
        </span>
        
        {/* Close Button */}
        <button
          onClick={handleCloseOverlay}
          className="text-text-muted hover:text-white transition-colors cursor-pointer w-4 h-4 flex items-center justify-center text-[10px] font-bold bg-white/5 hover:bg-white/10 rounded-full"
          title="Nascondi miniatura"
        >
          ✕
        </button>
      </div>

      {/* Middle Progress Text */}
      <div className="text-[11px] text-text-secondary truncate font-medium">
        {progressText}
      </div>

      {/* Bottom Bar: DB Signal Level + Stop Control */}
      <div className="flex items-center gap-3">
        {/* dB Signal Level Visualizer */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 relative">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-75 rounded-full"
              style={{ width: `${dbPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[8px] text-text-muted font-mono leading-none">
            <span>-48 dB</span>
            <span className="font-bold text-text-secondary">{signalLevel}</span>
            <span>0 dB</span>
          </div>
        </div>

        {/* Circular Stop Button */}
        <button
          onClick={handleStop}
          className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-red-500/10 cursor-pointer"
          title="Ferma Registrazione"
        >
          <div className="w-2.5 h-2.5 bg-white rounded-sm"></div>
        </button>
      </div>
    </div>
  );
}
