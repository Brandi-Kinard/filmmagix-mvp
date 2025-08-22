/**
 * Cinematic gradient generator with guaranteed variety per scene
 */

export interface GradientResult {
  color1: string; // hex format
  color2: string; // hex format
  angle: number;  // degrees
  cssGradient: string; // full CSS gradient
}

/**
 * Stable hash function for deterministic gradient generation
 */
function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };

  let r, g, b;
  if (sNorm === 0) {
    r = g = b = lNorm; // achromatic
  } else {
    const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
    const p = 2 * lNorm - q;
    r = hue2rgb(p, q, hNorm + 1/3);
    g = hue2rgb(p, q, hNorm);
    b = hue2rgb(p, q, hNorm - 1/3);
  }

  const toHex = (c: number): string => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate cinematic gradient with guaranteed variety
 */
export function generateCinematicGradient(
  sceneText: string, 
  sceneIndex: number,
  projectId: string = '',
  previousGradients: GradientResult[] = []
): GradientResult {
  console.log(`[GRADIENT] Generating for scene ${sceneIndex}: "${sceneText}"`);
  
  // Create stable hash from scene content
  const hashInput = `${projectId}-${sceneIndex}-${sceneText}`;
  const baseHash = stableHash(hashInput);
  
  // Define 3 cinematic palettes that work well with white text
  const paletteTemplates = [
    { name: 'Warm Sunset', baseHue: 25, satRange: [40, 60], lightRange: [20, 40] },
    { name: 'Cool Twilight', baseHue: 220, satRange: [45, 65], lightRange: [15, 35] },
    { name: 'Forest Mystery', baseHue: 140, satRange: [35, 55], lightRange: [18, 38] }
  ];
  
  // Pick palette based on scene index for variety
  const paletteIndex = sceneIndex % paletteTemplates.length;
  const palette = paletteTemplates[paletteIndex];
  
  // Generate base hue with some variation from scene content
  const hueVariation = (baseHash % 60) - 30; // ±30 degrees
  const hue1 = (palette.baseHue + hueVariation + 360) % 360;
  
  // Second hue with good contrast
  const hue2 = (hue1 + 45 + (baseHash % 90)) % 360; // 45-135 degrees apart
  
  // Generate saturation and lightness
  const sat1 = palette.satRange[0] + (baseHash % (palette.satRange[1] - palette.satRange[0]));
  const sat2 = palette.satRange[0] + ((baseHash >> 8) % (palette.satRange[1] - palette.satRange[0]));
  
  const light1 = palette.lightRange[0] + ((baseHash >> 16) % (palette.lightRange[1] - palette.lightRange[0]));
  const light2 = palette.lightRange[0] + ((baseHash >> 24) % (palette.lightRange[1] - palette.lightRange[0]));
  
  // Convert to hex
  let color1 = hslToHex(hue1, sat1, light1);
  let color2 = hslToHex(hue2, sat2, light2);
  
  // Check for consecutive identical gradients and fix them
  if (previousGradients.length > 0) {
    const lastGradient = previousGradients[previousGradients.length - 1];
    if (lastGradient.color1 === color1 && lastGradient.color2 === color2) {
      console.log(`[GRADIENT] Identical to previous, applying rotation`);
      // Apply small hue rotation to break the tie
      const rotatedHue1 = (hue1 + 15) % 360;
      const rotatedHue2 = (hue2 + 15) % 360;
      color1 = hslToHex(rotatedHue1, sat1, light1);
      color2 = hslToHex(rotatedHue2, sat2, light2);
    }
  }
  
  // Generate angle (cinematic angles: mostly diagonal)
  const angles = [135, 225, 45, 315, 180, 90]; // Prefer diagonals
  const angle = angles[baseHash % angles.length];
  
  const cssGradient = `linear-gradient(${angle}deg, ${color1}, ${color2})`;
  
  const result: GradientResult = {
    color1,
    color2,
    angle,
    cssGradient
  };
  
  console.log(`[GRADIENT] Scene ${sceneIndex} (${palette.name}): ${color1} → ${color2} @ ${angle}°`);
  
  return result;
}

/**
 * Generate gradient as canvas blob for FFmpeg
 */
export async function generateGradientBlob(
  gradient: GradientResult,
  width: number = 1920,
  height: number = 1080
): Promise<Blob> {
  console.log(`[GRADIENT] Creating ${width}x${height} canvas with ${gradient.color1} → ${gradient.color2}`);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // Calculate gradient angle in radians
  const angleRad = (gradient.angle * Math.PI) / 180;
  
  // Calculate gradient start and end points
  const centerX = width / 2;
  const centerY = height / 2;
  const diagonal = Math.sqrt(width * width + height * height) / 2;
  
  const startX = centerX - Math.cos(angleRad) * diagonal;
  const startY = centerY - Math.sin(angleRad) * diagonal;
  const endX = centerX + Math.cos(angleRad) * diagonal;
  const endY = centerY + Math.sin(angleRad) * diagonal;
  
  // Create linear gradient
  const linearGradient = ctx.createLinearGradient(startX, startY, endX, endY);
  linearGradient.addColorStop(0, gradient.color1);
  linearGradient.addColorStop(1, gradient.color2);
  
  // Fill canvas
  ctx.fillStyle = linearGradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add subtle vignette for cinematic look
  const vignette = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, Math.max(width, height) * 0.7
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
  
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  
  // Convert to blob
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const result = blob || new Blob();
      console.log(`[GRADIENT] Canvas blob created: ${Math.round(result.size / 1024)}KB`);
      resolve(result);
    }, 'image/png');
  });
}