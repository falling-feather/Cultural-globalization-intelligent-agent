Param(
    [switch]$NoReload,
    [int]$Port = 8000
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

$reloadFlag = "--reload"
if ($NoReload) {
    $reloadFlag = ""
}

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $Port = $Port + 1
    Write-Host "[quick-start] target port is occupied, fallback to $Port"
}

Write-Host "[quick-start] starting API server on http://127.0.0.1:$Port"
if ($reloadFlag) {
    & ".\.venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port $Port --reload
} else {
    & ".\.venv\Scripts\python.exe" -m uvicorn src.main:app --host 127.0.0.1 --port $Port
}
