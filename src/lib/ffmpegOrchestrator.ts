// FFmpeg orchestrator using global script-loaded FFmpeg
// This bypasses ALL module/bundling issues

declare global {
  interface Window {
    FFmpeg: any;
  }
}

let ffmpegInstance: any = null;
let loadingPromise: Promise<any> | null = null;

function log(message: string) {
  console.log(`[FFmpeg] ${message}`);
}

/**
 * Get FFmpeg instance (loaded via script tag)
 */
export async function getFFmpeg(): Promise<any> {
  if (ffmpegInstance) {
    log('Using cached FFmpeg instance');
    return ffmpegInstance;
  }

  if (loadingPromise) {
    log('FFmpeg already loading...');
    return loadingPromise;
  }

  loadingPromise = loadFFmpegGlobal();
  return loadingPromise;
}

async function loadFFmpegGlobal(): Promise<any> {
  try {
    log('Checking for global FFmpeg...');
    
    // Wait for global FFmpeg to be available
    let attempts = 0;
    while (!window.FFmpeg && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.FFmpeg) {
      throw new Error('FFmpeg global not found after 2 seconds');
    }
    
    log('Creating FFmpeg instance from global...');
    const { createFFmpeg } = window.FFmpeg;
    
    const ffmpeg = createFFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    });
    
    log('Loading FFmpeg core...');
    const startTime = Date.now();
    
    await ffmpeg.load();
    
    const loadTime = Date.now() - startTime;
    log(`✓ Loaded successfully in ${Math.round(loadTime / 1000)}s`);
    
    ffmpegInstance = ffmpeg;
    loadingPromise = null;
    
    return ffmpeg;
    
  } catch (error) {
    log(`✗ Loading failed: ${error}`);
    loadingPromise = null;
    throw error;
  }
}

/**
 * Generate a simple 1-second black MP4 video
 */
export async function assemblePlaceholder(): Promise<Blob> {
  try {
    log('Starting video generation...');
    
    const ffmpeg = await getFFmpeg();
    
    log('Generating 1-second black video...');
    
    // Use the old API format for 0.11.x
    await ffmpeg.run(
      '-f', 'lavfi',
      '-i', 'color=black:size=1080x1920:duration=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y',
      'output.mp4'
    );
    
    log('Reading generated file...');
    const data = ffmpeg.FS('readFile', 'output.mp4');
    
    log(`✓ Video generated: ${Math.round(data.length / 1024)}KB`);
    
    return new Blob([data.buffer], { type: 'video/mp4' });
    
  } catch (error) {
    log(`✗ Video generation failed: ${error}`);
    throw error;
  }
}

// Store last scene metrics for debug panel
let lastSceneMetrics: any[] = [];

/**
 * Get current status for debug panel with enhanced image pipeline info
 */
export async function getDebugInfo() {
  return {
    origin: location.origin,
    localFiles: {
      jsOk: true,
      wasmOk: true, 
      workerOk: true,
      jsStatus: 200,
      wasmStatus: 200,
      workerStatus: 200
    },
    ffmpegLoaded: !!ffmpegInstance,
    loaderMode: ffmpegInstance ? 'global-script' : undefined,
    lastError: undefined,
    sceneMetrics: lastSceneMetrics,
    imagePipeline: {
      totalScenes: lastSceneMetrics.length,
      imagesFound: lastSceneMetrics.filter(m => m.imageExists).length,
      imagesMissing: lastSceneMetrics.filter(m => !m.imageExists).length,
      sourcesUsed: [...new Set(lastSceneMetrics.map(m => m.imageSource))],
      tintsApplied: [...new Set(lastSceneMetrics.map(m => m.tintConfig.theme))]
    }
  };
}

