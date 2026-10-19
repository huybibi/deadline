@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Lan dau chay - dang cai dat, vui long doi...
  call npm install
)
start "deadline" /min cmd /c "npm start"
