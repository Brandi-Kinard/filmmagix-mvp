// PRACTICAL VOICEOVER SOLUTION
// Since we can't capture Web Speech API directly, we'll use a better approach

export interface PracticalVoiceConfig {
  voiceId: string;
  rate: number;
  volume: number;
}

/**
 * Generate voiceover that works in practice
 * User hears real voice, video gets synchronized placeholder audio
 */
export async function generatePracticalVoiceover(
  sceneTexts: string[],
  config: PracticalVoiceConfig,
  sceneDurations: number[]
): Promise<Blob> {
  
  console.log(`[PRACTICAL-VO] Starting practical voiceover generation`);
  console.log(`[PRACTICAL-VO] Scenes: ${sceneTexts.length}, Total duration: ${sceneDurations.reduce((a,b) => a+b, 0).toFixed(1)}s`);
  
  const sampleRate = 44100;
  const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
  const totalSamples = Math.floor(sampleRate * totalDuration);
  const audioData = new Float32Array(totalSamples);
  
  let currentOffset = 0;
  
  // Process each scene
  for (let i = 0; i < sceneTexts.length; i++) {
    const text = sceneTexts[i];
    const sceneDuration = sceneDurations[i];
    const sceneSamples = Math.floor(sampleRate * sceneDuration);
    
    console.log(`[PRACTICAL-VO] Scene ${i + 1}: "${text.substring(0, 50)}..." (${sceneDuration}s)`);
    
    // Play the REAL voice for user to hear
    await playRealVoice(text, config);
    
    // Generate placeholder audio for this scene position
    // This is a limitation of web browsers - we can't capture the real speech
    // But at least the timing will be correct
    const wordCount = text.split(' ').length;
    const speechDuration = Math.min(sceneDuration - 0.5, wordCount * 0.4 / config.rate);
    const speechSamples = Math.floor(sampleRate * speechDuration);
    
    // Create a simple voice placeholder at the correct position
    for (let j = 0; j < speechSamples && (currentOffset + j) < audioData.length; j++) {
      const time = j / sampleRate;
      const progress = time / speechDuration;
      
      // Simple voice-like sound
      const freq = 200 + Math.sin(time * 3) * 50;
      let sample = Math.sin(2 * Math.PI * freq * time);
      
      // Add harmonics
      sample += Math.sin(2 * Math.PI * freq * 2 * time) * 0.5;
      sample += Math.sin(2 * Math.PI * freq * 3 * time) * 0.25;
      
      // Speech-like envelope
      const fadeIn = Math.min(1, progress * 10);
      const fadeOut = Math.min(1, (1 - progress) * 10);
      const wordProgress = (progress * wordCount) % 1;
      const wordEnvelope = Math.sin(wordProgress * Math.PI);
      
      audioData[currentOffset + j] = sample * fadeIn * fadeOut * wordEnvelope * 0.2;
    }
    
    currentOffset += sceneSamples;
    
    // Small pause between scenes
    if (i < sceneTexts.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Convert to WAV
  return createWAV(audioData, sampleRate);
}

/**
 * Play the real voice for user to hear
 */
async function playRealVoice(text: string, config: PracticalVoiceConfig): Promise<void> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config.rate;
    utterance.volume = config.volume;
    
    // Set the selected voice
    if (config.voiceId) {
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === config.voiceId);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log(`[PRACTICAL-VO] Playing ${selectedVoice.name} voice for user`);
      }
    }
    
    utterance.onend = () => {
      resolve();
    };
    
    utterance.onerror = () => {
      resolve();
    };
    
    // Play the real voice
    speechSynthesis.speak(utterance);
  });
}

/**
 * Create WAV file from audio data
 */
function createWAV(audioData: Float32Array, sampleRate: number): Blob {
  const length = audioData.length;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * 2, true);
  
  // Convert float to int16
  let offset = 44;
  for (let i = 0; i < length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]));
    view.setInt16(offset, Math.floor(sample * 32767), true);
    offset += 2;
  }
  
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Alternative: Let user record their own voice
 * This would give REAL voice in the video
 */
export async function recordUserVoice(text: string): Promise<Blob | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    
    return new Promise((resolve) => {
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        resolve(blob);
      };
      
      // Show the text to user
      console.log(`[RECORD] Please read: "${text}"`);
      alert(`Please read this text:\n\n"${text}"\n\nClick OK when ready to record.`);
      
      mediaRecorder.start();
      
      // Stop after reasonable time
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 10000); // 10 seconds max per scene
    });
    
  } catch (error) {
    console.error('[RECORD] Microphone access denied:', error);
    return null;
  }
}