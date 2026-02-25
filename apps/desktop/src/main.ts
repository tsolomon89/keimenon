
import { app, BrowserWindow, ipcMain, shell, protocol, net as electronNet } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as url from 'url';
import * as net from 'net';
import { secureStorage } from './services/secure-storage';
import { FileIngestionService } from './services/ingestion';
import { start as startApiServer } from '@keimenon/api';

console.log('⚡ [Main] Electron Main Process Starting...');

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Ideally we don't exit, but if it's critical we might have to.
    // For native module lookup failures, we generally want to survive.
});

process.on('unhandledRejection', (reason: any, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line @typescript-eslint/no-var-requires
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let currentApiPort: number = 4001;

function createWindow(apiPort: number = 4001) {
  currentApiPort = apiPort;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: false, // Re-enable for app:// protocol
    },
    title: 'Keimenon',
    show: false // Don't show until ready-to-show
  });

  const isDev = !app.isPackaged && process.env.FORCE_BUNDLED !== 'true';
  
  if (isDev) {
    mainWindow.loadURL(`http://127.0.0.1:3000?apiPort=${apiPort}`);
    mainWindow.webContents.openDevTools();
  } else {
    // Determine the path to web-dist
    let webDistPath = path.join(process.resourcesPath, 'web-dist');
    if (!fs.existsSync(path.join(webDistPath, 'index.html'))) {
         // Fallback for dev/test environment
         webDistPath = path.join(__dirname, '../resources/web-dist');
    }

    // Pass configuration via query params (still useful for API port)
    const queryParams: any = { apiPort: apiPort.toString() };
    if (process.env.ENABLE_DEV_AUTH === 'true' || process.env.NODE_ENV === 'development') {
        queryParams.dev = 'true';
    }
    const queryString = new URLSearchParams(queryParams).toString();

    // Load via custom protocol
    mainWindow.loadURL(`app://keimenon/index.html?${queryString}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow app:// and devtools, deny http/https and open externally
    if (url.startsWith('http') || url.startsWith('https')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// App Lifecycle
async function startApp() {
    await app.whenReady();

    // Handle 'app://' protocol
    protocol.handle('app', (request) => {
        let reqUrl = request.url;
        
        // Normalize URL: remove 'app://keimenon'
        // Handle query parameters which might be attached to index.html
        const u = new URL(reqUrl);
        let pathname = u.pathname;

        // If root, serve index.html
        if (pathname === '/' || pathname === '') {
            pathname = '/index.html';
        }

        // Determine base path for web resources
        let webDistPath = path.join(process.resourcesPath, 'web-dist');
        if (!fs.existsSync(path.join(webDistPath, 'index.html'))) {
             webDistPath = path.join(__dirname, '../resources/web-dist');
        }

        // Construct file path
        // Decode URI components (handle spaces etc)
        const filePath = path.join(webDistPath, decodeURIComponent(pathname));

        // Security check: ensure filePath is within webDistPath
        if (!filePath.startsWith(webDistPath)) {
             return new Response('Access Denied', { status: 403 });
        }

        // Handle Next.js Static Export routing (Trailing Slash / Index fallback)
        // If file doesn't exist, check if it's a directory asking for index.html
        // OR if it's a client-side route that needs to fallback to the HTML file matches
        if (!fs.existsSync(filePath)) {
            // Check for /index.html variant (e.g. /login -> /login/index.html)
            const htmlPath = path.join(filePath, 'index.html');
        // ... matches ...
             if (fs.existsSync(htmlPath)) {
                return electronNet.fetch(url.pathToFileURL(htmlPath).toString());
             }
             
             // Check for .html extension (e.g. /login -> /login.html)
             const extPath = filePath + '.html';
             if (fs.existsSync(extPath)) {
                return electronNet.fetch(url.pathToFileURL(extPath).toString());
             }

             // 404
             return new Response('Not Found', { status: 404 });
        }

        return electronNet.fetch(url.pathToFileURL(filePath).toString());
    });

    const port = await runApiServer();
    createWindow(port || 4001);
}
startApp();

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
      // If re-activating, we might not have the port handy easily unless stored global.
      // For simplicity, we assume the server is already running.
      // Ideally runApiServer is idempotent or we store the port.
      createWindow(4001); // Fallback or store in a global var
  }
});


// IPC Handlers require a preload script, which we will add next.
// IPC Handlers
ipcMain.handle('app:get-version', () => app.getVersion());

// Secure Storage IPC
// Secure Storage IPC

let ingestionService: FileIngestionService | null = null;

ipcMain.handle('auth:save-token', async (_, key, token) => {
    return secureStorage.saveToken(key, token);
});

ipcMain.handle('settings:delete-api-key', async (_, provider) => {
    return secureStorage.deleteApiKey(provider);
});

ipcMain.handle('app:open-data-folder', async () => {
    const userDataPath = app.getPath('userData');
    await shell.openPath(userDataPath);
    return userDataPath;
});

// Ingestion IPC
ipcMain.handle('ingest:start', async (_, filePath) => {
    if (!ingestionService && mainWindow) {
        ingestionService = new FileIngestionService(mainWindow);
    }
    if (ingestionService) {
        return ingestionService.ingestFile(filePath);
    }
    throw new Error('Ingestion service not initialized');
});

// Start Embedded API Server
// Start Embedded API Server

async function getAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        resolve(getAvailablePort(startPort + 1));
      } else {
        reject(err);
      }
    });
    server.listen(startPort, () => {
      server.close(() => {
        resolve(startPort);
      });
    });
  });
}



async function runApiServer() {
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'keimenon.db');
    const storagePath = path.join(userDataPath, 'storage');
    
    // Ensure directories exist
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });

    // Dynamic port selection
    const apiPort = await getAvailablePort(4001);
    
    console.log('[Main] Starting Embedded API Server...', { dbPath, apiPort });
    
    // Inject Dev Auth flag if in dev mode
    if (!app.isPackaged) {
      process.env.ENABLE_DEV_AUTH = 'true';
    }

    await startApiServer({
      port: apiPort,
      sqlitePath: dbPath,
      storagePath: storagePath,
      localDocsPath: userDataPath
    });

    console.log(`[Main] Embedded API Server started successfully on port ${apiPort}`);
    
    return apiPort;
  } catch (err: any) {
    console.error('[Main] ❌ CRITICAL: Failed to start Embedded API Server:', err);
    // Log full stack trace
    if (err.stack) console.error(err.stack);
    
    return null;
  }
}
