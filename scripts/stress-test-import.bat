@echo off
REM Import Test Runner (Windows Batch Script)
REM Usage: test-import.bat [small|medium|large]

setlocal

set FILE_SIZE=%1
if "%FILE_SIZE%"=="" set FILE_SIZE=small

echo ====================================
echo Import Test Runner
echo ====================================
echo.
echo Test file size: %FILE_SIZE%
echo API Server: http://localhost:4001
echo.

REM Check if API server is running
curl -s http://localhost:4001/health >nul 2>&1
if errorlevel 1 (
    echo ERROR: API server is not running on port 4001
    echo Please start the server first: cd apps\api ^&^& npm run dev
    exit /b 1
)

echo API server is running
echo.

REM Run the test
node test-import.js %FILE_SIZE%

endlocal
