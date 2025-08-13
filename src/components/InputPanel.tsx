import { useState } from "react";

interface InputPanelProps {
  onGenerate: (prompt: string) => void;
  loading: boolean;
}

export default function InputPanel({ onGenerate, loading }: InputPanelProps) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt.trim());
      setPrompt("");
    }
  };

  return (
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
  );
}