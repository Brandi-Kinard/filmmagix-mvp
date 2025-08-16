// Visual Query Builder for Relevance-First Image System
// Deterministic scene-to-query conversion with visual synonyms

export interface VisualQuery {
  primary: string;
  backup: string;
  candidates: string[];
  tokens: string[];
  places: string[];
  subjects: string[];
}

// Comprehensive stopwords list
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'can', 'shall', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'them', 'their', 'there', 'then', 'than', 'when', 'where', 'why', 'how', 'what',
  'which', 'who', 'whom', 'whose', 'if', 'unless', 'until', 'while', 'during', 'before',
  'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further',
  'once', 'here', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'only', 'own', 'same', 'so', 'too', 'very', 'just', 'now', 'into', 'no', 'not',
  'her', 'him', 'his', 'its', 'our', 'us', 'your', 'about', 'against', 'between', 'through'
]);

// Visual synonyms dictionary - expand concepts to visual searchable terms
const VISUAL_SYNONYMS: Record<string, string[]> = {
  // Professions
  'pianist': ['piano', 'grand piano', 'keyboard', 'musician'],
  'musician': ['music', 'instrument', 'performer', 'artist'],
  'chef': ['kitchen', 'cooking', 'restaurant', 'culinary'],
  'doctor': ['hospital', 'medical', 'stethoscope', 'healthcare'],
  'teacher': ['classroom', 'blackboard', 'education', 'school'],
  'artist': ['painting', 'easel', 'brush', 'studio'],
  'writer': ['typewriter', 'manuscript', 'desk', 'books'],
  'detective': ['investigation', 'magnifying glass', 'mystery', 'clues'],
  
  // Places
  'paris': ['eiffel tower', 'france', 'parisian', 'french'],
  'london': ['big ben', 'thames', 'british', 'england'],
  'tokyo': ['japan', 'cherry blossom', 'shibuya', 'mount fuji'],
  'new york': ['manhattan', 'skyline', 'times square', 'statue liberty'],
  'cafe': ['coffee shop', 'bistro', 'restaurant', 'tables'],
  'cafés': ['coffee shop', 'bistro', 'restaurant', 'tables'],
  'desert': ['sand dunes', 'sahara', 'cactus', 'arid'],
  'forest': ['trees', 'woods', 'nature', 'wilderness'],
  'ocean': ['sea', 'waves', 'beach', 'water'],
  'mountain': ['peaks', 'summit', 'hiking', 'alpine'],
  'city': ['urban', 'skyline', 'buildings', 'downtown'],
  'spaceship': ['spacecraft', 'rocket', 'space station', 'astronaut'],
  
  // Time/Mood
  'night': ['evening', 'dark', 'nocturnal', 'moonlight'],
  'morning': ['sunrise', 'dawn', 'early', 'daybreak'],
  'rainy': ['rain', 'wet', 'storm', 'umbrella'],
  'twilight': ['dusk', 'sunset', 'golden hour', 'evening'],
  'empty': ['abandoned', 'deserted', 'vacant', 'lonely'],
  
  // Objects/Concepts
  'love': ['romance', 'heart', 'couple', 'romantic'],
  'stranger': ['mysterious person', 'unknown', 'silhouette', 'figure'],
  'gates': ['entrance', 'doorway', 'portal', 'arch'],
  'lights': ['illumination', 'lamps', 'glow', 'bright'],
  'heartbeat': ['pulse', 'heart monitor', 'medical', 'rhythm'],
  'caravan': ['convoy', 'wagons', 'journey', 'travel'],
  'golden': ['gold', 'yellow', 'bright', 'shining'],
  'derelict': ['abandoned', 'ruined', 'broken', 'decay']
};

// Place detection patterns
const PLACE_PATTERNS = [
  /\b(paris|london|tokyo|new york|rome|venice|barcelona|berlin|moscow|sydney)\b/gi,
  /\b(cafe|café|restaurant|bar|hotel|museum|library|church|temple|mosque)\b/gi,
  /\b(forest|desert|ocean|mountain|beach|river|lake|valley|canyon|island)\b/gi,
  /\b(city|town|village|street|avenue|boulevard|plaza|square|park)\b/gi,
  /\b(spaceship|spacecraft|station|planet|moon|orbit|galaxy)\b/gi,
  /\b(house|home|apartment|building|tower|castle|palace|mansion)\b/gi
];

// Profession/subject patterns
const SUBJECT_PATTERNS = [
  /\b(pianist|musician|singer|dancer|actor|artist|painter|sculptor)\b/gi,
  /\b(chef|waiter|bartender|cook|baker)\b/gi,
  /\b(doctor|nurse|surgeon|patient|medic)\b/gi,
  /\b(teacher|student|professor|scholar)\b/gi,
  /\b(detective|police|officer|investigator|spy)\b/gi,
  /\b(pilot|astronaut|captain|sailor|driver)\b/gi,
  /\b(man|woman|person|people|child|family|couple|stranger)\b/gi
];

/**
 * Extract meaningful tokens from text
 */
function extractTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2)
    .filter(word => !STOPWORDS.has(word))
    .filter(word => !/^\d+$/.test(word));
}

/**
 * Extract places from text
 */
function extractPlaces(text: string): string[] {
  const places: string[] = [];
  for (const pattern of PLACE_PATTERNS) {
    const matches = text.match(pattern) || [];
    places.push(...matches.map(m => m.toLowerCase()));
  }
  return [...new Set(places)];
}

