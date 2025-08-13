import { useState } from "react";
import "./App.css";

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [storyboards, setStoryboards] = useState<Array<{id: number; title: string; frames: any[]}>>([]);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (promptText: string) => {
    setLoading(true);
    // Simulate AI generation for now
    setTimeout(() => {
      setStoryboards([...storyboards, { id: Date.now(), title: promptText, frames: [] }]);
      setLoading(false);
    }, 1000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      handleGenerate(prompt.trim());
      setPrompt("");
    }
  };

  return (
    <div style={{ padding: "1rem" }}>
      <h1>FilmMagix MVP</h1>
      <form onSubmit={handleSubmit} style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your video idea..."
          disabled={loading}
          style={{ width: "70%", padding: "0.5rem" }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ padding: "0.5rem 1rem", marginLeft: "0.5rem" }}
        >
          {loading ? "Generating..." : "Generate"}
        </button>
      </form>
      <div>
        {storyboards.map((sb) => (
          <div key={sb.id} style={{ marginTop: "1rem" }}>
            <strong>{sb.title}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}