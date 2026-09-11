import {
  api,
  mutate,
  state,
  esc,
  fmt,
  date,
  duration,
  head,
  empty,
  field,
  badge,
  footer,
  authGate,
  go,
  query,
  toast,
  errorText,
  formError,
  clearFormError,
  showDialog,
  closeDialog,
  confirmDialog,
  renderVendorBadge,
  detectVendor,
  vendorSvgs,
  type Page,
  type PageResult,
} from "./core.js";
import type {
  Challenge,
  ChallengeDetail,
  RunSummary,
  ModelScore,
} from "./types.js";

type ChallengeCopy = {
  title: string;
  description: string;
  art: string;
  alt: string;
  rubric: string[];
};
const challengeCopy: Record<string, ChallengeCopy> = {
  "Pelican on a bicycle": {
    title: "鹈鹕骑自行车",
    description:
      "鸟的身体、自行车的几何，还有生动的骑行动画。用 SVG 2D 动画看看模型如何理解结构与运动节奏。",
    art: "/art/challenge-pelican.svg",
    alt: "戴着头盔的鹈鹕骑自行车",
    rubric: [
      "一眼能认出的鹈鹕与清晰鸟喙",
      "合理的车轮与车架几何结构",
      "身体、脚踏板与座椅接触可信",
      "流畅生动的 2D 骑行动画",
      "画面细节与整体完成度",
    ],
  },
  "鹈鹕骑行": {
    title: "鹈鹕骑行",
    description:
      "经典视觉推理题目。用纯 SVG 绘制鹈鹕骑自行车的 2D 循环动画，考察模型对生物骨骼、机械几何与运动韵律的理解。",
    art: "/art/challenge-pelican.svg",
    alt: "戴着头盔的鹈鹕骑自行车",
    rubric: [
      "一眼能认出的鹈鹕与清晰鸟喙",
      "合理的车轮与车架几何结构",
      "身体、脚踏板与座椅接触可信",
      "流畅生动的 2D 骑行动画",
      "画面细节与整体完成度",
    ],
  },
  "Qin Shi Huang on a polar bear": {
    title: "秦始皇骑北极熊",
    description:
      "千古一帝与极地巨兽的奇幻碰撞。用 SVG 考察模型对复杂人物服饰、动物骨骼与 2D 动态节奏的综合表现力。",
    art: "/art/challenge-polar-bear.svg",
    alt: "头戴冕旒的秦始皇骑北极熊",
    rubric: [
      "辨识度高的秦始皇帝王特征（冕旒、黑金袍服、佩剑等）",
      "强壮生动的北极熊造型与姿态结构",
      "骑乘姿势与接触关系合理自然",
      "流畅生动的 2D 运动动画",
      "纯 SVG 绘制与单文件自包含 HTML",
    ],
  },
  "秦始皇骑北极熊": {
    title: "秦始皇骑北极熊",
    description:
      "千古一帝与极地巨兽的奇幻碰撞。用 SVG 考察模型对复杂人物服饰、动物骨骼与 2D 动态节奏的综合表现力。",
    art: "/art/challenge-polar-bear.svg",
    alt: "头戴冕旒的秦始皇骑北极熊",
    rubric: [
      "辨识度高的秦始皇帝王特征（冕旒、黑金袍服、佩剑等）",
      "强壮生动的北极熊造型与姿态结构",
      "骑乘姿势与接触关系合理自然",
      "流畅生动的 2D 运动动画",
      "纯 SVG 绘制与单文件自包含 HTML",
    ],
  },
  "A tiny living world": {
    title: "掌心里的小世界",
    description:
      "在一个网页里构建会呼吸、可互动的迷你生态，观察模型如何组织一个小世界。",
    art: "/art/challenge-ecosystem.svg",
    alt: "被轨道与微小生命环绕的生态星球",
    rubric: [
      "交互有效且容易理解",
      "视觉风格协调",
      "控件可访问",
      "动画正常运行并可暂停",
    ],
  },
  "The impossible clock": {
    title: "不太正经的时钟",
    description:
      "时间要准确，表达可以天马行空。让模型设计一只出人意料、又能读懂的时钟。",
    art: "/art/challenge-clock.svg",
    alt: "漂浮在暖色空间中的创意时钟",
    rubric: [
      "准确显示当地时间",
      "表达具有原创性",
      "时间清晰可读",
      "支持减少动态效果",
    ],
  },
};
const categoryNames: Record<string, string> = {
  SVG: "SVG 绘图",
  Interactive: "交互体验",
  Creative: "创意表达",
  UI: "界面设计",
};
const categoryThemes: Record<
  string,
  { bg1: string; bg2: string; accent: string; accent2: string; label: string }
> = {
  SVG: {
    bg1: "#042f2e",
    bg2: "#021c1b",
    accent: "#10b981",
    accent2: "#34d399",
    label: "SVG 绘图",
  },
  Interactive: {
    bg1: "#1e1b4b",
    bg2: "#0f172a",
    accent: "#6366f1",
    accent2: "#a5b4fc",
    label: "交互体验",
  },
  Creative: {
    bg1: "#3b0764",
    bg2: "#18022e",
    accent: "#d946ef",
    accent2: "#f472b6",
    label: "创意表达",
  },
  UI: {
    bg1: "#082f49",
    bg2: "#031a29",
    accent: "#0ea5e9",
    accent2: "#38bdf8",
    label: "界面设计",
  },
};

