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
  openai: { label: "OpenAI", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
  anthropic: { label: "Anthropic", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  gemini: { label: "Google Gemini", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  deepseek: { label: "DeepSeek", color: "#4338ca", bg: "#eef2ff", border: "#c7d2fe" },
  qwen: { label: "Qwen", color: "#4f46e5", bg: "#eef2ff", border: "#c7d2fe" },
  groq: { label: "Groq", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
  mistral: { label: "Mistral", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  ollama: { label: "Ollama", color: "#334155", bg: "#f1f5f9", border: "#cbd5e1" },
  meta: { label: "Meta LLaMA", color: "#0284c7", bg: "#f0f9ff", border: "#bae6fd" },
  generic: { label: "Model", color: "#475569", bg: "#f8fafc", border: "#e2e8f0" },
};

export function VendorIcon({ name, className = "", size = 20 }: VendorIconProps) {
  const vendor = detectVendor(name);

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
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium transition-colors select-none"
      style={{
        backgroundColor: theme.bg,
        color: theme.color,
        border: `1px solid ${theme.border}`,
      }}
    >
      <VendorIcon name={name} size={13} />
      <span>{label ?? name}</span>
    </span>
  );
}
