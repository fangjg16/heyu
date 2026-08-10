# Sync repo skills to %USERPROFILE%\.jfo-local\hermes\skills
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$src = Join-Path $RepoRoot "hermes-railway\skills"
$destRoot = Join-Path $env:USERPROFILE ".jfo-local\hermes"
$destSkills = Join-Path $destRoot "skills"
$soulSrc = Join-Path $RepoRoot "hermes-railway\SOUL-JFO-KB.md"
$soulDest = Join-Path $destRoot "SOUL.md"

if (-not (Test-Path $src)) {
  throw "Skills source not found: $src"
}

New-Item -ItemType Directory -Force -Path $destSkills | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $destRoot "kb") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $destRoot "logs") | Out-Null

Write-Host "Sync skills -> $destSkills"
robocopy $src $destSkills /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "robocopy failed (exit $LASTEXITCODE)"
}

Copy-Item -Force $soulSrc $soulDest

$kbTemplate = Join-Path $destSkills "opportunistic-investments-hermes\assets\kb-template.html"
$kbSchema = Join-Path $destSkills "opportunistic-investments-hermes\references\kb-schema.md"
$jfoSkill = Join-Path $destSkills "jfo-r2-materials\SKILL.md"

foreach ($f in @($kbTemplate, $kbSchema, $jfoSkill)) {
  if (-not (Test-Path $f)) {
    throw "Self-check failed, missing: $f"
  }
}

$html = Get-Content $kbTemplate -Raw -Encoding UTF8
if ($html -notmatch "revealAnchor") {
  throw "Self-check failed: kb-template.html missing revealAnchor"
}

Write-Host "Hermes skills OK" -ForegroundColor Green
Write-Host "  SOUL -> $soulDest"
