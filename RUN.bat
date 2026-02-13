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

:: Ensure PostgreSQL is running
echo Checking PostgreSQL...
pg_isready >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Starting PostgreSQL service...
    net start postgresql-x64-17 >nul 2>&1
    timeout /t 3 /nobreak >nul
    pg_isready >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo WARNING: PostgreSQL may not be running. Progress sync across browsers may not work.
        echo You can start it manually: net start postgresql-x64-17
        echo.
    ) else (
        echo PostgreSQL is ready.
    )
) else (
    echo PostgreSQL is ready.
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
echo   Progress syncs across all browsers.
echo   Press Ctrl+C to stop.
echo ============================================
echo.

:: Keep window open
pause
