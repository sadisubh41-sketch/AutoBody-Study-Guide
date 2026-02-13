@echo off
:: Creates a desktop shortcut for AutoBody Study Guide

set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_NAME=AutoBody Study Guide"
set "TARGET=%SCRIPT_DIR%RUN.bat"
set "ICON=%SCRIPT_DIR%public\favicon.ico"
set "DESKTOP=%USERPROFILE%\Desktop"

echo Creating desktop shortcut...

powershell -NoProfile -Command ^
  "$ws = New-Object -ComObject WScript.Shell; ^
   $sc = $ws.CreateShortcut('%DESKTOP%\%SHORTCUT_NAME%.lnk'); ^
   $sc.TargetPath = '%TARGET%'; ^
   $sc.WorkingDirectory = '%SCRIPT_DIR%'; ^
   $sc.Description = 'Auto Body Technician Red Seal Study Guide'; ^
   if (Test-Path '%ICON%') { $sc.IconLocation = '%ICON%' }; ^
   $sc.Save()"

if %ERRORLEVEL% equ 0 (
    echo.
    echo Shortcut created successfully on your Desktop!
    echo Look for "%SHORTCUT_NAME%" on your Desktop.
) else (
    echo.
    echo Failed to create shortcut. Please try running as administrator.
)

echo.
pause
