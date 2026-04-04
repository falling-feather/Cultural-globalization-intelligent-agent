# Agent Culture — 面向海外的文化传播视频创作智能体

Agent Culture 是一个面向海外市场（主要目标：非洲地区）的 AI 视频内容创作智能体系统。它帮助用户基于目标市场的文化规则，自动生成适配当地受众的短视频脚本与视频内容。

## 核心功能

- **智能对话**：与 AI 助手对话，讨论文化传播策略、内容创意、受众分析等
- **视频脚本生成**：基于主题、目标市场和受众标签，自动生成文化适配的视频脚本
- **AI 视频生成**：将脚本提交至硅基流动 Wan 模型，异步生成视频内容
- **文化规则引擎**：内置多市场文化规则库（语言偏好、推荐语气、禁忌用语），确保内容合规
- **任务管理**：创建、查询、追踪视频生成任务的完整生命周期
- **多市场支持**：预设 AFRICA、US、EU 等市场配置，可扩展
- **登录与 JWT**：主界面需登录；管理员可查看操作审计日志、导出 CSV
- **内容总结**：输入公开网页 URL 或粘贴正文，按目标市场生成文化适配分析（DeepSeek）

## 技术架构

```
┌──────────────────────────────────────────────┐
│                前端 (wangye/)                  │
│   智能对话 │ 任务管理 │ 文化素材 │ 创建任务     │
└───────────────────┬──────────────────────────┘
                    │ HTTP API
┌───────────────────┴──────────────────────────┐
│              FastAPI 后端 (src/)               │
│                                               │
│  /api/v1/chat     → DeepSeek 对话             │
│  /api/v1/jobs     → 任务 CRUD + Pipeline      │
│  /api/v1/culture  → 文化规则查询               │
│  /health          → 健康检查                   │
│                                               │
│  Services:                                    │
│  ├── pipeline.py    任务编排                   │
│  ├── providers.py   DeepSeek + SiliconFlow    │
│  ├── culture.py     文化规则加载               │
│  └── task_store.py  SQLite 持久化              │
└───────────────────┬──────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
   DeepSeek API          SiliconFlow Wan API
   (文本/脚本生成)         (视频生成)
```

## 快速启动

### 方式一：PowerShell 一键启动

```powershell
.\scripts\quick_start.ps1
```

首次启动会自动创建虚拟环境、安装依赖、从 `.env.example` 复制 `.env`。

### 方式二：手动启动

```bash
# 1. 创建虚拟环境
python -m venv .venv

# 2. 激活虚拟环境
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env：填入 DeepSeek / 硅基流动 Key；并设置 JWT_SECRET、ADMIN_USERNAME、ADMIN_PASSWORD（首次启动会自动创建管理员）

# 5. 启动服务
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

启动后访问：

- 主界面：`http://localhost:8000/`（将跳转登录页 `/app/login.html`，登录后进入应用）
- 开发控制台：`http://localhost:8000/console`（需先在主站登录一次，浏览器会保存 token 供同域请求使用）
- API 文档：`http://localhost:8000/docs`

### 阿里云 ECS（Git 拉取 + 长期运行）

- **仓库**：<https://github.com/falling-feather/Cultural-globalization-intelligent-agent>  
- **Linux**：`scripts/aliyun_start.sh`（默认端口 **902**）  
- **Windows 图形界面服务器**：`scripts/aliyun_windows_start.ps1`（默认端口 **902**，与 Linux 一致；可用 `-Port` 修改）  

完整步骤与安全组、防火墙说明见 [docs/ALIYUN_DEPLOY.md](docs/ALIYUN_DEPLOY.md)。

## 配置说明

在 `.env` 文件中配置以下参数：


| 变量                            | 说明              | 默认值                      |
| ----------------------------- | --------------- | ------------------------ |
| `APP_ENV`                     | 运行环境            | `dev`                    |
| `USE_REAL_APIS`               | 是否调用真实 API      | `true`                   |
| `DEFAULT_MARKET`              | 默认目标市场          | `AFRICA`                 |
| `DEEPSEEK_API_KEY`            | DeepSeek API 密钥 | 必填                       |
| `DEEPSEEK_MODEL`              | DeepSeek 模型     | `deepseek-chat`          |
| `SILICONFLOW_API_KEY`         | 硅基流动 API 密钥     | 必填                       |
| `WAN_MODEL`                   | Wan 视频模型        | `Wan-AI/Wan2.2-I2V-A14B` |
| `SILICONFLOW_WAN_SUBMIT_PATH` | 视频提交路径          | `/video/submit`          |
| `SILICONFLOW_WAN_QUERY_PATH`  | 视频查询路径          | `/video/status`          |
| `JWT_SECRET`                  | JWT 签名密钥（生产务必更换） | 见 `.env.example`          |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 首次无用户时自动创建管理员 | 可选，勿提交 Git           |
| `TRUST_PROXY_HEADERS`         | 信任 `X-Forwarded-For`（反代后） | `false`                  |

