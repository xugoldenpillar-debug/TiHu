import {
  api,
  mutate,
  state,
  refreshSession,
  esc,
  head,
  empty,
  footer,
  field,
  toast,
  errorText,
  authenticate,
  closeDialog,
  confirmDialog,
  verificationNotice,
  clearFormError,
  formError,
  refreshPage,
  type Page,
} from "./core.js";
import type { AppConfig } from "./types.js";
import {
  explorePage,
  galleryPage,
  challengePage,
  leaderboardPage,
  newChallengePage,
} from "./catalog.js";
import { studioPage, runPage, comparePage } from "./lab.js";
import {
  connectionsPage,
  skillsPage,
  promptsPage,
  adminPage,
} from "./library.js";

const app = document.querySelector<HTMLDivElement>("#app")!;
const titles: Record<string, string> = {
  "/explore": "探索题目",
  "/gallery": "作品画廊",
  "/leaderboard": "排行榜",
  "/studio": "实验室",
  "/my-runs": "我的实验",
  "/connections": "API 连接",
  "/skills": "Skill 库",
  "/prompts": "提示词库",
  "/new-challenge": "创建题目",
  "/compare": "作品对比",
  "/verify": "验证邮箱",
  "/reset": "重置密码",
  "/admin": "管理中心",
};
const groups = [
  { title: "发现", links: ["/explore", "/gallery", "/leaderboard"] },
  {
    title: "我的实验空间",
    links: ["/studio", "/my-runs", "/connections", "/skills", "/prompts"],
  },
];
let disposePage: (() => void) | undefined;
let renderId = 0;
let navOpen = false;
const mobile = window.matchMedia("(max-width: 800px)");

