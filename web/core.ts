import {
  validResponse,
  record,
  type User,
  type Quota,
  type AppConfig,
  type Session,
} from "./types.js";
import {
  burstParticles,
  celebrate,
  type ParticleOptions,
} from "./particles.js";
export { burstParticles, celebrate, type ParticleOptions };
export type Obj = Record<string, unknown>;
export interface Page {
  html: string;
  mount?: (root: HTMLElement) => void | (() => void);
}
export interface PageResult<T> {
  items: T[];
  next_cursor: string | null;
  total: number;
}
export const state: {
  user: User | null;
  csrf: string | null;
  config: AppConfig;
  quota: Quota | null;
  voteEligibleAt: number | null;
} = {
  user: null,
  csrf: null,
  quota: null,
  voteEligibleAt: null,
  config: {
    app_origin: "",
    preview_origin: "",
    registration: false,
    providers: [],
    categories: [],
    vote_min_age_seconds: 0,
    limits: {
      skill_bytes: 0,
      skill_files: 0,
      skills_per_run: 0,
      prompts: 0,
      skills: 0,
    },
    harness: {
      agent: "",
      version: "",
      image: "",
      runtime: "",
      seconds: 0,
      calls: 0,
      output_tokens_per_call: 0,
      cpu: 0,
      memory_mb: 0,
      pids: 0,
      network: "",
      tools: [],
      system_prompt_version: "",
    },
  },
};

