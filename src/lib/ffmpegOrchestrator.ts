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
    
    // Use the correct URLs that match @ffmpeg/ffmpeg@0.12.15
    // The core files are distributed in the umd directory
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    log(`Loading from: ${baseURL}`);
    log(`Core JS URL: ${baseURL}/ffmpeg-core.js`);
    log(`Core WASM URL: ${baseURL}/ffmpeg-core.wasm`);
    
    // Test if URLs are accessible first
    log('Testing URL accessibility...');
    try {
      const testResponse = await fetch(`${baseURL}/ffmpeg-core.js`, { method: 'HEAD' });
      log('Core JS HEAD request status:', testResponse.status);
      if (!testResponse.ok) {
        throw new Error(`Core JS not accessible: ${testResponse.status}`);
      }
    } catch (headError) {
      logError('Failed to access core JS file', headError);
      throw new Error('Cannot access FFmpeg core files from CDN');
    }

    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript').then(url => {
        log('Core JS blob URL created:', url.substring(0, 50) + '...');
        return url;
      }).catch(error => {
        logError('Failed to create JS blob URL', error);
        throw error;
      }),
      toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm').then(url => {
        log('Core WASM blob URL created:', url.substring(0, 50) + '...');
        return url;
      }).catch(error => {
        logError('Failed to create WASM blob URL', error);
        throw error;
      })
    ]);

    log('Starting FFmpeg core load with 30 second timeout...');
    
    // Create a timeout promise with longer timeout for first load
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg load timeout after 30 seconds'));
      }, 30000);
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
        throw new Error('FFmpeg loading timed out. The files are large (~3MB). Please wait and try again.');
      } else if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
        throw new Error('Network error downloading FFmpeg core. Please check your internet connection and try again.');
      } else if (error.message.includes('CORS')) {
        throw new Error('Browser security (CORS) error. Try refreshing the page.');
      } else if (error.message.includes('not accessible')) {
        throw new Error('FFmpeg core files not available from CDN. Please try again later.');
      }
    }
    
    throw new Error(`FFmpeg initialization failed: ${error}`);
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