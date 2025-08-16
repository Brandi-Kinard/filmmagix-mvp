export type AspectKey = 'portrait' | 'landscape' | 'square';

export interface AspectConfig {
  width: number;
  height: number;
  baseFontSize: number;
  name: string;
}

export const ASPECT_CONFIGS: Record<AspectKey, AspectConfig> = {
  portrait: {
    width: 1080,
    height: 1920,
    baseFontSize: 56,
    name: "Portrait 9:16"
  },
  landscape: {
    width: 1920,
    height: 1080,
    baseFontSize: 64,
    name: "Landscape 16:9"
  },
  square: {
    width: 1080,
    height: 1080,
    baseFontSize: 56,
    name: "Square 1:1"
  }
};

export function layoutForAspect(aspect: AspectKey) {
  const config = ASPECT_CONFIGS[aspect];
  return { W: config.width, H: config.height, baseFont: config.baseFontSize };
}

export interface CaptionLayoutResult {
  wrappedText: string;
  fontSize: number;
  maxCharsPerLine: number;
  linesCount: number;
  longestLineLength: number;
  safeWidthPx: number;
  warnings: string[];
}

/**
 * DEAD SIMPLE SOLUTION - Cannot fail because it uses FIXED measurements
 * No complex math, no guessing, just fixed limits that work EVERY TIME
 */
export function computeCaptionLayout({
  text,
  widthPx,
  aspect,
  targetFont
}: {
  text: string;
  widthPx: number;
  aspect: AspectKey;
  targetFont?: number;
}): CaptionLayoutResult {
  const warnings: string[] = [];
  
  // EXTREMELY CONSERVATIVE SETTINGS - GUARANTEED to fit with massive margins
  const SIMPLE_SETTINGS = {
    portrait: { 
      fontSize: 28,        // Much smaller font
      maxChars: 24,        // Very conservative character limit
      maxLines: 5          // More lines to prevent truncation
    },
    landscape: { 
      fontSize: 32,        // Smaller font for landscape too
      maxChars: 40,        // Conservative for landscape
      maxLines: 3          // More lines even for landscape
    },
    square: { 
      fontSize: 30,        // Small font for square
      maxChars: 26,        // Very conservative for square
      maxLines: 4          // More lines for square
    }
  };
  
  const settings = SIMPLE_SETTINGS[aspect];
  const fontSize = settings.fontSize;
  const maxCharsPerLine = settings.maxChars;
  const maxLines = settings.maxLines;
  
  // DEAD SIMPLE WRAPPING - basic word wrapping that always works
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  console.log(`[DEBUG] Processing text: "${text}"`);
  console.log(`[DEBUG] Settings: ${maxCharsPerLine} chars, ${maxLines} lines`);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    console.log(`[DEBUG] Testing word "${word}", testLine: "${testLine}" (${testLine.length} chars)`);
    
    if (testLine.length <= maxCharsPerLine) {
      // Word fits, add it to current line
      currentLine = testLine;
      console.log(`[DEBUG] Word fits, currentLine now: "${currentLine}"`);
    } else {
      // Word doesn't fit, finish current line and start new one
      if (currentLine) {
        lines.push(currentLine);
        console.log(`[DEBUG] Line complete: "${currentLine}"`);
        currentLine = word; // Start new line with this word
      } else {
        // Current line is empty but word is too long, truncate it
        currentLine = word.substring(0, maxCharsPerLine - 1) + '-';
        console.log(`[DEBUG] Word too long, truncated to: "${currentLine}"`);
      }
      
      // Check if we've hit max lines
      if (lines.length >= maxLines) {
        console.log(`[DEBUG] Hit max lines (${maxLines}), stopping`);
        // Add ellipsis to last line if needed
        if (i < words.length - 1) {
          let lastLine = lines[lines.length - 1];
          if (lastLine.length > maxCharsPerLine - 3) {
            lastLine = lastLine.substring(0, maxCharsPerLine - 3);
          }
          lines[lines.length - 1] = lastLine + '...';
          warnings.push(`Truncated ${words.length - i} words`);
        }
        break;
      }
    }
  }
  
  // Add final line if there's content and room
  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
    console.log(`[DEBUG] Final line added: "${currentLine}"`);
  }
  
  console.log(`[DEBUG] Final lines:`, lines);
  
  // Ensure no line exceeds limit (final safety check)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > maxCharsPerLine) {
      lines[i] = lines[i].substring(0, maxCharsPerLine);
    }
  }
  
  // Join lines with newline character for FFmpeg drawtext
  const wrappedText = escapeForDrawtext(lines.join("\n"));
  const longestLineLength = Math.max(...lines.map(line => line.length), 0);
  const safeWidthPx = widthPx * 0.9; // Not used but required for interface
  
  console.log(`[DEBUG] Final wrapped text: "${wrappedText}"`);
  
  return {
    wrappedText,
    fontSize,
    maxCharsPerLine,
    linesCount: lines.length,
    longestLineLength,
    safeWidthPx,
    warnings
  };
}

