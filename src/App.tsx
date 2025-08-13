import { useState } from "react";
import { buildScenes, Scene } from "./lib/sceneBuilder";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [speaking, setSpeaking] = useState(false);

  const onGenerate = () => {
    const text = prompt.trim();
    if (!text) return;
    const sb = buildScenes(text);
    setScenes(sb);
  };

  const speakStoryboard = async () => {
    if (!scenes.length) return;
    const synth = window.speechSynthesis;
    if (!synth) {
      alert("Speech Synthesis not supported in this browser.");
      return;
    }
    setSpeaking(true);
    // Speak the whole storyboard as one VO for now
    const utter = new SpeechSynthesisUtterance(
      scenes.map(s => s.text).join(" ")
    );
    utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
    utter.onend = () => setSpeaking(false);
    synth.cancel();
    synth.speak(utter);
  };

  return (
    <div style={{ padding: 24, fontFamily: "Inter, system-ui, Arial" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>FilmMagix MVP</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
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

      {scenes.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button
              onClick={speakStoryboard}
              disabled={speaking}
              style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ddd", background: speaking ? "#eee" : "#fff" }}
            >
              {speaking ? "Speaking…" : "Preview Voiceover"}
            </button>
            <div style={{ fontSize: 13, color: "#667" }}>
              {scenes.length} scenes · ~{scenes.reduce((a, s) => a + s.durationSec, 0)}s total
            </div>
          </div>

          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {scenes.map((s, i) => (
              <li key={i} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 6 }}>
                  {s.kind.toUpperCase()} · {s.durationSec}s
                </div>
                <div style={{ fontWeight: 600 }}>{s.text}</div>
                <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                  keywords: {s.keywords.join(", ") || "—"}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}