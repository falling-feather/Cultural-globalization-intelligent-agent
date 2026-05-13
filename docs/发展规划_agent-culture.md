# Agent Culture · 发展规划与软著申请完善方案

> 版本：V1.0  
> 日期：2026 年 5 月  
> 配套：[发展规划_agent-culture.docx](发展规划_agent-culture.docx)

---

## 一、当前版本功能总结（V1.2.1）

Agent Culture 是一个面向海外市场（初期聚焦非洲地区）的 AI 视频内容创作智能体系统。

### 1.1 已完成的功能模块

- 智能对话（Chat）：多轮对话 + 市场文化规则注入 + 素材引用上下文（material_ids）
- 内容洞察（Insight）：URL 抓取 / 粘贴正文 → DeepSeek 文化适配分析 → 二次结构化提取 → 一键入库
- 用户素材库（Materials）：个人入库 / 系统规则 / 搜索 / 市场过滤 / admin 跨用户视图
- 任务管理（Jobs）：视频脚本生成 + SiliconFlow Wan 视频异步任务全生命周期追踪 + 实时统计
- 用户系统：JWT 登录 + 自助注册 + 角色管理（admin/user）+ 审计日志 + CSV 导出 + 管理员用户管理
- 安全防护：SSRF 防护 + 全局限流（slowapi）+ bcrypt + HS256 JWT
- 多市场支持：AFRICA / US / EU / DEFAULT 四套文化规则，JSON 数据驱动
- 启动脚本：`启动.bat` Windows 一键 + PowerShell `quick_start.ps1`

### 1.2 技术栈

- **后端**：Python 3.11 + FastAPI + SQLite（task_store.db / auth.db）
- **前端**：原生 HTML/CSS/JavaScript，自研 Markdown 渲染器，零构建依赖
- **AI 接口**：DeepSeek（文本/脚本/结构化提取）+ SiliconFlow Wan2.2-T2V（视频生成）
- **部署**：本地 Windows / 阿里云 ECS Linux（systemd + Nginx 反代）

---

## 二、软著申请准备度评估

### 2.1 当前满足项

- [x] 系统功能完整可用：从用户注册到内容生成到素材管理形成完整闭环
- [x] 原创性充分：文化规则引擎、三步走洞察流水线、对话素材注入机制均为独创设计
- [x] 源代码可读：纯 Python + 原生 JS，无编译产物
- [x] 前后端分离：`wangye/` 前端 + `src/` 后端，结构清晰易于审核
- [x] 有一定代码量：后端约 2000+ 行 Python，前端约 2500+ 行 HTML/CSS/JS

### 2.2 当前不足项（需完善）

| 类别 | 不足 | 解决方案 |
|---|---|---|
| 配套文档 | 缺《用户操作手册》 | V2.0 同步补齐 |
| 配套文档 | 缺《软件需求规格说明书 SRS》 | V2.0 同步补齐 |
| 代码量 | 当前约 40-50 页，建议 80+ 页 | V2.0 新增功能模块自然扩充 |
| 独创性 | 视频生成依赖第三方 | 引入文化适配评分、品牌音调库等独创算法 |
| 申请材料 | 缺界面截图 | 申请前补充 5 张以上 |

---

## 三、功能发展规划路线图

### 3.1 近期计划（V1.3）— 打磨核心体验

> 目标：提升使用流畅度、补充独创功能点

- **WebSocket 实时通知**（替代 6s 轮询）—— 后续迭代，骨架先留 TODO
- **文化适配评分模块** ★ 重点
  - 新增 `POST /api/v1/content/score` API
  - DeepSeek 对输入文本按 5 个维度（tone / taboo / localization / credibility / resonance）各给 1-10 分
  - 前端用原生 SVG 雷达图可视化，是核心独创亮点
- **素材自定义标签**
  - `materials` 表新增 `user_tags` 字段
  - 新增 `PUT /api/v1/materials/{id}/tags` 接口
  - 前端弹窗中行内编辑
- **市场规则扩展**
  - 新增 SEA（东南亚）市场：马来语/印尼语 / 伊斯兰饮食禁忌
  - 新增 LATAM（拉丁美洲）市场：西班牙语 / 热情表达风格
  - 文化规则 JSON 增加 `cultural_keywords`、`festival_references` 字段

### 3.2 中期计划（V1.4 - V1.5）— 扩展功能深度

- **批量数据导出**（V1.4）
  - 素材库批量导出 CSV / JSON
  - 任务管理批量导出 CSV
- **AI 反馈闭环**（V1.5）
  - 对话回复支持「有用 / 无用」反馈
  - 反馈写入 `feedback` 表
  - 管理员可查看市场维度的满意度统计
- 内容日历（V1.4）—— 路线图保留，本期未实现
- 素材版本历史（V1.4）—— 路线图保留，本期未实现

### 3.3 长期规划（V2.0）— 架构升级

- **品牌音调库（Brand Voice）** ★ 核心独创
  - 用户可创建多个品牌规则包（关键词、禁用词、风格说明）
  - 在对话和任务创建时可选注入，与文化规则叠加形成「双引擎」
  - 新增 `brand_voices` 表 + 完整 CRUD 接口
