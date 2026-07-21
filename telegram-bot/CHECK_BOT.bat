@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "PYTHON=%~dp0.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] .venv не найден. Сначала запустите START_BOT.bat.
    goto :error
)

"%PYTHON%" scripts\check_bot.py
if errorlevel 1 goto :error
exit /b 0

:error
if /I not "%~1"=="--no-pause" pause
exit /b 1
