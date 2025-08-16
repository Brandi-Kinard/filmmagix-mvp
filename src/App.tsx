import { useState, useEffect } from "react";
import { assemblePlaceholder, assembleStoryboard, assembleVisualSmokeTest, getFFmpeg, getDebugInfo } from "./lib/ffmpegOrchestrator";
import type { Scene } from "./lib/ffmpegOrchestrator";
import type { AspectKey } from "./lib/textLayout";
import { ASPECT_CONFIGS } from "./lib/textLayout";
import { AUDIO_TRACKS, DEFAULT_AUDIO_CONFIG, type AudioConfig } from "./lib/audioSystem";

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

  // Load FFmpeg using guaranteed working approach
  useEffect(() => {
    console.log("FilmMagix MVP starting...");
    setFfmpegError("FFmpeg: loading...");
    
    // Get debug info
    getDebugInfo().then(info => {
      setDebugInfo(info);
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

  const onGenerate = () => {
    const text = prompt.trim();
    if (!text) return;
    
    try {
      const generatedScenes = buildScenes(text);
      setScenes(generatedScenes);
      console.log("Generated scenes:", generatedScenes);
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
      
      const videoBlob = await assembleStoryboard(scenes, { aspectRatio, audioConfig });
      
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
            <strong>Text Layout Info:</strong>
          </div>
          <div>Mode: LANDSCAPE ONLY (16:9)</div>
          <div>Frame Size: {ASPECT_CONFIGS[aspectRatio].width}×{ASPECT_CONFIGS[aspectRatio].height}</div>
          <div style={{ color: "#00aa00", fontWeight: "bold" }}>🎯 OPTIMIZED FOR LANDSCAPE</div>
          <div>Text Position: CENTER JUSTIFIED</div>
          <div>Bottom Position: {ASPECT_CONFIGS[aspectRatio].height - 180}px (180px from bottom)</div>
          <div>Font Size: 32px (FIXED)</div>
          <div>Max Characters: 40 per line</div>
          <div>Max Lines: 3 (PLENTY OF ROOM)</div>
          
          {debugInfo.sceneMetrics && debugInfo.sceneMetrics.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
              <strong>🎬 Scene Metrics (Last Export):</strong>
              {debugInfo.sceneMetrics.map((scene: any, idx: number) => (
                <div key={idx} style={{ marginTop: 6, padding: 6, background: "#f0f0f0", borderRadius: 4 }}>
                  <div><strong>Scene {scene.scene}:</strong></div>
                  <div>📸 Image: {scene.imageSource} 
                    {scene.imageSource === 'ai-generated' && scene.generationTime && 
                      ` (generated in ${scene.generationTime}ms)`}
                    {scene.imageSource === 'unsplash' && ' (Unsplash API)'}
                    {scene.imageSource === 'fallback' && ' (Local fallback)'}
                  </div>
                  {scene.aiPrompt && (
                    <div>🤖 AI Prompt: {scene.aiPrompt.substring(0, 100)}...</div>
                  )}
                  <div>🔑 Keywords: {scene.keywords.join(', ')}</div>
                  <div>🎨 Tint: {scene.tintConfig.theme} ({scene.tintConfig.color})</div>
                  <div>🎬 Ken Burns: {scene.kenBurnsParams.zoomDirection} zoom, {scene.kenBurnsParams.panDirection} pan</div>
                  <div>📝 Text: {scene.fontSize}px font, {scene.lineCount} lines, {scene.longestLine} chars max</div>
                  {scene.textWarnings.length > 0 && (
                    <div style={{ color: "#cc6600" }}>⚠️ Warnings: {scene.textWarnings.join(', ')}</div>
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

            {/* Audio Options */}
            <div style={{ marginTop: 12, display: "flex", gap: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={audioConfig.autoDuck}
                  onChange={(e) => setAudioConfig({ ...audioConfig, autoDuck: e.target.checked })}
                />
                Auto-duck under voiceover (future)
              </label>
              
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
            {audioConfig.backgroundTrack !== 'none' && (
              <div style={{ marginTop: 8, padding: 8, background: "#e8f4fd", borderRadius: 4, fontSize: 12 }}>
                🎼 Selected: <strong>{AUDIO_TRACKS.find(t => t.id === audioConfig.backgroundTrack)?.name}</strong>
                {audioConfig.whooshTransitions && " + Transition SFX"}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Preview:</h3>
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
          {scenes.map((scene, i) => (
            <div key={i} style={{ padding: 8, margin: "4px 0", background: "#f5f5f5", borderRadius: 4 }}>
              <strong>{scene.kind.toUpperCase()}</strong>: {scene.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}