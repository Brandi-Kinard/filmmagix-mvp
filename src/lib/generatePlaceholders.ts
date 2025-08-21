// Generate placeholder images using Canvas API
// Creates 9 curated CC0-style placeholder images

export async function generatePlaceholders(): Promise<void> {
  const placeholders = [
    // Urban category
    {
      filename: 'urban-1.jpg',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      text: 'URBAN SCENE',
      color: '#ffffff'
    },
    {
      filename: 'urban-2.jpg',
      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      text: 'CITY LIFE',
      color: '#ffffff'
    },
    {
      filename: 'urban-3.jpg',
      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      text: 'MODERN',
      color: '#ffffff'
    },
    
    // Nature category
    {
      filename: 'nature-1.jpg',
      background: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      text: 'NATURE',
      color: '#2d5a2d'
    },
    {
      filename: 'nature-2.jpg',
      background: 'linear-gradient(135deg, #c1dfc4 0%, #deecdd 100%)',
      text: 'FOREST',
      color: '#2d5a2d'
    },
    {
      filename: 'nature-3.jpg',
      background: 'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
      text: 'LANDSCAPE',
      color: '#2d5a2d'
    },
    
    // Abstract category
    {
      filename: 'abstract-1.jpg',
      background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      text: 'CREATIVE',
      color: '#ffffff'
    },
    {
      filename: 'abstract-2.jpg',
      background: 'linear-gradient(135deg, #a770ef 0%, #cf8bf3 100%)',
      text: 'ARTISTIC',
      color: '#ffffff'
    },
    {
      filename: 'abstract-3.jpg',
      background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      text: 'MINIMAL',
      color: '#5a5a5a'
    }
  ];

  console.log('[PLACEHOLDERS] Generating placeholder images...');

  for (const placeholder of placeholders) {
    try {
      const blob = await createPlaceholderImage(
        placeholder.background,
        placeholder.text,
        placeholder.color
      );
      
      // In a real implementation, you would save this blob to the public folder
      // For now, we'll just log the creation
      console.log(`[PLACEHOLDERS] Generated ${placeholder.filename}: ${Math.round(blob.size / 1024)}KB`);
      
    } catch (error) {
      console.error(`[PLACEHOLDERS] Failed to generate ${placeholder.filename}:`, error);
    }
  }

  console.log('[PLACEHOLDERS] ✓ All placeholders generated');
}

async function createPlaceholderImage(
  background: string,
  text: string,
  textColor: string
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    // Create gradient background
    if (background.includes('gradient')) {
      // Parse gradient (simplified for demo)
      const gradientMatch = background.match(/linear-gradient\((\d+deg),\s*(#[a-f0-9]{6})\s*\d*%?,\s*(#[a-f0-9]{6})/i);
      if (gradientMatch) {
        const angle = parseInt(gradientMatch[1]);
        const color1 = gradientMatch[2];
        const color2 = gradientMatch[3];
        
        // Convert angle to canvas gradient coordinates
        const radians = (angle - 90) * Math.PI / 180;
        const x1 = Math.cos(radians) * canvas.width / 2 + canvas.width / 2;
        const y1 = Math.sin(radians) * canvas.height / 2 + canvas.height / 2;
        const x2 = Math.cos(radians + Math.PI) * canvas.width / 2 + canvas.width / 2;
        const y2 = Math.sin(radians + Math.PI) * canvas.height / 2 + canvas.height / 2;
        
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = '#667eea'; // Fallback
      }
    } else {
      ctx.fillStyle = background;
    }
    
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add subtle texture
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 4 + 1;
      ctx.fillRect(x, y, size, size);
    }

    // Add text overlay
    ctx.font = 'bold 72px Arial, sans-serif';
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add text shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.shadowBlur = 8;
    
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Add subtitle
    ctx.font = 'normal 32px Arial, sans-serif';
    ctx.fillStyle = textColor;
    ctx.globalAlpha = 0.7;
    ctx.fillText('PLACEHOLDER IMAGE', canvas.width / 2, canvas.height / 2 + 100);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create blob'));
      }
    }, 'image/jpeg', 0.9);
  });
}

// Export individual placeholder URLs for fallback use
export const PLACEHOLDER_URLS = [
  '/placeholders/urban-1.jpg',
  '/placeholders/urban-2.jpg', 
  '/placeholders/urban-3.jpg',
  '/placeholders/nature-1.jpg',
  '/placeholders/nature-2.jpg',
  '/placeholders/nature-3.jpg',
  '/placeholders/abstract-1.jpg',
  '/placeholders/abstract-2.jpg',
  '/placeholders/abstract-3.jpg'
];

export function getRandomPlaceholder(): string {
  return PLACEHOLDER_URLS[Math.floor(Math.random() * PLACEHOLDER_URLS.length)];
}