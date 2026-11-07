import React from 'react';
import { NoiseMetrics } from '../types/audio';

interface VoiceNoiseMeterProps {
  metrics: NoiseMetrics;
}

export const VoiceNoiseMeter: React.FC<VoiceNoiseMeterProps> = ({ metrics }) => {
  // Map dB (-60 to 0) to percentage 0 - 100
  const voicePercent = Math.min(100, Math.max(0, Math.round(((metrics.voiceLevelDb + 60) / 60) * 100)));
  const noisePercent = Math.min(100, Math.max(0, Math.round(((metrics.noiseFloorDb + 60) / 60) * 100)));
  const suppressionDb = Math.max(0, metrics.rawLevelDb - metrics.voiceLevelDb);

  return (
    <div className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 backdrop-blur-xl shadow-lg">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
            Acoustic Spectrum & Clarity
          </span>
        </div>

        {/* Real-time Voice Clarity Score */}
        <div className="flex items-baseline gap-1.5 bg-zinc-800/80 border border-zinc-700/60 px-3 py-1 rounded-xl">
          <span className="text-[10px] uppercase font-bold text-zinc-400">Clarity</span>
          <span className="text-base font-black text-emerald-400 tracking-tight">
            {metrics.clarityPercent}%
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Voice Level (Clean Close Voice) */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-extrabold text-zinc-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Voice Level (Speech)
            </span>
            <span className="font-bold text-emerald-400 font-mono">
              {metrics.voiceLevelDb > -58 ? `${metrics.voiceLevelDb} dB` : 'Muted'}
            </span>
          </div>
          <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden p-0.5 border border-zinc-800/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-75 shadow-sm"
              style={{ width: `${voicePercent}%` }}
            />
          </div>
        </div>

        {/* Noise Floor Level (Suppressed Ambient Noise) */}
        <div>
          <div className="flex justify-between items-center text-xs mb-1">
            <span className="font-extrabold text-zinc-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              Noise Floor (Room / Fan)
            </span>
            <span className="font-bold text-amber-500 font-mono">
              {metrics.noiseFloorDb} dB
            </span>
          </div>
          <div className="h-2 w-full bg-zinc-950 rounded-full overflow-hidden p-0.5 border border-zinc-800/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-600 to-orange-500 transition-all duration-150 opacity-80"
              style={{ width: `${noisePercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Suppression Delta Footer */}
      <div className="mt-3 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400 font-bold">
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">Noise Cut:</span>
          <span className="text-emerald-400 font-extrabold">
            {suppressionDb > 0 ? `-${suppressionDb} dB reduction` : 'Optimized'}
          </span>
        </div>
        <div className="text-zinc-500">
          Proximity: <span className="text-zinc-300 font-extrabold">&lt; 1.0m focus</span>
        </div>
      </div>
    </div>
  );
};
