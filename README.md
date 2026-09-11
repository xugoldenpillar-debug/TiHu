# TiHu

> 一个 BYOK（Bring Your Own Key）的社区 AI 模型实验场：让不同模型在同一挑战、同一执行环境下生成真实的 Web 作品，再通过预览、对比与社区反馈观察它们的差异。

TiHu 不是一个普通的聊天界面，也不只是展示静态 benchmark 分数。

在 TiHu 中，你可以创建可复用的挑战，连接自己的模型 Provider，选择模型、Prompt 模板和可选的 `SKILL.md`，然后发起一次真实的 coding-agent 实验。每次实验都会在隔离环境中从零开始执行，并生成一个可以直接预览的 Web Artifact。

生成结果默认保持私有，作者确认后才可以公开到社区。公开作品可以被浏览、比较、评论，并分别参与 **Capability** 与 **Funny** 两类投票和排行。

## 核心特性

- **BYOK 模型连接**：使用自己的 Provider API Key，不依赖平台统一模型额度。
- **模型发现与选择**：连接 Provider 后发现可用模型，并为实验固定所选模型与运行条件。
- **可复用挑战**：创建挑战、说明与评估标准，并通过不可变版本保留历史实验条件。
- **Prompt 模板**：保存和复用自己的附加提示词。
- **Skills**：支持包含根 `SKILL.md` 的 Skill 包，并为每次修改保留不可变修订版本。
- **真实 Agent 执行**：每次实验启动独立的 `pi` coding-agent，在全新的工作目录中完成任务。
- **隔离运行环境**：生产运行使用 gVisor (`runsc`)；Guest 无外网、无 Docker Socket，并受到 CPU、内存、PID、时间和输出大小限制。
- **安全的 Provider Broker**：Guest 不直接获得真实 API Key，只拿到一次性运行令牌，通过受控 Unix Socket Broker 请求指定模型。
- **多文件 Web Artifact**：实验结果可以包含 HTML、CSS、JavaScript、SVG、图片等本地文件，并要求生成 `index.html`。
- **独立预览域**：Artifact 通过单独的 Preview Service 和短期签名链接提供预览，与主应用 Origin 隔离。
- **真实缩略图**：公开作品的缩略图由另一个无网络 gVisor Guest 中的 Chromium 根据实际 Artifact 渲染生成。
- **作品社区**：支持公开 Gallery、评论、举报、撤回发布和管理审核。
- **双榜投票**：Capability 与 Funny 独立投票，既可以看完成能力，也可以看有趣程度。
- **同条件比较**：模型榜单和作品对比会保留挑战版本、Track、环境等条件，避免把不同实验条件简单混在一起。

## 工作流程

```text
Challenge
   + Prompt Template
   + optional Skills
   + Provider / Model
          |
          v
      Run Queue
          |
          v
   Dedicated Worker
          |
          v
   gVisor / runsc Guest
      pi coding-agent
          |
          |  one-run broker token
          v
   Unix Socket Broker ------> Model Provider
          |
          v
   Web Artifact Bundle
          |
          +--> Private Preview
          |
          +--> Publish --> Gallery / Compare / Vote / Comment
```

整个执行链路中，模型 Guest 本身没有外网访问能力。真实 Provider Key 只会在可信 Worker 中按需解密，并由 Broker 代为完成受限制的模型请求。

## 架构

```text
Browser --> Caddy / Static Web --> FastAPI API --> PostgreSQL
                                   |
                                   +--> Durable Run Queue
                                              |
                                              v
                                      Dedicated Worker
                                              |
                                      Docker + gVisor
                                              |
                                        pi Agent Guest
                                              |
                                      Unix Socket Broker
                                              |
                                              v
                                       Model Provider

Browser --> Separate Preview Origin --> Signed Artifact Preview
```

主要服务：

- `web`：静态前端与反向代理入口。
- `api`：账户、挑战、模型连接、实验、社区和管理 API。
- `db`：PostgreSQL，保存平台状态与不可变实验快照。
- `worker`：领取队列任务、启动隔离 Guest、代理模型请求并保存结果。
- `preview`：独立 Artifact 预览服务，不持有 Provider 解密密钥。
- `sandbox-image`：运行 `pi` coding-agent 的隔离镜像。
- `thumbnail-image`：使用 Chromium 渲染 Artifact 缩略图的隔离镜像。

## Provider

默认 Provider Base allowlist 包含：

- OpenAI
- Anthropic
- DeepSeek
- OpenRouter
- Google Gemini 的 OpenAI-compatible API

Provider 地址必须通过服务端校验。生产环境应只保留你明确允许并信任的 HTTPS Provider Origin。

> TiHu 的 Provider Key 存储不是 zero-knowledge。Worker 在发起 Provider 请求时需要能够解密密钥。建议使用独立、低额度并设置 Provider 侧消费上限的测试 Key。

## 快速开始

### 环境要求

- Docker + Docker Compose
- Python 3.12+
- gVisor / `runsc`（执行真实模型实验时需要）
- TypeScript（修改 `web/*.ts` 后重新构建前端时需要）

### 1. 克隆项目

```bash
git clone https://github.com/xugoldenpillar-debug/TiHu.git
cd TiHu
```

### 2. 生成本地配置

```bash
python scripts/generate_env.py
```

