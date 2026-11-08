import React, { useState, useRef, useEffect } from 'react';
import { SavedRecording } from '../types/audio';
import { 
  Play, 
  Pause, 
  Download, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  RotateCcw, 
  RotateCw, 
  Share2, 
  Sparkles,
  FileAudio
} from 'lucide-react';

interface RecordingsListProps {
  recordings: SavedRecording[];
  onDelete: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
}

export const RecordingsList: React.FC<RecordingsListProps> = ({
  recordings,
  onDelete,
  onRename,
}) => {
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, []);

  // When audioSrc changes, start playback cleanly
  useEffect(() => {
    if (audioSrc && audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('Playback notice:', err);
        setIsPlaying(false);
      });
    }
  }, [audioSrc]);

  const handlePlayRecording = (recording: SavedRecording) => {
    if (activeRecordingId === recording.id && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
      return;
    }

    // New recording selected
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    // Use WAV if available, otherwise blob
    const playableBlob = recording.wavBlob || recording.blob;
    if (!playableBlob || playableBlob.size === 0) {
      console.warn('Empty audio source');
      return;
    }

    const url = URL.createObjectURL(playableBlob);
    currentBlobUrlRef.current = url;
    setActiveRecordingId(recording.id);
    setCurrentTime(0);
    setDuration(recording.duration || 1);
    setAudioSrc(url);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + seconds));
    }
  };

  const togglePlaybackSpeed = () => {
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.8];
    const currentIndex = speeds.indexOf(playbackRate);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleDownload = (rec: SavedRecording, format: 'wav' | 'webm') => {
    const blobToDownload = format === 'wav' && rec.wavBlob ? rec.wavBlob : rec.blob;
    const ext = format === 'wav' ? 'wav' : 'webm';
    const url = URL.createObjectURL(blobToDownload);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rec.title.replace(/\s+/g, '_')}_clean.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShare = async (rec: SavedRecording) => {
    const blob = rec.wavBlob || rec.blob;
    const file = new File([blob], `${rec.title}.wav`, { type: 'audio/wav' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: rec.title,
          text: `Clean voice recording isolated with ClearVoice Recorder (${rec.clarityScore}% clarity).`,
          files: [file],
        });
      } catch {
        // Share cancelled or failed
      }
    } else {
      handleDownload(rec, 'wav');
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const startRename = (rec: SavedRecording) => {
    setEditingId(rec.id);
    setEditTitle(rec.title);
  };

  const saveRename = (id: string) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="w-full space-y-3">
      {/* Native audio element rendered strictly when valid audioSrc exists */}
      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration && !isNaN(audioRef.current.duration)) {
              setDuration(audioRef.current.duration);
            }
          }}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
          }}
        />
      )}

      {recordings.length === 0 ? null : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FileAudio className="w-4 h-4 text-emerald-400" />
              Clean Recordings ({recordings.length})
            </h3>
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
              Saved On Device
            </span>
          </div>
          {recordings.map((rec) => {
            const isActive = activeRecordingId === rec.id;

            return (
              <div
                key={rec.id}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isActive
                    ? 'bg-zinc-900/90 border-red-500/40 shadow-xl'
                    : 'bg-zinc-900/50 border-zinc-800/80 hover:border-zinc-700/80'
                }`}
              >
                <div className="p-4">
                  {/* Title & Metadata Header */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex-1 min-w-0">
                      {editingId === rec.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full bg-zinc-950 border border-emerald-500/60 rounded-lg px-2.5 py-1 text-sm font-bold text-white outline-none focus:ring-1 focus:ring-emerald-500"
                            autoFocus
                          />
                          <button
                            onClick={() => saveRename(rec.id)}
                            className="p-1 rounded-md bg-emerald-500 text-zinc-950"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 rounded-md bg-zinc-800 text-zinc-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-black text-white truncate">
                            {rec.title}
                          </h4>
                          <button
                            onClick={() => startRename(rec)}
                            className="text-zinc-500 hover:text-zinc-300 transition"
                            title="Rename"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 font-semibold flex-wrap">
                        <span className="font-mono text-zinc-300 font-bold">{formatTime(rec.duration)}</span>
                        <span>•</span>
                        <span>{formatFileSize(rec.sizeBytes)}</span>
                        <span>•</span>
                        <span className="capitalize">{rec.mode} Mode</span>
                      </div>
                    </div>

                    {/* Clarity Score Pill */}
                    <div className="shrink-0 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-xs font-black text-emerald-300 font-mono">
                        {rec.clarityScore}%
                      </span>
                    </div>
                  </div>

                  {/* Inline Audio Player Controls if Active */}
                  {isActive && (
                    <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2.5 animate-fade-in">
                      {/* Scrub Bar */}
                      <div className="space-y-1">
                        <input
                          type="range"
                          min={0}
                          max={duration || 1}
                          step={0.1}
                          value={currentTime}
                          onChange={handleSeek}
                          className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                        />
                        <div className="flex justify-between text-[10px] font-mono font-bold text-zinc-400">
                          <span>{formatTime(currentTime)}</span>
                          <span>{formatTime(duration)}</span>
                        </div>
                      </div>

                      {/* Scrub & Playback Controls */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSkip(-5)}
                            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition"
                            title="Rewind 5s"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handlePlayRecording(rec)}
                            className="p-3 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-black transition shadow-lg shadow-red-500/20"
                          >
                            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                          </button>

                          <button
                            onClick={() => handleSkip(5)}
                            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition"
                            title="Forward 5s"
                          >
                            <RotateCw className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Speed Toggle */}
                        <button
                          onClick={togglePlaybackSpeed}
                          className="px-2.5 py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono font-black text-zinc-300 border border-zinc-700/60"
                        >
                          {playbackRate}x
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons: Play, Download WAV, Share, Delete */}
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-zinc-800/60 text-xs">
                    {!isActive && (
                      <button
                        onClick={() => handlePlayRecording(rec)}
                        className="flex items-center gap-1.5 font-extrabold text-red-400 hover:text-red-300 transition"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        Listen
                      </button>
                    )}

                    <div className="flex items-center gap-2 ml-auto">
                      {/* WAV Lossless Download */}
                      <button
                        onClick={() => handleDownload(rec, 'wav')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition border border-zinc-700/50"
                        title="Download Studio Lossless WAV"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>WAV</span>
                      </button>

                      {/* Native Share */}
                      <button
                        onClick={() => handleShare(rec)}
                        className="p-1.5 rounded-xl bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 transition"
                        title="Share Recording"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => onDelete(rec.id)}
                        className="p-1.5 rounded-xl bg-zinc-800/70 hover:bg-red-950 hover:text-red-400 text-zinc-400 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
