# Point local Hermes Gateway at DashScope (reads local.dev.secrets.env)
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [switch]$SkipRestart
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$secretsFile = Join-Path $RepoRoot "local.dev.secrets.env"
Write-Host "[configure-hermes] RepoRoot=$RepoRoot"
Write-Host "[configure-hermes] secrets=$secretsFile"
if (-not (Test-Path $secretsFile)) {
  throw "Missing local.dev.secrets.env"
}

function Read-DotEnv([string]$Path) {
  $map = @{}
  Get-Content $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $map[$line.Substring(0, $idx).Trim()] = $line.Substring($idx + 1).Trim()
  }
  return $map
}

function Invoke-DockerExec([string]$Container, [string[]]$ArgList) {
  & docker exec $Container @ArgList
  if ($LASTEXITCODE -ne 0) {
    throw "docker exec failed (exit $LASTEXITCODE): docker exec $Container $($ArgList -join ' ')"
  }
}

$cfg = Read-DotEnv $secretsFile
$base = $cfg["LLM_API_BASE_URL"]
$key = $cfg["LLM_API_KEY"]
$model = $cfg["LLM_MODEL"]
if (-not $base -or -not $key -or -not $model) {
  throw "local.dev.secrets.env needs LLM_API_BASE_URL, LLM_API_KEY, LLM_MODEL"
}
if ($key -match "你的|changeme|xxx|placeholder") {
  throw "LLM_API_KEY 看起来是占位符，请在 local.dev.secrets.env 填写真实 DashScope Key"
}
Write-Host "[configure-hermes] LLM model=$model base=$base keyLen=$($key.Length) keyPrefix=$($key.Substring(0, [Math]::Min(7, $key.Length)))..."

$container = "jfo-hermes-local"
$running = docker ps --format "{{.Names}}" 2>$null | Where-Object { $_ -eq $container }
if (-not $running) {
  throw "Container $container is not running. Start: cd hermes-railway && docker compose -f docker-compose.local.yml up -d"
}

# Prefer PATH hermes; fall back to known install paths
$hermesCliCandidates = @(
  "hermes",
  "/opt/hermes/bin/hermes",
  "/usr/local/bin/hermes"
)
$hermesCli = $null
foreach ($c in $hermesCliCandidates) {
  docker exec $container sh -c "command -v $c >/dev/null 2>&1 || test -x $c" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    # confirm executable
    $probe = docker exec $container sh -c "if command -v $c >/dev/null 2>&1; then command -v $c; elif test -x $c; then echo $c; fi"
    if ($probe) {
      $hermesCli = $probe.Trim()
      break
    }
  }
}
if (-not $hermesCli) {
  throw "Container 内找不到 hermes CLI。请检查镜像。"
}
Write-Host "[configure-hermes] using CLI: $hermesCli"

Write-Host "[configure-hermes] Setting model.provider / base_url / default / api_key ..."
Invoke-DockerExec $container @($hermesCli, "config", "set", "model.provider", "custom")
Invoke-DockerExec $container @($hermesCli, "config", "set", "model.base_url", $base)
Invoke-DockerExec $container @($hermesCli, "config", "set", "model.default", $model)
Invoke-DockerExec $container @($hermesCli, "config", "set", "model.api_key", $key)

# Also set common env-style keys Hermes may read from config / dotenv under HERMES_HOME
Invoke-DockerExec $container @($hermesCli, "config", "set", "model.key_env", "OPENAI_API_KEY")

# Force-write OPENAI_API_KEY into volume .env so env-based loaders pick it up
$envFile = @"
API_SERVER_ENABLED=true
API_SERVER_HOST=0.0.0.0
API_SERVER_KEY=$($cfg["HERMES_API_KEY"])
OPENAI_API_BASE=$base
OPENAI_API_KEY=$key
OPENAI_BASE_URL=$base
DASHSCOPE_API_KEY=$key
MODEL_DEFAULT=$model
JFO_API_PUBLIC_BASE=http://host.docker.internal:8787
JFO_INTERNAL_KEY=$($cfg["JFO_INTERNAL_KEY"])
"@
$tmpEnv = Join-Path $env:TEMP "jfo-hermes-docker.env"
Set-Content -Path $tmpEnv -Value $envFile.TrimEnd() -Encoding ascii
docker cp $tmpEnv "${container}:/opt/data/.env"
if ($LASTEXITCODE -ne 0) { throw "docker cp .env failed" }
Remove-Item $tmpEnv -Force -ErrorAction SilentlyContinue
Write-Host "[configure-hermes] wrote /opt/data/.env"

# Direct yaml fix if CLI left a stale placeholder line
$pyFile = Join-Path $env:TEMP "jfo-patch-hermes-key.py"
Set-Content -Path $pyFile -Value @"
import os, re, pathlib
p = pathlib.Path('/opt/data/config.yaml')
t = p.read_text(encoding='utf-8')
key = os.environ['JFO_PATCH_KEY']
t2, n = re.subn(r'(?m)^(\s*api_key:\s*).*$', lambda m: m.group(1) + key, t, count=3)
p.write_text(t2, encoding='utf-8')
print(f'patched api_key lines={n}')
"@ -Encoding ascii
docker cp $pyFile "${container}:/tmp/jfo-patch-hermes-key.py"
docker exec -e "JFO_PATCH_KEY=$key" $container python3 /tmp/jfo-patch-hermes-key.py
if ($LASTEXITCODE -ne 0) {
  Write-Host "[configure-hermes] python3 patch skipped/failed; trying python" -ForegroundColor Yellow
  docker exec -e "JFO_PATCH_KEY=$key" $container python /tmp/jfo-patch-hermes-key.py
}
Remove-Item $pyFile -Force -ErrorAction SilentlyContinue

$check = docker exec $container sh -c "grep -n 'api_key' /opt/data/config.yaml | head -5"
Write-Host "[configure-hermes] api_key lines now:`n$check"
if ($check -match "你的") {
  throw "api_key 仍含占位符「你的」，写入失败。请把上述输出发出来排查。"
}

if (-not $SkipRestart) {
  Write-Host "[configure-hermes] Restarting $container ..."
  docker restart $container | Out-Null
  Start-Sleep -Seconds 15
}

try {
  Invoke-RestMethod "http://127.0.0.1:8642/health" -TimeoutSec 30 | Out-Null
  Write-Host "[configure-hermes] Hermes health: OK" -ForegroundColor Green
} catch {
  Write-Host "[configure-hermes] Hermes still starting (curl http://127.0.0.1:8642/health)" -ForegroundColor Yellow
}

Write-Host "[configure-hermes] Done." -ForegroundColor Green