export function generateDynamicCoverSVG(title: string, category = "SVG"): string {
  const theme = categoryThemes[category] ?? categoryThemes.SVG;
  const safeTitle = esc(title.length > 20 ? title.slice(0, 18) + "…" : title);
  const hash = Array.from(title).reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  const angle = Math.abs(hash % 360);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${theme.bg1}"/>
      <stop offset="100%" stop-color="${theme.bg2}"/>
    </linearGradient>
    <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${theme.accent2}" stop-opacity="0.2"/>
    </linearGradient>
    <radialGradient id="ambient" cx="70%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${theme.accent}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${theme.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="600" height="360" fill="url(#bg)"/>
  <rect width="600" height="360" fill="url(#grid)"/>
  <rect width="600" height="360" fill="url(#ambient)"/>
  <g opacity="0.65" transform="translate(390, 145) rotate(${angle * 0.1})">
    <circle cx="0" cy="0" r="115" fill="none" stroke="${theme.accent}" stroke-width="1.5" stroke-dasharray="4 8" opacity="0.4"/>
    <circle cx="0" cy="0" r="80" fill="none" stroke="${theme.accent2}" stroke-width="1.2" opacity="0.6"/>
    <circle cx="0" cy="0" r="44" fill="${theme.accent}" fill-opacity="0.1" stroke="${theme.accent}" stroke-width="2"/>
    <polygon points="0,-44 38,22 -38,22" fill="none" stroke="${theme.accent2}" stroke-width="2" opacity="0.8"/>
    <circle cx="0" cy="-44" r="4.5" fill="${theme.accent2}"/>
    <circle cx="38" cy="22" r="4.5" fill="${theme.accent2}"/>
    <circle cx="-38" cy="22" r="4.5" fill="${theme.accent2}"/>
  </g>
  <g transform="translate(44, 75)">
    <rect x="0" y="0" width="94" height="26" rx="13" fill="${theme.accent}" fill-opacity="0.16" stroke="${theme.accent}" stroke-width="1"/>
    <text x="47" y="17" fill="${theme.accent2}" font-size="12" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="600" text-anchor="middle">${theme.label}</text>
    <text x="0" y="68" fill="#ffffff" font-size="28" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-weight="800" letter-spacing="-0.02em">${safeTitle}</text>
    <text x="0" y="100" fill="rgba(255,255,255,0.5)" font-size="13" font-family="-apple-system,BlinkMacSystemFont,sans-serif">TIHU BENCHMARK · 极客挑战</text>
  </g>
  <path d="M 44 295 L 556 295" stroke="url(#glow)" stroke-width="1.5" opacity="0.6"/>
  <text x="44" y="320" fill="rgba(255,255,255,0.4)" font-size="11" font-family="monospace">CODEGEN BENCHMARK // SANDBOX EVALUATION</text>
  <text x="556" y="320" fill="${theme.accent2}" font-size="11" font-family="monospace" font-weight="600" text-anchor="end">TIHU ARENA</text>
</svg>`;

  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

export function resolveChallengeVisual(item: {
  id?: string;
  title: string;
  category?: string;
  description?: string;
  art?: string | null;
}): {
  title: string;
  description: string;
  art: string;
  alt: string;
  rubric: string[];
} {
  const category = item.category ?? "SVG";
  const normTitle = (item.title || "").toLowerCase().trim();

  // 1. Explicit art assigned in database
  if (item.art && item.art.trim()) {
    return {
      title: item.title,
      description: item.description || "",
      art: item.art.trim(),
      alt: `${item.title} 封面插画`,
      rubric: [],
    };
  }

  // 2. Direct static copy match
  if (challengeCopy[item.title]) {
    const c = challengeCopy[item.title];
    return {
      title: c.title,
      description: item.description || c.description,
      art: c.art,
      alt: c.alt,
      rubric: c.rubric,
    };
  }

  // 3. Keyword / semantic matching
  if (
    normTitle.includes("pelican") ||
    normTitle.includes("鹈鹕") ||
    normTitle.includes("单车") ||
    normTitle.includes("骑行") ||
    normTitle.includes("bicycle")
  ) {
    const p = challengeCopy["Pelican on a bicycle"];
    return {
      title: item.title,
      description: item.description || p.description,
      art: p.art,
      alt: p.alt,
      rubric: p.rubric,
    };
  }

  if (
    normTitle.includes("polar bear") ||
    normTitle.includes("qin shi huang") ||
    normTitle.includes("秦始皇") ||
    normTitle.includes("北极熊") ||
    normTitle.includes("始皇")
  ) {
    const b = challengeCopy["秦始皇骑北极熊"];
    return {
      title: item.title,
      description: item.description || b.description,
      art: b.art,
      alt: b.alt,
      rubric: b.rubric,
    };
  }

  if (
    normTitle.includes("clock") ||
    normTitle.includes("时钟") ||
    normTitle.includes("闹钟") ||
    normTitle.includes("钟") ||
    normTitle.includes("时间")
  ) {
    const c = challengeCopy["The impossible clock"];
    return {
      title: item.title,
      description: item.description || c.description,
      art: c.art,
      alt: c.alt,
      rubric: c.rubric,
    };
  }

  if (
    normTitle.includes("ecosystem") ||
    normTitle.includes("living world") ||
    normTitle.includes("生态") ||
    normTitle.includes("小世界") ||
    normTitle.includes("微观") ||
    normTitle.includes("星球")
  ) {
    const e = challengeCopy["A tiny living world"];
    return {
      title: item.title,
      description: item.description || e.description,
      art: e.art,
      alt: e.alt,
      rubric: e.rubric,
    };
  }

  // 4. Fallback: Dynamic generative high-aesthetic vector cover
  return {
    title: item.title,
    description: item.description || "",
    art: generateDynamicCoverSVG(item.title, category),
    alt: `${item.title} 题目封面`,
    rubric: [],
  };
}
const icons = {
  arrowRight: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  gallery: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  sparkles: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  trophy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  cpu: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  layers: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>`,
  play: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
  flame: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>`,
  table: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><circle cx="7" cy="7" r=".5" fill="currentColor"/></svg>`,
  upload: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
};

function ensureCatalogStyles(): void {
  // Styles are bundled statically in theme.css to comply with CSP and eliminate FOUC
}

function challengeCard(item: Challenge, index: number): string {
  const visual = resolveChallengeVisual(item);
  const cat = item.category;
  const catName = categoryNames[cat] ?? cat;
  const numStr = String(index + 1).padStart(2, "0");

  return `<article class="card challenge-card challenge-bento-card">
    <a class="challenge-card-link" href="#/challenge/${esc(item.id)}" title="${esc(visual.title)}">
      <div class="challenge-cover cover">
        <img src="${visual.art}" alt="${esc(visual.alt)}" loading="lazy" width="600" height="360" class="challenge-cover-img">
        <span class="cover-num">题目 ${numStr}</span>
        <span class="cover-type category-capsule category-${esc(cat.toLowerCase())}">${esc(catName)}</span>
      </div>
      <div class="card-body challenge-card-body">
        <div class="challenge-card-header">
          <span class="badge-version">v${item.current_version} 固定评测</span>
          <span class="challenge-card-index">#${numStr}</span>
        </div>
        <h3 class="challenge-card-title">${esc(visual.title)}</h3>
        <p class="challenge-card-desc">${esc(visual.description)}</p>
        <div class="challenge-card-footer meta">
          <span class="challenge-card-sub">标准评价基准</span>
          <span class="card-arrow btn-challenge-action">开始挑战 ${icons.arrowRight}</span>
        </div>
      </div>
    </a>
  </article>`;
}
function workCard(item: RunSummary, mine = false): string {
  const title = resolveChallengeVisual({ title: item.title }).title;
  const userInitial = (item.username || "U").slice(0, 1).toUpperCase();
  const art = item.thumbnail_available
    ? `<img class="work-image" src="/api/runs/${esc(item.id)}/thumbnail" alt="${esc(title)}的生成作品预览" loading="lazy" width="960" height="540">`
    : `<div class="work-placeholder">
        <span class="placeholder-icon">${icons.gallery}</span>
        <span>${item.status === "succeeded" ? "暂无缩略图" : item.status === "queued" ? "等待开始" : item.status === "running" ? "正在构建" : item.status === "canceled" ? "实验已取消" : "实验未完成"}</span>
        <small>${item.status === "succeeded" ? "打开作品查看完整效果" : item.status === "canceled" ? "未生成产物，点击查看详情" : item.status === "failed" ? "执行失败，点击查看详情" : "每一次实验都有自己的记录"}</small>
      </div>`;

  return `<article class="card run-card modern-run-card" data-run-id="${esc(item.id)}">
    <a class="work-cover work-cover-aspect" data-run-id="${esc(item.id)}" href="#/run/${esc(item.id)}" title="${esc(title)}">
      ${art}
      <div class="work-cover-overlay">
        <span class="btn-quick-view">${icons.play} ${item.status === "succeeded" ? "查看沙箱" : "查看详情"}</span>
      </div>
    </a>
    <div class="card-body work-card-body">
      <div class="row between work-top-row">
        <div class="work-badges-row">
          ${mine ? badge(item.status) : badge(item.track)}
          ${item.is_official ? '<span class="badge official">官方直连</span>' : ""}
        </div>
        <span class="work-date">${date(item.created)}</span>
      </div>
      <h3 class="work-title">
        <a href="#/run/${esc(item.id)}" title="${esc(title)}">${esc(title)}</a>
      </h3>
      <div class="work-model-pill">
        ${renderVendorBadge(item.model)}
        <span class="model-text mono" title="${esc(item.model)}">${esc(item.model)}</span>
      </div>
      <div class="work-footer-meta row between">
        <div class="work-author">
          <span class="author-avatar" aria-hidden="true">${esc(userInitial)}</span>
          <span class="author-name">@${esc(item.username)}</span>
          <span class="work-version-tag">v${item.version}</span>
        </div>
        ${
          mine
            ? `<span class="work-privacy-tag">${item.published ? "已公开" : "仅自己可见"}</span>`
            : `<label class="compare-checkbox" title="勾选进行两两并排对比"><input type="checkbox" data-compare="${esc(item.id)}"><span>对比</span></label>`
        }
      </div>
      ${
        mine
          ? `<div class="row work-mine-metrics">${badge(item.track)}${item.metrics?.elapsed_ms != null ? `<span class="help">${duration(item.metrics.elapsed_ms)}</span>` : ""}</div>`
          : ""
      }
      ${mine && item.error ? `<p class="notice warn" style="margin:8px 0 0 0;font-size:12px;">${item.status === "canceled" ? "实验已取消" : "实验失败"}: ${esc(item.error)}</p>` : ""}
      ${
        mine && !["queued", "running"].includes(item.status)
          ? `<div class="row between work-card-actions" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--line);align-items:center;">
              <a class="btn outline small" href="#/run/${esc(item.id)}" style="padding:4px 12px;font-size:12px;">${item.status === "succeeded" ? "打开作品" : "查看详情"}</a>
              <button type="button" class="btn danger small" data-run-action="delete" data-run-id="${esc(item.id)}" style="padding:4px 10px;font-size:12px;">删除记录</button>
            </div>`
          : ""
      }
    </div>
  </article>`;
}
function pageControls<T>(page: PageResult<T>): string {
  return `<div class="pager"><p class="help" id="result-count">已展示 ${page.items.length} / ${fmt(page.total)} 项</p><button class="btn outline" id="load-more" ${!page.next_cursor ? "hidden" : ""}>加载更多</button></div>`;
}
function mountFeed<T extends { id: string }>(
  root: HTMLElement,
  url: string,
  first: PageResult<T>,
  renderer: (item: T, index: number) => string,
): () => void {
  const controller = new AbortController();
  const grid = root.querySelector<HTMLElement>("#feed")!;
  const more = root.querySelector<HTMLButtonElement>("#load-more")!;
  let cursor = first.next_cursor;
  let count = first.items.length;
  const seen = new Set(first.items.map((item) => item.id));
  more.addEventListener(
    "click",
    async () => {
      if (!cursor || more.disabled) return;
      more.disabled = true;
      more.textContent = "正在加载…";
      try {
        const page = await api<PageResult<T>>(
          url +
            (url.includes("?") ? "&" : "?") +
            "cursor=" +
            encodeURIComponent(cursor),
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        for (const item of page.items)
          if (!seen.has(item.id)) {
            seen.add(item.id);
            grid.insertAdjacentHTML("beforeend", renderer(item, count++));
          }
        cursor = page.next_cursor;
        more.hidden = !cursor;
        root.querySelector("#result-count")!.textContent =
          `已展示 ${count} / ${fmt(page.total)} 项`;
      } catch (error) {
        if (!controller.signal.aborted)
          toast(
            error instanceof Error && error.name === "AbortError"
              ? "请求已取消。"
              : "暂时无法加载更多，请重试。",
            true,
          );
      } finally {
        more.disabled = false;
        more.textContent = "加载更多";
      }
    },
    { signal: controller.signal },
  );
  return () => controller.abort();
}
function renderSegmentedControl(
  name: string,
  label: string,
  options: Array<{ value: string; label: string; icon?: string }>,
  current: string,
): string {
  return `
    <div class="segmented-control-field">
      <span class="segmented-control-label">${esc(label)}</span>
      <div class="segmented-control" role="radiogroup" aria-label="${esc(label)}">
        <input type="hidden" name="${esc(name)}" value="${esc(current)}">
        ${options
          .map(
            (opt) => `
          <button
            type="button"
            class="segment-btn ${opt.value === current ? "is-active" : ""}"
            data-filter-name="${esc(name)}"
            data-filter-value="${esc(opt.value)}"
            role="radio"
            aria-checked="${opt.value === current}"
            aria-pressed="${opt.value === current}"
          >
            ${opt.icon ? `<span class="segment-icon" aria-hidden="true">${opt.icon}</span>` : ""}
            <span>${esc(opt.label)}</span>
          </button>
        `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function bindFilter(root: HTMLElement, base: string): void {
  const form = root.querySelector<HTMLFormElement>("[data-filters]");
  if (!form) return;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form))
      if (typeof value === "string" && value.trim())
        params.set(key, value.trim());
    go(base + (params.size ? "?" + params : ""));
  });
  form
    .querySelectorAll("select")
    .forEach((select) =>
      select.addEventListener("change", () => form.requestSubmit()),
    );
  form.querySelectorAll<HTMLButtonElement>("[data-filter-name]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const name = btn.dataset.filterName;
      const value = btn.dataset.filterValue ?? "";
      if (!name) return;
      let hidden = form.querySelector<HTMLInputElement>(
        `input[type="hidden"][name="${name}"]`,
      );
      if (!hidden) {
        hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.name = name;
        form.appendChild(hidden);
      }
      hidden.value = value;
      form
        .querySelectorAll<HTMLButtonElement>(`[data-filter-name="${name}"]`)
        .forEach((b) => {
          const isActive = b === btn;
          b.classList.toggle("is-active", isActive);
          b.setAttribute("aria-pressed", String(isActive));
          if (b.getAttribute("role") === "radio") {
            b.setAttribute("aria-checked", String(isActive));
          }
        });
      form.requestSubmit();
    });
  });
}
function compareBar(): string {
  return '<section class="compare-bar" id="compare-bar" aria-label="作品对比" hidden><p id="compare-note" role="status">已选择 1 个作品，再选择一个同条件作品。</p><div class="actions"><button class="btn ghost" id="compare-clear">清空选择</button><button class="btn primary" id="compare-open" disabled>并排对比</button></div></section>';
}
function bindComparison(root: HTMLElement): () => void {
  const selected: string[] = [];
  const controller = new AbortController();
  root.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !target.dataset.compare)
        return;
      const id = target.dataset.compare;
      if (target.checked && selected.length === 2) {
        target.checked = false;
        toast("一次比较两个作品，请先取消一个选择。");
        return;
      }
      if (target.checked) selected.push(id);
      else selected.splice(selected.indexOf(id), 1);
      const bar = root.querySelector<HTMLElement>("#compare-bar")!;
      bar.hidden = selected.length === 0;
      root.querySelector("#compare-note")!.textContent =
        selected.length === 2
          ? "已选择 2 个作品。进入后将核对题目、版本、赛道与运行环境。"
          : "已选择 1 个作品，再选择一个同条件作品。";
      root.querySelector<HTMLButtonElement>("#compare-open")!.disabled =
        selected.length !== 2;
    },
    { signal: controller.signal },
  );
  root.querySelector("#compare-clear")?.addEventListener("click", () => {
    selected.length = 0;
    root
      .querySelectorAll<HTMLInputElement>("[data-compare]")
      .forEach((input) => (input.checked = false));
    root.querySelector<HTMLElement>("#compare-bar")!.hidden = true;
  });
  root.querySelector("#compare-open")?.addEventListener("click", () => {
    if (selected.length === 2) go("/compare?runs=" + selected.join(","));
  });
  return () => controller.abort();
}

const showcaseModels = [
  {
    id: "flagship",
    name: "TiHu 极客鹈鹕",
    vendor: "openai",
    src: "/art/pelican/pelican-hero.svg",
    tag: "Studio Cyber-Pelican · 旗舰级纳藏万物代码",
    tech: "gVisor 毫秒安全沙箱",
  },
  {
    id: "claude",
    name: "Claude 3.5 Sonnet",
    vendor: "anthropic",
    src: "/art/pelican/pelican-claude-3-5-sonnet.svg",
    tag: "Simon Willison 经典 Benchmark: Pelican on a Bicycle",
    tech: "Anthropic 官方直连",
  },
  {
    id: "gpt4o",
    name: "GPT-4o",
    vendor: "openai",
    src: "/art/pelican/pelican-gpt-4o.svg",
    tag: "代码即画布: 纯 SVG 代码生成的矢量骑行者",
    tech: "OpenAI 官方直连",
  },
  {
    id: "o1",
    name: "OpenAI o1",
    vendor: "openai",
    src: "/art/pelican/pelican-o1.svg",
    tag: "高维空间思维树 · 极简几何空气动力学",
    tech: "深度推理架构",
  },
  {
    id: "gemini",
    name: "Gemini 1.5 Pro",
    vendor: "gemini",
    src: "/art/pelican/pelican-gemini-pro.svg",
    tag: "灵动霓虹海湾 · 超长上下文跨域呈现",
    tech: "Google 原生多模态",
  },
];

function initHeroShowcase(root: HTMLElement): () => void {
  const tabs = root.querySelectorAll<HTMLButtonElement>("[data-hero-model]");
  const img = root.querySelector<HTMLImageElement>("#hero-pelican-stage");
  const tagEl = root.querySelector<HTMLElement>("#hero-pelican-tag");
  const techEl = root.querySelector<HTMLElement>("#hero-pelican-tech");
  if (!tabs.length || !img) return () => {};

  let currentIndex = 0;
  let timer: number | null = null;
  let isHovered = false;

  const selectModel = (index: number) => {
    currentIndex = index;
    const model = showcaseModels[index];
    if (!model) return;
    tabs.forEach((tab, i) => {
      tab.classList.toggle("active", i === index);
      tab.setAttribute("aria-pressed", String(i === index));
    });
    img.src = model.src;
    img.alt = model.name;
    img.classList.remove("hero-screen-img");
    void img.offsetWidth;
    img.classList.add("hero-screen-img");
    if (tagEl) tagEl.innerHTML = `${icons.sparkles} <span>${esc(model.tag)}</span>`;
    if (techEl) techEl.innerHTML = `<span class="hero-pulse-dot"></span> <span>${esc(model.tech)}</span>`;
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      selectModel(index);
    });
  });

  const box = root.querySelector(".hero-showcase-box");
  if (box) {
    box.addEventListener("mouseenter", () => { isHovered = true; });
    box.addEventListener("mouseleave", () => { isHovered = false; });
  }

  timer = window.setInterval(() => {
    if (isHovered) return;
    currentIndex = (currentIndex + 1) % showcaseModels.length;
    selectModel(currentIndex);
  }, 4500);

  return () => {
    clearInterval(timer);
  };
}

export async function explorePage(): Promise<Page> {
  const q = query();
  const currentCat = q.get("category") ?? "";
  const params = new URLSearchParams({
    limit: "12",
    q: q.get("q") ?? "",
    category: currentCat,
  });
  const url = "/challenges?" + params;
  const [page, stats] = await Promise.all([
    api<PageResult<Challenge>>(url),
    api<{ challenges: number; works: number; models: number }>("/stats"),
  ]);

  const heroHtml = `
    <section class="bento-hero">
      <div class="bento-hero-main">
        <div class="bento-hero-eyebrow">
          <span class="eyebrow-dot"></span>
          <span>TIHU · 极客沙箱与大语言模型大赏</span>
        </div>
        <h1 class="bento-hero-title" tabindex="-1">同一道题目，<br><span class="highlight-text">让各家模型各显神通。</span></h1>
        <p class="bento-hero-desc">BYOK 自由连接模型生态。在 gVisor 独立沙箱中安全运行，私下毫秒级预览，再将令人惊叹的代码生成成果带给社区评赏。</p>
        <div class="bento-hero-actions">
          <a class="btn primary btn-hero-primary" href="#/studio">
            <span>开始一次实验</span>
            ${icons.arrowRight}
          </a>
          <a class="btn light btn-hero-secondary" href="#/gallery">
            ${icons.gallery}
            <span>浏览社区大赏</span>
          </a>
        </div>
      </div>
      <div class="bento-hero-visual">
        <div class="hero-showcase-box" aria-label="Simon Willison 鹈鹕代码 Benchmark 互动展台">
          <div class="hero-showcase-tabs" role="tablist">
            ${showcaseModels
              .map(
                (m, i) => `
              <button type="button" class="hero-tab-btn ${i === 0 ? "active" : ""}" data-hero-model="${esc(m.id)}" role="tab" aria-pressed="${i === 0}">
                <span class="hero-tab-icon">${vendorSvgs[m.vendor] ?? icons.cpu}</span>
                <span>${esc(m.name)}</span>
              </button>
            `,
              )
              .join("")}
          </div>
          <div class="hero-showcase-screen">
            <img id="hero-pelican-stage" class="hero-screen-img" src="${showcaseModels[0].src}" alt="${showcaseModels[0].name}" width="500" height="360">
          </div>
          <div class="hero-showcase-footer">
            <div class="hero-footer-tag" id="hero-pelican-tag">
              ${icons.sparkles}
              <span>${esc(showcaseModels[0].tag)}</span>
            </div>
            <div class="hero-footer-status" id="hero-pelican-tech">
              <span class="hero-pulse-dot"></span>
              <span>${esc(showcaseModels[0].tech)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const metricCardsHtml = `
    <div class="metric-cards">
      <div class="metric-card">
        <div class="metric-icon-wrap">${icons.layers}</div>
        <div class="metric-content">
          <div class="metric-value">${fmt(stats.challenges)}</div>
          <div class="metric-label">开放题目</div>
          <div class="metric-sub">覆盖 SVG、交互与创意构建</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon-wrap icon-amber">${icons.gallery}</div>
        <div class="metric-content">
          <div class="metric-value">${fmt(stats.works)}</div>
          <div class="metric-label">真实公开作品</div>
          <div class="metric-sub">作者自主校验并共享至社区</div>
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-icon-wrap icon-sage">${icons.cpu}</div>
        <div class="metric-content">
          <div class="metric-value">${fmt(stats.models)}</div>
          <div class="metric-label">参与模型</div>
          <div class="metric-sub">涵盖官方直连与开源自建源</div>
        </div>
      </div>
    </div>
  `;

  const categoryCapsules = [
    ["", "全部分类"],
    ...state.config.categories.map((c) => [c, categoryNames[c] ?? c]),
  ];

  return {
    html: `
      ${heroHtml}
      ${
        stats.works
          ? metricCardsHtml
          : `
        <ol class="onboarding">
          <li><span>1</span><div><strong>选一道题</strong><p>任务和评价参考都公开</p></div></li>
          <li><span>2</span><div><strong>接上模型</strong><p>使用自己的低额度 API Key</p></div></li>
          <li><span>3</span><div><strong>观察结果</strong><p>私下预览，自主决定公开</p></div></li>
        </ol>
      `
      }
      <div class="section-head bento-section-head">
        <div>
          <h2>从一道好题开始</h2>
          <p>保持任务条件一致，观察每个模型的不同选择与审美风格。</p>
        </div>
        <a class="btn outline btn-create-challenge" href="#/new-challenge">
          <span>创建新题目</span>
          ${icons.arrowRight}
        </a>
      </div>
      <form class="filter-bar modern-filter-bar" data-filters role="search">
        <div class="search-input-wrapper">
          <span class="search-icon" aria-hidden="true">${icons.search}</span>
          <input id="challenge-search" class="search-input" name="q" type="search" value="${esc(q.get("q"))}" placeholder="搜索题目名称、说明或关键词...">
        </div>
        <div class="filter-capsule-group" role="group" aria-label="按分类筛选题目">
          <input type="hidden" name="category" value="${esc(currentCat)}">
          ${categoryCapsules
            .map(
              ([catVal, catLabel]) => `
            <button type="button" class="capsule-btn ${catVal === currentCat ? "is-active" : ""}" data-filter-name="category" data-filter-value="${esc(catVal)}" aria-pressed="${catVal === currentCat}">
              ${esc(catLabel)}
            </button>
          `,
            )
            .join("")}
        </div>
        <button class="btn outline btn-search-submit" type="submit">搜索</button>
      </form>
      <div class="grid bento-grid" id="feed">
        ${page.items.length ? page.items.map(challengeCard).join("") : empty("没有找到匹配的题目", "试试其他关键词，或创建一道人们愿意挑战的新题。", '<a class="btn outline" href="#/explore">清除筛选</a>')}
      </div>
      ${pageControls(page)}
      ${footer()}
    `,
    mount(root) {
      ensureCatalogStyles();
      bindFilter(root, "/explore");
      const stopHero = initHeroShowcase(root);
      const stopFeed = mountFeed(root, url, page, challengeCard);
      return () => {
        stopHero();
        stopFeed();
      };
    },
  };
}

export async function galleryPage(mine = false): Promise<Page> {
  if (mine && !state.user) return authGate();
  const q = query();
  const currentTrack = q.get("track") ?? "all";
  const currentStatus = q.get("status") ?? "all";
  const currentPublished = q.get("published") ?? "all";
  const params = new URLSearchParams({
    mine: String(mine),
    limit: "12",
    q: q.get("q") ?? "",
    track: currentTrack,
  });
  if (mine) {
    params.set("status", currentStatus);
    params.set("published", currentPublished);
  }
  if (q.get("challenge")) params.set("challenge", q.get("challenge")!);
  if (q.get("version")) params.set("version", q.get("version")!);
  const url = "/runs?" + params;
  const page = await api<PageResult<RunSummary>>(url);

  const trackCapsules = [
    ["all", "全部赛道"],
    ["standard", "标准赛道"],
    ["open", "开放赛道"],
  ];

  const statusCapsules = [
    ["all", "全部状态"],
    ["queued", "排队中"],
    ["running", "运行中"],
    ["succeeded", "已完成"],
    ["failed", "未完成"],
    ["canceled", "已取消"],
  ];

  const publishedCapsules = [
    ["all", "全部可见性"],
    ["public", "已公开"],
    ["private", "仅自己可见"],
  ];

  return {
    html:
      head(
        mine ? "我的实验" : "作品画廊",
        mine
          ? "每一次探索都有记录。未公开的实验仅对你可见。"
          : "这里的每件作品，都来自一次真实的模型实验。",
        '<a class="btn primary" href="#/studio">开始新实验</a>',
      ) +
      (mine && state.quota
        ? `<div class="notice row between"><span>最近 24 小时剩余 <strong>${state.quota.daily_remaining}</strong> / ${state.quota.daily_limit} 次</span><span>活跃实验 ${state.quota.active} / ${state.quota.active_limit}</span></div>`
        : "") +
      `<form class="filter-bar modern-filter-bar" data-filters role="search">
        <div class="search-input-wrapper">
          <span class="search-icon" aria-hidden="true">${icons.search}</span>
          <input id="run-search" class="search-input" name="q" type="search" value="${esc(q.get("q"))}" placeholder="搜索题目、模型名称或作者...">
        </div>
        <div class="capsule-group" role="group" aria-label="赛道筛选">
          <input type="hidden" name="track" value="${esc(currentTrack)}">
          ${trackCapsules
            .map(
              ([val, label]) => `
            <button type="button" class="capsule-btn ${currentTrack === val ? "is-active" : ""}" data-filter-name="track" data-filter-value="${esc(val)}" aria-pressed="${currentTrack === val}">
              ${esc(label)}
            </button>
          `,
            )
            .join("")}
        </div>
        ${
          mine
            ? `
          <div class="capsule-group" role="group" aria-label="运行状态筛选">
            <input type="hidden" name="status" value="${esc(currentStatus)}">
            ${statusCapsules
              .map(
                ([val, label]) => `
              <button type="button" class="capsule-btn ${currentStatus === val ? "is-active" : ""}" data-filter-name="status" data-filter-value="${esc(val)}" aria-pressed="${currentStatus === val}">
                ${esc(label)}
              </button>
            `,
              )
              .join("")}
          </div>
          <div class="capsule-group" role="group" aria-label="公开状态筛选">
            <input type="hidden" name="published" value="${esc(currentPublished)}">
            ${publishedCapsules
              .map(
                ([val, label]) => `
              <button type="button" class="capsule-btn ${currentPublished === val ? "is-active" : ""}" data-filter-name="published" data-filter-value="${esc(val)}" aria-pressed="${currentPublished === val}">
                ${esc(label)}
              </button>
            `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <button class="btn outline btn-search-submit" type="submit">搜索</button>
      </form>
      <div class="grid gallery-grid bento-grid" id="feed">
        ${page.items.length ? page.items.map((item) => workCard(item, mine)).join("") : empty(mine ? "这里等待你的下一次实验" : "还没有匹配的公开作品", mine ? "选一道题、接上模型，实验记录会保存在这里。" : "只有作者主动公开的成功作品才会出现。不同筛选条件下可能暂时没有作品。", '<a class="btn primary" href="#/studio">开始一次实验</a>')}
      </div>
      ${pageControls(page)}
      ${compareBar()}
      ${footer()}
    `,
    mount(root) {
      ensureCatalogStyles();
      bindFilter(root, mine ? "/my-runs" : "/gallery");
      const disposeFeed = mountFeed(root, url, page, (item) =>
        workCard(item, mine),
      );
      const disposeComparison = bindComparison(root);
      const disposeHoverLive = bindHoverLiveMotion(root);
      let disposeDelete: (() => void) | undefined;
      if (mine) {
        const handleDelete = async (e: MouseEvent) => {
          const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
            '[data-run-action="delete"]',
          );
          if (!btn || btn.disabled) return;
          const runId = btn.dataset.runId;
          if (!runId) return;
          const confirmed = await confirmDialog({
            title: "删除这次实验？",
            body: "<p>将永久删除该实验的所有记录、模型生成产物、事件日志和评价，且不可恢复。</p>",
            confirm: "确认删除实验",
            danger: true,
          });
          if (!confirmed) return;
          btn.disabled = true;
          try {
            await mutate(`/runs/${encodeURIComponent(runId)}`, "DELETE");
            toast("实验记录已成功删除");
            const card = btn.closest<HTMLElement>(".run-card");
            if (card) {
              card.style.transition = "opacity 0.2s, transform 0.2s";
              card.style.opacity = "0";
              card.style.transform = "scale(0.95)";
              setTimeout(() => card.remove(), 200);
            }
          } catch (err) {
            btn.disabled = false;
            toast("删除失败: " + (err instanceof Error ? err.message : String(err)));
          }
        };
        root.addEventListener("click", handleDelete);
        disposeDelete = () => root.removeEventListener("click", handleDelete);
      }
      return () => {
        disposeFeed();
        disposeComparison();
        disposeHoverLive();
        if (disposeDelete) disposeDelete();
      };
    },
  };
}

export async function challengePage(id: string): Promise<Page> {
  const challenge = await api<ChallengeDetail>(
    "/challenges/" + encodeURIComponent(id),
  );
  const q = query();
  const version = q.has("version")
    ? challenge.versions.find((item) => item.id === q.get("version"))
    : challenge.versions[0];
  if (!version)
    return {
      html:
        head("找不到这个题目版本", "历史作品没有被删除，请从有效版本进入。") +
        empty(
          "版本不存在",
          "返回题目后选择已有版本。",
          `<a class="btn outline" href="#/challenge/${esc(id)}">返回题目</a>`,
        ),
    };
  const visual = resolveChallengeVisual(challenge);
  const url =
    "/runs?" +
    new URLSearchParams({ challenge: id, version: version.id, limit: "12" });
  const page = await api<PageResult<RunSummary>>(url);
  const artSrc = visual.art;
  return {
    html: `
      <section class="challenge-hero-card">
        <div class="challenge-hero-content">
          <div class="challenge-hero-tags">
            ${badge(challenge.category)}
            <span class="badge version-pill">版本 v${version.number}</span>
            <span class="badge ${version.number === challenge.current_version ? "official" : "custom"}">${version.number === challenge.current_version ? "当前最新" : "历史版本"}</span>
          </div>
          <h1 class="challenge-hero-title">${esc(visual.title)}</h1>
          <p class="challenge-hero-desc">${esc(visual.description)}</p>
          <div class="challenge-hero-actions">
            <a class="btn primary btn-glow" href="#/studio?challenge=${esc(id)}&version=${esc(version.id)}">${icons.play} 挑战这道题</a>
            <button class="btn outline" id="upload-work-btn">${icons.upload} 上传自制作品</button>
            ${challenge.can_edit ? '<button class="btn outline" id="new-version">发布新版本</button>' : ""}
            <a class="btn ghost" href="#/explore">返回探索</a>
          </div>
        </div>
        <div class="challenge-hero-art">
          <img src="${artSrc}" alt="${esc(visual.title)}" width="200" height="160" class="challenge-hero-img">
        </div>
      </section>
      <section class="panel challenge-detail">
        <div class="row between align-center">
          <span class="eyebrow">版本控制与详细规格</span>
          <form data-filters class="row align-center gap-8">${field("task-version", "查看版本", `<select id="task-version" name="version">${challenge.versions.map((item) => `<option value="${esc(item.id)}" ${item.id === version.id ? "selected" : ""}>v${item.number}${item.number === challenge.current_version ? " · 当前版本" : " · 历史版本"}</option>`).join("")}</select>`)}<button class="btn outline small" type="submit">切换版本</button></form>
        </div>
        ${visual.rubric && visual.rubric.length ? `<div class="rubric-box"><h3>评价时，留意这些细节</h3><ul class="rubric-list">${visual.rubric.map((line) => `<li>${esc(line)}</li>`).join("")}</ul><p class="help">以上为入门说明；实际执行以下冻结的任务原文和评价参考。</p></div>` : ""}
        <details class="details-section"><summary>本版本任务原文</summary><pre class="mono code-block"><code>${esc(version.prompt)}</code></pre></details>
        <details class="details-section"><summary>评价参考原文</summary><pre class="mono code-block"><code>${esc(version.rubric)}</code></pre><p class="muted mono">版本指纹 ${esc(version.sha256)}</p></details>
      </section>
      <section class="section">
        <div class="section-head">
          <div>
            <h2>这个版本的作品</h2>
            <p class="muted">当前查看 v${version.number}，可随时切换历史版本查看更多实机成果。</p>
          </div>
          <a class="btn outline small" href="#/leaderboard?challenge=${esc(id)}">查看同题榜单</a>
        </div>
        <div class="feed-grid" id="feed">${page.items.length ? page.items.map((item) => workCard(item)).join("") : empty("暂无作品", "成为第一个完成此题的人。", `<a class="btn primary" href="#/studio?challenge=${esc(id)}&version=${esc(version.id)}">挑战这道题</a>`)}</div>
        ${pageControls(page)}
      </section>
      ${footer()}
    `,
    mount(root) {
      bindFilter(root, "/challenge/" + id);
      const disposeFeed = mountFeed(root, url, page, (item) => workCard(item));
      const disposeComparison = bindComparison(root);
      root.querySelector("#upload-work-btn")?.addEventListener("click", () => {
        if (!state.user) {
          toast("请先登录账号后再上传作品。");
          go("/login");
          return;
        }
        if (!state.user.verified) {
          toast("请先完成邮箱验证后再上传作品。");
          return;
        }
        showDialog(
          "上传自制作品",
          `<form id="upload-work-form" class="stack">
            <p class="help">上传本地自制网页或动画（支持单文件 <code>index.html</code> 或包含 <code>index.html</code> 的 ZIP 压缩包）。系统将异步进行沙箱安全审计与隔离预检，安全通过后将自动极速生成实时预览。</p>
            ${field("uw-title", "作品标题", `<input id="uw-title" name="title" maxlength="100" placeholder="留空默认使用题目名称 (${esc(visual.title)})">`)}
            ${field("uw-file", "作品文件", `<input id="uw-file" name="file" type="file" accept=".html,.zip" required>`, "单文件不超过 512 KB，ZIP 总大小不超过 2 MB。必须包含可渲染的 index.html。")}
            <div class="actions">
              <button class="btn outline" type="button" data-dialog-cancel>取消</button>
              <button class="btn primary" type="submit">提交并进行安全审计</button>
            </div>
          </form>`,
          (d) => {
            d.querySelector("[data-dialog-cancel]")?.addEventListener("click", () => closeDialog());
            const form = d.querySelector<HTMLFormElement>("form")!;
            form.addEventListener("submit", async (e) => {
              e.preventDefault();
              const fileInput = form.querySelector<HTMLInputElement>("#uw-file");
              const file = fileInput?.files?.[0];
              if (!file) return;
              const titleVal = form.querySelector<HTMLInputElement>("#uw-title")?.value.trim() || "";
              const submitBtn = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
              submitBtn.disabled = true;
              submitBtn.textContent = "正在上传…";
              try {
                const fd = new FormData();
                fd.append("challenge_id", id);
                fd.append("version_id", version.id);
                if (titleVal) fd.append("title", titleVal);
                fd.append("file", file);
                const res = await api<{ id: string; status: string; message: string }>("/runs/upload", {
                  method: "POST",
                  body: fd,
                });
                closeDialog();
                toast("作品已成功提交，正在进行后台异步安全审计与沙箱隔离…");
                go("/runs/" + res.id);
              } catch (err) {
                submitBtn.disabled = false;
                submitBtn.textContent = "提交并进行安全审计";
                toast(errorText(err) || "上传失败，请检查文件格式与大小。");
              }
            });
          }
        );
      });
      root.querySelector("#new-version")?.addEventListener("click", () => {
        const dialog = showDialog(
          "发布题目新版本",
          `<p class="notice">旧版本与旧作品都会保留。新提示词只用于之后选择此版本的实验。</p><form id="version-form">${field("version-prompt", "任务提示词", `<textarea id="version-prompt" name="prompt" rows="8" required minlength="10" maxlength="6000">${esc(version.prompt)}</textarea>`)}${field("version-rubric", "评价参考", `<textarea id="version-rubric" name="rubric" rows="4" required minlength="3" maxlength="3000">${esc(version.rubric)}</textarea>`)}<button class="btn primary" type="submit">发布不可变新版本</button></form>`,
        );
        const form = dialog.querySelector<HTMLFormElement>("form")!;
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (form.dataset.pending) return;
          form.dataset.pending = "true";
          const button = form.querySelector<HTMLButtonElement>(
            "button[type=submit]",
          )!;
          button.disabled = true;
          clearFormError(form);
          try {
            const values = new FormData(form);
            const result = await mutate<{ id: string }>(
              "/challenges/" + id + "/versions",
              "POST",
              { prompt: values.get("prompt"), rubric: values.get("rubric") },
            );
            closeDialog();
            toast("新版本已发布，旧作品仍可从历史版本查看。");
            go("/challenge/" + id + "?version=" + result.id);
          } catch (error) {
            formError(form, error);
          } finally {
            delete form.dataset.pending;
            button.disabled = false;
          }
        });
      });
      const disposeHoverLive = bindHoverLiveMotion(root);
      return () => {
        disposeFeed();
        disposeComparison();
        disposeHoverLive();
      };
    },
  };
}

function bindLivePreviewDrawer(root: HTMLElement): () => void {
  let activeAbort: AbortController | null = null;
  let activeDrawer: HTMLElement | null = null;
  let removeTimer: number | null = null;

  const closeDrawer = () => {
    if (!activeDrawer) return;
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    const drawer = activeDrawer;
    activeDrawer = null;
    drawer.classList.remove("is-open");
    const frame = drawer.querySelector<HTMLIFrameElement>("iframe");
    if (frame) {
      try {
        frame.src = "about:blank";
      } catch {}
    }
    if (removeTimer != null) {
      window.clearTimeout(removeTimer);
    }
    removeTimer = window.setTimeout(() => {
      drawer.remove();
      removeTimer = null;
    }, 380);
  };

  const openDrawer = async (runId: string, modelName: string, title: string) => {
    closeDrawer();
    const abort = new AbortController();
    activeAbort = abort;

    const drawer = document.createElement("div");
    drawer.className = "live-preview-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", `${modelName} 实时动画沙箱预览`);

    drawer.innerHTML = `
      <div class="drawer-backdrop" aria-hidden="true"></div>
      <div class="drawer-panel">
        <header class="drawer-header">
          <div class="drawer-title">
            <span class="drawer-title-tag">实时沙箱</span>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${esc(modelName)}</span>
          </div>
          <div class="drawer-actions">
            <a class="drawer-link" href="#/run/${esc(runId)}" target="_blank" rel="noopener">查看完整详情 ↗</a>
            <button type="button" class="drawer-close" aria-label="关闭预览" title="关闭预览 (Esc)">✕</button>
          </div>
        </header>
        <div class="drawer-stage">
          <div class="drawer-loading">
            <div class="drawer-spinner" aria-hidden="true"></div>
            <p>正在启动独立沙箱并加载动画…</p>
            <small style="color: var(--muted); font-size: 12px;">${esc(title)}</small>
          </div>
          <div class="drawer-error" hidden></div>
          <iframe
            sandbox="allow-scripts allow-forms allow-modals"
            title="${esc(title)} 实时动画沙箱"
            hidden
          ></iframe>
        </div>
      </div>
    `;

    root.appendChild(drawer);
    activeDrawer = drawer;

    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
    });

    drawer.querySelector(".drawer-backdrop")?.addEventListener("click", closeDrawer);
    drawer.querySelector(".drawer-close")?.addEventListener("click", closeDrawer);

    const loadingEl = drawer.querySelector<HTMLElement>(".drawer-loading")!;
    const errorEl = drawer.querySelector<HTMLElement>(".drawer-error")!;
    const iframe = drawer.querySelector<HTMLIFrameElement>("iframe")!;

    try {
      const result = await api<{ url: string }>(
        "/runs/" + encodeURIComponent(runId) + "/preview",
        { signal: abort.signal },
      );
      if (abort.signal.aborted) return;
      const url = new URL(result.url);
      const expected = state.config.preview_origin
        ? new URL(state.config.preview_origin).origin
        : null;
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.origin === location.origin ||
        (expected && url.origin !== expected)
      ) {
        throw new Error("预览地址没有满足独立来源隔离要求，已阻止加载。");
      }
      iframe.src = url.href;
      iframe.onload = () => {
        if (abort.signal.aborted) return;
        loadingEl.hidden = true;
        iframe.hidden = false;
      };
    } catch (err) {
      if (abort.signal.aborted) return;
      loadingEl.hidden = true;
      errorEl.hidden = false;
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? "请求已取消。"
            : err.message
          : "无法加载沙箱预览，请稍后重试。";
      errorEl.innerHTML = `<p>${esc(msg)}</p><button class="btn outline small" type="button" id="drawer-retry-btn">重新尝试</button>`;
      errorEl.querySelector("#drawer-retry-btn")?.addEventListener("click", () => {
        errorEl.hidden = true;
        loadingEl.hidden = false;
        openDrawer(runId, modelName, title);
      });
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && activeDrawer) {
      e.preventDefault();
      closeDrawer();
    }
  };
  window.addEventListener("keydown", onKeydown);

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const trigger = target.closest<HTMLElement>("[data-preview-id]");
    if (trigger) {
      e.preventDefault();
      const runId = trigger.dataset.previewId;
      const title = trigger.dataset.previewTitle ?? "作品预览";
      const model = trigger.dataset.previewModel ?? "模型生成作品";
      if (runId) {
        openDrawer(runId, model, title);
      }
    }
  };
  root.addEventListener("click", onClick);

  return () => {
    window.removeEventListener("keydown", onKeydown);
    root.removeEventListener("click", onClick);
    closeDrawer();
  };
}

function ensureLiveMotionStyles(): void {
  // Styles are bundled statically in theme.css to comply with CSP and eliminate FOUC
}

export function bindHoverLiveMotion(root: HTMLElement): () => void {
  ensureLiveMotionStyles();

  let currentCover: HTMLElement | null = null;
  let currentRunId: string | null = null;
  let hoverTimer: number | null = null;
  let fadeTimer: number | null = null;
  let activeAbort: AbortController | null = null;
  let activeWrapper: HTMLElement | null = null;

  const previewCache = new Map<string, string>();

  const destroyCurrent = (fade = true) => {
    if (hoverTimer != null) {
      window.clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (activeAbort) {
      activeAbort.abort();
      activeAbort = null;
    }
    if (fadeTimer != null) {
      window.clearTimeout(fadeTimer);
      fadeTimer = null;
    }

    const cover = currentCover;
    const wrapper = activeWrapper;
    currentCover = null;
    currentRunId = null;
    activeWrapper = null;

    if (cover) {
      cover.classList.remove("has-live-motion");
      cover.closest(".card")?.classList.remove("has-live-motion");
    }

    if (wrapper) {
      if (fade && wrapper.classList.contains("is-visible")) {
        wrapper.classList.remove("is-visible");
        wrapper.classList.add("is-fading-out");
        const dyingWrapper = wrapper;
        fadeTimer = window.setTimeout(() => {
          const frame = dyingWrapper.querySelector<HTMLIFrameElement>("iframe");
          if (frame) {
            try {
              frame.src = "about:blank";
            } catch {}
          }
          dyingWrapper.remove();
          fadeTimer = null;
        }, 200);
      } else {
        const frame = wrapper.querySelector<HTMLIFrameElement>("iframe");
        if (frame) {
          try {
            frame.src = "about:blank";
          } catch {}
        }
        wrapper.remove();
      }
    }
  };

  const handleCoverEnter = (cover: HTMLElement) => {
    if (cover === currentCover) return;
    if (currentCover && currentCover !== cover) {
      destroyCurrent(false);
    }

    const runId =
      cover.dataset.previewId ||
      cover.dataset.runId ||
      cover.closest<HTMLElement>("[data-run-id]")?.dataset.runId ||
      cover.getAttribute("href")?.match(/\/run\/([^\/?#]+)/)?.[1];

    if (!runId) return;

    currentCover = cover;
    currentRunId = runId;

    if (hoverTimer != null) {
      window.clearTimeout(hoverTimer);
    }

    // 280ms 计时器防抖，避免快速划过时误触发
    hoverTimer = window.setTimeout(async () => {
      hoverTimer = null;
      if (currentCover !== cover || !root.contains(cover)) return;

      const abort = new AbortController();
      activeAbort = abort;

      let previewUrl = previewCache.get(runId);
      if (!previewUrl) {
        try {
          const result = await api<{ url: string }>(
            "/runs/" + encodeURIComponent(runId) + "/preview",
            { signal: abort.signal },
          );
          if (abort.signal.aborted || currentCover !== cover) return;

          const url = new URL(result.url);
          const expected = state.config.preview_origin
            ? new URL(state.config.preview_origin).origin
            : null;
          if (
            !["https:", "http:"].includes(url.protocol) ||
            url.origin === location.origin ||
            (expected && url.origin !== expected)
          ) {
            return;
          }
          previewUrl = url.href;
          previewCache.set(runId, previewUrl);
        } catch {
          return;
        }
      }

      if (abort.signal.aborted || currentCover !== cover) return;

      const wrapper = document.createElement("div");
      wrapper.className = "card-live-wrapper";
      wrapper.setAttribute("aria-hidden", "true");

      const iframe = document.createElement("iframe");
      iframe.className = "card-live-iframe";
      iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-modals");
      iframe.setAttribute("tabindex", "-1");
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("loading", "eager");
      iframe.setAttribute("title", "动态微视窗实时预览");
      iframe.setAttribute(
        "allow",
        "autoplay 'none'; microphone 'none'; camera 'none'",
      );

      const badge = document.createElement("div");
      badge.className = "card-live-badge";
      badge.innerHTML = `<span class="card-live-dot" aria-hidden="true"></span><span>动态预览</span>`;

      wrapper.appendChild(iframe);
      wrapper.appendChild(badge);

      cover.appendChild(wrapper);
      activeWrapper = wrapper;
      cover.classList.add("has-live-motion");
      cover.closest(".card")?.classList.add("has-live-motion");

      let hasLoaded = false;
      const reveal = () => {
        if (hasLoaded) return;
        hasLoaded = true;
        if (abort.signal.aborted || currentCover !== cover) return;
        requestAnimationFrame(() => {
          wrapper.classList.add("is-visible");
        });
      };

      iframe.onload = reveal;
      iframe.src = previewUrl;
    }, 280);
  };

  const handleCoverLeave = (cover: HTMLElement) => {
    if (cover === currentCover) {
      destroyCurrent(true);
    }
  };

  const onPointerOver = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cover = target.closest<HTMLElement>(
      ".board-card-cover, .run-card .work-cover",
    );
    if (!cover || !root.contains(cover)) return;

    const related = e.relatedTarget as HTMLElement | null;
    if (related && cover.contains(related)) return;

    handleCoverEnter(cover);
  };

  const onPointerOut = (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const cover = target.closest<HTMLElement>(
      ".board-card-cover, .run-card .work-cover",
    );
    if (!cover || cover !== currentCover) return;

    const related = e.relatedTarget as HTMLElement | null;
    if (related && cover.contains(related)) return;

    handleCoverLeave(cover);
  };

  const onClick = () => {
    // 发生点击（进入详情页或打开抽屉）时平滑即刻销毁微视窗，避免后台占用与层叠冲突
    destroyCurrent(false);
  };

  const onHashChange = () => {
    destroyCurrent(false);
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      destroyCurrent(false);
    }
  };

  root.addEventListener("pointerover", onPointerOver);
  root.addEventListener("pointerout", onPointerOut);
  root.addEventListener("click", onClick, true);
  window.addEventListener("hashchange", onHashChange);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    destroyCurrent(false);
    root.removeEventListener("pointerover", onPointerOver);
    root.removeEventListener("pointerout", onPointerOut);
    root.removeEventListener("click", onClick, true);
    window.removeEventListener("hashchange", onHashChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

export async function leaderboardPage(): Promise<Page> {
  const q = query();
  const group = q.get("group") === "models" ? "models" : "works";
  const kind = q.get("kind") === "funny" ? "funny" : "capability";
  const providerScope =
    q.get("provider_scope") ?? q.get("provider-scope") ?? "all";
  const currentTrack = q.get("track") ?? "standard";
  const currentDays = q.get("days") ?? "0";
  const params = new URLSearchParams({
    group,
    kind,
    track: currentTrack,
    provider_scope: providerScope,
    days: currentDays,
    limit: "50",
  });
  if (q.get("challenge")) params.set("challenge", q.get("challenge")!);
  if (q.get("version")) params.set("version", q.get("version")!);
  const [board, tasks] = await Promise.all([
    api<{ items: (RunSummary | ModelScore)[] }>("/leaderboard?" + params),
    api<PageResult<Challenge>>("/challenges?limit=100"),
  ]);
  const challenge = q.get("challenge")
    ? await api<ChallengeDetail>("/challenges/" + q.get("challenge"))
    : null;
  if (challenge && !tasks.items.some((item) => item.id === challenge.id))
    tasks.items.push(challenge);

  const rankMedal = (index: number) => {
    if (index === 0) {
      return `<div class="board-card-medal rank-1" title="Top 1 冠绝榜首">
        <span class="medal-icon">${icons.trophy}</span>
        <span class="medal-label">TOP 1</span>
      </div>`;
    }
    if (index === 1) {
      return `<div class="board-card-medal rank-2" title="Top 2 银榜生辉">
        <span class="medal-icon">${icons.trophy}</span>
        <span class="medal-label">TOP 2</span>
      </div>`;
    }
    if (index === 2) {
      return `<div class="board-card-medal rank-3" title="Top 3 铜章俊秀">
        <span class="medal-icon">${icons.trophy}</span>
        <span class="medal-label">TOP 3</span>
      </div>`;
    }
    return `<div class="board-card-medal rank-other">
      <span class="medal-label">#${index + 1}</span>
    </div>`;
  };

  const galleryCards =
    group === "works"
      ? board.items
          .map((item, index) => {
            if (!("id" in item)) return "";
            const title = challengeCopy[item.title]?.title ?? item.title;
            const isOfficial = item.is_official;
            const provBadge = isOfficial
              ? '<span class="badge official">官方直连</span>'
              : '<span class="badge custom">自定义源</span>';
            const rankClass =
              index === 0
                ? "top-1"
                : index === 1
                  ? "top-2"
                  : index === 2
                    ? "top-3"
                    : "";
            const userInitial = (item.username || "U").slice(0, 1).toUpperCase();
            const art = item.thumbnail_available
              ? `<img src="/api/runs/${esc(item.id)}/thumbnail" alt="${esc(title)}预览" loading="lazy" width="480" height="300">`
              : `<div class="work-placeholder" style="min-height: 170px; font-size: 13px;"><span class="placeholder-icon">${icons.gallery}</span><span>暂无缩略图</span><small>点击运行沙箱实时预览</small></div>`;

            return `<article class="card board-work-card ${rankClass}" data-run-id="${esc(item.id)}">
              <div class="board-card-cover work-cover-aspect" data-preview-id="${esc(item.id)}" data-preview-title="${esc(title)}" data-preview-model="${esc(item.model)}" style="cursor: pointer;" title="点击即时预览沙箱动画">
                ${art}
                ${rankMedal(index)}
                <div class="board-card-cover-overlay">
                  <button type="button" class="btn-live-preview" data-preview-id="${esc(item.id)}" data-preview-title="${esc(title)}" data-preview-model="${esc(item.model)}" aria-label="即时预览 ${esc(title)}">
                    <span class="preview-play-icon">${icons.play}</span>
                    <span>实时沙箱抽屉</span>
                  </button>
                </div>
              </div>
              <div class="board-card-body">
                <div class="row between board-card-top-row">
                  <div class="board-card-tags">
                    ${badge(item.track)}
                    ${provBadge}
                  </div>
                  <div class="board-card-score" title="当前累计社区选票">
                    <span class="score-number">${fmt(item[kind])}</span>
                    <span class="score-unit">票</span>
                  </div>
                </div>
                <h4 class="board-card-title">
                  <a href="#/run/${esc(item.id)}" title="${esc(title)}">${esc(title)}</a>
                </h4>
                <div class="board-card-model">
                  ${renderVendorBadge(item.model)}
                  <span class="model-name-text mono">${esc(item.model)}</span>
                </div>
                <div class="board-card-meta row between">
                  <div class="board-card-author">
                    <span class="author-avatar-sm" aria-hidden="true">${esc(userInitial)}</span>
                    <span>@${esc(item.username)}</span>
                  </div>
                  <span class="board-card-date">v${item.version} · ${date(item.created)}</span>
                </div>
              </div>
            </article>`;
          })
          .join("")
      : "";

  const rows = board.items
    .map((item, index) => {
      const work = "id" in item;
      const isOfficial = item.is_official;
      const provBadge = isOfficial
        ? '<span class="badge official">官方直连</span>'
        : '<span class="badge custom">自定义源</span>';
      const rankClass =
        index === 0
          ? "top-1"
          : index === 1
            ? "top-2"
            : index === 2
              ? "top-3"
              : "";
      const rankBadge = `<span class="board-card-rank ${rankClass}" style="position: static; display: inline-block;">${index + 1}</span>`;

      if (work) {
        const title = challengeCopy[item.title]?.title ?? item.title;
        const thumb = item.thumbnail_available
          ? `<img class="board-row-thumb" src="/api/runs/${esc(item.id)}/thumbnail" alt="${esc(title)}" loading="lazy" width="44" height="32">`
          : `<span class="board-row-thumb" style="display: inline-flex; align-items: center; justify-content: center; font-size: 12px; color: var(--muted);">${icons.gallery}</span>`;
        return `<tr>
          <td class="rank" style="text-align: center;">${index < 3 ? rankBadge : index + 1}</td>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="cursor: pointer; position: relative; flex-shrink: 0;" data-preview-id="${esc(item.id)}" data-preview-title="${esc(title)}" data-preview-model="${esc(item.model)}" title="点击即时预览">
                ${thumb}
              </div>
              <div>
                <div><a class="text-link" href="#/run/${esc(item.id)}">${esc(item.model)}</a> ${provBadge}</div>
                <p class="help" style="margin: 2px 0 0;">${esc(title)} · v${item.version}</p>
              </div>
            </div>
          </td>
          <td>${badge(item.track)}</td>
          <td class="score">${fmt(item[kind])}</td>
          <td>@${esc(item.username)}<p class="help">${date(item.created)}</p></td>
          <td style="text-align: right;">
            <button type="button" class="btn-table-preview" data-preview-id="${esc(item.id)}" data-preview-title="${esc(title)}" data-preview-model="${esc(item.model)}">
              <span aria-hidden="true">${icons.play}</span> 预览
            </button>
          </td>
        </tr>`;
      } else {
        return `<tr>
          <td class="rank">${index + 1}</td>
          <td><strong>${esc(item.model)}</strong> ${provBadge}<p class="help break-word">${esc(item.provider)}</p></td>
          <td>${badge(item.track)}</td>
          <td class="score">${fmt(item.score)}</td>
          <td>${fmt(item.entries)} 件作品<p class="help">${fmt(item.authors)} 位作者 · ${fmt(item.challenges)} 道题</p></td>
        </tr>`;
      }
    })
    .join("");

  const viewToggleHtml =
    group === "works"
      ? `<div class="board-view-header">
          <div class="board-view-toggle segmented-control" role="group" aria-label="展示视图切换">
            <button type="button" class="segment-btn view-btn is-active" data-view="gallery" aria-pressed="true">
              <span class="segment-icon" aria-hidden="true">${icons.gallery}</span>
              <span>画廊模式</span>
            </button>
            <button type="button" class="segment-btn view-btn" data-view="table" aria-pressed="false">
              <span class="segment-icon" aria-hidden="true">${icons.table}</span>
              <span>表格模式</span>
            </button>
          </div>
          <div class="board-view-summary">
            <span class="summary-dot"></span>
            <span>共 ${board.items.length} 个作品 · 点击卡片封面或按钮即可实时启动沙箱预览</span>
          </div>
        </div>`
      : "";

  const contentHtml =
    group === "works"
      ? `<div class="board-gallery-view" id="board-gallery-view">
          <div class="board-gallery-grid bento-grid">
            ${galleryCards || '<p class="help">这个条件下还没有公开作品。换个筛选，或成为第一个参与者。</p>'}
          </div>
        </div>
        <div class="board-table-view" id="board-table-view" hidden>
          <div class="table" tabindex="0" role="region" aria-label="作品排行榜表格，可横向滚动">
            <table>
              <caption class="sr-only">作品${kind === "capability" ? "能力" : "趣味"}榜</caption>
              <thead>
                <tr>
                  <th scope="col" style="text-align: center; width: 60px;">排名</th>
                  <th scope="col">作品与模型</th>
                  <th scope="col">赛道</th>
                  <th scope="col">累计票数</th>
                  <th scope="col">作者与时间</th>
                  <th scope="col" style="text-align: right; width: 90px;">即时预览</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6">这个条件下还没有公开作品。换个筛选，或成为第一个参与者。</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>`
      : `<div class="table" tabindex="0" role="region" aria-label="模型排行榜，可横向滚动">
          <table>
            <caption class="sr-only">模型${kind === "capability" ? "能力" : "趣味"}榜</caption>
            <thead>
              <tr>
                <th scope="col">排名</th>
                <th scope="col">服务商与模型</th>
                <th scope="col">赛道</th>
                <th scope="col">累计票数</th>
                <th scope="col">有效样本</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">这个条件下还没有公开作品。换个筛选，或成为第一个参与者。</td></tr>'}
            </tbody>
          </table>
        </div>`;

  const filtersHtml = `
    <form class="board-segmented-filters" data-filters>
      <div class="segmented-controls-grid">
        ${renderSegmentedControl(
          "group",
          "榜单模式",
          [
            { value: "works", label: "作品大赏榜", icon: icons.gallery },
            { value: "models", label: "模型天梯榜", icon: icons.cpu },
          ],
          group,
        )}
        ${renderSegmentedControl(
          "kind",
          "评价维度",
          [
            { value: "capability", label: "能力维度", icon: icons.sparkles },
            { value: "funny", label: "趣味维度", icon: icons.flame },
          ],
          kind,
        )}
        ${renderSegmentedControl(
          "provider_scope",
          "服务商来源",
          [
            { value: "all", label: "全部来源" },
            { value: "official", label: "官方直连" },
            { value: "custom", label: "社区中转" },
          ],
          providerScope,
        )}
        ${renderSegmentedControl(
          "track",
          "实验赛道",
          [
            { value: "standard", label: "标准赛道" },
            { value: "open", label: "开放赛道" },
          ],
          currentTrack,
        )}
        ${renderSegmentedControl(
          "days",
          "作品创建时间",
          [
            { value: "0", label: "全部时间" },
            { value: "7", label: "近 7 天" },
            { value: "30", label: "近 30 天" },
          ],
          currentDays,
        )}
      </div>
      ${
        tasks.items.length
          ? `<div class="challenge-segmented-row">
              <span class="segmented-control-label">精选题库</span>
              <div class="challenge-capsule-scroller">
                <input type="hidden" name="challenge" value="${esc(challenge?.id ?? "")}">
                <button type="button" class="capsule-btn ${!challenge ? "is-active" : ""}" data-filter-name="challenge" data-filter-value="" aria-pressed="${!challenge}">
                  全部题目
                </button>
                ${tasks.items
                  .map((item) => {
                    const tTitle =
                      challengeCopy[item.title]?.title ?? item.title;
                    const isSelected = item.id === challenge?.id;
                    return `<button type="button" class="capsule-btn ${isSelected ? "is-active" : ""}" data-filter-name="challenge" data-filter-value="${esc(item.id)}" aria-pressed="${isSelected}">
                      ${esc(tTitle)}
                    </button>`;
                  })
                  .join("")}
              </div>
            </div>`
          : ""
      }
      ${
        challenge && challenge.versions.length > 1
          ? `<div class="challenge-segmented-row">
              <span class="segmented-control-label">题目版本</span>
              <div class="challenge-capsule-scroller">
                <input type="hidden" name="version" value="${esc(q.get("version") ?? challenge.versions[0].id)}">
                ${challenge.versions
                  .map((item) => {
                    const isSelected =
                      item.id === (q.get("version") ?? challenge.versions[0].id);
                    return `<button type="button" class="capsule-btn ${isSelected ? "is-active" : ""}" data-filter-name="version" data-filter-value="${esc(item.id)}" aria-pressed="${isSelected}">
                      v${item.number}
                    </button>`;
                  })
                  .join("")}
              </div>
            </div>`
          : ""
      }
    </form>
  `;

  return {
    html:
      head("社区排行榜", "看大家更喜欢什么，而不是给模型贴上一个智力分数。") +
      filtersHtml +
      `<div class="notice"><strong>${group === "models" ? "先去重，再汇总支持" : "只在一致条件下比较"}</strong><p>${group === "models" ? "每位作者在同题、同版本、同服务商模型下仅保留最高得票作品，再汇总票数。作者数不是投票人数，样本较少时请谨慎解读。" : "默认使用当前运行环境和题目最新版本；选择题目后可切换历史版本。标准与开放赛道分开查看。"} 时间筛选按作品创建时间计算，票数是这些作品的累计票数。</p></div>` +
      viewToggleHtml +
      contentHtml +
      `<p class="help" style="margin-top: 24px;">显示当前条件下前 50 项。不同运行环境、版本与服务商不会被悄悄合并。</p>${footer()}`,
    mount(root) {
      ensureCatalogStyles();
      bindFilter(root, "/leaderboard");

      const viewBtns = root.querySelectorAll<HTMLButtonElement>(
        ".board-view-toggle .view-btn",
      );
      const galleryView =
        root.querySelector<HTMLElement>("#board-gallery-view");
      const tableView = root.querySelector<HTMLElement>("#board-table-view");

      viewBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetView = btn.dataset.view;
          viewBtns.forEach((b) => {
            const active = b === btn;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          if (galleryView && tableView) {
            if (targetView === "gallery") {
              galleryView.hidden = false;
              tableView.hidden = true;
            } else {
              galleryView.hidden = true;
              tableView.hidden = false;
            }
          }
        });
      });

      const disposePreview = bindLivePreviewDrawer(root);
      const disposeHoverLive = bindHoverLiveMotion(root);
      return () => {
        disposePreview();
        disposeHoverLive();
      };
    },
  };
}

export function newChallengePage(): Page {
  if (!state.user) return authGate();
  return {
    html:
      head("创建一道新题", "清楚的任务和评价参考，是有意义的模型比较的开始。") +
      `<form class="panel editor-form" id="challenge-form">${field("new-title", "题目名称", '<input id="new-title" name="title" required minlength="3" maxlength="100" placeholder="让人愿意挑战的具体问题">')}<div class="form-grid">${field("new-category", "分类", `<select id="new-category" name="category">${state.config.categories.map((category) => `<option value="${esc(category)}">${esc(categoryNames[category] ?? category)}</option>`).join("")}</select>`)}${field("new-description", "简介", '<input id="new-description" name="description" required minlength="10" maxlength="1500" placeholder="用一两句话说明挑战的价值">')}</div>${field("new-prompt", "固定任务提示词", '<textarea id="new-prompt" name="prompt" rows="8" required minlength="10" maxlength="6000" placeholder="说明要生成什么、必须满足什么条件，以及不能做什么。"></textarea>', "发布后内容不可直接覆盖；修改会创建新版本。")}${field("new-rubric", "评价参考", '<textarea id="new-rubric" name="rubric" rows="4" required minlength="3" maxlength="3000" placeholder="例如：功能正确、结构合理、交互可访问、具有创意。"></textarea>')}<p class="notice">题目和评价参考会公开。不要写入秘密或个人敏感信息。</p><button class="btn primary" type="submit" ${!state.user.verified ? "disabled" : ""}>发布题目</button></form>${footer()}`,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>("form")!;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (form.dataset.pending) return;
        form.dataset.pending = "true";
        const button = form.querySelector<HTMLButtonElement>(
          "button[type=submit]",
        )!;
        button.disabled = true;
        clearFormError(form);
        try {
          const values = new FormData(form);
          const result = await mutate<{ id: string }>(
            "/challenges",
            "POST",
            Object.fromEntries(values),
          );
          toast("题目已发布。");
          go("/challenge/" + result.id);
        } catch (error) {
          formError(form, error);
        } finally {
          delete form.dataset.pending;
          button.disabled = !state.user?.verified;
        }
      });
    },
  };
}
