@echo off
REM Keimenon - MCP Servers Installation Script (Windows)
REM This script installs dependencies for all MCP servers

echo ========================================
echo Keimenon - MCP Servers Setup
echo ========================================
echo.

REM Check Node.js
echo [1/4] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 18+ from https://nodejs.org/
    exit /b 1
)
echo ✓ Node.js found:
node --version
echo.

REM Check npm
echo [2/4] Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    exit /b 1
)
echo ✓ npm found:
npm --version
echo.

REM Install database server dependencies
echo [3/4] Installing database server dependencies...
cd servers\database
if not exist package.json (
    echo ERROR: package.json not found in servers/database
    exit /b 1
)
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install database server dependencies
    exit /b 1
)
echo ✓ Database server dependencies installed
cd ..\..
echo.

REM Install docs server dependencies
echo [4/4] Installing docs server dependencies...
cd servers\docs
if not exist package.json (
    echo ERROR: package.json not found in servers/docs
    exit /b 1
)
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install docs server dependencies
    exit /b 1
)
echo ✓ Docs server dependencies installed
cd ..\..
echo.

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo MCP servers are now ready to use.
echo.
echo Next steps:
echo 1. Ensure the API server is running: cd apps\api && npm run dev
echo 2. Restart VSCode to discover MCP servers
echo 3. Open Claude Code and try: "Get database stats"
echo.
echo For usage instructions, see .mcp\USAGE_GUIDE.md
echo.
pause
