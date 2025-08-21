// Improved image sourcing with multiple keyless APIs and relevance scoring
// Sources: Openverse → Wikimedia → Unsplash (keyless) → Picsum → local placeholders

import nlp from 'compromise';

export interface ImageCandidate {
  url: string;
  source: 'openverse' | 'wikimedia' | 'unsplash' | 'picsum' | 'placeholder';
  query: string;
  score: number;
  width?: number;
  height?: number;
  aspectMatch?: number;
  resolution?: string;
}

export interface ImageSearchResult {
  success: boolean;
  image?: ImageCandidate;
  candidates: ImageCandidate[];
  logs: string[];
  error?: string;
}

// Synonyms and context mapping for better queries
const SYNONYMS_MAP: { [key: string]: string[] } = {
  // Professions
  'chef': ['cook', 'kitchen', 'restaurant', 'culinary'],
  'doctor': ['medical', 'hospital', 'health', 'clinic'],
  'teacher': ['education', 'school', 'classroom', 'learning'],
  'artist': ['creative', 'studio', 'painting', 'gallery'],
  'musician': ['music', 'concert', 'instrument', 'performance'],
  'writer': ['author', 'book', 'desk', 'writing'],
  
  // Places
  'city': ['urban', 'street', 'buildings', 'downtown'],
  'forest': ['trees', 'nature', 'woodland', 'green'],
  'beach': ['ocean', 'sand', 'waves', 'coastal'],
  'mountain': ['peak', 'landscape', 'hiking', 'summit'],
  'cafe': ['coffee', 'restaurant', 'cozy', 'interior'],
  'office': ['business', 'workplace', 'corporate', 'desk'],
  
  // Moods/Contexts
  'happy': ['joy', 'smile', 'bright', 'positive'],
  'peaceful': ['calm', 'serene', 'quiet', 'tranquil'],
  'busy': ['crowded', 'active', 'movement', 'bustling'],
  'modern': ['contemporary', 'sleek', 'tech', 'minimalist'],
  'vintage': ['retro', 'classic', 'old', 'antique'],
  
  // Objects
  'food': ['meal', 'dish', 'cuisine', 'cooking'],
  'book': ['reading', 'literature', 'library', 'pages'],
  'car': ['vehicle', 'automobile', 'driving', 'road'],
  'phone': ['mobile', 'technology', 'communication', 'device']
};

// Placeholder categories for fallback
const PLACEHOLDER_CATEGORIES = [
  'urban', 'nature', 'abstract'
];

/**
 * Extract entities and keywords from text using compromise.js
 */
function extractEntities(text: string): string[] {
  const doc = nlp(text);
  
  // Extract different types of entities
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  const nouns = doc.nouns().out('array');
  const adjectives = doc.adjectives().out('array');
  
  // Combine and deduplicate
  const entities = [...new Set([
    ...people,
    ...places,
    ...nouns.slice(0, 5), // Limit nouns to top 5
    ...adjectives.slice(0, 3) // Limit adjectives to top 3
  ])];
  
  return entities
    .filter(entity => entity.length > 2) // Filter out short words
    .map(entity => entity.toLowerCase())
    .slice(0, 8); // Limit total entities
}

/**
 * Build query candidates from extracted entities
 */
function buildQueryCandidates(text: string): string[] {
  const entities = extractEntities(text);
  const queries: string[] = [];
  
  if (entities.length === 0) {
    return ['landscape', 'nature', 'abstract'];
  }
  
  // Primary query: first entity + context
  if (entities.length >= 2) {
    queries.push(`${entities[0]} ${entities[1]}`);
  }
  
  // Secondary queries with synonyms
  for (const entity of entities.slice(0, 3)) {
    if (SYNONYMS_MAP[entity]) {
      const synonyms = SYNONYMS_MAP[entity];
      queries.push(`${entity} ${synonyms[0]}`);
      if (synonyms.length > 1) {
        queries.push(`${synonyms[0]} ${synonyms[1]}`);
      }
    } else {
      queries.push(entity);
    }
  }
  
  // Fallback queries
  queries.push('landscape');
  queries.push('nature');
  queries.push('abstract');
  
  // Remove duplicates and limit to 5 candidates
  return [...new Set(queries)].slice(0, 5);
}

/**
 * Check if URL returns a valid image
 */
