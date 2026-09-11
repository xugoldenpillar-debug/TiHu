import {
  api,
  mutate,
  state,
  go,
  query,
  refreshSession,
  esc,
  fmt,
  date,
  duration,
  errorText,
  head,
  empty,
  badge,
  field,
  footer,
  authGate,
  verificationNotice,
  toast,
  formError,
  clearFormError,
  showDialog,
  closeDialog,
  confirmDialog,
  authenticate,
  burstParticles,
  celebrate,
  renderVendorBadge,
  detectVendor,
  vendorSvgs,
  type Page,
  type PageResult,
} from "./core.js";
import {
  record,
  type Challenge,
  type ChallengeDetail,
  type ChallengeVersion,
  type RunSummary,
} from "./types.js";

interface ConnectionSummary {
  id: string;
  label: string;
  models: string[];
  protocol?: string;
  base_url?: string;
  last4?: string;
  is_official?: boolean;
}
interface SkillSummary {
  id: string;
  name: string;
  current_version: number;
}
interface PromptTemplate {
  id: string;
  name: string;
  body: string;
}
interface RunDetail extends RunSummary {
  snapshot: Record<string, unknown>;
  can_view_events: boolean;
  can_vote: boolean;
  vote_reason: string | null;
  metrics: RunSummary["metrics"] & { usage_calls?: number; image_id?: string };
}
interface SourceArtifact {
  files: Record<string, string>;
  sha256: string;
  size: number;
}
interface RunComment {
  id: string;
  owner_id: string;
  body: string;
  username: string;
  created: number;
  can_delete: boolean;
}
interface VoteResult {
  count: number;
  active: boolean;
}
interface PreviewLink {
  url: string;
  expires: number;
}
interface SubmittedRun {
  id: string;
  status: string;
  reused: boolean;
}
const voteKinds: ("capability" | "funny")[] = ["capability", "funny"];

type Draft = {
  owner: string;
  challenge: string;
  version: string;
  key: string;
  model: string;
  prompt: string;
  thinking: string;
  skills: string[];
  consent: boolean;
  advanced: boolean;
  template: string;
};
let draft: Draft | null = null;
window.addEventListener("tihu-session-change", () => {
  if (draft?.owner !== state.user?.id) draft = null;
});
const active = (run: RunDetail) => ["queued", "running"].includes(run.status);
const pathFor = (id: string) => "/runs/" + encodeURIComponent(id);
const statusLabels: Record<string, string> = {
  queued: "等待运行",
  running: "正在构建",
  succeeded: "已完成",
  failed: "未完成",
  canceled: "已取消",
};
const option = (value: unknown, label: unknown, selected: unknown) =>
  `<option value="${esc(value)}"${value === selected ? " selected" : ""}>${esc(label)}</option>`;
const numberOrUnknown = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? fmt(value) : "未提供";

function quotaHTML(): string {
  const q = state.quota;
  if (!q) return '<p class="help">配额将在提交时由服务器核对。</p>';
  return `<div class="notice" data-quota><strong>当前运行 ${esc(q.active)} / ${esc(q.active_limit)}</strong> · 滚动 24 小时已用 ${esc(q.daily_used)} / ${esc(q.daily_limit)}，剩余 ${esc(q.daily_remaining)} 次。${q.next_available_at ? `<p>下一个额度最早于 ${esc(date(q.next_available_at))} 释放；仍需满足并发限制。</p>` : ""}<a href="#/my-runs">管理我的实验</a></div>`;
}

function runError(code: unknown): string {
  const value = String(code || "runner_failure");
  return `<div class="notice ${value === "user_canceled" ? "warn" : "error"}"><strong>${esc(errorText(value))}</strong><p class="mono break-word">错误标识：${esc(value)}</p><p>已发生的服务商请求仍可能计费；不会自动重试。</p><a href="#/connections">检查 API 连接</a></div>`;
}

