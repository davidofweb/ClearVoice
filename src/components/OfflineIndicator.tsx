import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-50 flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 border border-amber-500/50 px-4 py-2.5 text-xs font-black text-amber-300 shadow-2xl backdrop-blur-xl animate-fade-in">
      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
      <WifiOff className="w-4 h-4 text-amber-400" />
      <span>Offline Mode — Audio recording and noise filtering work 100% offline</span>
    </div>
  );
};
