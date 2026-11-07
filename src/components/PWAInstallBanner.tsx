import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed as standalone PWA, hide
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {isInstallable && (
        <button
          onClick={install}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-600/90 hover:bg-red-500 text-white text-xs font-black transition shadow-lg shadow-red-600/20 active:scale-95 border border-red-400/40"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Install App</span>
        </button>
      )}

      {isIOS && (
        <>
          <button
            onClick={() => setShowIOSGuide(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-black transition border border-zinc-700 active:scale-95"
          >
            <Download className="w-3.5 h-3.5 text-red-400" />
            <span>Install on iPhone</span>
          </button>

          {showIOSGuide && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
              <div className="w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-black text-white">Install on iPhone</h3>
                  <button
                    onClick={() => setShowIOSGuide(false)}
                    className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs text-zinc-300">
                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800">
                    <div className="p-2 rounded-xl bg-zinc-800 text-cyan-400 shrink-0">
                      <Share className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-white mb-0.5">Step 1</strong>
                      Tap the <span className="text-white font-bold">Share button</span> at the bottom of Safari.
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-2xl bg-zinc-950/70 border border-zinc-800">
                    <div className="p-2 rounded-xl bg-zinc-800 text-emerald-400 shrink-0">
                      <PlusSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <strong className="block text-white mb-0.5">Step 2</strong>
                      Scroll down and tap <span className="text-white font-bold">Add to Home Screen</span>.
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="mt-5 w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 font-extrabold text-xs text-white transition"
                >
                  Got It
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};
