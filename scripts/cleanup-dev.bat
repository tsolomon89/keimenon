@echo off
REM Cleanup script for development environment
REM Kills all node processes and cleans up stale resources

echo.
echo ====================================
echo   Dev Environment Cleanup
echo ====================================
echo.

REM Kill all node processes
echo [1/3] Stopping all Node.js processes...
taskkill /F /IM node.exe >nul 2>&1
if errorlevel 1 (
    echo   - No node processes to stop
) else (
    echo   - All node processes stopped
)

REM Wait for processes to fully terminate
timeout /t 2 /nobreak >nul

REM Clean up port locks (optional)
echo.
echo [2/3] Checking for port locks...
for %%p in (3000 3001 4001 5173) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%p') do (
        echo   - Cleaning up port %%p (PID: %%a)
        taskkill /F /PID %%a >nul 2>&1
    )
)

REM Clean up test databases (optional)
echo.
echo [3/3] Cleaning up test databases...
if exist ".test-dbs" (
    for %%f in (.test-dbs\worker-*.db .test-dbs\worker-*.db-wal .test-dbs\worker-*.db-shm) do (
        if exist "%%f" (
            del /Q "%%f" >nul 2>&1
            echo   - Deleted %%f
        )
    )
) else (
    echo   - No test databases to clean
)

echo.
echo ====================================
echo   Cleanup Complete!
echo ====================================
echo.
