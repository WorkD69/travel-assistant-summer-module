@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "ROOT=%~dp0"

if not exist "%ROOT%bot.pid" (
    echo [INFO] bot.pid отсутствует: процесс этого бота не зарегистрирован.
    pause
    exit /b 0
)

set /p BOT_PID=<"%ROOT%bot.pid"
echo Проверяю процесс PID=%BOT_PID% ...
powershell -NoProfile -Command "$root = [IO.Path]::GetFullPath('%ROOT%'); $p = Get-CimInstance Win32_Process -Filter 'ProcessId = %BOT_PID%' -ErrorAction SilentlyContinue; if (-not $p) { exit 2 }; if ($p.ExecutablePath -notlike ($root + '*') -or $p.CommandLine -notlike '*-m app.bot*') { exit 3 }; Stop-Process -Id %BOT_PID% -Force; exit 0"
set "STOP_CODE=%ERRORLEVEL%"

if "%STOP_CODE%"=="0" (
    del /q "%ROOT%bot.pid" >nul 2>nul
    echo [OK] Процесс Telegram-бота остановлен.
    pause
    exit /b 0
)
if "%STOP_CODE%"=="2" (
    del /q "%ROOT%bot.pid" >nul 2>nul
    echo [INFO] Процесс уже завершён; устаревший bot.pid удалён.
    pause
    exit /b 0
)

echo [ERROR] PID принадлежит не этому проекту. Процесс не был остановлен.
echo Удалите bot.pid вручную только после проверки.
pause
exit /b 1
