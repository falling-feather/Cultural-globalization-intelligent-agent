#!/usr/bin/env bash
# Agent Culture — 阿里云 / Linux 一键部署并长期运行
#
# 用法（在项目仓库根目录的上一级执行，或先 cd 到仓库根目录后执行）：
#   chmod +x scripts/aliyun_start.sh
#   ./scripts/aliyun_start.sh
#
# 环境变量（可选）：
#   AGENT_CULTURE_PORT=902     监听端口（默认 902，对应你所说的「0902」端口 902）
#   SKIP_GIT_PULL=1            跳过 git pull
#   USE_SYSTEMD=1              需 sudo：写入 systemd 并 enable + restart（推荐生产）
#   SERVICE_USER=ubuntu        systemd 下运行服务的系统用户（默认取 SUDO_USER 或当前用户）
#
# 示例：
#   AGENT_CULTURE_PORT=902 ./scripts/aliyun_start.sh
#   sudo USE_SYSTEMD=1 ./scripts/aliyun_start.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${AGENT_CULTURE_PORT:-902}"
PID_FILE="$ROOT/.agent-culture.pid"
LOG_DIR="$ROOT/logs"
LOG_FILE="$LOG_DIR/agent-culture.log"
SERVICE_NAME="agent-culture"

# systemd / 权限修正用（需在 chown 之前定义）
if [[ -n "${SUDO_USER:-}" ]]; then
  RUN_AS="${SERVICE_USER:-$SUDO_USER}"
else
  RUN_AS="${SERVICE_USER:-$(whoami)}"
fi

log() { echo "[aliyun_start] $*"; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    log "错误: 未找到命令「$1」，请先安装。"
    exit 1
  }
}

pick_python() {
  if command -v python3.11 >/dev/null 2>&1; then
    echo "python3.11"
  elif command -v python3.12 >/dev/null 2>&1; then
    echo "python3.12"
  elif command -v python3 >/dev/null 2>&1; then
    echo "python3"
  else
    log "错误: 未找到 python3 / python3.11，请先安装 Python 3.11+。"
    exit 1
  fi
}

PYTHON_BIN="$(pick_python)"
UVICORN="$ROOT/.venv/bin/uvicorn"
PIP="$ROOT/.venv/bin/pip"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  if [[ -d "$ROOT/.git" ]]; then
    log "git pull ..."
    git pull --ff-only
  else
    log "提示: 当前目录不是 git 仓库，已跳过 git pull。"
  fi
fi

log "使用 Python: $($PYTHON_BIN --version 2>&1)"

if [[ ! -d "$ROOT/.venv" ]]; then
  log "创建虚拟环境 .venv ..."
  "$PYTHON_BIN" -m venv "$ROOT/.venv"
fi

log "安装 / 更新依赖 ..."
"$PIP" install -U pip setuptools wheel -q
"$PIP" install -r "$ROOT/requirements.txt"

if [[ ! -f "$ROOT/.env" ]]; then
  if [[ -f "$ROOT/.env.example" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    log "已从 .env.example 复制 .env，请务必编辑填入 API Key 后重启服务。"
  else
    log "警告: 未找到 .env 与 .env.example，请手动创建 .env。"
  fi
fi

mkdir -p "$LOG_DIR"
mkdir -p "$ROOT/storage"

# systemd + root：把 .venv / 数据目录交给业务用户，避免服务无法写 SQLite
if [[ "${USE_SYSTEMD:-0}" == "1" ]] && [[ "$(id -u)" -eq 0 ]]; then
  chown -R "$RUN_AS:$RUN_AS" "$ROOT/.venv" "$ROOT/storage" "$LOG_DIR" 2>/dev/null || true
fi

write_systemd_unit() {
  local unit="/etc/systemd/system/${SERVICE_NAME}.service"
  log "写入 systemd 单元: $unit （运行用户: $RUN_AS）"
  cat <<EOF | tee "$unit" >/dev/null
[Unit]
Description=Agent Culture (FastAPI + Uvicorn)
After=network.target

[Service]
Type=simple
User=$RUN_AS
Group=$RUN_AS
WorkingDirectory=$ROOT
Environment=PATH=$ROOT/.venv/bin
ExecStart=$ROOT/.venv/bin/uvicorn src.main:app --host 0.0.0.0 --port $PORT --workers 2
Restart=always
RestartSec=5

# 日志可 journalctl -u $SERVICE_NAME -f 查看
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
}

stop_nohup_instance() {
  if [[ -f "$PID_FILE" ]]; then
    local old
    old="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
      log "停止旧进程 PID=$old ..."
      kill "$old" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$PID_FILE"
  fi
}

start_nohup() {
  stop_nohup_instance
  log "以后台方式启动 Uvicorn，端口 $PORT（0.0.0.0）..."
  nohup "$UVICORN" src.main:app --host 0.0.0.0 --port "$PORT" --workers 2 \
    >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  log "已启动 PID=$(cat "$PID_FILE")，日志: $LOG_FILE"
  log "访问: http://<服务器公网IP>:${PORT}/"
}

if [[ "${USE_SYSTEMD:-0}" == "1" ]]; then
  need_cmd sudo
  if [[ "$(id -u)" -ne 0 ]]; then
    log "错误: USE_SYSTEMD=1 时请使用 sudo 执行本脚本。"
    exit 1
  fi
  if [[ -z "${SUDO_USER:-}" ]] && [[ -z "${SERVICE_USER:-}" ]]; then
    log "错误: 请在你自己的 Linux 用户下执行「sudo USE_SYSTEMD=1 ...」（不要直接 root 登录），或设置 SERVICE_USER=部署用户名"
    exit 1
  fi
  write_systemd_unit
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  log "systemd 已启用并启动。查看状态: sudo systemctl status $SERVICE_NAME"
  log "查看日志: sudo journalctl -u $SERVICE_NAME -f"
  log "访问: http://<服务器公网IP>:${PORT}/"
else
  start_nohup
  log "提示: 生产环境建议使用 systemd，执行: sudo USE_SYSTEMD=1 $ROOT/scripts/aliyun_start.sh"
fi
