import {
  api,
  mutate,
  state,
  esc,
  date,
  head,
  empty,
  field,
  footer,
  authGate,
  verificationNotice,
  toast,
  formError,
  clearFormError,
  confirmDialog,
  showDialog,
  closeDialog,
  errorText,
  type Page,
} from "./core.js";
import type { AdminUser, AdminChallenge, AdminPrompt } from "./types.js";

type Scope = { live: () => boolean; signal: AbortSignal };
type Connection = {
  id: string;
  label: string;
  base_url: string;
  protocol: string;
  last4: string;
  models: string[];
  created: number;
  is_official?: boolean;
};
type SavedResource = { id: string };
type ModelDiscovery = { models: string[] };
type Prompt = { id: string; name: string; body: string };
type Skill = {
  id: string;
  name: string;
  sha256: string;
  created: number;
  current_version: number;
  file_count: number;
};
type SkillRevision = { number: number; sha256: string; created: number };
type SkillDetail = {
  id: string;
  name: string;
  sha256: string;
  current_version: number;
  files: Record<string, string>;
  versions: SkillRevision[];
};
type Report = {
  id: string;
  run_id: string;
  owner_id: string;
  reason: string;
  created: number;
};
type AuditEntry = {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  created: number;
};
type QueueCount = { status: string; count: number };
type AdminMetrics = { queue: QueueCount[]; audit: AuditEntry[] };

function mountScope(
  root: HTMLElement,
  setup: (scope: Scope) => void,
): () => void {
  const controller = new AbortController();
  setup({ live: () => !controller.signal.aborted, signal: controller.signal });
  return () => {
    controller.abort();
    root
      .querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((input) => {
        input.value = "";
      });
  };
}

function statusBox(): string {
  return '<div data-status role="status" aria-live="polite" hidden></div>';
}

function status(container: Element, message: string, kind = "success"): void {
  const box = container.querySelector<HTMLElement>("[data-status]");
  if (!box) return;
  box.className = `notice ${kind}`;
  box.textContent = message;
  box.hidden = !message;
}

async function submit(
  form: HTMLFormElement,
  scope: Scope,
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  if (form.getAttribute("aria-busy") === "true") return;
  clearFormError(form);
  status(form, label, "");
  form.setAttribute("aria-busy", "true");
  const controls = Array.from(
    form.querySelectorAll<
      | HTMLButtonElement
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
    >("button,input,select,textarea"),
  );
  const disabled = controls.map((control) => control.disabled);
  controls.forEach((control) => {
    control.disabled = true;
  });
  try {
    await action();
  } catch (error) {
    if (scope.live()) {
      status(form, "");
      formError(form, error);
    }
  } finally {
    if (scope.live()) {
      form.removeAttribute("aria-busy");
      controls.forEach((control, index) => {
        control.disabled = disabled[index];
      });
    }
  }
}

async function act(
  button: HTMLButtonElement,
  container: Element,
  scope: Scope,
  pending: string,
  action: () => Promise<void>,
): Promise<void> {
  if (button.disabled || container.getAttribute("aria-busy") === "true") return;
  container.setAttribute("aria-busy", "true");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = pending;
  status(container, pending, "");
  try {
    await action();
  } catch (error) {
    if (scope.live()) status(container, errorText(error), "error");
  } finally {
    if (scope.live()) {
      container.removeAttribute("aria-busy");
      button.disabled = false;
      button.textContent = label;
    }
  }
}

function locked(): string {
  return state.user?.verified ? "" : " disabled";
}
function idPath(id: string): string {
  return encodeURIComponent(id);
}
function actionButton(event: Event): HTMLButtonElement | null {
  return event.target instanceof Element
    ? event.target.closest<HTMLButtonElement>("button[data-action]")
    : null;
}

const protocols: Record<string, string> = {
  openai: "OpenAI Chat Completions（标准兼容协议，自建中转/One-API通常选此项）",
  anthropic: "Anthropic Messages（Claude 原生协议，官方或 Claude 专属中转选此项）",
  responses: "OpenAI Responses（OpenAI 新版 Responses 专用接口）",
};

function providerPreset(base: string): { name: string; protocol: string } {
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === "api.anthropic.com")
      return { name: "Anthropic 官方源", protocol: "anthropic" };
    if (host === "api.openai.com")
      return { name: "OpenAI 官方源", protocol: "openai" };
    if (host === "api.deepseek.com")
      return { name: "DeepSeek 官方源", protocol: "openai" };
    if (host === "openrouter.ai")
      return { name: "OpenRouter 聚合源", protocol: "openai" };
    if (host === "generativelanguage.googleapis.com")
      return { name: "Gemini 官方兼容源", protocol: "openai" };
    if (host.includes("siliconflow"))
      return { name: "硅基流动 SiliconFlow", protocol: "openai" };
    if (host.includes("aliyuncs.com") || host.includes("dashscope"))
      return { name: "阿里百炼 DashScope", protocol: "openai" };
    if (host.includes("moonshot.cn"))
      return { name: "月之暗面 Moonshot", protocol: "openai" };
    if (host.includes("groq.com"))
      return { name: "Groq 高速推理", protocol: "openai" };
    return { name: host, protocol: "openai" };
  } catch {
    return { name: "自定义服务商", protocol: "openai" };
  }
}

