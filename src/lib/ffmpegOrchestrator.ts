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
    log('Creating blob URLs for FFmpeg core files...');
    
    // Use the exact core version that matches our ffmpeg version
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist';
    
    log(`Loading from: ${baseURL}`);
    log(`Core JS URL: ${baseURL}/ffmpeg-core.js`);
    log(`Core WASM URL: ${baseURL}/ffmpeg-core.wasm`);
    
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript').then(url => {
        log('Core JS blob URL created:', url.substring(0, 50) + '...');
        return url;
      }),
      toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm').then(url => {
        log('Core WASM blob URL created:', url.substring(0, 50) + '...');
        return url;
      })
    ]);

    log('Starting FFmpeg core load with 15 second timeout...');
    
    // Create a timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg load timeout after 15 seconds'));
      }, 15000);
    });

    // Race the load against the timeout
    await Promise.race([
      ffmpeg.load({ coreURL, wasmURL }),
      timeoutPromise
    ]);

    log('FFmpeg loaded successfully!');
    ffmpegInstance = ffmpeg;
    loadPromise = null; // Clear the loading promise
    
    return ffmpeg;
    
  } catch (error) {
    loadPromise = null; // Clear the failed loading promise
    logError('Failed to load FFmpeg core', error);
    
    // Provide specific error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error('FFmpeg loading timed out. Please check your internet connection and try again.');
      } else if (error.message.includes('fetch')) {
        throw new Error('Failed to download FFmpeg core files. Please check your internet connection.');
      } else if (error.message.includes('CORS')) {
        throw new Error('CORS error loading FFmpeg core. This may be a browser security issue.');
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
    log('Starting assemblePlaceholder()...');
    
    const ffmpeg = await getFFmpeg();
    log('FFmpeg instance ready, beginning video generation...');
    
    // Clear any existing files
    const filesToClean = ['output.mp4'];
    for (const file of filesToClean) {
      try {
        await ffmpeg.deleteFile(file);
        log(`Cleaned up existing file: ${file}`);
      } catch (e) {
        log(`File ${file} doesn't exist (this is fine)`);
      }
    }

    log('Executing FFmpeg command to generate black video...');
    
    const ffmpegArgs = [
      '-f', 'lavfi',
      '-i', 'color=black:size=1080x1920:duration=1',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-y', // Overwrite output file
      'output.mp4'
    ];
    
    log('FFmpeg command:', ffmpegArgs.join(' '));
    
    // Execute with timeout
    const execPromise = ffmpeg.exec(ffmpegArgs);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg execution timeout after 30 seconds'));
      }, 30000);
    });

    await Promise.race([execPromise, timeoutPromise]);
    log('FFmpeg execution completed successfully');

    log('Reading generated MP4 file...');
    const data = await ffmpeg.readFile('output.mp4');
    log('MP4 file read successfully, size:', data.length, 'bytes');
    
    if (data.length === 0) {
      throw new Error('Generated MP4 file is empty');
    }

    log('Converting to Blob...');
    const videoBlob = new Blob([data], { type: 'video/mp4' });
    log('Blob created successfully, final size:', videoBlob.size, 'bytes');
    
    log('assemblePlaceholder() completed successfully');
    return videoBlob;
    
  } catch (error) {
    logError('assemblePlaceholder() failed', error);
    throw error;
  }
}

/**
 * Future: Assemble full video from storyboard scenes
 * This function will be implemented in the next step
 */
export async function assembleStoryboard(scenes: any[]): Promise<Blob> {
  log('assembleStoryboard called with', scenes.length, 'scenes');
  
  // For now, just return the placeholder
  return assemblePlaceholder();
}