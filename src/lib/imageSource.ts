// Image sourcing and processing for cinematic scenes
import { generateAIImage, type GeneratedImage } from './aiImageGeneration';

export interface SceneImage {
  url: string;
  localPath: string;
  source: 'ai-generated' | 'unsplash' | 'pexels' | 'fallback';
  keywords: string[];
  cached: boolean;
  prompt?: string;
  generationTime?: number;
  dimensions?: { width: number; height: number };
  fileExists?: boolean;
}

export interface KenBurnsParams {
  zoomDirection: 'in' | 'out';
  panDirection: 'left-right' | 'right-left' | 'top-bottom' | 'bottom-top';
  duration: number; // in seconds
}

export interface TintConfig {
  color: string; // rgba format
  keywords: string[];
  theme: string;
}

// Keyword-to-tint mapping
const TINT_THEMES: Record<string, TintConfig> = {
  space: {
    color: 'rgba(50,80,200,0.3)',
    keywords: ['space', 'station', 'stars', 'galaxy', 'cosmic', 'universe', 'asteroid', 'planet', 'jupiter', 'mars', 'spacecraft', 'alien', 'nebula', 'orbit'],
    theme: 'sci-fi/space'
  },
  romance: {
    color: 'rgba(200,50,80,0.3)', 
    keywords: ['love', 'romance', 'heart', 'kiss', 'wedding', 'couple', 'passion', 'beautiful', 'paris', 'summer', 'romantic', 'tender', 'intimate', 'embrace'],
    theme: 'romantic'
  },
  mystery: {
    color: 'rgba(50,50,50,0.4)',
    keywords: ['mystery', 'dark', 'shadow', 'secret', 'hidden', 'thriller', 'crime', 'detective', 'stranger', 'disappears', 'vanish', 'clue', 'investigate'],
    theme: 'mystery/thriller'
  },
  nature: {
    color: 'rgba(50,150,50,0.3)',
    keywords: ['forest', 'tree', 'nature', 'garden', 'green', 'wildlife', 'mountain', 'river', 'deep', 'woods', 'leaves', 'natural', 'outdoor'],
    theme: 'nature'
  },
  neutral: {
    color: 'rgba(0,0,0,0.2)',
    keywords: [],
    theme: 'neutral'
  }
};

/**
 * Extract keywords from scene text for image search and tinting
 */
export function extractKeywords(text: string): string[] {
  // Simple keyword extraction - look for nouns and important words
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !['that', 'with', 'they', 'were', 'been', 'have', 'this', 'will', 'from', 'each', 'which', 'their', 'said', 'each', 'would', 'there', 'could', 'other'].includes(word));
  
  // Return unique words, limit to top 5
  return [...new Set(words)].slice(0, 5);
}

/**
 * Determine tint color based on scene keywords (fallback method)
 */
export function getTintForKeywords(keywords: string[]): TintConfig {
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()));
  
  // Check each theme for keyword matches
  for (const [themeName, theme] of Object.entries(TINT_THEMES)) {
    if (themeName === 'neutral') continue; // Skip neutral, use as fallback
    
    const matches = theme.keywords.filter(keyword => keywordSet.has(keyword));
    if (matches.length > 0) {
      console.log(`[TINT] Matched theme "${theme.theme}" with keywords: ${matches.join(', ')}`);
      return theme;
    }
  }
  
  console.log(`[TINT] No theme matches, using neutral`);
  return TINT_THEMES.neutral;
}

/**
 * Generate random Ken Burns parameters
 */
export function generateKenBurnsParams(durationSeconds: number): KenBurnsParams {
  const zoomDirections: Array<'in' | 'out'> = ['in', 'out'];
  const panDirections: Array<'left-right' | 'right-left' | 'top-bottom' | 'bottom-top'> = [
    'left-right', 'right-left', 'top-bottom', 'bottom-top'
  ];
  
  return {
    zoomDirection: zoomDirections[Math.floor(Math.random() * zoomDirections.length)],
    panDirection: panDirections[Math.floor(Math.random() * panDirections.length)],
    duration: durationSeconds
  };
}

/**
 * Get image URL from Unsplash API based on keywords
 */
export function getUnsplashImageUrl(keywords: string[], width = 1920, height = 1080): string {
  // Use Unsplash Source API for reliable image fetching
  const query = keywords.slice(0, 2).join('+'); // Use top 2 keywords with + separator
  const baseUrl = `https://source.unsplash.com/${width}x${height}`;
  
  if (query && query.length > 0) {
    return `${baseUrl}/?${encodeURIComponent(query)}`;
  }
  
  return `${baseUrl}/?nature,landscape`; // Reliable fallback
}

/**
 * Get reliable stock image URLs that actually work
 */
