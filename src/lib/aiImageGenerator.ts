/**
 * AI Image Generator using Pollinations API with strict safety and timeout
 */

export interface AIImageResult {
  success: boolean;
  blob?: Blob;
  source: 'ai' | 'fallback';
  error?: string;
  fetchTimeMs?: number;
  contentType?: string;
  sizeBytes?: number;
  url?: string;
}

/**
 * Stable hash function for deterministic seeds
 */
function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate AI image with strict timeout and safety checks
 */
export async function generateAIImage(
  sceneText: string,
  sceneIndex: number,
  projectId: string = '',
  width: number = 1920,
  height: number = 1080
): Promise<AIImageResult> {
  const startTime = Date.now();
  
  console.log(`[AI] Generating image for scene ${sceneIndex}: "${sceneText}"`);
  
  try {
    // Generate deterministic seed
    const hashInput = `${projectId}-${sceneIndex}-${sceneText}`;
    const seed = stableHash(hashInput);
    
    // Build enhanced prompt with cinematic style
    const styleTokens = [
      'cinematic',
      'photo-real', 
      'shallow depth of field',
      'cohesive color grading',
      'professional photography',
      'film grain',
      'moody lighting'
    ];
    
    const enhancedPrompt = `${sceneText}. ${styleTokens.join(', ')}`;
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    
    // Construct Pollinations URL
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
    
    console.log(`[AI] URL: ${url}`);
    console.log(`[AI] Seed: ${seed} (from "${hashInput}")`);
    console.log(`[AI] Enhanced prompt: "${enhancedPrompt}"`);
    
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 6000); // 6 second total timeout
    
    try {
      // Direct GET request (skip HEAD check to avoid CORS issues)
      console.log(`[AI] Fetching image for scene ${sceneIndex}...`);
      console.log(`[AI] URL: ${url}`);
      
      const getResponse = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors'
      });
      
      if (!getResponse.ok) {
        throw new Error(`GET request failed: ${getResponse.status} ${getResponse.statusText}`);
      }
      
      const blob = await getResponse.blob();
      const fetchTime = Date.now() - startTime;
      
      // Final blob validation
      if (!blob.type.startsWith('image/')) {
        throw new Error(`Invalid blob type: ${blob.type} (expected image/*)`);
      }
      
      if (blob.size === 0) {
        throw new Error('Empty image blob received');
      }
      
      console.log(`[AI] ✓ Success: ${Math.round(blob.size / 1024)}KB ${blob.type} in ${fetchTime}ms`);
      
      return {
        success: true,
        blob,
        source: 'ai',
        fetchTimeMs: fetchTime,
        contentType: blob.type,
        sizeBytes: blob.size,
        url
      };
      
    } catch (fetchError) {
      const fetchTime = Date.now() - startTime;
      
      let errorMsg = 'Unknown fetch error';
      if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
        errorMsg = 'Timeout after 6s';
      } else if (fetchError instanceof TypeError && fetchError.message.includes('fetch')) {
        errorMsg = 'Network/CORS error';
      } else if (fetchError instanceof Error) {
        errorMsg = fetchError.message;
      }
      
      console.log(`[AI] ✗ Fetch failed: ${errorMsg} (${fetchTime}ms)`);
      
      return {
        success: false,
        source: 'fallback',
        error: errorMsg,
        fetchTimeMs: fetchTime,
        url
      };
      
    } finally {
      clearTimeout(timeoutId);
    }
    
  } catch (setupError) {
    const totalTime = Date.now() - startTime;
    const errorMsg = setupError instanceof Error ? setupError.message : 'Setup error';
    
    console.log(`[AI] ✗ Setup failed: ${errorMsg} (${totalTime}ms)`);
    
    return {
      success: false,
      source: 'fallback',
      error: errorMsg,
      fetchTimeMs: totalTime
    };
  }
}

/**
 * Validate that a blob is actually an image
 */
export function validateImageBlob(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    if (!blob.type.startsWith('image/')) {
      resolve(false);
      return;
    }
    
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img.width > 0 && img.height > 0);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(false);
    };
    
    img.src = url;
  });
}

/**
 * Resize image blob to target dimensions with proper scaling
 */
export async function resizeImageBlob(
  blob: Blob,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Create canvas at target size
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d')!;
      
      // Calculate scaling to cover (like CSS background-size: cover)
      const scale = Math.max(targetWidth / img.width, targetHeight / img.height);
      const scaledWidth = img.width * scale;
      const scaledHeight = img.height * scale;
      
      // Center the scaled image
      const x = (targetWidth - scaledWidth) / 2;
      const y = (targetHeight - scaledHeight) / 2;
      
      // Draw scaled and centered image
      ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      
      // Convert to blob
      canvas.toBlob((resizedBlob) => {
        if (resizedBlob) {
          console.log(`[AI] Resized to ${targetWidth}x${targetHeight}: ${Math.round(resizedBlob.size / 1024)}KB`);
          resolve(resizedBlob);
        } else {
          reject(new Error('Failed to resize image'));
        }
      }, 'image/jpeg', 0.95);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for resizing'));
    };
    
    img.src = url;
  });
}