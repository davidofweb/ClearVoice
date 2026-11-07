import React, { useState } from 'react';
import { Volume2, CheckCircle2, Sliders, X } from 'lucide-react';

interface RoomCalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrate: (onProgress: (percent: number) => void) => Promise<number>;
  onCalibrationComplete: (floorDb: number) => void;
}

export const RoomCalibrationModal: React.FC<RoomCalibrationModalProps> = ({
  isOpen,
  onClose,
  onCalibrate,
  onCalibrationComplete,
}) => {
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [measuredDb, setMeasuredDb] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleStartCalibration = async () => {
    setIsCalibrating(true);
    setProgress(0);
    setMeasuredDb(null);

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }

    try {
      const resultDb = await onCalibrate((p) => setProgress(p));
      setMeasuredDb(resultDb);
      onCalibrationComplete(resultDb);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 50, 40]);
      }
    } catch (err) {
      console.error('Calibration error', err);
    } finally {
      setIsCalibrating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
        <button
          onClick={onClose}
          disabled={isCalibrating}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black tracking-tight text-white">Room Noise Profile</h3>
            <p className="text-xs text-zinc-400">2-Second Room Silence Calibration</p>
          </div>
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed mb-5">
          Stay quiet for 2 seconds. The recorder will sample your room noise (fan, AC, generator, traffic) and subtract it from your voice recordings.
        </p>

        {isCalibrating ? (
          <div className="space-y-4 my-6">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-amber-400 animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Listening to Room Silence...
              </span>
              <span className="font-mono text-zinc-300">{progress}%</span>
            </div>

            <div className="h-3 w-full bg-zinc-950 rounded-full overflow-hidden p-0.5 border border-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-75"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-zinc-400 text-center font-bold">
              Please do not speak right now
            </div>
          </div>
        ) : measuredDb !== null ? (
          <div className="my-5 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-emerald-400 font-black text-sm">
              <CheckCircle2 className="w-5 h-5" />
              Room Profile Calibrated!
            </div>
            <div className="text-2xl font-black text-white font-mono">
              {measuredDb} dB
            </div>
            <p className="text-[11px] text-emerald-300 font-medium">
              Background hum and fan noise are locked and subtracted.
            </p>
          </div>
        ) : (
          <div className="my-4 p-4 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 flex items-center gap-3">
            <Volume2 className="w-5 h-5 text-zinc-400 shrink-0" />
            <div className="text-xs text-zinc-400 font-medium">
              Ready to sample room silence in this room.
            </div>
          </div>
        )}

        <div className="flex gap-2.5 mt-5">
          {measuredDb !== null ? (
            <button
              onClick={onClose}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-sm transition shadow-lg shadow-emerald-500/20"
            >
              Done & Start Recording
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={isCalibrating}
                className="w-1/3 py-3 px-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-extrabold text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleStartCalibration}
                disabled={isCalibrating}
                className="w-2/3 py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 font-black text-sm transition shadow-lg shadow-amber-500/20"
              >
                {isCalibrating ? 'Calibrating...' : 'Sample 2s Silence'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
