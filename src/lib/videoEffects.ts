// Video effects for Ken Burns and tinting

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

/**
 * Generate FFmpeg Ken Burns effect filter with improved zoompan and clamping
 */
export function createKenBurnsFilter(params: KenBurnsParams, frameRate = 30, imageAspectRatio?: number): string {
  const { zoomDirection, panDirection, duration } = params;
  const totalFrames = Math.round(duration * frameRate);
  const targetAspectRatio = 1920 / 1080; // 16:9
  
  // GUARD-RAIL: Clamp zoom to prevent faces/text from drifting off-frame
  let zoomStart = 1.0;
  let zoomEnd = 1.12; // Reduced from 1.15 for safer framing
  
  if (zoomDirection === 'out') {
    zoomStart = 1.12;
    zoomEnd = 1.0;
  }
  
  // GUARD-RAIL: Adjust pan amount based on image aspect ratio to prevent off-frame drift
  let panAmount = 0.08; // Reduced from 0.1 for safer margins
  
  if (imageAspectRatio) {
    const aspectDifference = Math.abs(imageAspectRatio - targetAspectRatio);
    
    // For extreme aspect ratios, reduce pan amount significantly
    if (aspectDifference > 0.5) {
      panAmount = 0.04; // Very conservative for extreme ratios
      console.log(`[KEN BURNS] GUARD-RAIL: Extreme aspect ratio ${imageAspectRatio.toFixed(2)}, reduced pan to ${panAmount}`);
    } else if (aspectDifference > 0.2) {
      panAmount = 0.06; // Moderate reduction for moderate differences
      console.log(`[KEN BURNS] GUARD-RAIL: Moderate aspect ratio difference, reduced pan to ${panAmount}`);
    }
  }
  
  // Improved pan expressions with clamping to keep content in frame
  let xExpression = 'iw/2-(iw/zoom/2)'; // Default center
  let yExpression = 'ih/2-(ih/zoom/2)'; // Default center
  
  // Calculate safe pan bounds to prevent content from going off-frame
  const safeMargin = 0.05; // 5% margin from edges
  
  switch (panDirection) {
    case 'left-right':
      // Clamped left to right pan with safe margins
      xExpression = `max(iw*${safeMargin}, min(iw*(1-${safeMargin})-iw/zoom, iw*${panAmount}+(iw*(1-2*${panAmount}))*(on-1)/${totalFrames}))`;
      break;
    case 'right-left':
      // Clamped right to left pan with safe margins
      xExpression = `max(iw*${safeMargin}, min(iw*(1-${safeMargin})-iw/zoom, iw*(1-${panAmount})-(iw*(1-2*${panAmount}))*(on-1)/${totalFrames}))`;
      break;
    case 'top-bottom':
      // Clamped top to bottom pan with safe margins
      yExpression = `max(ih*${safeMargin}, min(ih*(1-${safeMargin})-ih/zoom, ih*${panAmount}+(ih*(1-2*${panAmount}))*(on-1)/${totalFrames}))`;
      break;
    case 'bottom-top':
      // Clamped bottom to top pan with safe margins
      yExpression = `max(ih*${safeMargin}, min(ih*(1-${safeMargin})-ih/zoom, ih*(1-${panAmount})-(ih*(1-2*${panAmount}))*(on-1)/${totalFrames}))`;
      break;
  }
  
  // Create the zoompan filter with clamping
  const filter = `zoompan=z='${zoomStart}+(${zoomEnd}-${zoomStart})*(on-1)/${totalFrames}':x='${xExpression}':y='${yExpression}':d=${totalFrames}:s=1920x1080`;
  
  console.log(`[KEN BURNS] ${zoomDirection} zoom, ${panDirection} pan, ${duration}s (${totalFrames} frames)`);
  console.log(`[KEN BURNS] GUARD-RAIL: Pan amount ${panAmount}, zoom range ${zoomStart}-${zoomEnd}`);
  console.log(`[KEN BURNS] Filter: ${filter}`);
  
  return filter;
}

/**
 * GUARD-RAIL: Handle extreme aspect ratios with pillarbox/letterbox and blurred edge extend
 */
