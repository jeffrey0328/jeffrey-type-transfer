@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Command codex -ErrorAction SilentlyContinue) { exit 0 }; exit 1"
if errorlevel 1 (
  echo [ERROR] Codex CLI was not found. Install it and reopen this window.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& codex login status *> $null; exit $LASTEXITCODE"
if errorlevel 1 (
  echo Codex is not logged in or the session has expired. Starting device login...
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& codex login --device-auth; exit $LASTEXITCODE"
  if errorlevel 1 (
    echo [ERROR] Codex device login did not complete. Finish the browser login and retry.
    pause
    exit /b 1
  )
)

echo Starting the localhost-only Codex bridge service...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (
  echo [ERROR] The localhost bridge service failed to start. Review the error above.
  pause
  exit /b 1
)