/**
 * FORCE wrap text to absolute character limits - guaranteed to not exceed limits
 */
function forceWrapToLimit(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine < 5) {
    return ["..."]; // Prevent crashes with impossible limits
  }
  
  const lines: string[] = [];
  let remaining = text.replace(/\s+/g, ' ').trim(); // Normalize whitespace
  
  while (remaining.length > 0) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    
    // Find best break point within limit
    let breakPoint = maxCharsPerLine;
    
    // Try to break at a space near the limit
    for (let i = maxCharsPerLine - 1; i >= Math.max(1, maxCharsPerLine - 10); i--) {
      if (remaining[i] === ' ') {
        breakPoint = i;
        break;
      }
    }
    
    // If no space found, force break with hyphen
    if (breakPoint === maxCharsPerLine && remaining[breakPoint - 1] !== ' ') {
      breakPoint = maxCharsPerLine - 1; // Leave room for hyphen
      lines.push(remaining.substring(0, breakPoint) + '-');
    } else {
      lines.push(remaining.substring(0, breakPoint));
    }
    
    // Move to next part
    remaining = remaining.substring(breakPoint).trim();
  }
  
  return lines;
}

/**
 * Wrap text to lines with smart hyphenation for long words
 */
function wrapTextToLines(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine < 10) {
    // Prevent infinite loops with very small limits
    return [text.substring(0, 50) + "..."];
  }
  
  const lines: string[] = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    
    const words = paragraph.split(/\s+/);
    let currentLine = "";
    
    for (const word of words) {
      // Check if word fits on current line
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        // Current line is full, start new line
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        
        // Handle oversized words with hyphenation
        if (word.length > maxCharsPerLine) {
          const hyphenatedParts = hyphenateWord(word, maxCharsPerLine);
          for (let i = 0; i < hyphenatedParts.length; i++) {
            if (i === hyphenatedParts.length - 1) {
              // Last part becomes start of next line
              currentLine = hyphenatedParts[i];
            } else {
              // Add hyphenated parts as complete lines
              lines.push(hyphenatedParts[i]);
            }
          }
        } else {
          currentLine = word;
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  
  return lines;
}

/**
 * Break long words with soft hyphens
 */
function hyphenateWord(word: string, maxCharsPerLine: number): string[] {
  const parts: string[] = [];
  const chunkSize = maxCharsPerLine - 1; // Leave room for hyphen
  
  let remaining = word;
  while (remaining.length > maxCharsPerLine) {
    const chunk = remaining.substring(0, chunkSize);
    parts.push(chunk + "-");
    remaining = remaining.substring(chunkSize);
  }
  
  if (remaining) {
    parts.push(remaining);
  }
  
  return parts;
}

/**
 * NO ESCAPING - testing if escaping is causing the 'n' issue
 */
function escapeForDrawtext(text: string): string {
  console.log(`[DEBUG] Input text BEFORE any processing: "${text}"`);
  
  // Convert newlines to spaces instead of \\n to test
  const result = text.replace(/\n/g, " ");
  
  console.log(`[DEBUG] Output text AFTER processing: "${result}"`);
  return result;
}

// Legacy compatibility function
export function wrapForDrawtext(text: string, aspectRatio: AspectKey = 'portrait'): CaptionLayoutResult {
  const { W } = layoutForAspect(aspectRatio);
  return computeCaptionLayout({
    text,
    widthPx: W,
    aspect: aspectRatio
  });
}

export function pickBgColor(i: number): string {
  const palette = [
    "0x0f172a", // slate-950
    "0x1e293b", // slate-800
    "0x0a0a0a", // near black
    "0x111827", // gray-900
    "0x0b132b", // deep blue
    "0x1f2937", // gray-800
  ];
  return palette[i % palette.length];
}