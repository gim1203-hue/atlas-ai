@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Atlas needs Node.js to serve the website. Install Node.js or upload the dist folder to a static website host.
  pause
  exit /b 1
)
node server.cjs --open
pause
