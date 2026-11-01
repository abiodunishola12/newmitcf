# MITCF Research Web Platform — Startup Script
# Run from the project root: C:\Users\ABIODUN\PycharmProjects\newmitcf

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ProjectRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " MITCF Research Web Platform" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check venv
$Python = "$ProjectRoot\.venv\Scripts\python.exe"
if (-not (Test-Path $Python)) {
    Write-Host "ERROR: Virtual environment not found at .venv" -ForegroundColor Red
    exit 1
}

# Install backend deps if needed
Write-Host "Checking backend dependencies..." -ForegroundColor Yellow
& $Python -c "import fastapi, uvicorn, psutil" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Yellow
    & $Python -m pip install fastapi "uvicorn[standard]" psutil
}

Write-Host ""
Write-Host "Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Green
Write-Host "  API docs: http://localhost:8000/docs" -ForegroundColor Gray

# Start backend in background
$BackendJob = Start-Process -FilePath $Python -ArgumentList "-m", "uvicorn", "web.backend.main:app", "--reload", "--port", "8000", "--host", "0.0.0.0" -PassThru -NoNewWindow

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "Starting Next.js frontend on http://localhost:3000 ..." -ForegroundColor Green

Set-Location "$ProjectRoot\web\frontend"
npm run dev

# Cleanup on exit
if ($BackendJob) {
    Stop-Process -Id $BackendJob.Id -ErrorAction SilentlyContinue
}
