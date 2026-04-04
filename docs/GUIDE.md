# Agent Culture 部署与操作指南

本文档面向项目管理员和开发者，提供从本地开发到云服务器部署的完整操作流程。

---

## 一、环境准备

### 1.1 系统要求

- Python 3.11+（推荐 3.11 或 3.12）
- pip 包管理器
- Git

### 1.2 获取 API Key

本项目依赖两个外部 API 服务，需要分别注册并获取密钥：

**DeepSeek（文本生成）**

1. 访问 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 注册账号并完成实名认证
3. 进入「API Keys」页面创建密钥
4. 将密钥填入 `.env` 文件的 `DEEPSEEK_API_KEY` 字段

**硅基流动 SiliconFlow（视频生成）**

1. 访问 [硅基流动控制台](https://cloud.siliconflow.cn/)
2. 注册账号并完成认证
3. 进入「API 密钥」页面创建密钥
4. 将密钥填入 `.env` 文件的 `SILICONFLOW_API_KEY` 字段

> 注意：如果暂时没有 API Key，可将 `USE_REAL_APIS` 设为 `false`，系统会使用模拟数据运行，方便调试前端和流程。

---

## 二、本地开发

### 2.1 克隆项目并安装依赖

```bash
git clone <仓库地址>
cd agent-culture

# 创建虚拟环境
python -m venv .venv

# 激活虚拟环境
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Windows CMD:
.venv\Scripts\activate.bat
# Linux/macOS:
source .venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 2.2 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入必要的 API Key 与认证相关项：

```ini
# 必填
DEEPSEEK_API_KEY=你的_DeepSeek_密钥
SILICONFLOW_API_KEY=你的_硅基流动_密钥

# 登录与 JWT（生产环境务必设置强随机 JWT_SECRET）
JWT_SECRET=至少32位随机字符串
# 数据库中尚无用户时，会用下面账号自动创建管理员（仅首次）
ADMIN_USERNAME=你的管理员登录名
ADMIN_PASSWORD=你的强密码

# 可选：关闭真实 API 调用（使用模拟数据）
# USE_REAL_APIS=false

# 在 Nginx 等反代后部署时，可开启以正确记录客户端 IP
# TRUST_PROXY_HEADERS=true
```

审计与用户信息保存在 `storage/auth.db`（勿提交到 Git）。

### 2.3 启动开发服务器

```bash
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

或使用一键启动脚本（Windows）：

```powershell
.\scripts\quick_start.ps1
```

启动后可访问：


| 地址                                                             | 说明                   |
| -------------------------------------------------------------- | -------------------- |
| [http://localhost:8000/](http://localhost:8000/)               | 主界面（智能对话、任务管理等）      |
| [http://localhost:8000/console](http://localhost:8000/console) | 开发控制台（快速创建/查询任务）     |
| [http://localhost:8000/docs](http://localhost:8000/docs)       | FastAPI 自动生成的 API 文档 |
| [http://localhost:8000/redoc](http://localhost:8000/redoc)     | ReDoc 格式的 API 文档     |


### 2.4 开发注意事项

- 前端文件在 `wangye/` 目录中，修改后刷新浏览器即可生效
- 后端代码在 `src/` 目录中，使用 `--reload` 参数启动时会自动重载
- 任务数据存储在 `storage/task_store.db`（SQLite），删除该文件可清空所有任务
- 任务产物 JSON 存储在 `storage/outputs/`

---

## 三、云服务器部署

以下以 Ubuntu 22.04/24.04 为例。CentOS 用户请将 `apt` 替换为 `yum`/`dnf`。

### 3.1 服务器准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Python 3.11+
sudo apt install python3.11 python3.11-venv python3-pip -y

# 安装 Nginx
sudo apt install nginx -y

# 安装 Git（如果需要从仓库拉取）
sudo apt install git -y
```

### 3.2 部署项目

```bash
# 切换到部署目录
cd /opt
sudo mkdir agent-culture
sudo chown $USER:$USER agent-culture
cd agent-culture

# 克隆或上传项目
git clone <仓库地址> .
# 或通过 scp 上传：scp -r ./agent-culture user@server:/opt/agent-culture

# 创建虚拟环境并安装依赖
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
nano .env  # 填入 API Key，设置 APP_ENV=production
```

### 3.3 配置 systemd 服务

创建服务文件：

```bash
sudo nano /etc/systemd/system/agent-culture.service
```

写入以下内容：

```ini
[Unit]
Description=Agent Culture AI Video Agent
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/opt/agent-culture
Environment="PATH=/opt/agent-culture/.venv/bin"
ExecStart=/opt/agent-culture/.venv/bin/uvicorn src.main:app --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
# 确保目录权限正确
sudo chown -R www-data:www-data /opt/agent-culture

# 启动并设置开机自启
sudo systemctl daemon-reload
sudo systemctl enable agent-culture
sudo systemctl start agent-culture

# 检查状态
sudo systemctl status agent-culture
```

### 3.4 配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/agent-culture
```

写入：

```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或 IP

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持（如果后续需要）
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/agent-culture /etc/nginx/sites-enabled/
sudo nginx -t         # 检查配置
sudo systemctl reload nginx
```

### 3.5 配置 HTTPS（推荐）

使用 Let's Encrypt 免费证书：

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

Certbot 会自动修改 Nginx 配置并设置证书自动续期。

---

## 四、Docker 部署（可选）

如果你更倾向使用容器化部署：

### 4.1 创建 Dockerfile

在项目根目录创建 `Dockerfile`：

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 4.2 构建并运行

```bash
# 构建镜像
docker build -t agent-culture .

# 运行容器
docker run -d \
  --name agent-culture \
  -p 8000:8000 \
  --env-file .env \
  -v $(pwd)/storage:/app/storage \
  agent-culture
```

### 4.3 Docker Compose（带数据持久化）

创建 `docker-compose.yml`：

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - ./storage:/app/storage
      - ./data:/app/data
    restart: unless-stopped
```

运行：

```bash
docker compose up -d
```

---

## 五、运维操作

### 5.1 查看日志

```bash
# systemd 方式
sudo journalctl -u agent-culture -f

# Docker 方式
docker logs -f agent-culture
```

### 5.2 重启服务

```bash
# systemd
sudo systemctl restart agent-culture

# Docker
docker restart agent-culture
```

### 5.3 更新部署

```bash
cd /opt/agent-culture
git pull origin main
source .venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart agent-culture
```

### 5.4 清空任务数据

```bash
rm storage/task_store.db
rm storage/outputs/*.json
sudo systemctl restart agent-culture
```

---

## 六、常见问题

### Q: 启动后提示 "DEEPSEEK_API_KEY is not configured"

确认 `.env` 文件存在且 `DEEPSEEK_API_KEY` 已填入有效密钥。如果暂时没有密钥，设置 `USE_REAL_APIS=false` 可使用模拟模式。

### Q: 视频生成任务一直是 running 状态

硅基流动 Wan 模型的视频生成是异步过程，通常需要几分钟。可多次查询任务状态，系统会自动轮询远程状态。如果超过 5 分钟仍无变化，请检查 `SILICONFLOW_API_KEY` 是否有效以及账户余额。

### Q: 前端页面加载但显示"服务不可用"

确认后端服务正在运行（检查 `http://localhost:8000/health`）。如果是跨域访问，系统已配置 CORS 允许所有来源。

### Q: 如何添加新的市场？

在 `data/culture/` 目录下新建 JSON 文件（如 `eu.json`），格式参考 `africa.json`：

```json
{
  "language": "en",
  "tone_preferences": ["professional", "formal"],
  "taboo_terms": ["sensitive_term"]
}
```

保存后无需重启，系统会在下次请求时自动加载。

### Q: 如何修改模型参数？

编辑 `.env` 文件中的对应配置项，然后重启服务。主要可调参数包括模型名称（`DEEPSEEK_MODEL`、`WAN_MODEL`）、视频分辨率（`WAN_IMAGE_SIZE`）等。