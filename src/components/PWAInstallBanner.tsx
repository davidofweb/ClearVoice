import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X, Shield, Sparkles, WifiOff, Mic2, CheckCircle2 } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);

  // If already installed as standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await install();
      if (outcome) {
        setShowModal(false);
      }
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/90 hover:bg-red-500 text-white text-xs font-black transition shadow-lg shadow-red-600/20 active:scale-95 border border-red-400/40"
        title="View PWA installation details and install on your phone"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install</span>
      </button>

      {/* Rich PWA Installation Modal with Detailed Description */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
              aria-label="Close installation window"
            >
              <X className="w-5 h-5" />
            </button>

            {/* App Header Badge */}
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-zinc-950 p-1 border border-zinc-700 shadow-xl shrink-0 flex items-center justify-center">
                <img src="/icon.svg" alt="ClearVoice Icon" className="w-12 h-12 rounded-xl" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white leading-tight">ClearVoice Recorder</h3>
                <p className="text-xs text-red-400 font-extrabold flex items-center gap-1 mt-0.5">
                  <Sparkles className="w-3 h-3" />
                  Studio Noise-Canceling PWA
                </p>
              </div>
            </div>

            {/* Rich App Description */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-zinc-800/80 mb-4">
              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                Install ClearVoice directly to your home screen for an instant, standalone studio recording experience. It isolates close voices within 1 meter and cuts fan hum, generator rumble, AC hiss, and market noise using 100% on-device audio DSP.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="space-y-2.5 mb-5 text-xs">
              <div className="flex items-center gap-2.5 text-zinc-300">
                <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
                <span><strong>100% Offline:</strong> Works anywhere without internet or data</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Mic2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span><strong>Proximity Voice Gate:</strong> Mutes distant chatter (&gt;1m)</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-300">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span><strong>Lossless 16-Bit WAV:</strong> Broadcast quality export to device</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-300">
                <Shield className="w-4 h-4 text-rose-400 shrink-0" />
                <span><strong>Private &amp; Local:</strong> No audio ever leaves your phone</span>
              </div>
            </div>

            {/* Platform-Specific Install Steps */}
            {isIOS ? (
              <div className="space-y-3 pt-3 border-t border-zinc-800/80 mb-5">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  How to Install on iPhone / iPad:
                </h4>
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs">
                  <Share className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-white font-bold">1. Tap the Share button</span> at the bottom of Safari.
                  </div>
                </div>
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-xs">
                  <PlusSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-white font-bold">2. Tap "Add to Home Screen"</span> to install as a full-screen app.
                  </div>
                </div>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {isInstallable ? (
                <button
                  onClick={handleInstallClick}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm transition shadow-xl shadow-red-600/25 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Install to Home Screen</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-black text-xs transition active:scale-95"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
