export type RecordingMode = 'solo' | 'interview' | 'meeting';

export type NoiseCancelStrength = 'low' | 'medium' | 'max';

export interface SavedRecording {
  id: string;
  title: string;
  timestamp: number;
  duration: number; // in seconds
  blob: Blob;
  wavBlob?: Blob;
  sizeBytes: number;
  mode: RecordingMode;
  noiseCancelStrength: NoiseCancelStrength;
  clarityScore: number; // 0-100%
  sampleRate: number;
}

export interface VoiceSpeakerState {
  id: number;
  name: string;
  active: boolean;
  level: number; // 0 - 100
  lastSpoke: number;
}

export interface NoiseMetrics {
  rawLevelDb: number;
  voiceLevelDb: number;
  noiseFloorDb: number;
  clarityPercent: number;
  gateOpen: boolean;
  activeSpeakersCount: number;
}
