// Relevance-First Image Source System
// Integrates Openverse, Wikimedia Commons, and fallback sources

import { buildVisualQueries, scoreImageRelevance, type VisualQuery } from './visualQuery';

export interface ImageCandidate {
  url: string;
  thumbnailUrl?: string;
  title: string;
  tags: string[];
  width: number;
  height: number;
  source: 'openverse' | 'wikimedia' | 'unsplash' | 'picsum' | 'local';
  provider?: string;
  score: number;
  contentType?: string;
}

export interface FetchedImage {
  bytes: Uint8Array;
  ext: 'jpg' | 'png' | 'webp';
  srcName: string;
  sourceUrl: string;
  contentType: string;
  relevanceScore: number;
}

/**
 * Fetch images from Openverse API (keyless, CORS-safe)
 */
async function fetchFromOpenverse(query: string): Promise<ImageCandidate[]> {
  const endpoint = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&license_type=all&page_size=20`;
  
  try {
    console.log('[OPENVERSE] Searching for:', query);
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FilmMagix/1.0'
      }
    });
    
    if (!response.ok) {
      console.warn('[OPENVERSE] API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const results = data.results || [];
    
    return results
      .filter((item: any) => {
        // Filter for minimum size
        return (item.width >= 1000 || item.height >= 1000);
      })
      .map((item: any) => ({
        url: item.url || item.thumbnail,
        thumbnailUrl: item.thumbnail,
        title: item.title || '',
        tags: item.tags?.map((t: any) => typeof t === 'string' ? t : t.name) || [],
        width: item.width || 0,
        height: item.height || 0,
        source: 'openverse' as const,
        provider: item.provider,
        score: 0
      }));
  } catch (error) {
    console.error('[OPENVERSE] Fetch failed:', error);
    return [];
  }
}

/**
 * Fetch images from Wikimedia Commons (keyless)
 */
async function fetchFromWikimedia(query: string): Promise<ImageCandidate[]> {
  const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=20&prop=imageinfo&iiprop=url|mime|size&format=json&origin=*`;
  
  try {
    console.log('[WIKIMEDIA] Searching for:', query);
    const response = await fetch(endpoint);
    
    if (!response.ok) {
      console.warn('[WIKIMEDIA] API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    const pages = data.query?.pages || {};
    
    const results: ImageCandidate[] = [];
    
    for (const pageId in pages) {
      const page = pages[pageId];
      const imageInfo = page.imageinfo?.[0];
      
      if (imageInfo && imageInfo.mime?.startsWith('image/')) {
        // Filter for minimum size
        if (imageInfo.width >= 1000 || imageInfo.height >= 1000) {
          results.push({
            url: imageInfo.url,
            thumbnailUrl: imageInfo.thumburl,
            title: page.title || '',
            tags: [], // Wikimedia doesn't provide tags in this endpoint
            width: imageInfo.width || 0,
            height: imageInfo.height || 0,
            source: 'wikimedia' as const,
            provider: 'Wikimedia Commons',
            score: 0
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('[WIKIMEDIA] Fetch failed:', error);
    return [];
  }
}

/**
 * Fetch from Unsplash (fallback)
 */
async function fetchFromUnsplash(keywords: string[]): Promise<ImageCandidate[]> {
  const query = keywords.slice(0, 2).join(' ');
  const url = `https://source.unsplash.com/1920x1080/?${encodeURIComponent(query)}`;
  
  return [{
    url,
    title: `Unsplash: ${query}`,
    tags: keywords,
    width: 1920,
    height: 1080,
    source: 'unsplash' as const,
    provider: 'Unsplash',
    score: 0
  }];
}

/**
 * Fetch from Picsum (last resort)
 */
function fetchFromPicsum(seed: string): ImageCandidate[] {
  const cleanSeed = seed.replace(/[^a-z0-9]/gi, '').substring(0, 10) || 'default';
  
  return [{
    url: `https://picsum.photos/seed/${cleanSeed}/1920/1080`,
    title: `Picsum: ${seed}`,
    tags: [],
    width: 1920,
    height: 1080,
    source: 'picsum' as const,
    provider: 'Lorem Picsum',
    score: 0
  }];
}

/**
 * Validate and download image with strict checks
 */
async function validateAndDownloadImage(candidate: ImageCandidate): Promise<FetchedImage | null> {
  try {
    console.log(`[DOWNLOAD] Fetching from ${candidate.source}: ${candidate.url}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(candidate.url, {
      signal: controller.signal,
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'FilmMagix/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    
    // Follow redirects and validate final response
    if (!response.ok) {
      console.warn(`[DOWNLOAD] HTTP error ${response.status}`);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // Strict content type validation
    if (!contentType.startsWith('image/')) {
      console.error(`[DOWNLOAD] Invalid content type: ${contentType}`);
      return null;
    }
    
    const blob = await response.blob();
    
    if (blob.size < 1024) {
      console.error(`[DOWNLOAD] Image too small: ${blob.size} bytes`);
      return null;
    }
    
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    
    // Determine extension from content type
    let ext: 'jpg' | 'png' | 'webp' = 'jpg';
    if (contentType.includes('png')) ext = 'png';
    else if (contentType.includes('webp')) ext = 'webp';
    
    console.log(`[DOWNLOAD] Success: ${bytes.length} bytes, ${contentType}`);
    
    return {
      bytes,
      ext,
      srcName: candidate.source,
      sourceUrl: candidate.url,
      contentType,
      relevanceScore: candidate.score
    };
  } catch (error) {
    console.error(`[DOWNLOAD] Failed:`, error);
    return null;
  }
}

/**
 * Main function to fetch relevant scene image
 */
export async function fetchRelevantSceneImage(
  sceneText: string,
  sceneType: 'hook' | 'beat' | 'cta',
  sceneIndex: number,
  queryIndex: number = 0,
  useAI: boolean = false,
  manualUrl?: string
): Promise<FetchedImage | null> {
  
  console.log(`\n[IMAGE_FETCH] Scene ${sceneIndex + 1} (${sceneType}): "${sceneText}"`);
  
  // If manual URL provided, use it directly
  if (manualUrl) {
    console.log('[IMAGE_FETCH] Using manual URL:', manualUrl);
    const manualCandidate: ImageCandidate = {
      url: manualUrl,
      title: 'Manual override',
      tags: [],
      width: 1920,
      height: 1080,
      source: 'unsplash',
      score: 100
    };
    return validateAndDownloadImage(manualCandidate);
  }
  
  // Build visual queries
  const visualQuery = buildVisualQueries(sceneText, sceneType);
  const queryToUse = visualQuery.candidates[Math.min(queryIndex, visualQuery.candidates.length - 1)];
  
  console.log(`[IMAGE_FETCH] Using query ${queryIndex}: "${queryToUse}"`);
  
  // Optional AI generation (if enabled and available)
  if (useAI && typeof window !== 'undefined' && (window as any).sdUrl) {
    try {
      const aiImage = await generateAIImage(queryToUse, sceneType, (window as any).sdUrl);
      if (aiImage) return aiImage;
    } catch (error) {
      console.warn('[IMAGE_FETCH] AI generation failed, falling back to stock');
    }
  }
  
  // Collect candidates from all sources
  const allCandidates: ImageCandidate[] = [];
  
  // 1. Openverse (primary)
  const openverseCandidates = await fetchFromOpenverse(queryToUse);
  allCandidates.push(...openverseCandidates);
  
  // 2. Wikimedia (secondary)
  const wikimediaCandidates = await fetchFromWikimedia(queryToUse);
  allCandidates.push(...wikimediaCandidates);
  
  // 3. Unsplash (tertiary)
  if (allCandidates.length < 5) {
    const unsplashCandidates = await fetchFromUnsplash(visualQuery.tokens);
    allCandidates.push(...unsplashCandidates);
  }
  
  // 4. Picsum (last resort)
  if (allCandidates.length === 0) {
    const picsumCandidates = fetchFromPicsum(visualQuery.tokens[0] || 'scene');
    allCandidates.push(...picsumCandidates);
  }
  
  // Score all candidates
  for (const candidate of allCandidates) {
    candidate.score = scoreImageRelevance(
      {
        title: candidate.title,
        tags: candidate.tags,
        url: candidate.url,
        width: candidate.width,
        height: candidate.height
      },
      visualQuery
    );
  }
  
  // Sort by relevance score
  allCandidates.sort((a, b) => b.score - a.score);
  
  console.log(`[IMAGE_FETCH] Found ${allCandidates.length} candidates`);
  console.log('[IMAGE_FETCH] Top candidates:', allCandidates.slice(0, 3).map(c => ({
    source: c.source,
    score: c.score,
    title: c.title.substring(0, 50)
  })));
  
  // Try to download the best candidates
  for (const candidate of allCandidates) {
    const image = await validateAndDownloadImage(candidate);
    if (image) {
      console.log(`[IMAGE_FETCH] SUCCESS: ${image.srcName} (score: ${image.relevanceScore})`);
      return image;
    }
  }
  
  console.error('[IMAGE_FETCH] All sources failed');
  return null;
}

/**
 * Generate AI image (optional, when local SD is available)
 */
async function generateAIImage(
  query: string,
  sceneType: string,
  sdUrl: string
): Promise<FetchedImage | null> {
  const prompt = `${query}, cinematic concept art, dramatic lighting, high quality, detailed, ${sceneType} scene`;
  
  console.log('[AI_IMAGE] Generating with prompt:', prompt);
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${sdUrl}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'low quality, blurry, distorted, ugly',
        width: 1920,
        height: 1080,
        steps: 20,
        cfg_scale: 7,
        sampler_name: 'DPM++ 2M Karras'
      })
    });
    
    if (!response.ok) throw new Error(`SD API error: ${response.status}`);
    
    const data = await response.json();
    const base64 = data.images[0];
    
    // Convert base64 to bytes
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const genTime = Date.now() - startTime;
    console.log(`[AI_IMAGE] Generated in ${genTime}ms`);
    
    return {
      bytes,
      ext: 'png',
      srcName: 'ai-generated',
      sourceUrl: `AI: ${prompt.substring(0, 50)}...`,
      contentType: 'image/png',
      relevanceScore: 100
    };
  } catch (error) {
    console.error('[AI_IMAGE] Generation failed:', error);
    return null;
  }
}