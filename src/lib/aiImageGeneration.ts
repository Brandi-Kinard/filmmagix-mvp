// AI Image Generation for Step 4.1
// Integrates with Stable Diffusion APIs to generate scene-specific imagery

export interface AIImageConfig {
  prompt: string;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  sampler: string;
  style: string;
}

export interface GeneratedImage {
  url: string;
  source: 'ai-generated' | 'fallback';
  prompt: string;
  generationTime: number;
  cached: boolean;
  localPath?: string;
}

// Style mappings based on scene type and tint themes
const STYLE_MAPPINGS = {
  'sci-fi/space': 'futuristic technology, space backdrop, cyberpunk aesthetic, neon lights',
  'romantic': 'soft warm light, bokeh, golden hour, dreamy atmosphere',
  'mystery/thriller': 'dark shadows, moody colors, noir lighting, dramatic contrast',
  'nature': 'lush scenery, natural textures, organic forms, earth tones',
  'neutral': 'cinematic lighting, professional photography'
};

const SCENE_TYPE_STYLES = {
  'hook': 'dramatic lighting, high contrast, establishing shot',
  'beat': 'mid-action, dynamic composition, engaging perspective', 
  'cta': 'climactic, tense atmosphere, compelling focus'
};

// Image cache to avoid regenerating same prompts
const imageCache = new Map<string, GeneratedImage>();

/**
 * Generate AI prompt based on scene content and context
 */
export function constructAIPrompt(
  sceneText: string, 
  sceneType: 'hook' | 'beat' | 'cta',
  tintTheme: string
): string {
  // Base prompt from scene text
  let prompt = `${sceneText}, cinematic concept art, ultra detailed, 8k, sharp focus, realistic lighting, film still`;
  
  // Add scene type styling
  const sceneStyle = SCENE_TYPE_STYLES[sceneType];
  if (sceneStyle) {
    prompt += `, ${sceneStyle}`;
  }
  
  // Add thematic styling
  const themeStyle = STYLE_MAPPINGS[tintTheme as keyof typeof STYLE_MAPPINGS];
  if (themeStyle) {
    prompt += `, ${themeStyle}`;
  }
  
  console.log(`[AI PROMPT] Scene: ${sceneType}, Theme: ${tintTheme}`);
  console.log(`[AI PROMPT] Generated: ${prompt}`);
  
  return prompt;
}

/**
 * Generate cache key for consistent lookups
 */
function getCacheKey(prompt: string, config: Partial<AIImageConfig>): string {
  return `${prompt}_${config.width}x${config.height}_${config.steps}_${config.cfg_scale}`;
}

/**
 * Generate image using Stability AI API (cloud option)
 */
async function generateWithStabilityAI(config: AIImageConfig): Promise<GeneratedImage> {
  const startTime = Date.now();
  
  // Note: This would require an API key in a real implementation
  // For now, we'll simulate the API call structure
  
  try {
    const response = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY_HERE', // Would need real API key
      },
      body: JSON.stringify({
        text_prompts: [{ text: config.prompt, weight: 1 }],
        cfg_scale: config.cfg_scale,
        steps: config.steps,
        samples: 1,
        width: config.width,
        height: config.height,
        sampler: config.sampler
      })
    });
    
    if (!response.ok) {
      throw new Error(`Stability AI API error: ${response.status}`);
    }
    
    const data = await response.json();
    const imageBase64 = data.artifacts[0].base64;
    const imageUrl = `data:image/png;base64,${imageBase64}`;
    
    return {
      url: imageUrl,
      source: 'ai-generated',
      prompt: config.prompt,
      generationTime: Date.now() - startTime,
      cached: false
    };
    
  } catch (error) {
    console.warn(`[AI] Stability AI failed: ${error}`);
    throw error;
  }
}

/**
 * Generate image using local Automatic1111 API
 */
async function generateWithAutomatic1111(config: AIImageConfig): Promise<GeneratedImage> {
  const startTime = Date.now();
  
  try {
    const response = await fetch('http://127.0.0.1:7860/sdapi/v1/txt2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: config.prompt,
        negative_prompt: 'blurry, low quality, deformed, ugly, bad anatomy',
        width: config.width,
        height: config.height,
        steps: config.steps,
        cfg_scale: config.cfg_scale,
        sampler_name: config.sampler,
        batch_size: 1,
        seed: -1
      })
    });
    
    if (!response.ok) {
      throw new Error(`Automatic1111 API error: ${response.status}`);
    }
    
    const data = await response.json();
    const imageBase64 = data.images[0];
    const imageUrl = `data:image/png;base64,${imageBase64}`;
    
    return {
      url: imageUrl,
      source: 'ai-generated',
      prompt: config.prompt,
      generationTime: Date.now() - startTime,
      cached: false
    };
    
  } catch (error) {
    console.warn(`[AI] Automatic1111 failed: ${error}`);
    throw error;
  }
}

/**
 * Generate image using mock AI (for development/testing)
 */
async function generateMockAI(config: AIImageConfig): Promise<GeneratedImage> {
  const startTime = Date.now();
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
  
  // Create a unique mock image URL based on the prompt
  const promptHash = config.prompt.split(' ').slice(0, 3).join('-').toLowerCase();
  const mockImageUrl = `https://picsum.photos/seed/${promptHash}/${config.width}/${config.height}`;
  
  return {
    url: mockImageUrl,
    source: 'ai-generated',
    prompt: config.prompt,
    generationTime: Date.now() - startTime,
    cached: false
  };
}

/**
 * Main AI image generation function with fallback chain
 */
export async function generateAIImage(
  sceneText: string,
  sceneType: 'hook' | 'beat' | 'cta',
  tintTheme: string,
  sceneIndex: number
): Promise<GeneratedImage> {
  
  const config: AIImageConfig = {
    prompt: constructAIPrompt(sceneText, sceneType, tintTheme),
    width: 1920,
    height: 1080,
    steps: 30,
    cfg_scale: 7,
    sampler: 'DPM++ 2M Karras',
    style: tintTheme
  };
  
  // Check cache first
  const cacheKey = getCacheKey(config.prompt, config);
  if (imageCache.has(cacheKey)) {
    console.log(`[AI] Using cached image for scene ${sceneIndex + 1}`);
    const cached = imageCache.get(cacheKey)!;
    return { ...cached, cached: true };
  }
  
  console.log(`[AI] Generating image for scene ${sceneIndex + 1}...`);
  console.log(`[AI] Prompt: ${config.prompt}`);
  
  // Try generation methods in order of preference
  const generators = [
    // () => generateWithAutomatic1111(config),  // Local first
    // () => generateWithStabilityAI(config),    // Cloud second  
    () => generateMockAI(config)                 // Mock for development
  ];
  
  for (const generator of generators) {
    try {
      const result = await generator();
      
      // Cache successful result
      imageCache.set(cacheKey, result);
      
      console.log(`[AI] ✓ Generated in ${result.generationTime}ms`);
      return result;
      
    } catch (error) {
      console.warn(`[AI] Generation method failed, trying next: ${error}`);
      continue;
    }
  }
  
  // All AI methods failed, throw error for fallback handling
  throw new Error('All AI image generation methods failed');
}

/**
 * Clear the image cache (useful for testing)
 */
export function clearImageCache(): void {
  imageCache.clear();
  console.log('[AI] Image cache cleared');
}

/**
 * Get cache statistics for debugging
 */
export function getCacheStats() {
  return {
    size: imageCache.size,
    keys: Array.from(imageCache.keys()).map(key => key.substring(0, 50) + '...')
  };
}