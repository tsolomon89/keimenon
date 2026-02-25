/**
 * Clean Install Script
 * 
 * This script ensures a clean dependency installation by:
 * 1. Killing any running node/electron processes that might lock files
 * 2. Deleting node_modules folders
 * 3. Running npm install
 * 
 * Usage: node scripts/clean-install.js
 * 
 * This prevents the "Access is denied" and stuck dependency issues
 * caused by zombie processes holding file locks.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Folders to clean
const FOLDERS_TO_CLEAN = [
    path.join(ROOT_DIR, 'node_modules'),
    path.join(ROOT_DIR, 'apps', 'api', 'node_modules'),
    path.join(ROOT_DIR, 'apps', 'web', 'node_modules'),
    path.join(ROOT_DIR, 'apps', 'desktop', 'node_modules'),
    path.join(ROOT_DIR, 'apps', 'desktop-e2e', 'node_modules'),
];

// Processes to kill (Windows-specific)
const PROCESSES_TO_KILL = ['node.exe', 'electron.exe'];

function log(message) {
    console.log(`[clean-install] ${message}`);
}

function killProcesses() {
    if (process.platform !== 'win32') {
        log('Skipping process kill on non-Windows platform');
        return;
    }

    log('Terminating potentially blocking processes...');
    for (const proc of PROCESSES_TO_KILL) {
        try {
            execSync(`taskkill /F /IM ${proc} /T 2>nul`, { stdio: 'ignore' });
            log(`  Killed ${proc}`);
        } catch (e) {
            // Process not found is fine
        }
    }
    // Give Windows time to release file handles
    log('Waiting for file handles to release...');
    execSync('timeout /t 2 /nobreak >nul', { stdio: 'inherit' });
}

function deleteFolders() {
    log('Deleting node_modules folders...');
    for (const folder of FOLDERS_TO_CLEAN) {
        if (fs.existsSync(folder)) {
            try {
                // Use cmd /c rmdir for better Windows compatibility
                execSync(`cmd /c "rmdir /s /q "${folder}""`, { stdio: 'inherit' });
                log(`  Deleted ${path.relative(ROOT_DIR, folder)}`);
            } catch (e) {
                log(`  WARNING: Could not delete ${path.relative(ROOT_DIR, folder)}: ${e.message}`);
            }
        }
    }
}

function deleteLockFile() {
    const lockFile = path.join(ROOT_DIR, 'package-lock.json');
    if (fs.existsSync(lockFile)) {
        try {
            fs.unlinkSync(lockFile);
            log('Deleted package-lock.json');
        } catch (e) {
            log(`WARNING: Could not delete package-lock.json: ${e.message}`);
        }
    }
}

function runInstall() {
    log('Running npm install...');
    const result = spawn('npm', ['install'], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
        shell: true
    });

    result.on('close', (code) => {
        if (code === 0) {
            log('✅ Clean install completed successfully!');
        } else {
            log(`❌ npm install failed with exit code ${code}`);
            process.exit(code);
        }
    });
}

// Main
log('Starting clean install process...');
killProcesses();
deleteFolders();
// Note: We keep package-lock.json by default to preserve exact versions
// Uncomment the next line if you want a completely fresh resolution:
// deleteLockFile();
runInstall();
