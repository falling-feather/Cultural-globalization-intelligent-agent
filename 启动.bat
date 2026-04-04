@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ========================================
echo   Agent Culture - 启动服务
echo ========================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\quick_start.ps1"

echo.
echo 服务已停止。按任意键关闭窗口...
pause >nul
