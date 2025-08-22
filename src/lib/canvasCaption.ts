// Canvas-based caption rendering to PNG - BULLETPROOF VERSION
// Replaces FFmpeg drawtext which fails in browser environment

let fontLoaded = false;
let canvasFont: FontFace | null = null;

/**
 * Load Noto Sans font for consistent text rendering
 */
export async function loadCanvasFont(): Promise<void> {
  if (fontLoaded && canvasFont) {
    console.log('[CANVAS] Font already loaded');
    return;
  }

  try {
    console.log('[CANVAS] Loading Noto Sans font...');
    
    // Load font file
    const response = await fetch('/fonts/NotoSans-Regular.ttf');
    if (!response.ok) {
      throw new Error(`Font file not found: ${response.status}`);
    }
    
    const fontBuffer = await response.arrayBuffer();
    
    // Create FontFace and add to document
    canvasFont = new FontFace('NotoSans', fontBuffer);
    await canvasFont.load();
    document.fonts.add(canvasFont);
    
    fontLoaded = true;
    console.log('[CANVAS] ✓ Noto Sans font loaded successfully');
    
  } catch (error) {
    console.warn('[CANVAS] ⚠️ Font loading failed, using system fallback:', error);
    fontLoaded = true; // Mark as loaded to prevent retries
  }
}

/**
 * Caption configuration with safe margins
 */
interface CaptionConfig {
  width: number;
  height: number;
  safeMarginX: number;  // Left/right margin
  safeMarginY: number;  // Top/bottom margin
  maxLines: number;     // Max lines based on aspect
  fontSize: number;     // Starting font size
  minFontSize: number;  // Minimum font size
  lineHeight: number;   // Line height multiplier
  fontFamily: string;
}

/**
 * Get caption configuration based on video dimensions
 */
function getCaptionConfig(width: number, height: number): CaptionConfig {
  const isPortrait = height > width;
  
  return {
    width,
    height,
    safeMarginX: 64,  // 64px left/right margins
    safeMarginY: 48,  // 48px top/bottom margins
    maxLines: isPortrait ? 4 : 6,  // 4 lines portrait, 6 landscape
    fontSize: height >= 1080 ? 56 : 48,  // Start with larger font
    minFontSize: 24,  // Don't go below 24px
    lineHeight: 1.3,  // Line height multiplier
    fontFamily: fontLoaded ? 'NotoSans, sans-serif' : 'Arial, sans-serif'
  };
}

/**
 * Wrap text with word boundaries (no hyphenation)
 */
function wrapText(
  ctx: CanvasRenderingContext2D, 
  text: string, 
  maxWidth: number,
  fontSize: number,
  fontFamily: string
): string[] {
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  // Handle explicit newlines first
  const paragraphs = text.split(/\\n|\n/);
  const allLines: string[] = [];
  
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/);
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width <= maxWidth && currentLine) {
        currentLine = testLine;
      } else if (metrics.width <= maxWidth && !currentLine) {
        // First word on line
        currentLine = word;
      } else {
        // Line would exceed width
        if (currentLine) {
          allLines.push(currentLine);
        }
        
        // Check if single word is too wide
        if (ctx.measureText(word).width > maxWidth) {
          // Word is too wide even alone - this shouldn't happen with proper font sizing
          console.warn(`[CANVAS] Word too wide: "${word}" at ${fontSize}px`);
          allLines.push(word); // Add it anyway to avoid losing content
          currentLine = '';
        } else {
          currentLine = word;
        }
      }
    }
    
    // Add remaining text
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  
  return allLines;
}

/**
 * Find optimal font size that fits text within constraints
 */
function findOptimalFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  config: CaptionConfig
): { fontSize: number; lines: string[] } {
  const maxWidth = config.width - (config.safeMarginX * 2);
  const maxHeight = config.height * 0.3; // Use bottom 30% of screen for captions
  
  let fontSize = config.fontSize;
  let lines: string[] = [];
  let fits = false;
  
  // Try progressively smaller font sizes until text fits
  while (fontSize >= config.minFontSize && !fits) {
    lines = wrapText(ctx, text, maxWidth, fontSize, config.fontFamily);
    
    const totalHeight = lines.length * fontSize * config.lineHeight;
    
    if (lines.length <= config.maxLines && totalHeight <= maxHeight) {
      fits = true;
    } else {
      fontSize -= 2; // Decrease by 2px each iteration
    }
  }
  
  // If still doesn't fit, truncate to max lines
  if (lines.length > config.maxLines) {
    lines = lines.slice(0, config.maxLines);
    console.warn(`[CANVAS] Text truncated to ${config.maxLines} lines at min font size ${fontSize}px`);
  }
  
  // Add warning for text that couldn't fit within safe margins
  if (fontSize <= config.minFontSize && lines.length === config.maxLines) {
    console.warn(`[CANVAS] GUARD-RAIL: Text exceeded safe margins, reduced to ${fontSize}px and ${config.maxLines} lines`);
  }
  
  console.log(`[CANVAS] Optimal font size: ${fontSize}px, ${lines.length} lines`);
  return { fontSize, lines };
}

