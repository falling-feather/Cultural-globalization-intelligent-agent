# Agent Culture — 阿里云 Windows Server（图形界面）一键更新并后台启动
# 默认端口 902（与 Linux 脚本 aliyun_start.sh 一致；可用 -Port 修改）
#
# 用法：
#   powershell -ExecutionPolicy Bypass -File .\scripts\aliyun_windows_start.ps1
#
# 参数：
#   -Port 902          监听端口（默认 902）
#   -NoGitPull         跳过 git pull
#   -Reload            开发用：uvicorn --reload（单进程，生产勿用）
#
# 依赖：Git、Python 3.11+（建议安装时勾选「Add to PATH」）。
# 说明：本项目后端为 Python/FastAPI，不依赖 Node.js。

Param(
    [int]$Port = 902,
    [switch]$NoGitPull,
    [switch]$Reload
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$pidFile = Join-Path $projectRoot ".agent-culture.pid"
$logDir = Join-Path $projectRoot "logs"
$logOut = Join-Path $logDir "agent-culture.log"
$logErr = Join-Path $logDir "agent-culture.err.log"

function Write-Info($msg) { Write-Host "[aliyun-windows] $msg" }

if (-not $NoGitPull) {
    if (Test-Path (Join-Path $projectRoot ".git")) {
        Write-Info "git pull --ff-only ..."
        git -C $projectRoot pull --ff-only
    }
    else {
        Write-Info "当前目录不是 git 仓库，已跳过 git pull。"
    }
}

if (-not (Test-Path ".venv")) {
    Write-Info "创建虚拟环境 .venv ..."
    if (Get-Command py -ErrorAction SilentlyContinue) {
        py -3.11 -m venv .venv
    }
    else {
        python -m venv .venv
    }
}

$pip = Join-Path $projectRoot ".venv\Scripts\pip.exe"
$py = Join-Path $projectRoot ".venv\Scripts\python.exe"

Write-Info "安装 / 更新依赖 ..."
& $pip install -U pip setuptools wheel -q
& $pip install -r (Join-Path $projectRoot "requirements.txt")

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Info "已从 .env.example 复制 .env，请编辑填入 API Key 后重启。"
    }
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (Test-Path $pidFile) {
    $oldPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($oldPid -match '^\d+$') {
        $oldProc = Get-Process -Id ([int]$oldPid) -ErrorAction SilentlyContinue
        if ($oldProc) {
            Write-Info "停止旧进程 PID=$oldPid ..."
            Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

$argList = @(
    "-m", "uvicorn", "src.main:app",
    "--host", "0.0.0.0",
    "--port", "$Port"
)
if ($Reload) {
    $argList += "--reload"
    Write-Info "以 --reload 模式启动。"
}
else {
    $argList += "--workers", "2"
}

Write-Info "启动 Uvicorn，端口 $Port ..."
Write-Info "标准输出: $logOut"
Write-Info "错误输出: $logErr"

$p = Start-Process -FilePath $py `
    -ArgumentList $argList `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logOut `
    -RedirectStandardError $logErr `
    -PassThru

if ($p -and $p.Id) {
    $p.Id | Out-File -FilePath $pidFile -Encoding utf8
    Write-Info "已启动 PID=$($p.Id)"
}
else {
    Write-Host "[aliyun-windows] 警告: 未能获取进程 ID，请查看日志。" -ForegroundColor Yellow
}

Write-Info "浏览器访问: http://<本机公网IP>:${Port}/"
Write-Info "停止服务: .\scripts\aliyun_windows_stop.ps1"
Write-Info "提示: 用户注销后进程可能结束；长期无人登录运行请用「任务计划程序」或 NSSM，见 docs/ALIYUN_DEPLOY.md"