async function validateImageUrl(url: string): Promise<{ valid: boolean; width?: number; height?: number }> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    
    if (!response.ok) {
      return { valid: false };
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      return { valid: false };
    }
    
    // Try to get dimensions from headers (some services provide this)
    const width = response.headers.get('x-image-width');
    const height = response.headers.get('x-image-height');
    
    return {
      valid: true,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Search Openverse for images
 */
async function searchOpenverse(query: string): Promise<ImageCandidate[]> {
  try {
    // Openverse API (CC licensed images)
    const url = `https://api.openverse.engineering/v1/images/?q=${encodeURIComponent(query)}&license=cc0,pdm&mature=false&page_size=10`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const candidates: ImageCandidate[] = [];
    
    for (const item of data.results || []) {
      if (item.url && item.width >= 1600) {
        const validation = await validateImageUrl(item.url);
        if (validation.valid) {
          candidates.push({
            url: item.url,
            source: 'openverse',
            query,
            score: 0, // Will be calculated later
            width: item.width,
            height: item.height
          });
        }
      }
    }
    
    return candidates.slice(0, 3); // Limit to top 3
  } catch (error) {
    console.warn('[IMAGE] Openverse search failed:', error);
    return [];
  }
}

/**
 * Search Wikimedia Commons for images
 */
async function searchWikimedia(query: string): Promise<ImageCandidate[]> {
  try {
    // Wikimedia Commons API
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&srlimit=10`;
    
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const candidates: ImageCandidate[] = [];
    
    for (const item of data.query?.search || []) {
      if (item.title) {
        // Construct image URL from title
        const filename = item.title.replace('File:', '');
        const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1920`;
        
        const validation = await validateImageUrl(imageUrl);
        if (validation.valid) {
          candidates.push({
            url: imageUrl,
            source: 'wikimedia',
            query,
            score: 0,
            width: validation.width,
            height: validation.height
          });
        }
      }
    }
    
    return candidates.slice(0, 3);
  } catch (error) {
    console.warn('[IMAGE] Wikimedia search failed:', error);
    return [];
  }
}

/**
 * Search Unsplash using keyless URL pattern
 */
async function searchUnsplash(query: string): Promise<ImageCandidate[]> {
  try {
    // Unsplash source URL pattern (keyless)
    const baseUrl = 'https://source.unsplash.com/1920x1080/';
    const candidates: ImageCandidate[] = [];
    
    // Try different variations
    const variations = [
      query,
      query.replace(/\s+/g, ','),
      query.split(' ')[0] // First word only
    ];
    
    for (const variation of variations) {
      const url = `${baseUrl}?${encodeURIComponent(variation)}`;
      
      const validation = await validateImageUrl(url);
      if (validation.valid) {
        candidates.push({
          url,
          source: 'unsplash',
          query: variation,
          score: 0,
          width: 1920,
          height: 1080
        });
        break; // Only need one from Unsplash per query
      }
    }
    
    return candidates;
  } catch (error) {
    console.warn('[IMAGE] Unsplash search failed:', error);
    return [];
  }
}

/**
 * Get Picsum placeholder image
 */
function getPicsumPlaceholder(): ImageCandidate {
  const seed = Math.floor(Math.random() * 1000);
  return {
    url: `https://picsum.photos/seed/${seed}/1920/1080`,
    source: 'picsum',
    query: 'random',
    score: 0,
    width: 1920,
    height: 1080
  };
}

/**
 * Get local placeholder image using data URL
 */
function getLocalPlaceholder(): ImageCandidate {
  const placeholders = [
    // Urban - blue gradient
    'data:image/svg+xml;base64,' + btoa(`
      <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea"/>
            <stop offset="100%" style="stop-color:#764ba2"/>
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#grad1)"/>
        <text x="960" y="540" text-anchor="middle" dominant-baseline="middle" 
              font-family="Arial" font-size="120" font-weight="bold" fill="white" 
              stroke="rgba(0,0,0,0.3)" stroke-width="2">URBAN</text>
      </svg>`),
    
    // Nature - green gradient  
    'data:image/svg+xml;base64,' + btoa(`
      <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#56ab2f"/>
            <stop offset="100%" style="stop-color:#a8e6cf"/>
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#grad2)"/>
        <text x="960" y="540" text-anchor="middle" dominant-baseline="middle" 
              font-family="Arial" font-size="120" font-weight="bold" fill="white" 
              stroke="rgba(0,0,0,0.3)" stroke-width="2">NATURE</text>
      </svg>`),
    
    // Abstract - warm gradient
    'data:image/svg+xml;base64,' + btoa(`
      <svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#fa709a"/>
            <stop offset="100%" style="stop-color:#fee140"/>
          </linearGradient>
        </defs>
        <rect width="1920" height="1080" fill="url(#grad3)"/>
        <text x="960" y="540" text-anchor="middle" dominant-baseline="middle" 
              font-family="Arial" font-size="120" font-weight="bold" fill="white" 
              stroke="rgba(0,0,0,0.3)" stroke-width="2">ABSTRACT</text>
      </svg>`)
  ];
  
  const categories = ['urban', 'nature', 'abstract'];
  const index = Math.floor(Math.random() * placeholders.length);
  
  return {
    url: placeholders[index],
    source: 'placeholder',
    query: categories[index],
    score: 0,
    width: 1920,
    height: 1080
  };
}

/**
 * Calculate relevance score for an image candidate
 */
