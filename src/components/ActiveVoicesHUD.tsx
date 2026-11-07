import React from 'react';
import { RecordingMode, VoiceSpeakerState } from '../types/audio';
import { Users, User, Mic } from 'lucide-react';

interface ActiveVoicesHUDProps {
  speakers: VoiceSpeakerState[];
  mode: RecordingMode;
}

export const ActiveVoicesHUD: React.FC<ActiveVoicesHUDProps> = ({ speakers, mode }) => {
  const allowedSlots = mode === 'solo' ? 1 : mode === 'interview' ? 2 : 4;

  return (
    <div className="w-full bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          {mode === 'solo' ? (
            <User className="w-4 h-4 text-emerald-400" />
          ) : (
            <Users className="w-4 h-4 text-cyan-400" />
          )}
          <span className="text-xs font-black uppercase tracking-wider text-zinc-300">
            Voice Proximity Grid (Max 4)
          </span>
        </div>
        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60">
          {mode === 'solo' ? '1 Close Voice' : mode === 'interview' ? '2 Voices' : '4 Voices Tracked'}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {speakers.map((spk, idx) => {
          const isSlotActive = idx < allowedSlots;
          const isSpeaking = spk.active && isSlotActive;

          return (
            <div
              key={spk.id}
              className={`rounded-xl p-2.5 border transition-all duration-200 flex flex-col justify-between ${
                !isSlotActive
                  ? 'bg-zinc-950/40 border-zinc-800/40 opacity-40'
                  : isSpeaking
                  ? 'bg-emerald-950/40 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                  : 'bg-zinc-900/70 border-zinc-800/70'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-black tracking-tight ${isSpeaking ? 'text-emerald-300' : 'text-zinc-400'}`}>
                  {spk.name}
                </span>
                <span className={`w-2 h-2 rounded-full ${
                  !isSlotActive ? 'bg-zinc-700' : isSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                }`} />
              </div>

              {isSlotActive ? (
                <div>
                  <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-100 rounded-full ${
                        isSpeaking ? 'bg-emerald-400' : 'bg-zinc-700'
                      }`}
                      style={{ width: `${isSpeaking ? spk.level : 4}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[9px] font-bold text-zinc-500">
                      {isSpeaking ? 'Active' : 'Listening'}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-400">
                      {isSpeaking ? `${spk.level}%` : '0%'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] font-bold text-zinc-600 text-center py-1">
                  Muted (Mode)
                </div>
              )}
            </div>
          );
        })}
      </div>

      {mode === 'meeting' && (
        <div className="mt-2 text-[10px] text-zinc-500 font-semibold flex items-center justify-center gap-1">
          <Mic className="w-3 h-3 text-zinc-400" />
          5th+ distant room voices are automatically rejected
        </div>
      )}
    </div>
  );
};
