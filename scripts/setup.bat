@echo off
REM Keimenon - Quick Setup Script
REM This script streamlines the initial setup process

echo.
echo ========================================
echo   Keimenon - Quick Setup
echo ========================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found! Please install Node.js 18+ from nodejs.org
    pause
    exit /b 1
)

REM Check npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm not found! Please install npm 9+
    pause
    exit /b 1
)

echo [OK] Node.js and npm are installed
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo [STEP 1/4] Installing dependencies...
    echo This may take 2-3 minutes...
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [SKIP] Dependencies already installed
)
echo.

REM Create .env files if they don't exist
echo [STEP 2/4] Setting up environment files...

if not exist "apps\web\.env.local" (
    copy "apps\web\.env.example" "apps\web\.env.local" >nul
    echo [OK] Created apps\web\.env.local
) else (
    echo [SKIP] apps\web\.env.local already exists
)

if not exist "apps\api\.env" (
    copy "apps\api\.env.example" "apps\api\.env" >nul
    echo [OK] Created apps\api\.env
) else (
    echo [SKIP] apps\api\.env already exists
)
echo.

REM Prompt for Neo4j configuration
echo [STEP 3/4] Configure Neo4j Database
echo.
echo Choose your Neo4j setup:
echo   1. Neo4j Aura (Cloud - Free, No Docker) [RECOMMENDED]
echo   2. Local Docker (Requires Docker Desktop)
echo   3. Skip configuration (I'll do it manually)
echo.
set /p neo4j_choice="Enter choice (1-3): "

if "%neo4j_choice%"=="1" (
    echo.
    echo Neo4j Aura Setup:
    echo   1. Go to https://console.neo4j.io/
    echo   2. Sign up for free ^(no credit card required^)
    echo   3. Create a new free instance
    echo   4. Copy your connection details
    echo.
    set /p neo4j_uri="Enter Neo4j URI (e.g., neo4j+s://xxxxx.databases.neo4j.io): "
    set /p neo4j_user="Enter Neo4j Username (default: neo4j): "
    if "%neo4j_user%"=="" set neo4j_user=neo4j
    set /p neo4j_password="Enter Neo4j Password: "

    REM Update .env file
    powershell -Command "(Get-Content apps\api\.env) -replace 'NEO4J_URI=.*', 'NEO4J_URI=!neo4j_uri!' | Set-Content apps\api\.env"
    powershell -Command "(Get-Content apps\api\.env) -replace 'NEO4J_USER=.*', 'NEO4J_USER=!neo4j_user!' | Set-Content apps\api\.env"
    powershell -Command "(Get-Content apps\api\.env) -replace 'NEO4J_PASSWORD=.*', 'NEO4J_PASSWORD=!neo4j_password!' | Set-Content apps\api\.env"

    echo [OK] Neo4j configuration updated
) else if "%neo4j_choice%"=="2" (
    echo.
    echo Starting Neo4j Docker container...
    docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.19
    if errorlevel 1 (
        echo [ERROR] Failed to start Docker container. Is Docker Desktop running?
        echo You can start it manually later with:
        echo   docker run -d --name neo4j -p 7474:7474 -p 7687:7687 -e NEO4J_AUTH=neo4j/testpassword neo4j:5.19
    ) else (
        echo [OK] Neo4j container started
        powershell -Command "(Get-Content apps\api\.env) -replace 'NEO4J_PASSWORD=.*', 'NEO4J_PASSWORD=testpassword' | Set-Content apps\api\.env"
        echo [OK] Neo4j configuration updated for local Docker
    )
) else (
    echo [SKIP] Neo4j configuration skipped
    echo Remember to edit apps\api\.env with your Neo4j credentials
)
echo.

REM Build packages
echo [STEP 4/4] Building packages...
call npm run build >nul 2>&1
if errorlevel 1 (
    echo [WARN] Some packages failed to build, but core packages may be ready
) else (
    echo [OK] All packages built successfully
)
echo.

echo ========================================
echo   Setup Complete!
echo ========================================
echo.
echo Next steps:
echo   1. Start the app: npm run dev
echo   2. Open browser: http://localhost:3000
echo   3. API endpoint: http://localhost:3001
echo.
echo To manually configure Neo4j, edit: apps\api\.env
echo.
echo Press any key to exit...
pause >nul
