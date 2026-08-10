# Refresh Git index stat for files marked modified but with no content diff vs HEAD.
# Safe: does NOT touch untracked files; does NOT restore real content changes.
param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

$falsePos = @()
$real = @()

git status --porcelain | ForEach-Object {
  if ($_ -match '^.[MT] ') {
    $f = $_.Substring(3).Trim()
    git diff --quiet HEAD -- $f
    if ($LASTEXITCODE -eq 0) {
      $falsePos += $f
    } else {
      $real += $f
    }
  }
}

Write-Host "False positive (stat only, no content diff): $($falsePos.Count)"
Write-Host "Real content changes: $($real.Count)"

if ($DryRun) {
  foreach ($f in $falsePos) {
    Write-Host "  would refresh: $f"
  }
  exit 0
}

foreach ($f in $falsePos) {
  git add -- $f | Out-Null
  Write-Host "Refreshed: $f"
}

Write-Host "Done. Run 'git status' to verify."
