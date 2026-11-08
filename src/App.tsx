/**
 * ClearVoice Recorder
 * Professional Noise-Canceling Voice Recorder
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Mic, 
  Square, 
  Pause, 
  Play, 
  Headphones, 
  Sliders, 
  Sparkles, 
  Radio, 
  Users,
  User,
  ShieldCheck,
  AlertCircle,
  X
} from 'lucide-react';
import { 
  RecordingMode, 
  NoiseCancelStrength, 
  SavedRecording, 
  NoiseMetrics, 
  VoiceSpeakerState 
} from './types/audio';
import { NoiseCancelerEngine } from './services/noiseCanceler';
import { LiveWaveform } from './components/LiveWaveform';
import { VoiceNoiseMeter } from './components/VoiceNoiseMeter';
import { ActiveVoicesHUD } from './components/ActiveVoicesHUD';
import { RoomCalibrationModal } from './components/RoomCalibrationModal';
import { RecordingsList } from './components/RecordingsList';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { OfflineIndicator } from './components/OfflineIndicator';
import { convertBlobToWav } from './utils/wavEncoder';
import { 
  getAllRecordings, 
  saveRecordingToStorage, 
  deleteRecordingFromStorage, 
  updateRecordingTitle 
} from './utils/audioStorage';

export default function App() {
  // Engine & Audio Pipeline
  const engineRef = useRef<NoiseCancelerEngine | null>(null);
  const [, setIsEngineReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const timerRef = useRef<number | null>(null);

  // Settings
  const [mode, setMode] = useState<RecordingMode>('solo');
  const [strength, setStrength] = useState<NoiseCancelStrength>('medium');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);

  // Real-time Metrics & Speakers
  const [metrics, setMetrics] = useState<NoiseMetrics>({
    rawLevelDb: -60,
    voiceLevelDb: -60,
    noiseFloorDb: -52,
    clarityPercent: 96,
    gateOpen: false,
    activeSpeakersCount: 0,
  });

  const [speakers, setSpeakers] = useState<VoiceSpeakerState[]>([
    { id: 1, name: 'Voice 1 (Primary)', active: false, level: 0, lastSpoke: 0 },
    { id: 2, name: 'Voice 2', active: false, level: 0, lastSpoke: 0 },
    { id: 3, name: 'Voice 3', active: false, level: 0, lastSpoke: 0 },
    { id: 4, name: 'Voice 4', active: false, level: 0, lastSpoke: 0 },
  ]);

  // Recordings & Toast
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tactile Haptics helper
  const triggerHaptic = (ms: number | number[] = 25) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch {
        // ignore
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  };

  // Initialize or ensure audio engine
  const ensureEngine = useCallback(async () => {
    if (!engineRef.current) {
      try {
        const engine = new NoiseCancelerEngine({
          onMetricsUpdate: (m) => setMetrics(m),
          onSpeakersUpdate: (s) => setSpeakers(s),
        });
        await engine.initialize();
        engine.setMode(mode);
        engine.setStrength(strength);
        engineRef.current = engine;
        setIsEngineReady(true);
        setInitError(null);
      } catch (err: unknown) {
        console.error('Failed to start audio engine', err);
        setInitError('Microphone permission required for noise-canceling recording.');
        throw err;
      }
    }
    return engineRef.current;
  }, [mode, strength]);

  // Load only real user recordings and purge any old demo seed recordings
  useEffect(() => {
    getAllRecordings().then(async (loaded) => {
      if (loaded && loaded.length > 0) {
        // Purge any seed items from earlier turns
        const realRecordings: SavedRecording[] = [];
        for (const rec of loaded) {
          if (rec.id.startsWith('seed-')) {
            await deleteRecordingFromStorage(rec.id);
          } else {
            realRecordings.push(rec);
          }
        }
        setRecordings(realRecordings);
      } else {
        setRecordings([]);
      }
    }).catch(() => {
      setRecordings([]);
    });

    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Timer counter when recording
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording, isPaused]);

  // Mode change handler
  const handleModeChange = (newMode: RecordingMode) => {
    triggerHaptic(20);
    setMode(newMode);
    if (engineRef.current) {
      engineRef.current.setMode(newMode);
    }
    showToast(`${newMode === 'solo' ? 'Solo Voice' : newMode === 'interview' ? 'Interview' : 'Meeting (4P)'} Mode`);
  };

  // Strength change handler
  const handleStrengthChange = (newStrength: NoiseCancelStrength) => {
    triggerHaptic(20);
    setStrength(newStrength);
    if (engineRef.current) {
      engineRef.current.setStrength(newStrength);
    }
    showToast(`Noise Cut: ${newStrength === 'low' ? 'Low (-18 dB)' : newStrength === 'medium' ? 'Medium (-30 dB)' : 'MAX (-60 dB)'}`);
  };

  // Hear Yourself (Live Monitor) Toggle
  const handleToggleMonitoring = async () => {
    triggerHaptic(25);
    try {
      const engine = await ensureEngine();
      const next = !isMonitoring;
      engine.setMonitoring(next);
      setIsMonitoring(next);
      showToast(next ? 'Live Monitor ON (Use Headphones)' : 'Live Monitor OFF');
    } catch {
      // Permission rejected
    }
  };

  // Start Recording
  const handleStartRecording = async () => {
    triggerHaptic([40, 70, 40]);
    try {
      const engine = await ensureEngine();
      engine.startRecording();
      setIsRecording(true);
      setIsPaused(false);
      setRecordSeconds(0);
      showToast('Recording with Noise Cancellation active');
    } catch {
      showToast('Please allow microphone access to record clean audio.');
    }
  };

  // Pause / Resume
  const handleTogglePause = () => {
    triggerHaptic(25);
    if (!engineRef.current) return;
    if (isPaused) {
      engineRef.current.resumeRecording();
      setIsPaused(false);
      showToast('Recording Resumed');
    } else {
      engineRef.current.pauseRecording();
      setIsPaused(true);
      showToast('Recording Paused');
    }
  };

  // Stop Recording & Process WAV
  const handleStopRecording = async () => {
    triggerHaptic([50, 90, 50]);
    if (!engineRef.current) return;

    try {
      const rawBlob = await engineRef.current.stopRecording();
      const currentDuration = recordSeconds;
      setIsRecording(false);
      setIsPaused(false);
      setRecordSeconds(0);

      showToast('Saving studio clean audio...');

      // Convert to pure lossless WAV via Web Audio decoding
      const audioCtx = engineRef.current.getAudioContext() || new AudioContext();
      let wavBlob: Blob | undefined;
      try {
        wavBlob = await convertBlobToWav(rawBlob, audioCtx);
      } catch {
        wavBlob = rawBlob;
      }

      const now = new Date();
      const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const defaultTitle = `${mode === 'solo' ? 'Voice Note' : mode === 'interview' ? 'Interview' : 'Meeting'} - ${dateStr} ${timeStr}`;

      const newRec: SavedRecording = {
        id: 'rec-' + Date.now(),
        title: defaultTitle,
        timestamp: Date.now(),
        duration: currentDuration,
        blob: rawBlob,
        wavBlob: wavBlob,
        sizeBytes: wavBlob ? wavBlob.size : rawBlob.size,
        mode: mode,
        noiseCancelStrength: strength,
        clarityScore: metrics.clarityPercent,
        sampleRate: 48000,
      };

      setRecordings((prev) => [newRec, ...prev]);
      await saveRecordingToStorage(newRec);
      showToast('Recording saved with crystal voice clarity!');
    } catch (err) {
      console.error('Error stopping recording', err);
      showToast('Failed to save recording.');
    }
  };

  // Delete recording
  const handleDeleteRecording = async (id: string) => {
    triggerHaptic(30);
    setRecordings((prev) => prev.filter((r) => r.id !== id));
    await deleteRecordingFromStorage(id);
    showToast('Recording deleted');
  };

  // Rename recording
  const handleRenameRecording = async (id: string, newTitle: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, title: newTitle } : r))
    );
    await updateRecordingTitle(id, newTitle);
    showToast('Renamed successfully');
  };

  // Room silence calibration
  const handleRunCalibration = async (onProgress: (percent: number) => void) => {
    const engine = await ensureEngine();
    return engine.calibrateRoomSilence(onProgress);
  };

  const handleCalibrationComplete = (floorDb: number) => {
    showToast(`Room silence locked (${floorDb} dB). Fan and room noise subtracted.`);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center selection:bg-red-500/30">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 z-50 px-4 py-2.5 rounded-2xl bg-zinc-900/95 border border-zinc-700 text-zinc-100 text-xs font-black shadow-2xl backdrop-blur-xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="w-full max-w-md px-4 pt-4 sm:pt-6 pb-24 flex flex-col flex-1 justify-between">
        {/* Header Bar */}
        <header className="flex items-center justify-between py-2 border-b border-zinc-900/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center">
              <Mic className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <h1 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                ClearVoice
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </h1>
            </div>
          </div>

          {/* Minimal Top Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowSettingsModal(true);
              }}
              className="p-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition active:scale-95"
              title="Noise Settings & Calibration"
            >
              <Sliders className="w-4 h-4 text-zinc-300" />
            </button>
            <PWAInstallBanner />
          </div>
        </header>

        {/* Permission Error Banner */}
        {initError && (
          <div className="my-3 p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{initError}</span>
          </div>
        )}

        {/* VIEW A: UNCLUTTERED ENTRY SCREEN (When NOT Recording) */}
        {!isRecording ? (
          <div className="flex flex-col items-center justify-center flex-1 py-12 my-auto animate-fade-in text-center">
            {/* Status Subtitle */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-[11px] font-bold text-zinc-400 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Noise Filter Ready • &lt; 1m Proximity Focus</span>
            </div>

            {/* THE BIG RED RECORD BUTTON - Center Stage Hero */}
            <div className="relative flex items-center justify-center my-4">
              {/* Glowing Pulse Rings */}
              <div className="absolute w-44 h-44 sm:w-48 sm:h-48 rounded-full bg-red-600/15 animate-ping pointer-events-none" />
              <div className="absolute w-36 h-36 sm:w-40 sm:h-40 rounded-full bg-red-600/20 blur-xl pointer-events-none" />

              {/* Physical Studio Record Button */}
              <button
                onClick={handleStartRecording}
                className="group relative w-32 h-32 sm:w-36 sm:h-36 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 p-2 shadow-[0_0_50px_rgba(239,68,68,0.45)] hover:shadow-[0_0_65px_rgba(239,68,68,0.7)] transition-all duration-300 active:scale-95 flex items-center justify-center cursor-pointer"
                title="Start Noise-Canceled Voice Recording"
              >
                <div className="w-full h-full rounded-full border-4 border-zinc-950 flex items-center justify-center bg-gradient-to-b from-red-500 to-red-700 shadow-inner">
                  <div className="w-10 h-10 rounded-full bg-white shadow-xl group-hover:scale-110 transition-transform duration-200" />
                </div>
              </button>
            </div>

            {/* Thick Apple Typography Label */}
            <h2 className="text-sm font-black tracking-widest text-zinc-200 uppercase mt-6 mb-8">
              Tap To Record
            </h2>

            {/* Minimal Segmented Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-zinc-900/90 rounded-2xl border border-zinc-800/80 shadow-md">
              <button
                onClick={() => handleModeChange('solo')}
                className={`py-2 px-3.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  mode === 'solo'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <User className="w-3.5 h-3.5 text-emerald-400" />
                <span>Solo</span>
              </button>

              <button
                onClick={() => handleModeChange('interview')}
                className={`py-2 px-3.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  mode === 'interview'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-cyan-400" />
                <span>Interview</span>
              </button>

              <button
                onClick={() => handleModeChange('meeting')}
                className={`py-2 px-3.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                  mode === 'meeting'
                    ? 'bg-zinc-800 text-white shadow-sm border border-zinc-700'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Users className="w-3.5 h-3.5 text-rose-400" />
                <span>Meeting (4P)</span>
              </button>
            </div>
          </div>
        ) : (
          /* VIEW B: ACTIVE RECORDING STUDIO (Live Waveform, Meters & Controls) */
          <div className="flex flex-col gap-4 my-auto py-4 animate-fade-in">
            {/* Live Timer & Clarity Badge */}
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                <span className="text-3xl font-black font-mono tracking-tight text-white">
                  {formatTimer(recordSeconds)}
                </span>
              </div>

              {/* Monitor Toggle */}
              <button
                onClick={handleToggleMonitoring}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition border ${
                  isMonitoring
                    ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Headphones className="w-3.5 h-3.5" />
                <span>{isMonitoring ? 'Hearing Cleaned' : 'Hear Yourself'}</span>
              </button>
            </div>

            {/* Live Fluid Waveform */}
            <LiveWaveform
              analyser={engineRef.current ? engineRef.current.getProcessedAnalyser() : null}
              isRecording={isRecording}
              isPaused={isPaused}
              gateOpen={metrics.gateOpen}
              mode={mode}
            />

            {/* Voice vs Noise Meter */}
            <VoiceNoiseMeter metrics={metrics} />

            {/* If Meeting Mode: Show 4-Voice Tracker */}
            {mode === 'meeting' && (
              <ActiveVoicesHUD speakers={speakers} mode={mode} />
            )}

            {/* Live Recording Controls: Pause & Stop/Save */}
            <div className="flex items-center justify-center gap-8 py-3">
              <button
                onClick={handleTogglePause}
                className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 flex flex-col items-center justify-center gap-1 font-black transition active:scale-95 shadow-lg"
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play className="w-6 h-6 fill-current text-emerald-400" /> : <Pause className="w-6 h-6 fill-current text-amber-400" />}
                <span className="text-[10px] text-zinc-400">{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              <button
                onClick={handleStopRecording}
                className="w-22 h-22 rounded-full bg-red-600 hover:bg-red-500 text-white flex flex-col items-center justify-center gap-1 shadow-[0_0_40px_rgba(239,68,68,0.5)] transition active:scale-95 cursor-pointer"
                title="Stop & Save Clean Recording"
              >
                <Square className="w-7 h-7 fill-current" />
                <span className="text-[10px] font-black uppercase tracking-wider">Done</span>
              </button>
            </div>
          </div>
        )}

        {/* Clean Saved Recordings Section (Only renders if user has recordings) */}
        {!isRecording && recordings.length > 0 && (
          <section aria-label="User Recordings" className="mt-4 pt-4 border-t border-zinc-900/80">
            <RecordingsList
              recordings={recordings}
              onDelete={handleDeleteRecording}
              onRename={handleRenameRecording}
            />
          </section>
        )}
      </main>

      {/* Slide-over / Modal for Noise Settings & Room Calibration */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl text-zinc-100">
            <button
              onClick={() => setShowSettingsModal(false)}
              className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white rounded-full hover:bg-zinc-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Noise Canceling Settings
            </h3>
            <p className="text-xs text-zinc-400 mb-5">
              Customize voice isolation and room background filter.
            </p>

            {/* Noise Strength Selector */}
            <div className="space-y-2 mb-5">
              <span className="text-xs font-black uppercase text-zinc-400">
                Suppression Strength
              </span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleStrengthChange('low')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition ${
                    strength === 'low'
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-400'
                  }`}
                >
                  Low
                </button>
                <button
                  onClick={() => handleStrengthChange('medium')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition ${
                    strength === 'medium'
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-400'
                  }`}
                >
                  Medium
                </button>
                <button
                  onClick={() => handleStrengthChange('max')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-black border transition ${
                    strength === 'max'
                      ? 'bg-red-950/60 border-red-500/60 text-red-300'
                      : 'bg-zinc-950/50 border-zinc-800 text-zinc-400'
                  }`}
                >
                  MAX Ultra
                </button>
              </div>
            </div>

            {/* Room Noise Calibration Action */}
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800 mb-5 space-y-2">
              <span className="text-xs font-black text-white block">
                2-Second Room Silence Profile
              </span>
              <p className="text-[11px] text-zinc-400">
                Sample your fan, AC, generator, or street noise and subtract it automatically.
              </p>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setShowCalibrateModal(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-black border border-amber-500/30 transition flex items-center justify-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Calibrate Room Noise</span>
              </button>
            </div>

            <button
              onClick={() => setShowSettingsModal(false)}
              className="w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 font-extrabold text-xs text-white transition"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Room Silence Calibration Modal */}
      <RoomCalibrationModal
        isOpen={showCalibrateModal}
        onClose={() => setShowCalibrateModal(false)}
        onCalibrate={handleRunCalibration}
        onCalibrationComplete={handleCalibrationComplete}
      />

      {/* Offline Status Indicator */}
      <OfflineIndicator />
    </div>
  );
}
