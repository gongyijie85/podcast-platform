param(
  [string]$BackendUrl = "https://podcast-platform-backend-8065.onrender.com",
  [string]$FrontendUrl = "https://podcast-platform.vercel.app"
)

$ErrorActionPreference = "Stop"

Write-Host "Readonly backend smoke checks" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BackendUrl/api/health"
$bgm = Invoke-RestMethod "$BackendUrl/api/bgm/tracks"

if ($health.code -ne 0) {
  throw "Backend health returned non-zero code"
}
if ($bgm.code -ne 0) {
  throw "BGM endpoint returned non-zero code"
}

Write-Host "Frontend URL: $FrontendUrl" -ForegroundColor Cyan
Write-Host "Manual E2E checklist:" -ForegroundColor Yellow
Write-Host "1. Open an incognito window and visit $FrontendUrl"
Write-Host "2. Register/login with a disposable test email if write validation is approved"
Write-Host "3. Create a project from ISBN import through generation preview"
Write-Host "4. Verify Network paths never contain /api/api/"
Write-Host "5. Delete the test project after validation"

