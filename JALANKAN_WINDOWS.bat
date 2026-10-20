@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title SECOND IN - ETP 5 - REVISI 8
if not exist "start_secondin.py" (
  echo Ekstrak SEMUA isi ZIP dahulu, lalu jalankan file ini dari folder hasil ekstrak.
  pause
  exit /b 1
)
echo =======================================
echo   SECOND IN - ETP 5 - REVISI 8 - BERANDA BARU
echo =======================================
echo Web akan dibuka otomatis di browser.
echo Alamat versi lama tidak dipakai.
echo.
where py >nul 2>nul
if not errorlevel 1 (
  py -3 start_secondin.py
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    python start_secondin.py
  ) else (
    echo Python belum ditemukan. Pasang Python 3.10 atau lebih baru.
  )
)
echo.
echo Terminal berhenti. Jika ada pesan kesalahan, kirimkan teks pesan itu.
pause
endlocal
