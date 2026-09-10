import { api, mutate, state, esc, fmt, date, duration, head, empty, field, badge, footer, authGate, go, query, toast, formError, clearFormError, showDialog, closeDialog, } from "./core.js";
const challengeCopy = {
    "Pelican on a bicycle": {
        title: "鹈鹕骑自行车",
        description: "鸟的身体、自行车的几何，还有一点恰到好处的个性。用 SVG 看看模型如何理解结构。",
        art: "/art/challenge-pelican.svg",
        alt: "戴着头盔的鹈鹕骑自行车",
        rubric: [
            "一眼能认出的鹈鹕",
            "合理的车轮与车架结构",
            "身体、脚踏板与座椅接触可信",
            "画面细节与整体完成度",
        ],
    },
    "A tiny living world": {
        title: "掌心里的小世界",
        description: "在一个网页里构建会呼吸、可互动的迷你生态，观察模型如何组织一个小世界。",
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
        description: "时间要准确，表达可以天马行空。让模型设计一只出人意料、又能读懂的时钟。",
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
const categoryNames = {
    SVG: "SVG 绘图",
    Interactive: "交互体验",
    Creative: "创意表达",
    UI: "界面设计",
};
function challengeCard(item, index) {
    const copy = challengeCopy[item.title];
    return `<article class="card challenge-card"><a href="#/challenge/${esc(item.id)}"><div class="cover">${copy ? `<img src="${copy.art}" alt="${copy.alt}" loading="lazy" width="600" height="360">` : `<div class="generated-mark" aria-hidden="true">${esc(item.category)}</div>`}<span class="cover-num">题目 ${String(index + 1).padStart(2, "0")}</span><span class="cover-type">${esc(categoryNames[item.category] ?? item.category)}</span></div><div class="card-body"><div class="card-kicker">固定版本 · v${item.current_version}</div><h3>${esc(copy?.title ?? item.title)}</h3><p>${esc(copy?.description ?? item.description)}</p><div class="meta"><span>查看任务与评价参考</span><span class="card-arrow">开始挑战 →</span></div></div></a></article>`;
}
function workCard(item, mine = false) {
    const title = challengeCopy[item.title]?.title ?? item.title;
    const art = item.thumbnail_available
        ? `<img class="work-image" src="/api/runs/${esc(item.id)}/thumbnail" alt="${esc(title)}的生成作品预览" loading="lazy" width="960" height="600">`
        : `<div class="work-placeholder"><span>${item.status === "succeeded" ? "暂无缩略图" : item.status === "queued" ? "等待开始" : item.status === "running" ? "正在构建" : "查看运行记录"}</span><small>${item.status === "succeeded" ? "打开作品查看完整效果" : "每一次实验都有自己的记录"}</small></div>`;
    return `<article class="card run-card" data-run-id="${esc(item.id)}">${!mine ? `<a class="work-cover" href="#/run/${esc(item.id)}">${art}</a>` : ""}<div class="card-body"><div class="row between">${mine ? badge(item.status) : badge(item.track)}<span class="help">${date(item.created)}</span></div><h3><a href="#/run/${esc(item.id)}">${esc(title)}</a></h3><p class="model-name">${esc(item.model)}</p><p class="help">v${item.version} · @${esc(item.username)}${mine ? ` · ${item.published ? "已公开" : "仅自己可见"}` : ""}</p>${mine ? `<div class="row">${badge(item.track)}${item.metrics?.elapsed_ms != null ? `<span class="help">${duration(item.metrics.elapsed_ms)}</span>` : ""}</div>` : ""}${mine && item.error ? '<p class="notice warn">实验未完成，打开记录查看原因和下一步。</p>' : ""}<div class="meta"><span>能力 ${fmt(item.capability)} · 趣味 ${fmt(item.funny)}</span><a class="text-link" href="#/run/${esc(item.id)}">${item.status === "succeeded" ? "查看作品" : "查看记录"} →</a></div>${item.status === "succeeded" ? `<label class="check compare-pick"><input type="checkbox" data-compare="${esc(item.id)}">加入同条件对比</label>` : ""}</div></article>`;
}
function pageControls(page) {
    return `<div class="pager"><p class="help" id="result-count">已展示 ${page.items.length} / ${fmt(page.total)} 项</p><button class="btn outline" id="load-more" ${!page.next_cursor ? "hidden" : ""}>加载更多</button></div>`;
}
function mountFeed(root, url, first, renderer) {
    const controller = new AbortController();
    const grid = root.querySelector("#feed");
    const more = root.querySelector("#load-more");
    let cursor = first.next_cursor;
    let count = first.items.length;
    const seen = new Set(first.items.map((item) => item.id));
    more.addEventListener("click", async () => {
        if (!cursor || more.disabled)
            return;
        more.disabled = true;
        more.textContent = "正在加载…";
        try {
            const page = await api(url +
                (url.includes("?") ? "&" : "?") +
                "cursor=" +
                encodeURIComponent(cursor), { signal: controller.signal });
            if (controller.signal.aborted)
                return;
            for (const item of page.items)
                if (!seen.has(item.id)) {
                    seen.add(item.id);
                    grid.insertAdjacentHTML("beforeend", renderer(item, count++));
                }
            cursor = page.next_cursor;
            more.hidden = !cursor;
            root.querySelector("#result-count").textContent =
                `已展示 ${count} / ${fmt(page.total)} 项`;
        }
        catch (error) {
            if (!controller.signal.aborted)
                toast(error instanceof Error && error.name === "AbortError"
                    ? "请求已取消。"
                    : "暂时无法加载更多，请重试。", true);
        }
        finally {
            more.disabled = false;
            more.textContent = "加载更多";
        }
    }, { signal: controller.signal });
    return () => controller.abort();
}
function bindFilter(root, base) {
    const form = root.querySelector("[data-filters]");
    if (!form)
        return;
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
        .forEach((select) => select.addEventListener("change", () => form.requestSubmit()));
}
function compareBar() {
    return '<section class="compare-bar" id="compare-bar" aria-label="作品对比" hidden><p id="compare-note" role="status">已选择 1 个作品，再选择一个同条件作品。</p><div class="actions"><button class="btn ghost" id="compare-clear">清空选择</button><button class="btn primary" id="compare-open" disabled>并排对比</button></div></section>';
}
function bindComparison(root) {
    const selected = [];
    const controller = new AbortController();
    root.addEventListener("change", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.dataset.compare)
            return;
        const id = target.dataset.compare;
        if (target.checked && selected.length === 2) {
            target.checked = false;
            toast("一次比较两个作品，请先取消一个选择。");
            return;
        }
        if (target.checked)
            selected.push(id);
        else
            selected.splice(selected.indexOf(id), 1);
        const bar = root.querySelector("#compare-bar");
        bar.hidden = selected.length === 0;
        root.querySelector("#compare-note").textContent =
            selected.length === 2
                ? "已选择 2 个作品。进入后将核对题目、版本、赛道与运行环境。"
                : "已选择 1 个作品，再选择一个同条件作品。";
        root.querySelector("#compare-open").disabled =
            selected.length !== 2;
    }, { signal: controller.signal });
    root.querySelector("#compare-clear")?.addEventListener("click", () => {
        selected.length = 0;
        root
            .querySelectorAll("[data-compare]")
            .forEach((input) => (input.checked = false));
        root.querySelector("#compare-bar").hidden = true;
    });
    root.querySelector("#compare-open")?.addEventListener("click", () => {
        if (selected.length === 2)
            go("/compare?runs=" + selected.join(","));
    });
    return () => controller.abort();
}
export async function explorePage() {
    const q = query();
    const params = new URLSearchParams({
        limit: "12",
        q: q.get("q") ?? "",
        category: q.get("category") ?? "",
    });
    const url = "/challenges?" + params;
    const [page, stats] = await Promise.all([
        api(url),
        api("/stats"),
    ]);
    return {
        html: `<section class="hero"><div class="hero-copy"><div class="eyebrow">TIHU · 模型实验场</div><h1 tabindex="-1">同一道题，<br>让模型各显其能。</h1><p>接上自己的模型，完成一次真实构建。先私下预览，再把值得分享的作品带给社区。</p><div class="hero-actions"><a class="btn primary" href="#/studio">开始一次实验 →</a><a class="btn light" href="#/gallery">看看模型的作品</a></div></div><div class="hero-art"><img src="/art/pelican.svg" alt="TiHu 的鹈鹕骑着自行车，驶入模型实验场" width="700" height="480"></div></section>${stats.works ? `<div class="stats"><div class="stat"><strong>${fmt(stats.challenges)}</strong><span>开放题目</span></div><div class="stat"><strong>${fmt(stats.works)}</strong><span>真实公开作品</span></div><div class="stat"><strong>${fmt(stats.models)}</strong><span>参与模型</span></div></div>` : '<ol class="onboarding"><li><span>1</span><div><strong>选一道题</strong><p>任务和评价参考都公开</p></div></li><li><span>2</span><div><strong>接上模型</strong><p>使用自己的低额度 API Key</p></div></li><li><span>3</span><div><strong>观察结果</strong><p>私下预览，自主决定公开</p></div></li></ol>'}<div class="section-head"><div><h2>从一道好题开始</h2><p>保持任务条件一致，观察每个模型的不同选择。</p></div><a class="btn outline" href="#/new-challenge">创建题目</a></div><form class="filter-bar" data-filters role="search">${field("challenge-search", "搜索题目", `<input id="challenge-search" name="q" type="search" value="${esc(q.get("q"))}" placeholder="题目名称或内容">`)}${field("challenge-category", "分类", `<select id="challenge-category" name="category"><option value="">全部分类</option>${state.config.categories.map((category) => `<option value="${esc(category)}" ${category === q.get("category") ? "selected" : ""}>${esc(categoryNames[category] ?? category)}</option>`).join("")}</select>`)}<button class="btn outline" type="submit">搜索</button></form><div class="grid" id="feed">${page.items.length ? page.items.map(challengeCard).join("") : empty("没有找到匹配的题目", "试试其他关键词，或创建一道人们愿意挑战的新题。", '<a class="btn outline" href="#/explore">清除筛选</a>')}</div>${pageControls(page)}${footer()}`,
        mount(root) {
            bindFilter(root, "/explore");
            return mountFeed(root, url, page, challengeCard);
        },
    };
}
export async function galleryPage(mine = false) {
    if (mine && !state.user)
        return authGate();
    const q = query();
    const params = new URLSearchParams({
        mine: String(mine),
        limit: "12",
        q: q.get("q") ?? "",
        track: q.get("track") ?? "all",
    });
    if (mine) {
        params.set("status", q.get("status") ?? "all");
        params.set("published", q.get("published") ?? "all");
    }
    if (q.get("challenge"))
        params.set("challenge", q.get("challenge"));
    if (q.get("version"))
        params.set("version", q.get("version"));
    const url = "/runs?" + params;
    const page = await api(url);
    const trackOptions = `<select id="run-track" name="track">${[
        ["all", "全部赛道"],
        ["standard", "标准赛道"],
        ["open", "开放赛道"],
    ]
        .map(([value, label]) => `<option value="${value}" ${value === (q.get("track") ?? "all") ? "selected" : ""}>${label}</option>`)
        .join("")}</select>`;
    return {
        html: head(mine ? "我的实验" : "作品画廊", mine
            ? "每一次探索都有记录。未公开的实验仅对你可见。"
            : "这里的每件作品，都来自一次真实的模型实验。", '<a class="btn primary" href="#/studio">开始新实验</a>') +
            (mine && state.quota
                ? `<div class="notice row between"><span>最近 24 小时剩余 <strong>${state.quota.daily_remaining}</strong> / ${state.quota.daily_limit} 次</span><span>活跃实验 ${state.quota.active} / ${state.quota.active_limit}</span></div>`
                : "") +
            `<form class="filter-bar" data-filters role="search">${field("run-search", "搜索实验", `<input id="run-search" name="q" type="search" value="${esc(q.get("q"))}" placeholder="题目、模型或作者">`)}${field("run-track", "赛道", trackOptions)}${mine
                ? field("run-status", "运行状态", `<select id="run-status" name="status">${[
                    ["all", "全部状态"],
                    ["queued", "排队中"],
                    ["running", "运行中"],
                    ["succeeded", "已完成"],
                    ["failed", "未完成"],
                    ["canceled", "已取消"],
                ]
                    .map(([value, label]) => `<option value="${value}" ${value === (q.get("status") ?? "all") ? "selected" : ""}>${label}</option>`)
                    .join("")}</select>`) +
                    field("run-published", "公开状态", `<select id="run-published" name="published"><option value="all">全部</option><option value="private" ${q.get("published") === "private" ? "selected" : ""}>仅自己可见</option><option value="public" ${q.get("published") === "public" ? "selected" : ""}>已公开</option></select>`)
                : ""}<button class="btn outline" type="submit">搜索</button></form><div class="grid" id="feed">${page.items.length ? page.items.map((item) => workCard(item, mine)).join("") : empty(mine ? "这里等待你的下一次实验" : "还没有匹配的公开作品", mine ? "选一道题、接上模型，实验记录会保存在这里。" : "只有作者主动公开的成功作品才会出现。不同筛选条件下可能暂时没有作品。", '<a class="btn primary" href="#/studio">开始一次实验</a>')}</div>${pageControls(page)}${compareBar()}${footer()}`,
        mount(root) {
            bindFilter(root, mine ? "/my-runs" : "/gallery");
            const disposeFeed = mountFeed(root, url, page, (item) => workCard(item, mine));
            const disposeComparison = bindComparison(root);
            return () => {
                disposeFeed();
                disposeComparison();
            };
        },
    };
}
export async function challengePage(id) {
    const challenge = await api("/challenges/" + encodeURIComponent(id));
    const q = query();
    const version = q.has("version")
        ? challenge.versions.find((item) => item.id === q.get("version"))
        : challenge.versions[0];
    if (!version)
        return {
            html: head("找不到这个题目版本", "历史作品没有被删除，请从有效版本进入。") +
                empty("版本不存在", "返回题目后选择已有版本。", `<a class="btn outline" href="#/challenge/${esc(id)}">返回题目</a>`),
        };
    const copy = challengeCopy[challenge.title];
    const url = "/runs?" +
        new URLSearchParams({ challenge: id, version: version.id, limit: "12" });
    const page = await api(url);
    return {
        html: head(copy?.title ?? challenge.title, copy?.description ?? challenge.description, `<a class="btn primary" href="#/studio?challenge=${esc(id)}&version=${esc(version.id)}">挑战这道题</a>${challenge.can_edit ? '<button class="btn outline" id="new-version">发布新版本</button>' : ""}`) +
            `<section class="panel challenge-detail"><div class="row between"><div class="row">${badge(challenge.category)}${badge("v" + version.number, "版本 " + version.number)}</div><form data-filters>${field("task-version", "查看版本", `<select id="task-version" name="version">${challenge.versions.map((item) => `<option value="${esc(item.id)}" ${item.id === version.id ? "selected" : ""}>v${item.number}${item.number === challenge.current_version ? " · 当前版本" : " · 历史版本"}</option>`).join("")}</select>`)}<button class="btn outline small" type="submit">查看版本</button></form></div>${copy ? `<h2>评价时，留意这些细节</h2><ul class="rubric-list">${copy.rubric.map((line) => `<li>${esc(line)}</li>`).join("")}</ul><p class="help">以上为入门说明；实际执行以下冻结的任务原文和评价参考。</p>` : ""}<details class="details" open><summary>本版本任务原文</summary><pre class="code">${esc(version.prompt)}</pre><h3>评价参考原文</h3><p class="break-word">${esc(version.rubric)}</p><p class="help mono">版本指纹 ${esc(version.sha256)}</p></details></section><div class="section-head"><div><h2>这个版本的作品</h2><p>当前查看 v${version.number}，可随时切换历史版本。</p></div><a class="btn outline" href="#/leaderboard?challenge=${esc(id)}&version=${esc(version.id)}">查看同题榜单</a></div><div class="grid" id="feed">${page.items.length ? page.items.map((item) => workCard(item)).join("") : empty("这个版本还没有公开作品", "完成一次实验，先私下预览，再决定是否分享。", `<a class="btn primary" href="#/studio?challenge=${esc(id)}&version=${esc(version.id)}">成为第一位挑战者</a>`)}</div>${pageControls(page)}${compareBar()}${footer()}`,
        mount(root) {
            bindFilter(root, "/challenge/" + id);
            const disposeFeed = mountFeed(root, url, page, (item) => workCard(item));
            const disposeComparison = bindComparison(root);
            root.querySelector("#new-version")?.addEventListener("click", () => {
                const dialog = showDialog("发布题目新版本", `<p class="notice">旧版本与旧作品都会保留。新提示词只用于之后选择此版本的实验。</p><form id="version-form">${field("version-prompt", "任务提示词", `<textarea id="version-prompt" name="prompt" rows="8" required minlength="10" maxlength="6000">${esc(version.prompt)}</textarea>`)}${field("version-rubric", "评价参考", `<textarea id="version-rubric" name="rubric" rows="4" required minlength="3" maxlength="3000">${esc(version.rubric)}</textarea>`)}<button class="btn primary" type="submit">发布不可变新版本</button></form>`);
                const form = dialog.querySelector("form");
                form.addEventListener("submit", async (event) => {
                    event.preventDefault();
                    if (form.dataset.pending)
                        return;
                    form.dataset.pending = "true";
                    const button = form.querySelector("button[type=submit]");
                    button.disabled = true;
                    clearFormError(form);
                    try {
                        const values = new FormData(form);
                        const result = await mutate("/challenges/" + id + "/versions", "POST", { prompt: values.get("prompt"), rubric: values.get("rubric") });
                        closeDialog();
                        toast("新版本已发布，旧作品仍可从历史版本查看。");
                        go("/challenge/" + id + "?version=" + result.id);
                    }
                    catch (error) {
                        formError(form, error);
                    }
                    finally {
                        delete form.dataset.pending;
                        button.disabled = false;
                    }
                });
            });
            return () => {
                disposeFeed();
                disposeComparison();
            };
        },
    };
}
export async function leaderboardPage() {
    const q = query();
    const group = q.get("group") === "models" ? "models" : "works";
    const kind = q.get("kind") === "funny" ? "funny" : "capability";
    const params = new URLSearchParams({
        group,
        kind,
        track: q.get("track") ?? "standard",
        days: q.get("days") ?? "0",
        limit: "50",
    });
    if (q.get("challenge"))
        params.set("challenge", q.get("challenge"));
    if (q.get("version"))
        params.set("version", q.get("version"));
    const [board, tasks] = await Promise.all([
        api("/leaderboard?" + params),
        api("/challenges?limit=100"),
    ]);
    const challenge = q.get("challenge")
        ? await api("/challenges/" + q.get("challenge"))
        : null;
    if (challenge && !tasks.items.some((item) => item.id === challenge.id))
        tasks.items.push(challenge);
    const rows = board.items
        .map((item, index) => {
        const work = "id" in item;
        return `<tr><td class="rank">${index + 1}</td><td>${work ? `<a class="text-link" href="#/run/${esc(item.id)}">${esc(item.model)}</a><p class="help">${esc(challengeCopy[item.title]?.title ?? item.title)} · v${item.version}</p>` : `<strong>${esc(item.model)}</strong><p class="help break-word">${esc(item.provider)}</p>`}</td><td>${badge(item.track)}</td><td class="score">${fmt(work ? item[kind] : item.score)}</td><td>${work ? `@${esc(item.username)}<p class="help">${date(item.created)}</p>` : `${fmt(item.entries)} 件作品<p class="help">${fmt(item.authors)} 位作者 · ${fmt(item.challenges)} 道题</p>`}</td></tr>`;
    })
        .join("");
    const filterSelect = (id, label, options, current) => field(id, label, `<select id="${id}" name="${id.replace("board-", "")}">${options.map(([value, text]) => `<option value="${esc(value)}" ${value === current ? "selected" : ""}>${esc(text)}</option>`).join("")}</select>`);
    return {
        html: head("社区排行榜", "看大家更喜欢什么，而不是给模型贴上一个智力分数。") +
            `<form class="filter-bar board-filters" data-filters>${filterSelect("board-group", "榜单", [
                ["works", "作品榜"],
                ["models", "模型榜"],
            ], group)}${filterSelect("board-kind", "投票维度", [
                ["capability", "能力"],
                ["funny", "趣味"],
            ], kind)}${filterSelect("board-track", "实验赛道", [
                ["standard", "标准赛道"],
                ["open", "开放赛道"],
            ], params.get("track"))}${filterSelect("board-days", "作品创建时间", [
                ["0", "全部时间"],
                ["7", "近 7 天新作"],
                ["30", "近 30 天新作"],
            ], params.get("days"))}${field("board-challenge", "题目", `<select id="board-challenge" name="challenge"><option value="">全部题目</option>${tasks.items.map((item) => `<option value="${esc(item.id)}" ${item.id === challenge?.id ? "selected" : ""}>${esc(challengeCopy[item.title]?.title ?? item.title)}</option>`).join("")}</select>`)}${challenge ? field("board-version", "题目版本", `<select id="board-version" name="version">${challenge.versions.map((item) => `<option value="${esc(item.id)}" ${item.id === (q.get("version") ?? challenge.versions[0].id) ? "selected" : ""}>v${item.number}</option>`).join("")}</select>`) : ""}<button class="btn outline" type="submit">应用筛选</button></form><div class="notice"><strong>${group === "models" ? "先去重，再汇总支持" : "只在一致条件下比较"}</strong><p>${group === "models" ? "每位作者在同题、同版本、同服务商模型下仅保留最高得票作品，再汇总票数。作者数不是投票人数，样本较少时请谨慎解读。" : "默认使用当前运行环境和题目最新版本；选择题目后可切换历史版本。标准与开放赛道分开查看。"} 时间筛选按作品创建时间计算，票数是这些作品的累计票数。</p></div><div class="table" tabindex="0" role="region" aria-label="排行榜，可横向滚动"><table><caption class="sr-only">${group === "models" ? "模型" : "作品"}${kind === "capability" ? "能力" : "趣味"}榜</caption><thead><tr><th scope="col">排名</th><th scope="col">${group === "models" ? "服务商与模型" : "作品与模型"}</th><th scope="col">赛道</th><th scope="col">累计票数</th><th scope="col">${group === "models" ? "有效样本" : "作者与时间"}</th></tr></thead><tbody>${rows || '<tr><td colspan="5">这个条件下还没有公开作品。换个筛选，或成为第一个参与者。</td></tr>'}</tbody></table></div><p class="help">显示当前条件下前 50 项。不同运行环境、版本与服务商不会被悄悄合并。</p>${footer()}`,
        mount(root) {
            const challengeSelect = root.querySelector("#board-challenge");
            challengeSelect.addEventListener("change", () => {
                const versionSelect = root.querySelector("#board-version");
                if (versionSelect)
                    versionSelect.disabled = true;
            });
            bindFilter(root, "/leaderboard");
        },
    };
}
export function newChallengePage() {
    if (!state.user)
        return authGate();
    return {
        html: head("创建一道新题", "清楚的任务和评价参考，是有意义的模型比较的开始。") +
            `<form class="panel editor-form" id="challenge-form">${field("new-title", "题目名称", '<input id="new-title" name="title" required minlength="3" maxlength="100" placeholder="让人愿意挑战的具体问题">')}<div class="form-grid">${field("new-category", "分类", `<select id="new-category" name="category">${state.config.categories.map((category) => `<option value="${esc(category)}">${esc(categoryNames[category] ?? category)}</option>`).join("")}</select>`)}${field("new-description", "简介", '<input id="new-description" name="description" required minlength="10" maxlength="1500" placeholder="用一两句话说明挑战的价值">')}</div>${field("new-prompt", "固定任务提示词", '<textarea id="new-prompt" name="prompt" rows="8" required minlength="10" maxlength="6000" placeholder="说明要生成什么、必须满足什么条件，以及不能做什么。"></textarea>', "发布后内容不可直接覆盖；修改会创建新版本。")}${field("new-rubric", "评价参考", '<textarea id="new-rubric" name="rubric" rows="4" required minlength="3" maxlength="3000" placeholder="例如：功能正确、结构合理、交互可访问、具有创意。"></textarea>')}<p class="notice">题目和评价参考会公开。不要写入秘密或个人敏感信息。</p><button class="btn primary" type="submit" ${!state.user.verified ? "disabled" : ""}>发布题目</button></form>${footer()}`,
        mount(root) {
            const form = root.querySelector("form");
            form.addEventListener("submit", async (event) => {
                event.preventDefault();
                if (form.dataset.pending)
                    return;
                form.dataset.pending = "true";
                const button = form.querySelector("button[type=submit]");
                button.disabled = true;
                clearFormError(form);
                try {
                    const values = new FormData(form);
                    const result = await mutate("/challenges", "POST", Object.fromEntries(values));
                    toast("题目已发布。");
                    go("/challenge/" + result.id);
                }
                catch (error) {
                    formError(form, error);
                }
                finally {
                    delete form.dataset.pending;
                    button.disabled = !state.user?.verified;
                }
            });
        },
    };
}
