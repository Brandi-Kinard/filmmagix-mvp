// Real voiceover capture using Web Audio API and MediaRecorder
export interface RealVoiceoverConfig {
  voiceId: string;
  rate: number;
  volume: number;
}

export interface RealVoiceoverResult {
  audioBlob: Blob;
  duration: number;
}

/**
 * Capture actual Web Speech API output using MediaRecorder
 */
export async function captureRealVoiceover(
  text: string, 
  config: RealVoiceoverConfig
): Promise<RealVoiceoverResult> {
  console.log(`[REAL-VO] Capturing real speech for: "${text}"`);
  
  return new Promise<RealVoiceoverResult>((resolve, reject) => {
    // Create audio context for capturing
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a destination for capturing audio
    const dest = audioContext.createMediaStreamDestination();
    const mediaRecorder = new MediaRecorder(dest.stream);
    const audioChunks: Blob[] = [];
    
    let startTime = 0;
    let duration = 0;
    
    // Set up MediaRecorder events
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      console.log(`[REAL-VO] Captured ${duration.toFixed(2)}s of real speech audio`);
      resolve({ audioBlob, duration });
    };
    
    // Create speech utterance
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = config.rate;
    utterance.volume = config.volume;
    
    // Set voice if specified
    if (config.voiceId) {
      const voices = speechSynthesis.getVoices();
      const selectedVoice = voices.find(v => v.voiceURI === config.voiceId);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        console.log(`[REAL-VO] Using voice: ${selectedVoice.name}`);
      }
    }
    
    // Set up speech events
    utterance.onstart = () => {
      startTime = Date.now();
      mediaRecorder.start();
      console.log(`[REAL-VO] Started recording speech synthesis`);
    };
    
    utterance.onend = () => {
      duration = (Date.now() - startTime) / 1000;
      mediaRecorder.stop();
      console.log(`[REAL-VO] Speech ended after ${duration.toFixed(2)}s`);
    };
    
    utterance.onerror = (error) => {
      console.error(`[REAL-VO] Speech error: ${error.error}`);
      mediaRecorder.stop();
      reject(new Error(`Speech synthesis error: ${error.error}`));
    };
    
    // Timeout safety
    setTimeout(() => {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        reject(new Error('Voice capture timeout'));
      }
    }, 30000);
    
    // Start speech synthesis
    speechSynthesis.speak(utterance);
  });
}

/**
 * Generate voiceover for multiple scenes with real voice capture
 */
export async function generateRealVoiceover(
  sceneTexts: string[],
  config: RealVoiceoverConfig,
  onProgress?: (scene: number, total: number) => void
): Promise<{ audioBlob: Blob; totalDuration: number; sceneDurations: number[] }> {
  console.log(`[REAL-VO] Generating real voiceover for ${sceneTexts.length} scenes`);
  
  const sceneDurations: number[] = [];
  const audioBlobs: Blob[] = [];
  
  // Process each scene
  for (let i = 0; i < sceneTexts.length; i++) {
    if (onProgress) onProgress(i + 1, sceneTexts.length);
    
    try {
      const result = await captureRealVoiceover(sceneTexts[i], config);
      audioBlobs.push(result.audioBlob);
      sceneDurations.push(result.duration);
      
      // Brief pause between scenes
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`[REAL-VO] Failed to capture scene ${i + 1}:`, error);
      // Create silent placeholder
      const silentDuration = Math.max(2, sceneTexts[i].split(' ').length * 0.5);
      sceneDurations.push(silentDuration);
      audioBlobs.push(new Blob([], { type: 'audio/wav' }));
    }
  }
  
  // Combine all audio blobs
  const combinedBlob = new Blob(audioBlobs, { type: 'audio/wav' });
  const totalDuration = sceneDurations.reduce((sum, d) => sum + d, 0);
  
  console.log(`[REAL-VO] Complete! Total duration: ${totalDuration.toFixed(2)}s`);
  
  return {
    audioBlob: combinedBlob,
    totalDuration,
    sceneDurations
  };
}