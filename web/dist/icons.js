/**
 * Helper to create a clean Lucide-style SVG icon function.
 * Stroke: 1.75px, round linecap & linejoin.
 * Default size: 18px (supports 14px, 16px, 18px, 20px etc.)
 */
export function createIcon(paths, defaultSize = 18) {
    return (size = defaultSize, className = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"${className ? ` class="${className}"` : ""} aria-hidden="true">${paths}</svg>`;
}
// Core navigation & workspace icons
export const iconCompass = createIcon('<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>');
export const iconImage = createIcon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>');
export const iconTrophy = createIcon('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>');
export const iconFlask = createIcon('<path d="M10 2v7.31L4.15 19.34A2 2 0 0 0 5.86 22h12.28a2 2 0 0 0 1.71-2.66L14 9.31V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>');
export const iconKey = createIcon('<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>');
export const iconPuzzle = createIcon('<path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>');
export const iconFileText = createIcon('<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>');
export const iconPlusCircle = createIcon('<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>');
export const iconSearch = createIcon('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>');
export const iconFilter = createIcon('<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>');
export const iconExternalLink = createIcon('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>');
export const iconUser = createIcon('<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
export const iconLogOut = createIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>');
// Supplemental UI & utility icons
export const iconShield = createIcon('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>');
export const iconPlus = createIcon('<path d="M5 12h14"/><path d="M12 5v14"/>');
export const iconHistory = createIcon('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>');
export const iconChevronRight = createIcon('<path d="m9 18 6-6-6-6"/>', 14);
export const iconChevronDown = createIcon('<path d="m6 9 6 6 6-6"/>', 14);
export const iconChevronLeft = createIcon('<path d="m15 18-6-6 6-6"/>', 14);
export const iconSparkles = createIcon('<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/>');
export const iconMenu = createIcon('<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>');
export const iconX = createIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');
export const iconCheck = createIcon('<path d="M20 6 9 17l-5-5"/>');
export const iconLayers = createIcon('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>');
export const iconLock = createIcon('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
export const iconHelpCircle = createIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>');
export const iconSliders = createIcon('<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>');
export const iconShare = createIcon('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>');
export const iconCopy = createIcon('<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>');
export const iconRefresh = createIcon('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>');
export const iconEye = createIcon('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>');
export const iconCode = createIcon('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>');
export const iconTerminal = createIcon('<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>');
export const iconTrash = createIcon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>');
export const iconEdit = createIcon('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>');
export const iconPlay = createIcon('<polygon points="6 3 20 12 6 21 6 3"/>');
export const iconCheckCircle = createIcon('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>');
export const iconAlertCircle = createIcon('<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>');
// Modern Developer & Agent Icons
export const iconAgent = createIcon('<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>');
export const iconToken = createIcon('<circle cx="12" cy="12" r="9"/><path d="M12 6v12"/><path d="M15 9.5a3.5 3.5 0 0 0-5 0c0 2 5 2 5 5a3.5 3.5 0 0 1-6 0"/>');
export const iconPrompt = createIcon('<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m8 10 3 2-3 2"/><path d="M13 14h3"/>');
export const iconSandbox = createIcon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>');
export const iconBranch = createIcon('<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>');
export const iconMedal = createIcon('<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>');
/**
 * Official AI Vendor SVG Badges
 */
export const vendorSvgs = {
    openai: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.5-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.2 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.08zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68v-6.74l2.01 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.5 4.5zm-9.66-4.13a4.47 4.47 0 0 1-.54-3.01l.14.08 4.79 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06l-4.84 2.8a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.48 4.48 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .38.68l5.82 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9zm16.6 3.85L13.1 8.36 15.12 7.2a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1V12.42a.79.79 0 0 0-.4-.67zm2.01-3.02l-.14-.09-4.78-2.78a.78.78 0 0 0-.78 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08-4.78 2.76a.79.79 0 0 0-.4.68zm1.1-2.36l2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5Z"/></svg>`,
    anthropic: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 20.92c-.52 0-.97-.34-1.13-.84L13.78 12.3H7.82l-1.92 6.18a1.18 1.18 0 0 1-1.13.84H3.34a.5.5 0 0 1-.47-.65l5.88-18.06a1.18 1.18 0 0 1 1.13-.84h2.84c.53 0 .97.34 1.13.84l5.88 18.06a.5.5 0 0 1-.47.65h-2.26zM10.8 2.77L8.44 10.36h4.72L10.8 2.77z"/><circle cx="19.5" cy="6" r="1.5"/><circle cx="21" cy="11.5" r="1.5"/></svg>`,
    deepseek: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 14.5C4 9.5 8 5.5 13.5 5.5C18 5.5 21 8.5 21 12.5C21 17.5 16.5 20.5 11 20.5C6.5 20.5 4 17.5 4 14.5Z" fill="#1D4ED8"/><path d="M12 9C9.5 9 8 10.5 8 12.5C8 14.5 9.5 16 12 16C15 16 17 14 17 12C17 10 14.5 9 12 9Z" fill="#60A5FA"/><circle cx="14.5" cy="11.5" r="1.2" fill="#FFFFFF"/></svg>`,
    gemini: `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" fill="#7C3AED"/></svg>`,
    mistral: `<svg viewBox="0 0 24 24" fill="#F97316"><rect x="3" y="3" width="3.6" height="3.6"/><rect x="17.4" y="3" width="3.6" height="3.6"/><rect x="3" y="6.6" width="7.2" height="3.6"/><rect x="13.8" y="6.6" width="7.2" height="3.6"/><rect x="3" y="10.2" width="18" height="3.6"/><rect x="3" y="13.8" width="10.8" height="3.6"/><rect x="10.2" y="13.8" width="10.8" height="3.6"/><rect x="3" y="17.4" width="3.6" height="3.6"/><rect x="10.2" y="17.4" width="3.6" height="3.6"/><rect x="17.4" y="17.4" width="3.6" height="3.6"/></svg>`,
    meta: `<svg viewBox="0 0 24 24" fill="#0081FB"><path d="M12 15.6c-1.98 0-3.6-1.52-3.6-3.6s1.62-3.6 3.6-3.6c1.98 0 3.6 1.52 3.6 3.6s-1.62 3.6-3.6 3.6zm-5.4 0C4.38 15.6 3 14.15 3 12s1.38-3.6 3.6-3.6c1.26 0 2.4.6 3.06 1.56C8.76 10.8 7.8 11.4 6.6 12c1.2.6 2.16 1.2 3.06 2.04-.66.96-1.8 1.56-3.06 1.56zm10.8 0c-1.26 0-2.4-.6-3.06-1.56.9-.84 1.86-1.44 3.06-2.04-1.2-.6-2.16-1.2-3.06-2.04.66-.96 1.8-1.56 3.06-1.56 2.22 0 3.6 1.45 3.6 3.6s-1.38 3.6-3.6 3.6z"/></svg>`,
    groq: `<svg viewBox="0 0 24 24" fill="#F55036"><path d="M12 2L3 13h8l-2 9 11-12h-8l2-8z"/></svg>`,
    ollama: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8 2 6 5 6 9v3c0 2-1 3-1 4 0 2 2 4 4 4h6c2 0 4-2 4-4 0-1-1-2-1-4V9c0-4-2-7-6-7zm-3 8a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm-3 7c-2 0-3-1-3-2h6c0 1-1 2-3 2z"/></svg>`,
};
export function detectVendor(modelOrProvider) {
    const s = (modelOrProvider || "").toLowerCase();
    if (s.includes("claude") || s.includes("anthropic"))
        return { key: "anthropic", name: "Anthropic" };
    if (s.includes("gpt") || s.includes("openai") || s.includes("o1") || s.includes("o3"))
        return { key: "openai", name: "OpenAI" };
    if (s.includes("deepseek"))
        return { key: "deepseek", name: "DeepSeek" };
    if (s.includes("gemini") || s.includes("google"))
        return { key: "gemini", name: "Google Gemini" };
    if (s.includes("mistral") || s.includes("codestral"))
        return { key: "mistral", name: "Mistral AI" };
    if (s.includes("llama") || s.includes("meta"))
        return { key: "meta", name: "Meta Llama" };
    if (s.includes("groq"))
        return { key: "groq", name: "Groq" };
    if (s.includes("ollama"))
        return { key: "ollama", name: "Ollama" };
    return { key: "generic", name: "AI Model" };
}
export function renderVendorBadge(modelOrProvider, extraClass = "") {
    const { key, name } = detectVendor(modelOrProvider);
    const iconSvg = vendorSvgs[key] ?? iconAgent(16);
    return `<span class="vendor-badge ${key} ${extraClass}"><span class="vendor-badge-icon" aria-hidden="true">${iconSvg}</span><span>${name}</span></span>`;
}