脚本会生成开发环境所需的 `.env` 和随机密钥。不要把真实 `.env` 提交到仓库。

### 3. 构建前端（修改过 TypeScript 时）

```bash
tsc
```

TypeScript 源码位于 `web/`，编译结果输出到 `web/dist/`。

### 4. 构建隔离镜像

```bash
docker compose --profile build-only build sandbox-image thumbnail-image
```

如果要执行真实 Agent Run，请先确认：

```bash
docker info
```

输出中的可用 runtimes 包含 `runsc`。

### 5. 启动 TiHu

```bash
docker compose up --build -d
```

默认地址：

- App: `http://localhost:8080`
- Preview: `http://127.0.0.1:8001`

查看服务状态：

```bash
docker compose ps
```

停止服务：

```bash
docker compose down
```

> 如果已有数据，不要使用 `docker compose down -v`，否则会删除 PostgreSQL Volume。

## 本地测试

如果暂时没有 Docker / gVisor，也可以运行 API 与核心逻辑测试：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q --disable-warnings
```

更完整的验证范围记录在 [`VALIDATION.json`](./VALIDATION.json) 中，包括 PostgreSQL 并发行为、API / Browser Smoke、gVisor + `pi` + Unix Socket Broker 的端到端执行、缩略图渲染以及可访问性检查。

## 关键配置

主要环境变量可以参考 [`.env.example`](./.env.example)：

| 变量 | 作用 |
| --- | --- |
| `TIHU_ENV` | `development` / `production` 运行环境 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 |
| `MASTER_KEYS` | Provider Key 的 AES-256-GCM 主密钥集合 |
| `ACTIVE_KEY_ID` | 当前用于新凭据加密的 Master Key ID |
| `SIGNING_KEY` | Preview 等签名用途的 32-byte Key |
| `APP_ORIGIN` | 主应用 Origin |
| `PREVIEW_ORIGIN` | Artifact Preview Origin |
| `SANDBOX_RUNTIME` | 隔离容器 Runtime，生产要求 `runsc` |
| `SANDBOX_IMAGE` | Agent Guest 镜像 |
| `THUMBNAIL_IMAGE` | Thumbnail Guest 镜像 |
| `WORKER_CONCURRENCY` | Worker 最大并发任务数 |
| `REGISTRATION_OPEN` | 是否开放注册 |
| `SMTP_*` | 生产注册验证邮件配置 |

## 安全边界

TiHu 把 **控制平面、模型执行环境和浏览器 Artifact** 分开处理。

### Provider Key

Provider Key 使用 AES-256-GCM 加密保存，并绑定账户与 Credential ID。API 不返回完整 Key；Worker 领取任务后才会按需解密。Guest 只获得一次性的 Broker Token，而不获得真实 Provider Key。

### Agent Guest

生产环境中的每次实验都会创建新的 gVisor Guest：

- 无网络；
- 无 Docker Socket；
- 只读 Root Filesystem；
- 非 root 用户；
- Drop Linux capabilities；
- `no-new-privileges`；
- CPU / Memory / PID / File / Time 限制；
- Artifact 文件数量、单文件大小和总大小限制。

Worker 本身需要访问宿主机 Docker Daemon，因此生产环境应把 Worker 放在专用机器上，不要与敏感工作负载混部。

### Artifact Preview

Artifact 使用独立 Origin 提供预览，并通过短期签名链接授权。Preview CSP 与 iframe sandbox 会限制网络连接、表单、Frame、Worker 和外部资源。

Gallery 卡片展示的是隔离 Chromium 实际渲染得到的 JPEG 缩略图，而不是直接执行未受信任的 Artifact HTML。

完整安全设计见 [`docs/security.md`](./docs/security.md)。

## 生产部署

当前仓库提供了生产安全边界与部署基础，但**不要把本地 Smoke Test 等同于生产就绪**。

公开部署前至少需要完成：

- 独立 Worker 主机与真实 gVisor 环境验证；
- 主应用与 Preview 使用互不相关的 HTTPS Origin；
- Secret Manager 与 PostgreSQL 加密备份；
- SMTP、注册验证与反滥用策略；
- Reverse Proxy / WAF / Rate Limit；
- Metrics、日志与告警；
- 镜像和依赖扫描；
- 使用受限真实 Provider Key 的端到端验证；
- 目标负载测试与安全审查。

完整 Checklist 见 [`docs/deployment.md`](./docs/deployment.md)。

## 项目结构

```text
TiHu/
├── tihu/              # FastAPI、领域逻辑、数据库、安全、Runner、Worker
├── web/               # TypeScript 前端、静态资源与 Caddy 配置
├── sandbox/           # pi coding-agent Guest
├── thumbnail/         # Chromium Thumbnail Guest
├── scripts/           # 环境与辅助脚本
├── tests/             # API、Runner、Preview、安全等测试
├── docs/              # 安全边界与生产部署文档
├── compose.yaml       # 本地 / 容器化服务编排
├── VALIDATION.json    # 当前验证范围与结果
└── README.md
```

## Community

项目交流与分享： [LINUX DO](https://linux.do/)

---

TiHu 的排行榜反映的是特定挑战、特定版本和特定运行环境下的社区偏好与作品表现，不应被解释为模型的绝对智能排名。