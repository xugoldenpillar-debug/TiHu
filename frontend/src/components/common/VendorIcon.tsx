import React from "react";

interface VendorIconProps {
  name: string;
  className?: string;
  size?: number;
}

export function detectVendor(modelOrProvider: string): string {
  const s = (modelOrProvider || "").toLowerCase();
  if (s.includes("gpt") || s.includes("openai") || s.includes("o1") || s.includes("o3")) return "openai";
  if (s.includes("claude") || s.includes("anthropic")) return "anthropic";
  if (s.includes("gemini") || s.includes("google")) return "gemini";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("qwen") || s.includes("alibaba")) return "qwen";
  if (s.includes("groq")) return "groq";
  if (s.includes("mistral") || s.includes("codestral")) return "mistral";
  if (s.includes("ollama")) return "ollama";
  if (s.includes("meta") || s.includes("llama")) return "meta";
  return "generic";
}

export const VENDOR_THEMES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  openai: { label: "OpenAI", color: "#10a37f", bg: "rgba(16,163,127,0.12)", border: "rgba(16,163,127,0.3)" },
  anthropic: { label: "Anthropic", color: "#d97757", bg: "rgba(217,119,87,0.12)", border: "rgba(217,119,87,0.3)" },
  gemini: { label: "Google Gemini", color: "#4285f4", bg: "rgba(66,133,244,0.12)", border: "rgba(66,133,244,0.3)" },
  deepseek: { label: "DeepSeek", color: "#4d6bfe", bg: "rgba(77,107,254,0.12)", border: "rgba(77,107,254,0.3)" },
  qwen: { label: "Qwen", color: "#615ced", bg: "rgba(97,92,237,0.12)", border: "rgba(97,92,237,0.3)" },
  groq: { label: "Groq", color: "#f55036", bg: "rgba(245,80,54,0.12)", border: "rgba(245,80,54,0.3)" },
  mistral: { label: "Mistral", color: "#fd6f00", bg: "rgba(253,111,0,0.12)", border: "rgba(253,111,0,0.3)" },
  ollama: { label: "Ollama", color: "#ffffff", bg: "rgba(255,255,255,0.1)", border: "rgba(255,255,255,0.25)" },
  meta: { label: "Meta LLaMA", color: "#0081fb", bg: "rgba(0,129,251,0.12)", border: "rgba(0,129,251,0.3)" },
  generic: { label: "Model", color: "#38bdf8", bg: "rgba(56,189,248,0.12)", border: "rgba(56,189,248,0.3)" },
};

export function VendorIcon({ name, className = "", size = 20 }: VendorIconProps) {
  const vendor = detectVendor(name);

  // Use local curated SVG art if available
  const svgMap: Record<string, string> = {
    openai: "/art/vendors/openai.svg",
    anthropic: "/art/vendors/anthropic.svg",
    gemini: "/art/vendors/gemini.svg",
    deepseek: "/art/vendors/deepseek.svg",
    groq: "/art/vendors/groq.svg",
    mistral: "/art/vendors/mistral.svg",
    ollama: "/art/vendors/ollama.svg",
    meta: "/art/vendors/meta.svg",
  };

  const src = svgMap[vendor];

  if (src) {
    return (
      <img
        src={src}
        alt={vendor}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Fallback elegant monogram
  const theme = VENDOR_THEMES[vendor] ?? VENDOR_THEMES.generic;
  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg font-bold select-none shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: theme.bg,
        color: theme.color,
        border: `1px solid ${theme.border}`,
        fontSize: Math.max(10, Math.floor(size * 0.45)),
      }}
    >
      {(vendor[0] ?? "M").toUpperCase()}
    </div>
  );
}

export function VendorBadge({ name, label }: { name: string; label?: string }) {
  const vendor = detectVendor(name);
  const theme = VENDOR_THEMES[vendor] ?? VENDOR_THEMES.generic;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm transition-colors"
      style={{
        backgroundColor: theme.bg,
        color: theme.color,
        border: `1px solid ${theme.border}`,
      }}
    >
      <VendorIcon name={name} size={14} />
      <span>{label ?? name}</span>
    </span>
  );
}
