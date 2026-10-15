@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 reset_demo.py
) else (
  python reset_demo.py
)
pause
