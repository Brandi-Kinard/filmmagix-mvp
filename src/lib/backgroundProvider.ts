/**
 * Background Provider - Three modes: Upload, AI, Gradient
 * Clean, deterministic, and fallback-safe
 */

export type BackgroundMode = 'upload' | 'ai' | 'gradient';

export interface SceneBackground {
  mode: BackgroundMode;
  uploadedBlob?: Blob;
  uploadedFile?: File;
}

interface BackgroundResult {
  success: boolean;
  pngBlob?: Blob;
  error?: string;
  mode: BackgroundMode;
}

/**
 * Generate a deterministic cinematic gradient based on prompt
 */
async function generateGradient(prompt: string, sceneIndex: number, width: number, height: number): Promise<Blob> {
  console.log(`[BG] Starting gradient generation for scene ${sceneIndex}, size ${width}x${height}`);
  
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Generate deterministic colors from prompt
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = ((hash << 5) - hash + prompt.charCodeAt(i)) | 0;
  }
  
  // Create palette from hash
  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 30 + (sceneIndex * 15)) % 360;
  
  // Cinematic gradients - desaturated, moody
  const color1 = `hsl(${hue1}, 35%, 25%)`;
  const color2 = `hsl(${hue2}, 40%, 45%)`;
  
  // Create gradient
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, color1);
  gradient.addColorStop(0.5, color2);
  gradient.addColorStop(1, color1);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add subtle vignette for cinematic look
  const vignette = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height) * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  
  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const result = blob || new Blob();
      console.log(`[BG] Gradient generation completed for scene ${sceneIndex}: ${Math.round(result.size / 1024)}KB`);
      resolve(result);
    }, 'image/png');
  });
}

/**
 * Generate AI image using keyless provider (Pollinations)
 * 5s total timeout, fallback to gradient on failure
 */
async function generateAIImage(prompt: string, sceneIndex: number, width: number, height: number): Promise<BackgroundResult> {
  try {
    // Simple, direct prompt for better results
    const enhancedPrompt = `cinematic photo of ${prompt}, high quality, no text`;
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    
    // Deterministic seed from prompt + scene
    let seed = 42;
    for (let i = 0; i < prompt.length; i++) {
      seed = ((seed << 3) - seed + prompt.charCodeAt(i)) | 0;
    }
    seed = Math.abs(seed + sceneIndex * 1337);
    
    // Pollinations URL with seed
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=${width}&height=${height}&nologo=true`;
    
    // Fetch with 5s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`AI generation failed: ${response.status}`);
    }
    
    const blob = await response.blob();
    
    // Validate it's an image
    if (!blob.type.startsWith('image/')) {
      throw new Error('Invalid response type from AI provider');
    }
    
    console.log(`[AI] Generated image for scene ${sceneIndex} (${Math.round(blob.size / 1024)}KB)`);
    
    return {
      success: true,
      pngBlob: blob,
      mode: 'ai'
    };
    
  } catch (error) {
    console.warn(`[AI] Generation failed for scene ${sceneIndex}, falling back to gradient:`, error);
    
    // Fallback to gradient
    const gradientBlob = await generateGradient(prompt, sceneIndex, width, height);
    return {
      success: true,
      pngBlob: gradientBlob,
      mode: 'gradient',
      error: `AI failed: ${error}, used gradient fallback`
    };
  }
}

/**
 * Process uploaded image to PNG at target resolution
 */
async function processUploadedImage(blob: Blob, width: number, height: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Create canvas at target size
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      
      // Calculate scaling to cover (like background-size: cover)
      const scale = Math.max(width / img.width, height / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      const x = (width - scaledWidth) / 2;
      const y = (height - scaledHeight) / 2;
      
      // Draw scaled image
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      
      // Convert to PNG blob
      canvas.toBlob((blob) => {
        resolve(blob || new Blob());
      }, 'image/png');
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load uploaded image'));
    };
    
    img.src = url;
  });
}

/**
 * Main function to provide background for a scene
 */
export async function provideSceneBackground(
  background: SceneBackground,
  sceneText: string,
  sceneIndex: number,
  projectPrompt: string,
  width = 1920,
  height = 1080
): Promise<BackgroundResult> {
  
  console.log(`[BG] Providing background for scene ${sceneIndex}, mode: ${background.mode}`);
  
  switch (background.mode) {
    case 'upload':
      if (!background.uploadedBlob) {
        // No upload, fallback to gradient
        console.warn(`[BG] No upload for scene ${sceneIndex}, using gradient`);
        const gradientBlob = await generateGradient(projectPrompt, sceneIndex, width, height);
        return {
          success: true,
          pngBlob: gradientBlob,
          mode: 'gradient',
          error: 'No upload provided, used gradient'
        };
      }
      
      try {
        const processedBlob = await processUploadedImage(background.uploadedBlob, width, height);
        console.log(`[BG] Processed upload for scene ${sceneIndex} (${Math.round(processedBlob.size / 1024)}KB)`);
        return {
          success: true,
          pngBlob: processedBlob,
          mode: 'upload'
        };
      } catch (error) {
        console.error(`[BG] Upload processing failed for scene ${sceneIndex}:`, error);
        const gradientBlob = await generateGradient(projectPrompt, sceneIndex, width, height);
        return {
          success: true,
          pngBlob: gradientBlob,
          mode: 'gradient',
          error: `Upload failed: ${error}`
        };
      }
      
    case 'ai':
      // AI is off by default, explicitly chosen
      return await generateAIImage(sceneText, sceneIndex, width, height);
      
    case 'gradient':
    default:
      // Default fallback
      const gradientBlob = await generateGradient(projectPrompt, sceneIndex, width, height);
      return {
        success: true,
        pngBlob: gradientBlob,
        mode: 'gradient'
      };
  }
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