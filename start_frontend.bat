@echo off
title MITCF Frontend (port 3000)
cd /d %~dp0\web\frontend
echo Starting Next.js frontend on http://localhost:3000 ...
echo.
npm run dev
pause
