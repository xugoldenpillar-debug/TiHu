/**
 * TiHu Morning Mist & Organic Particle Burst Engine (晨雾草木粒子特效引擎)
 *
 * 纯 Canvas 零外部依赖，极轻量高性能。
 * 粒子特色：非科技风烟花，而是「晨雾草木」风格的微小叶片、晨曦金芒星粒与晨露水滴。
 * 物理特性：带自然重力、微风阻尼、有机摆动与 3D 翻滚轻旋，400~600ms 内柔和消融，自动销毁 Canvas。
 */

export type ParticleType = "leaf" | "star" | "dew";

export interface ParticleOptions {
  /** 粒子数量，默认 18 ~ 24 颗 */
  count?: number;
  /** 持续时间 (毫秒)，默认约 500ms (400~600ms 区间) */
  duration?: number;
  /** 扩散半径/初速度放大系数，默认 1.0 */
  spread?: number;
  /** 重力加速度，默认 0.18 */
  gravity?: number;
  /** 调色板，默认晨雾草木与暖金体系 */
  colors?: string[];
  /** 粒子类型子集，默认三种皆有 */
  types?: ParticleType[];
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: ParticleType;
  color: string;
  size: number;
  rotation: number;
  vRotation: number;
  tumble: number;
  vTumble: number;
  drag: number;
  gravity: number;
  swayFreq: number;
  swayAmp: number;
  swayPhase: number;
  startTime: number;
  duration: number;
}

// 晨雾草木自然色彩体系
const DEFAULT_COLORS = [
  "#3b632e", // 鼠尾草绿
  "#8cb369", // 嫩芽绿
  "#f4a261", // 晨曦暖金
  "#c88432", // 暖琥珀金
  "#a7c997", // 柔和浅草
  "#588157", // 青翠墨绿
];

let activeCanvas: HTMLCanvasElement | null = null;
let activeCtx: CanvasRenderingContext2D | null = null;
let activeParticles: Particle[] = [];
let animFrameId: number | null = null;
let resizeListener: (() => void) | null = null;

function ensureCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;

  if (!activeCanvas || !activeCanvas.isConnected) {
    activeCanvas = document.createElement("canvas");
    activeCanvas.setAttribute("aria-hidden", "true");
    activeCanvas.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;transform:translateZ(0);";
    document.body.appendChild(activeCanvas);
    activeCtx = activeCanvas.getContext("2d", { alpha: true });

    const updateSize = () => {
      if (!activeCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      activeCanvas.width = Math.round(w * dpr);
      activeCanvas.height = Math.round(h * dpr);
      if (activeCtx) {
        activeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };

    updateSize();
    resizeListener = updateSize;
    window.addEventListener("resize", resizeListener, { passive: true });
  }

  return activeCtx ? { canvas: activeCanvas, ctx: activeCtx } : null;
}

function cleanupCanvas(): void {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
  if (resizeListener) {
    window.removeEventListener("resize", resizeListener);
    resizeListener = null;
  }
  if (activeCanvas && activeCanvas.parentNode) {
    activeCanvas.parentNode.removeChild(activeCanvas);
  }
  activeCanvas = null;
  activeCtx = null;
  activeParticles = [];
}

/** 绘制晨雾草木叶片 */
function drawLeaf(ctx: CanvasRenderingContext2D, size: number, color: string, alpha: number): void {
  const w = size * 0.55;
  const h = size * 1.1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h);
  ctx.bezierCurveTo(w, -h * 0.35, w, h * 0.45, 0, h);
  ctx.bezierCurveTo(-w, h * 0.45, -w, -h * 0.35, 0, -h);
  ctx.closePath();
  ctx.fill();

  // 微小主叶脉增添自然质感
  if (size > 4.5) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.35})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.7);
    ctx.lineTo(0, h * 0.7);
    ctx.stroke();
  }
}

