import { GenerationConfig, Shot, Storyboard } from '../types';

export class AIService {
  private apiKey: string = '';
  
  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY || '';
  }
  
  async generateStoryboard(config: GenerationConfig): Promise<Storyboard> {
    const shotCount = Math.ceil(config.duration / 5);
    
    const systemPrompt = `You are a creative director. Generate a ${shotCount}-shot storyboard for a ${config.duration}-second ${config.style} film based on the user's prompt. Each shot should be 5 seconds long. Return a JSON array of shots with 'description' and 'narration' fields.`;
    
    try {
      if (this.apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: config.prompt }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8,
            max_tokens: 1000
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          const result = JSON.parse(data.choices[0].message.content);
          
          const shots: Shot[] = result.shots.map((shot: any, index: number) => ({
            id: `shot-${index + 1}`,
            description: shot.description,
            narration: shot.narration,
            duration: 5
          }));
          
          return {
            id: Date.now().toString(),
            title: config.prompt.slice(0, 50),
            shots,
            style: config.style,
            createdAt: new Date()
          };
        }
      }
      
      return this.generateMockStoryboard(config);
      
    } catch (error) {
      console.error('AI generation failed, using mock data:', error);
      return this.generateMockStoryboard(config);
    }
  }
  
  private generateMockStoryboard(config: GenerationConfig): Storyboard {
    const shotCount = Math.ceil(config.duration / 5);
    const mockTemplates = [
      {
        description: 'Establishing wide shot of the scene',
        narration: 'Our story begins in a place of wonder...'
      },
      {
        description: 'Close-up of the main character',
        narration: 'A moment of realization dawns...'
      },
      {
        description: 'Dynamic action sequence',
        narration: 'Everything changes in an instant...'
      },
      {
        description: 'Emotional character moment',
        narration: 'The truth becomes clear...'
      },
      {
        description: 'Climactic revelation',
        narration: 'And so the journey transforms...'
      },
      {
        description: 'Final resolution shot',
        narration: 'A new chapter begins...'
      }
    ];
    
    const shots: Shot[] = [];
    for (let i = 0; i < shotCount; i++) {
      const template = mockTemplates[i % mockTemplates.length];
      shots.push({
        id: `shot-${i + 1}`,
        description: `${template.description} (${config.style} style)`,
        narration: template.narration,
        duration: 5
      });
    }
    
    return {
      id: Date.now().toString(),
      title: config.prompt.slice(0, 50),
      shots,
      style: config.style,
      createdAt: new Date()
    };
  }
  
  async generateImage(prompt: string, style: string): Promise<string> {
    const enhancedPrompt = `${prompt}, ${style} style, cinematic lighting, high quality`;
    
    try {
      if (this.apiKey) {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: 'dall-e-2',
            prompt: enhancedPrompt,
            n: 1,
            size: '512x512'
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          return data.data[0].url;
        }
      }
      
      return `https://via.placeholder.com/512x512/333/fff?text=${encodeURIComponent(prompt.slice(0, 20))}`;
      
    } catch (error) {
      console.error('Image generation failed:', error);
      return `https://via.placeholder.com/512x512/333/fff?text=${encodeURIComponent(prompt.slice(0, 20))}`;
    }
  }
  
  async generateNarration(text: string, voice: 'male' | 'female' | 'neutral'): Promise<string> {
    console.log(`Generating narration for: "${text}" with ${voice} voice`);
    return 'mock-audio-url';
  }
  
  async assembleVideo(shots: Shot[], audioUrls: string[]): Promise<string> {
    console.log('Assembling video from shots:', shots.length);
    return 'mock-video-url';
  }
}

export const aiService = new AIService();