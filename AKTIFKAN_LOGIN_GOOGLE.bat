@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 setup_google.py
) else (
  python setup_google.py
)
pause
endlocal
