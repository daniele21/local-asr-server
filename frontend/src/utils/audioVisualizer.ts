export interface VisualizerLevels {
  dbMic: number;
  dbSys: number;
  dbCombined: number;
}

export function drawAudioMeterOnCanvas(
  canvas: HTMLCanvasElement,
  micAnalyser: AnalyserNode | null,
  systemAnalyser: AnalyserNode | null,
  isNative: boolean,
  currentMicDb: number,
  currentSysDb: number
): VisualizerLevels {
  const context = canvas.getContext('2d');
  if (!context) {
    return { dbMic: -120, dbSys: -120, dbCombined: -120 };
  }

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
  
  context.clearRect(0, 0, width, height);

  const drawHalf = (
    analyser: AnalyserNode | null,
    yOffset: number,
    halfHeight: number,
    label: string
  ): number => {
    let sumSquares = 0;
    let dataArray = new Uint8Array(0);

    if (analyser) {
      const bufferLength = analyser.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);
    }

    const gradient = context.createLinearGradient(0, yOffset, 0, yOffset + halfHeight);
    gradient.addColorStop(0, accentHover);
    gradient.addColorStop(0.5, accent);
    gradient.addColorStop(1, accentHover);

    // Draw bars
    for (let index = 0; index < barCount; index += 1) {
      let normalized = 0;
      if (analyser && dataArray.length > 0) {
        const sampleIndex = Math.floor(index * dataArray.length / barCount);
        normalized = dataArray[sampleIndex] / 255;
      } else if (isNative) {
        const db = label.includes('MIC') ? currentMicDb : currentSysDb;
        if (db > -47.5) {
          const rms = Math.pow(10, db / 20);
          const wave = 0.4 + 0.6 * Math.sin(index * 0.2 + Date.now() * 0.015) * Math.cos(index * 0.05 + Date.now() * 0.005);
          normalized = Math.max(0, Math.min(1, rms * wave * 2.0));
        }
      }
      sumSquares += normalized * normalized;
      
      const minHeight = 4;
      const barHeight = Math.max(minHeight, normalized * (halfHeight * 0.8));
      const y = yOffset + (halfHeight - barHeight) / 2;

      context.fillStyle = normalized > 0.05 ? gradient : muted;
      
      context.beginPath();
      if ((context as any).roundRect) {
        (context as any).roundRect(index * (barWidth + gap), y, barWidth, barHeight, barWidth / 2);
      } else {
        context.rect(index * (barWidth + gap), y, barWidth, barHeight);
      }
      context.fill();
    }

    // Draw label
    context.fillStyle = 'rgba(255, 255, 255, 0.4)';
    context.font = 'bold 9px monospace';
    context.fillText(label, 10, yOffset + 14);

    if (isNative) {
      return label.includes('MIC') ? currentMicDb : currentSysDb;
    }
    const rms = Math.sqrt(sumSquares / barCount);
    const decibels = rms > 0 ? Math.max(-48, 20 * Math.log10(rms)) : -48;
    return decibels;
  };

  const halfH = height / 2;
  const dbMic = drawHalf(micAnalyser, 0, halfH, '🎙️ VOCI / MIC');
  const dbSys = drawHalf(systemAnalyser, halfH, halfH, '🖥️ AUDIO SISTEMA / PC');

  const maxDb = Math.max(dbMic, dbSys);

  return { dbMic, dbSys, dbCombined: maxDb };
}