/** 绘制晨曦金芒星粒 */
function drawStar(ctx: CanvasRenderingContext2D, size: number, color: string, alpha: number): void {
  const r = size * 0.9;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.closePath();
  ctx.fill();

  // 核心微光露珠感
  ctx.fillStyle = `rgba(255, 253, 240, ${alpha * 0.75})`;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

/** 绘制水滴/晶莹晨露 */
function drawDew(ctx: CanvasRenderingContext2D, size: number, color: string, alpha: number): void {
  const r = size * 0.75;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // 水滴柔和高光
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.65})`;
  ctx.beginPath();
  ctx.arc(-r * 0.32, -r * 0.32, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

function runLoop(now: number): void {
  if (!activeCtx || !activeCanvas) {
    cleanupCanvas();
    return;
  }

  const w = window.innerWidth;
  const h = window.innerHeight;
  activeCtx.clearRect(0, 0, w, h);

  const survivors: Particle[] = [];

  for (let i = 0; i < activeParticles.length; i++) {
    const p = activeParticles[i];
    const elapsed = now - p.startTime;
    if (elapsed >= p.duration) continue;

    const progress = Math.min(1, elapsed / p.duration);

    // 透明度曲线：前 15% 敏捷浮现，中段保持，后 50% 柔和消融
    let alpha = 1;
    if (progress < 0.15) {
      alpha = progress / 0.15;
    } else if (progress > 0.45) {
      const fadeProgress = (progress - 0.45) / 0.55;
      alpha = Math.max(0, 1 - Math.pow(fadeProgress, 1.4));
    }

    // 微缩放：初始轻弹放大，随风飘散时微收缩
    let scale = 1;
    if (progress < 0.2) {
      scale = 0.6 + (progress / 0.2) * 0.45;
    } else {
      scale = 1.05 - (progress - 0.2) * 0.25;
    }

    // 物理学状态演化
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.gravity;
    const sway = Math.sin((now / 1000) * p.swayFreq + p.swayPhase) * p.swayAmp;
    p.x += p.vx + sway;
    p.y += p.vy;
    p.rotation += p.vRotation;
    p.tumble += p.vTumble;

    // 渲染粒子
    activeCtx.save();
    activeCtx.translate(p.x, p.y);
    activeCtx.rotate(p.rotation);
    // 3D 翻滚投影（通过 scaleX cos 模拟叶片空中翻转）
    const tumbleScaleX = Math.cos(p.tumble);
    activeCtx.scale(scale * tumbleScaleX, scale);
    activeCtx.globalAlpha = Math.max(0, Math.min(1, alpha));

    if (p.type === "leaf") {
      drawLeaf(activeCtx, p.size, p.color, alpha);
    } else if (p.type === "star") {
      drawStar(activeCtx, p.size, p.color, alpha);
    } else {
      drawDew(activeCtx, p.size, p.color, alpha);
    }

    activeCtx.restore();
    survivors.push(p);
  }

  activeParticles = survivors;

  if (activeParticles.length > 0) {
    animFrameId = requestAnimationFrame(runLoop);
  } else {
    cleanupCanvas();
  }
}

/**
 * 在目标 DOM 元素或指定视口坐标点触发草木微粒子轻扬迸发
 *
 * @param targetOrPoint 页面元素（取其中心）或视口绝对坐标 `{ x, y }`
 * @param options 定制数量、持续时间、重力与色彩
 */
export function burstParticles(
  targetOrPoint: HTMLElement | { x: number; y: number },
  options?: ParticleOptions,
): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // 尊重用户无障碍减少动态偏好
  const prefersReducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  let originX = 0;
  let originY = 0;

  if (targetOrPoint instanceof HTMLElement) {
    const rect = targetOrPoint.getBoundingClientRect();
    originX = rect.left + rect.width / 2;
    originY = rect.top + rect.height / 2;
  } else if (targetOrPoint && typeof targetOrPoint.x === "number") {
    originX = targetOrPoint.x;
    originY = targetOrPoint.y;
  } else {
    originX = window.innerWidth / 2;
    originY = window.innerHeight / 2;
  }

  const canvasObj = ensureCanvas();
  if (!canvasObj) return;

  const count = prefersReducedMotion
    ? Math.min(6, options?.count ?? 6)
    : (options?.count ?? Math.floor(18 + Math.random() * 8));

  const baseDuration = options?.duration ?? 520;
  const spread = options?.spread ?? 1.0;
  const baseGravity = options?.gravity ?? 0.16;
  const colors = options?.colors ?? DEFAULT_COLORS;
  const types: ParticleType[] = options?.types ?? ["leaf", "star", "dew"];

  const now = performance.now();

  for (let i = 0; i < count; i++) {
    // 初始速度方向偏向向上喷发散射 (-150deg 到 -30deg)
    const angle = -Math.PI * (0.2 + Math.random() * 0.6);
    const speed = (2.6 + Math.random() * 4.8) * spread;
    const vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 1.5;
    const vy = Math.sin(angle) * speed * 1.05;

    // 挑选类型与色彩
    const type = types[Math.floor(Math.random() * types.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];

    // 尺寸微调
    const size =
      type === "leaf"
        ? 5 + Math.random() * 4.5
        : type === "star"
        ? 4 + Math.random() * 3.5
        : 2.5 + Math.random() * 2.8;

    // 单粒子的独立消融时长 (400 ~ 600ms)
    const duration = baseDuration * (0.85 + Math.random() * 0.35);

    activeParticles.push({
      x: originX + (Math.random() - 0.5) * 8,
      y: originY + (Math.random() - 0.5) * 8,
      vx,
      vy,
      type,
      color,
      size,
      rotation: Math.random() * Math.PI * 2,
      vRotation: (Math.random() - 0.5) * 0.18,
      tumble: Math.random() * Math.PI,
      vTumble: (Math.random() - 0.5) * 0.22,
      drag: 0.94 + Math.random() * 0.03, // 微风阻尼
      gravity: baseGravity * (0.8 + Math.random() * 0.4),
      swayFreq: 2.0 + Math.random() * 3.0,
      swayAmp: 0.3 + Math.random() * 0.5,
      swayPhase: Math.random() * Math.PI * 2,
      startTime: now,
      duration,
    });
  }

  if (animFrameId === null) {
    animFrameId = requestAnimationFrame(runLoop);
  }
}

/**
 * 快捷仪式感庆祝粒子迸发（默认从屏幕上方或指定目标位置轻盈飘落）
 */
let lastCelebrateTime = 0;
export function celebrate(
  targetOrPoint?: HTMLElement | { x: number; y: number } | null,
  options?: ParticleOptions,
): void {
  if (typeof window === "undefined") return;
  const now = performance.now();
  if (now - lastCelebrateTime < 350) return;
  lastCelebrateTime = now;

  const point =
    targetOrPoint ?? {
      x: window.innerWidth / 2,
      y: Math.min(240, window.innerHeight * 0.32),
    };
  burstParticles(point, {
    count: options?.count ?? 28,
    duration: options?.duration ?? 580,
    spread: options?.spread ?? 1.15,
    ...options,
  });
}
