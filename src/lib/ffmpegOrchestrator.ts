import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

function log(message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] FFmpeg:`, message, ...args);
}

function logError(message: string, error?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] FFmpeg ERROR:`, message, error);
}

/**
 * Get a cached FFmpeg instance, loading it if necessary
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    log('Using cached FFmpeg instance');
    return ffmpegInstance;
  }

  // If already loading, return the existing promise
  if (loadPromise) {
    log('FFmpeg already loading, waiting for completion...');
    return loadPromise;
  }

  log('Starting FFmpeg initialization...');
  
  loadPromise = loadFFmpegCore();
  return loadPromise;
}

async function loadFFmpegCore(): Promise<FFmpeg> {
  const ffmpeg = new FFmpeg();
  
  // Add progress and log listeners
  ffmpeg.on('log', ({ message }) => {
    log('FFmpeg internal log:', message);
  });
  
  ffmpeg.on('progress', ({ progress, time }) => {
    log(`FFmpeg progress: ${Math.round(progress * 100)}% (${time}ms)`);
  });

  try {
    log('Starting simplified FFmpeg core loading...');
    
    // Use the proven approach from FFmpeg.wasm documentation
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    log(`Loading core from: ${baseURL}`);
    
    // Use the standard toBlobURL approach that's proven to work
    log('Step 1: Creating blob URLs...');
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    log('✓ Core JS blob URL created');
    
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    log('✓ Core WASM blob URL created');
    
    log('Step 2: Initializing FFmpeg core (this may take up to 2 minutes on slow connections)...');
    
    // Load with extended timeout but simpler approach
    const loadStartTime = Date.now();
    
    // Create timeout promise - 2 minutes should be enough for any reasonable connection
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg core loading timeout after 2 minutes'));
      }, 120000); // 2 minutes
    });

    // Load FFmpeg core
    await Promise.race([
      ffmpeg.load({ coreURL, wasmURL }),
      timeoutPromise
    ]);

    const loadTime = Date.now() - loadStartTime;
    log(`✓ FFmpeg loaded successfully in ${Math.round(loadTime / 1000)}s!`);
    
    ffmpegInstance = ffmpeg;
    loadPromise = null;
    
    return ffmpeg;
    
  } catch (error) {
    loadPromise = null;
    logError('FFmpeg loading failed', error);
    
    // Clear any partial state
    ffmpegInstance = null;
    
    // Provide actionable error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error('FFmpeg core loading timed out after 2 minutes. This typically indicates a very slow internet connection. Please try again with a better connection, or try again later.');
      } else if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new Error('Network error while downloading FFmpeg core files (~3MB total). Please check your internet connection and try again.');
      } else if (error.message.includes('CORS')) {
        throw new Error('Browser security error. Please refresh the page and try again.');
      }
    }
    
    throw new Error(`Failed to initialize FFmpeg: ${error}`);
  }
}

/**
 * Generate a placeholder 1-second black MP4 video (1080x1920 portrait)
 */
export async function assemblePlaceholder(): Promise<Blob> {
  try {
    log('Starting video generation...');
    
    const ffmpeg = await getFFmpeg();
    log('FFmpeg ready, generating video...');
    
    // Clean up any existing files
    try {
      await ffmpeg.deleteFile('output.mp4');
      log('Cleaned up existing output file');
    } catch (e) {
      // File doesn't exist, that's fine
    }

    log('Executing video generation command...');
    
    // Generate 1-second black video in portrait mode
    await ffmpeg.exec([
      '-f', 'lavfi',
      '-i', 'color=black:size=1080x1920:duration=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y',
      'output.mp4'
    ]);

    log('Reading generated video file...');
    const data = await ffmpeg.readFile('output.mp4');
    
    if (data.length === 0) {
      throw new Error('Generated video file is empty');
    }

    log(`Video generated successfully: ${Math.round(data.length / 1024)}KB`);
    
    const videoBlob = new Blob([data], { type: 'video/mp4' });
    return videoBlob;
    
  } catch (error) {
    logError('Video generation failed', error);
    throw error;
  }
}

/**
 * Future: Assemble full video from storyboard scenes
 */
export async function assembleStoryboard(scenes: any[]): Promise<Blob> {
  log('assembleStoryboard called with', scenes.length, 'scenes');
  return assemblePlaceholder();
}