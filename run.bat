@echo off
setlocal EnableDelayedExpansion
title Fr3 Man - Standalone Launcher
color 0B
echo ===================================================
echo   Auto-starting: Fr3 Man Web CLI Agent
echo ===================================================
echo.
echo [INFO] IMPORTANT: This application requires Google Chrome or 
echo        Microsoft Edge to function properly.
echo        (It uses the advanced File System Access API)
echo.
cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] First run detected: Installing dependencies...
    call npm install
)

echo [INFO] Searching for an available network port...
:FIND_PORT
:: Get a random port between 8000 and 17000
set /a PORT=(%RANDOM% * 9000 / 32768) + 8000
netstat -ano | findstr /R /C:":%PORT% " >nul
if %ERRORLEVEL% EQU 0 goto FIND_PORT

echo [INFO] Port %PORT% is available.
echo [INFO] Opening browser...
start http://localhost:%PORT%

echo [INFO] Starting the development server on port %PORT%...
npm run dev -- --port %PORT%

pause
