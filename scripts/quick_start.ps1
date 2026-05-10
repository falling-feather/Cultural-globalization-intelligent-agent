Param(
    [switch]$NoReload,
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path ".venv")) {
    Write-Host "[quick-start] creating Python 3.11 virtual environment..."
    py -3.11 -m venv .venv
}

Write-Host "[quick-start] installing dependencies..."
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

if (-not (Test-Path ".env")) {
    Write-Host "[quick-start] .env not found, copying from .env.example..."
    Copy-Item ".env.example" ".env"
    Write-Host "[quick-start] please fill API keys in .env before using real providers."
}

# 检查 DeepSeek key 是否已配置（.env 占位符时提示去模型配置页设置）
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'DEEPSEEK_API_KEY=YOUR_DEEPSEEK') {
    Write-Host ""
    Write-Host "[quick-start] ⚠ DEEPSEEK_API_KEY 尚未填入 .env" -ForegroundColor Yellow
    Write-Host "[quick-start]   请在服务启动后访问管理页面 → 模型配置，通过 UI 设置 API Key（无需重启）" -ForegroundColor Yellow
    Write-Host ""
}

# 检查 SiliconFlow key 是否已配置
if ($envContent -match 'SILICONFLOW_API_KEY=YOUR_SILICONFLOW') {
    Write-Host ""
    Write-Host "[quick-start] ⚠ SILICONFLOW_API_KEY 尚未填入 .env" -ForegroundColor Yellow
    Write-Host "[quick-start]   视频生成功能将无法使用，请在 .env 中填入硅基流动 API Key" -ForegroundColor Yellow
    Write-Host "[quick-start]   视频模型: Wan-AI/Wan2.2-T2V-A14B (text-to-video)" -ForegroundColor Yellow
    Write-Host ""
}

$reloadFlag = "--reload"
if ($NoReload) {
    $reloadFlag = ""
}

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $Port = $Port + 1
    Write-Host "[quick-start] target port is occupied, fallback to $Port"
}

Write-Host "[quick-start] starting API server on http://127.0.0.1:$Port"
Write-Host "[quick-start] app url: http://127.0.0.1:$Port/app/"
if ($reloadFlag) {
    & ".\.venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port $Port --reload
} else {
    & ".\.venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port $Port
}
