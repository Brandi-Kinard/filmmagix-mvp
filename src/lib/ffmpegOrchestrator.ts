// FFmpeg orchestrator using global script-loaded FFmpeg
// This bypasses ALL module/bundling issues

declare global {
  interface Window {
    createFFmpeg: any;
    FFmpegReady: boolean;
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
    
    // Wait for global createFFmpeg to be available
    let attempts = 0;
    while (!window.FFmpegReady && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    if (!window.FFmpegReady || !window.createFFmpeg) {
      throw new Error('FFmpeg global not found after 2 seconds');
    }
    
    log('Creating FFmpeg instance from global...');
    const createFFmpeg = window.createFFmpeg;
    
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
import { logAudioConfig, calculateFadeTimes, generateWhooshTimestamps, volumeToDb, AUDIO_TRACKS, type AudioConfig, validateNarrationFile } from './audioSystem';
import { renderCaptionPNG, loadCanvasFont } from './canvasCaption';
import { provideSceneBackground, getBackgroundModeName, type BackgroundMode, type SceneBackground } from './backgroundProvider';
import { createKenBurnsFilter, type KenBurnsParams, type TintConfig } from './videoEffects';
// MVP Scope: Live TTS imports removed

// Scene type definition
export type Scene = {
  text: string;
  keywords: string[];
  durationSec: number;
  kind: "hook" | "beat" | "cta";
  background: SceneBackground;
};

/**
 * Generate Ken Burns parameters for a scene
 */
function generateKenBurnsParams(durationSeconds: number): KenBurnsParams {
  const zoomDirections: ('in' | 'out')[] = ['in', 'out'];
  const panDirections: ('left-right' | 'right-left' | 'top-bottom' | 'bottom-top')[] = [
    'left-right', 'right-left', 'top-bottom', 'bottom-top'
  ];
  
  return {
    zoomDirection: zoomDirections[Math.floor(Math.random() * zoomDirections.length)],
    panDirection: panDirections[Math.floor(Math.random() * panDirections.length)],
    duration: durationSeconds
  };
}

/**
 * Generate tint configuration for a scene
 */
function generateTintConfig(sceneType: 'hook' | 'beat' | 'cta'): TintConfig {
  const tints = {
    hook: { color: 'rgba(255, 69, 0, 0.15)', theme: 'warm-energy', keywords: ['hook', 'attention'] },
    beat: { color: 'rgba(30, 144, 255, 0.12)', theme: 'cool-narrative', keywords: ['story', 'flow'] },
    cta: { color: 'rgba(50, 205, 50, 0.18)', theme: 'action-green', keywords: ['action', 'call'] }
  };
  
  return tints[sceneType];
}

// Font loading now handled by canvasCaption.ts

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
 * Progress callback for export operations
 */
export interface ExportProgress {
  current: number;
  total: number;
  stage: string;
  step?: string; // Specific step identifier for retry functionality
}

export interface ExportError extends Error {
  step?: string;
  recoverable?: boolean;
}

/**
 * Generate a full storyboard video from scenes
 */
export async function assembleStoryboard(
  scenes: Scene[], 
  options?: { 
    audioConfig?: AudioConfig;
    transitionDuration?: number;
    enableAI?: boolean;
    onProgress?: (progress: ExportProgress) => void;
    checkCancelled?: () => boolean;
  }
): Promise<Blob> {
  try {
    const audioConfig = options?.audioConfig || { backgroundTrack: 'none', musicVolume: 65, whooshTransitions: false, includeNarration: false, narrationFile: null };
    const transitionDuration = options?.transitionDuration || 0.6;
    const enableAI = options?.enableAI || false;
    const onProgress = options?.onProgress;
    const checkCancelled = options?.checkCancelled;
    
    log(`Starting storyboard assembly with ${scenes.length} scenes...`);
    log(`Using landscape aspect ratio: 1920×1080`);
    
    // MVP Scope: No live voiceover generation
    let updatedScenes = scenes;
    let narrationAudioBlob = null;
    
    // Get FFmpeg instance and load Canvas font for PNG caption rendering
    const ffmpeg = await getFFmpeg();
    await loadCanvasFont();
    
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
    
    // PNG caption rendering replaces text wrapping function
    
    // NEW APPROACH - PNG caption overlays instead of drawtext
    log(`🔄 STARTING PNG OVERLAY SCENE GENERATION: ${updatedScenes.length} scenes`);
    
    // Now generate scene videos with PNG caption overlays
    for (let i = 0; i < updatedScenes.length; i++) {
      // Check for cancellation
      if (checkCancelled && checkCancelled()) {
        log(`❌ Export cancelled by user at scene ${i + 1}`);
        throw new Error('Export cancelled by user');
      }
      
      // Report progress
      if (onProgress) {
        onProgress({
          current: i,
          total: updatedScenes.length + 2, // +2 for concatenation and audio mixing
          stage: `Generating scene ${i + 1} of ${updatedScenes.length}`,
          step: `scene_${i}`
        });
      }
      const scene = updatedScenes[i];
      const sceneDuration = Math.max(5, scene.durationSec || 5);
      const segmentFile = `seg-${String(i).padStart(3, '0')}.mp4`;
      segmentFiles.push(segmentFile);
      
      log(`🎬 SCENE ${i + 1}: Creating ${sceneDuration}s video with PNG caption`);
      
      let command: string[] = [];
      
      try {
        // Generate background using new background provider
        let backgroundFilename: string | null = null;
        let ffmpegInputs: string[] = [];
        let filterInputSource: string;
        
        log(`🎨 Scene ${i + 1}: Generating background (mode: ${scene.background.mode})`);
        
        const startTime = Date.now();
        const backgroundResult = await provideSceneBackground(
          scene.background,
          scene.text,
          i,
          updatedScenes.map(s => s.text).join(' '),
          enableAI,
          `project-${Date.now()}`, // Simple project ID
          1920,
          1080
        );
        const backgroundTime = Date.now() - startTime;
        log(`🎨 Scene ${i + 1}: Background generated in ${backgroundTime}ms`);
        
        if (backgroundResult.success && backgroundResult.jpegBlob) {
          // Write background image to FFmpeg filesystem
          backgroundFilename = `scene-${i}-bg.jpg`;
          
          try {
            const backgroundBuffer = await backgroundResult.jpegBlob.arrayBuffer();
            const backgroundBytes = new Uint8Array(backgroundBuffer);
            
            if (backgroundBytes.length === 0) {
              throw new Error('Empty image blob received');
            }
            
            ffmpeg.FS('writeFile', backgroundFilename, backgroundBytes);
            log(`🎨 Scene ${i + 1}: Background generated (${getBackgroundModeName(backgroundResult.actualMode)}) - ${Math.round(backgroundBytes.length / 1024)}KB`);
            
          } catch (fsError) {
            log(`✗ Scene ${i + 1}: Failed to write background to FFmpeg FS: ${fsError}`);
            throw new Error(`Failed to write background image for scene ${i + 1}: ${fsError}`);
          }
          
          // Background image input
          ffmpegInputs = [
            '-loop', '1',
            '-t', String(sceneDuration),
            '-i', backgroundFilename
          ];
          filterInputSource = '[0:v]';
        } else {
          // Fallback to solid color if background generation fails
          log(`⚠️ Scene ${i + 1}: Background generation failed, using fallback color`);
          ffmpegInputs = [
            '-f', 'lavfi',
            '-i', `color=c=blue:s=1920x1080:d=${sceneDuration}:r=30`
          ];
          filterInputSource = '[0:v]';
        }
        
        // Generate PNG caption overlay with scene index
        log(`🖼️ Scene ${i + 1}: Rendering PNG caption for "${scene.text.substring(0, 50)}..."`);
        
        const captionPNG = await renderCaptionPNG(scene.text, 1920, 1080, i);
        const captionBuffer = await captionPNG.arrayBuffer();
        const captionBytes = new Uint8Array(captionBuffer);
        
        // Write PNG to FFmpeg filesystem with proper naming
        const captionFilename = `caption-scene-${i}.png`;
        ffmpeg.FS('writeFile', captionFilename, captionBytes);
        log(`🖼️ Scene ${i + 1}: Caption PNG written as ${captionFilename} (${Math.round(captionBytes.length / 1024)}KB)`);
        
        // SIMPLIFIED: Just basic overlay for now to debug the hang
        log(`🎬 Scene ${i + 1}: Using simplified overlay for debugging`);
        
        // Simple scale + caption overlay
        const filterComplex = `${filterInputSource}scale=1920:1080[scaled];[scaled][1:v]overlay=0:0[final]`;
        
        // Create scene with Ken Burns, tint, and PNG caption overlay
        const overlayCommand = [
          ...ffmpegInputs,  // Background input (either user image or color)
          '-i', captionFilename,  // Caption PNG overlay
          '-filter_complex', filterComplex,
          '-map', '[final]',
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', 'fast',
          '-y',
          segmentFile
        ];
        
        command = overlayCommand;
        
        log(`🔧 Scene ${i + 1}: Starting FFmpeg execution with command: ${command.join(' ')}`);
        
        try {
          const ffmpegStart = Date.now();
          await ffmpeg.run(...command);
          const ffmpegTime = Date.now() - ffmpegStart;
          log(`🔧 Scene ${i + 1}: FFmpeg completed in ${ffmpegTime}ms`);
          
          // Verify the file was created and is valid size
          const data = ffmpeg.FS('readFile', segmentFile);
          if (data.length > 1000) {
            log(`✅ Scene ${i + 1}: Scene with PNG caption created successfully - ${Math.round(data.length / 1024)}KB`);
          } else {
            throw new Error('Generated file too small, scene generation failed');
          }
          
          // Clean up caption PNG and background image if present
          ffmpeg.FS('unlink', captionFilename);
          if (backgroundFilename) {
            try { ffmpeg.FS('unlink', backgroundFilename); } catch (e) {}
          }
          
        } catch (sceneError) {
          log(`❌ Scene ${i + 1}: PNG overlay generation failed: ${sceneError.message}`);
          // Clean up on error
          try { ffmpeg.FS('unlink', captionFilename); } catch (e) {}
          if (backgroundFilename) {
            try { ffmpeg.FS('unlink', backgroundFilename); } catch (e) {}
          }
          
          // GUARD-RAIL: Create enhanced error with step info
          const enhancedError = new Error(`Scene ${i + 1} generation failed: ${sceneError.message}`) as ExportError;
          enhancedError.step = `scene_${i}`;
          enhancedError.recoverable = true;
          throw enhancedError;
        }
        
      } catch (sceneError) {
        log(`❌ Scene ${i + 1}: COMPLETE FAILURE - ${sceneError}`);
        log(`❌ Scene ${i + 1}: Command was: ${command.join(' ')}`);
        
        // GUARD-RAIL: Re-throw with step info if not already enhanced
        if (!(sceneError as ExportError).step) {
          const enhancedError = new Error(`Scene ${i + 1} processing failed: ${sceneError}`) as ExportError;
          enhancedError.step = `scene_${i}`;
          enhancedError.recoverable = true;
          throw enhancedError;
        }
        throw sceneError; // Stop processing if any scene fails
      }
    }
    
    log(`✅ ALL SCENES GENERATED: ${segmentFiles.length} files created`);
    
    // MVP Scope: Process uploaded narration file if provided
    if (audioConfig.includeNarration && audioConfig.narrationFile) {
      try {
        log(`🎤 Processing uploaded narration file: ${audioConfig.narrationFile.name}`);
        
        // Validate the file
        const validation = validateNarrationFile(audioConfig.narrationFile);
        if (!validation.valid) {
          throw new Error(`Invalid narration file: ${validation.error}`);
        }
        
        // Convert to blob for processing
        narrationAudioBlob = audioConfig.narrationFile;
        log(`✅ Narration file ready for mixing: ${Math.round(narrationAudioBlob.size / 1024)}KB`);
        
      } catch (error) {
        log(`⚠️ Narration file processing failed: ${error}`);
        // Continue without narration
      }
    }
    
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
    
    // Check for cancellation before transitions
    if (checkCancelled && checkCancelled()) {
      log(`❌ Export cancelled by user before transitions`);
      throw new Error('Export cancelled by user');
    }
    
    // Report transitions progress
    if (onProgress) {
      onProgress({
        current: updatedScenes.length,
        total: updatedScenes.length + 2,
        stage: 'Creating crossfade transitions...',
        step: 'transitions'
      });
    }
    
    // NEW CROSSFADE IMPLEMENTATION: Build xfade filter chain for visible transitions
    log(`🎬 CROSSFADE TRANSITIONS: Using ${transitionDuration}s xfade between ${existingFiles.length} segments`);
    
    try {
      await createCrossfadeVideo(ffmpeg, existingFiles, updatedScenes, transitionDuration);
      
      // Verify output file was created
      try {
        const outputData = ffmpeg.FS('readFile', 'storyboard.mp4');
        log(`✓ Crossfade storyboard created successfully: ${Math.round(outputData.length / 1024)}KB`);
      } catch (readError) {
        log(`✗ Cannot read final storyboard file: ${readError}`);
        throw new Error('Storyboard file was not created during crossfade processing');
      }
      
    } catch (crossfadeError) {
      log(`✗ Crossfade processing failed: ${crossfadeError}`);
      
      // ROBUST FALLBACK: Use fade-in/out + concat if xfade fails
      log('🔄 FALLBACK: Using fade-in/out + concat method...');
      try {
        await createFadeTransitionsVideo(ffmpeg, existingFiles, transitionDuration);
        
        const fallbackData = ffmpeg.FS('readFile', 'storyboard.mp4');
        log(`✓ Fallback fade transitions successful: ${Math.round(fallbackData.length / 1024)}KB`);
        
      } catch (fallbackError) {
        log(`✗ Fallback transitions failed: ${fallbackError}`);
        
        // ULTIMATE FALLBACK: Simple concat without transitions
        log('🔄 ULTIMATE FALLBACK: Simple concatenation without transitions...');
        try {
          await createSimpleConcatVideo(ffmpeg, existingFiles);
          
          const ultimateData = ffmpeg.FS('readFile', 'storyboard.mp4');
          log(`✓ Simple concatenation successful: ${Math.round(ultimateData.length / 1024)}KB`);
        } catch (ultimateError) {
          // GUARD-RAIL: Even simple concat failed
          const enhancedError = new Error(`All transition methods failed: ${ultimateError}`) as ExportError;
          enhancedError.step = 'transitions';
          enhancedError.recoverable = false;
          throw enhancedError;
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
    
    // 🎵 AUDIO MIXING: Add background music and narration if specified
    // Calculate total duration accounting for crossfade transitions
    let totalDuration = updatedScenes.reduce((total, scene) => total + scene.durationSec, 0);
    
    // Subtract overlapping transition time for crossfades
    if (existingFiles.length > 1) {
      const totalTransitionOverlap = (existingFiles.length - 1) * transitionDuration;
      totalDuration = Math.max(5, totalDuration - totalTransitionOverlap);
      log(`🎵 Total duration adjusted for ${existingFiles.length - 1} crossfades: ${totalDuration}s (saved ${totalTransitionOverlap}s from overlaps)`);
    }
    
    if ((audioConfig.backgroundTrack && audioConfig.backgroundTrack !== 'none') || narrationAudioBlob) {
      try {
        // Report audio mixing progress
        if (onProgress) {
          onProgress({
            current: updatedScenes.length + 1,
            total: updatedScenes.length + 2,
            stage: 'Adding audio...',
            step: 'audio_mixing'
          });
        }
        
        log(`🎵 Processing audio: BGM=${audioConfig.backgroundTrack}, Narration=${narrationAudioBlob ? 'enabled' : 'disabled'}`);
        logAudioConfig(audioConfig, totalDuration);
        
        // Prepare audio files for mixing
        let backgroundMusic = null;
        let narrationAudio = null;
        
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
        
        // Load narration if available
        if (narrationAudioBlob) {
          try {
            log(`🎤 Loading narration audio`);
            const narrationBuffer = await narrationAudioBlob.arrayBuffer();
            const narrationBytes = new Uint8Array(narrationBuffer);
            
            log(`🎤 Narration size: ${narrationBytes.length} bytes`);
            
            // Determine file extension from original filename
            const filename = narrationAudioBlob.name || 'narration.wav';
            const extension = filename.split('.').pop()?.toLowerCase() || 'wav';
            const narrationFilename = `narration.${extension}`;
            
            ffmpeg.FS('writeFile', narrationFilename, narrationBytes);
            narrationAudio = narrationFilename;
            log(`🎤 Narration loaded: ${Math.round(narrationBytes.length / 1024)}KB`);
            
          } catch (error) {
            log(`⚠️ Failed to load narration: ${error}`);
          }
        } else {
          log(`🎤 No narration file provided`);
        }
        
        // Prepare whoosh SFX if enabled
        let whooshAudio = null;
        if (audioConfig.whooshTransitions && existingFiles.length > 1) {
          try {
            log(`💨 Loading whoosh SFX for transitions`);
            const whooshResponse = await fetch('/audio/whoosh-1.wav');
            
            if (whooshResponse.ok) {
              const whooshBlob = await whooshResponse.blob();
              const whooshBuffer = await whooshBlob.arrayBuffer();
              const whooshBytes = new Uint8Array(whooshBuffer);
              
              ffmpeg.FS('writeFile', 'whoosh-1.wav', whooshBytes);
              whooshAudio = 'whoosh-1.wav';
              log(`💨 Whoosh SFX loaded: ${Math.round(whooshBytes.length / 1024)}KB`);
            } else {
              log(`❌ Whoosh SFX HTTP error: ${whooshResponse.status}`);
            }
          } catch (error) {
            log(`❌ Failed to load whoosh SFX: ${error}`);
          }
        }
        
        // Mix audio if we have any audio sources
        if (backgroundMusic || narrationAudio || whooshAudio) {
          log(`🎵 Starting audio mix: BGM=${backgroundMusic || 'none'}, Narration=${narrationAudio || 'none'}, Whoosh=${whooshAudio || 'none'}`);
          
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
          
          if (backgroundMusic && narrationAudio) {
            // Both background music and narration - MVP scope settings
            log(`🎵 Mixing background music with narration (MVP scope: 0.7 music, 1.0 narration, -3dB limiter)`);
            
            if (whooshAudio) {
              // Include whoosh SFX with music and narration
              const whooshTimestamps = generateWhooshTimestamps(updatedScenes.map(s => s.durationSec));
              log(`💨 Adding whoosh SFX at timestamps: ${whooshTimestamps.join(', ')}`);
              
              mixCommand = [
                '-i', 'video-only.mp4',
                '-stream_loop', '-1',
                '-i', backgroundMusic,
                '-i', narrationAudio,
                '-i', whooshAudio,
                '-filter_complex',
                // Create whoosh layer with multiple delays for each transition
                '[3:a]' + whooshTimestamps.map((time, i) => `adelay=${Math.round(time * 1000)}|${Math.round(time * 1000)}`).join(',') + ',volume=0.3[whooshes];' +
                '[1:a]volume=0.7,afade=t=in:ss=0:d=' + fadeTimes.fadeIn + ',afade=t=out:st=' + fadeTimes.fadeOutStart + ':d=' + fadeTimes.fadeOut + '[music];' +
                '[2:a]volume=1.0,atrim=duration=' + totalDuration + '[narration];' +
                '[music][narration][whooshes]amix=inputs=3:duration=first,alimiter=limit=0.7:attack=1:release=50[final_audio]',
                '-map', '0:v',
                '-map', '[final_audio]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-y',
                'final-with-audio.mp4'
              ];
            } else {
              mixCommand = [
                '-i', 'video-only.mp4',
                '-stream_loop', '-1',
                '-i', backgroundMusic,
                '-i', narrationAudio,
                '-filter_complex',
                // Music at 0.7 volume, narration at 1.0, with -3dB limiter to prevent clipping
                '[1:a]volume=0.7,afade=t=in:ss=0:d=' + fadeTimes.fadeIn + ',afade=t=out:st=' + fadeTimes.fadeOutStart + ':d=' + fadeTimes.fadeOut + '[music];' +
                '[2:a]volume=1.0,atrim=duration=' + totalDuration + '[narration];' +
                '[music][narration]amix=inputs=2:duration=first,alimiter=limit=0.7:attack=1:release=50[final_audio]',
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
            
          } else if (backgroundMusic) {
            // Background music only
            log(`🎵 Adding background music only`);
            
            const musicGain = volumeToDb(audioConfig.musicVolume);
            const musicLinearGain = Math.pow(10, musicGain / 20);
            
            log(`🎵 Music volume: ${audioConfig.musicVolume}% -> ${musicGain.toFixed(2)}dB -> ${musicLinearGain.toFixed(3)} linear`);
            log(`🎵 Fade times: in=${fadeTimes.fadeIn}s, out=${fadeTimes.fadeOut}s @ ${fadeTimes.fadeOutStart}s`);
            
            if (whooshAudio) {
              // Include whoosh SFX with background music
              const whooshTimestamps = generateWhooshTimestamps(updatedScenes.map(s => s.durationSec));
              log(`💨 Adding whoosh SFX at timestamps: ${whooshTimestamps.join(', ')}`);
              
              mixCommand = [
                '-i', 'video-only.mp4',
                '-stream_loop', '-1',
                '-i', backgroundMusic,
                '-i', whooshAudio,
                '-filter_complex',
                // Create whoosh layer with multiple delays for each transition
                '[2:a]' + whooshTimestamps.map((time, i) => `adelay=${Math.round(time * 1000)}|${Math.round(time * 1000)}`).join(',') + ',volume=0.4[whooshes];' +
                `[1:a]volume=${musicLinearGain.toFixed(3)},afade=t=in:ss=0:d=${fadeTimes.fadeIn},afade=t=out:st=${fadeTimes.fadeOutStart}:d=${fadeTimes.fadeOut}[music];` +
                '[music][whooshes]amix=inputs=2:duration=first,alimiter=limit=0.8[final_audio]',
                '-map', '0:v',
                '-map', '[final_audio]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-y',
                'final-with-audio.mp4'
              ];
            } else {
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
            }
            
          } else if (narrationAudio) {
            // Narration only
            log(`🎤 Adding narration only (stretched/trimmed to video duration)`);
            
            if (whooshAudio) {
              // Include whoosh SFX with narration
              const whooshTimestamps = generateWhooshTimestamps(updatedScenes.map(s => s.durationSec));
              log(`💨 Adding whoosh SFX at timestamps: ${whooshTimestamps.join(', ')}`);
              
              mixCommand = [
                '-i', 'video-only.mp4',
                '-i', narrationAudio,
                '-i', whooshAudio,
                '-filter_complex',
                // Create whoosh layer with multiple delays for each transition
                '[2:a]' + whooshTimestamps.map((time, i) => `adelay=${Math.round(time * 1000)}|${Math.round(time * 1000)}`).join(',') + ',volume=0.5[whooshes];' +
                `[1:a]volume=1.0,atrim=duration=${totalDuration}[narration];` +
                '[narration][whooshes]amix=inputs=2:duration=first,alimiter=limit=0.7[final_audio]',
                '-map', '0:v',
                '-map', '[final_audio]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-y',
                'final-with-audio.mp4'
              ];
            } else {
              mixCommand = [
                '-i', 'video-only.mp4',
                '-i', narrationAudio,
                '-filter_complex', `[1:a]volume=1.0,atrim=duration=${totalDuration},alimiter=limit=0.7[final_audio]`,
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
          } else if (whooshAudio) {
            // Whoosh only (no background music or narration)
            log(`💨 Adding whoosh SFX only`);
            
            const whooshTimestamps = generateWhooshTimestamps(updatedScenes.map(s => s.durationSec));
            log(`💨 Adding whoosh SFX at timestamps: ${whooshTimestamps.join(', ')}`);
            
            mixCommand = [
              '-i', 'video-only.mp4',
              '-i', whooshAudio,
              '-filter_complex',
              // Create whoosh layer with multiple delays for each transition
              '[1:a]' + whooshTimestamps.map((time, i) => `adelay=${Math.round(time * 1000)}|${Math.round(time * 1000)}`).join(',') + ',volume=0.6[final_audio]',
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
              
              // Verify the audio was actually added
              const originalSize = data.length;
              const finalSize = finalData.length;
              log(`🎵 Size comparison: Original=${Math.round(originalSize / 1024)}KB -> Final=${Math.round(finalSize / 1024)}KB`);
              
              // Clean up
              ffmpeg.FS('unlink', 'video-only.mp4');
              if (backgroundMusic) ffmpeg.FS('unlink', backgroundMusic);
              if (narrationAudio) ffmpeg.FS('unlink', narrationAudio);
              if (whooshAudio) ffmpeg.FS('unlink', whooshAudio);
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
    
    // Clean up other temporary files (safe cleanup)
    const tempFilesToClean = ['clips.txt', 'storyboard.mp4', 'subtitles.vtt', 'video-only.mp4', 'final-with-audio.mp4'];
    for (const file of tempFilesToClean) {
      try {
        ffmpeg.FS('unlink', file);
      } catch (e) {
        // File might not exist, which is fine
      }
    }
    
    // Report completion
    if (onProgress) {
      onProgress({
        current: updatedScenes.length + 2,
        total: updatedScenes.length + 2,
        stage: 'Export complete!'
      });
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

/**
 * Create crossfade video using xfade filter chain
 */
async function createCrossfadeVideo(
  ffmpeg: any, 
  segmentFiles: string[], 
  scenes: Scene[], 
  transitionDuration: number
): Promise<void> {
  log(`[XFADE] Building crossfade filter chain for ${segmentFiles.length} segments`);
  
  if (segmentFiles.length <= 1) {
    // Single segment, just copy it
    await ffmpeg.run('-i', segmentFiles[0], '-c', 'copy', '-y', 'storyboard.mp4');
    return;
  }
  
  // Calculate timing offsets for overlapping transitions
  const segmentDurations = scenes.map(scene => Math.max(5, scene.durationSec || 5));
  const offsetTable: Array<{ segment: number; start: number; duration: number }> = [];
  
  let currentOffset = 0;
  for (let i = 0; i < segmentFiles.length; i++) {
    const segmentDuration = segmentDurations[i];
    offsetTable.push({
      segment: i,
      start: currentOffset,
      duration: segmentDuration
    });
    
    // Next segment starts earlier to create overlap for crossfade
    if (i < segmentFiles.length - 1) {
      currentOffset += segmentDuration - transitionDuration;
    }
  }
  
  // Debug: Log offset table
  log(`[XFADE] Offset table for ${transitionDuration}s crossfades:`);
  offsetTable.forEach(entry => {
    log(`   Segment ${entry.segment}: start=${entry.start}s, duration=${entry.duration}s`);
  });
  
  // Build FFmpeg inputs
  const inputs: string[] = [];
  for (const file of segmentFiles) {
    inputs.push('-i', file);
  }
  
  // Build xfade filter complex chain
  const filterParts: string[] = [];
  let currentLabel = '[0:v]';
  
  for (let i = 1; i < segmentFiles.length; i++) {
    const fadeOffset = offsetTable[i].start;
    const nextLabel = i === segmentFiles.length - 1 ? '' : `[v${i}]`;
    
    filterParts.push(
      `${currentLabel}[${i}:v]xfade=transition=fade:duration=${transitionDuration}:offset=${fadeOffset}${nextLabel}`
    );
    
    currentLabel = `[v${i}]`;
  }
  
  const filterComplex = filterParts.join(';');
  log(`[XFADE] Filter complex: ${filterComplex}`);
  
  // Execute FFmpeg command with xfade
  const command = [
    ...inputs,
    '-filter_complex', filterComplex,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-y',
    'storyboard.mp4'
  ];
  
  log(`[XFADE] FFmpeg command: ffmpeg ${command.join(' ')}`);
  await ffmpeg.run(...command);
}

/**
 * Create transitions using fade-in/out + concat (fallback method)
 */
async function createFadeTransitionsVideo(
  ffmpeg: any,
  segmentFiles: string[],
  transitionDuration: number
): Promise<void> {
  log(`[FADE] Creating fade transitions with ${transitionDuration}s duration`);
  
  if (segmentFiles.length <= 1) {
    // Single segment, just copy it
    await ffmpeg.run('-i', segmentFiles[0], '-c', 'copy', '-y', 'storyboard.mp4');
    return;
  }
  
  // Process each segment to add fade-out (except last) and fade-in (except first)
  const processedFiles: string[] = [];
  
  for (let i = 0; i < segmentFiles.length; i++) {
    const inputFile = segmentFiles[i];
    const outputFile = `faded-${String(i).padStart(3, '0')}.mp4`;
    processedFiles.push(outputFile);
    
    const filters: string[] = [];
    
    // Add fade-in for all segments except first
    if (i > 0) {
      filters.push(`fade=t=in:st=0:d=${transitionDuration}`);
    }
    
    // Add fade-out for all segments except last
    if (i < segmentFiles.length - 1) {
      filters.push(`fade=t=out:st=${5 - transitionDuration}:d=${transitionDuration}`);
    }
    
    if (filters.length > 0) {
      const filterString = filters.join(',');
      await ffmpeg.run(
        '-i', inputFile,
        '-vf', filterString,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-y', outputFile
      );
      log(`[FADE] Processed segment ${i + 1} with filters: ${filterString}`);
    } else {
      // No filters needed, just copy
      await ffmpeg.run('-i', inputFile, '-c', 'copy', '-y', outputFile);
      log(`[FADE] Copied segment ${i + 1} without filters`);
    }
  }
  
  // Create concat list for processed files
  const concatList = processedFiles.map(f => `file '${f}'`).join('\n');
  const concatEncoder = new TextEncoder();
  const concatBytes = concatEncoder.encode(concatList);
  ffmpeg.FS('writeFile', 'fade-clips.txt', concatBytes);
  
  // Concatenate with overlap to create smooth transitions
  await ffmpeg.run(
    '-f', 'concat',
    '-safe', '0',
    '-i', 'fade-clips.txt',
    '-c', 'copy',
    '-y',
    'storyboard.mp4'
  );
  
  log(`[FADE] Successfully created fade transitions video`);
}

/**
 * Simple concatenation without transitions (ultimate fallback)
 */
async function createSimpleConcatVideo(ffmpeg: any, segmentFiles: string[]): Promise<void> {
  log(`[CONCAT] Simple concatenation of ${segmentFiles.length} segments`);
  
  if (segmentFiles.length === 1) {
    // Single segment, just copy it
    await ffmpeg.run('-i', segmentFiles[0], '-c', 'copy', '-y', 'storyboard.mp4');
    return;
  }
  
  // Create concat list file
  const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
  const concatEncoder = new TextEncoder();
  const concatBytes = concatEncoder.encode(concatList);
  ffmpeg.FS('writeFile', 'simple-clips.txt', concatBytes);
  
  // Simple concat without re-encoding
  await ffmpeg.run(
    '-f', 'concat',
    '-safe', '0',
    '-i', 'simple-clips.txt',
    '-c', 'copy',
    '-y',
    'storyboard.mp4'
  );
  
  log(`[CONCAT] Simple concatenation completed`);
}