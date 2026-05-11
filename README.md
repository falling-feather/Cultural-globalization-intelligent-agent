# Agent Culture — 面向海外的文化传播视频创作智能体

Agent Culture 是一个面向海外市场（主要目标：非洲地区）的 AI 视频内容创作智能体系统。它帮助用户基于目标市场的文化规则，自动生成适配当地受众的短视频脚本与视频内容。

## 核心功能

- **智能对话**：与 AI 助手对话，讨论文化传播策略、内容创意、受众分析等；支持一键引用市场文化指南 / 禁忌 / 语气
- **文化素材库（V1.2.0）**：系统市场规则 + 用户从「内容洞察」二次提取入库的结构化素材统一管理，用徒章区分；可搜索 / 市场过滤
- **对话引用素材（V1.2.0）**：在智能对话中弹窗多选最多 10 条素材作为上下文，后端拼入 system prompt，使 AI 可引用你预先收集的市场事实
- **内容洞察（三步走）**：URL 抓取 / 粘贴正文 → DeepSeek 生成文化适配 markdown 报告 → 二次抽取结构化字段（标题 / 语气 / 风险 / 禁忌命中 / 标签 / 关键引句）可一键入库
- **视频脚本生成**：基于主题、目标市场和受众标签，自动生成文化适配的视频脚本
- **AI 视频生成**：将脚本提交至硟基流动 Wan 模型，异步生成视频内容
- **文化规则引擎**：内置多市场文化规则库（语言偏好、推荐语气、禁忌用语），确保内容合规
- **任务管理**：创建、查询、追踪视频生成任务的完整生命周期
- **多市场支持**：预设 AFRICA、US、EU 等市场配置，可扩展
- **登录与 JWT**：主界面需登录；管理员可查看操作审计日志、导出 CSV
- **用户注册与角色管理**：支持自助注册（首位注册者自动晋升为管理员），管理员可在前端查看 / 删除用户
- **多市场会话隔离**：聊天历史按市场分别落盘 localStorage，切换市场即切换上下文
- **任务实时统计**：右侧仪表盘按状态聚合 + 各市场分布条形图，运行中任务自动 6s 轮询刷新
- **抹取链路加固**：HTTP/1.1 + httpx 内外双层重试 + 真实 Chrome UA 临思，遇 SSL/超时/连接错误返回中文友好提示并建议改用「粘贴正文」

## 创新点 / 软著要点

1. **「文化规则引擎 → LLM Prompt 注入」机制**：将各目标市场的语言、推荐语气、禁忌词以 JSON 数据驱动方式注入到对话 / 脚本 / 总结的 system prompt，实现"无需改代码即可扩展新市场"，是本项目区别于通用 ChatGPT 套壳产品的核心差异点（见 `src/services/culture.py` + `src/services/pipeline.py`）。
2. **双模型异步流水线**：DeepSeek 负责脚本与文化分析（同步），SiliconFlow Wan2.2 负责视频生成（异步轮询），统一在 `src/services/pipeline.py` 通过 SQLite 状态机调度，前端通过任务列表轮询观察。
3. **URL 抓取 SSRF 安全防护**：`src/services/url_safety.py` 在调用「URL 文化总结」前主动解析域名 → IP，阻断私网 / 本机 / 链路本地等敏感地址，杜绝 OWASP A10 风险。
4. **完整安全控制平面**：JWT (HS256 + bcrypt) · 角色（admin / user）· 全局限流 (slowapi) · 审计日志中间件（自动记录写操作 + 登录 + 管理员查询）· CSV 导出 · 自助注册速率限制。
5. **跨市场文化洞察**：「内容洞察」模块允许把已有素材按目标市场重新做文化适配分析，输出 Markdown 结构化建议，是从 0→1 创作之外的「再加工」工具，扩展了智能体的应用场景。
6. **零构建前端**：纯原生 HTML/CSS/JS，自研轻量 Markdown 渲染器（`renderMarkdown` in `wangye/script.js`），无 webpack / npm 依赖，便于软著审核中"提交可读源代码"的要求。
7. **设计语言自洽**：深靛蓝 + 暖金 + 米色的"传播品牌"配色与字间排版，刻意区别于通用 SaaS / AI 产品的蓝紫色调，体现作品独立美学。

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

