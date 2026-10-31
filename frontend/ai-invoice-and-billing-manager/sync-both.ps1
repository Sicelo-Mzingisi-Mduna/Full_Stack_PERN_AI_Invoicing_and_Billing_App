# sync-both.ps1
# Place in: Both GitHub folder AND GitLab folder
# Purpose:  Auto-detects folder and syncs to the other remote

$currentPath = (Get-Location).Path

Write-Host ""
if ($currentPath -match "\\GitHub\\") {
    Write-Host "[INFO] Detected: GitHub folder - will sync to GitLab" -ForegroundColor Magenta
    $targetRemote = "gitlab"
} elseif ($currentPath -match "\\GitLab\\") {
    Write-Host "[INFO] Detected: GitLab folder - will sync to GitHub" -ForegroundColor Magenta
    $targetRemote = "github"
} else {
    Write-Host "[ERROR] Unknown folder. Run from inside a 'GitHub' or 'GitLab' folder." -ForegroundColor Red
    exit 1
}
Write-Host ""

# Safety check: uncommitted changes
$changes = git status --porcelain
if ($changes) {
    Write-Host "[WARN] Uncommitted changes detected. Commit or stash them first." -ForegroundColor Yellow
    git status --short
    exit 1
}
Write-Host "[OK] Working tree is clean." -ForegroundColor Green

# Safety check: inside a git repo
$insideRepo = git rev-parse --is-inside-work-tree 2>$null
if ($insideRepo -ne "true") {
    Write-Host "[ERROR] Not inside a Git repository." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Git repository detected." -ForegroundColor Green

# Sync
Write-Host ""
Write-Host "[INFO] Switching to develop..." -ForegroundColor Cyan
git checkout develop

Write-Host "[INFO] Pulling from origin..." -ForegroundColor Cyan
git pull origin develop

Write-Host "[INFO] Pushing to $targetRemote..." -ForegroundColor Cyan
git push $targetRemote develop

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "[DONE] Sync complete (origin -> $targetRemote)." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERROR] Sync failed. Check the output above." -ForegroundColor Red
}
Write-Host ""