@echo off
cd /d "%~dp0"

echo.
echo === JFO local full-stack setup (first run) ===
echo Requires: Node.js, Docker Desktop, local.dev.secrets.env
echo.

if not exist "local.dev.secrets.env" (
    echo [ERROR] Missing local.dev.secrets.env — clone repo or create it in project root.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-local-windows.ps1"
if errorlevel 1 (
    echo.
    echo [ERROR] Setup failed. See output above.
    pause
    exit /b 1
)

echo.
pause