function modelsHtml(models: string[], search = ""): string {
  const found = models.filter((model) =>
    model.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return `${models.length ? `<p class="help">显示 ${found.length} / ${models.length} 个模型。发现成功不代表该 Key 有每个模型的调用权限；实际费用由服务商收取。</p>` : ""}${found.length ? `<ul class="summary-list">${found.map((model) => `<li class="mono">${esc(model)}</li>`).join("")}</ul>` : `<p class="muted">${models.length ? "没有匹配的模型，试试其他关键词。" : "尚无可用模型。点击“检测模型”；若服务商未开放模型目录，请检查 Key 权限或选择其他连接。"}</p>`}`;
}

function connectionHtml(key: Connection): string {
  const isOfficial =
    key.is_official ?? state.config.providers?.includes(key.base_url);
  const protoShort =
    {
      openai: "OpenAI Chat",
      anthropic: "Anthropic Messages",
      responses: "OpenAI Responses",
    }[key.protocol] || key.protocol;
  return `<article class="panel library-card" data-key="${esc(key.id)}"><div class="row between"><div><h3>${esc(key.label)}</h3><p class="mono">••••${esc(key.last4)}</p></div><div class="actions"><button class="btn outline small" data-action="discover">检测模型</button><button class="btn danger small" data-action="revoke">撤销连接</button></div></div><div class="row items-center gap-2" style="margin:4px 0 2px"><p class="help mono break-word" style="margin:0">${esc(key.base_url)}</p><span class="badge ${isOfficial ? "official" : "custom"}">${isOfficial ? "官方直连" : "自定义源"}</span><span class="badge protocol">${esc(protoShort)}</span></div><p class="meta">请求协议：<strong>${esc(protoShort)}</strong> · 创建于 ${esc(date(key.created))}</p>${statusBox()}<details class="details"><summary>模型目录（<span data-model-count>${key.models.length}</span>）</summary>${field(`models-${key.id}`, "搜索模型", `<input id="models-${esc(key.id)}" type="search" data-model-search placeholder="输入模型名称">`)}<div data-models>${modelsHtml(key.models)}</div></details></article>`;
}

export async function connectionsPage(): Promise<Page> {
  if (!state.user) return authGate();
  const keys = await api<Connection[]>("/keys");
  const bases: string[] = state.config.providers || [];
  const defaultPresets: [string, string][] = [
    ["https://api.deepseek.com/v1", "DeepSeek 官方源 (OpenAI Chat)"],
    ["https://api.openai.com/v1", "OpenAI 官方源 (OpenAI Chat)"],
    ["https://api.anthropic.com", "Anthropic 官方源 (Anthropic Messages)"],
    ["https://openrouter.ai/api/v1", "OpenRouter 聚合源 (OpenAI Chat)"],
    [
      "https://generativelanguage.googleapis.com/v1beta/openai",
      "Google Gemini 官方源 (OpenAI 兼容)",
    ],
    ["https://api.siliconflow.cn/v1", "硅基流动 SiliconFlow (OpenAI Chat)"],
    ["https://dashscope.aliyuncs.com/compatible-mode/v1", "阿里百炼 DashScope (OpenAI Chat)"],
    ["https://api.moonshot.cn/v1", "月之暗面 Moonshot (OpenAI Chat)"],
    ["https://api.groq.com/openai/v1", "Groq 高速推理 (OpenAI Chat)"],
  ];
  const first = "openai";
  return {
    html: `${head("API 连接", "自己的 Key，自己的额度。支持官方服务商直连或自定义中转/兼容地址。")}${verificationNotice()}<div class="two"><section class="stack"><div class="section-head"><h2>已保存连接</h2><span class="muted" data-key-count>${keys.length} 个</span></div><div class="stack" data-key-list>${keys.length ? keys.map(connectionHtml).join("") : empty("还没有连接", "在右侧添加专用低额度 Key，保存后会自动检测模型。")}</div></section><form class="panel stack" data-key-form><h2>添加连接</h2><p class="notice warn">建议使用专用低额度 Key，并在服务商侧设置消费上限。Key 加密保存在服务端，不写入浏览器存储，也不会进入实验沙箱。</p>${field("connection-label", "连接名称", '<input id="connection-label" name="label" required maxlength="60" placeholder="我的低额度测试连接">')}${field("connection-preset-select", "快捷预设", `<select id="connection-preset-select"><option value="">-- 选择常用预设（快速填充）--</option>${defaultPresets.map(([url, title]) => `<option value="${esc(url)}">${esc(title)}</option>`).join("")}<option value="custom">✏️ 自定义 API 地址（自建中转 / One-API 等）</option></select>`, "可直接选择常用服务商，也可在下方自由输入或修改任意 HTTPS API 地址。")}${field("connection-base", "服务商与 API 地址 (Base URL)", '<input id="connection-base" name="base_url" type="url" required value="https://api.deepseek.com/v1" placeholder="https://api.example.com/v1">', "支持官方直连或任意自建/中转兼容 API（须为 HTTPS）。官方直连源作品将参与官方独立排行榜。")}${field(
      "connection-protocol",
      "请求协议",
      `<select id="connection-protocol" name="protocol">${Object.entries(
        protocols,
      )
        .map(
          ([value, label]) =>
            `<option value="${value}"${value === first ? " selected" : ""}>${label}</option>`,
        )
        .join("")}</select>`,
      "兼容服务商默认使用 Chat Completions；若服务商要求 Responses，可在此切换。",
    )}${field("connection-secret", "API Key", '<input id="connection-secret" name="api_key" type="password" required minlength="8" maxlength="500" autocomplete="off" spellcheck="false">', "保存后只显示末四位，不能再次查看完整 Key。")}${statusBox()}<button class="btn primary full" type="submit"${locked()}>保存并检测模型</button><p class="help">只检测模型目录，不创建实验、不调用付费生成模型。</p></form></div>${footer()}`,
    mount(root) {
      return mountScope(root, (scope) => {
        const form = root.querySelector<HTMLFormElement>("[data-key-form]")!;
        const list = root.querySelector<HTMLElement>("[data-key-list]")!;
        const draw = () => {
          list.innerHTML = keys.length
            ? keys.map(connectionHtml).join("")
            : empty("还没有连接", "添加一个专用低额度 Key，开始准备实验。");
          root.querySelector("[data-key-count]")!.textContent =
            `${keys.length} 个`;
        };
        const updateModels = (card: HTMLElement, key: Connection) => {
          card.querySelector("[data-model-count]")!.textContent = String(
            key.models.length,
          );
          card.querySelector("[data-models]")!.innerHTML = modelsHtml(
            key.models,
            card.querySelector<HTMLInputElement>("[data-model-search]")!.value,
          );
          card.querySelector("details")!.open = true;
        };
        const baseInput =
          form.querySelector<HTMLInputElement>('[name="base_url"]')!;
        const presetSelect = form.querySelector<HTMLSelectElement>(
          "#connection-preset-select",
        );
        const protoSelect =
          form.querySelector<HTMLSelectElement>('[name="protocol"]')!;
        if (presetSelect) {
          presetSelect.addEventListener(
            "change",
            () => {
              const val = presetSelect.value;
              if (val === "custom") {
                baseInput.value = "";
                baseInput.placeholder = "https://你的代理地址/v1（支持自建中转 / One-API 等）";
                baseInput.focus();
                status(form, "自定义服务商：支持任何标准兼容的 HTTPS 接口。自建中转（如 One-API、New API 等）请保持选择『OpenAI Chat Completions』协议；Claude 原生中转请切换为『Anthropic Messages』协议。", "");
              } else if (val) {
                baseInput.value = val;
                protoSelect.value = providerPreset(val).protocol;
                status(form, "");
              }
            },
            { signal: scope.signal },
          );
        }
        baseInput.addEventListener(
          "input",
          () => {
            const trimmed = baseInput.value.trim();
            if (!trimmed) return;
            try {
              const host = new URL(trimmed).hostname.toLowerCase();
              if (host === "api.anthropic.com") {
                protoSelect.value = "anthropic";
              } else if (host === "api.openai.com" && protoSelect.value !== "responses") {
                protoSelect.value = "openai";
              }
            } catch {}
          },
          { signal: scope.signal },
        );
        form.addEventListener(
          "submit",
          (event) => {
            event.preventDefault();
            const data = new FormData(form);
            const body = {
              label: String(data.get("label")),
              base_url: String(data.get("base_url")),
              protocol: String(data.get("protocol")),
              api_key: String(data.get("api_key")),
            };
            void submit(form, scope, "正在加密保存连接…", async () => {
              let saved: SavedResource;
              try {
                saved = await mutate<SavedResource>("/keys", "POST", body);
              } finally {
                body.api_key = "";
              }
              if (!scope.live()) return;
              form.reset();
              form.querySelector<HTMLSelectElement>(
                '[name="protocol"]',
              )!.value = first;
              status(form, "连接已保存，正在检测模型；请勿重复添加。", "");
              // Saving and discovery are separate operations: a failed discovery must never resubmit the key.
              let discovery: ModelDiscovery | null = null;
              let discoveryError: unknown;
              try {
                discovery = await mutate<ModelDiscovery>(
                  `/keys/${idPath(saved.id)}/models`,
                  "POST",
                );
              } catch (error) {
                discoveryError = error;
              }
              if (!scope.live()) return;
              try {
                const fresh = await api<Connection[]>("/keys");
                if (!scope.live()) return;
                keys.splice(0, keys.length, ...fresh);
                draw();
              } catch (error) {
                if (scope.live())
                  status(
                    form,
                    `连接已保存${discovery ? `，检测到 ${discovery.models.length} 个模型` : "，模型检测未完成"}，但列表刷新失败：${errorText(error)}。请重新打开本页，不要重复添加。`,
                    "warn",
                  );
                return;
              }
              if (discovery) {
                status(
                  form,
                  discovery.models.length
                    ? `连接已保存，检测到 ${discovery.models.length} 个模型。可前往实验室使用。`
                    : "连接已保存，但服务商返回空模型目录。请检查 Key 的模型权限，再在连接卡片中检测。",
                  discovery.models.length ? "success" : "warn",
                );
                toast("连接已保存");
              } else {
                status(
                  form,
                  `连接已保存，但模型检测失败：${errorText(discoveryError)}。不要重复添加；请检查服务商状态与权限，再点击该连接的“检测模型”。协议或 Key 填错时，请先撤销再添加。`,
                  "warn",
                );
              }
            });
          },
          { signal: scope.signal },
        );
        list.addEventListener(
          "input",
          (event) => {
            const input = event.target as HTMLInputElement;
            if (!input.matches("[data-model-search]")) return;
            const card = input.closest<HTMLElement>("[data-key]")!;
            const key = keys.find((key) => key.id === card.dataset.key)!;
            card.querySelector("[data-models]")!.innerHTML = modelsHtml(
              key.models,
              input.value,
            );
          },
          { signal: scope.signal },
        );
        list.addEventListener(
          "click",
          (event) => {
            const button = actionButton(event);
            const card = button?.closest<HTMLElement>("[data-key]");
            if (!button || !card) return;
            const key = keys.find((key) => key.id === card.dataset.key)!;
            void act(button, card, scope, "处理中…", async () => {
              if (button.dataset.action === "discover") {
                const result = await mutate<{ models: string[] }>(
                  `/keys/${idPath(key.id)}/models`,
                  "POST",
                );
                if (!scope.live()) return;
                key.models = result.models;
                updateModels(card, key);
                status(
                  card,
                  result.models.length
                    ? `检测完成：${result.models.length} 个模型。`
                    : "检测完成，但服务商没有返回模型。请检查 Key 权限。",
                  result.models.length ? "success" : "warn",
                );
              } else if (button.dataset.action === "revoke") {
                const confirmed = await confirmDialog({
                  title: "撤销这个连接？",
                  body: `<p>将删除“${esc(key.label)}”的加密 Key，并取消仍在排队或运行、使用此连接的实验。已完成实验不会因此删除。</p><p>此操作不能撤销；服务商侧 Key 本身不会被吊销，如有泄漏仍需去服务商控制台撤销。</p>`,
                  confirm: "撤销连接",
                  danger: true,
                });
                if (!confirmed || !scope.live()) {
                  if (scope.live()) status(card, "");
                  return;
                }
                await mutate(`/keys/${idPath(key.id)}`, "DELETE");
                if (!scope.live()) return;
                keys.splice(keys.indexOf(key), 1);
                draw();
                toast("连接已撤销");
              }
            });
          },
          { signal: scope.signal },
        );
      });
    },
  };
}

function promptHtml(prompt: Prompt): string {
  return `<article class="panel library-card" data-prompt="${esc(prompt.id)}"><h3>${esc(prompt.name)}</h3><pre class="code">${esc(prompt.body)}</pre><div class="actions"><button class="btn outline small" data-action="edit"${locked()}>编辑</button><button class="btn outline small" data-action="duplicate"${locked()}>复制为新模板</button><button class="btn ghost small" data-action="clipboard">复制正文</button><button class="btn danger small" data-action="delete">删除</button></div>${statusBox()}</article>`;
}

export async function promptsPage(): Promise<Page> {
  if (!state.user) return authGate();
  const prompts = await api<Prompt[]>("/prompts");
  const limit = state.config.limits?.prompts ?? 30;
  return {
    html: `${head("提示词库", "把有效的附加指令留作模板；每次实验使用独立的内容快照。")}${verificationNotice()}<div class="two"><section class="stack">${field("prompt-search", "搜索提示词", '<input id="prompt-search" type="search" placeholder="搜索名称或正文">')}<p class="help" data-prompt-count></p><div class="stack" data-prompt-list></div></section><form class="panel stack" data-prompt-form><h2 data-editor-title>保存新模板</h2><p class="help">模板只属于你。编辑或删除不会修改已有实验，也不会覆盖实验室里已经填入的草稿。</p>${field("prompt-name", "模板名称", '<input id="prompt-name" name="name" required maxlength="80">')}${field("prompt-body", "附加提示词", '<textarea id="prompt-body" name="body" required rows="12" maxlength="5000"></textarea>', "最多 5,000 字符。实验题目的冻结提示词不会在这里改变。")}${statusBox()}<div class="actions"><button class="btn primary" type="submit"${locked()}>保存模板</button><button class="btn ghost" type="button" data-action="cancel-edit" hidden>取消编辑</button></div></form></div>${footer()}`,
    mount(root) {
      return mountScope(root, (scope) => {
        const list = root.querySelector<HTMLElement>("[data-prompt-list]")!;
        const search = root.querySelector<HTMLInputElement>("#prompt-search")!;
        const form = root.querySelector<HTMLFormElement>("[data-prompt-form]")!;
        const name = form.querySelector<HTMLInputElement>('[name="name"]')!;
        const body = form.querySelector<HTMLTextAreaElement>('[name="body"]')!;
        const cancel = form.querySelector<HTMLButtonElement>(
          '[data-action="cancel-edit"]',
        )!;
        let editing: string | null = null;
        const draw = () => {
          const term = search.value.trim().toLowerCase();
          const found = prompts.filter((prompt) =>
            `${prompt.name}\n${prompt.body}`.toLowerCase().includes(term),
          );
          root.querySelector("[data-prompt-count]")!.textContent =
            `显示 ${found.length} / ${prompts.length} 个模板 · 最多 ${limit} 个`;
          list.innerHTML = found.length
            ? found.map(promptHtml).join("")
            : empty(
                prompts.length ? "没有匹配的模板" : "还没有提示词模板",
                prompts.length
                  ? "换一个名称或正文关键词。"
                  : "把有效的附加指令粘贴到右侧，保存后可在实验室选择。",
              );
        };
        const resetEditor = () => {
          editing = null;
          form.reset();
          cancel.hidden = true;
          form.querySelector("[data-editor-title]")!.textContent = "保存新模板";
          form.querySelector('[type="submit"]')!.textContent = "保存模板";
          clearFormError(form);
          status(form, "");
        };
        draw();
        search.addEventListener("input", draw, { signal: scope.signal });
        cancel.addEventListener("click", resetEditor, { signal: scope.signal });
        form.addEventListener(
          "submit",
          (event) => {
            event.preventDefault();
            const target = editing;
            const payload = { name: name.value.trim(), body: body.value };
            void submit(form, scope, "正在保存模板…", async () => {
              if (!payload.name || !payload.body.trim())
                throw new Error("请填写模板名称和正文。");
              if (target) {
                await mutate(`/prompts/${idPath(target)}`, "PUT", payload);
                if (!scope.live()) return;
                Object.assign(
                  prompts.find((prompt) => prompt.id === target)!,
                  payload,
                );
              } else {
                const saved = await mutate<{ id: string }>(
                  "/prompts",
                  "POST",
                  payload,
                );
                if (!scope.live()) return;
                prompts.unshift({ id: saved.id, ...payload });
              }
              resetEditor();
              draw();
              status(
                form,
                target
                  ? "模板已更新，已有实验保持不变。"
                  : "模板已保存，可在实验室的提示词选项中使用。",
              );
              toast(target ? "模板已更新" : "模板已保存");
            });
          },
          { signal: scope.signal },
        );
        list.addEventListener(
          "click",
          (event) => {
            const button = actionButton(event);
            const card = button?.closest<HTMLElement>("[data-prompt]");
            if (!button || !card) return;
            const prompt = prompts.find(
              (prompt) => prompt.id === card.dataset.prompt,
            )!;
            if (button.dataset.action === "edit") {
              if (form.getAttribute("aria-busy") === "true") return;
              editing = prompt.id;
              name.value = prompt.name;
              body.value = prompt.body;
              cancel.hidden = false;
              form.querySelector("[data-editor-title]")!.textContent =
                "编辑模板";
              form.querySelector('[type="submit"]')!.textContent = "保存修改";
              clearFormError(form);
              status(form, "");
              name.focus();
              return;
            }
            void act(button, card, scope, "处理中…", async () => {
              if (button.dataset.action === "clipboard") {
                if (!navigator.clipboard?.writeText)
                  throw new Error(
                    "当前浏览器无法访问剪贴板，请选中正文手动复制。",
                  );
                await navigator.clipboard.writeText(prompt.body);
                if (scope.live()) status(card, "正文已复制到剪贴板。");
              } else if (button.dataset.action === "duplicate") {
                const payload = {
                  name: `${prompt.name.slice(0, 75)} · 副本`,
                  body: prompt.body,
                };
                const saved = await mutate<{ id: string }>(
                  "/prompts",
                  "POST",
                  payload,
                );
                if (!scope.live()) return;
                prompts.unshift({ id: saved.id, ...payload });
                draw();
                toast("已复制为新模板");
              } else if (button.dataset.action === "delete") {
                const confirmed = await confirmDialog({
                  title: "删除提示词模板？",
                  body: `<p>将删除“${esc(prompt.name)}”。已有实验中的冻结提示词保持不变，删除后无法恢复此模板。</p>`,
                  confirm: "删除模板",
                  danger: true,
                });
                if (!confirmed || !scope.live()) {
                  if (scope.live()) status(card, "");
                  return;
                }
                if (
                  editing === prompt.id &&
                  form.getAttribute("aria-busy") === "true"
                )
                  throw new Error("此模板正在保存，请等待保存结束再删除。");
                await mutate(`/prompts/${idPath(prompt.id)}`, "DELETE");
                if (!scope.live()) return;
                prompts.splice(prompts.indexOf(prompt), 1);
                if (editing === prompt.id) resetEditor();
                draw();
                toast("模板已删除");
              }
            });
          },
          { signal: scope.signal },
        );
      });
    },
  };
}

function skillHtml(skill: Skill): string {
  return `<article class="panel library-card" data-skill="${esc(skill.id)}"><div class="row between"><h3>${esc(skill.name)}</h3><span class="badge">v${esc(skill.current_version)}</span></div><p class="meta">${esc(skill.file_count)} 个文件 · 创建于 ${esc(date(skill.created))}</p><p class="help mono">SHA-256 ${esc(skill.sha256)}</p><div class="actions"><button class="btn outline small" data-action="view">查看文件与版本</button><button class="btn danger small" data-action="delete">删除</button></div>${statusBox()}</article>`;
}

function skillUploadForm(prefix: string, title: string, name = ""): string {
  const limits = state.config.limits;
  return `<form class="panel stack" data-skill-upload="${prefix}"><h2>${title}</h2>${field(`${prefix}-name`, "Skill 名称", `<input id="${prefix}-name" name="name" required maxlength="80" value="${esc(name)}">`)}${field(`${prefix}-file`, "Skill 文件", `<input id="${prefix}-file" name="file" type="file" accept=".md,.zip" required>`, `上传 UTF-8 Markdown 或包含 SKILL.md 的 ZIP。上传及解压内容合计不超过 ${Math.floor((limits.skill_bytes ?? 262144) / 1024)} KB，最多 ${limits.skill_files ?? 30} 个文本文件；单个文件不超过 64 KB。`)}<p class="notice">${prefix === "skill-new" ? "Skill 只属于你。每次实验会冻结所选版本的内容与哈希。" : "上传的是完整新版本，不是增量补丁。已有实验继续使用当时冻结的文件与哈希；不会被更新或删除影响。"}</p>${statusBox()}<button class="btn primary" type="submit"${locked()}>${prefix === "skill-new" ? "上传 Skill" : "上传新版本"}</button></form>`;
}

async function uploadSkill(
  form: HTMLFormElement,
  id?: string,
): Promise<SavedResource> {
  const file =
    form.querySelector<HTMLInputElement>('[name="file"]')!.files?.[0];
  const name = form
    .querySelector<HTMLInputElement>('[name="name"]')!
    .value.trim();
  if (!name || !file)
    throw new Error("请填写名称并选择 Markdown 或 ZIP 文件。");
  if (file.size > (state.config.limits?.skill_bytes ?? 262144))
    throw new Error("上传文件超过大小限制，请精简后重试。");
  return api<SavedResource>(id ? `/skills/${idPath(id)}` : "/skills", {
    method: id ? "PUT" : "POST",
    body: file,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name),
      "X-Skill-Name": encodeURIComponent(name),
    },
  });
}

