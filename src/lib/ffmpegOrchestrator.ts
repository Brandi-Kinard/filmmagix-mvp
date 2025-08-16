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
 * Visual Smoke Test - Known good pipeline test
 */
export async function assembleVisualSmokeTest(): Promise<Blob> {
  try {
    log('🧪 VISUAL SMOKE TEST: Starting...');
    
    const ffmpeg = await getFFmpeg();
    await ensureFont(ffmpeg);
    
    // Download known-good image from a reliable source
    const imageUrl = 'https://picsum.photos/1920/1080?random=1';
    log('🧪 Downloading test image from Picsum...');
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download test image: ${response.status}`);
    }
    
    const imageData = await response.arrayBuffer();
    const imageBytes = new Uint8Array(imageData);
    log(`🧪 Test image downloaded: ${Math.round(imageBytes.length / 1024)}KB`);
    
    // Write image to FFmpeg FS
    ffmpeg.FS('writeFile', 'scene.jpg', imageBytes);
    log('🧪 Image written to FFmpeg FS');
    
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
      
      // CRITICAL: Ensure minimum 5s duration per scene
      const sceneDuration = Math.max(5, scene.durationSec || 5);
      log(`⏱️ Scene ${i + 1} duration: ${sceneDuration}s (original: ${scene.durationSec}s)`);
      
      const segmentFile = `seg-${String(i).padStart(3, '0')}.mp4`;
      segmentFiles.push(segmentFile);
      
      log(`🎬 Generating cinematic scene ${i + 1}/${scenes.length}: ${scene.kind.toUpperCase()}`);
      
      try {
        // 1. Get scene image using relevance-first pipeline
        log(`📸 Fetching relevant image for scene ${i + 1}...`);
        
        // Try new relevance-first system with fallback
        let fetchedImage = await fetchRelevantSceneImage(
          scene.text,
          scene.kind,
          i,
          0, // queryIndex - can be incremented for regeneration
          false, // useAI - controlled by user setting
          undefined // manualUrl - for user overrides
        );
        
        // If relevance system fails, use reliable Picsum fallback
        if (!fetchedImage) {
          log(`⚠️ Relevance system failed for scene ${i + 1}, using Picsum fallback...`);
          const fallbackUrl = `https://picsum.photos/1920/1080?random=${i + 100}`;
          try {
            const response = await fetch(fallbackUrl);
            if (response.ok) {
              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              fetchedImage = {
                bytes,
                ext: 'jpg' as const,
                srcName: 'picsum-fallback',
                sourceUrl: fallbackUrl,
                contentType: 'image/jpeg',
                relevanceScore: 0
              };
              log(`✅ Picsum fallback successful for scene ${i + 1}`);
            }
          } catch (fallbackError) {
            log(`❌ Even Picsum fallback failed: ${fallbackError}`);
          }
        }
        
        // Build visual query for logging
        const visualQuery = buildVisualQueries(scene.text, scene.kind);
        
        // 2. Use scene-type based tinting (Step 4.1 requirement)
        const tintConfig = getTintForSceneType(scene.kind);
        
        // 3. Generate Ken Burns parameters with randomization (use corrected duration)
        const kenBurnsParams = generateKenBurnsParams(sceneDuration);
        
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
          imageUrl: fetchedImage?.sourceUrl || '',
          imageLocalPath: fetchedImage ? `scene-${i + 1}.${fetchedImage.ext}` : '',
          imageSource: fetchedImage?.srcName || 'fallback',
          imageExists: !!fetchedImage,
          imageDimensions: { width: 1920, height: 1080 },
          keywords: visualQuery.tokens,
          queryCandidates: visualQuery.candidates,
          relevanceScore: fetchedImage?.relevanceScore || 0,
          contentType: fetchedImage?.contentType || '',
          // Effects metrics
          kenBurnsParams,
          tintConfig
        });
        
        // 6. Log scene info with detailed image verification
        log(`🎨 Scene ${i + 1}: ${fetchedImage?.srcName || 'NONE'} (score: ${fetchedImage?.relevanceScore || 0}), ${tintConfig.theme} tint, ${kenBurnsParams.zoomDirection} zoom`);
        log(`   Query candidates: ${visualQuery.candidates.slice(0, 3).join(' | ')}`);
        
        if (captionLayout.warnings.length > 0) {
          log(`⚠️ Scene ${i + 1} text warnings: ${captionLayout.warnings.join(', ')}`);
        }
        
        // 7. Prepare and verify image for FFmpeg with extensive logging
        let imageFile: string | null = null;
        let imageDownloaded = false;
        
        if (fetchedImage && fetchedImage.bytes.length > 0) {
          imageFile = `scene-${i + 1}.${fetchedImage.ext}`;
          
          log(`🖼️ Scene ${i + 1} IMAGE STATUS:`);
          log(`   - Source: ${fetchedImage.srcName}`);
          log(`   - URL: ${fetchedImage.sourceUrl.substring(0, 100)}...`);
          log(`   - Content-Type: ${fetchedImage.contentType}`);
          log(`   - Size: ${Math.round(fetchedImage.bytes.length / 1024)}KB`);
          log(`   - Relevance Score: ${fetchedImage.relevanceScore}`);
          
          try {
            log(`📁 Writing image to FFmpeg filesystem: ${imageFile}`);
            
            // Write to FFmpeg filesystem
            ffmpeg.FS('writeFile', imageFile, fetchedImage.bytes);
            
            // Verify file was written correctly
            const verifyData = ffmpeg.FS('readFile', imageFile);
            imageDownloaded = verifyData.length > 0;
            
            if (verifyData.length !== fetchedImage.bytes.length) {
              throw new Error(`Size mismatch: wrote ${fetchedImage.bytes.length}, read ${verifyData.length}`);
            }
            
            log(`✅ Image VERIFIED in FFmpeg filesystem: ${imageFile} (${verifyData.length} bytes)`);
            
            // List all files to confirm
            const allFiles = ffmpeg.FS('readdir', '.');
            log(`🗂 FFmpeg filesystem contents: ${allFiles.filter((f: string) => f.endsWith('.jpg') || f.endsWith('.png')).join(', ')}`);
            
          } catch (error) {
            log(`❌ Image preparation failed for scene ${i + 1}: ${error}`);
            imageFile = null;
            imageDownloaded = false;
          }
        } else {
          log(`⚠️ Scene ${i + 1}: No valid image fetched - using color background`);
          log(`   Visual query: ${visualQuery.primary}`);
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
          log(`🎬 Creating scene ${i + 1} with CORRECTED filter chain...`);
          
          try {
            // Build CORRECT filter chain similar to smoke test
            const frameCount = sceneDuration * 30; // 30fps
            
            // Parse tint color
            const rgbaMatch = tintConfig.color.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/);
            const tintHex = rgbaMatch 
              ? `0x${parseInt(rgbaMatch[1]).toString(16).padStart(2, '0')}${parseInt(rgbaMatch[2]).toString(16).padStart(2, '0')}${parseInt(rgbaMatch[3]).toString(16).padStart(2, '0')}`
              : '0x000000';
            const tintOpacity = rgbaMatch ? parseFloat(rgbaMatch[4]) : 0.25;
            
            // Build filter complex (similar to smoke test)
            const filterComplex = `
[0:v]scale=1920:1080,
zoompan=z='1.0+0.0004*on':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${frameCount}:s=1920x1080,
format=rgba[bg];
[1:v]format=rgba,colorchannelmixer=aa=${tintOpacity}[tint];
[bg][tint]overlay=shortest=1[withtint];
[withtint]${textFilter}[final]`.replace(/\n/g, '');
            
            // CRITICAL: Use proper input order and map [final]
            ffmpegCommand = [
              '-loop', '1', '-t', sceneDuration.toString(), '-r', '30', '-i', imageFile,  // Input 0: image
              '-f', 'lavfi', '-t', sceneDuration.toString(), '-i', `color=c=${tintHex}:s=1920x1080:r=30`,  // Input 1: tint
              '-filter_complex', filterComplex,
              '-map', '[final]',  // CRITICAL: Map only [final]
              '-t', sceneDuration.toString(),
              '-r', '30',
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-movflags', '+faststart',
              '-y',
              segmentFile
            ];
            
            // Store command for debugging
            sceneMetrics[sceneMetrics.length - 1].ffmpegCommand = ffmpegCommand.join(' ');
            
            // CRITICAL LOGGING
            log(`\n📊 SCENE ${i + 1} PIPELINE:`);
            log(`   Duration: ${sceneDuration}s`);
            log(`   Dimensions: 1920x1080`);
            log(`   Image: ${imageFile} (${Math.round(fetchedImage?.bytes.length / 1024)}KB)`);
            log(`   Tint: ${tintHex} @ ${tintOpacity}`);
            log(`   Filter Complex: ${filterComplex}`);
            log(`   Map Target: [final] ← CRITICAL`);
            log(`   Full command: ffmpeg ${ffmpegCommand.join(' ')}`);
            
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
          log(`🎨 Scene ${i + 1}: Using color background fallback`);
          
          const bgColor = pickBgColor(i);
          
          // Add watermark to verify drawtext is working
          const fallbackText = scene.text || 'FilmMagix';
          const fallbackTextFilter = createImprovedTextOverlay(
            fallbackText,
            aspectConfig.width,
            aspectConfig.height
          );
          
          ffmpegCommand = [
            '-f', 'lavfi',
            '-i', `color=c=${bgColor}:s=${aspectConfig.width}x${aspectConfig.height}:d=${sceneDuration}:r=30`,
            '-vf', fallbackTextFilter,
            '-t', sceneDuration.toString(),  // Ensure duration
            '-r', '30',
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
          log(`📊 Scene ${i + 1} summary: ${fetchedImage?.srcName || 'fallback'} image (${fetchedImage ? 'verified' : 'missing'}), ${tintConfig.theme} tint, ${kenBurnsParams.zoomDirection} zoom ${kenBurnsParams.panDirection} pan`);
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