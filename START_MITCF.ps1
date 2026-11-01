# START_MITCF.ps1
# Run this in YOUR own terminal (PowerShell), NOT from inside Claude Code.
# Right-click -> "Run with PowerShell", or: .\START_MITCF.ps1
#
# What it does:
#   1. Kills any stale Python process holding port 8000
#   2. Starts the FastAPI backend on http://localhost:8000
#   3. Opens the Next.js frontend in your browser

$root  = Split-Path -Parent $MyInvocation.MyCommand.Path
$py311 = "C:\Users\ABIODUN\AppData\Local\Programs\Python\Python311\python.exe"

Write-Host "=== MITCF Research Platform ===" -ForegroundColor Green

# ── Kill stale process on port 8000 ──────────────────────────────────────────
$stale = netstat -ano | Select-String ":8000\s" |
         ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
foreach ($p in $stale) {
    if ($p -match '^\d+$' -and $p -ne '0') {
        Write-Host "  Stopping stale process PID $p on port 8000..." -ForegroundColor Yellow
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Milliseconds 500

# ── Start backend ─────────────────────────────────────────────────────────────
Write-Host "  Starting backend on http://localhost:8000 ..." -ForegroundColor Cyan
$backendScript = Join-Path $root "start_mitcf_backend.py"
$backend = Start-Process -FilePath $py311 `
    -ArgumentList "`"$backendScript`"" `
    -WorkingDirectory $root `
    -PassThru `
    -WindowStyle Normal

# ── Check which frontend port is available ────────────────────────────────────
Start-Sleep -Seconds 5
$frontendPort = 3001
if (Test-NetConnection -ComputerName localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue) {
    $frontendPort = 3001
} elseif (Test-NetConnection -ComputerName localhost -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue) {
    $frontendPort = 3000
} else {
    # Start frontend if not running
    $frontendDir = Join-Path $root "web\frontend"
    if (Test-Path "$frontendDir\package.json") {
        Write-Host "  Starting frontend..." -ForegroundColor Cyan
        Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/k npm run dev" `
            -WorkingDirectory $frontendDir `
            -WindowStyle Normal
        Start-Sleep -Seconds 8
        $frontendPort = 3000
    }
}

# ── Open browser ──────────────────────────────────────────────────────────────
$frontendUrl = "http://localhost:$frontendPort"
Write-Host ""
Write-Host "  Frontend:  $frontendUrl"          -ForegroundColor Green
Write-Host "  Backend:   http://localhost:8000"   -ForegroundColor Green
Write-Host "  API docs:  http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "  Opening browser..." -ForegroundColor Cyan
Start-Process $frontendUrl

Write-Host ""
Write-Host "  Press any key to stop the backend server..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

if ($backend) { Stop-Process -Id $backend.Id -Force -ErrorAction SilentlyContinue }
Write-Host "Backend stopped." -ForegroundColor Red