- 协作工作区（V2.0+）—— 路线图保留
- 移动端 PWA 适配 —— 路线图保留
- Ollama 本地化部署 —— 路线图保留

---

## 四、本次 V2.0 实际落地清单

| 模块 | 后端 | 前端 | 状态 |
|---|---|---|---|
| SEA 文化规则 | `data/culture/sea.json` | 市场下拉新增 SEA | ✅ |
| LATAM 文化规则 | `data/culture/latam.json` | 市场下拉新增 LATAM | ✅ |
| 文化规则字段扩展 | `culture.py` 兼容旧字段 | 文化卡片展示新字段 | ✅ |
| 文化适配评分 | `POST /content/score` | 内容洞察页雷达图 | ✅ |
| 素材自定义标签 | `materials.user_tags` 字段 + `PUT /materials/{id}/tags` | 素材详情弹窗行内编辑 | ✅ |
| 批量导出素材 | `GET /materials/export?format=csv\|json` | 素材库导出按钮 | ✅ |
| 批量导出任务 | `GET /jobs/export?format=csv\|json` | 任务管理导出按钮 | ✅ |
| AI 反馈闭环 | `POST /feedback` + `GET /admin/feedback/stats` + `feedback` 表 | 对话气泡反馈按钮 + 管理员统计 | ✅ |
| 品牌音调库 | `brand_voices` 表 + CRUD 接口 + chat/jobs 注入 | 新页面「品牌音调」+ chat/create 选择器 | ✅ |
| 版本号显示 | - | 侧边栏 + 登录页页脚显示 `v1.0` | ✅ |

> 内部代号 V2.0，对外品牌版本号 v1.0。

---

## 五、软著申请行动清单

### 5.1 代码材料

| 材料 | 格式/要求 | 状态 |
|---|---|---|
| 源代码（前端） | wangye/*.html + *.css + *.js，前 30 页 + 后 30 页 | ✅ 可提交 |
| 源代码（后端） | src/**/*.py，前 30 页 + 后 30 页 | ✅ 可提交 |
| 用户操作手册 | A4，不少于 6 页，含截图 | 📝 V2.0 同步开始编写 |
| 界面截图 | 5 张以上，JPG，标注功能名 | ⏳ 申请前补充 |
| 软件说明书（SRS） | 功能规格描述，建议 5-10 页 | 📝 V2.0 同步开始编写 |

### 5.2 独创性亮点（供填表用）

1. **文化规则引擎**：JSON 数据驱动 → LLM Prompt 注入，无需改代码扩展新市场
2. **三步走洞察流水线**：URL 抓取 → 文化适配分析 → 二次 json_object 结构化提取 → 入库
3. **文化适配评分**：5 维度独创评分体系 + 原生 SVG 雷达图可视化
4. **对话素材注入**：用户选定素材 → 后端拼 system prompt 上下文 → LLM 引用事实作答
5. **双引擎规则注入**：文化规则 + 品牌音调库，业内首创组合方案
6. **AI 反馈闭环**：用户级反馈 → 市场维度聚合统计，形成自我迭代基础
7. **零构建前端**：自研 renderMarkdown + 自研组件体系，纯原生 JS
8. **SSRF 安全防护**：URL 请求前主动解析 IP，阻断私网/本机访问
9. **双模型异步流水线**：DeepSeek 同步 + SiliconFlow Wan2.2 异步轮询

---

## 六、风险与注意事项

### 6.1 技术风险

- DeepSeek / SiliconFlow API 变更：已通过 `providers.py` 抽象隔离
- SQLite 并发写入：当前单机场景安全；多 worker 需升级 PostgreSQL
- PS5.1 编码：通过 ASCII 化 .ps1 文件解决，后续 .ps1 文件不写中文

### 6.2 软著申请风险

- 第三方库版权：FastAPI / httpx / slowapi 等均为 MIT 许可证，无版权风险
- AI 生成内容版权：本系统生成内容版权归用户所有（需在用户手册声明）
- 接口一致性：`/api/v1/` 路径稳定，不做破坏性变更

---

## 附录：目录结构（V2.0 快照）

```
agent-culture/
├── 启动.bat                       # Windows 一键启动
├── requirements.txt
├── data/culture/                  # 市场文化规则（africa/us/eu/sea/latam/default）
├── docs/                          # 项目文档
│   ├── GUIDE.md
│   ├── ALIYUN_DEPLOY.md
│   ├── 发展规划_agent-culture.md   # 本文档
│   └── 发展规划_agent-culture.docx
├── ruanzhu/                       # 软件著作权申请材料
│   └── 文件清单.md                # 申请提交文件说明
├── scripts/
│   ├── quick_start.ps1
│   └── gen_plan_docx.py
├── src/
│   ├── main.py
│   ├── api/routes/                # auth / chat / content / culture / jobs / feedback / brand_voice
│   ├── core/                      # settings / security / limiter
│   └── services/                  # culture / pipeline / providers / auth_store
│                                  # task_store / material_store / feedback_store
│                                  # brand_voice_store / scoring / url_safety
├── wangye/                        # index.html / login.html / script.js / styles.css
└── storage/                       # auth.db / task_store.db
```
