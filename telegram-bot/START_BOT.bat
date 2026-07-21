@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "PYTHONUTF8=1"
cd /d "%~dp0"
set "ROOT=%~dp0"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"
set "STDOUT_LOG=%ROOT%logs\bot.stdout.log"
set "STDERR_LOG=%ROOT%logs\bot.stderr.log"

echo ============================================
echo  Travel Assistant Telegram Bot - START
echo ============================================

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python не найден. Установите Python 3.12+ и добавьте его в PATH.
    pause
    exit /b 1
)

python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)"
if errorlevel 1 (
    echo [ERROR] Требуется Python 3.12 или новее.
    pause
    exit /b 1
)

if not exist "%PYTHON%" (
    echo [1/6] Создаю виртуальное окружение .venv ...
    python -m venv "%ROOT%.venv"
    if errorlevel 1 goto :failure
) else (
    echo [1/6] Виртуальное окружение уже существует.
)

echo [2/6] Устанавливаю зависимости ...
"%PYTHON%" -m pip install --disable-pip-version-check --quiet --upgrade pip
if errorlevel 1 goto :failure
"%PYTHON%" -m pip install --disable-pip-version-check --quiet -r "%ROOT%requirements.txt"
if errorlevel 1 goto :failure

if not exist "%ROOT%.env" (
    if /I "%~1"=="--check-only" (
        echo [3/6] .env отсутствует; check-only использует переменные текущего процесса.
        goto :check_config
    )
    echo [3/6] Создаю .env из .env.example ...
    copy "%ROOT%.env.example" "%ROOT%.env" >nul
    echo [ACTION REQUIRED] Вставьте TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME в .env.
    pause
    exit /b 1
) else (
    echo [3/6] Файл .env найден.
)

:check_config
echo [4/6] Выполняю offline-проверку ...
call "%ROOT%CHECK_BOT.bat" --no-pause
if errorlevel 1 goto :failure
if /I "%~1"=="--check-only" (
    echo [OK] START_BOT.bat прошёл check-only; polling не запускался.
    exit /b 0
)

if exist "%ROOT%bot.pid" (
    set /p EXISTING_PID=<"%ROOT%bot.pid"
    powershell -NoProfile -Command "if (Get-Process -Id %EXISTING_PID% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
    if not errorlevel 1 (
        echo [INFO] Бот уже запущен, PID=%EXISTING_PID%.
        echo Логи: "%STDOUT_LOG%" и "%STDERR_LOG%"
        pause
        exit /b 0
    )
    del /q "%ROOT%bot.pid" >nul 2>nul
)

echo [5/6] Подготавливаю каталог логов ...
if not exist "%ROOT%logs" mkdir "%ROOT%logs"

echo [6/6] Запускаю python -m app.bot через long polling ...
powershell -NoProfile -Command "$p = Start-Process -FilePath '%PYTHON%' -ArgumentList '-m','app.bot' -WorkingDirectory '%ROOT%' -WindowStyle Hidden -RedirectStandardOutput '%STDOUT_LOG%' -RedirectStandardError '%STDERR_LOG%' -PassThru; Set-Content -LiteralPath '%ROOT%bot.pid' -Value $p.Id -NoNewline -Encoding Ascii; [Environment]::Exit(0)"
if errorlevel 1 goto :failure
if not exist "%ROOT%bot.pid" goto :failure
set /p BOT_PID=<"%ROOT%bot.pid"
if not defined BOT_PID goto :failure

powershell -NoProfile -Command "Start-Sleep -Milliseconds 1500; if (Get-Process -Id %BOT_PID% -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 (
    echo [ERROR] Процесс завершился сразу после запуска.
    echo Проверьте лог: "%STDERR_LOG%"
    del /q "%ROOT%bot.pid" >nul 2>nul
    pause
    exit /b 1
)

echo [OK] Бот запущен. PID=%BOT_PID%
echo Логи: "%STDOUT_LOG%" и "%STDERR_LOG%"
echo Для остановки используйте STOP_BOT.bat.
pause
exit /b 0

:failure
echo.
echo [ERROR] Запуск не выполнен. Исправьте ошибку выше и повторите START_BOT.bat.
echo Логи запуска находятся в "%ROOT%logs".
pause
exit /b 1