export function createAspectRatioHandler(imageAspectRatio: number, targetWidth = 1920, targetHeight = 1080): string {
  const targetAspectRatio = targetWidth / targetHeight;
  const aspectDifference = Math.abs(imageAspectRatio - targetAspectRatio);
  
  // If aspect ratio is close enough, just scale normally
  if (aspectDifference <= 0.2) {
    return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;
  }
  
  console.log(`[ASPECT] GUARD-RAIL: Extreme aspect ratio ${imageAspectRatio.toFixed(2)} vs target ${targetAspectRatio.toFixed(2)}`);
  
  if (imageAspectRatio > targetAspectRatio) {
    // Image is wider - add letterbox (black bars top/bottom) with blurred background
    console.log(`[ASPECT] GUARD-RAIL: Applying letterbox with blurred background for wide image`);
    return [
      // Create blurred background
      `split=2[bg][fg]`,
      // Background: scale to fill, blur heavily
      `[bg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},gblur=15[blurred_bg]`,
      // Foreground: scale to fit with aspect ratio preserved
      `[fg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fitted]`,
      // Overlay fitted image on blurred background
      `[blurred_bg][fitted]overlay=(W-w)/2:(H-h)/2`
    ].join(';');
  } else {
    // Image is taller - add pillarbox (black bars left/right) with blurred background
    console.log(`[ASPECT] GUARD-RAIL: Applying pillarbox with blurred background for tall image`);
    return [
      // Create blurred background
      `split=2[bg][fg]`,
      // Background: scale to fill, blur heavily
      `[bg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},gblur=15[blurred_bg]`,
      // Foreground: scale to fit with aspect ratio preserved
      `[fg]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease[fitted]`,
      // Overlay fitted image on blurred background
      `[blurred_bg][fitted]overlay=(W-w)/2:(H-h)/2`
    ].join(';');
  }
}

/**
 * Generate FFmpeg color tint overlay filter
 */
export function createTintFilter(tintConfig: TintConfig, duration: number): string {
  const { color } = tintConfig;
  
  // Parse rgba color
  const rgbaMatch = color.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/);
  if (!rgbaMatch) {
    console.warn(`[TINT] Invalid color format: ${color}, using neutral`);
    return 'format=yuv420p'; // No tint
  }
  
  const [, r, g, b, a] = rgbaMatch;
  const hexColor = `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
  const opacity = parseFloat(a);
  
  // Create color overlay filter
  const colorFilter = `color=c=${hexColor}:s=1920x1080:d=${duration}:r=30,format=rgba,colorchannelmixer=aa=${opacity}`;
  
  console.log(`[TINT] Applying ${tintConfig.theme} tint: ${color} (${opacity} opacity)`);
  
  return colorFilter;
}

/**
 * Create complete video filter chain with Ken Burns + Tint + Text
 */
export function createCompleteFilter(
  kenBurnsParams: KenBurnsParams,
  tintConfig: TintConfig,
  textFilter: string,
  inputIndex = 0
): string {
  const filterParts: string[] = [];
  
  // Start with input image scaled and with Ken Burns effect
  const kenBurnsFilter = createKenBurnsFilter(kenBurnsParams);
  filterParts.push(`[${inputIndex}:v]scale=1920:1080,${kenBurnsFilter}[ken_burns]`);
  
  // Create tint overlay
  const rgbaMatch = tintConfig.color.match(/rgba\((\d+),(\d+),(\d+),([0-9.]+)\)/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const hexColor = `#${parseInt(r).toString(16).padStart(2, '0')}${parseInt(g).toString(16).padStart(2, '0')}${parseInt(b).toString(16).padStart(2, '0')}`;
    const opacity = parseFloat(a);
    
    // Create tint layer
    filterParts.push(`color=c=${hexColor}:s=1920x1080:d=${kenBurnsParams.duration}:r=30[tint_color]`);
    filterParts.push(`[tint_color]format=rgba,colorchannelmixer=aa=${opacity}[tint]`);
    filterParts.push(`[ken_burns][tint]overlay=0:0[tinted]`);
    
    // Add text overlay on top
    filterParts.push(`[tinted]${textFilter}`);
  } else {
    // No tint, just add text to Ken Burns output
    filterParts.push(`[ken_burns]${textFilter}`);
  }
  
  const fullFilter = filterParts.join(';');
  console.log(`[FILTER] Complete filter chain: ${fullFilter}`);
  
  return fullFilter;
}

/**
 * Create simplified filter for testing (Ken Burns + Text only)
 */
