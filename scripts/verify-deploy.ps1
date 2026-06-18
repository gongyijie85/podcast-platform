param(
  [string]$BackendUrl = "https://podcast-platform-backend-8065.onrender.com",
  [switch]$SkipLocal,
  [switch]$TryVercelDeploy
)

$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [string]$Name,
    [scriptblock]$Command
  )
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

if (-not $SkipLocal) {
  Run-Step "frontend tests" { pnpm --filter frontend test }
  Run-Step "backend tests" { pnpm --filter backend test }
  Run-Step "frontend build" { pnpm --filter frontend build }
  Run-Step "backend build" { pnpm --filter backend build }
}

Write-Host "`n==> online readonly checks" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BackendUrl/api/health"
$bgm = Invoke-RestMethod "$BackendUrl/api/bgm/tracks"
if ($health.code -ne 0) {
  throw "Health check failed: $($health | ConvertTo-Json -Depth 5)"
}
if ($bgm.code -ne 0) {
  throw "BGM check failed: $($bgm | ConvertTo-Json -Depth 5)"
}
Write-Host "Health OK; BGM tracks OK" -ForegroundColor Green

if ($TryVercelDeploy) {
  Write-Host "`n==> vercel deploy" -ForegroundColor Cyan
  $whoami = vercel whoami 2>$null
  if ($LASTEXITCODE -eq 0 -and $whoami) {
    vercel deploy --prod --force
    if ($LASTEXITCODE -ne 0) {
      throw "Vercel deploy failed with exit code $LASTEXITCODE"
    }
  } else {
    Write-Warning "Vercel CLI is not logged in or not linked. Manual step: set VITE_API_BASE_URL=$BackendUrl without /api, then Redeploy with build cache disabled."
  }
}