const errors: Record<string, string> = {
  authentication_required: "请先登录，再继续此操作。",
  verification_required: "请先验证邮箱。你可以在页面顶部重新发送验证邮件。",
  account_not_eligible: "此账号尚未完成邮箱验证，或已被暂停使用。",
  account_exists: "邮箱或用户名已被使用，请登录或换一个用户名。",
  invalid_credentials: "邮箱或密码不正确，请检查后重试。",
  registration_closed: "当前暂未开放注册，已有账号仍可登录。",
  invalid_or_expired_token: "链接已失效或已使用，请重新申请邮件。",
  mail_unavailable: "邮件服务暂不可用，请稍后重新发送。",
  mail_delivery_failed: "邮件暂未发送成功，请稍后重试。",
  smtp_unavailable: "邮件服务暂不可用，请稍后重试。",
  verification_delivery_failed: "验证邮件发送失败，请稍后重新发送。",
  verification_delivery_unavailable:
    "尚未配置可用的验证邮件服务，请联系管理员。",
  invalid_response: "服务器返回的数据格式不完整，请刷新页面或联系管理员。",
  csrf_denied: "登录状态已变化，请刷新页面后重试。",
  origin_denied: "请通过配置的主站地址访问，当前地址不能提交操作。",
  owner_required: "只有内容作者可以执行此操作。",
  admin_required: "此页面仅对管理员开放。",
  not_found: "内容不存在、已撤下，或你没有访问权限。",
  invalid_request: "请检查表单中的内容和长度限制。",
  invalid_cursor: "分页链接已无效，请回到第一页重新加载。",
  invalid_time_window: "请选择全部、近 7 天或近 30 天的新作。",
  body_too_large: "上传内容过大，请缩小文件后重试。",
  active_run_limit: "同时运行的实验已达上限，请等待完成或取消一个实验。",
  daily_run_limit: "最近 24 小时的实验额度已用完，请等待额度恢复。",
  run_quota_exceeded: "实验额度已达到上限，请查看当前运行数和剩余额度。",
  queue_full: "运行队列暂时已满，请稍后再提交。",
  rate_limit: "操作过于频繁，请稍后重试。",
  refresh_and_select_model: "请刷新此连接的模型列表，并选择一个可用模型。",
  billing_consent_required: "开始前请确认服务商可能产生费用。",
  idempotency_conflict: "此次提交的配置已改变，请重新发起一次明确的新实验。",
  idempotency_key_required: "提交标识缺失，请刷新页面后重试。",
  challenge_archived: "这道题已归档，请选择其他题目。",
  not_publishable: "只有成功且未被隐藏的作品可以公开。",
  account_too_new: "新账号需要等待一段时间后才能投票，页面会显示可投票时间。",
  cannot_vote_own_work: "不能给自己的作品投票。",
  work_not_public: "只有已公开的作品可以接受投票。",
  vote_not_allowed: "当前不能投票，请检查账号资格或作品公开状态。",
  prompt_limit: "提示词模板数量已达上限，请先整理不再使用的模板。",
  skill_limit: "Skill 数量已达上限，请先整理不再使用的内容。",
  too_many_skills: "每次最多选择 4 个 Skill，且总内容必须在限制内。",
  skill_too_large: "Skill 文件过大，最多支持 256 KB。",
  skill_invalid: "请上传包含根目录 SKILL.md 的有效文本文件或 ZIP。",
  provider_denied: "此服务商地址不在允许列表中，请选择已支持的连接。",
  provider_not_allowed: "此服务商地址不在允许列表中。",
  provider_auth_failed: "服务商拒绝了 API Key，请检查 Key 是否有效。",
  provider_authentication_failed: "服务商拒绝了 API Key，请检查连接权限。",
  provider_quota_exceeded: "服务商余额或额度不足，请到服务商控制台检查。",
  provider_rate_limited: "服务商触发限流，请稍后手动重试，不会自动产生新请求。",
  provider_model_not_found: "服务商无法找到所选模型，请刷新模型列表。",
  provider_request_rejected: "服务商拒绝了请求，请检查模型与协议是否匹配。",
  provider_unavailable: "服务商暂时不可用，已接受的请求仍可能计费。",
  provider_request_failed: "未能完成服务商请求，请检查连接后再手动尝试。",
  model_call_limit: "已达到本次模型请求次数上限。可以调整任务后新建实验。",
  sandbox_timeout:
    "实验达到运行时间上限。已发生的服务商请求不会退款或自动重试。",
  sandbox_failed: "模型执行未完成，请查看运行记录后调整任务或连接。",
  pi_failed: "Agent 未能完成构建，请查看运行记录。",
  index_html_required: "模型没有生成入口 index.html，请调整提示词后新建实验。",
  artifact_file_too_large: "生成的单个文件超过 512 KB，请减少产物体积。",
  artifact_bundle_too_large: "生成产物超过 2 MB，请简化内容后新建实验。",
  artifact_limit_exceeded: "生成产物超过文件数量或大小限制。",
  artifact_type_denied: "生成内容包含不支持的文件格式。",
  unsafe_artifact: "生成内容没有通过产物安全检查。",
  unsafe_artifact_path: "生成内容包含不安全的文件路径。",
  invalid_sandbox_result: "Agent 返回的产物不完整，请查看记录。",
  sandbox_output_too_large: "Agent 输出过大，实验已停止。",
  worker_lease_expired_no_automatic_retry:
    "运行服务中断。为避免重复计费，本次实验不会自动重试。",
  execution_environment_changed: "运行条件已更新，请确认新条件后重新创建实验。",
  container_command_failed: "运行环境未能启动，请联系管理员检查 Worker。",
  container_command_timeout: "运行环境响应超时，请联系管理员。",
  credential_revoked: "API 连接已撤销，相关实验已停止。",
  user_canceled: "你已取消此次实验。已经被服务商接受的请求仍可能计费。",
  account_suspended: "账号已被暂停，实验已停止。",
  runner_failure: "运行服务发生错误，请查看记录或联系管理员。",
  untrusted_sandbox_image: "执行镜像未通过校验，请联系管理员。",
  invalid_artifact_encoding: "产物文件编码无效，无法安全读取。",
  artifact_file_limit: "生成文件数量超过限制，请简化任务后新建实验。",
  artifact_read_failed: "运行环境未能读取生成文件，请查看执行记录。",
  sandbox_setup_failed: "隔离环境准备失败，请联系管理员。",
  pi_start_failed: "Agent 未能启动，请联系管理员检查执行镜像。",
  agent_output_too_large: "Agent 输出超过限制，本次实验已停止。",
  run_inactive: "实验已结束或取消，不再接受模型请求。",
  provider_response_too_large: "服务商响应超过安全上限，已停止接收。",
  provider_stream_failed: "服务商响应流中断，已记录的用量仍可能计费。",
  invalid_output_token_limit: "模型请求的输出 Token 上限无效。",
  invalid_thinking_budget: "模型请求的思考预算无效。",
  broker_unavailable: "受信模型代理暂不可用，请联系管理员。",
  tool_denied: "模型请求了不允许的工具。",
  hosted_tool_denied: "实验不允许使用服务商托管工具。",
  remote_tool_denied: "实验不允许使用远程工具。",
  remote_input_denied: "实验不允许读取外部资源。",
  only_text_inputs_allowed: "实验仅接受文本模型输入。",
  model_switch_denied: "实验期间不能切换已冻结的模型。",
  input_too_deep: "模型输入嵌套层级超过安全限制。",
  json_object_required: "模型请求必须是有效的 JSON 对象。",
  skill_name_required: "请填写 Skill 名称。",
};

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields: string[] = [],
    public retryAfter: number | null = null,
  ) {
    super(code);
    this.name = "ApiError";
  }
}
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const message =
      errors[error.code] ??
      (error.status === 401
        ? errors.authentication_required
        : error.status === 404
          ? errors.not_found
          : error.status === 429
            ? errors.rate_limit
            : "请求未完成，请稍后重试。");
    const labels: Record<string, string> = {
      username: "用户名",
      email: "邮箱",
      password: "密码",
      name: "名称",
      title: "题目名称",
      description: "简介",
      prompt: "提示词",
      rubric: "评价参考",
      api_key: "API Key",
      model: "模型",
      version_id: "题目版本",
      body: "正文",
    };
    const fields = [
      ...new Set(
        error.fields
          .map((x) => labels[x.split(".").at(-1) ?? ""])
          .filter(Boolean),
      ),
    ];
    return (
      message +
      (fields.length ? ` 请检查：${fields.join("、")}。` : "") +
      (error.retryAfter ? ` 建议 ${error.retryAfter} 秒后重试。` : "")
    );
  }
  if (typeof error === "string")
    return (
      errors[error] ??
      (error.match(/[\u3400-\u9fff]/) ? error : errors.runner_failure)
    );
  if (error instanceof Error)
    return (
      errors[error.message] ??
      (error.message.match(/[\u3400-\u9fff]/)
        ? error.message
        : "连接暂时中断，请检查网络后重试。")
    );
  return "操作未完成，请稍后重试。";
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (
    state.csrf &&
    init.method &&
    !["GET", "HEAD"].includes(init.method.toUpperCase())
  )
    headers.set("x-csrf-token", state.csrf);
  const response = await fetch("/api" + path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (record(parsed)) body = parsed;
    } catch {
      /* Gateway failures have no structured response. */
    }
    const retry = Number(response.headers.get("retry-after"));
    throw new ApiError(
      typeof body.detail === "string" ? body.detail : "request_failed",
      response.status,
      Array.isArray(body.errors)
        ? body.errors.filter(record).map((x) => String(x.field))
        : [],
      retry > 0 ? retry : null,
    );
  }
  const data: unknown = response.status === 204 ? null : await response.json();
  if (
    response.status !== 204 &&
    !validResponse(path, init.method?.toUpperCase() ?? "GET", data)
  )
    throw new ApiError("invalid_response", 502);
  // validResponse checks the route's wire shape before its page-specific type is consumed.
  const typed = data as T;
  return typed;
}
export async function mutate<T = unknown>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const result = await api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (
    method === "POST" &&
    (path === "/challenges" ||
      path.startsWith("/challenges/") ||
      path === "/runs")
  ) {
    celebrate();
  }
  return result;
}
export async function refreshSession(): Promise<void> {
  const previous = state.user?.id;
  const session = await api<Session>("/me");
  state.user = session.user;
  state.csrf = session.csrf ?? null;
  state.quota = session.quota ?? null;
  state.voteEligibleAt = session.vote_eligible_at ?? null;
  if (previous !== state.user?.id)
    window.dispatchEvent(new Event("tihu-session-change"));
}
export function query(): URLSearchParams {
  return new URLSearchParams(location.hash.split("?")[1] ?? "");
}
export function go(path: string): void {
  if (location.hash === "#" + path) refreshPage();
  else location.hash = "#" + path;
}
export function refreshPage(): void {
  window.dispatchEvent(new Event("tihu-refresh"));
}
export const esc = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const numberFormat = new Intl.NumberFormat("zh-CN");
export const fmt = (value: number): string =>
  numberFormat.format(Number.isFinite(value) ? value : 0);
