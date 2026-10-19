@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist assets\icon.ico (
  echo Chua co file icon - dang tao...
  node_modules\.bin\electron scripts\icon-main.js
)

set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" set "DESKTOP=%USERPROFILE%\OneDrive\Desktop"

powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%DESKTOP%\deadline.lnk');" ^
  "$s.TargetPath = '%~dp0run.bat';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.IconLocation = '%~dp0assets\icon.ico';" ^
  "$s.Description = 'Widget deadline';" ^
  "$s.Save()"

if exist "%DESKTOP%\deadline.lnk" (
  echo Da tao shortcut "deadline" tren desktop.
) else (
  echo Khong tao duoc shortcut - hay chay lai file nay.
)
pause