function navigation(open: boolean, focus = true): void {
  navOpen = open && mobile.matches;
  document.body.classList.toggle("nav-open", navOpen);
  const sidebar = app.querySelector<HTMLElement>("#sidebar");
  const body = app.querySelector<HTMLElement>(".body");
  const button = app.querySelector<HTMLButtonElement>('[data-global="menu"]');
  const backdrop = app.querySelector<HTMLButtonElement>(".nav-backdrop");
  if (!sidebar || !body || !button || !backdrop) return;
  sidebar.inert = mobile.matches && !navOpen;
  body.inert = navOpen;
  backdrop.hidden = !navOpen;
  sidebar.classList.toggle("open", navOpen);
  button.setAttribute("aria-expanded", String(navOpen));
  if (focus) {
    if (navOpen)
      sidebar
        .querySelector<HTMLButtonElement>('[data-global="close-menu"]')
        ?.focus();
    else button.focus();
  }
}
function shell(path: string): void {
  const active = path.startsWith("/run/")
    ? "/my-runs"
    : path.startsWith("/challenge/")
      ? "/explore"
      : path;
  const title =
    titles[path] ??
    (path.startsWith("/run/")
      ? "实验结果"
      : path.startsWith("/challenge/")
        ? "题目详情"
        : "TiHu");
  document.title = title + " · TiHu";
  app.innerHTML = `<a class="skip-link" href="#main">跳到主要内容</a><div class="shell"><aside class="sidebar" id="sidebar" aria-label="主导航"><div class="row between"><a class="brand" href="#/explore"><img src="/art/favicon.svg" width="38" height="38" alt=""><span>TiHu<small>模型实验场</small></span></a><button class="btn ghost mobile-menu" data-global="close-menu" aria-label="关闭导航">关闭</button></div>${groups.map((group) => `<div class="nav-label">${group.title}</div><nav class="nav" aria-label="${group.title}">${group.links.map((link) => `<a href="#${link}" ${active === link ? 'class="active" aria-current="page"' : ""}><span class="nav-dot" aria-hidden="true"></span>${titles[link]}</a>`).join("")}</nav>`).join("")}${state.user?.role === "admin" ? '<nav class="nav" aria-label="管理"><a href="#/admin">管理中心</a></nav>' : ""}<div class="sidebar-foot"><a class="btn outline full" href="#/new-challenge">＋ 创建一道题</a><details class="security-note"><summary>自己的 Key，隔离的实验</summary><p>Key 加密保存在服务端，由受信代理调用模型；不会进入模型沙箱。生成内容在独立预览站点打开。</p></details><a class="text-link" href="#/gallery">保持好奇，认真比较。</a></div></aside><button class="nav-backdrop" data-global="close-menu" aria-label="关闭导航" hidden></button><div class="body"><header class="topbar"><div class="row"><button class="btn ghost mobile-menu" data-global="menu" aria-controls="sidebar" aria-expanded="false" aria-label="打开导航">菜单</button><div class="crumb"><span>TiHu</span><span aria-hidden="true">/</span><strong>${esc(title)}</strong></div></div><div class="topuser">${state.user ? `<span class="avatar" aria-hidden="true">${esc(state.user.username.slice(0, 2).toUpperCase())}</span><span class="username">${esc(state.user.username)}</span><button class="btn ghost small" data-global="logout">退出</button>` : `<button class="btn ghost" data-global="login">登录</button>${state.config.registration ? '<button class="btn primary small" data-global="register">创建账号</button>' : ""}`}</div></header><main class="main" id="main" tabindex="-1" aria-busy="true">${verificationNotice()}<div class="loading" role="status"><span class="loading-dot"></span>正在加载${esc(title)}…</div></main></div></div>`;
  navigation(false, false);
  app.querySelector(".skip-link")?.addEventListener("click", (event) => {
    event.preventDefault();
    app.querySelector<HTMLElement>("#main")?.focus();
  });
}
function tokenPage(reset: boolean): Page {
  const token =
    new URLSearchParams(location.hash.split("?")[1] ?? "").get("token") ?? "";
  return {
    html:
      head(
        reset ? "设置新密码" : "验证你的邮箱",
        reset
          ? "密码更新后，之前的登录会话将失效。"
          : "完成邮箱验证，就可以保存连接和开始实验。",
      ) +
      `<form class="panel editor-form" id="token-form">${!token ? field("mail-token", "邮件中的一次性令牌", '<input id="mail-token" name="token" required autocomplete="off">') : '<p class="notice">邮件中的一次性令牌已就绪。</p>'}${reset ? field("new-password", "新密码", '<input id="new-password" type="password" name="password" required minlength="12" maxlength="200" autocomplete="new-password">', "至少 12 位；请使用不曾在其他网站使用的密码。") : ""}<button class="btn primary" type="submit">${reset ? "更新密码" : "验证邮箱"}</button></form>${footer()}`,
    mount(root) {
      const form = root.querySelector<HTMLFormElement>("form")!;
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (form.dataset.pending) return;
        const button = form.querySelector<HTMLButtonElement>(
          "button[type=submit]",
        )!;
        form.dataset.pending = "true";
        button.disabled = true;
        clearFormError(form);
        try {
          const values = new FormData(form);
          await mutate("/auth/" + (reset ? "reset" : "verify"), "POST", {
            token: token || String(values.get("token")),
            ...(reset ? { password: values.get("password") } : {}),
          });
          await refreshSession();
          history.replaceState(null, "", "#/connections");
          toast(
            reset
              ? "密码已更新，请重新登录。"
              : "邮箱已验证，现在可以开始实验。",
          );
          await render();
          if (reset) authenticate();
        } catch (error) {
          formError(form, error);
        } finally {
          delete form.dataset.pending;
          button.disabled = false;
        }
      });
    },
  };
}
async function render(): Promise<void> {
  const id = ++renderId;
  disposePage?.();
  disposePage = undefined;
  closeDialog();
  const path = (location.hash.slice(1) || "/explore").split("?")[0];
  shell(path);
  const root = app.querySelector<HTMLElement>("#main")!;
  try {
    let page: Page;
    switch (path) {
      case "/explore":
        page = await explorePage();
        break;
      case "/gallery":
        page = await galleryPage();
        break;
      case "/my-runs":
        await refreshSession();
        page = await galleryPage(true);
        break;
      case "/leaderboard":
        page = await leaderboardPage();
        break;
      case "/studio":
        await refreshSession();
        page = await studioPage();
        break;
      case "/compare":
        page = await comparePage();
        break;
      case "/connections":
        page = await connectionsPage();
        break;
      case "/skills":
        page = await skillsPage();
        break;
      case "/prompts":
        page = await promptsPage();
        break;
      case "/admin":
        page = await adminPage();
        break;
      case "/new-challenge":
        page = newChallengePage();
        break;
      case "/verify":
        page = tokenPage(false);
        break;
      case "/reset":
        page = tokenPage(true);
        break;
      default:
        if (/^\/challenge\/[a-f0-9]+$/.test(path))
          page = await challengePage(path.split("/")[2]);
        else if (/^\/run\/[a-f0-9]+$/.test(path))
          page = await runPage(path.split("/")[2]);
        else
          page = {
            html:
              head("这里没有页面", "入口可能已改变。") +
              empty(
                "回到实验场",
                "题目、作品和你的实验都可以从导航进入。",
                '<a class="btn primary" href="#/explore">探索题目</a>',
              ),
          };
    }
    if (id !== renderId) return;
    root.innerHTML =
      (page.html.includes('data-global="resend-verification"')
        ? ""
        : verificationNotice()) + page.html;
    const cleanup = page.mount?.(root);
    if (cleanup) disposePage = cleanup;
    root.setAttribute("aria-busy", "false");
    root.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  } catch (error) {
    if (id !== renderId) return;
    root.innerHTML =
      head("页面暂时无法打开", errorText(error)) +
      empty(
        "你的数据不会因这次加载失败而丢失",
        "可以重新加载此页，或回到探索页面。",
        '<button class="btn primary" data-global="refresh">重新加载</button> <a class="btn outline" href="#/explore">探索题目</a>',
      );
    root.setAttribute("aria-busy", "false");
  }
}
app.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest(".sidebar a")) navigation(false, false);
  const button = target.closest<HTMLButtonElement>("[data-global]");
  if (!button || button.disabled) return;
  switch (button.dataset.global) {
    case "menu":
      navigation(!navOpen);
      return;
    case "close-menu":
      navigation(false);
      return;
    case "login":
      authenticate();
      return;
    case "register":
      authenticate("register");
      return;
    case "refresh":
      refreshPage();
      return;
    case "logout": {
      if (
        !(await confirmDialog({
          title: "退出当前账号？",
          body: "<p>未提交的实验草稿会清空。已保存的连接和实验记录不受影响。</p>",
          confirm: "退出账号",
        }))
      )
        return;
      try {
        await mutate("/auth/logout", "POST");
        await refreshSession();
        toast("已退出。");
        await render();
      } catch (error) {
        toast(errorText(error), true);
      }
      return;
    }
    case "resend-verification": {
      button.disabled = true;
      try {
        await mutate("/auth/resend-verification", "POST");
        toast("验证邮件已发送，请检查收件箱与垃圾邮件文件夹。");
      } catch (error) {
        toast(errorText(error), true);
      } finally {
        button.disabled = false;
      }
    }
  }
});
document.addEventListener("keydown", (event) => {
  if (!navOpen) return;
  if (event.key === "Escape") {
    event.preventDefault();
    navigation(false);
  }
  if (event.key === "Tab") {
    const controls = Array.from(
      app.querySelectorAll<HTMLElement>(
        "#sidebar a, #sidebar button, #sidebar summary",
      ),
    ).filter((item) => item.getClientRects().length > 0);
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
});
mobile.addEventListener("change", () => navigation(false, false));
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  void render();
});
window.addEventListener("tihu-refresh", () => {
  void render();
});
async function boot(): Promise<void> {
  try {
    state.config = await api<AppConfig>("/config");
    await refreshSession();
    await render();
  } catch (error) {
    app.innerHTML = `<div class="boot">TiHu<span>${esc(errorText(error))}</span><button class="btn primary" id="boot-retry">重新连接</button></div>`;
    app.querySelector("#boot-retry")?.addEventListener("click", () => {
      void boot();
    });
  }
}
void boot();
