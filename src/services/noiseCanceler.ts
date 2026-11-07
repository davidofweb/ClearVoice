import { NoiseCancelStrength, RecordingMode, NoiseMetrics, VoiceSpeakerState } from '../types/audio';

export interface NoiseCancelerCallbacks {
  onMetricsUpdate: (metrics: NoiseMetrics) => void;
  onSpeakersUpdate: (speakers: VoiceSpeakerState[]) => void;
}

export class NoiseCancelerEngine {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  // Audio Nodes
  private highpassFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private deEsserFilter: BiquadFilterNode | null = null;
  private clarityBoostFilter: BiquadFilterNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private gateGainNode: GainNode | null = null;
  private monitorGainNode: GainNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  
  // Analysers
  private rawAnalyser: AnalyserNode | null = null;
  private processedAnalyser: AnalyserNode | null = null;
  
  // MediaRecorder & Chunks
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  
  // Animation & Metering
  private animFrameId: number | null = null;
  private isRunning: boolean = false;
  private isMonitoring: boolean = false;
  
  // Dynamic parameters
  private mode: RecordingMode = 'solo';
  private strength: NoiseCancelStrength = 'medium';
  private calibratedNoiseFloorDb: number = -52; // baseline room silence dB
  private currentGateGain: number = 0;
  
  // 4-Speaker Tracker State
  private speakers: VoiceSpeakerState[] = [
    { id: 1, name: 'Voice 1 (Primary)', active: false, level: 0, lastSpoke: 0 },
    { id: 2, name: 'Voice 2', active: false, level: 0, lastSpoke: 0 },
    { id: 3, name: 'Voice 3', active: false, level: 0, lastSpoke: 0 },
    { id: 4, name: 'Voice 4', active: false, level: 0, lastSpoke: 0 },
  ];
  
  private callbacks: NoiseCancelerCallbacks;

  constructor(callbacks: NoiseCancelerCallbacks) {
    this.callbacks = callbacks;
  }

  public async initialize(): Promise<void> {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      return;
    }

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new AudioContextClass({
      latencyHint: 'interactive',
      sampleRate: 48000,
    });

    // Request high-fidelity mic stream with platform echo cancellation & noise suppression
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // 1. Raw analyser to read raw background / noise floor
    this.rawAnalyser = this.audioContext.createAnalyser();
    this.rawAnalyser.fftSize = 512;
    this.rawAnalyser.smoothingTimeConstant = 0.3;
    this.sourceNode.connect(this.rawAnalyser);

    // 2. Highpass Filter (Cuts sub-bass rumble, AC shudder, wind below 85Hz)
    this.highpassFilter = this.audioContext.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = 85;
    this.highpassFilter.Q.value = 0.707;

    // 3. Lowpass Filter (Cuts harsh high frequencies, hiss, metal squeals above 7800Hz)
    this.lowpassFilter = this.audioContext.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 7800;
    this.lowpassFilter.Q.value = 0.707;

    // 4. De-Esser Notch (Cuts harsh whistle, metallic hiss and sibilance around 5200Hz)
    this.deEsserFilter = this.audioContext.createBiquadFilter();
    this.deEsserFilter.type = 'peaking';
    this.deEsserFilter.frequency.value = 5200;
    this.deEsserFilter.gain.value = -5.0; // dB
    this.deEsserFilter.Q.value = 1.8;

    // 5. Speech Clarity EQ Boost (Brings voice presence and intelligibility forward at 2800Hz)
    this.clarityBoostFilter = this.audioContext.createBiquadFilter();
    this.clarityBoostFilter.type = 'peaking';
    this.clarityBoostFilter.frequency.value = 2800;
    this.clarityBoostFilter.gain.value = 4.0; // dB
    this.clarityBoostFilter.Q.value = 1.1;

    // 6. Proximity & Noise Gate Gain Node
    this.gateGainNode = this.audioContext.createGain();
    this.gateGainNode.gain.value = 0; // Starts closed

    // 7. Dynamics Compressor (Levels human voices, stops clipping)
    this.compressorNode = this.audioContext.createDynamicsCompressor();
    this.compressorNode.threshold.value = -22;
    this.compressorNode.knee.value = 8;
    this.compressorNode.ratio.value = 5;
    this.compressorNode.attack.value = 0.003;
    this.compressorNode.release.value = 0.14;

