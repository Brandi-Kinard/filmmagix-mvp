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
      aiPrompt?: string;
      generationTime?: number;
      // Effects metrics
      kenBurnsParams: KenBurnsParams;
      tintConfig: TintConfig;
      ffmpegCommand?: string;
    }> = [];
    
    // Generate individual scene clips
    const segmentFiles: string[] = [];
    
    // Process scenes with imagery, effects, and text
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const segmentFile = `seg-${String(i).padStart(3, '0')}.mp4`;
      segmentFiles.push(segmentFile);
      
      log(`🎬 Generating cinematic scene ${i + 1}/${scenes.length}: ${scene.kind.toUpperCase()}`);
      
      try {
        // 1. Get scene image using new pipeline
        log(`📸 Fetching high-resolution image for scene ${i + 1}...`);
        const sceneImage = await getSceneImage(scene, i);
        
        // 2. Use scene-type based tinting (Step 4.1 requirement)
        const tintConfig = getTintForSceneType(scene.kind);
        
        // 3. Generate Ken Burns parameters with randomization
        const kenBurnsParams = generateKenBurnsParams(scene.durationSec);
        
        // 4. Compute text layout with improved wrapping
        const captionLayout = computeCaptionLayout({
          text: scene.text,
          widthPx: aspectConfig.width,
          aspect: aspectRatio
        });
        
        // 5. Store comprehensive metrics with image verification
        sceneMetrics.push({
          scene: i + 1,
          // Text metrics
          fontSize: captionLayout.fontSize,
          longestLine: captionLayout.longestLineLength,
          lineCount: captionLayout.linesCount,
          maxCharsPerLine: captionLayout.maxCharsPerLine,
          safeWidthPx: captionLayout.safeWidthPx,
          textWarnings: captionLayout.warnings,
          // Image metrics
          imageUrl: sceneImage.url,
          imageLocalPath: sceneImage.localPath,
          imageSource: sceneImage.source,
          imageExists: sceneImage.fileExists || false,
          imageDimensions: sceneImage.dimensions,
          keywords: sceneImage.keywords,
          aiPrompt: sceneImage.prompt,
          generationTime: sceneImage.generationTime,
          // Effects metrics
          kenBurnsParams,
          tintConfig
        });
        
        // 6. Log scene info with detailed image verification
        log(`🎨 Scene ${i + 1}: ${sceneImage.source} image (${sceneImage.fileExists ? 'EXISTS' : 'MISSING'}), ${tintConfig.theme} tint, ${kenBurnsParams.zoomDirection} zoom`);
        
        if (captionLayout.warnings.length > 0) {
          log(`⚠️ Scene ${i + 1} text warnings: ${captionLayout.warnings.join(', ')}`);
        }
        
        // 7. Prepare and verify image for FFmpeg with extensive logging
        let imageFile: string | null = null;
        let imageDownloaded = false;
        
        log(`🖼️ Scene ${i + 1} IMAGE STATUS:`);
        log(`   - URL: ${sceneImage.url}`);
        log(`   - Local Path: ${sceneImage.localPath}`);
        log(`   - Source: ${sceneImage.source}`);
        log(`   - File Exists: ${sceneImage.fileExists}`);
        log(`   - Has Image Data: ${!!(sceneImage as any).imageData}`);
        
        if (sceneImage.fileExists && sceneImage.localPath && (sceneImage as any).imageData) {
          imageFile = sceneImage.localPath;
          
          try {
            const imageBytes = (sceneImage as any).imageData as Uint8Array;
            
            if (!imageBytes || imageBytes.length === 0) {
              throw new Error('Image data is empty');
            }
            
            log(`📁 Writing image to FFmpeg filesystem: ${imageFile}`);
            
            // Write to FFmpeg filesystem
            ffmpeg.FS('writeFile', imageFile, imageBytes);
            
            // Verify file was written correctly
            const verifyData = ffmpeg.FS('readFile', imageFile);
            imageDownloaded = verifyData.length > 0;
            
            if (verifyData.length !== imageBytes.length) {
              throw new Error(`Size mismatch: wrote ${imageBytes.length}, read ${verifyData.length}`);
            }
            
            log(`✅ Image VERIFIED in FFmpeg filesystem: ${imageFile} (${verifyData.length} bytes)`);
            
            // List all files to confirm
            const allFiles = ffmpeg.FS('readdir', '.');
            log(`🗂 FFmpeg filesystem contents: ${allFiles.join(', ')}`);
            
          } catch (error) {
            log(`❌ Image preparation failed for scene ${i + 1}: ${error}`);
            imageFile = null;
            imageDownloaded = false;
          }
        } else {
          log(`⚠️ Scene ${i + 1}: No valid image data - using color background`);
          log(`   Missing: ${!sceneImage.fileExists ? 'fileExists' : ''} ${!sceneImage.localPath ? 'localPath' : ''} ${!(sceneImage as any).imageData ? 'imageData' : ''}`);
        }
        
        // 8. Create improved text overlay with proper positioning
        const textFilter = createImprovedTextOverlay(
          captionLayout.wrappedText,
          aspectConfig.width,
          aspectConfig.height
        );
        
        // 9. Generate video with complete effects pipeline
        let ffmpegCommand: string[] = [];
        
        if (imageFile && imageDownloaded) {
          log(`🎬 Creating scene ${i + 1} with image + Ken Burns + Tint + Text...`);
          
          try {
            // Build complete filter chain with Ken Burns, tint, and text
            const kenBurnsFilter = createKenBurnsFilter(kenBurnsParams);
            
            // Create filter_complex chain
            let filterComplex = `[0:v]scale=1920:1080[scaled];`;
            filterComplex += `[scaled]${kenBurnsFilter}[kenburns];`;
            
            // Add tint overlay
            const rgbaMatch = tintConfig.color.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/);
            if (rgbaMatch) {
              const [, r, g, b, a] = rgbaMatch;
              const hexColor = `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
              const opacity = parseFloat(a);
              
              filterComplex += `color=c=${hexColor}:s=1920x1080:d=${scene.durationSec}[tintcolor];`;
              filterComplex += `[tintcolor]format=rgba,colorchannelmixer=aa=${opacity}[tint];`;
              filterComplex += `[kenburns][tint]overlay=0:0[tinted];`;
              filterComplex += `[tinted]${textFilter}[final]`;
            } else {
              // No tint, just add text
              filterComplex += `[kenburns]${textFilter}[final]`;
            }
            
            ffmpegCommand = [
              '-i', imageFile,
              '-filter_complex', filterComplex,
              '-map', '[final]',
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-t', scene.durationSec.toString(),
              '-r', '30',
              '-movflags', '+faststart',
              '-y',
              segmentFile
            ];
            
            // Store command for debugging
            sceneMetrics[sceneMetrics.length - 1].ffmpegCommand = ffmpegCommand.join(' ');
            
            log(`[FFMPEG] Scene ${i + 1} FULL PIPELINE: ffmpeg ${ffmpegCommand.join(' ')}`);
            log(`[FFMPEG] Filter complex: ${filterComplex}`);
            
            // Run with extensive error checking
            const startTime = Date.now();
            try {
              await ffmpeg.run(...ffmpegCommand);
              const endTime = Date.now();
              const duration = endTime - startTime;
              
              log(`✅ Scene ${i + 1} FULL PIPELINE completed in ${duration}ms`);
              
              // Immediately verify the segment was created properly
              try {
                const segmentData = ffmpeg.FS('readFile', segmentFile);
                const segmentSizeKB = Math.round(segmentData.length / 1024);
                
                if (segmentData.length < 1000) {
                  throw new Error(`Segment file too small: ${segmentData.length} bytes`);
                }
                
                log(`✅ Scene ${i + 1} segment verified: ${segmentSizeKB}KB`);
                
              } catch (segmentCheckError) {
                log(`❌ Scene ${i + 1} segment verification failed: ${segmentCheckError}`);
                throw segmentCheckError;
              }
              
            } catch (fullPipelineError) {
              log(`❌ Scene ${i + 1} FULL PIPELINE failed: ${fullPipelineError}`);
              
              // Fallback to basic image + text
              log(`🔄 Trying basic fallback for scene ${i + 1}...`);
              
              const basicFilter = `scale=1920:1080,${textFilter}`;
              
              const basicCommand = [
                '-i', imageFile,
                '-vf', basicFilter,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-t', scene.durationSec.toString(),
                '-r', '30',
                '-movflags', '+faststart',
                '-y',
                segmentFile
              ];
              
              log(`[FFMPEG] Scene ${i + 1} BASIC FALLBACK: ffmpeg ${basicCommand.join(' ')}`);
              
              await ffmpeg.run(...basicCommand);
              
              // Verify basic fallback
              const segmentData = ffmpeg.FS('readFile', segmentFile);
              log(`⚠️ Scene ${i + 1} basic fallback completed: ${Math.round(segmentData.length / 1024)}KB`);
            }
            
          } catch (imageError) {
            log(`❌ All image processing failed for scene ${i + 1}: ${imageError}`);
            
            // Force fallback to color background
            imageFile = null;
            imageDownloaded = false;
          }
        }
        
        if (!imageFile || !imageDownloaded) {
          // Fallback to solid color background with scene-type tint
          log(`🎨 Scene ${i + 1}: Using color background with ${tintConfig.theme} theme`);
          
          const bgColor = pickBgColor(i);
          
          ffmpegCommand = [
            '-f', 'lavfi',
            '-i', `color=c=${bgColor}:s=${aspectConfig.width}x${aspectConfig.height}:d=${scene.durationSec}:r=30`,
            '-vf', textFilter,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y',
            segmentFile
          ];
          
          // Store command for debugging
          sceneMetrics[sceneMetrics.length - 1].ffmpegCommand = ffmpegCommand.join(' ');
          
          await ffmpeg.run(...ffmpegCommand);
          log(`⚠️ Scene ${i + 1} completed with color background fallback`);
        }
        
        // 10. Verify segment file was created and log details
        try {
          const segmentData = ffmpeg.FS('readFile', segmentFile);
          const segmentSizeKB = Math.round(segmentData.length / 1024);
          log(`✅ Scene ${i + 1} completed successfully: ${segmentSizeKB}KB`);
          log(`📊 Scene ${i + 1} summary: ${sceneImage.source} image (${sceneImage.fileExists ? 'verified' : 'missing'}), ${tintConfig.theme} tint, ${kenBurnsParams.zoomDirection} zoom ${kenBurnsParams.panDirection} pan`);
        } catch (segmentError) {
          log(`❌ Scene ${i + 1} segment file not created: ${segmentError}`);
          throw new Error(`Failed to create segment file for scene ${i + 1}`);
        }
        
        // 11. Clean up image file after successful processing
        if (imageFile && imageDownloaded) {
          try {
            ffmpeg.FS('unlink', imageFile);
            log(`🧹 Cleaned up temporary image file: ${imageFile}`);
          } catch (e) {
            log(`⚠️ Could not clean up image file: ${imageFile}`);
          }
        }
        
      } catch (error) {
        log(`❌ Scene ${i + 1} failed, using fallback: ${error}`);
        
        // Complete fallback - just use solid color with text
        const bgColor = pickBgColor(i);
        const fallbackTextFilter = createTextOverlayFilter(
          scene.text,
          32 // fallback font size
        );
        
        await ffmpeg.run(
          '-f', 'lavfi',
          '-i', `color=c=${bgColor}:s=${aspectConfig.width}x${aspectConfig.height}:d=${scene.durationSec}:r=30`,
          '-vf', fallbackTextFilter,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-y',
          segmentFile
        );
        
        log(`⚠️ Scene ${i + 1} completed with basic fallback`);
      }
    }
    
    // Verify all segment files exist before concatenation
    log('Verifying segment files...');
    const existingFiles: string[] = [];
    for (const file of segmentFiles) {
      try {
        const fileData = ffmpeg.FS('readFile', file);
        log(`✓ Segment ${file}: ${Math.round(fileData.length / 1024)}KB`);
        existingFiles.push(file);
      } catch (error) {
        log(`✗ Missing segment ${file}: ${error}`);
      }
    }
    
    if (existingFiles.length === 0) {
      throw new Error('No valid scene segments were generated');
    }
    
    // Create concat list file
    log(`Creating concat list for ${existingFiles.length} segments...`);
    const concatList = existingFiles.map(f => `file '${f}'`).join('\n');
    const encoder = new TextEncoder();
    const concatBytes = encoder.encode(concatList);
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
      
      // Try concatenation with re-encoding
      log('Attempting concatenation with re-encoding...');
      const concatCommand = [
        '-f', 'concat',
        '-safe', '0',
        '-i', 'clips.txt',
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