export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  verified: boolean;
  created: number;
}
export interface Harness {
  agent: string;
  version: string;
  image: string;
  runtime: string;
  seconds: number;
  calls: number;
  output_tokens_per_call: number;
  cpu: number;
  memory_mb: number;
  pids: number;
  network: string;
  tools: string[];
  system_prompt_version: string;
}
export interface Quota {
  active: number;
  active_limit: number;
  daily_used: number;
  daily_limit: number;
  daily_remaining: number;
  next_available_at: number | null;
}
export interface AppConfig {
  app_origin: string;
  preview_origin: string;
  registration: boolean;
  providers: string[];
  harness: Harness;
  categories: string[];
  vote_min_age_seconds: number;
  limits: {
    skill_bytes: number;
    skill_files: number;
    skills_per_run: number;
    prompts: number;
    skills: number;
  };
}
export interface Session {
  user: User | null;
  csrf: string | null;
  quota: Quota | null;
  vote_eligible_at: number | null;
}
export interface Challenge {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  category: string;
  current_version: number;
  created: number;
  archived: boolean;
}
export interface ChallengeVersion {
  id: string;
  number: number;
  prompt: string;
  rubric: string;
  sha256: string;
  created: number;
}
export interface ChallengeDetail extends Challenge {
  versions: ChallengeVersion[];
  can_edit: boolean;
}
export interface RunSummary {
  id: string;
  owner_id: string;
  challenge_id: string;
  version_id: string;
  title: string;
  version: number;
  model: string;
  provider: string;
  track: string;
  environment: string;
  status: string;
  published: boolean;
  hidden: boolean;
  created: number;
  started: number | null;
  finished: number | null;
  error: string | null;
  username: string;
  capability: number;
  funny: number;
  my_votes: string[];
  can_manage: boolean;
  thumbnail_available: boolean;
  is_official?: boolean;
  metrics: {
    calls?: number;
    elapsed_ms?: number;
    usage_complete?: boolean;
    tokens?: Record<string, number | null>;
  };
}
export interface ModelScore {
  model: string;
  provider: string;
  track: string;
  environment: string;
  score: number;
  entries: number;
  authors: number;
  challenges: number;
  is_official?: boolean;
}

export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function has(value: unknown, fields: Record<string, string>): boolean {
  return (
    record(value) &&
    Object.entries(fields).every(([key, type]) => typeof value[key] === type)
  );
}
const challengeFields = {
  id: "string",
  title: "string",
  description: "string",
  category: "string",
  current_version: "number",
};
const runFields = {
  id: "string",
  model: "string",
  status: "string",
  track: "string",
  published: "boolean",
  created: "number",
  version_id: "string",
  environment: "string",
};

// Validate response structure at the shared network boundary before page-specific types consume it.
export function validResponse(
  path: string,
  method: string,
  value: unknown,
): boolean {
  const pathname = path.split("?")[0];
  if (method !== "GET") return record(value);
  if (pathname === "/config") {
    return (
      record(value) &&
      typeof value.registration === "boolean" &&
      typeof value.app_origin === "string" &&
      typeof value.preview_origin === "string" &&
      Array.isArray(value.providers) &&
      value.providers.every((x) => typeof x === "string") &&
      has(value.harness, {
        version: "string",
        runtime: "string",
        seconds: "number",
        calls: "number",
        memory_mb: "number",
        cpu: "number",
      }) &&
      record(value.harness) &&
      Array.isArray(value.harness.tools) &&
      value.harness.tools.every((x) => typeof x === "string") &&
      Array.isArray(value.categories) &&
      value.categories.every((x) => typeof x === "string") &&
      record(value.limits)
    );
  }
  if (pathname === "/me")
    return (
      record(value) &&
      (value.user === null ||
        has(value.user, {
          id: "string",
          username: "string",
          email: "string",
          role: "string",
          verified: "boolean",
          created: "number",
        })) &&
      (value.quota == null ||
        has(value.quota, {
          active: "number",
          active_limit: "number",
          daily_used: "number",
          daily_limit: "number",
          daily_remaining: "number",
        }))
    );
  if (pathname === "/stats")
    return has(value, {
      challenges: "number",
      works: "number",
      models: "number",
    });
  if (pathname === "/challenges" || pathname === "/runs")
    return (
      record(value) &&
      Array.isArray(value.items) &&
      typeof value.total === "number" &&
      (value.next_cursor === null || typeof value.next_cursor === "string") &&
      value.items.every((row) =>
        has(row, pathname === "/runs" ? runFields : challengeFields),
      )
    );
  if (pathname === "/leaderboard")
    return (
      record(value) &&
      Array.isArray(value.items) &&
      value.items.every((row) =>
        has(row, {
          model: "string",
          provider: "string",
          track: "string",
          environment: "string",
        }),
      )
    );
  if (/^\/challenges\/[^/]+$/.test(pathname))
    return (
      has(value, challengeFields) &&
      record(value) &&
      Array.isArray(value.versions) &&
      value.versions.every((row) =>
        has(row, {
          id: "string",
          number: "number",
          prompt: "string",
          rubric: "string",
          sha256: "string",
        }),
      )
    );
  if (/^\/runs\/[^/]+$/.test(pathname))
    return (
      has(value, runFields) &&
      record(value) &&
      record(value.snapshot) &&
      Array.isArray(value.my_votes)
    );
  if (pathname.endsWith("/preview")) return has(value, { url: "string" });
  if (pathname.endsWith("/source"))
    return (
      record(value) &&
      record(value.files) &&
      Object.values(value.files).every((x) => typeof x === "string")
    );
  if (pathname === "/keys")
    return (
      Array.isArray(value) &&
      value.every(
        (row) =>
          has(row, {
            id: "string",
            label: "string",
            base_url: "string",
            protocol: "string",
            last4: "string",
          }) &&
          record(row) &&
          Array.isArray(row.models) &&
          row.models.every((model) => typeof model === "string"),
      )
    );
  if (pathname === "/prompts")
    return (
      Array.isArray(value) &&
      value.every((row) =>
        has(row, { id: "string", name: "string", body: "string" }),
      )
    );
  if (pathname === "/skills")
    return (
      Array.isArray(value) &&
      value.every((row) =>
        has(row, {
          id: "string",
          name: "string",
          sha256: "string",
          current_version: "number",
        }),
      )
    );
  if (/^\/skills\/[^/]+$/.test(pathname))
    return (
      record(value) &&
      record(value.files) &&
      Object.values(value.files).every((x) => typeof x === "string") &&
      Array.isArray(value.versions)
    );
  if (pathname.endsWith("/comments"))
    return (
      Array.isArray(value) &&
      value.every((row) =>
        has(row, {
          id: "string",
          body: "string",
          username: "string",
          created: "number",
        }),
      )
    );
  if (pathname === "/admin/reports")
    return (
      Array.isArray(value) &&
      value.every((row) =>
        has(row, { id: "string", run_id: "string", reason: "string" }),
      )
    );
  if (pathname === "/admin/metrics")
    return (
      record(value) && Array.isArray(value.queue) && Array.isArray(value.audit)
    );
  return record(value) || Array.isArray(value);
}
