/**
 * Background Provider - Strict hierarchy: Upload → AI → Gradient
 * With guaranteed variety and comprehensive debugging
 */

import { generateAIImage, resizeImageBlob, type AIImageResult } from './aiImageGenerator';
import { generateCinematicGradient, generateGradientBlob, type GradientResult } from './cinematicGradients';

export type BackgroundMode = 'upload' | 'ai' | 'gradient';

export interface SceneBackground {
  mode: BackgroundMode;
  uploadedBlob?: Blob;
  uploadedFile?: File;
}

export interface BackgroundResult {
  success: boolean;
  jpegBlob?: Blob;
  actualMode: BackgroundMode;
  error?: string;
  fetchTimeMs?: number;
  sizeBytes?: number;
  contentType?: string;
  sourceUrl?: string;
  gradientColors?: { color1: string; color2: string; angle: number };
  fallbackReason?: string;
}

// Track gradients to prevent consecutive duplicates
const projectGradients: GradientResult[] = [];

/**
 * Process uploaded image with proper scaling (1920x1080, no distortion)
 */
async function processUploadedImage(
  blob: Blob,
  width: number = 1920,
  height: number = 1080
): Promise<BackgroundResult> {
  console.log(`[BG] Processing uploaded image: ${Math.round(blob.size / 1024)}KB ${blob.type}`);
  
  try {
    // Resize to target dimensions with proper scaling
    const resizedBlob = await resizeImageBlob(blob, width, height);
    
    console.log(`[BG] ✓ Upload processed: ${Math.round(resizedBlob.size / 1024)}KB`);
    
    return {
      success: true,
      jpegBlob: resizedBlob,
      actualMode: 'upload',
      sizeBytes: resizedBlob.size,
      contentType: resizedBlob.type
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Upload processing failed';
    console.log(`[BG] ✗ Upload processing failed: ${errorMsg}`);
    
    return {
      success: false,
      actualMode: 'upload',
      error: errorMsg,
      fallbackReason: `Upload failed: ${errorMsg}`
    };
  }
}

/**
 * Clear gradient history (call when starting new project)
 */
export function clearGradientHistory(): void {
  projectGradients.length = 0;
  console.log(`[BG] Gradient history cleared`);
}

/**
 * Main function to provide background for a scene with strict hierarchy
 */
export async function provideSceneBackground(
  background: SceneBackground,
  sceneText: string,
  sceneIndex: number,
  projectPrompt: string,
  aiEnabled: boolean,
  projectId: string = '',
  width: number = 1920,
  height: number = 1080
): Promise<BackgroundResult> {
  
  console.log(`[BG] Scene ${sceneIndex} hierarchy: Upload → AI(${aiEnabled}) → Gradient`);
  
  // STEP 1: Check for user upload first
  if (background.uploadedBlob) {
    console.log(`[BG] Scene ${sceneIndex}: Using uploaded image`);
    return await processUploadedImage(background.uploadedBlob, width, height);
  }
  
  // STEP 2: Try AI if enabled
  if (aiEnabled) {
    console.log(`[BG] Scene ${sceneIndex}: Attempting AI generation`);
    try {
      const aiResult = await generateAIImage(sceneText, sceneIndex, projectId, width, height);
      console.log(`[BG] Scene ${sceneIndex}: AI result:`, { success: aiResult.success, hasBlob: !!aiResult.blob, error: aiResult.error });
      
      if (aiResult.success && aiResult.blob) {
        // Resize AI image to exact dimensions
        try {
          console.log(`[BG] Scene ${sceneIndex}: Resizing AI blob ${aiResult.blob.size} bytes, type: ${aiResult.blob.type}`);
          const resizedBlob = await resizeImageBlob(aiResult.blob, width, height);
          console.log(`[BG] ✓ Scene ${sceneIndex}: AI success - resized to ${resizedBlob.size} bytes, type: ${resizedBlob.type}`);
          
          return {
            success: true,
            jpegBlob: resizedBlob,
            actualMode: 'ai',
            fetchTimeMs: aiResult.fetchTimeMs,
            sizeBytes: resizedBlob.size,
            contentType: resizedBlob.type,
            sourceUrl: aiResult.url
          };
        } catch (resizeError) {
          console.log(`[BG] ✗ Scene ${sceneIndex}: AI resize failed: ${resizeError}`);
          // Fall through to gradient
        }
      } else {
        console.log(`[BG] ✗ Scene ${sceneIndex}: AI failed: ${aiResult.error || 'Unknown AI error'}`);
        // Fall through to gradient
      }
    } catch (aiGenerationError) {
      console.log(`[BG] ✗ Scene ${sceneIndex}: AI generation threw error: ${aiGenerationError}`);
      // Fall through to gradient
    }
  }
  
  // STEP 3: Gradient fallback (always succeeds)
  console.log(`[BG] Scene ${sceneIndex}: Using gradient fallback`);
  
  const gradient = generateCinematicGradient(sceneText, sceneIndex, projectId, projectGradients);
  projectGradients.push(gradient);
  
  const gradientBlob = await generateGradientBlob(gradient, width, height);
  
  console.log(`[BG] ✓ Scene ${sceneIndex}: Gradient generated`);
  
  return {
    success: true,
    jpegBlob: gradientBlob,
    actualMode: 'gradient',
    gradientColors: {
      color1: gradient.color1,
      color2: gradient.color2,
      angle: gradient.angle
    },
    sizeBytes: gradientBlob.size,
    contentType: gradientBlob.type,
    fallbackReason: aiEnabled ? 'AI failed or disabled' : 'AI disabled'
  };
}

/**
 * Get a user-friendly name for the background mode
 */
export function getBackgroundModeName(mode: BackgroundMode): string {
  switch (mode) {
    case 'upload': return 'Custom Image';
    case 'ai': return 'AI Generated';
    case 'gradient': return 'Gradient';
    default: return 'Unknown';
  }
}