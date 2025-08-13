import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;

/**
 * Get a cached FFmpeg instance, loading it if necessary
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  const ffmpeg = new FFmpeg();
  
  // Load FFmpeg core from CDN
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  console.log('FFmpeg loaded successfully');
  
  return ffmpeg;
}

/**
 * Generate a placeholder 1-second black MP4 video (1080x1920 portrait)
 */
export async function assemblePlaceholder(): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  
  // Clear any existing files
  try {
    await ffmpeg.deleteFile('output.mp4');
  } catch (e) {
    // File doesn't exist, that's fine
  }

  // Generate 1-second black video in portrait mode (1080x1920)
  await ffmpeg.exec([
    '-f', 'lavfi',
    '-i', 'color=black:size=1080x1920:duration=1',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    'output.mp4'
  ]);

  // Read the output file
  const data = await ffmpeg.readFile('output.mp4');
  
  // Convert to Blob
  const videoBlob = new Blob([data], { type: 'video/mp4' });
  
  console.log('Generated placeholder MP4:', videoBlob.size, 'bytes');
  
  return videoBlob;
}

/**
 * Future: Assemble full video from storyboard scenes
 * This function will be implemented in the next step
 */
export async function assembleStoryboard(scenes: any[]): Promise<Blob> {
  // Placeholder for future implementation
  console.log('assembleStoryboard called with', scenes.length, 'scenes');
  
  // For now, just return the placeholder
  return assemblePlaceholder();
}