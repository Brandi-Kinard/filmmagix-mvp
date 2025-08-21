// Deterministic keyless image search using Openverse + Wikimedia only
// Strict validation, scoring, and no random sources

import nlp from 'compromise';

export interface Candidate {
  url: string;
  title: string;
  tags: string[];
  width: number;
  height: number;
  source: 'openverse' | 'wikimedia';
  score?: number;
  aspect?: number;
}

export interface SearchResult {
  candidates: Candidate[];
  queries: string[];
  logs: string[];
  totalCandidates: number;
  processingTimeMs: number;
}

/**
 * Extract meaningful keywords from scene text
 */
function extractKeywords(text: string): string[] {
  const doc = nlp(text);
  
  // Extract nouns and key entities
  const nouns = doc.nouns().out('array');
  const people = doc.people().out('array');
  const places = doc.places().out('array');
  
  // Combine and filter
  const keywords = [...new Set([
    ...people,
    ...places,
    ...nouns.filter(noun => noun.length > 2) // Filter short words
  ])]
    .map(word => word.toLowerCase())
    .filter(word => !['the', 'and', 'or', 'but', 'with', 'for', 'to', 'in', 'on', 'at'].includes(word))
    .slice(0, 10); // Limit to top 10
  
  return keywords;
}

/**
 * Build contextual queries based on scene type
 */
function buildQueries(sceneText: string, sceneType: 'hook' | 'beat' | 'cta'): string[] {
  const keywords = extractKeywords(sceneText);
  const queries: string[] = [];
  
  if (keywords.length === 0) {
    return ['food', 'people', 'lifestyle'];
  }
  
  // Primary query: main keywords
  if (keywords.length >= 2) {
    queries.push(`${keywords[0]} ${keywords[1]}`);
  }
  
  // Secondary queries based on scene type
  switch (sceneType) {
    case 'hook':
      // Opening scenes - action, preparation, beginning
      if (keywords.length > 0) {
        queries.push(`${keywords[0]} preparation`);
        queries.push(`${keywords[0]} making`);
      }
      break;
      
    case 'beat':
      // Middle scenes - process, progress, development
      if (keywords.length > 0) {
        queries.push(`${keywords[0]} process`);
        queries.push(`${keywords[0]} finished`);
      }
      break;
      
    case 'cta':
      // Ending scenes - result, serving, consumption
      if (keywords.length > 0) {
        queries.push(`${keywords[0]} served`);
        queries.push(`${keywords[0]} table`);
        queries.push(`${keywords[0]} eating`);
      }
      break;
  }
  
  // Backup queries with individual keywords
  queries.push(...keywords.slice(0, 3));
  
  // Remove duplicates and limit to 5
  return [...new Set(queries)].slice(0, 5);
}

/**
 * Validate image URL and get dimensions
 */
async function validateImageUrl(url: string): Promise<{ valid: boolean; width?: number; height?: number; contentType?: string }> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    
    if (!response.ok) {
      return { valid: false };
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      return { valid: false };
    }
    
    // Try to get dimensions from headers
    const width = response.headers.get('x-image-width');
    const height = response.headers.get('x-image-height');
    
    return {
      valid: true,
      contentType,
      width: width ? parseInt(width) : undefined,
      height: height ? parseInt(height) : undefined
    };
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Search Openverse for images with strict validation
 */
export async function searchOpenverse(query: string, page: number = 1): Promise<Candidate[]> {
  try {
    const url = `https://api.openverse.engineering/v1/images?q=${encodeURIComponent(query)}&license_type=all&page=${page}&page_size=20`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[OPENVERSE] API error: ${response.status} for query "${query}"`);
      return [];
    }
    
    const data = await response.json();
    const candidates: Candidate[] = [];
    
    for (const item of data.results || []) {
      if (!item.url) continue;
      
      let width = item.width;
      let height = item.height;
      let validated = true;
      
      // If dimensions missing, validate via HEAD request
      if (!width || !height || width < 1200 && height < 1200) {
        const validation = await validateImageUrl(item.url);
        if (!validation.valid) continue;
        
        width = validation.width || width || 0;
        height = validation.height || height || 0;
      }
      
      // Strict dimension requirement
      if (width < 1200 && height < 1200) continue;
      
      candidates.push({
        url: item.url,
        title: item.title || '',
        tags: item.tags || [],
        width,
        height,
        source: 'openverse',
        aspect: width && height ? width / height : 1
      });
    }
    
    return candidates;
  } catch (error) {
    console.warn(`[OPENVERSE] Search failed for "${query}":`, error);
    return [];
  }
}

/**
 * Search Wikimedia Commons with strict validation
 */
export async function searchWikimedia(query: string, gsroffset: number = 0): Promise<Candidate[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}+filetype:bitmap&gsrnamespace=6&gsrlimit=20&gsroffset=${gsroffset}&prop=imageinfo&iiprop=url|size&format=json&origin=*`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`[WIKIMEDIA] API error: ${response.status} for query "${query}"`);
      return [];
    }
    
    const data = await response.json();
    const candidates: Candidate[] = [];
    
    if (!data.query?.pages) {
      return [];
    }
    
    for (const pageId of Object.keys(data.query.pages)) {
      const page = data.query.pages[pageId];
      const imageinfo = page.imageinfo?.[0];
      
      if (!imageinfo?.url) continue;
      
      const width = imageinfo.width || 0;
      const height = imageinfo.height || 0;
      
      // Strict dimension requirement
      if (width < 1200 && height < 1200) continue;
      
      // Extract title and create tags
      const title = page.title?.replace('File:', '') || '';
      const tags = title.toLowerCase().split(/[\s\-_.]+/).filter(tag => tag.length > 2);
      
      candidates.push({
        url: imageinfo.url,
        title,
        tags,
        width,
        height,
        source: 'wikimedia',
        aspect: width && height ? width / height : 1
      });
    }
    
    return candidates;
  } catch (error) {
    console.warn(`[WIKIMEDIA] Search failed for "${query}":`, error);
    return [];
  }
}

