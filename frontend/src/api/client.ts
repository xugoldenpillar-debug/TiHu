import type { AppConfig, Session } from "../types";

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
  verification_delivery_unavailable: "尚未配置可用的验证邮件服务，请联系管理员。",
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
  sandbox_timeout: "实验达到运行时间上限。已发生的服务商请求不会退款或自动重试。",
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
  worker_lease_expired_no_automatic_retry: "运行服务中断。为避免重复计费，本次实验不会自动重试。",
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
  if (typeof error === "string") {
    return errors[error] ?? (error.match(/[\u3400-\u9fff]/) ? error : errors.runner_failure);
  }
  if (error instanceof Error) {
    if (error.name === "AbortError" || error.message.includes("aborted")) return "";
    return errors[error.message] ?? (error.message.match(/[\u3400-\u9fff]/) ? error.message : "连接暂时中断，请检查网络后重试。");
  }
  return "操作未完成，请稍后重试。";
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (
    csrfToken &&
    init.method &&
    !["GET", "HEAD"].includes(init.method.toUpperCase())
  ) {
    headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch("/api" + path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
    const retry = Number(response.headers.get("retry-after"));
    throw new ApiError(
      typeof body.detail === "string" ? body.detail : "request_failed",
      response.status,
      Array.isArray(body.errors)
        ? body.errors.map((x) => String(x.field))
        : [],
      retry > 0 ? retry : null,
    );
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export async function fetchConfig(): Promise<AppConfig> {
  return api<AppConfig>("/config");
}

export async function fetchSession(): Promise<Session> {
  const s = await api<Session>("/session");
  setCsrfToken(s.csrf);
  return s;
}
