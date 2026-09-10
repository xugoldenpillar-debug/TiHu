import { api, mutate, state, esc, date, head, empty, field, footer, authGate, verificationNotice, toast, formError, clearFormError, confirmDialog, errorText, } from "./core.js";
function mountScope(root, setup) {
    const controller = new AbortController();
    setup({ live: () => !controller.signal.aborted, signal: controller.signal });
    return () => {
        controller.abort();
        root
            .querySelectorAll('input[type="password"]')
            .forEach((input) => {
            input.value = "";
        });
    };
}
function statusBox() {
    return '<div data-status role="status" aria-live="polite" hidden></div>';
}
function status(container, message, kind = "success") {
    const box = container.querySelector("[data-status]");
    if (!box)
        return;
    box.className = `notice ${kind}`;
    box.textContent = message;
    box.hidden = !message;
}
async function submit(form, scope, label, action) {
    if (form.getAttribute("aria-busy") === "true")
        return;
    clearFormError(form);
    status(form, label, "");
    form.setAttribute("aria-busy", "true");
    const controls = Array.from(form.querySelectorAll("button,input,select,textarea"));
    const disabled = controls.map((control) => control.disabled);
    controls.forEach((control) => {
        control.disabled = true;
    });
    try {
        await action();
    }
    catch (error) {
        if (scope.live()) {
            status(form, "");
            formError(form, error);
        }
    }
    finally {
        if (scope.live()) {
            form.removeAttribute("aria-busy");
            controls.forEach((control, index) => {
                control.disabled = disabled[index];
            });
        }
    }
}
async function act(button, container, scope, pending, action) {
    if (button.disabled || container.getAttribute("aria-busy") === "true")
        return;
    container.setAttribute("aria-busy", "true");
    const label = button.textContent;
    button.disabled = true;
    button.textContent = pending;
    status(container, pending, "");
    try {
        await action();
    }
    catch (error) {
        if (scope.live())
            status(container, errorText(error), "error");
    }
    finally {
        if (scope.live()) {
            container.removeAttribute("aria-busy");
            button.disabled = false;
            button.textContent = label;
        }
    }
}
function locked() {
    return state.user?.verified ? "" : " disabled";
}
function idPath(id) {
    return encodeURIComponent(id);
}
function actionButton(event) {
    return event.target instanceof Element
        ? event.target.closest("button[data-action]")
        : null;
}
const protocols = {
    openai: "OpenAI Chat Completions",
    responses: "OpenAI Responses",
    anthropic: "Anthropic Messages",
};
function providerPreset(base) {
    const host = new URL(base).hostname;
    if (host === "api.anthropic.com")
        return { name: "Anthropic", protocol: "anthropic" };
    if (host === "api.openai.com")
        return { name: "OpenAI", protocol: "openai" };
    if (host === "api.deepseek.com")
        return { name: "DeepSeek", protocol: "openai" };
    if (host === "openrouter.ai")
        return { name: "OpenRouter", protocol: "openai" };
    if (host === "generativelanguage.googleapis.com")
        return { name: "Gemini · OpenAI 兼容", protocol: "openai" };
    return { name: host, protocol: "openai" };
}
function modelsHtml(models, search = "") {
    const found = models.filter((model) => model.toLowerCase().includes(search.trim().toLowerCase()));
    return `${models.length ? `<p class="help">显示 ${found.length} / ${models.length} 个模型。发现成功不代表该 Key 有每个模型的调用权限；实际费用由服务商收取。</p>` : ""}${found.length ? `<ul class="summary-list">${found.map((model) => `<li class="mono">${esc(model)}</li>`).join("")}</ul>` : `<p class="muted">${models.length ? "没有匹配的模型，试试其他关键词。" : "尚无可用模型。点击“检测模型”；若服务商未开放模型目录，请检查 Key 权限或选择其他连接。"}</p>`}`;
}
function connectionHtml(key) {
    return `<article class="panel library-card" data-key="${esc(key.id)}"><div class="row between"><div><h3>${esc(key.label)}</h3><p class="mono">••••${esc(key.last4)}</p></div><div class="actions"><button class="btn outline small" data-action="discover">检测模型</button><button class="btn danger small" data-action="revoke">撤销连接</button></div></div><p class="help mono">${esc(key.base_url)}</p><p class="meta">${esc(protocols[key.protocol] || key.protocol)} · 创建于 ${esc(date(key.created))}</p>${statusBox()}<details class="details"><summary>模型目录（<span data-model-count>${key.models.length}</span>）</summary>${field(`models-${key.id}`, "搜索模型", `<input id="models-${esc(key.id)}" type="search" data-model-search placeholder="输入模型名称">`)}<div data-models>${modelsHtml(key.models)}</div></details></article>`;
}
export async function connectionsPage() {
    if (!state.user)
        return authGate();
    const keys = await api("/keys");
    const bases = state.config.providers || [];
    const first = bases[0] ? providerPreset(bases[0]).protocol : "openai";
    return {
        html: `${head("API 连接", "自己的 Key，自己的额度。先保存连接，再确认服务商提供的模型。")}${verificationNotice()}<div class="two"><section class="stack"><div class="section-head"><h2>已保存连接</h2><span class="muted" data-key-count>${keys.length} 个</span></div><div class="stack" data-key-list>${keys.length ? keys.map(connectionHtml).join("") : empty("还没有连接", "在右侧添加专用低额度 Key，保存后会自动检测模型。")}</div></section><form class="panel stack" data-key-form><h2>添加连接</h2><p class="notice warn">建议使用专用低额度 Key，并在服务商侧设置消费上限。Key 加密保存在服务端，不写入浏览器存储，也不会进入实验沙箱。</p>${field("connection-label", "连接名称", '<input id="connection-label" name="label" required maxlength="60" placeholder="我的低额度测试连接">')}${field("connection-base", "服务商与 API 地址", `<select id="connection-base" name="base_url" required>${bases.map((base) => `<option value="${esc(base)}">${esc(providerPreset(base).name)} — ${esc(base)}</option>`).join("")}</select>`, "仅可使用管理员允许的地址；选择服务商会应用协议预设，不会扩大访问白名单。")}${field("connection-protocol", "请求协议", `<select id="connection-protocol" name="protocol">${Object.entries(protocols)
            .map(([value, label]) => `<option value="${value}"${value === first ? " selected" : ""}>${label}</option>`)
            .join("")}</select>`, "兼容服务商默认使用 Chat Completions；若服务商要求 Responses，可在此切换。")}${field("connection-secret", "API Key", '<input id="connection-secret" name="api_key" type="password" required minlength="8" maxlength="500" autocomplete="off" spellcheck="false">', "保存后只显示末四位，不能再次查看完整 Key。")}${!bases.length ? '<p class="notice warn">管理员尚未配置允许的服务商，请联系管理员后再添加连接。</p>' : ""}${statusBox()}<button class="btn primary full" type="submit"${!bases.length ? " disabled" : locked()}>保存并检测模型</button><p class="help">只检测模型目录，不创建实验、不调用付费生成模型。</p></form></div>${footer()}`,
        mount(root) {
            return mountScope(root, (scope) => {
                const form = root.querySelector("[data-key-form]");
                const list = root.querySelector("[data-key-list]");
                const draw = () => {
                    list.innerHTML = keys.length
                        ? keys.map(connectionHtml).join("")
                        : empty("还没有连接", "添加一个专用低额度 Key，开始准备实验。");
                    root.querySelector("[data-key-count]").textContent =
                        `${keys.length} 个`;
                };
                const updateModels = (card, key) => {
                    card.querySelector("[data-model-count]").textContent = String(key.models.length);
                    card.querySelector("[data-models]").innerHTML = modelsHtml(key.models, card.querySelector("[data-model-search]").value);
                    card.querySelector("details").open = true;
                };
                form
                    .querySelector('[name="base_url"]')
                    .addEventListener("change", (event) => {
                    form.querySelector('[name="protocol"]').value = providerPreset(event.target.value).protocol;
                }, { signal: scope.signal });
                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    const data = new FormData(form);
                    const body = {
                        label: String(data.get("label")),
                        base_url: String(data.get("base_url")),
                        protocol: String(data.get("protocol")),
                        api_key: String(data.get("api_key")),
                    };
                    void submit(form, scope, "正在加密保存连接…", async () => {
                        let saved;
                        try {
                            saved = await mutate("/keys", "POST", body);
                        }
                        finally {
                            body.api_key = "";
                        }
                        if (!scope.live())
                            return;
                        form.reset();
                        form.querySelector('[name="protocol"]').value = first;
                        status(form, "连接已保存，正在检测模型；请勿重复添加。", "");
                        // Saving and discovery are separate operations: a failed discovery must never resubmit the key.
                        let discovery = null;
                        let discoveryError;
                        try {
                            discovery = await mutate(`/keys/${idPath(saved.id)}/models`, "POST");
                        }
                        catch (error) {
                            discoveryError = error;
                        }
                        if (!scope.live())
                            return;
                        try {
                            const fresh = await api("/keys");
                            if (!scope.live())
                                return;
                            keys.splice(0, keys.length, ...fresh);
                            draw();
                        }
                        catch (error) {
                            if (scope.live())
                                status(form, `连接已保存${discovery ? `，检测到 ${discovery.models.length} 个模型` : "，模型检测未完成"}，但列表刷新失败：${errorText(error)}。请重新打开本页，不要重复添加。`, "warn");
                            return;
                        }
                        if (discovery) {
                            status(form, discovery.models.length
                                ? `连接已保存，检测到 ${discovery.models.length} 个模型。可前往实验室使用。`
                                : "连接已保存，但服务商返回空模型目录。请检查 Key 的模型权限，再在连接卡片中检测。", discovery.models.length ? "success" : "warn");
                            toast("连接已保存");
                        }
                        else {
                            status(form, `连接已保存，但模型检测失败：${errorText(discoveryError)}。不要重复添加；请检查服务商状态与权限，再点击该连接的“检测模型”。协议或 Key 填错时，请先撤销再添加。`, "warn");
                        }
                    });
                }, { signal: scope.signal });
                list.addEventListener("input", (event) => {
                    const input = event.target;
                    if (!input.matches("[data-model-search]"))
                        return;
                    const card = input.closest("[data-key]");
                    const key = keys.find((key) => key.id === card.dataset.key);
                    card.querySelector("[data-models]").innerHTML = modelsHtml(key.models, input.value);
                }, { signal: scope.signal });
                list.addEventListener("click", (event) => {
                    const button = actionButton(event);
                    const card = button?.closest("[data-key]");
                    if (!button || !card)
                        return;
                    const key = keys.find((key) => key.id === card.dataset.key);
                    void act(button, card, scope, "处理中…", async () => {
                        if (button.dataset.action === "discover") {
                            const result = await mutate(`/keys/${idPath(key.id)}/models`, "POST");
                            if (!scope.live())
                                return;
                            key.models = result.models;
                            updateModels(card, key);
                            status(card, result.models.length
                                ? `检测完成：${result.models.length} 个模型。`
                                : "检测完成，但服务商没有返回模型。请检查 Key 权限。", result.models.length ? "success" : "warn");
                        }
                        else if (button.dataset.action === "revoke") {
                            const confirmed = await confirmDialog({
                                title: "撤销这个连接？",
                                body: `<p>将删除“${esc(key.label)}”的加密 Key，并取消仍在排队或运行、使用此连接的实验。已完成实验不会因此删除。</p><p>此操作不能撤销；服务商侧 Key 本身不会被吊销，如有泄漏仍需去服务商控制台撤销。</p>`,
                                confirm: "撤销连接",
                                danger: true,
                            });
                            if (!confirmed || !scope.live()) {
                                if (scope.live())
                                    status(card, "");
                                return;
                            }
                            await mutate(`/keys/${idPath(key.id)}`, "DELETE");
                            if (!scope.live())
                                return;
                            keys.splice(keys.indexOf(key), 1);
                            draw();
                            toast("连接已撤销");
                        }
                    });
                }, { signal: scope.signal });
            });
        },
    };
}
function promptHtml(prompt) {
    return `<article class="panel library-card" data-prompt="${esc(prompt.id)}"><h3>${esc(prompt.name)}</h3><pre class="code">${esc(prompt.body)}</pre><div class="actions"><button class="btn outline small" data-action="edit"${locked()}>编辑</button><button class="btn outline small" data-action="duplicate"${locked()}>复制为新模板</button><button class="btn ghost small" data-action="clipboard">复制正文</button><button class="btn danger small" data-action="delete">删除</button></div>${statusBox()}</article>`;
}
export async function promptsPage() {
    if (!state.user)
        return authGate();
    const prompts = await api("/prompts");
    const limit = state.config.limits?.prompts ?? 30;
    return {
        html: `${head("提示词库", "把有效的附加指令留作模板；每次实验使用独立的内容快照。")}${verificationNotice()}<div class="two"><section class="stack">${field("prompt-search", "搜索提示词", '<input id="prompt-search" type="search" placeholder="搜索名称或正文">')}<p class="help" data-prompt-count></p><div class="stack" data-prompt-list></div></section><form class="panel stack" data-prompt-form><h2 data-editor-title>保存新模板</h2><p class="help">模板只属于你。编辑或删除不会修改已有实验，也不会覆盖实验室里已经填入的草稿。</p>${field("prompt-name", "模板名称", '<input id="prompt-name" name="name" required maxlength="80">')}${field("prompt-body", "附加提示词", '<textarea id="prompt-body" name="body" required rows="12" maxlength="5000"></textarea>', "最多 5,000 字符。实验题目的冻结提示词不会在这里改变。")}${statusBox()}<div class="actions"><button class="btn primary" type="submit"${locked()}>保存模板</button><button class="btn ghost" type="button" data-action="cancel-edit" hidden>取消编辑</button></div></form></div>${footer()}`,
        mount(root) {
            return mountScope(root, (scope) => {
                const list = root.querySelector("[data-prompt-list]");
                const search = root.querySelector("#prompt-search");
                const form = root.querySelector("[data-prompt-form]");
                const name = form.querySelector('[name="name"]');
                const body = form.querySelector('[name="body"]');
                const cancel = form.querySelector('[data-action="cancel-edit"]');
                let editing = null;
                const draw = () => {
                    const term = search.value.trim().toLowerCase();
                    const found = prompts.filter((prompt) => `${prompt.name}\n${prompt.body}`.toLowerCase().includes(term));
                    root.querySelector("[data-prompt-count]").textContent =
                        `显示 ${found.length} / ${prompts.length} 个模板 · 最多 ${limit} 个`;
                    list.innerHTML = found.length
                        ? found.map(promptHtml).join("")
                        : empty(prompts.length ? "没有匹配的模板" : "还没有提示词模板", prompts.length
                            ? "换一个名称或正文关键词。"
                            : "把有效的附加指令粘贴到右侧，保存后可在实验室选择。");
                };
                const resetEditor = () => {
                    editing = null;
                    form.reset();
                    cancel.hidden = true;
                    form.querySelector("[data-editor-title]").textContent = "保存新模板";
                    form.querySelector('[type="submit"]').textContent = "保存模板";
                    clearFormError(form);
                    status(form, "");
                };
                draw();
                search.addEventListener("input", draw, { signal: scope.signal });
                cancel.addEventListener("click", resetEditor, { signal: scope.signal });
                form.addEventListener("submit", (event) => {
                    event.preventDefault();
                    const target = editing;
                    const payload = { name: name.value.trim(), body: body.value };
                    void submit(form, scope, "正在保存模板…", async () => {
                        if (!payload.name || !payload.body.trim())
                            throw new Error("请填写模板名称和正文。");
                        if (target) {
                            await mutate(`/prompts/${idPath(target)}`, "PUT", payload);
                            if (!scope.live())
                                return;
                            Object.assign(prompts.find((prompt) => prompt.id === target), payload);
                        }
                        else {
                            const saved = await mutate("/prompts", "POST", payload);
                            if (!scope.live())
                                return;
                            prompts.unshift({ id: saved.id, ...payload });
                        }
                        resetEditor();
                        draw();
                        status(form, target
                            ? "模板已更新，已有实验保持不变。"
                            : "模板已保存，可在实验室的提示词选项中使用。");
                        toast(target ? "模板已更新" : "模板已保存");
                    });
                }, { signal: scope.signal });
                list.addEventListener("click", (event) => {
                    const button = actionButton(event);
                    const card = button?.closest("[data-prompt]");
                    if (!button || !card)
                        return;
                    const prompt = prompts.find((prompt) => prompt.id === card.dataset.prompt);
                    if (button.dataset.action === "edit") {
                        if (form.getAttribute("aria-busy") === "true")
                            return;
                        editing = prompt.id;
                        name.value = prompt.name;
                        body.value = prompt.body;
                        cancel.hidden = false;
                        form.querySelector("[data-editor-title]").textContent =
                            "编辑模板";
                        form.querySelector('[type="submit"]').textContent = "保存修改";
                        clearFormError(form);
                        status(form, "");
                        name.focus();
                        return;
                    }
                    void act(button, card, scope, "处理中…", async () => {
                        if (button.dataset.action === "clipboard") {
                            if (!navigator.clipboard?.writeText)
                                throw new Error("当前浏览器无法访问剪贴板，请选中正文手动复制。");
                            await navigator.clipboard.writeText(prompt.body);
                            if (scope.live())
                                status(card, "正文已复制到剪贴板。");
                        }
                        else if (button.dataset.action === "duplicate") {
                            const payload = {
                                name: `${prompt.name.slice(0, 75)} · 副本`,
                                body: prompt.body,
                            };
                            const saved = await mutate("/prompts", "POST", payload);
                            if (!scope.live())
                                return;
                            prompts.unshift({ id: saved.id, ...payload });
                            draw();
                            toast("已复制为新模板");
                        }
                        else if (button.dataset.action === "delete") {
                            const confirmed = await confirmDialog({
                                title: "删除提示词模板？",
                                body: `<p>将删除“${esc(prompt.name)}”。已有实验中的冻结提示词保持不变，删除后无法恢复此模板。</p>`,
                                confirm: "删除模板",
                                danger: true,
                            });
                            if (!confirmed || !scope.live()) {
                                if (scope.live())
                                    status(card, "");
                                return;
                            }
                            if (editing === prompt.id &&
                                form.getAttribute("aria-busy") === "true")
                                throw new Error("此模板正在保存，请等待保存结束再删除。");
                            await mutate(`/prompts/${idPath(prompt.id)}`, "DELETE");
                            if (!scope.live())
                                return;
                            prompts.splice(prompts.indexOf(prompt), 1);
                            if (editing === prompt.id)
                                resetEditor();
                            draw();
                            toast("模板已删除");
                        }
                    });
                }, { signal: scope.signal });
            });
        },
    };
}
function skillHtml(skill) {
    return `<article class="panel library-card" data-skill="${esc(skill.id)}"><div class="row between"><h3>${esc(skill.name)}</h3><span class="badge">v${esc(skill.current_version)}</span></div><p class="meta">${esc(skill.file_count)} 个文件 · 创建于 ${esc(date(skill.created))}</p><p class="help mono">SHA-256 ${esc(skill.sha256)}</p><div class="actions"><button class="btn outline small" data-action="view">查看文件与版本</button><button class="btn danger small" data-action="delete">删除</button></div>${statusBox()}</article>`;
}
function skillUploadForm(prefix, title, name = "") {
    const limits = state.config.limits;
    return `<form class="panel stack" data-skill-upload="${prefix}"><h2>${title}</h2>${field(`${prefix}-name`, "Skill 名称", `<input id="${prefix}-name" name="name" required maxlength="80" value="${esc(name)}">`)}${field(`${prefix}-file`, "Skill 文件", `<input id="${prefix}-file" name="file" type="file" accept=".md,.zip" required>`, `上传 UTF-8 Markdown 或包含 SKILL.md 的 ZIP。上传及解压内容合计不超过 ${Math.floor((limits.skill_bytes ?? 262144) / 1024)} KB，最多 ${limits.skill_files ?? 30} 个文本文件；单个文件不超过 64 KB。`)}<p class="notice">${prefix === "skill-new" ? "Skill 只属于你。每次实验会冻结所选版本的内容与哈希。" : "上传的是完整新版本，不是增量补丁。已有实验继续使用当时冻结的文件与哈希；不会被更新或删除影响。"}</p>${statusBox()}<button class="btn primary" type="submit"${locked()}>${prefix === "skill-new" ? "上传 Skill" : "上传新版本"}</button></form>`;
}
async function uploadSkill(form, id) {
    const file = form.querySelector('[name="file"]').files?.[0];
    const name = form
        .querySelector('[name="name"]')
        .value.trim();
    if (!name || !file)
        throw new Error("请填写名称并选择 Markdown 或 ZIP 文件。");
    if (file.size > (state.config.limits?.skill_bytes ?? 262144))
        throw new Error("上传文件超过大小限制，请精简后重试。");
    return api(id ? `/skills/${idPath(id)}` : "/skills", {
        method: id ? "PUT" : "POST",
        body: file,
        headers: {
            "Content-Type": "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name),
            "X-Skill-Name": encodeURIComponent(name),
        },
    });
}
export async function skillsPage() {
    if (!state.user)
        return authGate();
    let skills = await api("/skills");
    return {
        html: `${head("Skill 库", "查看文件、追踪版本，把可复用的工作方式带进下一次实验。")}${verificationNotice()}<p class="notice">版本是实验的依据，不是会自动更新的依赖。更新或删除 Skill 都不会改变已有实验的冻结快照。</p><div class="two"><section class="stack">${field("skill-search", "搜索 Skill", '<input id="skill-search" type="search" placeholder="搜索 Skill 名称">')}<p class="help" data-skill-count></p><div class="stack" data-skill-list></div></section>${skillUploadForm("skill-new", "上传 Skill")}</div><section class="stack" data-skill-detail hidden aria-label="Skill 文件与版本"></section>${footer()}`,
        mount(root) {
            return mountScope(root, (scope) => {
                const list = root.querySelector("[data-skill-list]");
                const search = root.querySelector("#skill-search");
                const detail = root.querySelector("[data-skill-detail]");
                let selected = null;
                let request = 0;
                let current = null;
                let loadingDetail = false;
                let viewedVersion = 0;
                const draw = () => {
                    const found = skills.filter((skill) => skill.name
                        .toLowerCase()
                        .includes(search.value.trim().toLowerCase()));
                    root.querySelector("[data-skill-count]").textContent =
                        `显示 ${found.length} / ${skills.length} 个 Skill · 最多 ${state.config.limits?.skills ?? 30} 个`;
                    list.innerHTML = found.length
                        ? found.map(skillHtml).join("")
                        : empty(skills.length ? "没有匹配的 Skill" : "还没有 Skill", skills.length
                            ? "试试其他名称关键词。"
                            : "上传 SKILL.md 或受限 ZIP，为实验保存一套工作方式。");
                };
                const refresh = async () => {
                    const fresh = await api("/skills");
                    if (scope.live()) {
                        skills = fresh;
                        draw();
                    }
                };
                const loadDetail = async (id, version) => {
                    const sequence = ++request;
                    loadingDetail = true;
                    let value;
                    try {
                        value = await api(`/skills/${idPath(id)}${version ? `?version=${version}` : ""}`);
                    }
                    finally {
                        if (sequence === request)
                            loadingDetail = false;
                    }
                    if (!scope.live() || sequence !== request)
                        return;
                    selected = id;
                    current = value;
                    const shownVersion = version ?? value.current_version;
                    viewedVersion = shownVersion;
                    const filenames = Object.keys(value.files).sort();
                    detail.hidden = false;
                    detail.innerHTML = `<div class="panel stack"><div class="row between"><div><p class="eyebrow">冻结版本档案</p><h2>${esc(value.name)}</h2></div><button class="btn ghost" data-action="close-detail">收起详情</button></div>${statusBox()}${field("skill-version", "查看版本", `<select id="skill-version">${value.versions.map((revision) => `<option value="${esc(revision.number)}"${revision.number === shownVersion ? " selected" : ""}>v${esc(revision.number)} · ${esc(date(revision.created))}${revision.number === value.current_version ? " · 当前版本" : ""}</option>`).join("")}</select>`)}<p class="mono help">SHA-256 ${esc(value.sha256)}</p><div class="source-layout"><div class="source-files">${field("skill-file-view", "查看文件", `<select id="skill-file-view">${filenames.map((filename) => `<option value="${esc(filename)}">${esc(filename)}</option>`).join("")}</select>`)}<p class="help">${filenames.length} 个文件 · 只读查看，内容不会作为 HTML 执行。</p></div><pre class="code" data-skill-content tabindex="0">${esc(value.files[filenames[0]] || "")}</pre></div></div>${skillUploadForm("skill-update", "上传新版本", value.name)}`;
                };
                draw();
                search.addEventListener("input", draw, { signal: scope.signal });
                root.addEventListener("submit", (event) => {
                    const form = event.target;
                    if (!form.matches("[data-skill-upload]"))
                        return;
                    event.preventDefault();
                    if (loadingDetail || root.querySelector('form[aria-busy="true"]')) {
                        formError(form, new Error("正在读取版本或保存文件，请等待完成后再上传。"));
                        return;
                    }
                    const target = form.dataset.skillUpload === "skill-update" ? selected : null;
                    void submit(form, scope, "正在检查并保存 Skill 文件…", async () => {
                        const saved = await uploadSkill(form, target || undefined);
                        if (!scope.live())
                            return;
                        form.reset();
                        status(form, target ? "新版本已保存，已有实验保持不变。" : "Skill 已上传。");
                        toast(target ? "Skill 新版本已保存" : "Skill 已上传");
                        try {
                            await refresh();
                            if (!scope.live())
                                return;
                            if (target || saved.id)
                                await loadDetail(target || saved.id);
                            if (scope.live())
                                status(detail, target
                                    ? "新版本已保存，已有实验继续使用原有冻结快照。"
                                    : "Skill 已上传，可在实验室选择。");
                        }
                        catch (error) {
                            if (scope.live())
                                status(form, `文件已保存，但列表或详情刷新失败：${errorText(error)}。请重新打开本页，不要重复上传。`, "warn");
                        }
                    });
                }, { signal: scope.signal });
                list.addEventListener("click", (event) => {
                    const button = actionButton(event);
                    const card = button?.closest("[data-skill]");
                    if (!button || !card)
                        return;
                    const skill = skills.find((skill) => skill.id === card.dataset.skill);
                    void act(button, card, scope, "处理中…", async () => {
                        if (button.dataset.action === "view") {
                            if (loadingDetail ||
                                root.querySelector('form[aria-busy="true"]'))
                                throw new Error("正在读取或保存 Skill，请等待完成后再切换。");
                            await loadDetail(skill.id);
                            if (scope.live()) {
                                status(card, "");
                                detail
                                    .querySelector("#skill-version")
                                    ?.focus();
                            }
                        }
                        else if (button.dataset.action === "delete") {
                            const confirmed = await confirmDialog({
                                title: "删除 Skill 及其版本？",
                                body: `<p>将删除“${esc(skill.name)}”及库中的全部历史版本，之后不能再为新实验选择它。已有实验中的冻结文件仍会保留。</p><p>此操作无法撤销。</p>`,
                                confirm: "删除 Skill",
                                danger: true,
                            });
                            if (!confirmed || !scope.live()) {
                                if (scope.live())
                                    status(card, "");
                                return;
                            }
                            if (loadingDetail ||
                                root.querySelector('form[aria-busy="true"]'))
                                throw new Error("正在读取或保存 Skill，请等待完成后再删除。");
                            await mutate(`/skills/${idPath(skill.id)}`, "DELETE");
                            if (!scope.live())
                                return;
                            skills = skills.filter((item) => item.id !== skill.id);
                            ++request;
                            if (selected === skill.id) {
                                selected = null;
                                current = null;
                                detail.hidden = true;
                                detail.innerHTML = "";
                            }
                            draw();
                            toast("Skill 已删除，已有实验保持不变");
                        }
                    });
                }, { signal: scope.signal });
                detail.addEventListener("click", (event) => {
                    if (actionButton(event)?.dataset.action !== "close-detail")
                        return;
                    if (loadingDetail || root.querySelector('form[aria-busy="true"]'))
                        return;
                    ++request;
                    selected = null;
                    current = null;
                    detail.hidden = true;
                    detail.innerHTML = "";
                }, { signal: scope.signal });
                detail.addEventListener("change", (event) => {
                    const input = event.target;
                    if (input.id === "skill-file-view" && current) {
                        detail.querySelector("[data-skill-content]").textContent =
                            current.files[input.value] || "";
                    }
                    else if (input.id === "skill-version" && selected) {
                        if (loadingDetail ||
                            root.querySelector('form[aria-busy="true"]')) {
                            input.value = String(viewedVersion);
                            status(detail, "正在读取或保存 Skill，请等待完成后再切换版本。", "warn");
                            return;
                        }
                        const id = selected;
                        const version = Number(input.value);
                        input.disabled = true;
                        status(detail, "正在读取冻结版本…", "");
                        void loadDetail(id, version).catch((error) => {
                            if (scope.live()) {
                                status(detail, errorText(error), "error");
                                input.value = String(viewedVersion);
                                input.disabled = false;
                            }
                        });
                    }
                }, { signal: scope.signal });
            });
        },
    };
}
export async function adminPage() {
    if (!state.user)
        return authGate();
    if (state.user.role !== "admin")
        return {
            html: `${head("管理", "此区域仅向管理员开放。")}${empty("没有管理权限", "你仍可在公开作品的详情页提交举报。", '<a class="btn outline" href="#/gallery">浏览作品</a>')}${footer()}`,
        };
    let [reports, metrics] = await Promise.all([
        api("/admin/reports"),
        api("/admin/metrics"),
    ]);
    const reportsHtml = () => reports.length
        ? reports
            .map((report) => `<article class="panel" data-report="${esc(report.id)}"><p class="meta">举报时间 ${esc(date(report.created))} · 举报人 <span class="mono">${esc(report.owner_id)}</span></p><p>${esc(report.reason)}</p><p class="help">作品 <a class="mono" href="#/run/${idPath(report.run_id)}">${esc(report.run_id)}</a></p><div class="actions"><button class="btn danger small" data-action="hide">隐藏作品</button><button class="btn outline small" data-action="resolve">标记已解决</button></div>${statusBox()}</article>`)
            .join("")
        : empty("没有待处理举报", "新的举报会出现在这里。");
    const auditHtml = () => metrics.audit.length
        ? `<div class="table-wrap" tabindex="0" role="region" aria-label="审计记录，可横向滚动"><table class="table"><caption>最近 ${metrics.audit.length} 条审计记录（最多 100 条）</caption><thead><tr><th scope="col">时间</th><th scope="col">操作者</th><th scope="col">操作</th><th scope="col">目标</th></tr></thead><tbody>${metrics.audit.map((entry) => `<tr><td>${esc(date(entry.created))}</td><td class="mono">${esc(entry.actor || "系统")}</td><td class="mono">${esc(entry.action)}</td><td class="mono">${esc(entry.target || "—")}</td></tr>`).join("")}</tbody></table></div>`
        : empty("暂无审计记录", "管理操作会记录在这里，不包含 API Key。");
    const queueHtml = () => metrics.queue.length
        ? metrics.queue
            .map((item) => `<div class="metric"><span>${esc({ queued: "排队中", running: "运行中", succeeded: "已完成", failed: "失败", canceled: "已取消" }[item.status] || item.status)}</span><strong>${esc(item.count)}</strong></div>`)
            .join("")
        : '<p class="muted">当前还没有实验。</p>';
    return {
        html: `${head("管理", "先检查举报上下文，再隐藏作品或结束处理。审计记录保留每次管理操作。")}<section class="panel stack" data-admin-summary><div class="section-head"><h2>全站实验状态</h2><button class="btn outline small" data-action="refresh">刷新管理数据</button></div>${statusBox()}<div class="metric-grid" data-queue>${queueHtml()}</div></section><div class="section-head"><h2>待处理举报</h2><span class="muted" data-report-count>${reports.length} 条</span></div><p class="notice">隐藏会立即取消公开展示，但不会自动解决举报。确认处理完成后，请另行“标记已解决”；仅解决举报不会改变作品可见性。</p><section class="stack" data-reports>${reportsHtml()}</section><section class="panel stack"><h2>审计记录</h2><div data-audit>${auditHtml()}</div></section>${footer()}`,
        mount(root) {
            return mountScope(root, (scope) => {
                const list = root.querySelector("[data-reports]");
                const summary = root.querySelector("[data-admin-summary]");
                const reload = async () => {
                    const [freshReports, freshMetrics] = await Promise.all([
                        api("/admin/reports"),
                        api("/admin/metrics"),
                    ]);
                    if (!scope.live())
                        return;
                    reports = freshReports;
                    metrics = freshMetrics;
                    list.innerHTML = reportsHtml();
                    root.querySelector("[data-report-count]").textContent =
                        `${reports.length} 条`;
                    root.querySelector("[data-audit]").innerHTML = auditHtml();
                    root.querySelector("[data-queue]").innerHTML = queueHtml();
                };
                root.addEventListener("click", (event) => {
                    const button = actionButton(event);
                    if (!button)
                        return;
                    if (button.dataset.action === "refresh") {
                        void act(button, summary, scope, "正在刷新…", async () => {
                            await reload();
                            if (scope.live())
                                status(summary, "管理数据已刷新。");
                        });
                        return;
                    }
                    const card = button.closest("[data-report]");
                    if (!card)
                        return;
                    const report = reports.find((report) => report.id === card.dataset.report);
                    const hide = button.dataset.action === "hide";
                    void act(button, card, scope, "处理中…", async () => {
                        const confirmed = await confirmDialog({
                            title: hide ? "隐藏这件作品？" : "将举报标记为已解决？",
                            body: hide
                                ? `<p>作品 ${esc(report.run_id)} 将从公开页面移除并取消发布。举报仍保持待处理，请在完成调查后另行解决。</p>`
                                : "<p>此举报将离开待处理列表，作品的公开状态不会改变。请确认已完成检查与必要处置。</p>",
                            confirm: hide ? "隐藏作品" : "标记已解决",
                            danger: hide,
                        });
                        if (!confirmed || !scope.live()) {
                            if (scope.live())
                                status(card, "");
                            return;
                        }
                        await mutate("/admin/moderate", "POST", {
                            action: hide ? "hide_run" : "resolve_report",
                            target: hide ? report.run_id : report.id,
                        });
                        if (!scope.live())
                            return;
                        toast(hide ? "作品已隐藏，举报仍待处理" : "举报已解决");
                        status(summary, hide
                            ? "作品已隐藏。完成调查后，请将举报标记为已解决。"
                            : "举报已解决，作品公开状态未改变。");
                        try {
                            await reload();
                        }
                        catch (error) {
                            if (scope.live())
                                status(summary, `管理操作已成功，但列表刷新失败：${errorText(error)}。请点击“刷新管理数据”，不要重复处理。`, "warn");
                        }
                    });
                }, { signal: scope.signal });
            });
        },
    };
}
