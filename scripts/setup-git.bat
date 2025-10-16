@echo off
REM Git setup script for Canvas Memory OS (Windows)

echo Setting up Git for Canvas Memory OS...
echo.

REM Check if Git is installed
where git >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Git is not installed. Please install Git first.
    exit /b 1
)

REM Check if we're in a Git repository
if not exist .git (
    echo Error: Not a Git repository. Please run 'git init' first.
    exit /b 1
)

echo Git repository detected
echo.

REM Configure commit template
echo Configuring commit message template...
git config commit.template .gitmessage
echo Commit template configured
echo.

REM Configure pull strategy
echo Configuring pull strategy...
git config pull.rebase true
echo Pull strategy set to rebase
echo.

REM Enable color output
echo Enabling color output...
git config color.ui auto
echo Color output enabled
echo.

REM Configure default branch name
echo Configuring default branch name...
git config init.defaultBranch main
echo Default branch set to 'main'
echo.

REM Check user configuration
git config user.name >nul 2>nul
if %errorlevel% neq 0 (
    echo Warning: Git user not configured
    echo.
    echo Please configure your Git identity:
    echo   git config --global user.name "Your Name"
    echo   git config --global user.email "your.email@example.com"
    echo.
) else (
    echo Git user configured
    echo.
)

REM Install dependencies and Git hooks
echo Installing dependencies and Git hooks...
call npm install
echo Dependencies and hooks installed
echo.

echo Git setup complete!
echo.
echo Next steps:
echo 1. Review CONTRIBUTING.md for workflow guidelines
echo 2. Create a feature branch: git checkout -b feature/your-feature
echo 3. Make changes and commit using the template
echo 4. Push and create a pull request
echo.
echo For detailed workflow, see: docs/GIT_WORKFLOW.md
