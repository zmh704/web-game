@echo off
cd /d "%~dp0"
echo ========================================
echo   Multiplayer server: ws+http port 3000
echo   Game URL: http://127.0.0.1:3000/game.html
echo   Press Ctrl+C to stop.
echo ========================================
node server.js 3000
pause
