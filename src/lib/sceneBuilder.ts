export interface Scene {
  text: string;
  keywords: string[];
  durationSec: number;     // 4–6s beats, 4s hook/cta
  kind: "hook" | "beat" | "cta";
}

export function buildScenes(raw: string, maxScenes = 12): Scene[] {
  const clean = (raw || "")
    .replace(/\s+/g, " ")
    .replace(/\(.*?\)/g, "")
    .trim();

  if (!clean) return [];

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
    .slice(0, maxScenes);

  const scenes = sentences.map((s, i, arr) => {
    const kind: Scene["kind"] =
      i === 0 ? "hook" : i === arr.length - 1 ? "cta" : "beat";
    const durationSec = kind === "beat" ? 5 : 4;
    return {
      text: normalizeHookCta(s, kind, i, arr.length),
      keywords: extractKeywords(s),
      durationSec,
      kind,
    };
  });

  // ensure a share-y CTA
  scenes[scenes.length - 1].text = ensureCta(scenes[scenes.length - 1].text);
  return scenes;
}

function extractKeywords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 3)
    .slice(0, 6);
}

function normalizeHookCta(s: string, kind: Scene["kind"], i: number, len: number) {
  if (kind === "hook" && !/imagine|what if|picture this|you/i.test(s)) {
    return "Imagine this: " + s;
  }
  return s;
}

function ensureCta(s: string) {
  if (/follow|subscribe|more|next/i.test(s)) return s;
  return s + " — Follow for more.";
}