    // 8. Processed Analyser for cleaned waveform & Voice meter
    this.processedAnalyser = this.audioContext.createAnalyser();
    this.processedAnalyser.fftSize = 1024;
    this.processedAnalyser.smoothingTimeConstant = 0.25;

    // 9. Monitor Gain Node (For "Hear Yourself" real-time preview)
    this.monitorGainNode = this.audioContext.createGain();
    this.monitorGainNode.gain.value = 0; // Muted by default

    // 10. Destination Node for recording the cleaned audio
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    // Connect DSP Chain:
    // Source -> Highpass -> Lowpass -> De-Esser -> Clarity -> GateGain -> Compressor -> Processed Analyser -> Output
    this.sourceNode.connect(this.highpassFilter);
    this.highpassFilter.connect(this.lowpassFilter);
    this.lowpassFilter.connect(this.deEsserFilter);
    this.deEsserFilter.connect(this.clarityBoostFilter);
    this.clarityBoostFilter.connect(this.gateGainNode);
    this.gateGainNode.connect(this.compressorNode);
    this.compressorNode.connect(this.processedAnalyser);

    // Processed output splits to:
    // A) Recording Destination
    this.compressorNode.connect(this.destinationNode);
    // B) Real-time monitor (Hear yourself) -> AudioContext Destination
    this.compressorNode.connect(this.monitorGainNode);
    this.monitorGainNode.connect(this.audioContext.destination);

