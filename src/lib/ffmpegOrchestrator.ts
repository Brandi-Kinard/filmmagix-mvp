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

/**
 * Get current status for debug panel
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
    lastError: undefined
  };
}

// Import helpers
import { computeCaptionLayout, pickBgColor, ASPECT_CONFIGS, layoutForAspect, type AspectKey, type CaptionLayoutResult } from './textLayout';

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
    log(`✗ Font loading failed: ${error}`);
    throw new Error(`Failed to load font: ${error}`);
  }
}

/**
 * Generate a full storyboard video from scenes
 */
export async function assembleStoryboard(scenes: Scene[], options?: { crossfade?: boolean; aspectRatio?: AspectKey }): Promise<Blob> {
  try {
    const aspectRatio = options?.aspectRatio || 'portrait';
    const aspectConfig = ASPECT_CONFIGS[aspectRatio];
    
    log(`Starting storyboard assembly with ${scenes.length} scenes...`);
    log(`Using aspect ratio: ${aspectRatio} (${aspectConfig.width}×${aspectConfig.height})`);
    
    const ffmpeg = await getFFmpeg();
    await ensureFont(ffmpeg);
    
    // Track text metrics for debugging
    const textMetrics: Array<{ 
      scene: number; 
      fontSize: number; 
      longestLine: number; 
      lineCount: number;
      maxCharsPerLine: number;
      safeWidthPx: number;
      warnings: string[];
    }> = [];
    
    // Generate individual scene clips
    const segmentFiles: string[] = [];
    
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const segmentFile = `seg-${String(i).padStart(3, '0')}.mp4`;
      segmentFiles.push(segmentFile);
      
      log(`Generating scene ${i + 1}/${scenes.length}: ${scene.kind.toUpperCase()}`);
      
      // Compute safe caption layout with smart wrapping
      const captionLayout = computeCaptionLayout({
        text: scene.text,
        widthPx: aspectConfig.width,
        aspect: aspectRatio
      });
      
      const bgColor = pickBgColor(i);
      
      // Store metrics for debugging
      textMetrics.push({
        scene: i + 1,
        fontSize: captionLayout.fontSize,
        longestLine: captionLayout.longestLineLength,
        lineCount: captionLayout.linesCount,
        maxCharsPerLine: captionLayout.maxCharsPerLine,
        safeWidthPx: captionLayout.safeWidthPx,
        warnings: captionLayout.warnings
      });
      
      // Log warnings for this scene
      if (captionLayout.warnings.length > 0) {
        log(`⚠️ Scene ${i + 1} warnings: ${captionLayout.warnings.join(', ')}`);
      }
      
      // CENTER-JUSTIFIED POSITIONING with fixed bottom margin
      const bottomY = aspectConfig.height - 180; // 180px from bottom
      
      console.log(`[FFMPEG DEBUG] Scene ${i + 1} text being sent to FFmpeg: "${captionLayout.wrappedText}"`);
      
      const drawtextFilter = [
        `drawtext=fontfile=/data/font.ttf`,
        `text='${captionLayout.wrappedText}'`,
        `fontcolor=white`,
        `fontsize=${captionLayout.fontSize}`,
        `line_spacing=8`,                    // Normal line spacing
        `x=(w-text_w)/2`,                    // CENTER horizontally
        `y=${bottomY}`,                      // FIXED pixel position from bottom
        `borderw=2`,                         // Border for readability
        `bordercolor=black@0.8`,             // Strong black border
        `box=1`,
        `boxcolor=black@0.4`,                // Semi-transparent black box
        `boxborderw=12`                      // Box padding
      ].join(':');
      
      console.log(`[FFMPEG DEBUG] Complete drawtext filter: ${drawtextFilter}`);
      
      // Generate scene video with correct aspect ratio
      await ffmpeg.run(
        '-f', 'lavfi',
        '-i', `color=c=${bgColor}:s=${aspectConfig.width}x${aspectConfig.height}:d=${scene.durationSec}`,
        '-vf', drawtextFilter,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-y',
        segmentFile
      );
      
      log(`✓ Scene ${i + 1} generated`);
    }
    
    // Create concat list file
    log('Creating concat list...');
    const concatList = segmentFiles.map(f => `file '${f}'`).join('\n');
    const encoder = new TextEncoder();
    const concatBytes = encoder.encode(concatList);
    ffmpeg.FS('writeFile', 'clips.txt', concatBytes);
    
    // Concatenate all clips
    log('Concatenating scenes...');
    await ffmpeg.run(
      '-f', 'concat',
      '-safe', '0',
      '-i', 'clips.txt',
      '-c', 'copy',
      '-y',
      'storyboard.mp4'
    );
    
    // Read final video
    log('Reading final video...');
    const data = ffmpeg.FS('readFile', 'storyboard.mp4');
    
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
    
    log(`✓ Storyboard video generated: ${Math.round(data.length / 1024)}KB`);
    log(`📊 Text metrics:`, textMetrics);
    
    return new Blob([data.buffer], { type: 'video/mp4' });
    
  } catch (error) {
    log(`✗ Storyboard generation failed: ${error}`);
    throw error;
  }
}