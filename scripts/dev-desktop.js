
const { spawn } = require('child_process');
const net = require('net');

const WEB_PORT = 3000;
const CHECK_INTERVAL_MS = 1000;

function log(prefix, data, isError = false) {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.trim()) {
            const method = isError ? console.error : console.log;
            method(`[${prefix}] ${line}`);
        }
    });
}

function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

async function waitForPort(port) {
    console.log(`Waiting for port ${port} to be ready...`);
    while (true) {
        if (await checkPort(port)) {
            console.log(`Port ${port} is ready!`);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
    }
}

function runCommand(command, args, prefix, cwd = process.cwd()) {
    // Clone env and remove ELECTRON_RUN_AS_NODE to allow Electron to work properly
    // This env var is often set by VSCode or other Electron-based editors
    const cleanEnv = { ...process.env, FORCE_COLOR: 'true' };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;

    const child = spawn(command, args, {
        cwd,
        shell: true,
        stdio: 'pipe',
        env: cleanEnv
    });

    child.stdout.on('data', data => log(prefix, data));
    child.stderr.on('data', data => log(prefix, data, true));

    child.on('close', code => {
        console.log(`[${prefix}] Process exited with code ${code}`);
        process.exit(code || 0);
    });
    
    return child;
}

async function start() {
    console.log('Starting Keimenon Hybrid Dev Mode...');

    // 1. Start Web Server
    console.log('Starting Next.js server...');
    const webProcess = runCommand('npm', ['run', 'dev', '--workspace=@keimenon/web', '--', '-p', '3000', '-H', '127.0.0.1'], 'WEB');

    // 2. Wait for Port 3000
    await waitForPort(WEB_PORT);

    // 3. Start Electron
    console.log('Starting Electron...');
    const electronProcess = runCommand('npm', ['run', 'electron:dev', '--workspace=keimenon-desktop'], 'ELECTRON');
    
    // Handle termination
    const cleanup = () => {
        console.log('Stopping processes...');
        webProcess.kill();
        electronProcess.kill();
        process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

start().catch(console.error);
