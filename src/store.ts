import { create } from 'zustand';
import type { Film, GenerationConfig } from './types';
import { aiService } from './services/ai';

interface AppState {
  films: Film[];
  currentFilm: Film | null;
  generationConfig: GenerationConfig;
  isGenerating: boolean;
  generationStep: string;
  
  setGenerationConfig: (config: Partial<GenerationConfig>) => void;
  startGeneration: () => Promise<void>;
  updateProgress: (progress: number, step: string) => void;
  saveFilm: (film: Film) => void;
  loadFilms: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  films: [],
  currentFilm: null,
  generationConfig: {
    prompt: '',
    style: 'cinematic',
    duration: 30,
    narrationVoice: 'neutral',
  },
  isGenerating: false,
  generationStep: '',
  
  setGenerationConfig: (config) => {
    set((state) => ({
      generationConfig: { ...state.generationConfig, ...config },
    }));
  },
  
  startGeneration: async () => {
    const { generationConfig } = get();
    if (!generationConfig.prompt) return;
    
    set({ isGenerating: true, generationStep: 'Initializing...' });
    
    const newFilm: Film = {
      id: Date.now().toString(),
      title: generationConfig.prompt.slice(0, 50),
      storyboard: {
        id: Date.now().toString(),
        title: generationConfig.prompt.slice(0, 50),
        shots: [],
        style: generationConfig.style,
        createdAt: new Date(),
      },
      status: 'generating',
      progress: 0,
      createdAt: new Date(),
    };
    
    set({ currentFilm: newFilm });
    
    try {
      set({ generationStep: 'Creating storyboard...', currentFilm: { ...newFilm, progress: 20 } });
      
      const storyboard = await aiService.generateStoryboard(generationConfig);
      newFilm.storyboard = storyboard;
      
      set({ currentFilm: { ...newFilm, progress: 40 }, generationStep: 'Generating visuals...' });
      
      for (let i = 0; i < storyboard.shots.length; i++) {
        const shot = storyboard.shots[i];
        shot.imageUrl = await aiService.generateImage(shot.description, generationConfig.style);
        set({ 
          currentFilm: { 
            ...newFilm, 
            progress: 40 + (20 * (i + 1) / storyboard.shots.length) 
          } 
        });
      }
      
      set({ currentFilm: { ...newFilm, progress: 60 }, generationStep: 'Creating narration...' });
      
      const audioUrls: string[] = [];
      for (const shot of storyboard.shots) {
        const audioUrl = await aiService.generateNarration(shot.narration, generationConfig.narrationVoice);
        audioUrls.push(audioUrl);
      }
      
      set({ currentFilm: { ...newFilm, progress: 80 }, generationStep: 'Assembling video...' });
      
      const videoUrl = await aiService.assembleVideo(storyboard.shots, audioUrls);
      
      newFilm.status = 'complete';
      newFilm.progress = 100;
      newFilm.videoUrl = videoUrl;
      
      set({ 
        currentFilm: newFilm,
        isGenerating: false,
        generationStep: 'Complete!',
        films: [...get().films, newFilm],
      });
      
      localStorage.setItem('films', JSON.stringify([...get().films, newFilm]));
      
    } catch (error) {
      set({ 
        isGenerating: false,
        generationStep: 'Error occurred',
        currentFilm: { ...newFilm, status: 'error' },
      });
    }
  },
  
  updateProgress: (progress, step) => {
    set((state) => ({
      generationStep: step,
      currentFilm: state.currentFilm 
        ? { ...state.currentFilm, progress }
        : null,
    }));
  },
  
  saveFilm: (film) => {
    set((state) => {
      const updatedFilms = [...state.films, film];
      localStorage.setItem('films', JSON.stringify(updatedFilms));
      return { films: updatedFilms };
    });
  },
  
  loadFilms: () => {
    const storedFilms = localStorage.getItem('films');
    if (storedFilms) {
      set({ films: JSON.parse(storedFilms) });
    }
  },
}));