export async function skillsPage(): Promise<Page> {
  if (!state.user) return authGate();
  let skills = await api<Skill[]>("/skills");
  return {
    html: `${head("Skill 库", "查看文件、追踪版本，把可复用的工作方式带进下一次实验。")}${verificationNotice()}<p class="notice">版本是实验的依据，不是会自动更新的依赖。更新或删除 Skill 都不会改变已有实验的冻结快照。</p><div class="two"><section class="stack">${field("skill-search", "搜索 Skill", '<input id="skill-search" type="search" placeholder="搜索 Skill 名称">')}<p class="help" data-skill-count></p><div class="stack" data-skill-list></div></section>${skillUploadForm("skill-new", "上传 Skill")}</div><section class="stack" data-skill-detail hidden aria-label="Skill 文件与版本"></section>${footer()}`,
    mount(root) {
      return mountScope(root, (scope) => {
        const list = root.querySelector<HTMLElement>("[data-skill-list]")!;
        const search = root.querySelector<HTMLInputElement>("#skill-search")!;
        const detail = root.querySelector<HTMLElement>("[data-skill-detail]")!;
        let selected: string | null = null;
        let request = 0;
        let current: SkillDetail | null = null;
        let loadingDetail = false;
        let viewedVersion = 0;
        const draw = () => {
          const found = skills.filter((skill) =>
            skill.name
              .toLowerCase()
              .includes(search.value.trim().toLowerCase()),
          );
          root.querySelector("[data-skill-count]")!.textContent =
            `显示 ${found.length} / ${skills.length} 个 Skill · 最多 ${state.config.limits?.skills ?? 30} 个`;
          list.innerHTML = found.length
            ? found.map(skillHtml).join("")
            : empty(
                skills.length ? "没有匹配的 Skill" : "还没有 Skill",
                skills.length
                  ? "试试其他名称关键词。"
                  : "上传 SKILL.md 或受限 ZIP，为实验保存一套工作方式。",
              );
        };
        const refresh = async () => {
          const fresh = await api<Skill[]>("/skills");
          if (scope.live()) {
            skills = fresh;
            draw();
          }
        };
        const loadDetail = async (id: string, version?: number) => {
          const sequence = ++request;
          loadingDetail = true;
          let value: SkillDetail;
          try {
            value = await api<SkillDetail>(
              `/skills/${idPath(id)}${version ? `?version=${version}` : ""}`,
            );
          } finally {
            if (sequence === request) loadingDetail = false;
          }
          if (!scope.live() || sequence !== request) return;
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
        root.addEventListener(
          "submit",
          (event) => {
            const form = event.target as HTMLFormElement;
            if (!form.matches("[data-skill-upload]")) return;
            event.preventDefault();
            if (loadingDetail || root.querySelector('form[aria-busy="true"]')) {
              formError(
                form,
                new Error("正在读取版本或保存文件，请等待完成后再上传。"),
              );
              return;
            }
            const target =
              form.dataset.skillUpload === "skill-update" ? selected : null;
            void submit(form, scope, "正在检查并保存 Skill 文件…", async () => {
              const saved = await uploadSkill(form, target || undefined);
              if (!scope.live()) return;
              form.reset();
              status(
                form,
                target ? "新版本已保存，已有实验保持不变。" : "Skill 已上传。",
              );
              toast(target ? "Skill 新版本已保存" : "Skill 已上传");
              try {
                await refresh();
                if (!scope.live()) return;
                if (target || saved.id) await loadDetail(target || saved.id);
                if (scope.live())
                  status(
                    detail,
                    target
                      ? "新版本已保存，已有实验继续使用原有冻结快照。"
                      : "Skill 已上传，可在实验室选择。",
                  );
              } catch (error) {
                if (scope.live())
                  status(
                    form,
                    `文件已保存，但列表或详情刷新失败：${errorText(error)}。请重新打开本页，不要重复上传。`,
                    "warn",
                  );
              }
            });
          },
          { signal: scope.signal },
        );
        list.addEventListener(
          "click",
          (event) => {
            const button = actionButton(event);
            const card = button?.closest<HTMLElement>("[data-skill]");
            if (!button || !card) return;
            const skill = skills.find(
              (skill) => skill.id === card.dataset.skill,
            )!;
            void act(button, card, scope, "处理中…", async () => {
              if (button.dataset.action === "view") {
                if (
                  loadingDetail ||
                  root.querySelector('form[aria-busy="true"]')
                )
                  throw new Error("正在读取或保存 Skill，请等待完成后再切换。");
                await loadDetail(skill.id);
                if (scope.live()) {
                  status(card, "");
                  detail
                    .querySelector<HTMLSelectElement>("#skill-version")
                    ?.focus();
                }
              } else if (button.dataset.action === "delete") {
                const confirmed = await confirmDialog({
                  title: "删除 Skill 及其版本？",
                  body: `<p>将删除“${esc(skill.name)}”及库中的全部历史版本，之后不能再为新实验选择它。已有实验中的冻结文件仍会保留。</p><p>此操作无法撤销。</p>`,
                  confirm: "删除 Skill",
                  danger: true,
                });
                if (!confirmed || !scope.live()) {
                  if (scope.live()) status(card, "");
                  return;
                }
                if (
                  loadingDetail ||
                  root.querySelector('form[aria-busy="true"]')
                )
                  throw new Error("正在读取或保存 Skill，请等待完成后再删除。");
                await mutate(`/skills/${idPath(skill.id)}`, "DELETE");
                if (!scope.live()) return;
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
          },
          { signal: scope.signal },
        );
        detail.addEventListener(
          "click",
          (event) => {
            if (actionButton(event)?.dataset.action !== "close-detail") return;
            if (loadingDetail || root.querySelector('form[aria-busy="true"]'))
              return;
            ++request;
            selected = null;
            current = null;
            detail.hidden = true;
            detail.innerHTML = "";
          },
          { signal: scope.signal },
        );
        detail.addEventListener(
          "change",
          (event) => {
            const input = event.target as HTMLSelectElement;
            if (input.id === "skill-file-view" && current) {
              detail.querySelector("[data-skill-content]")!.textContent =
                current.files[input.value] || "";
            } else if (input.id === "skill-version" && selected) {
              if (
                loadingDetail ||
                root.querySelector('form[aria-busy="true"]')
              ) {
                input.value = String(viewedVersion);
                status(
                  detail,
                  "正在读取或保存 Skill，请等待完成后再切换版本。",
                  "warn",
                );
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
          },
          { signal: scope.signal },
        );
      });
    },
  };
}

export async function adminPage(): Promise<Page> {
  if (!state.user) return authGate();
  if (state.user.role !== "admin")
    return {
      html: `${head("管理中心", "此区域仅向管理员开放。")}${empty("没有管理权限", "你仍可在公开作品的详情页提交举报。", '<a class="btn outline" href="#/gallery">浏览作品</a>')}${footer()}`,
    };

  let activeTab = "challenges";
  let reports: Report[] = [];
  let metrics: AdminMetrics = { queue: [], audit: [] };
  let challenges: AdminChallenge[] = [];
  let prompts: AdminPrompt[] = [];
  let users: AdminUser[] = [];

  let challengeQ = "";
  let promptQ = "";
  let userQ = "";

  const tabsHtml = () => `
    <nav class="tabs" data-admin-tabs>
      <button class="btn outline small ${activeTab === "challenges" ? "active" : ""}" data-tab="challenges">题目管控</button>
      <button class="btn outline small ${activeTab === "prompts" ? "active" : ""}" data-tab="prompts">提示词审查</button>
      <button class="btn outline small ${activeTab === "users" ? "active" : ""}" data-tab="users">用户管理</button>
      <button class="btn outline small ${activeTab === "reports" ? "active" : ""}" data-tab="reports">待办举报 (${reports.length})</button>
      <button class="btn outline small ${activeTab === "metrics" ? "active" : ""}" data-tab="metrics">全站与审计</button>
    </nav>
  `;

  const challengesHtml = () => `
    <section class="panel stack" data-tab-panel="challenges">
      <div class="row between">
        <div class="row" style="gap:8px;">
          <input class="input" style="min-width:260px;" type="search" data-q="challenges" placeholder="搜索题目名称…" value="${esc(challengeQ)}">
          <button class="btn outline small" data-action="search-challenges">搜索</button>
        </div>
        <button class="btn outline small" data-action="refresh-challenges">刷新题目</button>
      </div>
      ${challenges.length ? `
        <div class="table-wrap" tabindex="0" role="region" aria-label="题目列表">
          <table class="table">
            <thead>
              <tr>
                <th>标题</th>
                <th>分类</th>
                <th>版本</th>
                <th>作者</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${challenges.map((c) => `
                <tr data-challenge-row="${esc(c.id)}">
                  <td><strong>${esc(c.title)}</strong></td>
                  <td><span class="mono">${esc(c.category)}</span></td>
                  <td>v${esc(c.current_version)}</td>
                  <td>${esc(c.author)}</td>
                  <td>${c.archived ? '<span class="muted">已下架</span>' : '<span style="color:var(--green,#2e7d32);">正常</span>'}</td>
                  <td class="row" style="gap:6px;">
                    <button class="btn outline small" data-action="edit-challenge" data-id="${esc(c.id)}">编辑/改Prompt</button>
                    <button class="btn outline small" data-action="toggle-archive" data-id="${esc(c.id)}" data-archived="${c.archived}">${c.archived ? "恢复" : "下架"}</button>
                    <button class="btn danger small" data-action="delete-challenge" data-id="${esc(c.id)}" data-title="${esc(c.title)}">彻底删除</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : empty("没有符合条件的题目", "可尝试更换关键词或刷新。")}
    </section>
  `;

  const promptsHtml = () => `
    <section class="panel stack" data-tab-panel="prompts">
      <div class="row between">
        <div class="row" style="gap:8px;">
          <input class="input" style="min-width:260px;" type="search" data-q="prompts" placeholder="搜索提示词名称或敏感词…" value="${esc(promptQ)}">
          <button class="btn outline small" data-action="search-prompts">搜索</button>
        </div>
        <button class="btn outline small" data-action="refresh-prompts">刷新提示词</button>
      </div>
      ${prompts.length ? `
        <div class="table-wrap" tabindex="0" role="region" aria-label="全站提示词列表">
          <table class="table">
            <thead>
              <tr>
                <th>模板名称</th>
                <th>创建者</th>
                <th>内容预览</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${prompts.map((p) => `
                <tr data-prompt-row="${esc(p.id)}">
                  <td><strong>${esc(p.name)}</strong></td>
                  <td>${esc(p.author)}</td>
                  <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(p.body)}">${esc(p.body)}</td>
                  <td>${esc(date(p.created))}</td>
                  <td class="row" style="gap:6px;">
                    <button class="btn outline small" data-action="edit-prompt" data-id="${esc(p.id)}">编辑内容</button>
                    <button class="btn danger small" data-action="delete-prompt" data-id="${esc(p.id)}" data-name="${esc(p.name)}">删除</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : empty("没有提示词模板", "未检索到匹配的提示词模板。")}
    </section>
  `;

  const usersHtml = () => `
    <section class="panel stack" data-tab-panel="users">
      <div class="row between">
        <div class="row" style="gap:8px;">
          <input class="input" style="min-width:260px;" type="search" data-q="users" placeholder="按用户名或邮箱搜索…" value="${esc(userQ)}">
          <button class="btn outline small" data-action="search-users">搜索</button>
        </div>
        <button class="btn outline small" data-action="refresh-users">刷新用户</button>
      </div>
      ${users.length ? `
        <div class="table-wrap" tabindex="0" role="region" aria-label="用户列表">
          <table class="table">
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>状态</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${users.map((u) => `
                <tr data-user-row="${esc(u.id)}">
                  <td><strong>${esc(u.username)}</strong></td>
                  <td class="mono">${esc(u.email)}</td>
                  <td><span class="mono">${esc(u.role)}</span></td>
                  <td>${u.suspended ? '<span class="danger" style="color:var(--danger,#c62828);">已封禁</span>' : '<span style="color:var(--green,#2e7d32);">正常</span>'}</td>
                  <td>${esc(date(u.created))}</td>
                  <td>
                    ${u.id === state.user?.id
                      ? '<span class="muted">当前账号</span>'
                      : `<button class="btn ${u.suspended ? "outline" : "danger"} small" data-action="toggle-suspend" data-id="${esc(u.id)}" data-name="${esc(u.username)}" data-suspended="${u.suspended}">${u.suspended ? "解封" : "封禁"}</button>`}
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : empty("未找到用户", "换个关键词搜索试试。")}
    </section>
  `;

  const reportsHtml = () => `
    <section class="stack" data-tab-panel="reports">
      <div class="section-head">
        <h2>待处理举报</h2>
        <span class="muted">${reports.length} 条待处理</span>
      </div>
      <p class="notice">隐藏会立即取消公开展示并隐身该作品。确认处理完成后，请另行“标记已解决”。</p>
      ${reports.length ? reports.map((report) => `
        <article class="panel" data-report="${esc(report.id)}">
          <p class="meta">举报时间 ${esc(date(report.created))} · 举报人 <span class="mono">${esc(report.owner_id)}</span></p>
          <p>${esc(report.reason)}</p>
          <p class="help">作品 <a class="mono" href="#/run/${idPath(report.run_id)}">${esc(report.run_id)}</a></p>
          <div class="actions">
            <button class="btn danger small" data-action="hide">隐藏作品</button>
            <button class="btn outline small" data-action="resolve">标记已解决</button>
          </div>
          ${statusBox()}
        </article>
      `).join("") : empty("没有待处理举报", "社区秩序良好，新的举报会出现在这里。")}
    </section>
  `;

  const metricsHtml = () => `
    <section class="stack" data-tab-panel="metrics">
      <section class="panel stack">
        <div class="section-head">
          <h2>全站实验状态</h2>
          <button class="btn outline small" data-action="refresh-metrics">刷新状态</button>
        </div>
        <div class="metric-grid">
          ${metrics.queue.length ? metrics.queue.map((item) => `
            <div class="metric">
              <span>${esc(({ queued: "排队中", running: "运行中", succeeded: "已完成", failed: "失败", canceled: "已取消" } as Record<string, string>)[item.status] || item.status)}</span>
              <strong>${esc(item.count)}</strong>
            </div>
          `).join("") : '<p class="muted">当前还没有实验。</p>'}
        </div>
      </section>
      <section class="panel stack">
        <h2>审计记录</h2>
        ${metrics.audit.length ? `
          <div class="table-wrap" tabindex="0" role="region" aria-label="审计记录">
            <table class="table">
              <caption>最近 ${metrics.audit.length} 条审计记录（最多 100 条）</caption>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作者</th>
                  <th>操作</th>
                  <th>目标</th>
                </tr>
              </thead>
              <tbody>
                ${metrics.audit.map((entry) => `
                  <tr>
                    <td>${esc(date(entry.created))}</td>
                    <td class="mono">${esc(entry.actor || "系统")}</td>
                    <td class="mono">${esc(entry.action)}</td>
                    <td class="mono">${esc(entry.target || "—")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : empty("暂无审计记录", "管理操作会记录在这里，不包含 API Key。")}
      </section>
    </section>
  `;

  const contentHtml = () => {
    switch (activeTab) {
      case "challenges": return challengesHtml();
      case "prompts": return promptsHtml();
      case "users": return usersHtml();
      case "reports": return reportsHtml();
      case "metrics": return metricsHtml();
      default: return challengesHtml();
    }
  };

  // 初始化首屏数据
  try {
    const [resChallenges, resReports] = await Promise.all([
      api<AdminChallenge[]>("/admin/challenges"),
      api<Report[]>("/admin/reports"),
    ]);
    challenges = resChallenges;
    reports = resReports;
  } catch (err) {
    // 错误处理由 core.ts 统一负责
  }

  return {
    html: `
      ${head("管理中心", "管理题目库、审查提示词、管控用户并处理违规举报。")}
      <div class="stack" data-admin-root>
        ${tabsHtml()}
        <div data-tab-content>${contentHtml()}</div>
      </div>
      ${footer()}
    `,
    mount(root) {
      return mountScope(root, (scope) => {
        const tabContent = root.querySelector<HTMLElement>("[data-tab-content]")!;
        const tabsContainer = root.querySelector<HTMLElement>("[data-admin-tabs]")!;

        const renderTab = () => {
          tabContent.innerHTML = contentHtml();
          tabsContainer.querySelectorAll("[data-tab]").forEach((btn) => {
            btn.classList.toggle("active", btn.getAttribute("data-tab") === activeTab);
          });
        };

        const loadChallenges = async () => {
          const q = challengeQ.trim() ? `?q=${encodeURIComponent(challengeQ.trim())}` : "";
          challenges = await api<AdminChallenge[]>(`/admin/challenges${q}`);
          if (activeTab === "challenges" && scope.live()) renderTab();
        };

        const loadPrompts = async () => {
          const q = promptQ.trim() ? `?q=${encodeURIComponent(promptQ.trim())}` : "";
          prompts = await api<AdminPrompt[]>(`/admin/prompts${q}`);
          if (activeTab === "prompts" && scope.live()) renderTab();
        };

        const loadUsers = async () => {
          const q = userQ.trim() ? `?q=${encodeURIComponent(userQ.trim())}` : "";
          users = await api<AdminUser[]>(`/admin/users${q}`);
          if (activeTab === "users" && scope.live()) renderTab();
        };

        const loadReports = async () => {
          reports = await api<Report[]>("/admin/reports");
          if (activeTab === "reports" && scope.live()) renderTab();
        };

        const loadMetrics = async () => {
          metrics = await api<AdminMetrics>("/admin/metrics");
          if (activeTab === "metrics" && scope.live()) renderTab();
        };

        // Tab 切换监听
        tabsContainer.addEventListener("click", async (e) => {
          const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
          if (!btn) return;
          const tab = btn.getAttribute("data-tab")!;
          if (tab === activeTab) return;
          activeTab = tab;
          renderTab();
          if (activeTab === "challenges" && !challenges.length) await loadChallenges();
          else if (activeTab === "prompts" && !prompts.length) await loadPrompts();
          else if (activeTab === "users" && !users.length) await loadUsers();
          else if (activeTab === "reports" && !reports.length) await loadReports();
          else if (activeTab === "metrics" && !metrics.queue.length) await loadMetrics();
        });

        // 全局操作代理监听
        root.addEventListener("click", async (event) => {
          const button = actionButton(event);
          if (!button) return;
          const actName = button.dataset.action;
          if (!actName) return;

          // 1. 题目操作
          if (actName === "search-challenges") {
            const input = root.querySelector<HTMLInputElement>('input[data-q="challenges"]');
            challengeQ = input ? input.value : "";
            await loadChallenges();
            return;
          }
          if (actName === "refresh-challenges") {
            await loadChallenges();
            toast("题目列表已刷新");
            return;
          }
          if (actName === "toggle-archive") {
            const id = button.dataset.id!;
            const isArchived = button.dataset.archived === "true";
            await mutate("/admin/moderate", "POST", {
              action: isArchived ? "restore_challenge" : "archive_challenge",
              target: id,
            });
            toast(isArchived ? "题目已恢复上架" : "题目已下架归档");
            await loadChallenges();
            return;
          }
          if (actName === "delete-challenge") {
            const id = button.dataset.id!;
            const title = button.dataset.title || "";
            const ok = await confirmDialog({
              title: `彻底删除题目《${title}》？`,
              body: `<p>此操作将<strong>永久物理清除</strong>该题目、所有历代版本以及该题目下生成的<strong>所有历史实验作品与评测记录</strong>！</p><p class="danger" style="color:var(--danger,#c62828);">此操作不可撤销，请慎重决定！</p>`,
              confirm: "彻底删除",
              danger: true,
            });
            if (!ok || !scope.live()) return;
            await mutate(`/admin/challenges/${id}`, "DELETE");
            toast("题目已彻底删除");
            await loadChallenges();
            return;
          }
          if (actName === "edit-challenge") {
            const id = button.dataset.id!;
            const ch = challenges.find((x) => x.id === id);
            if (!ch) return;
            showDialog(
              "编辑题目与 Prompt",
              `<form id="edit-ch-form" class="stack">
                ${field("ec-title", "题目名称", `<input id="ec-title" name="title" required minlength="1" maxlength="100" value="${esc(ch.title)}">`)}
                ${field("ec-category", "分类", `<input id="ec-category" name="category" required minlength="1" maxlength="30" value="${esc(ch.category)}">`)}
                ${field("ec-desc", "题目描述", `<textarea id="ec-desc" name="description" rows="3" required minlength="1" maxlength="1500">${esc(ch.description)}</textarea>`)}
                ${field("ec-prompt", "当前引导语 (Prompt)", `<textarea id="ec-prompt" name="prompt" rows="6" required minlength="1" maxlength="6000">${esc(ch.prompt || "")}</textarea>`, "可直接在此微调 Prompt，保存后立即对新评测生效。")}
                ${field("ec-rubric", "评判标准 (Rubric)", `<textarea id="ec-rubric" name="rubric" rows="4" required minlength="1" maxlength="3000">${esc(ch.rubric || "")}</textarea>`)}
                <div class="actions">
                  <button class="btn outline" type="button" data-dialog-cancel>取消</button>
                  <button class="btn primary" type="submit">保存修改</button>
                </div>
              </form>`,
              (dialog) => {
                dialog.querySelector("[data-dialog-cancel]")?.addEventListener("click", closeDialog);
                const form = dialog.querySelector<HTMLFormElement>("form")!;
                form.addEventListener("submit", async (e) => {
                  e.preventDefault();
                  const fd = new FormData(form);
                  await mutate(`/admin/challenges/${id}`, "PUT", {
                    title: String(fd.get("title") || "").trim(),
                    category: String(fd.get("category") || "").trim(),
                    description: String(fd.get("description") || "").trim(),
                    prompt: String(fd.get("prompt") || "").trim(),
                    rubric: String(fd.get("rubric") || "").trim(),
                  });
                  closeDialog();
                  toast("题目已成功更新");
                  await loadChallenges();
                });
              }
            );
            return;
          }

          // 2. 提示词操作
          if (actName === "search-prompts") {
            const input = root.querySelector<HTMLInputElement>('input[data-q="prompts"]');
            promptQ = input ? input.value : "";
            await loadPrompts();
            return;
          }
          if (actName === "refresh-prompts") {
            await loadPrompts();
            toast("提示词列表已刷新");
            return;
          }
          if (actName === "edit-prompt") {
            const id = button.dataset.id!;
            const pr = prompts.find((x) => x.id === id);
            if (!pr) return;
            showDialog(
              "编辑提示词模板",
              `<form id="edit-pr-form" class="stack">
                ${field("ep-name", "模板名称", `<input id="ep-name" name="name" required minlength="1" maxlength="80" value="${esc(pr.name)}">`)}
                ${field("ep-body", "提示词内容 (Body)", `<textarea id="ep-body" name="body" rows="8" required minlength="1" maxlength="5000">${esc(pr.body)}</textarea>`)}
                <div class="actions">
                  <button class="btn outline" type="button" data-dialog-cancel>取消</button>
                  <button class="btn primary" type="submit">保存修改</button>
                </div>
              </form>`,
              (dialog) => {
                dialog.querySelector("[data-dialog-cancel]")?.addEventListener("click", closeDialog);
                const form = dialog.querySelector<HTMLFormElement>("form")!;
                form.addEventListener("submit", async (e) => {
                  e.preventDefault();
                  const fd = new FormData(form);
                  await mutate(`/admin/prompts/${id}`, "PUT", {
                    name: String(fd.get("name") || "").trim(),
                    body: String(fd.get("body") || "").trim(),
                  });
                  closeDialog();
                  toast("提示词模板已更新");
                  await loadPrompts();
                });
              }
            );
            return;
          }
          if (actName === "delete-prompt") {
            const id = button.dataset.id!;
            const name = button.dataset.name || "";
            const ok = await confirmDialog({
              title: `删除提示词《${name}》？`,
              body: "<p>此提示词模板将被永久删除。</p>",
              confirm: "删除模板",
              danger: true,
            });
            if (!ok || !scope.live()) return;
            await mutate(`/admin/prompts/${id}`, "DELETE");
            toast("提示词已删除");
            await loadPrompts();
            return;
          }

          // 3. 用户操作
          if (actName === "search-users") {
            const input = root.querySelector<HTMLInputElement>('input[data-q="users"]');
            userQ = input ? input.value : "";
            await loadUsers();
            return;
          }
          if (actName === "refresh-users") {
            await loadUsers();
            toast("用户列表已刷新");
            return;
          }
          if (actName === "toggle-suspend") {
            const id = button.dataset.id!;
            const name = button.dataset.name || "";
            const isSuspended = button.dataset.suspended === "true";
            if (!isSuspended) {
              const ok = await confirmDialog({
                title: `封禁用户 @${name}？`,
                body: `<p>封禁将<strong>立即注销其所有登录会话</strong>，清除投票，撤回所有公开作品并隐藏其全部评论！</p>`,
                confirm: "确认封禁",
                danger: true,
              });
              if (!ok || !scope.live()) return;
            }
            await mutate("/admin/moderate", "POST", {
              action: isSuspended ? "reinstate_user" : "suspend_user",
              target: id,
            });
            toast(isSuspended ? `已解封用户 @${name}` : `已封禁用户 @${name}`);
            await loadUsers();
            return;
          }

          // 4. 举报处理
          if (actName === "hide" || actName === "resolve") {
            const card = button.closest<HTMLElement>("[data-report]");
            if (!card) return;
            const report = reports.find((r) => r.id === card.dataset.report);
            if (!report) return;
            const hide = actName === "hide";
            const confirmed = await confirmDialog({
              title: hide ? "隐藏这件作品？" : "将举报标记为已解决？",
              body: hide
                ? `<p>作品 ${esc(report.run_id)} 将从公开页面移除并取消发布。举报仍保持待处理，完成调查后请标记已解决。</p>`
                : "<p>此举报将离开待处理列表，作品公开状态不会改变。请确认已完成处置。</p>",
              confirm: hide ? "隐藏作品" : "标记已解决",
              danger: hide,
            });
            if (!confirmed || !scope.live()) return;
            await mutate("/admin/moderate", "POST", {
              action: hide ? "hide_run" : "resolve_report",
              target: hide ? report.run_id : report.id,
            });
            toast(hide ? "作品已隐藏" : "举报已标记解决");
            await loadReports();
            return;
          }

          // 5. 状态与审计
          if (actName === "refresh-metrics") {
            await loadMetrics();
            toast("实验状态与审计日志已刷新");
            return;
          }
        });

        // 支持在各搜索框按 Enter 回车触发搜索
        root.addEventListener("keydown", async (event) => {
          if (event.key !== "Enter") return;
          const input = event.target as HTMLElement;
          if (input instanceof HTMLInputElement && input.dataset.q) {
            event.preventDefault();
            const qType = input.dataset.q;
            if (qType === "challenges") {
              challengeQ = input.value;
              await loadChallenges();
            } else if (qType === "prompts") {
              promptQ = input.value;
              await loadPrompts();
            } else if (qType === "users") {
              userQ = input.value;
              await loadUsers();
            }
          }
        });
      });
    },
  };
}
