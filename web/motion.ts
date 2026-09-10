/**
 * Web Interactive Micro-Dynamics
 * 自然水墨微涟漪 + 磁性吸附 + 物理按压手感微交互引擎
 */

// 涟漪样式注入，确保自然草木绿墨扩散与纸意渗透
const STYLE_ID = "tihu-motion-styles";

function ensureMotionStyles(): void {
  // Styles bundled statically in theme.css to comply with CSP
}

/**
 * 委托监听全局 pointerdown 事件，实现全局水墨微涟漪效果
 */
export function setupInkRipple(): () => void {
  ensureMotionStyles();

  const targetSelector = [
    "button",
    ".btn",
    ".board-work-card",
    ".run-card",
    ".nav a",
    ".view-btn",
    ".tab",
    ".item-card",
    ".rank-row",
  ].join(", ");

  const onPointerDown = (event: PointerEvent): void => {
    // 仅响应鼠标左键或普通触摸
    if (event.button !== 0) return;

    const target = event.target as Element | null;
    if (!target) return;

    const host = target.closest<HTMLElement>(targetSelector);
    if (!host || host.hasAttribute("disabled") || host.getAttribute("aria-disabled") === "true") {
      return;
    }

    const rect = host.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 涟漪直径以 host 对角线为基准，确保完全覆盖
    const radius = Math.hypot(rect.width, rect.height);
    const diameter = radius * 1.5;

    // 避免宿主破坏 position / overflow
    if (getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    host.classList.add("ink-ripple-host");

    const ripple = document.createElement("span");
    ripple.className = "ink-ripple";
    ripple.style.width = `${diameter}px`;
    ripple.style.height = `${diameter}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    host.appendChild(ripple);

    const onAnimationEnd = (): void => {
      ripple.remove();
      ripple.removeEventListener("animationend", onAnimationEnd);
      // 如果没有其他涟漪了，清理 ink-ripple-host
      if (!host.querySelector(".ink-ripple")) {
        host.classList.remove("ink-ripple-host");
      }
    };

    ripple.addEventListener("animationend", onAnimationEnd);

    // 兜底自动清除，以防 animationend 在某些极端情况下未触发
    setTimeout(onAnimationEnd, 750);
  };

  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
  };
}

/**
 * 磁性吸附悬浮手感
 * 鼠标靠近目标元素时，产生 4~6px 微量平滑吸附跟随，移出后弹性平滑归位
 */
export function setupMagneticElements(): () => void {
  ensureMotionStyles();

  const magneticSelector = [
    ".btn-magnetic",
    ".brand",
    ".btn.primary",
    "#new-challenge-btn",
    "button[type='submit']",
  ].join(", ");

  let activeEl: HTMLElement | null = null;
  let rafId: number | null = null;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  const updatePosition = (): void => {
    if (!activeEl) {
      if (currentX !== 0 || currentY !== 0) {
        currentX += (0 - currentX) * 0.2;
        currentY += (0 - currentY) * 0.2;
        if (Math.abs(currentX) < 0.1 && Math.abs(currentY) < 0.1) {
          currentX = 0;
          currentY = 0;
        }
      }
      return;
    }

    // 弹性平滑插值
    currentX += (targetX - currentX) * 0.22;
    currentY += (targetY - currentY) * 0.22;

    activeEl.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;

    if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
      rafId = requestAnimationFrame(updatePosition);
    } else {
      rafId = null;
    }
  };

  const scheduleUpdate = (): void => {
    if (!rafId) {
      rafId = requestAnimationFrame(updatePosition);
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    // 触摸屏设备不启用磁性吸附
    if (event.pointerType === "touch") return;

    const target = event.target as Element | null;
    if (!target) {
      resetActive();
      return;
    }

    const host = target.closest<HTMLElement>(magneticSelector);
    if (!host) {
      resetActive();
      return;
    }

    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = event.clientX - centerX;
    const deltaY = event.clientY - centerY;

    // 磁力半径：超出边界一点点仍保持轻微引力
    const thresholdX = rect.width / 2 + 18;
    const thresholdY = rect.height / 2 + 18;

    if (Math.abs(deltaX) > thresholdX || Math.abs(deltaY) > thresholdY) {
      resetActive();
      return;
    }

    if (activeEl !== host) {
      if (activeEl) {
        activeEl.style.transform = "";
        activeEl.classList.remove("is-magnetizing");
      }
      activeEl = host;
      activeEl.classList.add("is-magnetizing");
    }

    // 限制最大位移为 4.5px ~ 5.5px
    const maxOffset = 5;
    targetX = (deltaX / thresholdX) * maxOffset;
    targetY = (deltaY / thresholdY) * maxOffset;

    scheduleUpdate();
  };

  const resetActive = (): void => {
    if (activeEl) {
      activeEl.classList.remove("is-magnetizing");
      activeEl.style.transform = "translate3d(0, 0, 0)";
      const elToClean = activeEl;
      setTimeout(() => {
        if (activeEl !== elToClean) {
          elToClean.style.transform = "";
        }
      }, 380);
      activeEl = null;
      targetX = 0;
      targetY = 0;
      currentX = 0;
      currentY = 0;
    }
  };

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", resetActive, { passive: true });

  return () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerleave", resetActive);
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    resetActive();
  };
}

/**
 * 启动全局微动效引擎
 */
export function initGlobalMotions(): () => void {
  const cleanRipple = setupInkRipple();
  const cleanMagnetic = setupMagneticElements();

  return () => {
    cleanRipple();
    cleanMagnetic();
  };
}
