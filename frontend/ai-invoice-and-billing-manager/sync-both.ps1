# ─────────────────────────────────────────────────────────────
# sync-both.ps1
# Place in: Both GitHub folder AND GitLab folder
# Purpose:  Auto-detects folder and syncs to the other remote
# ─────────────────────────────────────────────────────────────

$currentPath = (Get-Location).Path

Write-Host ""
if ($currentPath -match "\\GitHub\\") {
    Write-Host "📍 Detected: GitHub folder → will sync to GitLab" -ForegroundColor Magenta
    $targetRemote = "gitlab"
} elseif ($currentPath -match "\\GitLab\\") {
    Write-Host "📍 Detected: GitLab folder → will sync to GitHub" -ForegroundColor Magenta
    $targetRemote = "github"
} else {
    Write-Host "❌ Unknown folder. Run this script from inside a 'GitHub' or 'GitLab' folder." -ForegroundColor Red
    exit 1
}
Write-Host ""

# ── Safety Check ──
$changes = git status --porcelain
if ($changes) {
    Write-Host "⚠️  You have uncommitted changes. Commit or stash them first." -ForegroundColor Yellow
    git status --short
    exit 1
}
Write-Host "✅ Working tree is clean." -ForegroundColor Green

# ── Sync ──
git checkout develop
git pull origin develop
git push $targetRemote develop

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Sync complete (origin → $targetRemote)." -ForegroundColor Green
} else {
    Write-Host "❌ Sync failed. Check the output above." -ForegroundColor Red
}
Write-Host ""