@echo off
cd /d "%~dp0"

if not exist "api-worker\.dev.vars" (
    echo [ERROR] Run setup first: local-init.bat or scripts\setup-local-windows.ps1
    pause
    exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker not found in PATH
    pause
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker Desktop is not running
    pause
    exit /b 1
)

echo Starting Hermes container...
cd /d "%~dp0hermes-railway"
docker compose -f docker-compose.local.yml up -d
cd /d "%~dp0"

echo.
echo Starting API Worker in new window :8787 ...
start "JFO API Worker" cmd /k "cd /d "%~dp0api-worker" && npm run dev:local"

timeout /t 2 /nobreak >nul

echo Starting frontend in new window :5173 ...
start "JFO Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo Local stack started:
echo   Hermes   http://127.0.0.1:8642/health
echo   Worker   http://127.0.0.1:8787/api/health
echo   Web      http://localhost:5173/heyu/app/login
echo   Login    jimmyhuang / jfo2026
echo.
pause
