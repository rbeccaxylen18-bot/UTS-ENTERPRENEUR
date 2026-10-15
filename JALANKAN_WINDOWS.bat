@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =======================================
echo   SECOND IN - DEMO UTS
echo =======================================
echo.
echo Setelah server jalan, buka di Chrome:
echo     http://127.0.0.1:8000
echo.
echo Jangan tutup jendela ini selama presentasi.
echo Tekan Ctrl+C untuk menghentikan.
echo.
where py >nul 2>nul
if %ERRORLEVEL%==0 (
  py -3 server.py
) else (
  python server.py
)
echo.
echo Server berhenti. Tekan tombol untuk menutup.
pause >nul