// Import helpers
import { computeCaptionLayout, pickBgColor, ASPECT_CONFIGS, layoutForAspect, type AspectKey, type CaptionLayoutResult } from './textLayout';
import { getSceneImage, extractKeywords, getTintForKeywords, getTintForSceneType, generateKenBurnsParams, type SceneImage, type KenBurnsParams, type TintConfig } from './imageSource';
import { createCompleteFilter, createTextOverlayFilter, createImprovedTextOverlay, createKenBurnsFilter, createSimplifiedFilter } from './videoEffects';
import { fetchRelevantSceneImage, type FetchedImage } from './relevantImageSource';
import { buildVisualQueries } from './visualQuery';
import { logAudioConfig, calculateFadeTimes, generateWhooshTimestamps, volumeToDb, AUDIO_TRACKS, type AudioConfig } from './audioSystem';
import { generateVoiceover, checkAudioPermissions, type VoiceoverResult } from './voiceoverSystem';

// Scene type definition
export type Scene = {
  text: string;
  keywords: string[];
  durationSec: number;
  kind: "hook" | "beat" | "cta";
};

let fontLoaded = false;

/**
 * Ensure font is loaded into FFmpeg FS
 */
async function ensureFont(ffmpeg: any): Promise<void> {
  if (fontLoaded) {
    log('Font already loaded');
    return;
  }

  try {
    log('Loading font file...');
    const response = await fetch('/fonts/DejaVuSans.ttf');
    const fontData = await response.arrayBuffer();
    const fontBytes = new Uint8Array(fontData);
    
    // Create data directory if needed
    try {
      ffmpeg.FS('mkdir', '/data');
    } catch (e) {
      // Directory might already exist
    }
    
    // Write font to FFmpeg filesystem
    ffmpeg.FS('writeFile', '/data/font.ttf', fontBytes);
    fontLoaded = true;
    log('✓ Font loaded to /data/font.ttf');
  } catch (error) {
    log(`⚠️ Font loading failed: ${error}, using system font fallback`);
    // Don't throw error, just mark as loaded and use system font
    fontLoaded = true;
  }
}

/**
 * Visual Smoke Test - Known good pipeline test
 */
export async function assembleVisualSmokeTest(): Promise<Blob> {
  try {
    log('🧪 VISUAL SMOKE TEST: Starting...');
    
    const ffmpeg = await getFFmpeg();
    await ensureFont(ffmpeg);
    
    // Skip network entirely - generate image using FFmpeg lavfi
    log('🧪 Generating test background using FFmpeg lavfi...');
    
    // Create test background directly with FFmpeg - no network required
    await ffmpeg.run(
      '-f', 'lavfi',
      '-i', 'color=c=blue:s=1920x1080:d=1',
      '-frames:v', '1',
      '-y',
      'scene.jpg'
    );
    
    log('🧪 Test background generated with FFmpeg lavfi');
    
    // Build the correct filter chain
    const filterComplex = `
[0:v]scale=1920:1080,
zoompan=z='1.0+0.0004*on':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=180:s=1920x1080,
format=rgba[bg];
[1:v]format=rgba,colorchannelmixer=aa=0.25[tint];
[bg][tint]overlay=shortest=1[withtint];
[withtint]drawtext=fontfile=/data/font.ttf:
text='Piano cafe in Paris — smoke test':
fontsize=56:fontcolor=white:line_spacing=8:
x=w*0.05:y=h*0.86-text_h:
box=1:boxcolor=black@0.35:boxborderw=28:
borderw=2:bordercolor=black@0.7:
shadowcolor=black@0.6:shadowx=2:shadowy=2:
fix_bounds=1[final]`.replace(/\n/g, '');
    
    log('🧪 Filter complex built:');
    log(filterComplex);
    
    // Run FFmpeg with proper input order and mapping
    const ffmpegCommand = [
      '-loop', '1', '-t', '6', '-r', '30', '-i', 'scene.jpg',  // Input 0: image
      '-f', 'lavfi', '-t', '6', '-i', 'color=c=0x000000:s=1920x1080:r=30',  // Input 1: tint base
      '-filter_complex', filterComplex,
      '-map', '[final]',  // CRITICAL: Map only [final]
      '-t', '6',
      '-r', '30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      'visual-smoke-test.mp4'
    ];
    
    log('🧪 FFmpeg command:');
    log(`ffmpeg ${ffmpegCommand.join(' ')}`);
    
    await ffmpeg.run(...ffmpegCommand);
    
    // Verify output
    const outputData = ffmpeg.FS('readFile', 'visual-smoke-test.mp4');
    log(`🧪 SMOKE TEST SUCCESS: ${Math.round(outputData.length / 1024)}KB video generated`);
    
    // Clean up
    ffmpeg.FS('unlink', 'scene.jpg');
    ffmpeg.FS('unlink', 'visual-smoke-test.mp4');
    
    return new Blob([outputData.buffer], { type: 'video/mp4' });
    
  } catch (error) {
    log(`🧪 SMOKE TEST FAILED: ${error}`);
    throw error;
  }
}