export const date = (value: number): string =>
  Number.isFinite(value)
    ? new Date(value * 1000).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export function duration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "未记录";
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
const labels: Record<string, string> = {
  standard: "标准赛道",
  open: "开放赛道",
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  failed: "未完成",
  canceled: "已取消",
  public: "已公开",
  private: "仅自己可见",
  SVG: "SVG 绘图",
  Interactive: "交互体验",
  Creative: "创意表达",
  UI: "界面设计",
};
export function badge(value: string, label?: string): string {
  return `<span class="badge ${esc(value)}">${esc(label ?? labels[value] ?? value)}</span>`;
}
export function head(title: string, description: string, actions = ""): string {
  return `<div class="page-head"><div><h1 tabindex="-1">${esc(title)}</h1><p>${esc(description)}</p></div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
}
export function empty(title: string, description: string, action = ""): string {
  return `<div class="empty"><h3>${esc(title)}</h3><p>${esc(description)}</p>${action}</div>`;
}
export const icons = {
  close: `<svg class="icon icon-close" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  check: `<svg class="icon icon-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg class="icon icon-alert" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`,
  info: `<svg class="icon icon-info" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>`,
  search: `<svg class="icon icon-search" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/></svg>`,
  key: `<svg class="icon icon-key" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-2.5-2.5"/></svg>`,
  code: `<svg class="icon icon-code" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  sparkles: `<svg class="icon icon-sparkles" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>`,
  fileText: `<svg class="icon icon-file" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
  layers: `<svg class="icon icon-layers" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5"/><path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5"/></svg>`,
  cpu: `<svg class="icon icon-cpu" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>`,
  copy: `<svg class="icon icon-copy" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  trash: `<svg class="icon icon-trash" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  edit: `<svg class="icon icon-edit" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
  link: `<svg class="icon icon-link" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
  shield: `<svg class="icon icon-shield" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  user: `<svg class="icon icon-user" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  mail: `<svg class="icon icon-mail" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
  lock: `<svg class="icon icon-lock" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  upload: `<svg class="icon icon-upload" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
  refresh: `<svg class="icon icon-refresh" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>`,
  eye: `<svg class="icon icon-eye" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  plus: `<svg class="icon icon-plus" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>`,
  terminal: `<svg class="icon icon-terminal" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>`,
};

