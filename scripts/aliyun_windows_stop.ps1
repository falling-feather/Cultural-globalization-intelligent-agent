# 停止由 aliyun_windows_start.ps1 记录的 Uvicorn 主进程（PID 文件）
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot ".agent-culture.pid"

if (-not (Test-Path $pidFile)) {
    Write-Host "[aliyun-windows-stop] 未找到 .agent-culture.pid，可能没有通过 aliyun_windows_start 启动。"
    exit 0
}

$raw = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($raw -notmatch '^\d+$') {
    Write-Host "[aliyun-windows-stop] PID 文件内容无效。"
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    exit 1
}

$id = [int]$raw
$proc = Get-Process -Id $id -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "[aliyun-windows-stop] 停止进程 PID=$id ..."
    Stop-Process -Id $id -Force
}
else {
    Write-Host "[aliyun-windows-stop] 进程 $id 不存在，可能已停止。"
}

Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "[aliyun-windows-stop] 完成。"