/**
 * Draw text with shadow/outline for readability
 */
function drawTextWithEffects(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string
): void {
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Draw shadow/outline for better readability
  // Multiple shadows for stronger effect
  const shadows = [
    { x: 2, y: 2, blur: 4, color: 'rgba(0, 0, 0, 0.8)' },
    { x: 0, y: 0, blur: 8, color: 'rgba(0, 0, 0, 0.6)' },
  ];
  
  for (const shadow of shadows) {
    ctx.save();
    ctx.shadowOffsetX = shadow.x;
    ctx.shadowOffsetY = shadow.y;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = shadow.color;
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'; // Transparent fill for shadow only
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  
  // Draw black outline
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 2;
  ctx.strokeText(text, x, y);
  
  // Draw white main text
  ctx.fillStyle = 'white';
  ctx.fillText(text, x, y);
}

/**
 * Render caption text as PNG overlay - BULLETPROOF VERSION
 */
export async function renderCaptionPNG(
  text: string,
  width: number = 1920,
  height: number = 1080,
  sceneIndex?: number
): Promise<Blob> {
  
  console.log(`[CANVAS] Rendering caption ${sceneIndex !== undefined ? `for scene ${sceneIndex}` : ''}: "${text.substring(0, 50)}..."`);
  
  // Ensure font is loaded
  await loadCanvasFont();
  
  // Create canvas with proper dimensions
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  // Clear canvas (transparent background)
  ctx.clearRect(0, 0, width, height);
  
  // Get configuration
  const config = getCaptionConfig(width, height);
  
  // Find optimal font size and wrap text
  const { fontSize, lines } = findOptimalFontSize(ctx, text, config);
  
  if (lines.length === 0) {
    console.warn('[CANVAS] No text to render');
    return new Blob([new ArrayBuffer(0)], { type: 'image/png' });
  }
  
  // Calculate positioning (bottom area of screen)
  const lineHeight = fontSize * config.lineHeight;
  const totalTextHeight = lines.length * lineHeight;
  const bottomMargin = config.safeMarginY;
  const startY = height - bottomMargin - totalTextHeight;
  
  console.log(`[CANVAS] Rendering ${lines.length} lines at ${fontSize}px, starting at Y=${startY}`);
  
  // Draw background box for better readability
  const boxPadding = 16;
  const maxLineWidth = Math.max(...lines.map(line => {
    ctx.font = `${fontSize}px ${config.fontFamily}`;
    return ctx.measureText(line).width;
  }));
  
  // Semi-transparent background box
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(
    config.safeMarginX - boxPadding,
    startY - boxPadding,
    maxLineWidth + (boxPadding * 2),
    totalTextHeight + (boxPadding * 2)
  );
  
  // Render each line with effects
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = startY + (i * lineHeight);
    
    drawTextWithEffects(
      ctx,
      line,
      config.safeMarginX,  // Left aligned with margin
      y,
      fontSize,
      config.fontFamily
    );
  }
  
  // Convert to PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        console.log(`[CANVAS] ✓ Caption PNG rendered: ${Math.round(blob.size / 1024)}KB, ${lines.length} lines @ ${fontSize}px`);
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png', 1.0); // Maximum quality
  });
}

/**
 * Test function with torture prompt
 */
export async function testCaptionRendering(): Promise<void> {
  try {
    console.log('[CANVAS] Testing caption rendering with torture prompt...');
    
    const torturePrompt = "Breaking news: A storm approaches the city, canceling flights, flooding subways, and forcing residents to evacuate—yet a single cat calmly guards the bakery.";
    
    // Test portrait
    console.log('[CANVAS] Testing portrait (1080x1920)...');
    const portraitBlob = await renderCaptionPNG(torturePrompt, 1080, 1920);
    console.log(`[CANVAS] ✓ Portrait test successful: ${Math.round(portraitBlob.size / 1024)}KB`);
    
    // Test landscape
    console.log('[CANVAS] Testing landscape (1920x1080)...');
    const landscapeBlob = await renderCaptionPNG(torturePrompt, 1920, 1080);
    console.log(`[CANVAS] ✓ Landscape test successful: ${Math.round(landscapeBlob.size / 1024)}KB`);
    
    // Test with explicit newlines
    const newlineTest = "First line\nSecond line\nThird line";
    const newlineBlob = await renderCaptionPNG(newlineTest, 1920, 1080);
    console.log(`[CANVAS] ✓ Newline test successful: ${Math.round(newlineBlob.size / 1024)}KB`);
    
    console.log('[CANVAS] ✅ All caption tests passed!');
    
  } catch (error) {
    console.error('[CANVAS] ✗ Test failed:', error);
    throw error;
  }
}