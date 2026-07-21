@echo off
chcp 65001 >nul
setlocal

echo ============================================
echo   Тревел-помощник — локальный предпросмотр
echo ============================================
echo.

cd /d "%~dp0"

set PY=
where py >nul 2>nul && set PY=py
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY where python3 >nul 2>nul && set PY=python3

if not defined PY (
  echo [Ошибка] Python не найден.
  echo Установите Python с https://www.python.org/downloads/
  echo и запустите этот файл снова.
  pause
  exit /b 1
)

echo Запускаю локальный сервер: http://localhost:8000/index.html
echo Чтобы остановить сервер, закройте это окно или нажмите Ctrl+C.
echo.

start "" "http://localhost:8000/index.html"
%PY% -m http.server 8000
