@echo off
cd /d "%~dp0"

echo ============================================
echo   AutoBody Study Guide - Starting...
echo ============================================
echo.

:: Check if node_modules exists
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

:: Start Express server in background
echo Starting Express server on port 3000...
start /B cmd /c "npx tsx server/index.ts"

:: Start Vite dev server in background
echo Starting Vite dev server on port 5173...
start /B cmd /c "npm run dev"

:: Wait for servers to initialize
echo.
echo Waiting for servers to start...
timeout /t 4 /nobreak >nul

:: Open browser
echo Opening browser...
start "" "http://localhost:5173"

echo.
echo ============================================
echo   App is running!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3000
echo   Press Ctrl+C to stop.
echo ============================================
echo.

:: Keep window open
pause