/**
 * Score candidate based on relevance
 */
export function scoreCandidate(
  textKeywords: string[],
  candidate: Candidate,
  targetAspect?: number
): number {
  let score = 0;
  
  // Combine title and tags for matching
  const candidateTerms = [
    ...candidate.title.toLowerCase().split(/[\s\-_.]+/),
    ...candidate.tags
  ].filter(term => term.length > 2);
  
  // Token overlap scoring
  for (const keyword of textKeywords) {
    for (const term of candidateTerms) {
      if (keyword === term) {
        score += 3; // Exact match
      } else if (keyword.includes(term) || term.includes(keyword)) {
        score += 2; // Partial match
      }
    }
  }
  
  // Aspect ratio bonus
  if (targetAspect && candidate.aspect) {
    const aspectDiff = Math.abs(candidate.aspect - targetAspect);
    if (aspectDiff < 0.2) {
      score += 1;
    }
  }
  
  // High resolution bonus
  if (candidate.width >= 1600 || candidate.height >= 1600) {
    score += 1;
  }
  
  candidate.score = score;
  return score;
}

/**
 * Get ranked candidates for a scene
 */
export async function getRankedCandidates(
  sceneText: string,
  sceneType: 'hook' | 'beat' | 'cta',
  aspect?: number
): Promise<SearchResult> {
  const startTime = Date.now();
  const logs: string[] = [];
  const allCandidates: Candidate[] = [];
  
  console.group(`🔍 Image search for ${sceneType.toUpperCase()}: "${sceneText.substring(0, 50)}..."`);
  
  // Extract keywords and build queries
  const textKeywords = extractKeywords(sceneText);
  const queries = buildQueries(sceneText, sceneType);
  
  console.log('📝 Keywords extracted:', textKeywords.join(', '));
  console.log('🔎 Search queries:', queries.join(', '));
  
  logs.push(`Keywords: ${textKeywords.join(', ')}`);
  logs.push(`Queries: ${queries.join(', ')}`);
  
  // Search each source with each query
  for (const query of queries) {
    console.group(`Query: "${query}"`);
    
    // Search Openverse first
    try {
      const openverseCandidates = await searchOpenverse(query);
      allCandidates.push(...openverseCandidates);
      console.log(`📚 Openverse: ${openverseCandidates.length} candidates`);
      logs.push(`Openverse "${query}": ${openverseCandidates.length} candidates`);
    } catch (error) {
      console.warn('Openverse search failed:', error);
      logs.push(`Openverse "${query}": failed`);
    }
    
    // Search Wikimedia
    try {
      const wikimediaCandidates = await searchWikimedia(query);
      allCandidates.push(...wikimediaCandidates);
      console.log(`🏛️ Wikimedia: ${wikimediaCandidates.length} candidates`);
      logs.push(`Wikimedia "${query}": ${wikimediaCandidates.length} candidates`);
    } catch (error) {
      console.warn('Wikimedia search failed:', error);
      logs.push(`Wikimedia "${query}": failed`);
    }
    
    console.groupEnd();
  }
  
  // Remove duplicates by URL
  const uniqueCandidates = allCandidates.filter((candidate, index, self) =>
    index === self.findIndex(c => c.url === candidate.url)
  );
  
  // Score all candidates
  for (const candidate of uniqueCandidates) {
    scoreCandidate(textKeywords, candidate, aspect);
  }
  
  // Sort by score (highest first)
  const rankedCandidates = uniqueCandidates
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 12); // Top 12
  
  // Log top 5 candidates
  console.log('🏆 Top 5 candidates:');
  rankedCandidates.slice(0, 5).forEach((candidate, index) => {
    console.log(`  ${index + 1}. [${candidate.source}] ${candidate.title.substring(0, 40)}... (score: ${candidate.score})`);
  });
  
  if (rankedCandidates.length > 0) {
    const winner = rankedCandidates[0];
    console.log(`✅ Selected: ${winner.source} - ${winner.title.substring(0, 50)}... (score: ${winner.score})`);
    logs.push(`Selected: ${winner.source} (score: ${winner.score})`);
  } else {
    console.log('❌ No suitable candidates found');
    logs.push('No suitable candidates found');
  }
  
  const processingTime = Date.now() - startTime;
  console.log(`⏱️ Search completed in ${processingTime}ms`);
  console.groupEnd();
  
  return {
    candidates: rankedCandidates,
    queries,
    logs,
    totalCandidates: allCandidates.length,
    processingTimeMs: processingTime
  };
}

/**
 * Test function for acceptance criteria
 */
export async function testImageSearch(): Promise<void> {
  console.log('🧪 Testing image search with acceptance criteria...');
  
  const testScenes = [
    { text: 'A chef cooks pasta in a kitchen', type: 'hook' as const },
    { text: 'The meal is ready', type: 'beat' as const },
    { text: 'Time to eat', type: 'cta' as const }
  ];
  
  for (const scene of testScenes) {
    const result = await getRankedCandidates(scene.text, scene.type);
    
    console.log(`\n📊 Results for "${scene.text}" (${scene.type}):`);
    console.log(`  - ${result.totalCandidates} total candidates found`);
    console.log(`  - ${result.candidates.length} ranked candidates`);
    console.log(`  - Best match: ${result.candidates[0]?.title || 'None'} (score: ${result.candidates[0]?.score || 0})`);
  }
}