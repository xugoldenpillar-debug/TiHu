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

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  verified: boolean;
  suspended: boolean;
  created: number;
}

export interface AdminChallenge {
  id: string;
  title: string;
  description: string;
  category: string;
  current_version: number;
  archived: boolean;
  art?: string | null;
  created: number;
  author: string;
  prompt: string;
  rubric: string;
}

export interface AdminPrompt {
  id: string;
  owner_id: string;
  name: string;
  body: string;
  created: number;
  author: string;
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
  art?: string | null;
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
  status: "queued" | "running" | "finished" | "failed" | "canceled" | string;
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

export interface ConnectionItem {
  id: string;
  label: string;
  base_url: string;
  protocol: "openai" | "responses" | "anthropic";
  last4: string;
  models: string[];
  created: number;
  is_official?: boolean;
}

export interface PromptItem {
  id: string;
  name: string;
  body: string;
  created: number;
}

export interface SkillItem {
  id: string;
  name: string;
  sha256: string;
  created: number;
  current_version: number;
  file_count: number;
}

export interface RunDetail extends RunSummary {
  can_view_events?: boolean;
  events: Array<{
    seq: number;
    time: number;
    kind: string;
    text?: string;
    data?: Record<string, unknown>;
  }>;
  artifacts?: Array<{
    path: string;
    size: number;
  }>;
  preview_url?: string;
  preview_token?: string;
}

export interface PageResult<T> {
  items: T[];
  next_cursor: string | null;
  total: number;
}