    this.applySettings();
    this.isRunning = true;
    this.startMeteringLoop();
  }

  public setMode(mode: RecordingMode) {
    this.mode = mode;
    this.applySettings();
  }

  public setStrength(strength: NoiseCancelStrength) {
    this.strength = strength;
    this.applySettings();
  }

  public setMonitoring(enabled: boolean) {
    this.isMonitoring = enabled;
    if (this.monitorGainNode && this.audioContext) {
      const targetGain = enabled ? 0.95 : 0;
      this.monitorGainNode.gain.setTargetAtTime(targetGain, this.audioContext.currentTime, 0.05);
    }
  }

  public getMonitoring(): boolean {
    return this.isMonitoring;
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public getProcessedAnalyser(): AnalyserNode | null {
    return this.processedAnalyser;
  }

  public getRawAnalyser(): AnalyserNode | null {
    return this.rawAnalyser;
  }

  /**
   * Applies filter and gate threshold parameters according to selected Mode and Strength
   */
  private applySettings() {
    if (!this.highpassFilter || !this.lowpassFilter || !this.clarityBoostFilter || !this.audioContext) {
      return;
    }

    const now = this.audioContext.currentTime;

    if (this.mode === 'solo') {
      // Tight voice band (single speaker focus)
      this.highpassFilter.frequency.setTargetAtTime(95, now, 0.05);
      this.lowpassFilter.frequency.setTargetAtTime(7400, now, 0.05);
      this.clarityBoostFilter.frequency.setTargetAtTime(2600, now, 0.05);
      this.clarityBoostFilter.gain.setTargetAtTime(4.5, now, 0.05);
    } else if (this.mode === 'interview') {
      // 2 speakers, slightly broader bandwidth for male/female conversational dynamics
      this.highpassFilter.frequency.setTargetAtTime(85, now, 0.05);
      this.lowpassFilter.frequency.setTargetAtTime(7800, now, 0.05);
      this.clarityBoostFilter.frequency.setTargetAtTime(2900, now, 0.05);
      this.clarityBoostFilter.gain.setTargetAtTime(3.8, now, 0.05);
    } else {
      // Meeting (up to 4 people)
      this.highpassFilter.frequency.setTargetAtTime(80, now, 0.05);
      this.lowpassFilter.frequency.setTargetAtTime(8000, now, 0.05);
      this.clarityBoostFilter.frequency.setTargetAtTime(3100, now, 0.05);
      this.clarityBoostFilter.gain.setTargetAtTime(3.2, now, 0.05);
    }
  }

  /**
   * Calibrate Room Silence (Samples room noise for 2 seconds to establish noise floor)
   */
  public async calibrateRoomSilence(onProgress?: (percent: number) => void): Promise<number> {
    if (!this.rawAnalyser || !this.audioContext) {
      await this.initialize();
    }

    const durationMs = 2000;
    const intervalMs = 50;
    const totalSteps = durationMs / intervalMs;
    const samples: number[] = [];

    const rawData = new Float32Array(this.rawAnalyser!.fftSize);

    for (let step = 0; step < totalSteps; step++) {
      await new Promise((res) => setTimeout(res, intervalMs));
      this.rawAnalyser!.getFloatTimeDomainData(rawData);
      
      let sumSquares = 0;
      for (let i = 0; i < rawData.length; i++) {
        sumSquares += rawData[i] * rawData[i];
      }
      const rms = Math.sqrt(sumSquares / rawData.length);
      const db = 20 * Math.log10(Math.max(rms, 0.00001));
      samples.push(db);

      if (onProgress) {
        onProgress(Math.round(((step + 1) / totalSteps) * 100));
      }
    }

    // Sort to compute the 70th percentile ambient floor
    samples.sort((a, b) => a - b);
    const ambientFloor = samples[Math.floor(samples.length * 0.7)];
    this.calibratedNoiseFloorDb = Math.max(-65, Math.min(-35, ambientFloor));
    return this.calibratedNoiseFloorDb;
  }

  /**
   * Continuous Metering & Proximity Noise Gate loop running on requestAnimationFrame
   */
  private startMeteringLoop() {
    const rawTimeData = new Float32Array(this.rawAnalyser ? this.rawAnalyser.fftSize : 512);
    const rawFreqData = new Uint8Array(this.rawAnalyser ? this.rawAnalyser.frequencyBinCount : 256);
    const procTimeData = new Float32Array(this.processedAnalyser ? this.processedAnalyser.fftSize : 1024);

    let smoothedRawDb = -60;
    let smoothedVoiceDb = -60;

    const loop = () => {
      if (!this.isRunning || !this.audioContext || !this.rawAnalyser || !this.processedAnalyser) {
        return;
      }

      // 1. Calculate Raw Input RMS & dB
      this.rawAnalyser.getFloatTimeDomainData(rawTimeData);
      let rawSum = 0;
      for (let i = 0; i < rawTimeData.length; i++) {
        rawSum += rawTimeData[i] * rawTimeData[i];
      }
      const rawRms = Math.sqrt(rawSum / rawTimeData.length);
      const rawDb = 20 * Math.log10(Math.max(rawRms, 0.00001));
      smoothedRawDb = smoothedRawDb * 0.75 + rawDb * 0.25;

      // 2. Determine Noise Gate Threshold based on Calibrated Floor, Strength & Mode
      let strengthMargin = 8; // dB above noise floor
      let maxSuppressionGain = 0.02; // -34 dB

      if (this.strength === 'low') {
        strengthMargin = 5;
        maxSuppressionGain = 0.12; // -18 dB
      } else if (this.strength === 'medium') {
        strengthMargin = 8.5;
        maxSuppressionGain = 0.03; // -30 dB
      } else if (this.strength === 'max') {
        strengthMargin = 12.0;
        maxSuppressionGain = 0.001; // -60 dB (Ultra strict)
      }

      // Proximity threshold: Distant sounds (< 1m threshold) don't have enough direct energy
      let proximityThresholdDb = this.calibratedNoiseFloorDb + strengthMargin;
      if (this.mode === 'solo') {
        proximityThresholdDb += 2.5; // Stricter proximity for solo
      } else if (this.mode === 'interview') {
        proximityThresholdDb += 1.0;
      }

      const isVoiceAboveThreshold = smoothedRawDb > proximityThresholdDb;

      // Smooth attack (fast opening) and release (gentle hold)
      const targetGain = isVoiceAboveThreshold ? 1.0 : maxSuppressionGain;
      const attackCoeff = 0.45;  // fast open
      const releaseCoeff = 0.12; // smooth hold/close
      const coeff = targetGain > this.currentGateGain ? attackCoeff : releaseCoeff;
      this.currentGateGain = this.currentGateGain + (targetGain - this.currentGateGain) * coeff;

      // Apply to Gate Gain Node
      if (this.gateGainNode) {
        this.gateGainNode.gain.setValueAtTime(this.currentGateGain, this.audioContext.currentTime);
      }

      // 3. Calculate Processed Voice Output RMS & dB
      this.processedAnalyser.getFloatTimeDomainData(procTimeData);
      let procSum = 0;
      for (let i = 0; i < procTimeData.length; i++) {
        procSum += procTimeData[i] * procTimeData[i];
      }
      const procRms = Math.sqrt(procSum / procTimeData.length);
      const procDb = 20 * Math.log10(Math.max(procRms, 0.00001));
      smoothedVoiceDb = smoothedVoiceDb * 0.75 + procDb * 0.25;

      // 4. Voice Clarity Score % calculation
      // Clarity is high when voice is strong and noise floor is low
      const snr = Math.max(0, smoothedVoiceDb - this.calibratedNoiseFloorDb);
      // Map 0 - 30 dB SNR to 50% - 99% clarity
      let clarityPercent = Math.min(99, Math.max(45, Math.round(50 + (snr / 28) * 49)));
      if (!isVoiceAboveThreshold) {
        clarityPercent = Math.round(clarityPercent * 0.85);
      }

      // 5. Four Voices Tracking Logic
      this.rawAnalyser.getByteFrequencyData(rawFreqData);
      this.updateVoiceSpeakers(isVoiceAboveThreshold, smoothedVoiceDb, rawFreqData);

      // 6. Callback with Metrics
      this.callbacks.onMetricsUpdate({
        rawLevelDb: Math.round(smoothedRawDb),
        voiceLevelDb: Math.round(smoothedVoiceDb),
        noiseFloorDb: Math.round(this.calibratedNoiseFloorDb),
        clarityPercent,
        gateOpen: this.currentGateGain > 0.4,
        activeSpeakersCount: this.speakers.filter(s => s.active).length,
      });

      this.callbacks.onSpeakersUpdate([...this.speakers]);

      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Tracks up to 4 human voices based on active speech bursts & formant distribution
   */
  private updateVoiceSpeakers(isVoiceActive: boolean, currentDb: number, freqData: Uint8Array) {
    const now = Date.now();

    // Analyze speech band (300Hz - 3400Hz frequency bins)
    // Assuming sampleRate = 48000, bin width = 48000/512 = 93.75 Hz
    // bins 3 to 36 represent human fundamental and first formants
    let lowVocalEnergy = 0;  // 300Hz - 900Hz (Chest resonance)
    let midVocalEnergy = 0;  // 900Hz - 2200Hz (Vowel formants)
    let highVocalEnergy = 0; // 2200Hz - 3400Hz (Presence / articulation)

    for (let i = 3; i <= 9; i++) lowVocalEnergy += freqData[i] || 0;
    for (let i = 10; i <= 23; i++) midVocalEnergy += freqData[i] || 0;
    for (let i = 24; i <= 36; i++) highVocalEnergy += freqData[i] || 0;

    const totalVocalEnergy = lowVocalEnergy + midVocalEnergy + highVocalEnergy;
    const voiceIntensity = Math.min(100, Math.max(0, Math.round((currentDb + 50) * 2.2)));

    if (isVoiceActive && totalVocalEnergy > 100) {
      // Determine speaker slot by spectral centroid/pitch tendency
      const ratioLowToHigh = lowVocalEnergy / Math.max(1, highVocalEnergy);
      let detectedSlot = 0;

      if (this.mode === 'solo') {
        detectedSlot = 0; // Voice 1 only
      } else if (this.mode === 'interview') {
        // Distinguish between Speaker 1 & 2
        detectedSlot = ratioLowToHigh > 1.4 ? 0 : 1;
      } else {
        // Meeting: prioritize up to 4 voices
        if (ratioLowToHigh > 2.0) detectedSlot = 0;
        else if (ratioLowToHigh > 1.3) detectedSlot = 1;
        else if (ratioLowToHigh > 0.8) detectedSlot = 2;
        else detectedSlot = 3;
      }

      this.speakers[detectedSlot].active = true;
      this.speakers[detectedSlot].level = voiceIntensity;
      this.speakers[detectedSlot].lastSpoke = now;
    }

    // Decay speaker activity over 1.2 seconds of silence
    for (let i = 0; i < 4; i++) {
      if (now - this.speakers[i].lastSpoke > 1200) {
        this.speakers[i].active = false;
        this.speakers[i].level = Math.max(0, this.speakers[i].level - 8);
      }
    }
  }

  /**
   * Starts Recording the Noise-Canceled Audio Stream
   */
  public startRecording(): MediaRecorder {
    if (!this.destinationNode) {
      throw new Error('Audio pipeline not initialized');
    }

    this.recordedChunks = [];
    const stream = this.destinationNode.stream;

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(250); // Slice every 250ms
    return this.mediaRecorder;
  }

  public pauseRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.pause();
    }
  }

  public resumeRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      this.mediaRecorder.resume();
    }
  }

  public stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        return reject(new Error('No active recorder'));
      }

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder?.mimeType || 'audio/webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        this.recordedChunks = [];
        resolve(blob);
      };

      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });
  }

  public destroy() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
