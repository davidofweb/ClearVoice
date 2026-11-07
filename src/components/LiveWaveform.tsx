import React, { useEffect, useRef } from 'react';
import { RecordingMode } from '../types/audio';

interface LiveWaveformProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
  isPaused: boolean;
  gateOpen: boolean;
  mode: RecordingMode;
}

export const LiveWaveform: React.FC<LiveWaveformProps> = ({
  analyser,
  isRecording,
  isPaused,
  gateOpen,
  mode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const fftSize = analyser ? analyser.fftSize : 512;
    const timeData = new Float32Array(fftSize);
    const freqData = new Uint8Array(analyser ? analyser.frequencyBinCount : 256);

    const render = () => {
      // Resize handling for device pixel ratio (sharp on iPhone)
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width * dpr);
      const displayHeight = Math.floor(rect.height * dpr);

      if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;
      const centerY = height / 2;

      // Dark studio background
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, width, height);

      // Subtle horizontal studio center line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Subtle frequency grid markings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      for (let x = 40; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      if (analyser && !isPaused) {
        analyser.getFloatTimeDomainData(timeData);
        analyser.getByteFrequencyData(freqData);

        // Render multi-band vertical sound bars
        const numBars = 48;
        const barWidth = Math.max(3, (width - (numBars * 3)) / numBars);
        const barGap = 3;
        const step = Math.floor(freqData.length / numBars);

        for (let i = 0; i < numBars; i++) {
          const freqVal = freqData[i * step] || 0;
          const normalized = freqVal / 255;
          // Apply gate suppression visually
          const gateFactor = gateOpen ? 1 : 0.15;
          const barHeight = Math.max(4, normalized * (height * 0.82) * gateFactor);
          const x = i * (barWidth + barGap) + (width - (numBars * (barWidth + barGap))) / 2;
          const y = centerY - barHeight / 2;

          // Color gradient based on state
          const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
          if (isRecording) {
            if (gateOpen) {
              // Vibrant studio red / coral glow
              grad.addColorStop(0, '#f87171');
              grad.addColorStop(0.5, '#ef4444');
              grad.addColorStop(1, '#b91c1c');
            } else {
              // Gated ambient: subdued slate
              grad.addColorStop(0, '#52525b');
              grad.addColorStop(1, '#27272a');
            }
          } else {
            // Live preview / standby mode
            if (gateOpen) {
              // Electric emerald voice focus
              grad.addColorStop(0, '#34d399');
              grad.addColorStop(0.5, '#10b981');
              grad.addColorStop(1, '#059669');
            } else {
              grad.addColorStop(0, '#3f3f46');
              grad.addColorStop(1, '#18181b');
            }
          }

          ctx.fillStyle = grad;
          // Draw rounded pill bar
          const radius = Math.min(barWidth / 2, barHeight / 2);
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, radius);
          ctx.fill();

          // Peak needle dot above bar
          if (normalized > 0.3 && gateOpen) {
            ctx.fillStyle = isRecording ? '#fca5a5' : '#6ee7b7';
            ctx.beginPath();
            ctx.arc(x + barWidth / 2, y - 4, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Secondary smooth fluid oscilloscope line in background
        ctx.beginPath();
        const sliceWidth = width / timeData.length;
        let startX = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = timeData[i] * (gateOpen ? 1 : 0.12);
          const y = centerY + v * (height * 0.45);
          if (i === 0) ctx.moveTo(startX, y);
          else ctx.lineTo(startX, y);
          startX += sliceWidth;
        }
        ctx.strokeStyle = isRecording 
          ? (gateOpen ? 'rgba(239, 68, 68, 0.4)' : 'rgba(113, 113, 122, 0.2)') 
          : (gateOpen ? 'rgba(16, 185, 129, 0.35)' : 'rgba(82, 82, 91, 0.15)');
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        // Idle baseline bars
        const numBars = 36;
        const barWidth = 4;
        const spacing = (width - 40) / numBars;
        for (let i = 0; i < numBars; i++) {
          const x = 20 + i * spacing;
          const idleHeight = 4 + Math.sin(Date.now() / 350 + i * 0.4) * 2;
          ctx.fillStyle = '#27272a';
          ctx.beginPath();
          ctx.roundRect(x, centerY - idleHeight / 2, barWidth, idleHeight, 2);
          ctx.fill();
        }
      }

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [analyser, isRecording, isPaused, gateOpen, mode]);

  return (
    <div className="relative w-full h-44 sm:h-52 rounded-2xl overflow-hidden border border-zinc-800/80 bg-zinc-950/90 shadow-2xl backdrop-blur-xl">
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Floating Status Badges inside the waveform */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <div className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 backdrop-blur-md border ${
          gateOpen 
            ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-400' 
            : 'bg-zinc-900/80 border-zinc-700/50 text-zinc-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${gateOpen ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
          {gateOpen ? 'Voice Isolated' : 'Noise Gated'}
        </div>

        {isRecording && (
          <div className="px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-red-950/80 border border-red-500/50 text-red-400 flex items-center gap-1.5 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            {isPaused ? 'Paused' : 'Recording Clean'}
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 text-[11px] font-bold text-zinc-500 uppercase tracking-widest pointer-events-none bg-zinc-900/60 px-2.5 py-1 rounded-lg border border-zinc-800">
        48 kHz • 16-Bit PCM
      </div>
    </div>
  );
};
