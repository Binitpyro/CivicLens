@echo off
echo ===================================================
echo   CivicLens - Starting Local Development Server
echo ===================================================
echo.

cd /d "%~dp0app"

echo Starting Vite Dev Server...
call npm run dev

pause
