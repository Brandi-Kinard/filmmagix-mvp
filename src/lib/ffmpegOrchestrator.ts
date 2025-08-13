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
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    
    log(`Loading from: ${baseURL}`);
    log(`Core JS URL: ${baseURL}/ffmpeg-core.js`);
    log(`Core WASM URL: ${baseURL}/ffmpeg-core.wasm`);
    
    // Pre-download the files with progress tracking
    log('Starting file downloads with progress tracking...');
    
    const downloadWithProgress = async (url: string, description: string) => {
      log(`Downloading ${description}...`);
      const startTime = Date.now();
      
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        log(`${description} size: ${Math.round(total / 1024)}KB`);
        
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');
        
        const chunks: Uint8Array[] = [];
        let downloaded = 0;
        let lastProgress = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          chunks.push(value);
          downloaded += value.length;
          
          if (total > 0) {
            const progress = Math.round((downloaded / total) * 100);
            if (progress >= lastProgress + 10) { // Log every 10%
              log(`${description} download: ${progress}% (${Math.round(downloaded / 1024)}KB)`);
              lastProgress = progress;
            }
          }
        }
        
        const elapsed = Date.now() - startTime;
        log(`${description} downloaded successfully in ${elapsed}ms`);
        
        // Concatenate all chunks into a single Uint8Array
        const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        
        return result;
      } catch (error) {
        logError(`Failed to download ${description}`, error);
        throw error;
      }
    };

    // Download both files in parallel
    const [jsData, wasmData] = await Promise.all([
      downloadWithProgress(`${baseURL}/ffmpeg-core.js`, 'Core JS'),
      downloadWithProgress(`${baseURL}/ffmpeg-core.wasm`, 'Core WASM')
    ]);

    log('Converting downloaded files to blob URLs...');
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(new Blob([jsData], { type: 'text/javascript' }), 'text/javascript').then(url => {
        log('Core JS blob URL created:', url.substring(0, 50) + '...');
        return url;
      }),
      toBlobURL(new Blob([wasmData], { type: 'application/wasm' }), 'application/wasm').then(url => {
        log('Core WASM blob URL created:', url.substring(0, 50) + '...');
        return url;
      })
    ]);

    log('Starting FFmpeg core initialization with 60 second timeout...');
    
    // Create a timeout promise with much longer timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg initialization timeout after 60 seconds'));
      }, 60000);
    });

    // Race the load against the timeout
    const loadStartTime = Date.now();
    await Promise.race([
      ffmpeg.load({ coreURL, wasmURL }),
      timeoutPromise
    ]);

    const loadTime = Date.now() - loadStartTime;
    log(`FFmpeg loaded successfully in ${loadTime}ms!`);
    ffmpegInstance = ffmpeg;
    loadPromise = null; // Clear the loading promise
    
    return ffmpeg;
    
  } catch (error) {
    loadPromise = null; // Clear the failed loading promise
    logError('Failed to load FFmpeg core', error);
    
    // Provide specific error messages
    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        throw new Error('FFmpeg loading is taking longer than expected. This may be due to a slow internet connection. Please ensure you have a stable connection and try again.');
      } else if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
        throw new Error('Network error downloading FFmpeg core files. Please check your internet connection and try again.');
      } else if (error.message.includes('HTTP')) {
        throw new Error(`Server error: ${error.message}. Please try again later.`);
      } else if (error.message.includes('CORS')) {
        throw new Error('Browser security (CORS) error. Try refreshing the page.');
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
    const execStartTime = Date.now();
    const execPromise = ffmpeg.exec(ffmpegArgs);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('FFmpeg execution timeout after 30 seconds'));
      }, 30000);
    });

    await Promise.race([execPromise, timeoutPromise]);
    const execTime = Date.now() - execStartTime;
    log(`FFmpeg execution completed successfully in ${execTime}ms`);

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