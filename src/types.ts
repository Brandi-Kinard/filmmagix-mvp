export interface Shot {
  id: string;
  description: string;
  narration: string;
  imageUrl?: string;
  videoUrl?: string;
  duration: number;
}

export interface Storyboard {
  id: string;
  title: string;
  shots: Shot[];
  style: VideoStyle;
  createdAt: Date;
}

export interface Film {
  id: string;
  title: string;
  storyboard: Storyboard;
  videoUrl?: string;
  status: 'idle' | 'generating' | 'complete' | 'error';
  progress: number;
  createdAt: Date;
}

export type VideoStyle = 'cinematic' | 'anime' | 'documentary' | 'noir' | 'retro' | 'minimalist';
export type VideoDuration = 15 | 30 | 60;

export interface GenerationConfig {
  prompt: string;
  style: VideoStyle;
  duration: VideoDuration;
  narrationVoice: 'male' | 'female' | 'neutral';
}