除 `/health`、`POST /api/v1/auth/login` 外，业务 API 需在请求头携带 `Authorization: Bearer <token>`。

## API 接口

### 认证

```
POST /api/v1/auth/login
Body: { "username": "...", "password": "..." }
Response: { "access_token": "...", "token_type": "bearer", "username": "...", "role": "admin" }

GET /api/v1/auth/me
Header: Authorization: Bearer ...
Response: { "username": "...", "role": "admin" }
```

### 管理员审计（仅 role=admin）

```
GET /api/v1/admin/audit-logs?limit=50&offset=0
GET /api/v1/admin/audit-logs/export
```

### 内容文化总结（需登录）

```
POST /api/v1/content/summarize
Body: { "source_type": "url"|"text", "url"?: "https://...", "text"?: "...", "market": "AFRICA" }
```

### 对话

```
POST /api/v1/chat
Body: { "message": "你好", "market": "AFRICA", "history": [] }
Response: { "reply": "...", "market": "AFRICA" }
```

### 任务管理

```
POST /api/v1/jobs
Body: { "topic": "fintech inclusion", "market": "AFRICA", "tone": "friendly", "audience_tags": ["18-35"] }
Response: { "job_id": "uuid", "status": "queued" }

GET /api/v1/jobs
Response: { "jobs": [...], "total": 5 }

GET /api/v1/jobs/{job_id}
Response: { "id": "...", "status": "success", "request": {...}, "result": {...} }

GET /api/v1/jobs/{job_id}/script
Response: { "job_id": "...", "script": "...", "status": "success" }
```

### 文化规则

```
GET /api/v1/culture
Response: [{ "id": "africa", "language": "en", "label": "AFRICA" }, ...]

GET /api/v1/culture/{market}
Response: { "language": "en", "tone_preferences": [...], "taboo_terms": [...] }
```

## 目录结构

```
agent-culture/
├── .env.example              # 环境变量模板
├── requirements.txt          # Python 依赖
├── scripts/
│   └── quick_start.ps1       # 一键启动脚本
├── data/
│   └── culture/              # 文化规则数据
│       ├── africa.json       # 非洲市场规则
│       ├── us.json           # 美国市场规则
│       ├── eu.json           # 欧盟市场规则
│       └── default.json      # 默认规则（兜底）
├── src/
│   ├── main.py               # FastAPI 入口（CORS、限流、审计中间件、路由）
│   ├── web/
│   │   └── index.html        # 开发控制台
│   ├── core/
│   │   └── settings.py       # 配置管理（pydantic-settings）
│   ├── models/
│   │   └── schemas.py        # 数据模型（Job、Request）
│   ├── api/routes/
│   │   ├── jobs.py           # 任务 CRUD 接口
│   │   ├── chat.py           # 对话交互接口
│   │   └── culture.py        # 文化规则查询接口
│   └── services/
│       ├── pipeline.py       # 任务编排（脚本生成 + 视频提交）
│       ├── providers.py      # 外部 API 调用（DeepSeek + SiliconFlow）
│       ├── culture.py        # 文化规则加载
│       └── task_store.py     # 任务存储（SQLite 持久化）
├── wangye/                   # 前端主界面
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── storage/
│   └── outputs/              # 任务产物 JSON（运行时生成）
└── qianduan.pen              # Pencil 设计源文件
```

## 使用流程

1. 启动服务后，访问 `http://localhost:8000/`
2. 在「智能对话」中与 AI 讨论内容策略
3. 在「创建任务」中填写主题、市场、语气等参数并提交
4. 在「任务管理」中查看任务进度，点击任务卡片查看详情
5. 任务完成后可查看生成的脚本和视频链接
6. 在「文化素材」中查阅各市场的文化规则数据