export async function studioPage(): Promise<Page> {
  if (draft?.owner !== state.user?.id) draft = null;
  if (!state.user) return authGate();
  const [first, keys, skills, prompts] = await Promise.all([
    api<PageResult<Challenge>>("/challenges?limit=100"),
    api<ConnectionSummary[]>("/keys"),
    api<SkillSummary[]>("/skills"),
    api<PromptTemplate[]>("/prompts"),
  ]);
  const tasks = [...first.items];
  const q = query();
  const requested = q.get("challenge") || draft?.challenge || tasks[0]?.id;
  if (!requested)
    return {
      html:
        head("新实验", "每次实验使用一个全新的隔离运行环境。") +
        empty(
          "先选择一个任务",
          "任务规定了模型需要完成什么。你可以从已有挑战开始，也可以创建自己的任务。",
          '<a class="btn primary" href="#/new-challenge">创建任务</a>',
        ) +
        footer(),
    };
  let task = await api<ChallengeDetail>(
    "/challenges/" + encodeURIComponent(requested),
  );
  if (!tasks.some((x) => x.id === task.id)) tasks.unshift(task);
  const selectedVersion =
    q.get("version") ||
    (draft?.challenge === task.id ? draft.version : "") ||
    task.versions[0]?.id ||
    "";
  if (!draft)
    draft = {
      owner: state.user.id,
      challenge: task.id,
      version: selectedVersion,
      key: keys[0]?.id || "",
      model: keys[0]?.models?.[0] || "",
      prompt: "",
      thinking: "off",
      skills: [],
      consent: false,
      advanced: false,
      template: "",
    };
  const d = draft;
  d.challenge = task.id;
  d.version = task.versions.some((v) => v.id === selectedVersion)
    ? selectedVersion
    : task.versions[0]?.id || "";
  d.skills = d.skills.filter((id) => skills.some((skill) => skill.id === id));
  if (!keys.some((key) => key.id === d.key)) {
    d.key = keys[0]?.id || "";
    d.model = "";
  }
  const selectedKey = keys.find((key) => key.id === d.key);
  if (!selectedKey?.models?.includes(d.model))
    d.model = selectedKey?.models?.[0] || "";
  const harness = state.config.harness;
  const maxSkills = state.config.limits?.skills_per_run ?? 4;
  return {
    html: `${head("新实验", "冻结任务与配置，运行一次，保留每一步。")}${verificationNotice()}${!keys.length ? '<div class="notice warn"><h3>先连接自己的模型服务</h3><p>TiHu 不提供公共额度。保存 API 连接并发现模型后，才能提交实验。密钥不会写入此页草稿。</p><a class="btn primary" href="#/connections">添加 API 连接</a></div>' : ""}<div class="two"><form class="panel stack" id="studio-form"><section class="stack"><h2>任务与版本</h2>${field("task-search", "查找任务", '<input id="task-search" type="search" placeholder="按标题或描述搜索">')}<div class="help" id="task-search-state" role="status"></div>${field("studio-challenge", "任务", `<select id="studio-challenge" name="challenge">${tasks.map((x) => option(x.id, x.title, d.challenge)).join("")}</select>`)}<button class="btn outline small" type="button" id="more-tasks"${first.next_cursor ? "" : " hidden"}>加载更多任务</button>${field("studio-version", "不可变版本", `<select id="studio-version" name="version_id">${task.versions.map((v: ChallengeVersion) => option(v.id, "v" + v.number, d.version)).join("")}</select>`)}<details class="details" open><summary>原始任务提示词与评审标准</summary><div id="task-contract"></div></details></section><section class="stack"><h2>模型连接</h2>${field("studio-key", "API 连接", `<select id="studio-key" name="key_id">${keys.length ? keys.map((key) => option(key.id, `${key.label} (${key.protocol || "openai"} · ••••${key.last4 || ""})`, d.key)).join("") : '<option value="">尚未添加连接</option>'}</select>`, "选择已配置的服务商连接，显示请求协议与末四位掩码。")}<div id="key-protocol-info" class="help mono"></div>${field("studio-model", "模型", `<select id="studio-model" name="model">${(selectedKey?.models || []).map((model: string) => option(model, model, d.model)).join("")}</select>`)}<div id="model-readiness" class="help"></div><a href="#/connections">管理连接与模型列表</a></section><details class="details" id="studio-advanced"${d.advanced ? " open" : ""}><summary>高级设置 · 提示词、思考与 Skills</summary><div class="stack">${field("studio-template", "附加提示词模板", `<select id="studio-template"><option value="">自己编写</option>${prompts.map((prompt) => option(prompt.id, prompt.name, d.template)).join("")}</select>`)}${field("studio-prompt", "附加提示词", `<textarea id="studio-prompt" name="prompt" rows="5" maxlength="5000" placeholder="留空可保持标准赛道">${esc(d.prompt)}</textarea>`, "只追加到原始任务，不会覆盖任务版本。草稿只保留在当前页面会话内，退出账号后清除。")}${field("studio-thinking", "思考级别", `<select id="studio-thinking" name="thinking">${["off", "minimal", "low", "medium", "high", "xhigh", "max"].map((level) => option(level, level === "off" ? "off · 不启用额外思考" : level, d.thinking)).join("")}</select>`, "非 off 设置进入开放赛道；服务商和具体模型是否支持此级别，仍由实际请求决定。")}<fieldset class="field"><legend>Skills · 最多 ${esc(maxSkills)} 个</legend>${skills.length ? `<div class="checkboxes">${skills.map((skill) => `<label class="check"><input type="checkbox" name="skill" value="${esc(skill.id)}"${d.skills.includes(skill.id) ? " checked" : ""}>${esc(skill.name)} <span class="muted">v${esc(skill.current_version || 1)}</span></label>`).join("")}</div>` : '<p class="help">还没有 Skills。<a href="#/skills">上传 Skill</a></p>'}<p class="help">提交时冻结当前文件版本；以后修改 Skill 不会改变这次实验。</p></fieldset></div></details><div id="studio-track" class="notice"></div><div id="studio-quota">${quotaHTML()}</div><label class="check"><input type="checkbox" name="consent" id="studio-consent"${d.consent ? " checked" : ""}>我了解 API 服务商可能产生费用，取消实验无法退回已被接受的请求。</label><p id="studio-ready" class="help" role="status" aria-live="polite"></p><button class="btn primary full" id="studio-submit" type="submit">开始一次性实验</button></form><aside class="panel stack lab-contract"><div class="eyebrow">冻结的实验条件</div><h2>同条件，才可比较。</h2><p>只有任务、任务版本、赛道和环境指纹全部相同，两个实验才会标记为同条件比较。</p><dl class="summary-list">${[
      [
        "Agent",
        (harness.agent || "pi") + " / " + (harness.version || "未提供"),
      ],
      ["运行时", harness.runtime],
      [
        "CPU / 内存",
        `${harness.cpu ?? "—"} CPU / ${harness.memory_mb ?? "—"} MB`,
      ],
      ["运行时限", `${harness.seconds ?? "—"} 秒`],
      ["模型请求上限", harness.calls],
      ["单次输出 Token 上限", harness.output_tokens_per_call],
      ["沙箱网络", harness.network === "none" ? "关闭" : harness.network],
      ["可用工具", (harness.tools || []).join(", ")],
    ]
      .map(
        ([label, value]) =>
          `<div class="summary-row"><dt>${esc(label)}</dt><dd class="break-word">${esc(value ?? "未提供")}</dd></div>`,
      )
      .join(
        "",
      )}</dl><div class="notice warn">这些是资源与请求限制，不是金额上限。请在服务商侧设置消费限额。不会自动重试付费调用。</div><p class="help">标准赛道：无附加提示词、无 Skills，思考级别为 off。开放赛道：只要任一条件改变就进入开放赛道；开放赛道内部配置仍可能不同。</p><a href="#/my-runs">查看已有实验</a></aside></div>${footer()}`,
    mount(root) {
      const abort = new AbortController();
      let disposed = false;
      let pending = false;
      let taskLoading = false;
      let taskFailed = false;
      let taskRequest = 0;
      let searchRequest = 0;
      let searchTimer: number | undefined;
      let cursor = first.next_cursor;
      let searchTerm = "";
      let idem = crypto.randomUUID().replaceAll("-", "");
      let submittedFingerprint = "";
      const form = root.querySelector<HTMLFormElement>("#studio-form")!;
      const select = (id: string) => root.querySelector<HTMLSelectElement>(id)!;
      const challenge = select("#studio-challenge");
      const version = select("#studio-version");
      const key = select("#studio-key");
      const model = select("#studio-model");
      const prompt = root.querySelector<HTMLTextAreaElement>("#studio-prompt")!;
      const thinking = select("#studio-thinking");
      const consent = root.querySelector<HTMLInputElement>("#studio-consent")!;
      const submit = root.querySelector<HTMLButtonElement>("#studio-submit")!;
      const searchState =
        root.querySelector<HTMLElement>("#task-search-state")!;
      const more = root.querySelector<HTMLButtonElement>("#more-tasks")!;
      const remember = () => {
        if (d.owner !== state.user?.id) return;
        Object.assign(d, {
          challenge: challenge.value,
          version: version.value,
          key: key.value,
          model: model.value,
          prompt: prompt.value,
          thinking: thinking.value,
          skills: [
            ...form.querySelectorAll<HTMLInputElement>(
              'input[name="skill"]:checked',
            ),
          ].map((el) => el.value),
          consent: consent.checked,
          template: select("#studio-template").value,
          advanced:
            root.querySelector<HTMLDetailsElement>("#studio-advanced")!.open,
        });
      };
      const syncTask = () => {
        const v = task.versions.find((entry) => entry.id === version.value);
        root.querySelector("#task-contract")!.innerHTML = v
          ? `<h3>原始提示词</h3><pre class="code">${esc(v.prompt)}</pre><h3>评审标准</h3><p class="comment-body">${esc(v.rubric)}</p><p class="help mono break-word">版本 SHA-256：${esc(v.sha256)}</p>`
          : '<p class="notice error">此任务没有可运行版本。</p>';
      };
      const readiness = () => {
        remember();
        const selected = keys.find((entry) => entry.id === key.value);
        const keyInfoEl = root.querySelector("#key-protocol-info");
        if (keyInfoEl) {
          keyInfoEl.textContent = selected
            ? `连接协议：${selected.protocol || "openai"} · 地址：${selected.base_url || "—"}`
            : "";
        }
        const modelReady = Boolean(selected?.models?.includes(model.value));
        root.querySelector("#model-readiness")!.textContent = !selected
          ? "请先添加一个 API 连接。"
          : !selected.models?.length
            ? "此连接还没有模型。请到连接页发现模型，或选择另一个连接。"
            : `已选择 ${model.value || "—"}；仅会在你确认提交后发起付费请求。`;
        const open = Boolean(
          prompt.value.trim() || d.skills.length || thinking.value !== "off",
        );
        root.querySelector("#studio-track")!.innerHTML =
          `${badge(open ? "open" : "standard", open ? "开放赛道" : "标准赛道")} <span>${open ? "存在附加提示词、Skill 或额外思考设置；不会混入标准赛道排名。" : "原始任务提示词 + 无 Skill + 思考 off；按相同任务版本与执行环境比较。"}</span>`;
        const quota = state.quota;
        const reason = pending
          ? "正在提交，请勿重复操作。"
          : state.user?.id !== d.owner
            ? "账号已改变，请重新进入新实验页。"
            : !state.user?.verified
              ? "先验证邮箱，再提交实验。"
              : taskLoading
                ? "正在读取任务版本。"
                : taskFailed
                  ? "任务版本读取失败，请重新选择任务。"
                  : task.archived
                    ? "此任务已归档，请选择其他任务。"
                    : !version.value
                      ? "请选择可用任务版本。"
                      : !modelReady
                        ? "请选择已有连接中的可用模型。"
                        : d.skills.length > maxSkills
                          ? `最多选择 ${maxSkills} 个 Skills。`
                          : quota && quota.active >= quota.active_limit
                            ? "并发实验已满，等待完成或取消已有实验。"
                            : quota && quota.daily_remaining <= 0
                              ? "滚动 24 小时额度已用完，请等待额度释放。"
                              : !consent.checked
                                ? "阅读并勾选费用确认后，才能开始。"
                                : "";
        root.querySelector("#studio-ready")!.textContent =
          reason || "准备就绪。提交将冻结当前配置并创建一个新实验。";
        submit.disabled = Boolean(reason);
        submit.textContent = pending ? "正在提交…" : "开始一次性实验";
      };
      const loadTask = async () => {
        const serial = ++taskRequest;
        taskLoading = true;
        taskFailed = false;
        version.disabled = true;
        readiness();
        try {
          const next = await api<ChallengeDetail>(
            "/challenges/" + encodeURIComponent(challenge.value),
            { signal: abort.signal },
          );
          if (disposed || serial !== taskRequest) return;
          task = next;
          version.innerHTML = task.versions
            .map((v) => option(v.id, "v" + v.number, task.versions[0]?.id))
            .join("");
          syncTask();
          clearFormError(form);
        } catch (error) {
          if (!disposed && serial === taskRequest) {
            taskFailed = true;
            formError(form, error);
          }
        } finally {
          if (!disposed && serial === taskRequest) {
            taskLoading = false;
            version.disabled = false;
            readiness();
          }
        }
      };
      const searchTasks = async (append: boolean) => {
        const serial = ++searchRequest;
        more.disabled = true;
        searchState.textContent = "正在查找任务…";
        const params = new URLSearchParams({ limit: "100", q: searchTerm });
        if (append && cursor) params.set("cursor", cursor);
        try {
          const result = await api<PageResult<Challenge>>(
            "/challenges?" + params,
            { signal: abort.signal },
          );
          if (disposed || serial !== searchRequest) return;
          const current = challenge.value;
          const currentLabel =
            challenge.selectedOptions[0]?.textContent || task.title;
          if (!append)
            challenge.innerHTML = option(current, currentLabel, current);
          const existing = new Set(
            [...challenge.options].map((entry) => entry.value),
          );
          for (const entry of result.items)
            if (!existing.has(entry.id)) {
              challenge.insertAdjacentHTML(
                "beforeend",
                option(entry.id, entry.title, current),
              );
              existing.add(entry.id);
            }
          cursor = result.next_cursor;
          more.hidden = !cursor;
          searchState.textContent = `找到 ${result.total} 个任务。当前选择保持不变，请在下方选择。`;
        } catch (error) {
          if (!disposed && serial === searchRequest)
            searchState.textContent = errorText(error);
        } finally {
          if (!disposed && serial === searchRequest) more.disabled = false;
        }
      };
      root.querySelector("#task-search")!.addEventListener(
        "input",
        (ev) => {
          searchTerm = (ev.target as HTMLInputElement).value.trim();
          clearTimeout(searchTimer);
          ++searchRequest;
          searchTimer = window.setTimeout(() => {
            void searchTasks(false);
          }, 300);
        },
        { signal: abort.signal },
      );
      more.addEventListener(
        "click",
        () => {
          void searchTasks(true);
        },
        { signal: abort.signal },
      );
      challenge.addEventListener(
        "change",
        () => {
          void loadTask();
        },
        { signal: abort.signal },
      );
      version.addEventListener("change", syncTask, { signal: abort.signal });
      key.addEventListener(
        "change",
        () => {
          const models =
            keys.find((entry) => entry.id === key.value)?.models || [];
          const chosen = models.includes(model.value) ? model.value : models[0];
          model.innerHTML = models.length
            ? models
                .map((entry: string) => option(entry, entry, chosen))
                .join("")
            : '<option value="">尚无可用模型</option>';
          readiness();
        },
        { signal: abort.signal },
      );
      select("#studio-template").addEventListener(
        "change",
        (ev) => {
          const selected = prompts.find(
            (entry) => entry.id === (ev.target as HTMLSelectElement).value,
          );
          if (selected) prompt.value = selected.body;
          readiness();
        },
        { signal: abort.signal },
      );
      prompt.addEventListener(
        "input",
        () => {
          select("#studio-template").value = "";
        },
        { signal: abort.signal },
      );
      form.addEventListener("input", readiness, { signal: abort.signal });
      form.addEventListener("change", readiness, { signal: abort.signal });
      root
        .querySelector("#studio-advanced")!
        .addEventListener("toggle", remember, { signal: abort.signal });
      window.addEventListener("tihu-session-change", readiness, {
        signal: abort.signal,
      });
      form.addEventListener(
        "submit",
        async (ev) => {
          ev.preventDefault();
          readiness();
          if (pending || submit.disabled || !form.reportValidity()) return;
          clearFormError(form);
          remember();
          const body = {
            key_id: d.key,
            version_id: d.version,
            model: d.model,
            prompt: d.prompt,
            thinking: d.thinking,
            skill_ids: d.skills,
            consent: d.consent,
          };
          const fingerprint = JSON.stringify(body);
          if (submittedFingerprint && submittedFingerprint !== fingerprint)
            idem = crypto.randomUUID().replaceAll("-", "");
          submittedFingerprint = fingerprint;
          pending = true;
          readiness();
          try {
            const result = await api<SubmittedRun>("/runs", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "Idempotency-Key": idem,
              },
              body: fingerprint,
            });
            if (disposed) return;
            d.consent = false;
            consent.checked = false;
            celebrate(submit, { count: 28 });
            go("/run/" + encodeURIComponent(result.id));
          } catch (error) {
            if (!disposed) {
              formError(form, error);
              try {
                await refreshSession();
                if (!disposed)
                  root.querySelector("#studio-quota")!.innerHTML = quotaHTML();
              } catch {
                /* The original submission error remains actionable. */
              }
            }
          } finally {
            if (!disposed) {
              pending = false;
              readiness();
            }
          }
        },
        { signal: abort.signal },
      );
      syncTask();
      readiness();
      return () => {
        remember();
        disposed = true;
        abort.abort();
        clearTimeout(searchTimer);
      };
    },
  };
}

