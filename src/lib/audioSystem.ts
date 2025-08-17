// Audio system for background music and sound effects

export interface AudioConfig {
  backgroundTrack: string;
  musicVolume: number; // 0-100
  autoDuck: boolean;
  whooshTransitions: boolean;
  voiceoverEnabled: boolean;
  voiceId: string;
  voiceRate: number; // 0.9-1.1
  syncScenesToVO: boolean;
}

export interface AudioTrack {
  id: string;
  name: string;
  filename: string;
  description: string;
  mood: 'lofi' | 'cinematic' | 'tension' | 'uplift';
}

// Available background tracks
export const AUDIO_TRACKS: AudioTrack[] = [
  {
    id: 'none',
    name: 'No Music',
    filename: '',
    description: 'Silent video with no background music',
    mood: 'lofi'
  },
  {
    id: 'lofi-1',
    name: 'Lofi Chill',
    filename: 'lofi-1.wav',
    description: 'Relaxed lofi hip-hop for chill scenes',
    mood: 'lofi'
  },
  {
    id: 'cinematic-1',
    name: 'Epic Cinematic',
    filename: 'cinematic-1.wav', 
    description: 'Epic orchestral for dramatic scenes',
    mood: 'cinematic'
  },
  {
    id: 'tension-1',
    name: 'Suspense',
    filename: 'tension-1.wav',
    description: 'Suspenseful ambient for mystery/thriller',
    mood: 'tension'
  },
  {
    id: 'uplift-1',
    name: 'Uplifting',
    filename: 'uplift-1.wav',
    description: 'Upbeat motivational for positive endings',
    mood: 'uplift'
  }
];

// Default audio configuration
export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  backgroundTrack: 'lofi-1',
  musicVolume: 65,
  autoDuck: true,
  whooshTransitions: false,
  voiceoverEnabled: false,
  voiceId: '',
  voiceRate: 1.0,
  syncScenesToVO: true
};

/**
 * Convert linear volume (0-100) to dB gain
 */
export function volumeToDb(linearVolume: number): number {
  if (linearVolume <= 0) return -60; // Effectively muted
  if (linearVolume >= 100) return 0; // No attenuation
  
  // Convert 0-100 to 0.0-1.0, then to dB
  const linear = linearVolume / 100;
  return 20 * Math.log10(linear);
}

/**
 * Convert dB gain to linear multiplier for FFmpeg
 */
export function dbToLinear(dbGain: number): number {
  return Math.pow(10, dbGain / 20);
}

/**
 * Calculate music fade timings based on total video duration
 */
export function calculateFadeTimes(totalDurationSec: number): { fadeIn: number; fadeOut: number; fadeOutStart: number } {
  const fadeIn = 0.3; // 300ms fade in
  const fadeOut = 0.6; // 600ms fade out
  const fadeOutStart = Math.max(0, totalDurationSec - fadeOut);
  
  return { fadeIn, fadeOut, fadeOutStart };
}

/**
 * Generate whoosh SFX timestamps for scene transitions
 */
export function generateWhooshTimestamps(sceneDurations: number[]): number[] {
  const timestamps: number[] = [];
  let currentTime = 0;
  
  for (let i = 0; i < sceneDurations.length - 1; i++) {
    currentTime += sceneDurations[i];
    // Place whoosh 250ms before scene transition
    const whooshTime = Math.max(0, currentTime - 0.25);
    timestamps.push(whooshTime);
  }
  
  return timestamps;
}

/**
 * Get available Web Speech API voices
 */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices();
}

/**
 * Get a sensible default voice (prefer English, female if available)
 */
export function getDefaultVoice(): string {
  const voices = getAvailableVoices();
  if (voices.length === 0) return '';
  
  // Prefer English voices
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  if (englishVoices.length > 0) {
    // Prefer female voices for better clarity
    const femaleVoice = englishVoices.find(v => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('alex'));
    return femaleVoice?.voiceURI || englishVoices[0].voiceURI;
  }
  
  return voices[0].voiceURI;
}

/**
 * Check if Web Speech API is supported
 */
export function isVoiceoverSupported(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Log audio configuration for debugging
 */
export function logAudioConfig(config: AudioConfig, totalDuration: number): void {
  console.log(`[AUDIO] Configuration:`);
  console.log(`  Background Track: ${config.backgroundTrack}`);
  console.log(`  Music Volume: ${config.musicVolume}% (${volumeToDb(config.musicVolume).toFixed(1)} dB)`);
  console.log(`  Auto Duck: ${config.autoDuck ? 'ON' : 'OFF'}`);
  console.log(`  Whoosh Transitions: ${config.whooshTransitions ? 'ON' : 'OFF'}`);
  console.log(`  Voiceover: ${config.voiceoverEnabled ? 'ON' : 'OFF'}`);
  if (config.voiceoverEnabled) {
    console.log(`    Voice: ${config.voiceId || 'default'}`);
    console.log(`    Rate: ${config.voiceRate}x`);
    console.log(`    Sync Scenes: ${config.syncScenesToVO ? 'ON' : 'OFF'}`);
  }
  
  const fadeTimes = calculateFadeTimes(totalDuration);
  console.log(`  Fade In: ${fadeTimes.fadeIn}s`);
  console.log(`  Fade Out: ${fadeTimes.fadeOut}s (starts at ${fadeTimes.fadeOutStart.toFixed(1)}s)`);
}