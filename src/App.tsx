import { useState } from "react";
import { assemblePlaceholder } from "./lib/ffmpegOrchestrator";

// Temporary inline types and function to test
interface Scene {
  text: string;
  keywords: string[];
  durationSec: number;
  kind: "hook" | "beat" | "cta";
}

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
  const [exporting, setExporting] = useState(false);

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

  const onExportMP4 = async () => {
    setExporting(true);
    try {
      console.log("Starting MP4 export...");
      
      // Show progress in console
      console.log("Step 1: Initializing FFmpeg...");
      const videoBlob = await assemblePlaceholder();
      
      console.log("Step 2: Creating download...");
      
      // Create download link
      const url = URL.createObjectURL(videoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'filmMagix-placeholder.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log("Step 3: MP4 export completed successfully!");
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

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>FilmMagix MVP</h1>

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

      <p>Scenes generated: {scenes.length}</p>
      
      {scenes.length > 0 && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Preview:</h3>
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