function metricsHTML(run: RunDetail): string {
  const m = run.metrics || {};
  const tokens = m.tokens || {};
  const elapsed =
    m.elapsed_ms ??
    (run.finished && run.started ? (run.finished - run.started) * 1000 : null);
  const rows = [
    ["模型调用", numberOrUnknown(m.calls)],
    ["执行耗时", duration(elapsed)],
    ["输入 Token", numberOrUnknown(tokens.input)],
    ["输出 Token", numberOrUnknown(tokens.output)],
    ["思考 Token", numberOrUnknown(tokens.reasoning)],
    ["缓存读取 Token", numberOrUnknown(tokens.cache_read)],
    ["缓存写入 Token", numberOrUnknown(tokens.cache_write)],
    ["有用量回报的调用", numberOrUnknown(m.usage_calls)],
  ];
  return `<div class="metric-grid">${rows.map(([label, value]) => `<div class="metric"><span class="muted">${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div><p class="help">${m.usage_complete === true ? "Token 为服务商返回的已记录用量。" : "用量回报不完整或尚未返回；已显示的是部分已知用量，未知值不等于 0。"} 费用未估算，请以服务商账单为准。</p>${run.started ? `<p class="help">开始：${esc(date(run.started))}${run.finished ? ` · 结束：${esc(date(run.finished))}` : ""}</p>` : ""}${m.image_id ? `<p class="help mono break-word">镜像：${esc(m.image_id)}</p>` : ""}`;
}

function previewHTML(run: RunDetail, prefix: string): string {
  const isCompare = prefix.startsWith("compare");
  const iframeHeight = isCompare
    ? "min(520px, calc(100vh - 220px))"
    : "min(720px, calc(100vh - 160px))";
  const iframeMinHeight = isCompare ? "380px" : "480px";
  return `<section class="preview ${isCompare ? "preview-compare" : "preview-run"}" data-preview="${esc(prefix)}"><div class="preview-toolbar"><strong>隔离预览</strong><div class="actions"><button type="button" class="btn outline small" data-preview-mode="desktop" aria-pressed="true">桌面</button><button type="button" class="btn outline small" data-preview-mode="mobile" aria-pressed="false">手机</button><button type="button" class="btn outline small" data-preview-refresh>重新加载预览</button></div></div><p class="help" style="margin:6px 16px 0 16px;font-size:12px;">手机模式只调整视窗宽度，不模拟设备。重新加载会清空预览内的交互状态；链接过期后可重新获取。</p><p class="form-error" data-preview-error role="alert" hidden></p><div class="preview-stage desktop"><iframe class="preview-frame" style="height:${iframeHeight};min-height:${iframeMinHeight};" title="${esc(run.title)} · ${esc(run.model)} 的隔离作品预览" sandbox="allow-scripts" referrerpolicy="no-referrer"></iframe></div></section>`;
}

function mountPreview(container: HTMLElement, run: RunDetail): () => void {
  const abort = new AbortController();
  let disposed = false;
  let loading = false;
  const frame = container.querySelector<HTMLIFrameElement>("iframe")!;
  const stage = container.querySelector<HTMLElement>(".preview-stage")!;
  const button = container.querySelector<HTMLButtonElement>(
    "[data-preview-refresh]",
  )!;
  const error = container.querySelector<HTMLElement>("[data-preview-error]")!;
  const load = async () => {
    if (loading) return;
    loading = true;
    button.disabled = true;
    button.textContent = "获取预览链接…";
    error.hidden = true;
    try {
      const result = await api<PreviewLink>(pathFor(run.id) + "/preview", {
        signal: abort.signal,
      });
      if (disposed) return;
      const url = new URL(result.url);
      const expected = state.config.preview_origin
        ? new URL(state.config.preview_origin).origin
        : null;
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.origin === location.origin ||
        (expected && url.origin !== expected)
      )
        throw new Error("预览地址没有满足独立来源隔离要求，已阻止加载。");
      frame.src = url.href;
    } catch (err) {
      if (!disposed) {
        error.textContent = errorText(err);
        error.hidden = false;
      }
    } finally {
      if (!disposed) {
        loading = false;
        button.disabled = false;
        button.textContent = "重新加载预览";
      }
    }
  };
  button.addEventListener(
    "click",
    () => {
      void load();
    },
    { signal: abort.signal },
  );
  container
    .querySelectorAll<HTMLButtonElement>("[data-preview-mode]")
    .forEach((control) =>
      control.addEventListener(
        "click",
        () => {
          const mobile = control.dataset.previewMode === "mobile";
          stage.classList.toggle("mobile", mobile);
          stage.classList.toggle("desktop", !mobile);
          container
            .querySelectorAll<HTMLButtonElement>("[data-preview-mode]")
            .forEach((item) =>
              item.setAttribute("aria-pressed", String(item === control)),
            );
        },
        { signal: abort.signal },
      ),
    );
  void load();
  return () => {
    disposed = true;
    abort.abort();
    frame.removeAttribute("src");
  };
}

function voteReason(run: RunDetail): string {
  if (!run.published || run.hidden || run.status !== "succeeded")
    return "仅公开且未隐藏的完成作品可以投票。";
  if (!state.user) return "登录并验证邮箱后可以参与投票。";
  if (
    run.owner_id === state.user.id ||
    run.vote_reason === "cannot_vote_own_work"
  )
    return "作者不能为自己的作品投票。";
  if (!state.user.verified || run.vote_reason === "verification_required")
    return "验证邮箱后才能投票。";
  if (
    run.vote_reason === "account_too_new" ||
    (state.voteEligibleAt && state.voteEligibleAt * 1000 > Date.now())
  )
    return state.voteEligibleAt
      ? `新账号需等待至 ${date(state.voteEligibleAt)} 才能投票。`
      : "账号尚未达到投票所需注册时长，请稍后再来。";
  return run.can_vote
    ? "能力与有趣可以各投一票，再次点击可撤回。"
    : "此账号目前不能投票。服务器会再次核对资格。";
}

function votesHTML(run: RunDetail): string {
  return `<h2>社区评价</h2><p class="help">${esc(voteReason(run))}</p>${!state.user ? '<button class="btn outline small" type="button" data-lab-action="login">登录参与</button>' : ""}<div class="stack">${voteKinds.map((kind) => `<button type="button" class="vote${run.my_votes?.includes(kind) ? " on" : ""}" data-lab-action="vote" data-kind="${kind}" aria-pressed="${run.my_votes?.includes(kind) ? "true" : "false"}"${run.can_vote ? "" : " disabled"}><span>${kind === "capability" ? "能力" : "有趣"}</span><strong class="vote-count" data-kind="${kind}" data-val="${run[kind] || 0}"><span class="vote-val">${esc(fmt(run[kind] || 0))}</span></strong></button>`).join("")}</div>`;
}

function ensureVoteMotionStyles(): void {
  // Styles bundled statically in theme.css to comply with CSP
}

function rollVoteCount(strongEl: HTMLElement, fromVal: number, toVal: number): void {
  if (fromVal === toVal) {
    strongEl.innerHTML = `<span class="vote-val">${esc(fmt(toVal))}</span>`;
    strongEl.dataset.val = String(toVal);
    return;
  }

  const isUp = toVal > fromVal;
  const fromStr = esc(fmt(fromVal));
  const toStr = esc(fmt(toVal));

  const startY = isUp ? "0%" : "-50%";
  const endY = isUp ? "-50%" : "0%";

  strongEl.innerHTML = `
    <span class="vote-rail" style="transform: translateY(${startY});">
      <span class="vote-val">${isUp ? fromStr : toStr}</span>
      <span class="vote-val">${isUp ? toStr : fromStr}</span>
    </span>
  `;
  strongEl.dataset.val = String(toVal);

  const rail = strongEl.querySelector<HTMLElement>(".vote-rail");
  if (!rail) return;

  void rail.offsetHeight;

  rail.style.transition = "transform 360ms cubic-bezier(0.2, 0.9, 0.3, 1)";
  rail.style.transform = `translateY(${endY})`;

  const cleanup = () => {
    strongEl.innerHTML = `<span class="vote-val">${toStr}</span>`;
  };

  rail.addEventListener("transitionend", cleanup, { once: true });
  setTimeout(cleanup, 420);
}

function syncVotesSection(container: HTMLElement, currentRun: RunDetail, animate = true): void {
  ensureVoteMotionStyles();
  const help = container.querySelector<HTMLParagraphElement>(".help");
  if (help) help.textContent = voteReason(currentRun);

  let fullRerender = false;
  for (const kind of voteKinds) {
    const btn = container.querySelector<HTMLButtonElement>(`button[data-kind="${kind}"]`);
    if (!btn) {
      fullRerender = true;
      break;
    }
    const isActive = Boolean(currentRun.my_votes?.includes(kind));
    btn.classList.toggle("on", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.disabled = !currentRun.can_vote;

    const strong = btn.querySelector<HTMLElement>(".vote-count");
    if (strong) {
      const currentVal = parseInt(strong.dataset.val || "0", 10);
      const targetVal = currentRun[kind] || 0;
      if (currentVal !== targetVal) {
        if (animate) {
          rollVoteCount(strong, currentVal, targetVal);
        } else {
          strong.innerHTML = `<span class="vote-val">${esc(fmt(targetVal))}</span>`;
          strong.dataset.val = String(targetVal);
        }
      }
    } else {
      fullRerender = true;
      break;
    }
  }

  if (fullRerender) {
    container.innerHTML = votesHTML(currentRun);
  }
}

function sourceHTML(): string {
  return `<section class="panel stack"><div class="section-head"><h2>生成的源码</h2><button type="button" class="btn outline small" data-lab-action="load-source">读取源码文件</button></div><p class="help">源码是模型生成的产物，不包含 API 密钥。请先检查内容，不要直接在本地执行未知脚本。</p><p class="form-error" data-source-error role="alert" hidden></p><div data-source-browser hidden><div class="source-layout">${field("source-file", "文件", '<select id="source-file" class="source-files"></select>')}<div class="source-content"><div class="actions"><button type="button" class="btn outline small" data-lab-action="copy-source">复制当前文件</button><button type="button" class="btn outline small" data-lab-action="download-source">下载当前文件</button><button type="button" class="btn outline small" data-lab-action="download-all">下载完整源码 JSON</button></div><pre class="code" tabindex="0"><code data-source-code></code></pre></div></div><p class="help mono break-word" data-source-meta></p></div></section>`;
}

function commentsHTML(run: RunDetail): string {
  const allowed = Boolean(state.user?.verified && run.published && !run.hidden);
  return `<div class="section-head"><h2>评论</h2><button type="button" class="btn outline small" data-lab-action="load-comments">刷新评论</button></div><p class="form-error" data-comments-error role="alert" hidden></p><div data-comments-list role="region" aria-label="评论列表"><p class="help">正在读取评论…</p></div>${allowed ? `<form id="comment-form" class="stack">${field("comment-body", "写下你的观察", '<textarea id="comment-body" name="body" required minlength="1" maxlength="2000" rows="3" placeholder="描述具体表现、问题或改进建议"></textarea>')}<button type="submit" class="btn primary">发表评论</button></form>` : `<p class="notice">${!run.published || run.hidden ? "作品未公开，不能添加新评论；已有评论仅向有权限的用户显示。" : !state.user ? "登录并验证邮箱后可以发表评论。" : "验证邮箱后可以发表评论。"}</p>${!state.user ? '<button class="btn outline" type="button" data-lab-action="login">登录参与</button>' : ""}`}`;
}

export async function runPage(id: string): Promise<Page> {
  let run = await api<RunDetail>(pathFor(id));
  const actionHTML = () =>
    `<a class="btn outline" href="#/challenge/${encodeURIComponent(run.challenge_id)}?version=${encodeURIComponent(run.version_id)}">查看任务来源</a>${active(run) && state.user?.id === run.owner_id ? '<button type="button" class="btn danger" data-lab-action="cancel">取消实验</button>' : ""}${run.status === "succeeded" && !run.hidden && state.user?.id === run.owner_id ? `<button type="button" class="btn ${run.published ? "outline" : "primary"}" data-lab-action="publish">${run.published ? "撤下公开" : "发布作品"}</button>` : ""}${run.status === "succeeded" && run.published && !run.hidden && state.user?.verified ? '<button type="button" class="btn ghost" data-lab-action="report">举报作品</button>' : ""}`;
  const statusHTML = () =>
    `<div class="status-line">${renderVendorBadge(run.model)} ${badge(run.status, statusLabels[run.status] || run.status)} ${badge(run.track, run.track === "standard" ? "标准赛道" : "开放赛道")} ${badge(run.hidden ? "hidden" : run.published ? "public" : "private", run.hidden ? "管理员已隐藏" : run.published ? "公开作品" : "私有实验")}</div>${active(run) ? `<p class="notice">${run.status === "queued" ? "等待隔离执行器。排队本身不会调用模型。" : "模型正在隔离环境中构建。"} 离开页面不会中断实验，也不会触发重试。</p>` : run.status !== "succeeded" ? runError(run.error) : '<p class="help">实验已完成。模型产物只在隔离来源中执行；社区操作不会重置预览。</p>'}`;
  return {
    html: `${head(run.model, `${run.title} · v${run.version} · @${run.username} · ${date(run.created)}`)}<div class="run-viewport-layout"><div class="run-viewport-main"><div id="run-artifact">${run.status === "succeeded" ? previewHTML(run, "run") + sourceHTML() : `<section class="panel stack" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:min(480px,calc(100vh - 200px));text-align:center;padding:48px 24px;background:var(--paper);border:1px dashed var(--line);border-radius:16px;"><img src="/art/empty/empty-experiments.svg" alt="沙箱准备就绪" width="200" height="150" style="margin-bottom:16px;"><h3 style="margin:0 0 8px 0;color:var(--ink);">${active(run) ? "模型正在 gVisor 独立沙箱中安全构建作品…" : "实验未生成作品预览"}</h3><p class="help" style="margin:0;max-width:440px;">${active(run) ? "隔离环境正在生成代码并部署沙箱，完成后将在此处呈现真实交互预览。" : "此实验没有生成有效的独立预览产物。请检查运行错误或配置。"}</p></section>`}</div></div><aside class="panel stack run-viewport-sidebar" aria-label="实验状态与操作"><section class="stack"><h2>实验状态</h2><div id="run-status">${statusHTML()}</div><div id="run-actions" class="actions">${actionHTML()}</div><p class="form-error" id="run-action-error" role="alert" hidden></p></section>${metricsHTML(run)}<section class="stack" id="run-votes">${votesHTML(run)}</section><section class="stack" id="run-comments">${commentsHTML(run)}</section></aside></div>${footer()}`,
    mount(root) {
      const abort = new AbortController();
      let disposed = false;
      ensureVoteMotionStyles();
      let eventSource: EventSource | null = null;
      let previewCleanup: (() => void) | undefined;
      let poll: number | undefined;
      let refreshPending = false;
      let refreshQueued = false;
      let voteRevision = 0;
      let source: SourceArtifact | null = null;
      let selectedSource: {
        name: string;
        bytes: Uint8Array<ArrayBuffer>;
        text: string | null;
      } | null = null;
      let sourcePending = false;
      let commentsPending = false;
      let commentsQueued = false;
      let commentsSerial = 0;
      let lastEventId = 0;
      let finalReceived = false;
      const busy = new Set<string>();
      const urls = new Set<string>();
      const downloads = new Set<number>();
      const actionError = root.querySelector<HTMLElement>("#run-action-error")!;
      const inlineError = (selector: string, error: unknown) => {
        const target = root.querySelector<HTMLElement>(selector);
        if (target) {
          target.textContent = errorText(error);
          target.hidden = false;
        }
      };
      const hideError = (selector: string) => {
        const target = root.querySelector<HTMLElement>(selector);
        if (target) target.hidden = true;
      };
      const mountArtifact = () => {
        const container = root.querySelector<HTMLElement>(
          '[data-preview="run"]',
        );
        if (container && !previewCleanup)
          previewCleanup = mountPreview(container, run);
      };
      const commentRows = (rows: RunComment[]) =>
        rows.length
          ? rows
              .map(
                (comment) =>
                  `<article class="comment"><div class="comment-head"><strong>@${esc(comment.username)}</strong><time datetime="${esc(new Date(comment.created * 1000).toISOString())}">${esc(date(comment.created))}</time><div class="actions">${comment.can_delete ? `<button type="button" class="btn danger small" data-lab-action="delete-comment" data-comment="${esc(comment.id)}">删除</button>` : ""}${state.user?.verified && run.published && !run.hidden ? `<button type="button" class="btn ghost small" data-lab-action="report-comment" data-comment="${esc(comment.id)}">举报</button>` : ""}</div></div><p class="comment-body">${esc(comment.body)}</p></article>`,
              )
              .join("")
          : '<p class="help">还没有评论。具体的观察比一句好坏更有帮助。</p>';
      const loadComments = async () => {
        if (disposed) return;
        if (commentsPending) {
          commentsQueued = true;
          return;
        }
        commentsPending = true;
        const serial = ++commentsSerial;
        const button = root.querySelector<HTMLButtonElement>(
          '[data-lab-action="load-comments"]',
        );
        if (button) button.disabled = true;
        hideError("[data-comments-error]");
        try {
          const rows = await api<RunComment[]>(pathFor(id) + "/comments", {
            signal: abort.signal,
          });
          if (!disposed && serial === commentsSerial)
            root.querySelector("[data-comments-list]")!.innerHTML =
              commentRows(rows);
        } catch (error) {
          if (!disposed && serial === commentsSerial) {
            inlineError("[data-comments-error]", error);
            if (!root.querySelector(".comment"))
              root.querySelector("[data-comments-list]")!.innerHTML =
                '<p class="help">评论未能读取。可使用“刷新评论”重试。</p>';
          }
        } finally {
          commentsPending = false;
          if (!disposed && button) button.disabled = false;
          if (commentsQueued) {
            commentsQueued = false;
            void loadComments();
          }
        }
      };
      const refresh = async () => {
        if (disposed) return;
        if (refreshPending) {
          refreshQueued = true;
          return;
        }
        refreshPending = true;
        const requestedVoteRevision = voteRevision;
        try {
          const next = await api<RunDetail>(pathFor(id), {
            signal: abort.signal,
          });
          if (disposed) return;
          const priorStatus = run.status;
          const priorPublished = run.published;
          const priorHidden = run.hidden;
          if (requestedVoteRevision !== voteRevision) {
            next.capability = run.capability;
            next.funny = run.funny;
            next.my_votes = run.my_votes;
          }
          run = next;
          root.querySelector("#run-status")!.innerHTML = statusHTML();
          root.querySelector("#run-actions")!.innerHTML = actionHTML();
          root.querySelector("#run-metrics")!.innerHTML = metricsHTML(run);
          const votesEl = root.querySelector("#run-votes");
          if (votesEl instanceof HTMLElement) {
            syncVotesSection(votesEl, run, true);
          } else if (votesEl) {
            votesEl.innerHTML = votesHTML(run);
          }
          if (run.status === "succeeded" && priorStatus !== "succeeded") {
            root.querySelector("#run-artifact")!.innerHTML =
              previewHTML(run, "run") + sourceHTML();
            mountArtifact();
          }
          if (run.published !== priorPublished || run.hidden !== priorHidden) {
            root.querySelector("#run-comments")!.innerHTML = commentsHTML(run);
            bindCommentForm();
            void loadComments();
          }
          if (!active(run) && poll) {
            clearInterval(poll);
            poll = undefined;
          }
          if (!run.can_view_events) {
            eventSource?.close();
            root.querySelector<HTMLElement>("#run-events")!.hidden = true;
          }
        } catch (error) {
          if (!disposed) inlineError("#run-action-error", error);
        } finally {
          refreshPending = false;
          if (refreshQueued) {
            refreshQueued = false;
            void refresh();
          }
        }
      };
      const bindCommentForm = () => {
        const form = root.querySelector<HTMLFormElement>("#comment-form");
        if (!form) return;
        form.addEventListener(
          "submit",
          async (ev) => {
            ev.preventDefault();
            if (busy.has("comment") || !form.reportValidity()) return;
            const textarea =
              form.querySelector<HTMLTextAreaElement>("textarea")!;
            const body = textarea.value.trim();
            if (!body) {
              formError(form, new Error("请输入评论内容。"));
              return;
            }
            const button = form.querySelector<HTMLButtonElement>(
              'button[type="submit"]',
            )!;
            busy.add("comment");
            button.disabled = true;
            button.textContent = "正在发表…";
            clearFormError(form);
            try {
              await mutate(pathFor(id) + "/comments", "POST", { body });
              if (!disposed) {
                textarea.value = "";
                toast("评论已发表");
                await loadComments();
              }
            } catch (error) {
              if (!disposed) formError(form, error);
            } finally {
              busy.delete("comment");
              if (!disposed) {
                button.disabled = false;
                button.textContent = "发表评论";
              }
            }
          },
          { signal: abort.signal },
        );
      };
      const selectSource = () => {
        if (!source) return;
        const name =
          root.querySelector<HTMLSelectElement>("#source-file")!.value;
        const bytes = Uint8Array.from(
          atob(source.files[name] ?? ""),
          (character) => character.charCodeAt(0),
        );
        let text: string | null = null;
        if (!/\.(png|jpe?g|webp)$/i.test(name)) {
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            /* Non-text artifacts remain downloadable byte-for-byte. */
          }
        }
        selectedSource = { name, bytes, text };
        root.querySelector("[data-source-code]")!.textContent =
          text ??
          `二进制文件 · ${fmt(bytes.length)} 字节。使用“下载当前文件”保存原始内容。`;
        root.querySelector<HTMLButtonElement>(
          '[data-lab-action="copy-source"]',
        )!.disabled = text === null;
      };
      const loadSource = async () => {
        if (sourcePending) return;
        sourcePending = true;
        const button = root.querySelector<HTMLButtonElement>(
          '[data-lab-action="load-source"]',
        )!;
        button.disabled = true;
        button.textContent = "正在读取…";
        hideError("[data-source-error]");
        try {
          source = await api<SourceArtifact>(pathFor(id) + "/source", {
            signal: abort.signal,
          });
          if (disposed) return;
          const names = Object.keys(source.files || {}).sort((a, b) =>
            a === "index.html"
              ? -1
              : b === "index.html"
                ? 1
                : a.localeCompare(b),
          );
          if (!names.length) throw new Error("产物没有可读取的源码文件。");
          const selector =
            root.querySelector<HTMLSelectElement>("#source-file")!;
          const chosen = names.includes(selector.value)
            ? selector.value
            : names[0];
          selector.innerHTML = names
            .map((name) => option(name, name, chosen))
            .join("");
          root.querySelector<HTMLElement>("[data-source-browser]")!.hidden =
            false;
          root.querySelector("[data-source-meta]")!.textContent =
            `${names.length} 个文件 · ${source.size ?? "未知"} 字节 · SHA-256 ${source.sha256 || "未提供"}`;
          selectSource();
        } catch (error) {
          if (!disposed) inlineError("[data-source-error]", error);
        } finally {
          if (!disposed) {
            sourcePending = false;
            button.disabled = false;
            button.textContent = "重新读取源码";
          }
        }
      };
      const download = (contents: BlobPart, filename: string, type: string) => {
        const url = URL.createObjectURL(new Blob([contents], { type }));
        urls.add(url);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename.replace(/[\\/\u0000-\u001f]/g, "_");
        document.body.append(link);
        link.click();
        link.remove();
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(url);
          urls.delete(url);
          downloads.delete(timer);
        }, 1000);
        downloads.add(timer);
      };
      const report = (commentId?: string) => {
        const prefix = commentId ? `评论 ${commentId}：` : "";
        const dialog = showDialog(
          commentId ? "举报评论" : "举报作品",
          `<p>说明具体问题，管理员会结合作品与评论上下文处理。对同一作品再次举报会更新已有举报。</p><form id="lab-report-form" class="stack">${field("report-reason", "举报原因", `<textarea id="report-reason" name="reason" rows="4" required minlength="5" maxlength="${500 - prefix.length}"></textarea>`)}<button class="btn danger" type="submit">提交举报</button></form>`,
          (modal) => {
            const form = modal.querySelector<HTMLFormElement>("form")!;
            let submitting = false;
            form.addEventListener(
              "submit",
              async (ev) => {
                ev.preventDefault();
                if (submitting || !form.reportValidity() || disposed) return;
                const reason = form
                  .querySelector<HTMLTextAreaElement>("textarea")!
                  .value.trim();
                if (reason.length < 5) {
                  formError(
                    form,
                    new Error("请至少输入 5 个字符，说明具体问题。"),
                  );
                  return;
                }
                const button = form.querySelector<HTMLButtonElement>("button")!;
                submitting = true;
                button.disabled = true;
                button.textContent = "正在提交…";
                clearFormError(form);
                try {
                  await mutate(pathFor(id) + "/report", "POST", {
                    reason: prefix + reason,
                  });
                  if (!disposed) {
                    closeDialog();
                    toast("举报已提交");
                  }
                } catch (error) {
                  if (!disposed) formError(form, error);
                } finally {
                  submitting = false;
                  button.disabled = false;
                  button.textContent = "提交举报";
                }
              },
              { signal: abort.signal },
            );
          },
        );
        abort.signal.addEventListener(
          "abort",
          () => {
            if (dialog.open) dialog.close();
          },
          { once: true },
        );
      };
      root.addEventListener(
        "change",
        (ev) => {
          if ((ev.target as HTMLElement).id === "source-file") selectSource();
        },
        { signal: abort.signal },
      );
      root.addEventListener(
        "click",
        async (ev) => {
          const button = (ev.target as Element).closest<HTMLButtonElement>(
            "[data-lab-action]",
          );
          if (!button || button.disabled) return;
          const action = button.dataset.labAction!;
          if (action === "login") {
            authenticate();
            return;
          }
          if (action === "load-comments") {
            void loadComments();
            return;
          }
          if (action === "load-source") {
            void loadSource();
            return;
          }
          if (action === "report" || action === "report-comment") {
            report(button.dataset.comment);
            return;
          }
          const key =
            action === "vote"
              ? "votes"
              : action + (button.dataset.comment || "");
          if (busy.has(key)) return;
          busy.add(key);
          button.disabled = true;
          actionError.hidden = true;
          try {
            if (action === "cancel") {
              if (
                await confirmDialog({
                  title: "取消这次实验？",
                  body: "<p>执行器会尽快停止隔离容器。已经被服务商接受的请求仍可能计费，取消不会退款，也不会自动重试。</p>",
                  confirm: "确认取消实验",
                  danger: true,
                })
              ) {
                if (disposed) return;
                await mutate(pathFor(id) + "/cancel", "POST");
                if (!disposed) {
                  toast("已请求取消实验");
                  await refresh();
                }
              }
            } else if (action === "publish") {
              const publishing = !run.published;
              const confirmed = await confirmDialog({
                title: publishing ? "确认公开这些内容？" : "撤下公开作品？",
                body: publishing
                  ? "<p>发布后，任何人都可以查看以下内容：</p><ul><li>作品预览、真实缩略图与完整生成源码</li><li>你的用户名、任务及版本、模型与服务商地址</li><li>原始任务、附加提示词、评审标准、思考设置和执行环境</li><li>Skill 名称与内容摘要、运行用量、投票与评论</li></ul><p>不会公开 API 密钥、Skill 文件正文或私有执行日志。请检查提示词和产物中是否包含个人信息或秘密。公开内容可能被他人复制，撤下无法收回已保存副本。</p>"
                  : "<p>作品将从公开展示和投票中移除，公开预览链接也会失效。已有评论保留给有权限的用户；他人已经复制的内容无法撤回。</p>",
                confirm: publishing ? "确认发布作品" : "撤下公开",
                danger: !publishing,
              });
              if (confirmed && !disposed) {
                await mutate(pathFor(id) + "/publish", "PUT", {
                  published: publishing,
                });
                if (!disposed) {
                  toast(publishing ? "作品已公开" : "作品已撤下");
                  await refresh();
                }
              }
            } else if (action === "vote") {
              const kind = button.dataset.kind;
              if (kind !== "capability" && kind !== "funny")
                throw new Error("未知的投票类型。");
              const result = await mutate<VoteResult>(
                pathFor(id) + "/vote",
                "PUT",
                { kind, active: !run.my_votes?.includes(kind) },
              );
              if (!disposed) {
                run[kind] = result.count;
                ++voteRevision;
                run.my_votes = (run.my_votes || []).filter(
                  (value: string) => value !== kind,
                );
                if (result.active) {
                  run.my_votes.push(kind);
                  burstParticles(button, { count: 20 });
                }
                const votesEl = root.querySelector("#run-votes");
                if (votesEl instanceof HTMLElement) {
                  syncVotesSection(votesEl, run, true);
                } else if (votesEl) {
                  votesEl.innerHTML = votesHTML(run);
                }
              }
            } else if (action === "delete-comment") {
              if (
                await confirmDialog({
                  title: "删除这条评论？",
                  body: "<p>评论删除后无法恢复。</p>",
                  confirm: "删除评论",
                  danger: true,
                })
              ) {
                if (disposed) return;
                await mutate(
                  "/comments/" + encodeURIComponent(button.dataset.comment!),
                  "DELETE",
                );
                if (!disposed) {
                  toast("评论已删除");
                  await loadComments();
                }
              }
            } else if (
              action === "copy-source" ||
              action === "download-source" ||
              action === "download-all"
            ) {
              if (!source) throw new Error("请先读取源码文件。");
              if (!selectedSource)
                throw new Error("当前文件不可读取，请重新加载源码。");
              const { name, bytes, text } = selectedSource;
              if (action === "copy-source") {
                if (text === null)
                  throw new Error(
                    "二进制文件不能作为文本复制，请下载原始文件。",
                  );
                if (!navigator.clipboard?.writeText)
                  throw new Error(
                    "当前浏览器不能直接复制。请选中源码后复制，或下载当前文件。",
                  );
                await navigator.clipboard.writeText(text);
                if (!disposed) toast("当前文件已复制");
              } else if (action === "download-source")
                download(bytes, name, "application/octet-stream");
              else
                download(
                  JSON.stringify(source, null, 2),
                  `tihu-${id}-source.json`,
                  "application/json",
                );
            }
          } catch (error) {
            if (!disposed)
              inlineError(
                action.includes("source") || action === "download-all"
                  ? "[data-source-error]"
                  : "#run-action-error",
                error,
              );
          } finally {
            busy.delete(key);
            if (!disposed && button.isConnected) button.disabled = false;
          }
        },
        { signal: abort.signal },
      );
      if (run.can_view_events) {
        const status = root.querySelector<HTMLElement>("#event-state")!;
        const list = root.querySelector<HTMLOListElement>("#event-list")!;
        eventSource = new EventSource("/api" + pathFor(id) + "/events");
        eventSource.addEventListener("open", () => {
          if (!disposed)
            status.textContent =
              "日志已连接。仅展示阶段、请求状态与脱敏错误，不展示模型正文或密钥。";
        });
        eventSource.addEventListener("progress", (event) => {
          if (disposed) return;
          try {
            if (
              !(event instanceof MessageEvent) ||
              typeof event.data !== "string"
            )
              return;
            const row: unknown = JSON.parse(event.data);
            if (
              !record(row) ||
              typeof row.id !== "number" ||
              typeof row.created !== "number" ||
              typeof row.kind !== "string" ||
              typeof row.message !== "string"
            )
              throw new Error("invalid_event");
            const serial = row.id;
            if (!Number.isFinite(serial) || serial <= lastEventId) return;
            lastEventId = serial;
            const item = document.createElement("li");
            const stamp = document.createElement("span");
            stamp.className = "muted";
            stamp.textContent = date(row.created);
            const kind = document.createElement("strong");
            kind.textContent = String(row.kind || "progress");
            const message = document.createElement("p");
            message.className = "break-word";
            message.textContent = String(row.message || "");
            item.append(stamp, document.createTextNode(" · "), kind, message);
            list.append(item);
          } catch {
            status.textContent =
              "一条日志格式异常，已跳过；实验仍由服务器继续执行。";
          }
        });
        eventSource.addEventListener("state", () => {
          if (disposed || finalReceived) return;
          finalReceived = true;
          eventSource?.close();
          status.textContent = "实验已结束，所有已记录的进度日志已接收。";
          void refresh();
        });
        eventSource.addEventListener("error", () => {
          if (disposed || finalReceived) return;
          status.textContent =
            "日志连接中断，正在自动重连；已显示的日志不会重复。运行状态会定期刷新，不会重新调用模型。";
        });
      }
      if (active(run))
        poll = window.setInterval(() => {
          void refresh();
        }, 8000);
      mountArtifact();
      bindCommentForm();
      void loadComments();
      return () => {
        disposed = true;
        abort.abort();
        eventSource?.close();
        previewCleanup?.();
        clearInterval(poll);
        for (const timer of downloads) clearTimeout(timer);
        for (const url of urls) URL.revokeObjectURL(url);
      };
    },
  };
}

export async function comparePage(): Promise<Page> {
  const ids = (query().get("runs") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const form = `<form id="compare-form" class="panel stack"><h2>选择两个实验</h2><div class="form-grid">${field("compare-left", "实验 A 的 ID", `<input id="compare-left" name="left" required pattern="[a-f0-9]{32}" value="${esc(ids[0] || "")}" placeholder="32 位实验 ID">`)}${field("compare-right", "实验 B 的 ID", `<input id="compare-right" name="right" required pattern="[a-f0-9]{32}" value="${esc(ids[1] || "")}" placeholder="32 位实验 ID">`)}</div><button class="btn primary" type="submit">比较这两个实验</button><p class="help">从作品详情复制实验 ID，或在作品库选择两个作品。只能读取公开作品或你有权限的私有实验。</p></form>`;
  let content = "";
  let runs: RunDetail[] = [];
  if (ids.length) {
    if (
      ids.length !== 2 ||
      ids[0] === ids[1] ||
      ids.some((id) => !/^[a-f0-9]{32}$/.test(id))
    )
      content =
        '<div class="notice error">需要两个不同且有效的实验 ID。请在下方重新选择。</div>';
    else {
      const results = await Promise.allSettled(
        ids.map((id) => api<RunDetail>(pathFor(id))),
      );
      const failed = results
        .map((result, index) =>
          result.status === "rejected"
            ? `<p>实验 ${index === 0 ? "A" : "B"}：${esc(errorText(result.reason))}</p>`
            : "",
        )
        .join("");
      if (failed)
        content = `<div class="notice error"><strong>无法读取两个实验，不能进行比较。</strong>${failed}<p>确认作品已公开，或登录有访问权限的账号。</p></div>`;
      else {
        runs = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        const fields: [
          "challenge_id" | "version_id" | "track" | "environment",
          string,
        ][] = [
          ["challenge_id", "任务"],
          ["version_id", "任务版本"],
          ["track", "赛道"],
          ["environment", "环境指纹"],
        ];
        const matches = fields.every(
          ([key]) =>
            typeof runs[0][key] === "string" &&
            runs[0][key].length > 0 &&
            runs[0][key] === runs[1][key],
        );
        const conditions = `<details class="panel details"${matches ? "" : " open"}><summary><strong>${matches ? "✓ 四项条件完全一致" : "⚠ 不能标记为同条件比较"}</strong> <span class="muted">${matches ? "（任务、版本、赛道与环境指纹相同，点击展开核对）" : "（至少一项条件不同或缺失，点击查看核对详情）"}</span></summary><div class="stack" style="margin-top: 12px;"><p class="notice ${matches ? "success" : "warn"}">${matches ? "两个实验的任务、版本、赛道和环境指纹完全一致。模型与服务商仍单独显示；开放赛道中的附加提示词、思考设置和 Skills 也可能不同。" : "至少一项条件不同或缺失。下方仅作并排查看，不给出公平排名或胜负结论。"}</p><div class="table"><table><thead><tr><th scope="col">条件</th><th scope="col">实验 A</th><th scope="col">实验 B</th><th scope="col">核对</th></tr></thead><tbody>${fields
          .map(([key, label]) => {
            const same =
              typeof runs[0][key] === "string" &&
              runs[0][key].length > 0 &&
              runs[0][key] === runs[1][key];
            return `<tr><th scope="row">${label}</th><td class="mono break-word compare-condition">${esc(runs[0][key] || "缺失")}</td><td class="mono break-word compare-condition">${esc(runs[1][key] || "缺失")}</td><td>${same ? "相同" : "不同或缺失"}</td></tr>`;
          })
          .join("")}</tbody></table></div></div></details>`;
        content =
          conditions +
          `<div class="compare-grid">${runs.map((run, index) => `<article class="stack"><section class="panel compact" style="padding:12px 16px;"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><div><span class="eyebrow" style="margin-right:8px;">实验 ${index === 0 ? "A" : "B"}</span>${renderVendorBadge(run.model)} <strong style="font-size:16px;margin-left:6px;">${esc(run.model)}</strong></div><div class="actions">${badge(run.status, statusLabels[run.status] || run.status)} <a class="btn outline small" href="#/run/${encodeURIComponent(run.id)}">完整实验与源码</a></div></div><p class="muted mono break-word" style="margin:4px 0 0 0;font-size:12px;">${esc(run.provider)} · ${esc(run.title)} · v${esc(run.version)} · @${esc(run.username)}</p></section>${run.status === "succeeded" ? previewHTML(run, "compare-" + index) + sourceHTML() : `<div class="panel empty" style="min-height:380px;">${runError(run.error)}</div>`}</article>`).join("")}</div>`;
      }
    }
  } else
    content =
      '<p class="notice">同条件比较严格核对任务、版本、赛道和环境指纹，不把不同实验条件混成一个排名。</p>';
  return {
    html:
      head(
        "并排比较",
        "先核对条件，再观察模型的实际产物。",
        '<a class="btn outline" href="#/gallery">从作品库选择</a>',
      ) +
      (runs.length === 2
        ? `<details class="panel details" style="margin-bottom:16px;"><summary>更换对比实验</summary>${form}</details>`
        : form) +
      content +
      footer(),
    mount(root) {
      const abort = new AbortController();
      const cleanups: (() => void)[] = [];
      const compareForm = root.querySelector<HTMLFormElement>("#compare-form")!;
      compareForm.addEventListener(
        "submit",
        (ev) => {
          ev.preventDefault();
          clearFormError(compareForm);
          if (!compareForm.reportValidity()) return;
          const a = root
            .querySelector<HTMLInputElement>("#compare-left")!
            .value.trim();
          const b = root
            .querySelector<HTMLInputElement>("#compare-right")!
            .value.trim();
          if (a === b) {
            formError(compareForm, new Error("请选择两个不同的实验。"));
            return;
          }
          go("/compare?runs=" + encodeURIComponent(a + "," + b));
        },
        { signal: abort.signal },
      );
      runs.forEach((run, index) => {
        const container = root.querySelector<HTMLElement>(
          `[data-preview="compare-${index}"]`,
        );
        if (container) cleanups.push(mountPreview(container, run));
      });
      return () => {
        abort.abort();
        cleanups.forEach((cleanup) => cleanup());
      };
    },
  };
}
