import { useState, useEffect } from "react";
import { assemblePlaceholder, assembleStoryboard, assembleVisualSmokeTest, getFFmpeg, getDebugInfo, setForcePackOnly, getForcePackOnly } from "./lib/ffmpegOrchestrator";
import type { Scene } from "./lib/ffmpegOrchestrator";
import type { AspectKey } from "./lib/textLayout";
import { ASPECT_CONFIGS } from "./lib/textLayout";
import { AUDIO_TRACKS, DEFAULT_AUDIO_CONFIG, type AudioConfig, validateNarrationFile } from "./lib/audioSystem";
import { loadCanvasFont } from "./lib/canvasCaption";
import { validateImageFile, downscaleImage, blobToBase64 } from "./lib/imageProcessor";
import { storeSceneImage, getSceneImage, deleteSceneImage } from "./lib/imageStorage";
import { testImageSearch } from "./lib/imageSearch";

// Scene type is now imported from orchestrator

function buildScenes(raw: string): Scene[] {
  const clean = (raw || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 12);
  
  const scenes = sentences.map((s, i, arr) => {
    const kind: Scene["kind"] = i === 0 ? "hook" : i === arr.length - 1 ? "cta" : "beat";
    const durationSec = kind === "beat" ? 5 : 4;
    return {
      text: s,
      keywords: [],
      durationSec,
      kind,
    };
  });

  return scenes;
}

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [aspectRatio] = useState<AspectKey>('landscape'); // Fixed to landscape only
  const [exporting, setExporting] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [audioConfig, setAudioConfig] = useState<AudioConfig>(DEFAULT_AUDIO_CONFIG);
  const [fontLoaded, setFontLoaded] = useState(false);
  const [narrationError, setNarrationError] = useState<string>('');
  const [sceneImages, setSceneImages] = useState<{[sceneId: string]: string}>({});
  const [imageErrors, setImageErrors] = useState<{[sceneId: string]: string}>({});
  const [forcePackOnly, setForcePackOnlyState] = useState<boolean>(getForcePackOnly());
  // Audio permissions state - currently not used
  // const [audioPermissionsGranted] = useState(false);

  // Load FFmpeg, Canvas font, and initialize speech synthesis
  useEffect(() => {
    console.log("FilmMagix MVP starting...");
    setFfmpegError("FFmpeg: loading...");
    
    // Get debug info
    getDebugInfo().then(info => {
      setDebugInfo(info);
    });
    
    // Load Canvas font for PNG caption rendering
    loadCanvasFont()
      .then(() => {
        console.log("✓ Canvas font loaded successfully!");
        setFontLoaded(true);
      })
      .catch((error) => {
        console.warn("⚠️ Canvas font loading failed:", error);
        setFontLoaded(true); // Continue with system font fallback
      });
    
    // Load FFmpeg
    getFFmpeg()
      .then(() => {
        console.log("✓ FFmpeg loaded successfully!");
        setFfmpegReady(true);
        setFfmpegError(null);
        // Update debug info
        getDebugInfo().then(info => {
          setDebugInfo(info);
        });
      })
      .catch((error) => {
        console.error("✗ FFmpeg loading failed:", error);
        setFfmpegError(error.message);
        getDebugInfo().then(info => {
          setDebugInfo({...info, lastError: error.message});
        });
      });
  }, []);

  const handleNarrationFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setNarrationError('');
    
    if (file) {
      const validation = validateNarrationFile(file);
      if (validation.valid) {
        setAudioConfig(prev => ({ ...prev, narrationFile: file }));
      } else {
        setNarrationError(validation.error || 'Invalid file');
        event.target.value = ''; // Clear the input
      }
    } else {
      setAudioConfig(prev => ({ ...prev, narrationFile: null }));
    }
  };

  // Load existing scene images when scenes are generated
  const loadSceneImages = async (sceneList: Scene[]) => {
    const imageMap: {[sceneId: string]: string} = {};
    
    for (let i = 0; i < sceneList.length; i++) {
      const sceneId = `scene-${i}`;
      const storedImage = await getSceneImage(sceneId);
      if (storedImage) {
        imageMap[sceneId] = storedImage;
      }
    }
    
    setSceneImages(imageMap);
  };

  // Handle image upload for a scene
  const handleSceneImageUpload = async (sceneIndex: number, file: File) => {
    const sceneId = `scene-${sceneIndex}`;
    
    // Clear any previous error
    setImageErrors(prev => ({ ...prev, [sceneId]: '' }));
    
    // Validate file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setImageErrors(prev => ({ ...prev, [sceneId]: validation.error || 'Invalid file' }));
      return;
    }
    
    try {
      console.log(`[IMAGE] Processing upload for scene ${sceneIndex}: ${file.name}`);
      
      // Downscale to 1920x1080
      const downscaledBlob = await downscaleImage(file, 1920, 1080);
      
      // Convert to base64
      const base64Data = await blobToBase64(downscaledBlob);
      
      // Store in IndexedDB
      await storeSceneImage(sceneId, base64Data, {
        filename: file.name,
        size: downscaledBlob.size,
        width: 1920,
        height: 1080
      });
      
      // Update UI state
      setSceneImages(prev => ({ ...prev, [sceneId]: base64Data }));
      
      console.log(`[IMAGE] Successfully stored image for scene ${sceneIndex}`);
      
    } catch (error) {
      console.error(`[IMAGE] Failed to process image for scene ${sceneIndex}:`, error);
      setImageErrors(prev => ({ 
        ...prev, 
        [sceneId]: error instanceof Error ? error.message : 'Failed to process image' 
      }));
    }
  };

  // Remove image for a scene
  const handleRemoveSceneImage = async (sceneIndex: number) => {
    const sceneId = `scene-${sceneIndex}`;
    
    try {
      await deleteSceneImage(sceneId);
      setSceneImages(prev => {
        const newImages = { ...prev };
        delete newImages[sceneId];
        return newImages;
      });
      setImageErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[sceneId];
        return newErrors;
      });
      
      console.log(`[IMAGE] Removed image for scene ${sceneIndex}`);
    } catch (error) {
      console.error(`[IMAGE] Failed to remove image for scene ${sceneIndex}:`, error);
    }
  };

  // Handle FORCE_PACK_ONLY toggle
  const handleForcePackOnlyToggle = (enabled: boolean) => {
    setForcePackOnly(enabled);
    setForcePackOnlyState(enabled);
  };

  // Handle drag and drop
  const handleSceneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSceneDrop = async (e: React.DragEvent, sceneIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      await handleSceneImageUpload(sceneIndex, imageFile);
    }
  };

  const onGenerate = () => {
    const text = prompt.trim();
    if (!text) return;
    
    try {
      const generatedScenes = buildScenes(text);
      setScenes(generatedScenes);
      console.log("Generated scenes:", generatedScenes);
      
      // Load any existing images for these scenes
      loadSceneImages(generatedScenes);
    } catch (error) {
      console.error("Error generating scenes:", error);
    }
  };

  const onExportStoryboard = async () => {
    if (scenes.length === 0) {
      alert("Please generate some scenes first!");
      return;
    }
    
    setExporting(true);
    
    try {
      console.log(`Starting storyboard export with ${scenes.length} scenes...`);
      console.time("Storyboard Export");
      
      // Merge scene images into scenes for export
      const scenesWithImages = scenes.map((scene, i) => {
        const sceneId = `scene-${i}`;
        const userImage = sceneImages[sceneId];
        return {
          ...scene,
          userImage,
          userImageFilename: userImage ? `custom-scene-${i}.jpg` : undefined
        };
      });
      
      const videoBlob = await assembleStoryboard(scenesWithImages, { aspectRatio, audioConfig });
      
      console.timeEnd("Storyboard Export");
      
      // Download the video
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'filmmagix-storyboard.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("✓ Storyboard export completed!");
      console.log("File size:", videoBlob.size, "bytes");
      
    } catch (error) {
      console.error("Error exporting storyboard:", error);
      let errorMessage = "Failed to export storyboard. ";
      if (error instanceof Error) {
        errorMessage += error.message;
      }
      alert(errorMessage);
    } finally {
      setExporting(false);
    }
  };

  const onExportMP4 = async () => {
    setExporting(true);
    try {
      console.log("Starting MP4 export...");
      console.time("MP4 Export");
      
      const videoBlob = await assemblePlaceholder();
      
      console.timeEnd("MP4 Export");
      
      // Download the video
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'filmmagix-placeholder.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("✓ MP4 export completed!");
      console.log("File size:", videoBlob.size, "bytes");
      
    } catch (error) {
      console.error("Error exporting MP4:", error);
      
      // More specific error messages
      let errorMessage = "Failed to export MP4. ";
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage += "The process timed out. Please check your internet connection and try again.";
        } else if (error.message.includes('fetch') || error.message.includes('download')) {
          errorMessage += "Could not download FFmpeg core files. Please check your internet connection.";
        } else if (error.message.includes('CORS')) {
          errorMessage += "Browser security error. Try refreshing the page.";
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += "Unknown error occurred. Check browser console for details.";
      }
      
      alert(errorMessage);
      
    } finally {
      // Always reset the button state
      console.log("Resetting export button state");
      setExporting(false);
    }
  };

  const onRunSmokeTest = async () => {
    setExporting(true);
    try {
      console.log("🧪 Starting visual smoke test...");
      console.time("Smoke Test");
      
      const videoBlob = await assembleVisualSmokeTest();
      
      console.timeEnd("Smoke Test");
      
      // Download the smoke test video
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visual-smoke-test.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("🧪 ✓ Visual smoke test completed successfully!");
      console.log("File size:", videoBlob.size, "bytes");
      
    } catch (error) {
      console.error("🧪 ❌ Visual smoke test failed:", error);
      
      let errorMessage = "Visual smoke test failed. ";
      if (error instanceof Error) {
        errorMessage += error.message;
      }
      alert(errorMessage);
      
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>FilmMagix MVP</h1>
      
      {/* FFmpeg Status Indicator */}
      <div style={{ marginBottom: 16, padding: 8, fontSize: 14, borderRadius: 6, background: ffmpegReady ? "#e8f5e8" : ffmpegError ? "#ffe8e8" : "#fff3cd", color: ffmpegReady ? "#2d5a2d" : ffmpegError ? "#5a2d2d" : "#5a5a2d" }}>
        {!ffmpegReady && !ffmpegError && "⏳ FFmpeg: loading..."}
        {ffmpegReady && `✅ FFmpeg: ready (${debugInfo?.loaderMode || "cdn"})`}
        {ffmpegError && `❌ FFmpeg error: ${ffmpegError}`}
        {fontLoaded && " • 🔤 Font: loaded"}
        <button 
          onClick={() => setShowDebug(!showDebug)}
          style={{ marginLeft: 8, padding: "2px 6px", fontSize: 12, background: "rgba(0,0,0,0.1)", border: "none", borderRadius: 3, cursor: "pointer" }}
        >
          Debug {showDebug ? "▼" : "▶"}
        </button>
      </div>

      {/* Debug Panel */}
      {showDebug && debugInfo && (
        <div style={{ marginBottom: 16, padding: 12, fontSize: 12, fontFamily: "monospace", background: "#f8f8f8", border: "1px solid #ddd", borderRadius: 6, color: "#333" }}>
          <div><strong>FFmpeg Debug Info:</strong></div>
          <div>Origin: {debugInfo.origin}</div>
          <div>FFmpeg Loaded: {debugInfo.ffmpegLoaded ? "Yes" : "No"}</div>
          <div>Loader Mode: {debugInfo.loaderMode || "—"}</div>
          <div>Local JS File: 
            <a href="/ffmpeg/ffmpeg-core.js" target="_blank" style={{ marginLeft: 4 }}>
              {debugInfo.localFiles?.jsStatus} ({debugInfo.localFiles?.jsOk ? "OK" : "FAIL"})
            </a>
          </div>
          <div>Local WASM File: 
            <a href="/ffmpeg/ffmpeg-core.wasm" target="_blank" style={{ marginLeft: 4 }}>
              {debugInfo.localFiles?.wasmStatus} ({debugInfo.localFiles?.wasmOk ? "OK" : "FAIL"})
            </a>
          </div>
          <div>Local Worker File: 
            <a href="/ffmpeg/ffmpeg-worker.js" target="_blank" style={{ marginLeft: 4 }}>
              {debugInfo.localFiles?.workerStatus} ({debugInfo.localFiles?.workerOk ? "OK" : "FAIL"})
            </a>
          </div>
          {debugInfo.lastError && <div style={{ color: "red" }}>Last Error: {debugInfo.lastError}</div>}
          
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
            <strong>Caption System Info:</strong>
          </div>
          <div>Mode: CANVAS PNG OVERLAYS (NEW)</div>
          <div>Frame Size: {ASPECT_CONFIGS[aspectRatio].width}×{ASPECT_CONFIGS[aspectRatio].height}</div>
          <div style={{ color: "#00aa00", fontWeight: "bold" }}>🎯 REPLACES DRAWTEXT FILTER</div>
          <div>Font: Noto Sans Regular (Web Font)</div>
          <div>Text Position: Bottom third with safe margins</div>
          <div>Text Wrapping: Automatic with proper line breaks</div>
          <div>Background: Semi-transparent boxes</div>
          <div>Font Loaded: {fontLoaded ? "✅ Yes" : "⏳ Loading..."}</div>
          
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
            <strong>🧪 Image Search Testing:</strong>
            <button 
              onClick={() => testImageSearch()}
              style={{ marginLeft: 8, padding: "4px 8px", fontSize: 11, background: "#4CAF50", color: "white", border: "none", borderRadius: 3, cursor: "pointer" }}
            >
              Test Chef/Pasta Acceptance Criteria
            </button>
          </div>

          <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
            <strong>⚡ Debug Settings:</strong>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={forcePackOnly}
                onChange={(e) => handleForcePackOnlyToggle(e.target.checked)}
              />
              <span style={{ fontWeight: 500, color: forcePackOnly ? "#ff6600" : "#333" }}>
                FORCE_PACK_ONLY (instant exports)
              </span>
            </label>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2, marginLeft: 20 }}>
              Skip web image search, use pack images only for fast debugging
            </div>
          </div>
          
          {debugInfo.sceneMetrics && debugInfo.sceneMetrics.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
              <strong>🎬 Scene Metrics (Last Export):</strong>
              {debugInfo.sceneMetrics.map((scene: any, idx: number) => (
                <div key={idx} style={{ marginTop: 6, padding: 6, background: "#f0f0f0", borderRadius: 4 }}>
                  <div><strong>Scene {scene.scene}:</strong></div>
                  <div>📸 Image: {scene.imageSource} ({scene.imageExists ? '✓' : '✗'})
                    {scene.imageSource === 'openverse' && ' (Openverse CC0)'}
                    {scene.imageSource === 'wikimedia' && ' (Wikimedia Commons)'}
                    {scene.imageSource === 'user-upload' && ' (User Upload)'}
                    {scene.imageSource === 'color-fallback' && ' (Color Fallback)'}
                  </div>
                  {scene.relevanceScore && (
                    <div>🏆 Relevance Score: {scene.relevanceScore}</div>
                  )}
                  {scene.searchQueries && scene.searchQueries.length > 0 && (
                    <div>🔍 Queries: {scene.searchQueries.join(', ')}</div>
                  )}
                  {scene.imageDimensions && (
                    <div>📐 Dimensions: {scene.imageDimensions.width}×{scene.imageDimensions.height}</div>
                  )}
                  <div>⚡ Processing: {scene.processingTimeMs || 0}ms, {scene.candidatesFound} candidates</div>
                  <div>🎬 Background: {scene.finalBackgroundType}</div>
                  {scene.searchLogs && scene.searchLogs.length > 2 && (
                    <div style={{ fontSize: 10, color: "#666", marginTop: 4 }}>
                      📋 Search details: {scene.searchLogs.slice(0, 2).join('; ')}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          id="video-prompt"
          name="videoPrompt"
          type="text"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid #ddd" }}
          placeholder="Describe your video idea..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button
          onClick={onGenerate}
          style={{ padding: "10px 14px", borderRadius: 6, background: "#1677ff", color: "#fff", border: "none" }}
        >
          Generate
        </button>
      </div>

      {/* Aspect Ratio Selection - HIDDEN (using landscape only) */}

      <p>Scenes generated: {scenes.length}</p>
      
      {scenes.length > 0 && (
        <div>
          {/* Audio Panel */}
          <div style={{ marginBottom: 16, padding: 16, border: "1px solid #ddd", borderRadius: 6, background: "#f9f9f9" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: 16 }}>🎵 Audio Settings</h3>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Background Track Selection */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                  Background Track:
                </label>
                <select
                  value={audioConfig.backgroundTrack}
                  onChange={(e) => setAudioConfig({ ...audioConfig, backgroundTrack: e.target.value })}
                  style={{ width: "100%", padding: "6px 8px", borderRadius: 4, border: "1px solid #ccc" }}
                >
                  {AUDIO_TRACKS.map(track => (
                    <option key={track.id} value={track.id}>
                      {track.name}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {AUDIO_TRACKS.find(t => t.id === audioConfig.backgroundTrack)?.description}
                </div>
              </div>

              {/* Music Volume */}
              <div>
                <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                  Music Volume: {audioConfig.musicVolume}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={audioConfig.musicVolume}
                  onChange={(e) => setAudioConfig({ ...audioConfig, musicVolume: parseInt(e.target.value) })}
                  style={{ width: "100%" }}
                />
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  Target: ~-14 LUFS ({((audioConfig.musicVolume - 100) * 0.4).toFixed(1)} dB)
                </div>
              </div>
            </div>

            {/* Settings Panel */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #ddd" }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600 }}>⚙️ Settings</h4>
              
              {/* Include Narration Toggle */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={audioConfig.includeNarration}
                    onChange={(e) => setAudioConfig({ ...audioConfig, includeNarration: e.target.checked, narrationFile: e.target.checked ? audioConfig.narrationFile : null })}
                  />
                  <span style={{ fontWeight: 500 }}>Include Narration</span>
                  <span style={{ fontSize: 12, color: "#666", fontStyle: "italic" }}>(off by default - upload only)</span>
                </label>
              </div>

              {/* Narration File Upload */}
              {audioConfig.includeNarration && (
                <div style={{ marginLeft: 24, paddingLeft: 12, borderLeft: "2px solid #ddd" }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                    Upload narration file (WAV/MP3):
                  </label>
                  <input
                    type="file"
                    accept=".wav,.mp3,audio/wav,audio/mpeg"
                    onChange={handleNarrationFileChange}
                    style={{ width: "100%", padding: "6px", fontSize: 13, border: "1px solid #ccc", borderRadius: 4 }}
                  />
                  
                  {audioConfig.narrationFile && (
                    <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                      Selected: <strong>{audioConfig.narrationFile.name}</strong> ({Math.round(audioConfig.narrationFile.size / 1024)}KB)
                    </div>
                  )}
                  
                  {narrationError && (
                    <div style={{ fontSize: 12, color: "#d32f2f", marginTop: 4 }}>
                      ⚠️ {narrationError}
                    </div>
                  )}
                  
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4, lineHeight: 1.4 }}>
                    <strong>MVP scope:</strong> Narration will be automatically stretched/trimmed to match video duration. 
                    Mixed at 0.7 music volume, 1.0 narration volume, with -3dB clipping protection.
                  </div>
                </div>
              )}
            </div>

            {/* Audio Options */}
            <div style={{ marginTop: 12, display: "flex", gap: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={audioConfig.whooshTransitions}
                  onChange={(e) => setAudioConfig({ ...audioConfig, whooshTransitions: e.target.checked })}
                />
                Whoosh on transitions
              </label>
            </div>

            {/* Audio Status */}
            {(audioConfig.backgroundTrack !== 'none' || audioConfig.includeNarration) && (
              <div style={{ marginTop: 8, padding: 8, background: "#e8f4fd", borderRadius: 4, fontSize: 12 }}>
                {audioConfig.backgroundTrack !== 'none' && (
                  <div>🎼 Background: <strong>{AUDIO_TRACKS.find(t => t.id === audioConfig.backgroundTrack)?.name}</strong></div>
                )}
                {audioConfig.includeNarration && (
                  <div>🎤 Narration: {audioConfig.narrationFile ? <strong>{audioConfig.narrationFile.name}</strong> : 'No file selected'}</div>
                )}
                {audioConfig.whooshTransitions && <div>💨 Transition SFX enabled</div>}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Scenes ({scenes.length}):</h3>
          </div>
          
          {scenes.map((scene, i) => {
            const sceneId = `scene-${i}`;
            const hasImage = sceneImages[sceneId];
            const imageError = imageErrors[sceneId];
            
            return (
              <div key={i} style={{ 
                padding: 12, 
                margin: "8px 0", 
                background: "#f5f5f5", 
                borderRadius: 8,
                border: hasImage ? "2px solid #4CAF50" : "2px dashed #ddd"
              }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {/* Scene Text */}
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 8 }}>
                      <strong style={{ 
                        background: scene.kind === 'hook' ? '#ff6b6b' : scene.kind === 'cta' ? '#4ecdc4' : '#45b7d1',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        {scene.kind.toUpperCase()}
                      </strong>
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#666' }}>
                        {scene.durationSec}s
                      </span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                      {scene.text}
                    </div>
                  </div>
                  
                  {/* Image Upload Zone */}
                  <div style={{ 
                    width: 120, 
                    height: 80,
                    border: hasImage ? 'none' : '2px dashed #ccc',
                    borderRadius: 6,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    background: hasImage ? 'transparent' : '#fafafa',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onDragOver={handleSceneDragOver}
                  onDrop={(e) => handleSceneDrop(e, i)}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleSceneImageUpload(i, file);
                    };
                    input.click();
                  }}
                  >
                    {hasImage ? (
                      <>
                        <img 
                          src={hasImage} 
                          alt={`Scene ${i + 1}`}
                          style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'cover',
                            borderRadius: 4
                          }}
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSceneImage(i);
                          }}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: 'none',
                            background: 'rgba(255,255,255,0.9)',
                            color: '#666',
                            fontSize: 12,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Remove image"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 24, color: '#ccc', marginBottom: 4 }}>📷</div>
                        <div style={{ fontSize: 10, color: '#999', textAlign: 'center' }}>Click or drop image</div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Image Error */}
                {imageError && (
                  <div style={{ 
                    fontSize: 12, 
                    color: '#d32f2f', 
                    marginTop: 8,
                    padding: 6,
                    background: '#ffebee',
                    borderRadius: 4
                  }}>
                    ⚠️ {imageError}
                  </div>
                )}
                
                {/* Image Status */}
                {hasImage && (
                  <div style={{ 
                    fontSize: 11, 
                    color: '#4CAF50', 
                    marginTop: 8,
                    fontWeight: 500
                  }}>
                    ✅ Custom image uploaded
                  </div>
                )}
              </div>
            );
          })}
          
          <div style={{ display: "flex", gap: 8, marginTop: 16, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Export:</h3>
            <button
              onClick={onExportStoryboard}
              disabled={exporting || !ffmpegReady}
              style={{ 
                padding: "8px 12px", 
                borderRadius: 6, 
                background: "#1677ff",
                color: "#fff",
                border: "none",
                cursor: exporting || !ffmpegReady ? "not-allowed" : "pointer",
                fontSize: "14px",
                opacity: exporting || !ffmpegReady ? 0.5 : 1
              }}
            >
              {exporting ? "Exporting..." : "Export Storyboard MP4"}
            </button>
            <button
              onClick={onExportMP4}
              disabled={exporting}
              style={{ 
                padding: "8px 12px", 
                borderRadius: 6, 
                border: "1px solid #ddd", 
                background: exporting ? "#eee" : "#fff",
                cursor: exporting ? "not-allowed" : "pointer",
                fontSize: "14px"
              }}
            >
              {exporting ? "Exporting..." : "Export Placeholder MP4"}
            </button>
            <button
              onClick={onRunSmokeTest}
              disabled={exporting || !ffmpegReady}
              style={{ 
                padding: "8px 12px", 
                borderRadius: 6, 
                background: "#ff6600",
                color: "#fff",
                border: "none",
                cursor: exporting || !ffmpegReady ? "not-allowed" : "pointer",
                fontSize: "14px",
                opacity: exporting || !ffmpegReady ? 0.5 : 1
              }}
            >
              {exporting ? "Running..." : "🧪 Run Visual Smoke Test"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}