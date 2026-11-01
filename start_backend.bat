@echo off
title MITCF Backend (port 8080)
cd /d %~dp0
echo Starting FastAPI backend on http://localhost:8080 ...
echo API docs: http://localhost:8080/docs
echo.
.venv\Scripts\python.exe -m uvicorn web.backend.main:app --reload --port 8080 --host 0.0.0.0
pause
