// Image processing utilities for user uploads
// Handles downscaling, EXIF orientation, and format conversion

/**
 * Validate uploaded image file
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Only JPG, PNG, and WebP files are supported' };
  }
  
  // Check file size (max 10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File size must be under 10MB' };
  }
  
  return { valid: true };
}

/**
 * Get EXIF orientation from image
 */
async function getExifOrientation(file: File): Promise<number> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const dataView = new DataView(arrayBuffer);
      
      // Check for JPEG
      if (dataView.getUint16(0, false) !== 0xFFD8) {
        resolve(1); // Not JPEG, no EXIF
        return;
      }
      
      let offset = 2;
      while (offset < dataView.byteLength) {
        if (dataView.getUint16(offset, false) === 0xFFE1) {
          // Found EXIF marker
          const exifLength = dataView.getUint16(offset + 2, false);
          const exifData = new DataView(arrayBuffer, offset + 4, exifLength - 2);
          
          // Check for "Exif" string
          if (exifData.getUint32(0, false) === 0x45786966) {
            // Parse TIFF header
            const tiffOffset = 6;
            const littleEndian = exifData.getUint16(tiffOffset, false) === 0x4949;
            const ifdOffset = exifData.getUint32(tiffOffset + 4, littleEndian);
            
            // Parse IFD
            const tagCount = exifData.getUint16(tiffOffset + ifdOffset, littleEndian);
            for (let i = 0; i < tagCount; i++) {
              const tagOffset = tiffOffset + ifdOffset + 2 + (i * 12);
              const tag = exifData.getUint16(tagOffset, littleEndian);
              
              if (tag === 0x0112) { // Orientation tag
                const orientation = exifData.getUint16(tagOffset + 8, littleEndian);
                resolve(orientation);
                return;
              }
            }
          }
          break;
        }
        offset += 2;
      }
      
      resolve(1); // Default orientation
    };
    
    // Read first 64KB (should contain EXIF data)
    reader.readAsArrayBuffer(file.slice(0, 65536));
  });
}

/**
 * Apply EXIF orientation to canvas context
 */
function applyOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number
): { width: number; height: number } {
  // Apply transformation based on EXIF orientation
  switch (orientation) {
    case 2: // Flip horizontal
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3: // Rotate 180
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4: // Flip vertical
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5: // Flip horizontal and rotate 90 CW
      ctx.transform(0, 1, 1, 0, 0, 0);
      return { width: height, height: width };
    case 6: // Rotate 90 CW
      ctx.transform(0, 1, -1, 0, height, 0);
      return { width: height, height: width };
    case 7: // Flip horizontal and rotate 90 CCW
      ctx.transform(0, -1, -1, 0, height, width);
      return { width: height, height: width };
    case 8: // Rotate 90 CCW
      ctx.transform(0, -1, 1, 0, 0, width);
      return { width: height, height: width };
    default:
      break;
  }
  
  return { width, height };
}

/**
 * Downscale image to target dimensions while preserving aspect ratio
 */
export async function downscaleImage(
  file: File,
  targetWidth: number,
  targetHeight: number
): Promise<Blob> {
  return new Promise(async (resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = async () => {
      try {
        // Get EXIF orientation
        const orientation = await getExifOrientation(file);
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          throw new Error('Failed to get canvas context');
        }
        
        // Set canvas size to target dimensions
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        // Calculate scaling to cover target area (crop to fit)
        const imgAspect = img.width / img.height;
        const targetAspect = targetWidth / targetHeight;
        
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = img.width;
        let sourceHeight = img.height;
        
        if (imgAspect > targetAspect) {
          // Image is wider, crop horizontally
          sourceWidth = img.height * targetAspect;
          sourceX = (img.width - sourceWidth) / 2;
        } else {
          // Image is taller, crop vertically
          sourceHeight = img.width / targetAspect;
          sourceY = (img.height - sourceHeight) / 2;
        }
        
        // Apply EXIF orientation
        ctx.save();
        const rotated = applyOrientation(ctx, orientation, targetWidth, targetHeight);
        
        // Adjust canvas if image was rotated
        if (rotated.width !== targetWidth) {
          canvas.width = rotated.width;
          canvas.height = rotated.height;
        }
        
        // Draw scaled image
        ctx.drawImage(
          img,
          sourceX, sourceY, sourceWidth, sourceHeight,
          0, 0, canvas.width, canvas.height
        );
        
        ctx.restore();
        
        // Convert to JPEG blob with good quality
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`[IMAGE] Downscaled from ${img.width}x${img.height} to ${targetWidth}x${targetHeight}: ${Math.round(blob.size / 1024)}KB`);
              resolve(blob);
            } else {
              reject(new Error('Failed to create image blob'));
            }
          },
          'image/jpeg',
          0.9
        );
        
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Convert blob to base64 for storage
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert base64 to blob
 */
export function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }
  
  return new Blob([u8arr], { type: mime });
}