export function createSimplifiedFilter(
  kenBurnsParams: KenBurnsParams,
  textFilter: string
): string {
  const kenBurnsFilter = createKenBurnsFilter(kenBurnsParams);
  return `scale=1920:1080,${kenBurnsFilter},${textFilter}`;
}

/**
 * Generate simple color background as fallback
 */
export function createColorBackground(color: string, duration: number): string {
  return `color=c=${color}:s=1920x1080:d=${duration}:r=30`;
}

/**
 * Create text overlay filter with improved positioning and wrapping
 */
export function createTextOverlayFilter(
  text: string,
  fontSize: number,
  fontFile = '/data/font.ttf',
  aspectRatio: 'portrait' | 'landscape' = 'portrait'
): string {
  // Escape single quotes in text for FFmpeg
  const escapedText = text.replace(/'/g, "'\\''");
  
  // Calculate positioning based on aspect ratio
  const isPortrait = aspectRatio === 'portrait';
  const width = isPortrait ? 1080 : 1920;
  const height = isPortrait ? 1920 : 1080;
  
  // Top positioning (15% from top as requested)
  const yPosition = Math.round(height * 0.15);
  
  // Safe margins (7.5% padding left/right)
  const marginPercent = 0.075;
  const textWidth = Math.round(width * (1 - 2 * marginPercent));
  
  return [
    `drawtext=fontfile=${fontFile}`,
    `text='${escapedText}'`,
    `fontcolor=white`,
    `fontsize=${fontSize}`,
    `line_spacing=10`,
    `x=(w-text_w)/2`, // Center horizontally
    `y=${yPosition}`, // 15% from top
    `borderw=3`,
    `bordercolor=black@0.9`,
    `box=1`,
    `boxcolor=black@0.5`,
    `boxborderw=16`,
    `boxborder_w=8`
  ].join(':');
}

/**
 * Wrap text to fit within specified character width
 */
function wrapText(text: string, maxCharsPerLine: number): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    // Check if adding this word would exceed the line length
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      // Start a new line
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  
  // Add the last line
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.join('\n'); // Use actual newlines for FFmpeg
}

/**
 * Create improved text overlay with proper wrapping and auto-sizing
 */
export function createImprovedTextOverlay(
  text: string,
  maxWidth: number,
  maxHeight: number,
  fontFile = '/data/font.ttf'
): string {
  // Calculate appropriate font size and max characters per line
  const textLength = text.length;
  let fontSize = 40;
  let maxCharsPerLine = 25; // Much more conservative for 1920px width
  
  if (textLength > 100) {
    fontSize = 32;
    maxCharsPerLine = 30;
  } else if (textLength > 60) {
    fontSize = 36;
    maxCharsPerLine = 28;
  } else if (textLength < 30) {
    fontSize = 44;
    maxCharsPerLine = 22;
  }
  
  // Wrap text to prevent stretching beyond video width
  const wrappedText = wrapText(text, maxCharsPerLine);
  
  // Use simple text replacement to avoid complex escaping
  const escapedText = wrappedText
    .replace(/['"]/g, '')      // Remove quotes entirely
    .replace(/:/g, ' - ')      // Replace colons with dashes
    .replace(/[\\]/g, '');     // Remove backslashes
  
  console.log(`[TEXT] Original: "${text}"`);
  console.log(`[TEXT] Wrapped: "${wrappedText}"`);
  console.log(`[TEXT] Font size: ${fontSize}px, Max chars: ${maxCharsPerLine}`);
  
  // Create text overlay - try to avoid font issues entirely
  const fontParam = fontFile === 'system' ? 
    '' : // Skip font specification to use FFmpeg default
    `fontfile=${fontFile}`; // Use custom font file
  
  const fontPart = fontParam ? `:${fontParam}` : '';
  
  const drawTextParts = [
    'drawtext',
    `text='${escapedText}'`,
    `fontcolor=white`,
    `fontsize=${fontSize}`,
    `x=(w-text_w)/2`, // Center horizontally
    `y=${Math.round(maxHeight * 0.15)}`, // 15% from top
    `line_spacing=10`,
    `borderw=2`,
    `bordercolor=black@0.8`,
    `box=1`,
    `boxcolor=black@0.4`,
    `boxborderw=12`
  ];
  
  // Add font parameter if specified
  if (fontParam) {
    drawTextParts.push(fontParam);
  }
  
  return drawTextParts.join(':');
}