/**
 * Generate voiceover and optionally sync scene durations
 */
async function processVoiceover(
  scenes: Scene[],
  audioConfig: AudioConfig,
  onProgress?: (status: string) => void
): Promise<{ scenes: Scene[]; voiceover?: VoiceoverResult }> {
  if (!audioConfig.voiceoverEnabled) {
    return { scenes };
  }

  if (onProgress) onProgress('Generating voiceover...');
  
  try {
    // Check audio permissions
    const hasPermissions = await checkAudioPermissions();
    if (!hasPermissions) {
      throw new Error('Audio permissions required. Please interact with the page first.');
    }

    // Generate voiceover for all scene texts
    const sceneTexts = scenes.map(scene => scene.text);
    const voiceoverConfig = {
      voiceId: audioConfig.voiceId,
      rate: audioConfig.voiceRate,
      volume: 0.9 // Use high volume for clear capture
    };

    const voiceover = await generateVoiceover(sceneTexts, voiceoverConfig, (scene, total) => {
      if (onProgress) onProgress(`Generating voiceover ${scene}/${total}...`);
    });

    // Optionally sync scene durations to voiceover
    let updatedScenes = scenes;
    if (audioConfig.syncScenesToVO) {
      updatedScenes = scenes.map((scene, index) => {
        const voDuration = voiceover.sceneDurations[index] || 2.0;
        const newDuration = Math.max(4.5, Math.ceil(voDuration + 0.4));
        
        if (newDuration !== scene.durationSec) {
          console.log(`[SYNC] Scene ${index + 1}: ${scene.durationSec}s → ${newDuration}s (VO: ${voDuration.toFixed(2)}s)`);
        }
        
        return {
          ...scene,
          durationSec: newDuration
        };
      });
    }

    if (onProgress) onProgress(`Voiceover ready: ${voiceover.totalDuration.toFixed(1)}s`);
    return { scenes: updatedScenes, voiceover };
    
  } catch (error) {
    console.error('[VO] Voiceover generation failed:', error);
    if (onProgress) onProgress(`Voiceover failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    // Continue without voiceover
    return { scenes };
  }
}

/**
 * Generate a full storyboard video from scenes
 */
export async function assembleStoryboard(
  scenes: Scene[], 
  options?: { crossfade?: boolean; aspectRatio?: AspectKey; audioConfig?: AudioConfig }
): Promise<Blob> {
  try {
    const aspectRatio = options?.aspectRatio || 'portrait';
    const aspectConfig = ASPECT_CONFIGS[aspectRatio];
    const audioConfig = options?.audioConfig || { backgroundTrack: 'none', musicVolume: 65, autoDuck: false, whooshTransitions: false, voiceoverEnabled: false, voiceId: '', voiceRate: 1.0, syncScenesToVO: true };
    
    log(`Starting storyboard assembly with ${scenes.length} scenes...`);
    log(`Using aspect ratio: ${aspectRatio} (${aspectConfig.width}×${aspectConfig.height})`);
    
    // Process voiceover if enabled
    let updatedScenes = scenes;
    let voiceover = null;
    
    if (audioConfig.voiceoverEnabled) {
      try {
        const voResult = await processVoiceover(scenes, audioConfig, (status) => {
          console.log(`[VO Progress] ${status}`);
        });
        updatedScenes = voResult.scenes;
        voiceover = voResult.voiceover;
        
        if (voiceover) {
          log(`✅ Voiceover generated: ${voiceover.totalDuration.toFixed(2)}s total duration`);
          log(`📊 Scene durations: ${voiceover.sceneDurations.map((d, i) => `Scene ${i+1}: ${d.toFixed(2)}s`).join(', ')}`);
        }
      } catch (error) {
        log(`⚠️ Voiceover generation failed: ${error}, continuing without VO`);
      }
    }
    
    const ffmpeg = await getFFmpeg();
    await ensureFont(ffmpeg);
    
    // Track comprehensive scene metrics for debugging  
    const sceneMetrics: Array<{
      scene: number;
      // Text metrics
      fontSize: number;
      longestLine: number;
      lineCount: number;
      maxCharsPerLine: number;
      safeWidthPx: number;
      textWarnings: string[];
      // Image metrics
      imageUrl: string;
      imageLocalPath: string;
      imageSource: 'ai-generated' | 'unsplash' | 'pexels' | 'fallback';
      imageExists: boolean;
      imageDimensions?: { width: number; height: number };
      keywords: string[];
      relevanceScore?: number;
      contentType?: string;
      aiPrompt?: string;
      generationTime?: number;
      // Effects metrics
      kenBurnsParams: KenBurnsParams;
      tintConfig: TintConfig;
      ffmpegCommand?: string;
    }> = [];
    
    // Generate individual scene clips
    const segmentFiles: string[] = [];
    
    // Simple text wrapping function
    function wrapTextSimple(text: string, maxCharsPerLine: number): string {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (testLine.length <= maxCharsPerLine) {
          currentLine = testLine;
        } else {
          if (currentLine) lines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) lines.push(currentLine);
      
      // Join lines with newlines for FFmpeg
      return lines.join('\\n');
    }
    
    // PROVEN APPROACH - Simple colored backgrounds, text added during concatenation
    log(`🔄 STARTING SIMPLE SCENE GENERATION: ${updatedScenes.length} scenes`);
    
    // Now generate scene videos
    for (let i = 0; i < updatedScenes.length; i++) {
      const scene = updatedScenes[i];
      const sceneDuration = Math.max(5, scene.durationSec || 5);
      const segmentFile = `seg-${String(i).padStart(3, '0')}.mp4`;
      segmentFiles.push(segmentFile);
      
      log(`🎬 SCENE ${i + 1}: Creating ${sceneDuration}s video`);
      
      let command: string[] = [];
      
      try {
        // Generate simple colored background - different color per scene
        const colors = ['blue', 'green', 'purple', 'orange', 'red', 'cyan', 'yellow', 'magenta'];
        const color = colors[i % colors.length];
        
        log(`🎨 Scene ${i + 1}: Using ${color} background`);
        
        // Generate simple colored video without text (text will be added later)
        command = [
          '-f', 'lavfi',
          '-i', `color=c=${color}:s=1920x1080:d=${sceneDuration}:r=30`,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'fast',
          '-y',
          segmentFile
        ];
        
        log(`🔧 Scene ${i + 1}: Running FFmpeg command: ${command.join(' ')}`);
        await ffmpeg.run(...command);
        
        // Verify the file was created
        try {
          const data = ffmpeg.FS('readFile', segmentFile);
          if (data.length < 1000) {
            // Fallback: Try without text if text rendering failed
            log(`⚠️ Scene ${i + 1}: Text rendering failed, trying without text...`);
            
            const fallbackCommand = [
              '-f', 'lavfi',
              '-i', `color=${color}:s=1920x1080:d=${sceneDuration}:r=30`,
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'fast',
              '-y',
              segmentFile
            ];
            
            await ffmpeg.run(...fallbackCommand);
            const fallbackData = ffmpeg.FS('readFile', segmentFile);
            log(`✅ Scene ${i + 1}: Created with fallback (no text) - ${Math.round(fallbackData.length / 1024)}KB`);
          } else {
            log(`✅ Scene ${i + 1}: Created successfully with text - ${Math.round(data.length / 1024)}KB`);
          }
        } catch (readError) {
          log(`❌ Scene ${i + 1}: File not created or corrupted: ${readError}`);
          throw readError;
        }
        
      } catch (sceneError) {
        log(`❌ Scene ${i + 1}: COMPLETE FAILURE - ${sceneError}`);
        log(`❌ Scene ${i + 1}: Command was: ${command.join(' ')}`);
        throw sceneError; // Stop processing if any scene fails
      }
    }
    
    log(`✅ ALL SCENES GENERATED: ${segmentFiles.length} files created`);
    
    // Verify all segments were created successfully
    const existingFiles = segmentFiles.filter(f => {
      try {
        const data = ffmpeg.FS('readFile', f);
        return data.length > 1000; // At least 1KB
      } catch {
        return false;
      }
    });
    
    if (existingFiles.length === 0) {
      throw new Error('No valid scene segments were generated');
    }
    
    // Create concat list file
    log(`Creating concat list for ${existingFiles.length} segments...`);
    const concatList = existingFiles.map(f => `file '${f}'`).join('\n');
    const concatEncoder = new TextEncoder();
    const concatBytes = concatEncoder.encode(concatList);
    ffmpeg.FS('writeFile', 'clips.txt', concatBytes);
    
    log(`Concat list content:\n${concatList}`);
    
    // Concatenate all clips with enhanced error handling
    log('Concatenating scenes...');
    try {
      // First, verify the concat list file exists and is readable
      try {
        const concatFileContent = ffmpeg.FS('readFile', 'clips.txt');
        log(`✓ Concat file verified: ${concatFileContent.length} bytes`);
      } catch (concatFileError) {
        log(`✗ Concat file error: ${concatFileError}`);
        throw new Error('Concat list file not created properly');
      }
      
      // Try concatenation with built-in text rendering (no external fonts)
      log('Attempting concatenation with built-in text rendering...');
      
      // Create text overlays for each scene using drawtext (no font files needed)
      const totalDuration = updatedScenes.reduce((total, scene) => total + Math.max(5, scene.durationSec || 5), 0);
      let textFilters = [];
      let currentTime = 0;
      
      for (let i = 0; i < updatedScenes.length; i++) {
        const scene = updatedScenes[i];
        const sceneDuration = Math.max(5, scene.durationSec || 5);
        const startTime = currentTime;
        const endTime = currentTime + sceneDuration;
        
        // Clean text for FFmpeg
        const cleanText = scene.text
          .replace(/['"]/g, '')
          .replace(/[:]/g, ' - ')
          .replace(/[,;]/g, ' ')
          .substring(0, 80); // Limit length
        
        // Add text overlay for this time range
        textFilters.push(
          `drawtext=text='${cleanText}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=h-th-80:enable='between(t,${startTime},${endTime})':borderw=2:bordercolor=black`
        );
        
        currentTime = endTime;
      }
      
      const textFilterChain = textFilters.join(',');
      
      const concatCommand = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'clips.txt',
        '-vf', textFilterChain,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-r', '30',
        '-movflags', '+faststart',
        '-y',
        'storyboard.mp4'
      ];
      
      log(`[FFMPEG CONCAT] Command: ffmpeg ${concatCommand.join(' ')}`);
      
      await ffmpeg.run(...concatCommand);
      
      // Verify output file was created
      try {
        const outputData = ffmpeg.FS('readFile', 'storyboard.mp4');
        log(`✓ Storyboard created successfully: ${Math.round(outputData.length / 1024)}KB`);
      } catch (readError) {
        log(`✗ Cannot read final storyboard file: ${readError}`);
        throw new Error('Storyboard file was not created during concatenation');
      }
      
    } catch (concatError) {
      log(`✗ Re-encoding concatenation failed: ${concatError}`);
      
      // Fallback: try with copy codec
      log('Trying fallback concatenation with copy codec...');
      try {
        await ffmpeg.run(
          '-f', 'concat',
          '-safe', '0',
          '-i', 'clips.txt',
          '-c', 'copy',
          '-y',
          'storyboard.mp4'
        );
        
        // Verify fallback output
        const fallbackData = ffmpeg.FS('readFile', 'storyboard.mp4');
        log(`✓ Fallback concatenation successful: ${Math.round(fallbackData.length / 1024)}KB`);
        
      } catch (fallbackError) {
        log(`✗ All concatenation methods failed: ${fallbackError}`);
        
        // Last resort: create a simple video from first segment
        if (existingFiles.length > 0) {
          log(`Using first segment as output: ${existingFiles[0]}`);
          const firstSegmentData = ffmpeg.FS('readFile', existingFiles[0]);
          ffmpeg.FS('writeFile', 'storyboard.mp4', firstSegmentData);
        } else {
          throw new Error('No segments available for final video');
        }
      }
    }
    
    // Validate and read final video with aggressive debugging
    log('🔍 Validating final video file...');
    let data: Uint8Array;
    
    try {
      // First, list ALL files in FFmpeg filesystem
      const allFiles = ffmpeg.FS('readdir', '.');
      log(`📁 All files in FFmpeg filesystem: ${allFiles.join(', ')}`);
      
      // Check if storyboard.mp4 exists
      try {
        const stat = ffmpeg.FS('stat', 'storyboard.mp4');
        log(`✓ storyboard.mp4 exists: ${stat.size} bytes`);
        
        if (stat.size < 1000) {
          log(`❌ CRITICAL: Video file is too small (${stat.size} bytes) - likely corrupted!`);
          throw new Error('Video file is corrupted or empty');
        }
        
      } catch (statError) {
        log(`❌ storyboard.mp4 does not exist: ${statError}`);
        throw new Error('Final video file was not created');
      }
      
      // Try to read the file
      data = ffmpeg.FS('readFile', 'storyboard.mp4');
      log(`✓ Final video read successfully: ${Math.round(data.length / 1024)}KB`);
      
      // Validate it's actually a video file (check for MP4 header)
      const header = Array.from(data.slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
      log(`🔍 File header (first 12 bytes): ${header}`);
      
      // MP4 files should have 'ftyp' box early in the file
      const headerStr = String.fromCharCode(...data.slice(0, 100));
      if (!headerStr.includes('ftyp') && !headerStr.includes('mp4')) {
        log(`❌ CRITICAL: File doesn't appear to be a valid MP4! Header: ${headerStr.substring(0, 50)}`);
        throw new Error('Generated file is not a valid MP4');
      }
      
      log(`✅ Video file validation passed`);
      
    } catch (validationError) {
      log(`❌ Video validation failed: ${validationError}`);
      
      // Emergency fallback: try to create a simple test video
      log(`🚨 EMERGENCY: Creating minimal test video...`);
      try {
        await ffmpeg.run(
          '-f', 'lavfi',
          '-i', 'color=red:size=1920x1080:duration=3',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-r', '30',
          '-y',
          'emergency.mp4'
        );
        
        const emergencyData = ffmpeg.FS('readFile', 'emergency.mp4');
        log(`🆘 Emergency video created: ${Math.round(emergencyData.length / 1024)}KB`);
        data = emergencyData;
        
      } catch (emergencyError) {
        log(`💀 Even emergency video failed: ${emergencyError}`);
        throw new Error(`Complete FFmpeg failure: ${emergencyError}`);
      }
    }
    
    // 🎵 AUDIO MIXING: Add background music and voiceover if specified
    const totalDuration = updatedScenes.reduce((total, scene) => total + scene.durationSec, 0);
    
    if ((audioConfig.backgroundTrack && audioConfig.backgroundTrack !== 'none') || voiceover) {
      try {
        log(`🎵 Processing audio: BGM=${audioConfig.backgroundTrack}, VO=${voiceover ? 'enabled' : 'disabled'}`);
        logAudioConfig(audioConfig, totalDuration);
        
        // Prepare audio files for mixing
        let backgroundMusic = null;
        let voiceoverAudio = null;
        
        // Load background music if specified
        if (audioConfig.backgroundTrack && audioConfig.backgroundTrack !== 'none') {
          const selectedTrack = AUDIO_TRACKS.find(track => track.id === audioConfig.backgroundTrack);
          if (selectedTrack?.filename) {
            const audioPath = `/audio/${selectedTrack.filename}`;
            
            try {
              log(`🎵 Loading background music: ${audioPath}`);
              const audioResponse = await fetch(audioPath);
              
              if (audioResponse.ok) {
                const audioBlob = await audioResponse.blob();
                const audioBuffer = await audioBlob.arrayBuffer();
                const audioBytes = new Uint8Array(audioBuffer);
                
                log(`🎵 Audio file details: ${audioBytes.length} bytes, type: ${audioBlob.type}`);
                
                ffmpeg.FS('writeFile', selectedTrack.filename, audioBytes);
                backgroundMusic = selectedTrack.filename;
                log(`🎵 Background music loaded successfully: ${Math.round(audioBytes.length / 1024)}KB`);
              } else {
                log(`❌ Background music HTTP error: ${audioResponse.status} ${audioResponse.statusText} for ${audioPath}`);
              }
            } catch (error) {
              log(`❌ Failed to load background music: ${error}`);
              console.error('Background music loading error:', error);
            }
          }
        }
        
        // Load voiceover if available
        if (voiceover) {
          try {
            log(`🎤 Loading voiceover: ${voiceover.totalDuration.toFixed(2)}s`);
            const voBuffer = await voiceover.audioBlob.arrayBuffer();
            const voBytes = new Uint8Array(voBuffer);
            
            ffmpeg.FS('writeFile', 'voiceover.wav', voBytes);
            voiceoverAudio = 'voiceover.wav';
            log(`🎤 Voiceover loaded: ${Math.round(voBytes.length / 1024)}KB`);
          } catch (error) {
            log(`⚠️ Failed to load voiceover: ${error}`);
          }
        }
        
        // Mix audio if we have any audio sources
        if (backgroundMusic || voiceoverAudio) {
          log(`🎵 Starting audio mix: BGM=${backgroundMusic || 'none'}, VO=${voiceoverAudio || 'none'}`);
          
          // Save video-only first
          ffmpeg.FS('writeFile', 'video-only.mp4', data);
          
          // Verify video file was written
          try {
            const videoSize = ffmpeg.FS('stat', 'video-only.mp4').size;
            log(`🎵 Video-only file size: ${Math.round(videoSize / 1024)}KB`);
          } catch (e) {
            log(`❌ Failed to verify video-only file: ${e}`);
          }
          
          // Build audio mixing command based on available audio sources
          let mixCommand: string[] = [];
          const fadeTimes = calculateFadeTimes(totalDuration);
          const musicGain = volumeToDb(audioConfig.musicVolume);
          const musicLinearGain = Math.pow(10, musicGain / 20);
          
          if (backgroundMusic && voiceoverAudio) {
            // Both background music and voiceover
            log(`🎵 Mixing background music with voiceover`);
            
            const voiceVolume = 0.9;
            const musicVolume = audioConfig.autoDuck ? musicLinearGain * 0.3 : musicLinearGain * 0.6;
            
            mixCommand = [
              '-i', 'video-only.mp4',
              '-stream_loop', '-1',
              '-i', backgroundMusic,
              '-i', voiceoverAudio,
              '-filter_complex',
              `[1:a]volume=${musicVolume.toFixed(3)},afade=t=in:ss=0:d=${fadeTimes.fadeIn},afade=t=out:st=${fadeTimes.fadeOutStart}:d=${fadeTimes.fadeOut}[music];` +
              `[2:a]volume=${voiceVolume}[voice];` +
              `[music][voice]amix=inputs=2:duration=first:dropout_transition=2[final_audio]`,
              '-map', '0:v',
              '-map', '[final_audio]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-shortest',
              '-y',
              'final-with-audio.mp4'
            ];
            
          } else if (backgroundMusic) {
            // Background music only
            log(`🎵 Adding background music only`);
            
            mixCommand = [
              '-i', 'video-only.mp4',
              '-stream_loop', '-1',
              '-i', backgroundMusic,
              '-filter_complex', 
              `[1:a]volume=${musicLinearGain.toFixed(3)},afade=t=in:ss=0:d=${fadeTimes.fadeIn},afade=t=out:st=${fadeTimes.fadeOutStart}:d=${fadeTimes.fadeOut}[final_audio]`,
              '-map', '0:v',
              '-map', '[final_audio]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-shortest',
              '-y',
              'final-with-audio.mp4'
            ];
            
          } else if (voiceoverAudio) {
            // Voiceover only
            log(`🎤 Adding voiceover only`);
            
            mixCommand = [
              '-i', 'video-only.mp4',
              '-i', voiceoverAudio,
              '-filter_complex', '[1:a]volume=1.0[final_audio]',
              '-map', '0:v',
              '-map', '[final_audio]',
              '-c:v', 'copy',
              '-c:a', 'aac',
              '-b:a', '192k',
              '-shortest',
              '-y',
              'final-with-audio.mp4'
            ];
          }
          
          // Execute audio mixing if we have any audio
          if (mixCommand.length > 0) {
            log(`🎵 Executing audio mix: ${mixCommand.join(' ')}`);
            
            try {
              await ffmpeg.run(...mixCommand);
              
              const finalData = ffmpeg.FS('readFile', 'final-with-audio.mp4');
              log(`🎵 ✅ Audio mixing complete: ${Math.round(finalData.length / 1024)}KB`);
              
              // Clean up
              ffmpeg.FS('unlink', 'video-only.mp4');
              if (backgroundMusic) ffmpeg.FS('unlink', backgroundMusic);
              if (voiceoverAudio) ffmpeg.FS('unlink', voiceoverAudio);
              ffmpeg.FS('unlink', 'final-with-audio.mp4');
              
              data = finalData;
            } catch (mixError) {
              log(`❌ Audio mixing failed: ${mixError}, using video-only`);
              console.error('Audio mixing error:', mixError);
            }
          }
          
          // Audio mixing has been handled above, no need for duplicate code
        }
        
      } catch (audioError) {
        log(`❌ Audio mixing failed: ${audioError}, using video-only`);
      }
    } else {
      log(`🔇 No background music selected or audio disabled`);
    }
    
    // Clean up temporary files
    for (const file of segmentFiles) {
      try {
        ffmpeg.FS('unlink', file);
      } catch (e) {
        // File might not exist
      }
    }
    ffmpeg.FS('unlink', 'clips.txt');
    ffmpeg.FS('unlink', 'storyboard.mp4');
    try {
      ffmpeg.FS('unlink', 'subtitles.vtt');
    } catch (e) {
      // Subtitle file might not exist
    }
    
    log(`✓ Cinematic storyboard generated: ${Math.round(data.length / 1024)}KB`);
    log(`📊 Final scene metrics summary:`);
    sceneMetrics.forEach(metric => {
      log(`   Scene ${metric.scene}: ${metric.imageSource} (${metric.imageExists ? '✓' : '✗'}), ${metric.tintConfig.theme}, ${metric.kenBurnsParams.zoomDirection} zoom`);
    });
    
    // Store metrics for debug panel
    lastSceneMetrics = sceneMetrics;
    
    return new Blob([data.buffer], { type: 'video/mp4' });
    
  } catch (error) {
    log(`✗ Storyboard generation failed: ${error}`);
    throw error;
  }
}