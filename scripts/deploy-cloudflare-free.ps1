param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectName,

  [Parameter(Mandatory = $true)]
  [string]$BackendUrl,

  [string]$Branch = "main",

  [switch]$CreateProject,

  [switch]$SkipSecret
)

$ErrorActionPreference = "Stop"

function Normalize-Url([string]$Url) {
  return $Url.TrimEnd("/")
}

function Invoke-Checked([scriptblock]$Command) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE"
  }
}

$backend = Normalize-Url $BackendUrl
$wsUrl = $backend -replace "^https://", "wss://" -replace "^http://", "ws://"
$healthUrl = "$backend/api/health"

if (-not $env:NODE_OPTIONS) {
  $env:NODE_OPTIONS = "--dns-result-order=ipv4first"
}

Write-Host "Checking backend: $healthUrl"
Invoke-Checked { curl.exe -fsS --max-time 60 $healthUrl | Out-Null }

Write-Host "Checking Cloudflare Wrangler login"
Invoke-Checked { npx wrangler whoami | Out-Host }
Write-Host "Reminder: add your Cloudflare Pages domain to Render CORS_ORIGINS for HTTP fallback and WebSocket."

Push-Location "$PSScriptRoot\..\frontend"
try {
  if ($CreateProject) {
    Write-Host "Creating Cloudflare Pages project: $ProjectName"
    Invoke-Checked { npx wrangler pages project create $ProjectName --production-branch $Branch }
  }

  # Northflank's public code.run hostname is reachable from browsers but not
  # reliably from Cloudflare Pages Functions, so use direct browser requests.
  $env:VITE_API_BASE_URL = $backend
  $env:VITE_WS_URL = $backend
  $env:VITE_API_TIMEOUT_MS = "90000"

  if (Test-Path ".\node_modules\.bin\tsc.cmd") {
    Invoke-Checked { .\node_modules\.bin\tsc.cmd -b }
    Invoke-Checked { .\node_modules\.bin\vite.cmd build }
  } else {
    Invoke-Checked { pnpm build }
  }

  if (-not $SkipSecret) {
    Write-Host "Setting Cloudflare Pages BACKEND_URL secret"
    $backend | npx wrangler pages secret put BACKEND_URL --project-name $ProjectName
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code $LASTEXITCODE"
    }
  } else {
    Write-Host "Skipping BACKEND_URL secret update"
  }
  Write-Host "Deploying Cloudflare Pages project: $ProjectName"
  Invoke-Checked { npx wrangler pages deploy dist --project-name $ProjectName --branch $Branch }
  Write-Host "After deploy, set Render CORS_ORIGINS to include the Pages URL and any custom domain."
} finally {
  Pop-Location
}
