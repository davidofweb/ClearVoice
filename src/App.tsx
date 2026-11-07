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
  VolumeX, 
  Volume2, 
  CheckCircle,
  AlertCircle,
  Users,
  User,
  ShieldCheck
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
import { convertBlobToWav, encodeWAV } from './utils/wavEncoder';
import { 
  getAllRecordings, 
  saveRecordingToStorage, 
  deleteRecordingFromStorage, 
  updateRecordingTitle 
} from './utils/audioStorage';

export default function App() {
  // Engine & Audio Pipeline
  const engineRef = useRef<NoiseCancelerEngine | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
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
  const [showMonitorWarning, setShowMonitorWarning] = useState(false);

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

  // Modal & Storage
  const [showCalibrateModal, setShowCalibrateModal] = useState(false);
  const [recordings, setRecordings] = useState<SavedRecording[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Helper to trigger haptics
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
    }, 3200);
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

  // Load saved recordings from IndexedDB on mount
  useEffect(() => {
    getAllRecordings().then((loaded) => {
      // Check if loaded contains old unformatted seed items (size > 600000 or missing real WAV)
      const hasOldDummySeeds = loaded?.some(r => r.id.startsWith('seed-') && (!r.wavBlob || r.sizeBytes === 684200));
      if (loaded && loaded.length > 0 && !hasOldDummySeeds) {
        setRecordings(loaded);
      } else {
        createInitialSeedRecordings();
      }
    }).catch(() => {
      createInitialSeedRecordings();
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

  // Seed sample real recordings if empty
  const createInitialSeedRecordings = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      const sampleRate = 44100;
      const duration = 3.5;
      const buffer = ctx.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
      const data = buffer.getChannelData(0);

      // Smooth vocal harmonic chime for instant demonstration
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 1.2) * 0.25;
        data[i] = (Math.sin(2 * Math.PI * 320 * t) + 
                   Math.sin(2 * Math.PI * 640 * t) * 0.5 + 
                   Math.sin(2 * Math.PI * 960 * t) * 0.25) * env;
      }

      const realWavBlob = encodeWAV(buffer);
      ctx.close().catch(() => {});

      const presets: SavedRecording[] = [
        {
          id: 'seed-1',
          title: 'Ikeja Studio Interview - Chinedu & Amina',
          timestamp: Date.now() - 3600000 * 2,
          duration: 38,
          blob: realWavBlob,
          wavBlob: realWavBlob,
          sizeBytes: realWavBlob.size,
          mode: 'interview',
          noiseCancelStrength: 'max',
          clarityScore: 98,
          sampleRate: 44100,
        },
        {
          id: 'seed-2',
          title: 'Lekki Co-work Voice Memo (Generator Filtered)',
          timestamp: Date.now() - 3600000 * 24,
          duration: 21,
          blob: realWavBlob,
          wavBlob: realWavBlob,
          sizeBytes: realWavBlob.size,
          mode: 'solo',
          noiseCancelStrength: 'medium',
          clarityScore: 94,
          sampleRate: 44100,
        }
      ];

      setRecordings(presets);
      presets.forEach((p) => saveRecordingToStorage(p).catch(() => {}));
    } catch {
      // AudioContext unavailable in headless
    }
  };

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
  const handleModeChange = async (newMode: RecordingMode) => {
    triggerHaptic(20);
    setMode(newMode);
    if (engineRef.current) {
      engineRef.current.setMode(newMode);
    }
  };

  // Strength change handler
  const handleStrengthChange = async (newStrength: NoiseCancelStrength) => {
    triggerHaptic(20);
    setStrength(newStrength);
    if (engineRef.current) {
      engineRef.current.setStrength(newStrength);
    }
  };

  // Hear Yourself (Live Monitor) Toggle
  const handleToggleMonitoring = async () => {
    triggerHaptic(25);
    try {
      const engine = await ensureEngine();
      const next = !isMonitoring;
      if (next && !showMonitorWarning) {
        setShowMonitorWarning(true);
      }
      engine.setMonitoring(next);
      setIsMonitoring(next);
      showToast(next ? 'Live Monitor ON (Headphones Recommended)' : 'Live Monitor OFF');
    } catch {
      // Permission rejected
    }
  };

  // Start Recording
  const handleStartRecording = async () => {
    triggerHaptic([40, 60, 40]);
    try {
      const engine = await ensureEngine();
      engine.startRecording();
      setIsRecording(true);
      setIsPaused(false);
      setRecordSeconds(0);
      showToast('Recording with Noise Cancellation active');
    } catch {
      showToast('Failed to access microphone. Please allow mic access.');
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
    triggerHaptic([50, 80, 50]);
    if (!engineRef.current) return;

    try {
      const rawBlob = await engineRef.current.stopRecording();
      const currentDuration = recordSeconds;
      setIsRecording(false);
      setIsPaused(false);
      setRecordSeconds(0);

      showToast('Saving and converting to studio WAV...');

      // Convert to pure lossless WAV via Web Audio decoding
      const audioCtx = engineRef.current.getAudioContext() || new AudioContext();
      let wavBlob: Blob | undefined;
      try {
        wavBlob = await convertBlobToWav(rawBlob, audioCtx);
      } catch {
        wavBlob = rawBlob; // fallback if conversion fails
      }

      // Default Nigerian context title
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
    showToast(`Room profile saved (${floorDb} dB floor). Background noise subtracted.`);
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center pb-20 selection:bg-red-500/30">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 z-50 px-4 py-2.5 rounded-2xl bg-zinc-900/95 border border-zinc-700 text-zinc-100 text-xs font-black shadow-2xl backdrop-blur-xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Container - Mobile First Max Width */}
      <main className="w-full max-w-lg px-4 pt-4 sm:pt-6 flex flex-col gap-4">
        {/* Header Bar */}
        <header className="flex items-center justify-between py-2 border-b border-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 p-0.5 shadow-lg shadow-red-600/30 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center">
                <Mic className="w-4 h-4 text-red-500" />
              </div>
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight text-white flex items-center gap-1.5">
                ClearVoice
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                  Studio
                </span>
              </h1>
              <p className="text-[10px] text-zinc-400 font-bold -mt-0.5">
                Noise-Canceling Voice Isolation
              </p>
            </div>
          </div>

          {/* Header Action Tools */}
          <div className="flex items-center gap-2">
            {/* Room Calibration Button */}
            <button
              onClick={() => {
                triggerHaptic(20);
                setShowCalibrateModal(true);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 text-xs font-extrabold border border-zinc-800 transition shadow-sm active:scale-95"
              title="Calibrate 2s Room Silence"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Calibrate</span>
            </button>

            {/* PWA Install Button */}
            <PWAInstallBanner />
          </div>
        </header>

        {/* Permission Error Banner */}
        {initError && (
          <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{initError}</span>
          </div>
        )}

        {/* Live Fluid Waveform Visualizer */}
        <section aria-label="Waveform Visualizer">
          <LiveWaveform
            analyser={engineRef.current ? engineRef.current.getProcessedAnalyser() : null}
            isRecording={isRecording}
            isPaused={isPaused}
            gateOpen={metrics.gateOpen}
            mode={mode}
          />
        </section>

        {/* Timer & Live Status Card */}
        <div className="flex items-center justify-between px-2 py-1">
          <div className="flex items-center gap-2.5">
            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center ${
              isRecording ? 'bg-red-500/20' : 'bg-emerald-500/20'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                isRecording 
                  ? (isPaused ? 'bg-amber-400' : 'bg-red-500 animate-ping') 
                  : 'bg-emerald-400'
              }`} />
            </div>
            <span className="text-2xl font-black font-mono tracking-tight text-white">
              {formatTimer(recordSeconds)}
            </span>
          </div>

          {/* Real-time Hear Yourself (Monitor) Toggle */}
          <button
            onClick={handleToggleMonitoring}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition border ${
              isMonitoring
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>{isMonitoring ? 'Hearing Cleaned' : 'Hear Yourself'}</span>
          </button>
        </div>

        {/* Dual VU Meter: Voice Level vs Noise Floor */}
        <section aria-label="Acoustic Meters">
          <VoiceNoiseMeter metrics={metrics} />
        </section>

        {/* 3 Recording Modes */}
        <section aria-label="Recording Modes" className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">
              Recording Mode
            </span>
            <span className="text-[11px] font-bold text-zinc-500">
              {mode === 'solo' ? '1 Person (< 0.6m)' : mode === 'interview' ? '2 People (< 1.0m)' : '4 People Gated'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 p-1 bg-zinc-900/60 rounded-2xl border border-zinc-800/80">
            <button
              onClick={() => handleModeChange('solo')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black transition flex flex-col items-center gap-1 ${
                mode === 'solo'
                  ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <User className="w-4 h-4 text-emerald-400" />
              <span>Solo Voice</span>
            </button>

            <button
              onClick={() => handleModeChange('interview')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black transition flex flex-col items-center gap-1 ${
                mode === 'interview'
                  ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>Interview</span>
            </button>

            <button
              onClick={() => handleModeChange('meeting')}
              className={`py-2.5 px-3 rounded-xl text-xs font-black transition flex flex-col items-center gap-1 ${
                mode === 'meeting'
                  ? 'bg-zinc-800 text-white shadow-md border border-zinc-700/80'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-4 h-4 text-rose-400" />
              <span>Meeting (4P)</span>
            </button>
          </div>
        </section>

        {/* 4-Voice Speaker HUD */}
        <section aria-label="Active Voices Grid">
          <ActiveVoicesHUD speakers={speakers} mode={mode} />
        </section>

        {/* Noise Cancel Strength Slider */}
        <section aria-label="Noise Cancel Strength" className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-3.5 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Noise Cut Strength
            </span>
            <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-zinc-800 text-emerald-400 border border-zinc-700/50">
              {strength === 'low' ? 'Low (-18 dB)' : strength === 'medium' ? 'Medium (-30 dB)' : 'MAX Ultra (-60 dB)'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleStrengthChange('low')}
              className={`py-2 px-3 rounded-xl text-xs font-black border transition ${
                strength === 'low'
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                  : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Low (Quiet Room)
            </button>

            <button
              onClick={() => handleStrengthChange('medium')}
              className={`py-2 px-3 rounded-xl text-xs font-black border transition ${
                strength === 'medium'
                  ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                  : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Medium (Fan / AC)
            </button>

            <button
              onClick={() => handleStrengthChange('max')}
              className={`py-2 px-3 rounded-xl text-xs font-black border transition ${
                strength === 'max'
                  ? 'bg-red-950/60 border-red-500/60 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]'
                  : 'bg-zinc-950/40 border-zinc-800/60 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              MAX (Traffic / Gen)
            </button>
          </div>
        </section>

        {/* Primary Controls: Big RED Record Button & Pause/Stop */}
        <section aria-label="Recorder Controls" className="flex items-center justify-center py-4">
          {!isRecording ? (
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleStartRecording}
                className="group relative w-24 h-24 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 p-1.5 shadow-[0_0_35px_rgba(239,68,68,0.45)] hover:shadow-[0_0_50px_rgba(239,68,68,0.7)] transition-all duration-300 active:scale-95 flex items-center justify-center cursor-pointer"
                title="Start Clean Voice Recording"
              >
                <div className="w-full h-full rounded-full border-4 border-zinc-950 flex items-center justify-center bg-gradient-to-b from-red-500 to-red-700">
                  <div className="w-8 h-8 rounded-full bg-white shadow-md group-hover:scale-110 transition-transform duration-200" />
                </div>
              </button>
              <span className="text-xs font-black tracking-wider text-zinc-300 uppercase">
                Tap To Record Clean
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-6">
              {/* Pause / Resume Button */}
              <button
                onClick={handleTogglePause}
                className="w-16 h-16 rounded-3xl bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 text-zinc-200 flex flex-col items-center justify-center gap-1 font-black transition active:scale-95 shadow-lg"
                title={isPaused ? 'Resume Recording' : 'Pause Recording'}
              >
                {isPaused ? <Play className="w-6 h-6 fill-current text-emerald-400" /> : <Pause className="w-6 h-6 fill-current text-amber-400" />}
                <span className="text-[10px] text-zinc-400">{isPaused ? 'Resume' : 'Pause'}</span>
              </button>

              {/* Big Red Stop & Save Button */}
              <button
                onClick={handleStopRecording}
                className="w-24 h-24 rounded-full bg-red-600 hover:bg-red-500 text-white flex flex-col items-center justify-center gap-1 shadow-[0_0_35px_rgba(239,68,68,0.5)] transition active:scale-95"
                title="Stop & Save Recording"
              >
                <Square className="w-8 h-8 fill-current" />
                <span className="text-[10px] font-black tracking-wider uppercase">Done</span>
              </button>
            </div>
          )}
        </section>

        {/* Saved Clean Recordings List */}
        <section aria-label="Saved Recordings" className="mt-2">
          <RecordingsList
            recordings={recordings}
            onDelete={handleDeleteRecording}
            onRename={handleRenameRecording}
          />
        </section>
      </main>

      {/* Room Silence Calibration Modal */}
      <RoomCalibrationModal
        isOpen={showCalibrateModal}
        onClose={() => setShowCalibrateModal(false)}
        onCalibrate={handleRunCalibration}
        onCalibrationComplete={handleCalibrationComplete}
      />
    </div>
  );
}
