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

# Check whether DeepSeek key is configured (still placeholder -> remind user to set via UI)
$envContent = Get-Content ".env" -Raw
if ($envContent -match 'DEEPSEEK_API_KEY=YOUR_DEEPSEEK') {
    Write-Host ""
    Write-Host "[quick-start] WARN: DEEPSEEK_API_KEY is not set in .env" -ForegroundColor Yellow
    Write-Host "[quick-start]   After server starts, open Admin -> Model Config to set the API key via UI (no restart needed)." -ForegroundColor Yellow
    Write-Host ""
}

# Check SiliconFlow key
if ($envContent -match 'SILICONFLOW_API_KEY=YOUR_SILICONFLOW') {
    Write-Host ""
    Write-Host "[quick-start] WARN: SILICONFLOW_API_KEY is not set in .env" -ForegroundColor Yellow
    Write-Host "[quick-start]   Video generation will be disabled. Set the SiliconFlow API key in .env to enable it." -ForegroundColor Yellow
    Write-Host "[quick-start]   Video model: Wan-AI/Wan2.2-T2V-A14B (text-to-video)" -ForegroundColor Yellow
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