export function inferFieldIcon(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("search") || lower === "q") return icons.search;
  if (lower.includes("email") || lower.includes("mail")) return icons.mail;
  if (lower.includes("password")) return icons.lock;
  if (lower.includes("username") || lower.includes("author")) return icons.user;
  if (lower.includes("key") || lower.includes("secret") || lower.includes("token")) return icons.key;
  if (lower.includes("url") || lower.includes("base") || lower.includes("link")) return icons.link;
  if (lower.includes("prompt")) return icons.sparkles;
  if (lower.includes("rubric") || lower.includes("file")) return icons.fileText;
  if (lower.includes("model")) return icons.cpu;
  if (lower.includes("version")) return icons.layers;
  return "";
}

export function field(
  id: string,
  label: string,
  control: string,
  help = "",
  icon = "",
): string {
  const chosenIcon = icon || inferFieldIcon(id);
  const isTextarea = control.includes("<textarea");
  const isSelect = control.includes("<select");
  const hasIcon = Boolean(chosenIcon && !isTextarea && !isSelect);
  const controlWrap = hasIcon
    ? `<div class="field-control-wrap with-icon"><span class="field-icon" aria-hidden="true">${chosenIcon}</span>${control}</div>`
    : `<div class="field-control-wrap">${control}</div>`;
  return `<div class="field"><label for="${esc(id)}" class="field-label">${esc(label)}</label>${controlWrap}${help ? `<p class="help field-help" id="${esc(id)}-help">${esc(help)}</p>` : ""}</div>`;
}
export function footer(): string {
  return '<footer class="footer"><span>TiHu · 一个共同的模型实验场</span><span>社区投票表达偏好，不是客观智力分数。</span></footer>';
}
export function verificationNotice(): string {
  return state.user && !state.user.verified
    ? '<section class="notice warn row between" aria-label="邮箱验证提醒"><div><strong>还差一步：验证邮箱</strong><p>验证后即可保存连接、创建实验和参与社区。</p></div><button class="btn outline" data-global="resend-verification">重新发送验证邮件</button></section>'
    : "";
}
export function authGate(): Page {
  return {
    html:
      head("先登录，开始你的实验", "连接、提示词和未公开的作品仅对你可见。") +
      empty(
        "选好题目，再接上自己的模型。",
        "注册后可以保存 API 连接；真实 Key 不进入模型沙箱。",
        `${state.config.registration ? '<button class="btn primary" data-global="register">创建账号</button>' : ""} <button class="btn outline" data-global="login">登录</button>`,
      ),
  };
}
export function toast(message: string, error = false): void {
  const region = document.querySelector("#toast");
  if (!region) return;
  if (!error && /发布|创建|提交成功|已公开/.test(message)) {
    celebrate();
  }
  const item = document.createElement("div");
  item.className = "toast" + (error ? " err toast-error" : " toast-success");
  item.setAttribute("role", error ? "alert" : "status");
  const iconSvg = error ? icons.alert : icons.check;
  item.innerHTML = `<span class="toast-icon-wrap" aria-hidden="true">${iconSvg}</span><span class="toast-message">${esc(message)}</span><button class="toast-close" type="button" aria-label="关闭通知" tabindex="-1">${icons.close}</button>`;
  let dismissed = false;
  let timer: number | undefined;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(timer);
    item.classList.add("toast-leaving");
    setTimeout(() => item.remove(), 280);
  };
  item.addEventListener("click", dismiss);
  item.querySelector(".toast-close")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss();
  });
  region.append(item);
  timer = window.setTimeout(dismiss, error ? 8000 : 4500);
}
export function clearFormError(form: HTMLFormElement): void {
  form.querySelector(".form-error")?.remove();
  form
    .querySelectorAll("[aria-invalid]")
    .forEach((x) => x.removeAttribute("aria-invalid"));
}
export function formError(form: HTMLFormElement, error: unknown): void {
  clearFormError(form);
  const message = document.createElement("p");
  message.className = "form-error";
  message.setAttribute("role", "alert");
  message.tabIndex = -1;
  message.textContent = errorText(error);
  form.prepend(message);
  if (error instanceof ApiError)
    for (const field of error.fields) {
      const name = field.split(".").at(-1)!;
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLElement)
        input.setAttribute("aria-invalid", "true");
    }
  message.focus();
}
let dialogClose: (() => void) | null = null;
let closeTimer: number | undefined;
export function closeDialog(immediate = false): void {
  const dialog = document.querySelector<HTMLDialogElement>("#modal");
  if (!dialog) return;
  if (closeTimer) {
    window.clearTimeout(closeTimer);
    closeTimer = undefined;
  }
  if (dialog.open) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && dialog.contains(activeEl)) {
      activeEl.blur();
    }
    const doClose = () => {
      dialog.close();
      dialog.classList.remove("modal-closing");
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      closeTimer = undefined;
    };
    if (immediate) {
      doClose();
    } else {
      dialog.classList.add("modal-closing");
      closeTimer = window.setTimeout(doClose, 150);
    }
  }
  const finish = dialogClose;
  dialogClose = null;
  finish?.();
}
export function showDialog(
  title: string,
  content: string,
  mount?: (dialog: HTMLDialogElement) => void,
): HTMLDialogElement {
  closeDialog(true);
  const dialog = document.querySelector<HTMLDialogElement>("#modal")!;
  dialog.className = "modern-dialog";
  dialog.innerHTML = `<div class="modal modal-card"><div class="modal-header"><h2 id="dialog-title" class="modal-title">${esc(title)}</h2><button class="btn ghost modal-close-btn" type="button" aria-label="关闭对话框" data-dialog-close title="关闭">${icons.close}</button></div><div class="modal-body">${content}</div></div>`;
  dialog.setAttribute("aria-labelledby", "dialog-title");
  dialog
    .querySelector("[data-dialog-close]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    });
  dialog.oncancel = (event) => {
    event.preventDefault();
    closeDialog();
  };
  dialog.onclick = (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  };
  dialog.showModal();
  mount?.(dialog);
  const firstInput = dialog.querySelector<HTMLInputElement>("input:not([type=hidden]), textarea, select");
  if (firstInput) {
    firstInput.focus({ preventScroll: true });
  }
  return dialog;
}
export function confirmDialog(options: {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
}): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const iconSvg = options.danger ? icons.alert : icons.info;
  const dialog = showDialog(
    options.title,
    `<div class="confirm-dialog-content"><div class="confirm-body-row"><span class="confirm-icon ${options.danger ? "danger" : "info"}" aria-hidden="true">${iconSvg}</span><div class="dialog-body confirm-message">${options.body}</div></div><div class="actions modal-actions confirm-actions"><button class="btn outline" type="button" data-cancel>暂不操作</button><button class="btn ${options.danger ? "danger" : "primary"}" type="button" data-confirm>${esc(options.confirm)}</button></div></div>`,
  );
  dialog.classList.add("confirm-modal");
  dialogClose = () => resolve(false);
  dialog.querySelector("[data-cancel]")?.addEventListener("click", () => closeDialog());
  dialog.querySelector("[data-confirm]")?.addEventListener("click", () => {
    dialogClose = null;
    closeDialog();
    resolve(true);
  });
  return promise;
}
export function authenticate(mode = "login"): void {
  const register = mode === "register";
  const forgot = mode === "forgot";
  if (register && !state.config.registration) {
    toast(errors.registration_closed, true);
    return;
  }
  const title = forgot ? "重置密码" : register ? "创建账号" : "欢迎回来";
  const subtitle = forgot
    ? "如果邮箱对应已有账号，我们会发送一次性重置链接。"
    : register
      ? "保存自己的模型连接，开始一次私有实验。"
      : "继续你的模型实验。";

  const tabsHtml =
    !forgot && state.config.registration
      ? `<div class="segmented-control auth-segmented" role="tablist">
        <button class="segment-btn ${!register ? "active" : ""}" type="button" data-auth-mode="login">登录</button>
        <button class="segment-btn ${register ? "active" : ""}" type="button" data-auth-mode="register">创建账号</button>
      </div>`
      : "";

  const content = `
    <div class="auth-dialog-wrap">
      <div class="auth-header">
        <div class="auth-icon-badge" aria-hidden="true">${forgot ? icons.lock : register ? icons.sparkles : icons.user}</div>
        <p class="muted auth-subtitle">${subtitle}</p>
      </div>
      ${tabsHtml}
      <form id="auth-form" class="stack">
        ${register ? field("auth-username", "用户名", '<input id="auth-username" name="username" required minlength="2" maxlength="32" pattern="[A-Za-z0-9_-]+" autocomplete="username" placeholder="英文字母、数字或下划线">', "2–32 位英文字母、数字、下划线或短横线。", icons.user) : ""}
        ${field("auth-email", "邮箱", '<input id="auth-email" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="name@example.com">', "", icons.mail)}
        ${forgot ? "" : field("auth-password", "密码", `<input id="auth-password" name="password" type="password" required minlength="${register ? 12 : 1}" maxlength="200" autocomplete="${register ? "new-password" : "current-password"}" placeholder="${register ? "至少 12 位密码" : "输入密码"}">`, register ? "至少 12 个字符，建议使用独立密码。" : "", icons.lock)}
        <button class="btn primary full auth-submit-btn" type="submit">${forgot ? "发送重置链接" : register ? "创建账号" : "登录"}</button>
      </form>
      <div class="actions spacer auth-footer-actions">
        ${forgot ? '<button class="btn ghost small" type="button" data-auth-mode="login">← 返回登录</button>' : `<button class="btn ghost small" type="button" data-auth-mode="forgot">忘记密码？</button>`}
      </div>
    </div>`;

  const existingDialog = document.querySelector<HTMLDialogElement>("#modal");
  let dialog: HTMLDialogElement;
  if (
    existingDialog &&
    existingDialog.open &&
    existingDialog.classList.contains("auth-dialog")
  ) {
    dialog = existingDialog;
    const titleEl = dialog.querySelector<HTMLElement>("#dialog-title");
    if (titleEl) titleEl.textContent = title;
    const bodyEl = dialog.querySelector<HTMLElement>(".modal-body");
    if (bodyEl) bodyEl.innerHTML = content;
    const firstInput = dialog.querySelector<HTMLInputElement>(
      "input:not([type=hidden]), textarea, select",
    );
    if (firstInput) firstInput.focus({ preventScroll: true });
  } else {
    dialog = showDialog(title, content);
    dialog.classList.add("compact", "auth-dialog");
  }
  dialog
    .querySelectorAll<HTMLElement>("[data-auth-mode]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        authenticate(button.dataset.authMode),
      ),
    );
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset.pending) return;
    const button = form.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    )!;
    const original = button.textContent;
    const data = new FormData(form);
    form.dataset.pending = "true";
    button.disabled = true;
    button.textContent = "正在处理…";
    clearFormError(form);
    try {
      const body: Obj = { email: String(data.get("email") ?? "") };
      if (!forgot) body.password = String(data.get("password") ?? "");
      if (register) body.username = String(data.get("username") ?? "");
      await mutate(
        "/auth/" + (forgot ? "forgot" : register ? "register" : "login"),
        "POST",
        body,
      );
      closeDialog();
      if (forgot) toast("如果该邮箱已注册，我们会发送重置链接。");
      else {
        await refreshSession();
        toast(register ? "账号已创建，接下来连接你的模型。" : "已登录。");
        refreshPage();
      }
    } catch (error) {
      formError(form, error);
    } finally {
      delete form.dataset.pending;
      button.disabled = false;
      button.textContent = original;
    }
  });
}