function calculateScore(candidate: ImageCandidate, originalText: string, targetAspect: number): number {
  let score = 0;
  const entities = extractEntities(originalText);
  const queryWords = candidate.query.toLowerCase().split(/\s+/);
  
  // Token overlap scoring (+2 per match)
  for (const entity of entities) {
    for (const word of queryWords) {
      if (entity.includes(word) || word.includes(entity)) {
        score += 2;
      }
    }
  }
  
  // Place bonus (+3 if query contains place-related terms)
  const placeTerms = ['city', 'forest', 'beach', 'mountain', 'cafe', 'office', 'street', 'park'];
  for (const term of placeTerms) {
    if (candidate.query.toLowerCase().includes(term)) {
      score += 3;
      break;
    }
  }
  
  // Aspect ratio match bonus (+1)
  if (candidate.width && candidate.height) {
    const candidateAspect = candidate.width / candidate.height;
    const aspectDiff = Math.abs(candidateAspect - targetAspect);
    if (aspectDiff < 0.2) { // Close aspect match
      score += 1;
    }
    candidate.aspectMatch = aspectDiff;
  }
  
  // Resolution bonus (+1 for high resolution)
  if (candidate.width && candidate.width >= 1920) {
    score += 1;
  }
  
  // Source preference bonus
  switch (candidate.source) {
    case 'openverse': score += 3; break;
    case 'wikimedia': score += 2; break;
    case 'unsplash': score += 1; break;
    case 'picsum': score += 0; break;
    case 'placeholder': score -= 1; break;
  }
  
  candidate.score = score;
  return score;
}

/**
 * Main function to find the best image for a scene
 */
export async function findBestImage(
  sceneText: string,
  aspectRatio: number = 16/9
): Promise<ImageSearchResult> {
  const logs: string[] = [];
  const allCandidates: ImageCandidate[] = [];
  
  logs.push(`[IMAGE] Starting search for: "${sceneText.substring(0, 100)}..."`);
  
  // Build query candidates
  const queries = buildQueryCandidates(sceneText);
  logs.push(`[IMAGE] Generated queries: ${queries.join(', ')}`);
  
  // Search each source with each query
  for (const query of queries) {
    logs.push(`[IMAGE] Searching with query: "${query}"`);
    
    // Try Openverse first
    const openverseResults = await searchOpenverse(query);
    allCandidates.push(...openverseResults);
    if (openverseResults.length > 0) {
      logs.push(`[IMAGE] Openverse found ${openverseResults.length} candidates`);
    }
    
    // Try Wikimedia
    const wikimediaResults = await searchWikimedia(query);
    allCandidates.push(...wikimediaResults);
    if (wikimediaResults.length > 0) {
      logs.push(`[IMAGE] Wikimedia found ${wikimediaResults.length} candidates`);
    }
    
    // Try Unsplash
    const unsplashResults = await searchUnsplash(query);
    allCandidates.push(...unsplashResults);
    if (unsplashResults.length > 0) {
      logs.push(`[IMAGE] Unsplash found ${unsplashResults.length} candidates`);
    }
    
    // Stop if we have enough candidates
    if (allCandidates.length >= 15) break;
  }
  
  // Add fallbacks if needed
  if (allCandidates.length === 0) {
    logs.push(`[IMAGE] No API results, adding Picsum placeholder`);
    allCandidates.push(getPicsumPlaceholder());
  }
  
  // Always add local placeholder as final fallback
  allCandidates.push(getLocalPlaceholder());
  
  // Calculate scores for all candidates
  for (const candidate of allCandidates) {
    calculateScore(candidate, sceneText, aspectRatio);
  }
  
  // Sort by score (highest first), then by aspect match (lowest diff first)
  allCandidates.sort((a, b) => {
    if (a.score !== b.score) {
      return b.score - a.score;
    }
    // Tie-breaker: better aspect match
    const aspectA = a.aspectMatch || 999;
    const aspectB = b.aspectMatch || 999;
    return aspectA - aspectB;
  });
  
  const winner = allCandidates[0];
  
  logs.push(`[IMAGE] Scored ${allCandidates.length} candidates`);
  logs.push(`[IMAGE] Winner: ${winner.source} (score: ${winner.score}, query: "${winner.query}")`);
  logs.push(`[IMAGE] Final URL: ${winner.url}`);
  
  if (winner.width && winner.height) {
    logs.push(`[IMAGE] Dimensions: ${winner.width}x${winner.height}`);
  }
  
  return {
    success: true,
    image: winner,
    candidates: allCandidates.slice(0, 10), // Return top 10 for debugging
    logs
  };
}

/**
 * Debug function to test image search
 */
export async function testImageSearch(query: string): Promise<void> {
  console.log(`[IMAGE TEST] Testing search for: "${query}"`);
  
  const result = await findBestImage(query);
  
  console.log(`[IMAGE TEST] Result:`, result);
  
  for (const log of result.logs) {
    console.log(log);
  }
  
  if (result.image) {
    console.log(`[IMAGE TEST] Best match:`, {
      source: result.image.source,
      score: result.image.score,
      query: result.image.query,
      url: result.image.url.substring(0, 100) + '...'
    });
  }
}