// Project persistence for FilmMagix MVP - client-side only

import type { Scene } from './ffmpegOrchestrator';
import type { AudioConfig } from './audioSystem';

export interface ProjectData {
  version: string;
  timestamp: number;
  prompt: string;
  scenes: ProjectScene[];
  enableAI: boolean;
  audioConfig: AudioConfigMetadata;
}

export interface ProjectScene {
  text: string;
  keywords: string[];
  durationSec: number;
  kind: "hook" | "beat" | "cta";
  background: {
    mode: 'upload' | 'ai' | 'gradient';
    uploadedFileName?: string; // Store filename only, not blob
  };
}

export interface AudioConfigMetadata {
  backgroundTrack: string;
  musicVolume: number;
  whooshTransitions: boolean;
  includeNarration: boolean;
  narrationFileName?: string; // Store filename only, not file
}

const PROJECT_VERSION = "1.0.0";
const AUTOSAVE_KEY = "filmmagix_autosave";
const DEBOUNCE_DELAY = 2000; // 2 seconds

let debounceTimer: NodeJS.Timeout | null = null;

/**
 * Convert app state to persistable project data
 */
export function createProjectData(
  prompt: string,
  scenes: Scene[],
  enableAI: boolean,
  audioConfig: AudioConfig,
  sceneImages: {[sceneId: string]: string}
): ProjectData {
  const projectScenes: ProjectScene[] = scenes.map((scene, i) => {
    const sceneId = `scene-${i}`;
    const hasUploadedImage = sceneImages[sceneId];
    
    return {
      text: scene.text,
      keywords: scene.keywords,
      durationSec: scene.durationSec,
      kind: scene.kind,
      background: {
        mode: scene.background.mode,
        uploadedFileName: hasUploadedImage ? `scene-${i}-custom.jpg` : undefined
      }
    };
  });

  const audioMetadata: AudioConfigMetadata = {
    backgroundTrack: audioConfig.backgroundTrack,
    musicVolume: audioConfig.musicVolume,
    whooshTransitions: audioConfig.whooshTransitions,
    includeNarration: audioConfig.includeNarration,
    narrationFileName: audioConfig.narrationFile?.name
  };

  return {
    version: PROJECT_VERSION,
    timestamp: Date.now(),
    prompt,
    scenes: projectScenes,
    enableAI,
    audioConfig: audioMetadata
  };
}

/**
 * Auto-save project data with debouncing
 */
export function autoSaveProject(
  prompt: string,
  scenes: Scene[],
  enableAI: boolean,
  audioConfig: AudioConfig,
  sceneImages: {[sceneId: string]: string}
): void {
  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new debounced save
  debounceTimer = setTimeout(() => {
    try {
      const projectData = createProjectData(prompt, scenes, enableAI, audioConfig, sceneImages);
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(projectData));
      console.log(`[AUTOSAVE] Project saved at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      console.warn('[AUTOSAVE] Failed to save project:', error);
    }
  }, DEBOUNCE_DELAY);
}

/**
 * Load autosaved project data
 */
export function loadAutosavedProject(): ProjectData | null {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (!saved) return null;

    const projectData = JSON.parse(saved) as ProjectData;
    
    // Validate project version compatibility
    if (projectData.version !== PROJECT_VERSION) {
      console.warn(`[AUTOSAVE] Version mismatch: saved ${projectData.version}, current ${PROJECT_VERSION}`);
      return null;
    }

    return projectData;
  } catch (error) {
    console.warn('[AUTOSAVE] Failed to load autosaved project:', error);
    return null;
  }
}

/**
 * Clear autosaved project
 */
export function clearAutosave(): void {
  localStorage.removeItem(AUTOSAVE_KEY);
  console.log('[AUTOSAVE] Cleared autosaved project');
}

/**
 * Export project as downloadable .filmmagix file
 */
export function exportProject(
  prompt: string,
  scenes: Scene[],
  enableAI: boolean,
  audioConfig: AudioConfig,
  sceneImages: {[sceneId: string]: string}
): void {
  try {
    const projectData = createProjectData(prompt, scenes, enableAI, audioConfig, sceneImages);
    const jsonString = JSON.stringify(projectData, null, 2);
    
    // Create and trigger download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    link.href = url;
    link.download = `filmmagix-project-${timestamp}.filmmagix`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    console.log('[EXPORT] Project exported successfully');
  } catch (error) {
    console.error('[EXPORT] Failed to export project:', error);
    throw new Error('Failed to export project');
  }
}

/**
 * Import project from .filmmagix file
 */
export function importProject(file: File): Promise<ProjectData> {
  return new Promise((resolve, reject) => {
    // Validate file extension
    if (!file.name.endsWith('.filmmagix')) {
      reject(new Error('Invalid file type. Please select a .filmmagix file.'));
      return;
    }

    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const projectData = JSON.parse(jsonString) as ProjectData;
        
        // Validate project structure
        if (!projectData.version || !projectData.scenes || !projectData.audioConfig) {
          throw new Error('Invalid project file format');
        }
        
        // Check version compatibility
        if (projectData.version !== PROJECT_VERSION) {
          console.warn(`[IMPORT] Version mismatch: file ${projectData.version}, current ${PROJECT_VERSION}`);
          // For now, try to import anyway - could add migration logic later
        }
        
        console.log('[IMPORT] Project imported successfully');
        resolve(projectData);
      } catch (error) {
        console.error('[IMPORT] Failed to parse project file:', error);
        reject(new Error('Invalid or corrupted project file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read project file'));
    };
    
    reader.readAsText(file);
  });
}

/**
 * Convert project data back to app state
 */
export function applyProjectData(
  projectData: ProjectData
): {
  prompt: string;
  scenes: Scene[];
  enableAI: boolean;
  audioConfig: Partial<AudioConfig>;
} {
  // Convert project scenes back to app scenes
  const scenes: Scene[] = projectData.scenes.map(projectScene => ({
    text: projectScene.text,
    keywords: projectScene.keywords,
    durationSec: projectScene.durationSec,
    kind: projectScene.kind,
    background: {
      mode: projectScene.background.mode
      // Note: uploaded files will need to be re-selected by user
    }
  }));

  // Convert audio metadata back (excluding file references)
  const audioConfig: Partial<AudioConfig> = {
    backgroundTrack: projectData.audioConfig.backgroundTrack,
    musicVolume: projectData.audioConfig.musicVolume,
    whooshTransitions: projectData.audioConfig.whooshTransitions,
    includeNarration: projectData.audioConfig.includeNarration
    // Note: narration file will need to be re-selected by user
  };

  return {
    prompt: projectData.prompt,
    scenes,
    enableAI: projectData.enableAI,
    audioConfig
  };
}

/**
 * Get human-readable summary of missing assets after import
 */
export function getMissingAssetsSummary(projectData: ProjectData): string[] {
  const missing: string[] = [];
  
  // Check for uploaded scene images
  const uploadScenes = projectData.scenes.filter(s => s.background.mode === 'upload');
  if (uploadScenes.length > 0) {
    missing.push(`${uploadScenes.length} custom scene image(s) - please re-upload`);
  }
  
  // Check for narration file
  if (projectData.audioConfig.includeNarration && projectData.audioConfig.narrationFileName) {
    missing.push(`Narration file (${projectData.audioConfig.narrationFileName}) - please re-upload`);
  }
  
  return missing;
}