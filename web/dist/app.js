import { api, mutate, state, refreshSession, esc, head, empty, footer, field, toast, errorText, authenticate, closeDialog, confirmDialog, verificationNotice, clearFormError, formError, refreshPage, } from "./core.js";
import { explorePage, galleryPage, challengePage, leaderboardPage, newChallengePage, } from "./catalog.js";
import { studioPage, runPage, comparePage } from "./lab.js";
import { connectionsPage, skillsPage, promptsPage, adminPage, } from "./library.js";
import { initGlobalMotions } from "./motion.js";
import { iconCompass, iconImage, iconTrophy, iconFlask, iconHistory, iconKey, iconPuzzle, iconFileText, iconPlusCircle, iconPlus, iconShield, iconChevronRight, iconUser, iconLogOut, iconMenu, iconX, iconLock, iconLayers, } from "./icons.js";
const app = document.querySelector("#app");
const titles = {
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
    {
        title: "探索发现",
        enTitle: "DISCOVERY",
        links: ["/explore", "/gallery", "/leaderboard"],
    },
    {
        title: "我的工作台",
        enTitle: "WORKSPACE",
        links: ["/studio", "/my-runs", "/connections", "/skills", "/prompts"],
    },
];
const routeIcons = {
    "/explore": iconCompass,
    "/gallery": iconImage,
    "/leaderboard": iconTrophy,
    "/studio": iconFlask,
    "/my-runs": iconHistory,
    "/connections": iconKey,
    "/skills": iconPuzzle,
    "/prompts": iconFileText,
    "/new-challenge": iconPlusCircle,
    "/compare": iconLayers,
    "/admin": iconShield,
};
let disposePage;
let renderId = 0;
let navOpen = false;
let navCloseTimer;
const mobile = window.matchMedia("(max-width: 800px)");
function navigation(open, focus = true) {
    navOpen = open && mobile.matches;
    document.body.classList.toggle("nav-open", navOpen);
    const sidebar = app.querySelector("#sidebar");
    const body = app.querySelector(".body");
    const button = app.querySelector('[data-global="menu"]');
    const backdrop = app.querySelector(".nav-backdrop");
    if (!sidebar || !body || !button || !backdrop)
        return;
    sidebar.inert = mobile.matches && !navOpen;
    body.inert = navOpen;
    clearTimeout(navCloseTimer);
    if (navOpen) {
        backdrop.hidden = false;
        requestAnimationFrame(() => {
            backdrop.classList.add("open");
            sidebar.classList.add("open");
        });
    }
    else {
        backdrop.classList.remove("open");
        sidebar.classList.remove("open");
        navCloseTimer = window.setTimeout(() => {
            if (!navOpen)
                backdrop.hidden = true;
        }, 280);
    }
    button.setAttribute("aria-expanded", String(navOpen));
    if (focus) {
        if (navOpen)
            sidebar
                .querySelector('[data-global="close-menu"]')
                ?.focus();
        else
            button.focus();
    }
}
let lastAuthUserId = "__init__";
function shell(path) {
    const active = path.startsWith("/run/")
        ? "/my-runs"
        : path.startsWith("/challenge/")
            ? "/explore"
            : path;
    const title = titles[path] ??
        (path.startsWith("/run/")
            ? "实验结果"
            : path.startsWith("/challenge/")
                ? "题目详情"
                : "TiHu");
    document.title = title + " · TiHu";
    const currentShell = app.querySelector(".shell");
    const userChanged = lastAuthUserId !== state.user?.id;
    lastAuthUserId = state.user?.id;
    if (currentShell && !userChanged) {
        // Incremental DOM update for silky smooth transitions
        const links = currentShell.querySelectorAll(".nav-link");
        links.forEach((a) => {
            const href = a.getAttribute("href") ?? "";
            const isLinkActive = href === `#${active}`;
            a.classList.toggle("active", isLinkActive);
            if (isLinkActive)
                a.setAttribute("aria-current", "page");
            else
                a.removeAttribute("aria-current");
        });
        const crumbCurrent = currentShell.querySelector(".crumb-current");
        if (crumbCurrent)
            crumbCurrent.textContent = title;
        navigation(false, false);
        return;
    }
    app.innerHTML = `<a class="skip-link" href="#main">跳到主要内容</a><div class="shell"><aside class="sidebar" id="sidebar" aria-label="主导航"><div class="sidebar-header row space-between"><a class="brand" href="#/explore"><span class="brand-logo-frame"><img src="/art/favicon.svg" width="34" height="34" alt="TiHu" class="brand-logo"></span><span class="brand-text"><span class="brand-title-line"><span class="brand-name">TiHu</span><span class="brand-badge">v2.0</span></span><small class="brand-tagline">极客沙箱 · 模型实验场</small></span></a><button class="btn ghost mobile-menu" data-global="close-menu" aria-label="关闭导航">${iconX(18)}</button></div><div class="sidebar-navs">${groups.map((group) => `<div class="nav-group"><div class="nav-label"><span class="nav-label-zh">${group.title}</span><span class="nav-label-en">${group.enTitle}</span></div><nav class="nav" aria-label="${group.title}">${group.links.map((link) => {
        const iconFn = routeIcons[link] ?? iconCompass;
        const isActive = active === link;
        return `<a href="#${link}" class="nav-link${isActive ? ' active" aria-current="page' : '"'}><span class="nav-icon">${iconFn(18)}</span><span class="nav-text">${titles[link]}</span></a>`;
    }).join("")}</nav></div>`).join("")}${state.user?.role === "admin" ? `<div class="nav-group"><div class="nav-label"><span class="nav-label-zh">系统管理</span><span class="nav-label-en">SYSTEM</span></div><nav class="nav" aria-label="管理"><a href="#/admin" class="nav-link${active === "/admin" ? ' active" aria-current="page' : '"'}><span class="nav-icon">${iconShield(18)}</span><span class="nav-text">管理中心</span></a></nav></div>` : ""}</div><div class="sidebar-foot"><div class="sidebar-action"><a class="btn primary full sidebar-create-btn btn-create-challenge" id="new-challenge-btn" href="#/new-challenge"><span class="btn-icon" aria-hidden="true">${iconPlus(16)}</span><span>创建一道题</span></a></div>${state.user ? `<div class="sidebar-user user-profile-pill"><span class="avatar user-pill-avatar" aria-hidden="true">${esc(state.user.username.slice(0, 2).toUpperCase())}</span><div class="user-pill-info"><span class="username user-pill-name" title="${esc(state.user.username)}">${esc(state.user.username)}</span><span class="user-pill-role">${state.user.role === "admin" ? "系统管理员" : "实验探索者"}</span></div><button class="btn ghost small user-pill-action icon-only" data-global="logout" title="退出登录" aria-label="退出登录">${iconLogOut(16)}</button></div>` : `<div class="sidebar-user sidebar-guest user-profile-pill"><button class="btn ghost small full user-login-btn" data-global="login"><span class="btn-icon" aria-hidden="true">${iconUser(15)}</span><span>登录</span></button>${state.config.registration ? `<button class="btn primary small full user-register-btn" data-global="register"><span class="btn-icon" aria-hidden="true">${iconPlus(15)}</span><span>注册</span></button>` : ""}</div>`}<details class="security-note"><summary><span class="summary-icon" aria-hidden="true">${iconLock(13)}</span><span>安全隔离沙箱</span></summary><p>Key 加密存储于安全内存中，由专用 Broker 代理调用，杜绝注入风险。生成网页在独立隔离域安全运行。</p></details><a class="text-link sidebar-motto" href="#/gallery">保持好奇，极致探索。</a></div></aside><button class="nav-backdrop" data-global="close-menu" aria-label="关闭导航" hidden></button><div class="body"><header class="topbar frosted-glass"><div class="row align-center"><button class="btn ghost mobile-menu" data-global="menu" aria-controls="sidebar" aria-expanded="false" aria-label="打开导航">${iconMenu(18)}<span>菜单</span></button><nav class="crumb" aria-label="当前路径"><a class="crumb-root" href="#/explore"><span class="crumb-icon" aria-hidden="true">${iconCompass(14)}</span><span>TiHu</span></a><span class="crumb-separator" aria-hidden="true">${iconChevronRight(12)}</span><strong class="crumb-current" aria-current="page">${esc(title)}</strong></nav></div><div class="topuser">${state.user ? `<div class="user-pill"><span class="avatar" aria-hidden="true">${esc(state.user.username.slice(0, 2).toUpperCase())}</span><span class="username">${esc(state.user.username)}</span>${state.user.role === "admin" ? '<span class="role-tag">Admin</span>' : ""}<button class="btn ghost small user-logout-btn" data-global="logout" title="退出登录" aria-label="退出登录">${iconLogOut(14)}<span>退出</span></button></div>` : `<button class="btn ghost small" data-global="login">${iconUser(14)}<span>登录</span></button>${state.config.registration ? `<button class="btn primary small" data-global="register">${iconPlus(14)}<span>创建账号</span></button>` : ""}`}</div></header><main class="main page-enter" id="main" tabindex="-1" aria-busy="true">${verificationNotice()}<div class="loading" role="status"><span class="loading-dot"></span>正在载入${esc(title)}…</div></main></div></div>`;
    navigation(false, false);
    app.querySelector(".skip-link")?.addEventListener("click", (event) => {
        event.preventDefault();
        app.querySelector("#main")?.focus();
    });
}
function tokenPage(reset) {
    const token = new URLSearchParams(location.hash.split("?")[1] ?? "").get("token") ?? "";
    return {
        html: head(reset ? "设置新密码" : "验证你的邮箱", reset
            ? "密码更新后，之前的登录会话将失效。"
            : "完成邮箱验证，就可以保存连接和开始实验。") +
            `<form class="panel editor-form" id="token-form">${!token ? field("mail-token", "邮件中的一次性令牌", '<input id="mail-token" name="token" required autocomplete="off">') : '<p class="notice">邮件中的一次性令牌已就绪。</p>'}${reset ? field("new-password", "新密码", '<input id="new-password" type="password" name="password" required minlength="12" maxlength="200" autocomplete="new-password">', "至少 12 位；请使用不曾在其他网站使用的密码。") : ""}<button class="btn primary" type="submit">${reset ? "更新密码" : "验证邮箱"}</button></form>${footer()}`,
        mount(root) {
            const form = root.querySelector("form");
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (form.dataset.pending)
                    return;
                const button = form.querySelector("button[type=submit]");
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
                    toast(reset
                        ? "密码已更新，请重新登录。"
                        : "邮箱已验证，现在可以开始实验。");
                    await render();
                    if (reset)
                        authenticate();
                }
                catch (error) {
                    formError(form, error);
                }
                finally {
                    delete form.dataset.pending;
                    button.disabled = false;
                }
            });
        },
    };
}
async function render() {
    const id = ++renderId;
    disposePage?.();
    disposePage = undefined;
    closeDialog();
    const path = (location.hash.slice(1) || "/explore").split("?")[0];
    shell(path);
    const root = app.querySelector("#main");
    try {
        let page;
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
                        html: head("这里没有页面", "入口可能已改变。") +
                            empty("回到实验场", "题目、作品和你的实验都可以从导航进入。", '<a class="btn primary" href="#/explore">探索题目</a>'),
                    };
        }
        if (id !== renderId)
            return;
        root.innerHTML =
            (page.html.includes('data-global="resend-verification"')
                ? ""
                : verificationNotice()) + page.html;
        root.classList.remove("page-enter");
        void root.offsetWidth;
        root.classList.add("page-enter");
        window.scrollTo({ top: 0, behavior: "instant" });
        const cleanup = page.mount?.(root);
        if (cleanup)
            disposePage = cleanup;
        root.setAttribute("aria-busy", "false");
        root.querySelector("h1")?.focus({ preventScroll: true });
    }
    catch (error) {
        if (id !== renderId)
            return;
        root.innerHTML =
            head("页面暂时无法打开", errorText(error)) +
                empty("你的数据不会因这次加载失败而丢失", "可以重新加载此页，或回到探索页面。", '<button class="btn primary" data-global="refresh">重新加载</button> <a class="btn outline" href="#/explore">探索题目</a>');
        root.setAttribute("aria-busy", "false");
    }
}
app.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element))
        return;
    if (target.closest(".sidebar a"))
        navigation(false, false);
    const button = target.closest("[data-global]");
    if (!button || button.disabled)
        return;
    switch (button.dataset.global) {
        case "menu":
            navigation(!navOpen);
            return;
        case "close-menu":
            navigation(false);
            return;
        case "login":
            navigation(false, false);
            authenticate();
            return;
        case "register":
            navigation(false, false);
            authenticate("register");
            return;
        case "refresh":
            refreshPage();
            return;
        case "logout": {
            if (!(await confirmDialog({
                title: "退出当前账号？",
                body: "<p>未提交的实验草稿会清空。已保存的连接和实验记录不受影响。</p>",
                confirm: "退出账号",
            })))
                return;
            try {
                await mutate("/auth/logout", "POST");
                await refreshSession();
                toast("已退出。");
                await render();
            }
            catch (error) {
                toast(errorText(error), true);
            }
            return;
        }
        case "resend-verification": {
            button.disabled = true;
            try {
                await mutate("/auth/resend-verification", "POST");
                toast("验证邮件已发送，请检查收件箱与垃圾邮件文件夹。");
            }
            catch (error) {
                toast(errorText(error), true);
            }
            finally {
                button.disabled = false;
            }
        }
    }
});
document.addEventListener("keydown", (event) => {
    if (!navOpen)
        return;
    if (event.key === "Escape") {
        event.preventDefault();
        navigation(false);
    }
    if (event.key === "Tab") {
        const controls = Array.from(app.querySelectorAll("#sidebar a, #sidebar button, #sidebar summary")).filter((item) => item.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last) {
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
initGlobalMotions();
async function boot() {
    try {
        state.config = await api("/config");
        await refreshSession();
        await render();
    }
    catch (error) {
        app.innerHTML = `<div class="boot">TiHu<span>${esc(errorText(error))}</span><button class="btn primary" id="boot-retry">重新连接</button></div>`;
        app.querySelector("#boot-retry")?.addEventListener("click", () => {
            void boot();
        });
    }
}
void boot();
