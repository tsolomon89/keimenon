@echo off
setlocal enabledelayedexpansion

echo ==================================================
echo Keimenon Setup (Local-Only)
echo ==================================================

echo [1/3] Ensuring apps\api\.env exists
if not exist "apps\api\.env" (
  if exist "apps\api\.env.example" (
    copy "apps\api\.env.example" "apps\api\.env" >nul
    echo [OK] Created apps\api\.env from template
  ) else (
    echo [ERROR] apps\api\.env.example not found
    exit /b 1
  )
) else (
  echo [OK] apps\api\.env already exists
)

echo [2/3] Ensuring apps\web\.env.local exists
if not exist "apps\web\.env.local" (
  if exist "apps\web\.env.example" (
    copy "apps\web\.env.example" "apps\web\.env.local" >nul
    echo [OK] Created apps\web\.env.local from template
  ) else (
    echo [WARN] apps\web\.env.example not found (skipping)
  )
) else (
  echo [OK] apps\web\.env.local already exists
)

echo [3/3] Installing dependencies
npm install
if errorlevel 1 (
  echo [ERROR] npm install failed
  exit /b 1
)

echo.
echo [DONE] Setup complete.
echo Run: npm run dev
exit /b 0
