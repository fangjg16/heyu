# Local full-stack setup (MySQL + MinIO + Hermes Docker) - Windows
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$SkipDockerPull
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

function Test-Cmd([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name"
  }
}

Write-Host "=== JFO local full-stack setup ===" -ForegroundColor Cyan

Test-Cmd npm
Test-Cmd docker

cmd /c "docker info >nul 2>nul"
if ($LASTEXITCODE -ne 0) {
  throw "Docker is not running. Start Docker Desktop first."
}

Write-Host "[1/6] npm install..."
Push-Location $RepoRoot
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed (repo root)" }
Pop-Location

Push-Location (Join-Path $RepoRoot "api-worker")
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed (api-worker)" }
npm run build:production
if ($LASTEXITCODE -ne 0) { throw "build:production failed (api-worker)" }
Pop-Location

Write-Host "[2/6] Generate local config..."
& (Join-Path $RepoRoot "scripts\generate-local-config.ps1") -RepoRoot $RepoRoot
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[3/6] Initialize MySQL schema + workspace users..."
Push-Location (Join-Path $RepoRoot "api-worker")
npm run mysql:migrate:local
if ($LASTEXITCODE -ne 0) { throw "Database migration failed" }
npm run seed:workspace-users
if ($LASTEXITCODE -ne 0) { throw "seed:workspace-users failed" }
Pop-Location

Write-Host "[4/6] Sync Hermes skills..."
& (Join-Path $RepoRoot "scripts\sync-hermes-skills.ps1") -RepoRoot $RepoRoot

Write-Host "[5/6] Pull Hermes Docker image..."
if (-not $SkipDockerPull) {
  docker pull nousresearch/hermes-agent:latest
}

Write-Host "[6/6] Start Hermes container..."
Push-Location (Join-Path $RepoRoot "hermes-railway")
docker compose -f docker-compose.local.yml up -d
if ($LASTEXITCODE -ne 0) { throw "Failed to start Hermes container" }
Pop-Location

Write-Host "[7/7] Configure Hermes LLM (DashScope)..."
& (Join-Path $RepoRoot "scripts\configure-hermes-local.ps1") -RepoRoot $RepoRoot

Start-Sleep -Seconds 3
Write-Host ""
Write-Host "=== Health check ===" -ForegroundColor Cyan
try {
  $h = Invoke-RestMethod "http://127.0.0.1:8642/health" -TimeoutSec 10
  Write-Host "Hermes health: OK ($($h | ConvertTo-Json -Compress))" -ForegroundColor Green
} catch {
  Write-Host "Hermes health: not ready yet (try: curl http://127.0.0.1:8642/health)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup complete. Next:" -ForegroundColor Green
Write-Host "  Run: start-local-fullstack.bat (or double-click it)"
Write-Host "  Or:  api-worker -> npm run dev:local ; repo root -> npm run dev"
Write-Host "  URL:  http://localhost:5173/heyu/app/login"
Write-Host "  User: JimmyHuang / jfo2026"
