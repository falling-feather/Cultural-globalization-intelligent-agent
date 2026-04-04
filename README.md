# Agent Culture MVP

面向海外市场的 AI 视频智能体（MVP骨架）。

## 功能

- 接收视频生成请求（主题、受众、市场）
- 基于市场文化规则执行脚本生成流程（可调用 DeepSeek）
- 生成产物清单并输出到本地 `storage/outputs`
- 提供任务状态查询接口

## 快速启动

```powershell
./scripts/quick_start.ps1
```

说明：

- API 配置文件位置：项目根目录 `.env`
- 首次启动会自动从 `.env.example` 复制一份 `.env`
- 你只需要把 key 填进 `.env`

要实现真实可用，请至少配置：

- `USE_REAL_APIS=true`
- `DEEPSEEK_API_KEY`
- `SILICONFLOW_API_KEY`
- `SILICONFLOW_WAN_SUBMIT_PATH`
- `SILICONFLOW_WAN_QUERY_PATH`

当前默认模型配置：

- 文本模型：DeepSeek（`DEEPSEEK_MODEL=deepseek-chat`）
- 视频模型：硅基流动 Wan（`WAN_MODEL=Wan-AI/Wan2.2-I2V-A14B`）

说明：

- 已接入真实 DeepSeek 文本生成（`USE_REAL_APIS=true` 且 key 有效时生效）
- Wan 目前为“可配置真实提交+轮询”：设置 `SILICONFLOW_WAN_SUBMIT_PATH` 与 `SILICONFLOW_WAN_QUERY_PATH` 后可轮询到真实 `video_url`；未设置时回退本地占位 `local://...`

任务存储：

- 任务状态已持久化到 SQLite：`storage/task_store.db`
- 服务重启后，历史任务仍可查询

## 示例请求

```powershell
curl -X POST "http://127.0.0.1:8000/api/v1/jobs" ^
  -H "Content-Type: application/json" ^
  -d "{\"topic\":\"fintech inclusion\",\"market\":\"AFRICA\",\"audience_tags\":[\"18-35\",\"mobile-first\"],\"tone\":\"friendly\"}"
```

返回 `job_id` 后，查询状态：

```powershell
curl "http://127.0.0.1:8000/api/v1/jobs/<job_id>"
```

## 目录

- `src/main.py`: FastAPI 入口
- `src/api/routes/jobs.py`: 任务接口
- `src/services/pipeline.py`: 任务编排
- `src/services/task_store.py`: 任务状态存储（内存版）
- `data/culture/africa.json`: 非洲市场文化规则示例
- `.env.example`: API 参数模板（DeepSeek + SiliconFlow Wan）
- `scripts/quick_start.ps1`: 一键启动脚本

## 下一步

- 接入真实检索 API（SerpAPI/Tavily）
- 接入真实 TTS（ElevenLabs）与视频生成 API（Runway）
- 将任务存储迁移至 Redis + PostgreSQL
