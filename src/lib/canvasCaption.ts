// Canvas-based caption rendering to PNG
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
 * Text wrapping configuration
 */
interface TextWrapConfig {
  maxWidth: number;
  lineHeight: number;
  fontSize: number;
  fontFamily: string;
}

/**
 * Wrap text to fit within specified width
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, config: TextWrapConfig): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  ctx.font = `${config.fontSize}px ${config.fontFamily}`;

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width <= config.maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is too long, force break
        lines.push(word);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Render caption text as PNG overlay
 */
export async function renderCaptionPNG(
  text: string,
  width: number = 1920,
  height: number = 1080
): Promise<Blob> {
  
  console.log(`[CANVAS] Rendering caption: "${text.substring(0, 50)}..."`);
  
  // Ensure font is loaded
  await loadCanvasFont();
  
  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to get canvas 2D context');
  }

  // Clear canvas (transparent background)
  ctx.clearRect(0, 0, width, height);
  
  // Text configuration with safe margins
  const safeMargin = width * 0.05; // 5% margin on each side
  const maxWidth = width - (safeMargin * 2);
  const fontSize = Math.floor(width / 34); // Responsive font size
  const lineHeight = fontSize * 1.2;
  const fontFamily = fontLoaded ? 'NotoSans, sans-serif' : 'Arial, sans-serif';
  
  const textConfig: TextWrapConfig = {
    maxWidth,
    lineHeight,
    fontSize,
    fontFamily
  };
  
  // Wrap text
  const lines = wrapText(ctx, text, textConfig);
  console.log(`[CANVAS] Text wrapped to ${lines.length} lines`);
  
  // Calculate vertical positioning (bottom third of screen)
  const totalTextHeight = lines.length * lineHeight;
  const startY = height * 0.86 - totalTextHeight; // Position from bottom
  
  // Set text style
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Render each line with background box
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const y = startY + (i * lineHeight);
    const metrics = ctx.measureText(line);
    
    // Background box with padding
    const boxPadding = 14;
    const boxX = safeMargin - boxPadding;
    const boxY = y - boxPadding;
    const boxWidth = metrics.width + (boxPadding * 2);
    const boxHeight = fontSize + (boxPadding * 2);
    
    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    
    // Text shadow for better readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText(line, safeMargin + 1, y + 1);
    
    // Main text
    ctx.fillStyle = 'white';
    ctx.fillText(line, safeMargin, y);
  }
  
  // Convert to PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        console.log(`[CANVAS] ✓ Caption PNG rendered: ${Math.round(blob.size / 1024)}KB`);
        resolve(blob);
      } else {
        reject(new Error('Failed to create PNG blob'));
      }
    }, 'image/png');
  });
}

/**
 * Test function to verify caption rendering
 */
export async function testCaptionRendering(): Promise<void> {
  try {
    console.log('[CANVAS] Testing caption rendering...');
    
    const testText = "Welcome to FilmMagix! This is a test of our new Canvas-based caption rendering system that replaces the problematic FFmpeg drawtext filter.";
    
    const pngBlob = await renderCaptionPNG(testText);
    
    console.log(`[CANVAS] ✓ Test successful: Generated ${Math.round(pngBlob.size / 1024)}KB PNG`);
    
    // Optional: Create download link for testing
    const url = URL.createObjectURL(pngBlob);
    console.log(`[CANVAS] Test PNG available at: ${url}`);
    
  } catch (error) {
    console.error('[CANVAS] ✗ Test failed:', error);
    throw error;
  }
}