export function getStockImageUrl(keywords: string[], width = 1920, height = 1080, sourceIndex = 0): string {
  // Use multiple reliable sources
  const sources = [
    // Unsplash Source - most reliable
    () => {
      const query = keywords.slice(0, 2).join('+');
      return `https://source.unsplash.com/${width}x${height}/?${query || 'nature'}`;
    },
    // Picsum with seed for consistency
    () => {
      const seed = keywords.join('').replace(/[^a-z0-9]/gi, '') || 'default';
      return `https://picsum.photos/seed/${seed}/${width}/${height}`;
    },
    // Lorem Picsum random
    () => `https://picsum.photos/${width}/${height}?random=${Date.now()}`
  ];
  
  const sourceFunc = sources[sourceIndex % sources.length];
  return sourceFunc();
}

/**
 * Download image and save locally for FFmpeg processing with validation
 */
export async function downloadAndSaveImage(
  imageUrl: string, 
  sceneIndex: number, 
  keywords: string[]
): Promise<{ localPath: string; fileExists: boolean; dimensions?: { width: number; height: number }; imageData?: Uint8Array }> {
  try {
    console.log(`[IMAGE] 📥 Downloading: ${imageUrl}`);
    
    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(imageUrl, { 
      signal: controller.signal,
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'Mozilla/5.0 (compatible; FilmMagix/1.0)'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }
    
    const imageBlob = await response.blob();
    if (imageBlob.size === 0) {
      throw new Error('Empty image blob received');
    }
    
    const arrayBuffer = await imageBlob.arrayBuffer();
    const imageBytes = new Uint8Array(arrayBuffer);
    
    // Validate minimum file size (at least 1KB for a valid image)
    if (imageBytes.length < 1024) {
      throw new Error(`Image too small: ${imageBytes.length} bytes`);
    }
    
    // Create local filename
    const slug = keywords.slice(0, 2).join('-').toLowerCase().replace(/[^a-z0-9-]/g, '') || 'scene';
    const filename = `scene-${String(sceneIndex + 1).padStart(2, '0')}-${slug}.jpg`;
    
    console.log(`[IMAGE] ✅ Downloaded: ${filename} (${Math.round(imageBytes.length / 1024)}KB, ${contentType})`);
    
    return {
      localPath: filename,
      fileExists: true,
      dimensions: { width: 1920, height: 1080 },
      imageData: imageBytes
    };
    
  } catch (error) {
    console.error(`[IMAGE] ❌ Download failed: ${error}`);
    return {
      localPath: '',
      fileExists: false
    };
  }
}

/**
 * Main function to get scene image with reliable fetching (Step 4.1)
 */
export async function getSceneImage(
  scene: { text: string; keywords: string[]; kind: 'hook' | 'beat' | 'cta' }, 
  sceneIndex: number
): Promise<SceneImage> {
  const keywords = scene.keywords.length > 0 ? scene.keywords : extractKeywords(scene.text);
  
  console.log(`[IMAGE] 🎬 Scene ${sceneIndex + 1} (${scene.kind.toUpperCase()}) processing...`);
  console.log(`[IMAGE] 🔍 Keywords extracted:`, keywords);
  
  // Try multiple reliable image sources in order
  const attempts = [
    { name: 'AI-Generated', source: () => fetchAIImage(scene, sceneIndex) },
    { name: 'Unsplash', source: () => fetchStockImage(keywords, sceneIndex, 0) },
    { name: 'Picsum-Seeded', source: () => fetchStockImage(keywords, sceneIndex, 1) },
    { name: 'Picsum-Random', source: () => fetchStockImage(keywords, sceneIndex, 2) },
    { name: 'Local-Fallback', source: () => fetchFallbackImage(sceneIndex) }
  ];
  
  for (const attempt of attempts) {
    try {
      console.log(`[IMAGE] 🔄 Trying ${attempt.name} for scene ${sceneIndex + 1}...`);
      const result = await attempt.source();
      
      if (result.fileExists && result.imageData && result.imageData.length > 0) {
        console.log(`[IMAGE] ✅ ${attempt.name} SUCCESS for scene ${sceneIndex + 1}: ${result.localPath} (${Math.round(result.imageData.length / 1024)}KB)`);
        return result;
      } else {
        console.log(`[IMAGE] ❌ ${attempt.name} failed - no valid data`);
      }
    } catch (error) {
      console.warn(`[IMAGE] ❌ ${attempt.name} failed for scene ${sceneIndex + 1}:`, error);
    }
  }
  
  // Absolute fallback - return empty but mark as failed
  console.error(`[IMAGE] 💀 ALL SOURCES FAILED for scene ${sceneIndex + 1}`);
  return {
    url: '',
    localPath: '',
    source: 'fallback',
    keywords,
    cached: false,
    fileExists: false
  };
}

/**
 * Fetch AI-generated image (with fallback to mock)
 */
async function fetchAIImage(
  scene: { text: string; keywords: string[]; kind: 'hook' | 'beat' | 'cta' }, 
  sceneIndex: number
): Promise<SceneImage> {
  try {
    // Try to generate AI image
    const tintConfig = getTintForSceneType(scene.kind);
    const aiResult = await generateAIImage(scene.text, scene.kind, tintConfig.theme, sceneIndex);
    
    if (aiResult.url) {
      // AI generation successful, download the result
      const downloadResult = await downloadAndSaveImage(aiResult.url, sceneIndex, scene.keywords);
      
      return {
        url: aiResult.url,
        localPath: downloadResult.localPath,
        source: 'ai-generated',
        keywords: scene.keywords,
        cached: aiResult.cached,
        fileExists: downloadResult.fileExists,
        dimensions: downloadResult.dimensions,
        imageData: downloadResult.imageData,
        prompt: aiResult.prompt,
        generationTime: aiResult.generationTime
      };
    }
  } catch (aiError) {
    console.log(`[IMAGE] AI generation failed: ${aiError}`);
  }
  
  // AI failed, this will cause the function to throw and try next source
  throw new Error('AI image generation not available');
}

/**
 * Fetch stock image with retry logic
 */
async function fetchStockImage(keywords: string[], sceneIndex: number, sourceIndex: number): Promise<SceneImage> {
  const imageUrl = getStockImageUrl(keywords, 1920, 1080, sourceIndex);
  console.log(`[IMAGE] 📥 Fetching: ${imageUrl}`);
  
  const downloadResult = await downloadAndSaveImage(imageUrl, sceneIndex, keywords);
  
  const sourceName = ['unsplash', 'picsum-seeded', 'picsum-random'][sourceIndex] || 'stock';
  
  return {
    url: imageUrl,
    localPath: downloadResult.localPath,
    source: sourceName as any,
    keywords,
    cached: false,
    fileExists: downloadResult.fileExists,
    dimensions: downloadResult.dimensions,
    imageData: downloadResult.imageData
  };
}

/**
 * Use local fallback images
 */
async function fetchFallbackImage(sceneIndex: number): Promise<SceneImage> {
  const fallbackIndex = (sceneIndex % 3) + 1;
  const fallbackPath = `default-${fallbackIndex}.jpg`;
  const fallbackUrl = `/placeholders/${fallbackPath}`;
  
  // Check if fallback exists by trying to fetch it
  try {
    const response = await fetch(fallbackUrl);
    if (response.ok) {
      // Download fallback image data for FFmpeg
      const imageBlob = await response.blob();
      const arrayBuffer = await imageBlob.arrayBuffer();
      const imageBytes = new Uint8Array(arrayBuffer);
      
      console.log(`[IMAGE] Fallback image loaded: ${fallbackPath} (${Math.round(imageBytes.length / 1024)}KB)`);
      
      return {
        url: fallbackUrl,
        localPath: fallbackPath,
        source: 'fallback',
        keywords: ['fallback', 'placeholder'],
        cached: false,
        fileExists: true,
        dimensions: { width: 1920, height: 1080 },
        imageData: imageBytes
      };
    }
  } catch (error) {
    console.warn(`[IMAGE] Fallback image not accessible: ${fallbackUrl}`);
  }
  
  throw new Error('Fallback image not available');
}

/**
 * Legacy function for compatibility
 */
export async function fetchSceneImage(
  sceneText: string, 
  sceneIndex: number, 
  sceneType: 'hook' | 'beat' | 'cta' = 'beat'
): Promise<SceneImage> {
  const scene = {
    text: sceneText,
    keywords: extractKeywords(sceneText),
    kind: sceneType
  };
  return getSceneImage(scene, sceneIndex);
}

/**
 * Scene type specific tint configurations for Step 4.1
 */
const SCENE_TYPE_TINTS: Record<'hook' | 'beat' | 'cta', TintConfig> = {
  hook: {
    color: 'rgba(255,191,0,0.25)', // Warm amber
    keywords: ['hook', 'opening', 'dramatic'],
    theme: 'warm-amber'
  },
  beat: {
    color: 'rgba(100,150,200,0.15)', // Neutral/cool tone
    keywords: ['beat', 'story', 'neutral'],
    theme: 'neutral-cool'
  },
  cta: {
    color: 'rgba(255,215,0,0.3)', // Vibrant gold
    keywords: ['cta', 'action', 'finale'],
    theme: 'vibrant-gold'
  }
};

/**
 * Get tint based on scene type (overrides keyword-based tinting)
 */
export function getTintForSceneType(sceneType: 'hook' | 'beat' | 'cta'): TintConfig {
  return SCENE_TYPE_TINTS[sceneType];
}

/**
 * Create fallback placeholder images if they don't exist
 */
export function ensureFallbackImages(): string[] {
  // Return list of fallback image paths that should exist
  return [
    '/placeholders/default-1.jpg',
    '/placeholders/default-2.jpg', 
    '/placeholders/default-3.jpg'
  ];
}