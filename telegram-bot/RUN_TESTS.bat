@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "PYTHON=%~dp0.venv\Scripts\python.exe"

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python 3.12+ не найден.
    pause
    exit /b 1
)
if not exist "%PYTHON%" python -m venv "%~dp0.venv"
"%PYTHON%" -m pip install --disable-pip-version-check --quiet -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Не удалось установить зависимости.
    pause
    exit /b 1
)
"%PYTHON%" -m pytest -q
set "TEST_CODE=%ERRORLEVEL%"
pause
exit /b %TEST_CODE%