### 方式一：Windows 一键脚本（推荐）

```bat
启动.bat                       :: 默认 8765 + 开启热重载 + 4 秒后自动开浏览器
启动.bat --no-browser         :: 不自动开浏览器
启动.bat --no-reload          :: 关闭热重载（生产调试）
启动.bat --port 8766          :: 自定义端口（被占用会自动退退到下一个）
```

首次启动会自动创建 Python 3.11 虚拟环境、安装依赖、从 `.env.example` 复制 `.env`；如未填 DeepSeek/SiliconFlow Key 会提示访问「管理 → 模型配置」在 UI 里填入（无需重启）。

### 方式二：PowerShell 脚本

```powershell
.\scripts\quick_start.ps1 -Port 8765
```

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

POST /api/v1/auth/register        # 自助注册（限流 5/min；首位用户自动成为 admin）
Body: { "username": "...", "password": "..." }
Response: { "access_token": "...", "token_type": "bearer", "username": "...", "role": "..." }

GET /api/v1/auth/me
Header: Authorization: Bearer ...
Response: { "username": "...", "role": "admin" }

POST /api/v1/auth/logout          # 记录登出审计
```

### 管理员（仅 role=admin）

```
GET /api/v1/admin/audit-logs?limit=50&offset=0
GET /api/v1/admin/audit-logs/export       # CSV 导出
GET /api/v1/admin/users                    # 列出全部用户
DELETE /api/v1/admin/users/{username}      # 删除用户（不能删自己）
```

### 内容文化总结 + 结构化抽取（需登录）

```
POST /api/v1/content/summarize
Body: {
  "source_type": "url"|"text",
  "url"?: "https://...",
  "text"?: "...",
  "market": "AFRICA",
  "extract": true                   // 可选，为 true 时后端会二次调 DeepSeek json_object 抽结构化字段
}
Response: {
  "summary": "...markdown...",
  "market": "AFRICA",
  "raw_excerpt": "...",             // 原文截取，素材入库用
  "source_type": "text",
  "source_url": "",
  "structured": {                    // extract:true 时返回
    "title": "...",
    "tone_observed": [...],
    "risks": [...],
    "taboo_hits": [...],
    "tags": [...],
    "key_quotes": [...]
  }
}
```

抹取失败会由后端返回中文友好提示并建议改用「粘贴正文」（首页已集成在上面的 Tab 切换上）。

### 文化素材库（需登录，V1.2.0 新增）

```
GET    /api/v1/materials?market=AFRICA&limit=200       # 列出本人素材，admin 跨用户可见
POST   /api/v1/materials                                # 入库（限流 30/min）
Body: { market, title, source_type, source_url?, summary_md, raw_excerpt?, structured? }
GET    /api/v1/materials/{id}                           # 详情
DELETE /api/v1/materials/{id}                           # 删除（仅拥有人 / admin）
```

### 对话

```
POST /api/v1/chat
Body: {
  "message": "你好",
  "market": "AFRICA",
  "history": [],
  "material_ids": ["<id1>","<id2>"]   // 可选，V1.2.0 新增，最多 10 条，将被拼入 system prompt
}
Response: { "reply": "...", "market": "AFRICA", "used_material_ids": [...] }
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

GET /api/v1/jobs/stats
Response: { "total": 12, "by_status": {"success": 8, "failed": 1, "running": 3}, "by_market": [{"market":"AFRICA","count":7}, ...] }
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
│       ├── material_store.py # 用户素材库（SQLite，V1.2.0）
│       ├── url_safety.py     # 抓取前 SSRF 防护
│       ├── auth_store.py     # 账号 / 审计 / 限流状态
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

1. 启动服务后，访问 `http://localhost:8765/`（启动.bat 默认会自动开浏览器）
2. 在「智能对话」中与 AI 讨论内容策略；可点「引用素材」弹窗勾选你入库的素材作为上下文
3. 在「内容洞察」里抓取 URL 或粘贴正文生成文化适配报告，点「保存到我的素材库」入库
4. 在「文化素材」页查看系统规则 + 你的素材（带「系统」/「我的」徽章），可搜索 / 过滤
5. 在「创建任务」中填写主题、市场、语气等参数提交视频生成任务
6. 在「任务管理」中追踪任务进度，点任务卡片查看脚本与视频链接

