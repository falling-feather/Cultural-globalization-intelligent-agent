@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo ========================================
echo   小飞 · 跨文化传播智能体 · 一键启动
echo ========================================
echo.

REM ---- 参数：--no-browser 不自动开浏览器 / --no-reload 关闭热重载 / --port N 自定义端口 ----
set "OPEN_BROWSER=1"
set "RELOAD=1"
set "PORT=8765"
:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--no-browser" set "OPEN_BROWSER=0" & shift & goto parse_args
if /I "%~1"=="--no-reload"  set "RELOAD=0"        & shift & goto parse_args
if /I "%~1"=="--port"       set "PORT=%~2"        & shift & shift & goto parse_args
shift
goto parse_args
:args_done

REM ---- 显示本地管理员账号（仅展示 .env 中已配置的用户名）----
if exist ".env" (
    for /f "usebackq tokens=1,* delims==" %%A in (`findstr /b "ADMIN_USERNAME=" .env`) do set "ADMIN_USER=%%B"
    if defined ADMIN_USER if not "!ADMIN_USER!"=="" (
        echo [info] 本地管理员账号: !ADMIN_USER!
        echo [info] 若为云端部署，请清空 .env 中 ADMIN_USERNAME/PASSWORD，由首次注册自动创建管理员
        echo.
    )
)

REM ---- 端口占用提示（quick_start.ps1 会自动回退到下一个端口）----
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul 2>&1
if %ERRORLEVEL%==0 (
    echo [warn] 端口 %PORT% 已被占用，将自动尝试下一个端口
    echo.
)

REM ---- 后台延迟打开浏览器 ----
if "%OPEN_BROWSER%"=="1" (
    start "" /B cmd /c "ping -n 5 127.0.0.1 >nul && start http://127.0.0.1:%PORT%/app/"
    echo [info] 浏览器将在 ~4 秒后自动打开 http://127.0.0.1:%PORT%/app/
    echo        如不需要，请执行: 启动.bat --no-browser
    echo.
)

REM ---- 拼装 ps1 参数 ----
set "PS_ARGS=-Port %PORT%"
if "%RELOAD%"=="0" set "PS_ARGS=%PS_ARGS% -NoReload"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\quick_start.ps1" %PS_ARGS%

echo.
echo ========================================
echo   服务已停止
echo ========================================
pause >nul
