#!/usr/bin/env bash
# 停止通过 aliyun_start.sh（nohup 模式）启动的进程；若使用 systemd，请用 systemctl stop。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.agent-culture.pid"
SERVICE_NAME="agent-culture"

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
  echo "[aliyun_stop] 检测到 systemd 服务已运行，执行: sudo systemctl stop $SERVICE_NAME"
  sudo systemctl stop "$SERVICE_NAME"
  exit 0
fi

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[aliyun_stop] 停止 PID=$pid"
    kill "$pid"
    rm -f "$PID_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[aliyun_stop] 未找到运行中的 nohup 实例或 PID 文件。"
