# 阿里云 ECS 部署说明（Git 拉取 + 一键启动）

本文配合仓库内脚本 [`scripts/aliyun_start.sh`](../scripts/aliyun_start.sh) 使用：在服务器上 `git pull` 更新代码后执行脚本，即可完成依赖安装并**长期运行**（默认监听 **902** 端口，与「0902」即端口 **902** 一致）。

---

## 一、你需要在阿里云上完成的设置

### 1. 安全组（必做）

1. 登录 [阿里云控制台](https://ecs.console.aliyun.com/) → **云服务器 ECS** → 实例 → 点击实例 ID → **安全组** → 配置规则。
2. **入方向** 新增一条：
   - **协议类型**：TCP  
   - **端口范围**：`902/902`（若你改用其他端口，改成对应范围，如 `8000/8000`）  
   - **授权对象**：`0.0.0.0/0`（仅测试用；生产建议改为你的办公网 IP 或 VPN 网段）  
   - **描述**：Agent Culture HTTP  

> 若后续前面再加 **Nginx** 监听 80/443，则安全组需放行 **80、443**，应用可只监听本机 `127.0.0.1:902`，由 Nginx 反代（更安全）。当前脚本默认 **0.0.0.0:902** 直连应用，与安全组 902 一致。

### 2. 系统防火墙（若开启）

**Ubuntu（ufw）示例：**

```bash
sudo ufw allow 902/tcp
sudo ufw reload
sudo ufw status
```

**firewalld（部分 CentOS）：**

```bash
sudo firewall-cmd --permanent --add-port=902/tcp
sudo firewall-cmd --reload
```

### 3. 公网 IP 与带宽

- 确保实例已绑定 **公网 IP**（或 EIP），且带宽足够访问页面与调用外网 API（DeepSeek、硅基流动）。

### 4. 域名与备案（可选）

- 仅用 **IP:902** 访问无需备案。  
- 若要用 **80/443 + 域名** 在中国大陆机房，需按阿里云要求完成 **ICP 备案** 与 HTTPS 证书（可与 Nginx 一并配置）。

### 5. 密钥与仓库

- 在服务器上配置 **SSH 密钥** 或 **HTTPS + Token**，以便 `git pull` 私有仓库。  
- **切勿**将 `.env`（含 API Key）提交到 Git；首次部署在服务器上复制 `.env.example` 为 `.env` 并编辑（脚本会在缺少 `.env` 时自动复制模板）。

---

## 二、服务器软件准备（首次）

以 **Ubuntu 22.04** 为例：

```bash
sudo apt update
sudo apt install -y git python3.11 python3.11-venv python3-pip
```

若无 `python3.11`，可安装 `python3`（需 3.10+）；脚本会优先选用 `python3.11`。

---

## 三、部署目录与 Git 拉取

示例将代码放在 `/opt/agent-culture`（可改成你的路径）：

```bash
sudo mkdir -p /opt/agent-culture
sudo chown "$USER:$USER" /opt/agent-culture
cd /opt/agent-culture

# 首次克隆（将下面地址换成你的 GitHub 仓库）
git clone https://github.com/你的用户名/agent-culture.git .

# 或先 clone 到子目录再移动，按你习惯即可
```

配置 `.env`：

```bash
cp .env.example .env
nano .env   # 填入 DEEPSEEK_API_KEY、SILICONFLOW_API_KEY 等
```

---

## 四、一键启动脚本（长期运行）

### 4.1 赋予执行权限

```bash
cd /opt/agent-culture
chmod +x scripts/aliyun_start.sh scripts/aliyun_stop.sh
```

### 4.2 方式 A：后台 nohup（简单）

默认 **端口 902**，每次执行会 `git pull`、装依赖、启动（并尝试停掉旧 nohup 进程）：

```bash
./scripts/aliyun_start.sh
```

自定义端口：

```bash
AGENT_CULTURE_PORT=902 ./scripts/aliyun_start.sh
```

跳过本次 `git pull`：

```bash
SKIP_GIT_PULL=1 ./scripts/aliyun_start.sh
```

日志文件：`logs/agent-culture.log`。

停止 nohup 实例：

```bash
./scripts/aliyun_stop.sh
```

### 4.3 方式 B：systemd（推荐生产）

开机自启、崩溃自动拉起：

```bash
cd /opt/agent-culture
sudo USE_SYSTEMD=1 ./scripts/aliyun_start.sh
```

- 服务名：`agent-culture`  
- 查看状态：`sudo systemctl status agent-culture`  
- 看日志：`sudo journalctl -u agent-culture -f`  
- 重启：`sudo systemctl restart agent-culture`  
- 停止：`sudo systemctl stop agent-culture`  

若仓库属于普通用户而你用 `sudo` 执行脚本，默认会以 **`SUDO_USER`**（你登录的用户）作为运行用户；也可指定：

```bash
sudo SERVICE_USER=ubuntu USE_SYSTEMD=1 ./scripts/aliyun_start.sh
```

---

## 五、更新发布流程（Git 拉取）

```bash
cd /opt/agent-culture
git pull --ff-only
./scripts/aliyun_start.sh
```

- **nohup 模式**：脚本会停旧进程再起新进程。  
- **systemd 模式**：建议改为：

```bash
git pull --ff-only
sudo systemctl restart agent-culture
```

或在 pull 后再次执行 `sudo USE_SYSTEMD=1 ./scripts/aliyun_start.sh`（会重写 unit 并 restart）。

---

## 六、访问地址

浏览器打开：

```text
http://<你的ECS公网IP>:902/
```

- 根路径会重定向到 `/app/` 主界面。  
- API 文档：`http://<公网IP>:902/docs`  

---

## 七、常见问题

**1. 浏览器打不开、一直转圈**  
- 安全组与系统防火墙是否放行 **902**。  
- 本机监听：`ss -tlnp | grep 902` 或 `curl -sI http://127.0.0.1:902/`

**2. 对话 / 任务接口报错**  
- 检查 `.env` 中 Key 与 `USE_REAL_APIS`。  
- 服务器需能访问外网（DeepSeek、硅基流动）。

**3. 想用 80 端口**  
- 不推荐直接 root 跑 1024 以下端口；建议 **Nginx 监听 80** 反代到 `127.0.0.1:902`，安全组只开 80/443。可参考主文档 [`GUIDE.md`](GUIDE.md) 中的 Nginx 示例，把 `proxy_pass` 改为 `http://127.0.0.1:902`。

---

更多通用说明见 [`GUIDE.md`](GUIDE.md)。
