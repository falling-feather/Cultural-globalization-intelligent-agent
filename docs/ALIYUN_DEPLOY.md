# 阿里云 ECS 部署说明（Git 拉取 + 一键启动）

官方仓库：**https://github.com/falling-feather/Cultural-globalization-intelligent-agent**

---

## 零、仓库克隆（通用）

在服务器上选择空目录后执行（HTTPS）：

```bash
git clone https://github.com/falling-feather/Cultural-globalization-intelligent-agent.git
cd Cultural-globalization-intelligent-agent
```

若仓库为私有，请使用 **GitHub Personal Access Token** 或 **SSH 密钥** 完成鉴权。

**切勿**将 `.env`（含 API Key）提交到 Git；首次部署复制环境模板：

- **Windows（PowerShell）**：`Copy-Item .env.example .env`，再用记事本编辑  
- **Linux**：`cp .env.example .env && nano .env`

---

## 一、阿里云控制台（通用）

### 1. 安全组入方向

1. 登录 [云服务器 ECS 控制台](https://ecs.console.aliyun.com/) → 实例 → 安全组 → **配置规则**。  
2. **入方向** 放行你实际使用的端口，例如：

| 场景 | 端口 | 说明 |
|------|------|------|
| Windows 脚本默认 | **TCP 901** | [`scripts/aliyun_windows_start.ps1`](../scripts/aliyun_windows_start.ps1) 默认 `901`，与你现有 901 习惯一致 |
| Linux 脚本默认 | **TCP 902** | [`scripts/aliyun_start.sh`](../scripts/aliyun_start.sh) 默认 `902` |

- **授权对象**：测试可用 `0.0.0.0/0`；生产建议改为固定 IP 或 VPN 网段。  
- 若同一安全组上已有 **901** 规则且复用该端口，只需保证未被其它程序独占即可。

### 2. 公网与带宽

- 实例需绑定 **公网 IP** 或 **EIP**，并保证能访问外网（调用 DeepSeek、硅基流动等）。

### 3. 域名与备案（可选）

- 使用 **`http://公网IP:端口`** 一般无需备案。  
- 使用 **80/443 + 域名** 且为中国大陆机房时，需按阿里云要求完成 **ICP 备案**。

---

## 二、Windows Server（带图形界面）部署

适用于：阿里云 **Windows 镜像** ECS，已安装 **Git**、**Node.js** 的场景。

### 2.1 关于 Node.js

本项目 **后端为 Python + FastAPI**，**不依赖 Node.js**。服务器上已安装的 Node 可继续给其它项目使用；部署本智能体只需 **Python 3.11+**。

若尚未安装 Python：

1. 打开浏览器下载 [Python 3.11+ Windows 安装包](https://www.python.org/downloads/windows/)。  
2. 安装时勾选 **Add python.exe to PATH**。  
3. 重新打开 **PowerShell**，执行 `python --version` 或 `py -3.11 --version` 确认。

### 2.2 Windows 防火墙

1. **控制面板** → **Windows Defender 防火墙** → **高级设置**。  
2. **入站规则** → **新建规则** → **端口** → **TCP**，特定本地端口填 **`901`**（若你改用其它端口，与此一致）。  
3. 允许连接 → 勾选 **域 / 专用 / 公用**（按你的网络场景）→ 命名如 `AgentCulture-901`。

### 2.3 一键启动（默认端口 901）

在仓库根目录打开 **PowerShell**（建议「以管理员身份运行」仅在你需要写系统目录时；一般用户目录不必）：

```powershell
cd C:\path\to\Cultural-globalization-intelligent-agent
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
.\scripts\aliyun_windows_start.ps1
```

可选参数：

```powershell
# 指定端口（与安全组、防火墙一致）
.\scripts\aliyun_windows_start.ps1 -Port 901

# 跳过本次 git pull
.\scripts\aliyun_windows_start.ps1 -NoGitPull

# 开发调试（热重载，生产勿用）
.\scripts\aliyun_windows_start.ps1 -Reload
```

脚本会：`git pull` → 创建/更新 `.venv` → `pip install` → 在 **`0.0.0.0:901`** 后台启动 Uvicorn（**2 workers**，无 `--reload`）。

日志目录：`logs\agent-culture.log`、`logs\agent-culture.err.log`。

停止服务：

```powershell
.\scripts\aliyun_windows_stop.ps1
```

### 2.4 长期运行（无人登录也保持运行）

当前脚本用后台进程启动；**用户注销后，该进程可能被系统结束**。若需要 **开机自启 / 崩溃重启**，可选用：

**方案 A：任务计划程序**

1. **任务计划程序** → **创建任务**（不要用「创建基本任务」以便配置完整）。  
2. **常规**：勾选「不管用户是否登录都要运行」、**使用最高权限运行**（若需要）。  
3. **触发器**：「启动时」或「登录时」。  
4. **操作**：启动程序  
   - 程序：`powershell.exe`  
   - 参数：`-NoProfile -ExecutionPolicy Bypass -File "C:\path\to\Cultural-globalization-intelligent-agent\scripts\aliyun_windows_start.ps1" -NoGitPull`  
   - 起始于：`C:\path\to\Cultural-globalization-intelligent-agent`  
5. 日常更新代码后，可再建一个「仅手动运行」的任务，参数去掉 `-NoGitPull`，或登录后手动执行一次带 `git pull` 的脚本。

**方案 B：NSSM（将 Uvicorn 注册为 Windows 服务）**

1. 下载 [NSSM](https://nssm.cc/download)，解压后以管理员 CMD 执行：  
   `nssm install AgentCulture`  
2. **Application**：`C:\path\to\Cultural-globalization-intelligent-agent\.venv\Scripts\python.exe`  
3. **Arguments**：`-m uvicorn src.main:app --host 0.0.0.0 --port 901 --workers 2`  
4. **Startup directory**：仓库根目录路径。  
5. 安装服务后：`nssm start AgentCulture`。

### 2.5 访问地址

```text
http://<ECS公网IP>:901/
```

API 文档：`http://<公网IP>:901/docs`

---

## 三、Linux 部署（脚本默认端口 902）

### 3.1 软件准备（Ubuntu 示例）

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv python3-pip
```

### 3.2 克隆与 `.env`

```bash
sudo mkdir -p /opt/agent-culture
sudo chown "$USER:$USER" /opt/agent-culture
cd /opt/agent-culture
git clone https://github.com/falling-feather/Cultural-globalization-intelligent-agent.git .
cp .env.example .env
nano .env
```

### 3.3 一键启动

```bash
chmod +x scripts/aliyun_start.sh scripts/aliyun_stop.sh
./scripts/aliyun_start.sh
```

默认 **`AGENT_CULTURE_PORT=902`**。自定义端口：

```bash
AGENT_CULTURE_PORT=902 ./scripts/aliyun_start.sh
```

**systemd（推荐生产）**：

```bash
sudo USE_SYSTEMD=1 ./scripts/aliyun_start.sh
```

详见脚本内注释；安全组与系统防火墙需放行对应端口（如 **902**）。

### 3.4 访问地址

```text
http://<公网IP>:902/
```

---

## 四、更新发布（Git 拉取）

**Windows：**

```powershell
cd C:\path\to\Cultural-globalization-intelligent-agent
git pull --ff-only
.\scripts\aliyun_windows_start.ps1
```

**Linux（systemd）：**

```bash
cd /opt/agent-culture
git pull --ff-only
sudo systemctl restart agent-culture
```

---

## 五、常见问题

1. **浏览器无法访问**  
   - 核对 **安全组** 与 **系统防火墙** 端口是否与脚本一致（Windows 默认 **901**，Linux 默认 **902**）。  
   - 本机自测：浏览器访问 `http://127.0.0.1:901/`（或你的端口）。

2. **对话 / 任务报错**  
   - 检查 `.env` 中 API Key、`USE_REAL_APIS`。  
   - 确认 ECS 可访问外网。

3. **Windows 上提示无法执行脚本**  
   - `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`。

更多通用说明见 [`GUIDE.md`](GUIDE.md)。
