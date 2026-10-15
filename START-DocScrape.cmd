@echo off
cd /d "%~dp0"
echo Starting DocScrape AI. Open http://localhost:5173
call npm.cmd run dev
pause
