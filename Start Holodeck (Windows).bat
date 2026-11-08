@echo off
rem Double-click to play Holodeck on Windows (needs Node.js from https://nodejs.org).
title Holodeck
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org, then double-click this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: installing, about a minute...
  call npm install
  if errorlevel 1 (
    echo Install failed.
    pause
    exit /b 1
  )
)
echo Starting Holodeck... your browser will open in a moment. Leave this window open while you play.
call npm run dev -- --open --host --port 5175
pause