/**
 * Extract subjects/professions from text
 */
function extractSubjects(text: string): string[] {
  const subjects: string[] = [];
  for (const pattern of SUBJECT_PATTERNS) {
    const matches = text.match(pattern) || [];
    subjects.push(...matches.map(m => m.toLowerCase()));
  }
  return [...new Set(subjects)];
}

/**
 * Expand tokens with visual synonyms
 */
function expandWithSynonyms(tokens: string[]): string[] {
  const expanded: string[] = [...tokens];
  
  for (const token of tokens) {
    if (VISUAL_SYNONYMS[token]) {
      expanded.push(...VISUAL_SYNONYMS[token]);
    }
  }
  
  return [...new Set(expanded)];
}

/**
 * Build deterministic visual queries from scene text
 */
export function buildVisualQueries(
  sceneText: string,
  sceneType: 'hook' | 'beat' | 'cta' = 'beat'
): VisualQuery {
  // Extract components
  const tokens = extractTokens(sceneText);
  const places = extractPlaces(sceneText);
  const subjects = extractSubjects(sceneText);
  
  // Expand with synonyms
  const expandedTokens = expandWithSynonyms([...tokens, ...places, ...subjects]);
  
  // Add mood tokens for HOOK/CTA
  const moodTokens: string[] = [];
  if (sceneType === 'hook') {
    moodTokens.push('dramatic', 'cinematic', 'establishing');
  } else if (sceneType === 'cta') {
    moodTokens.push('climactic', 'intense', 'compelling');
  }
  
  // Build query candidates
  const candidates: string[] = [];
  
  // Primary: subject + place + mood/time
  if (subjects.length > 0 && places.length > 0) {
    const primary = [...subjects.slice(0, 1), ...places.slice(0, 1), ...moodTokens];
    candidates.push(primary.join(' '));
  }
  
  // Backup: expanded key concepts
  if (expandedTokens.length > 0) {
    const backup = expandedTokens.slice(0, 3);
    candidates.push(backup.join(' '));
  }
  
  // Additional candidates with different combinations
  if (places.length > 0) {
    candidates.push(places.join(' '));
  }
  
  if (subjects.length > 0) {
    candidates.push(subjects.join(' '));
  }
  
  // Add most relevant expanded tokens
  const relevantExpanded = expandedTokens
    .filter(t => !places.includes(t) && !subjects.includes(t))
    .slice(0, 3);
  if (relevantExpanded.length > 0) {
    candidates.push(relevantExpanded.join(' '));
  }
  
  // Ensure we have at least 3 candidates
  while (candidates.length < 3) {
    candidates.push(tokens.slice(0, Math.min(3, tokens.length)).join(' '));
  }
  
  // Remove duplicates and empty queries
  const uniqueCandidates = [...new Set(candidates)].filter(q => q.trim().length > 0);
  
  console.log('[VISUAL_QUERY] Scene text:', sceneText);
  console.log('[VISUAL_QUERY] Tokens:', tokens);
  console.log('[VISUAL_QUERY] Places:', places);
  console.log('[VISUAL_QUERY] Subjects:', subjects);
  console.log('[VISUAL_QUERY] Expanded:', expandedTokens);
  console.log('[VISUAL_QUERY] Candidates:', uniqueCandidates);
  
  return {
    primary: uniqueCandidates[0] || 'cinematic scene',
    backup: uniqueCandidates[1] || 'dramatic moment',
    candidates: uniqueCandidates.slice(0, 5),
    tokens,
    places,
    subjects
  };
}

/**
 * Score image relevance based on title, tags, and URL
 */
export function scoreImageRelevance(
  imageData: {
    title?: string;
    tags?: string[];
    url?: string;
    width?: number;
    height?: number;
  },
  query: VisualQuery
): number {
  let score = 0;
  
  const allQueryTokens = new Set([
    ...query.tokens,
    ...query.places,
    ...query.subjects
  ]);
  
  // Check title matches
  if (imageData.title) {
    const titleLower = imageData.title.toLowerCase();
    for (const token of allQueryTokens) {
      if (titleLower.includes(token)) {
        score += 2;
      }
    }
  }
  
  // Check tag matches
  if (imageData.tags) {
    for (const tag of imageData.tags) {
      const tagLower = tag.toLowerCase();
      for (const token of allQueryTokens) {
        if (tagLower.includes(token)) {
          score += 2;
        }
      }
    }
  }
  
  // Check URL matches
  if (imageData.url) {
    const urlLower = imageData.url.toLowerCase();
    for (const token of allQueryTokens) {
      if (urlLower.includes(token)) {
        score += 1;
      }
    }
  }
  
  // Place bonus
  for (const place of query.places) {
    if (imageData.title?.toLowerCase().includes(place) ||
        imageData.tags?.some(t => t.toLowerCase().includes(place))) {
      score += 3;
    }
  }
  
  // Size bonus
  if (imageData.width && imageData.width >= 1600) score += 1;
  if (imageData.height && imageData.height >= 1600) score += 1;
  
  // Negative penalties
  const negativeTerms = ['logo', 'vector', 'icon', 'pattern', 'abstract', 'wallpaper'];
  for (const term of negativeTerms) {
    if (imageData.title?.toLowerCase().includes(term) ||
        imageData.tags?.some(t => t.toLowerCase().includes(term))) {
      score -= 5;
    }
  }
  
  return Math.max(0, score);
}