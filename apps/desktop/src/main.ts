import { app, BrowserWindow, ipcMain, shell, protocol, net as electronNet } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import * as net from 'net';
import { secureStorage } from './services/secure-storage';
import { FileIngestionService } from './services/ingestion';

console.log('⚡ [Main] Electron Main Process Starting...');

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
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
const DEFAULT_WEB_PORT = Number(process.env.WEB_PORT || 3000);
const DEFAULT_API_PORT = Number(process.env.API_PORT || 4001);
let currentApiPort: number = DEFAULT_API_PORT;

function createWindow(apiPort: number = DEFAULT_API_PORT) {
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
    show: false, // Don't show until ready-to-show
  });

  const isDev = !app.isPackaged && process.env.FORCE_BUNDLED !== 'true';

  if (isDev) {
    mainWindow.loadURL(`http://127.0.0.1:${DEFAULT_WEB_PORT}?apiPort=${apiPort}`);
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
    const reqUrl = request.url;

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

  const skipEmbeddedApi = process.env.KEIMENON_SKIP_EMBEDDED_API === 'true';
  const configuredApiPort = DEFAULT_API_PORT;
  const port = skipEmbeddedApi ? configuredApiPort : await runApiServer(configuredApiPort);
  createWindow(port || configuredApiPort);
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
    createWindow(currentApiPort);
  }
});

// IPC Handlers require a preload script, which we will add next.
// IPC Handlers
ipcMain.handle('app:get-version', () => app.getVersion());

// =============================================================================
// ACCOUNT MANAGEMENT IPC HANDLERS
// =============================================================================

let ingestionService: FileIngestionService | null = null;

/**
 * Get all stored account IDs
 */
ipcMain.handle('auth:get-accounts', async () => {
  return secureStorage.getStoredAccountIds();
});

/**
 * Get the currently active account ID
 */
ipcMain.handle('auth:get-active-account', async () => {
  return secureStorage.getActiveAccountId();
});

/**
 * Switch to a different account
 * Returns the access token for the account if valid
 */
ipcMain.handle('auth:switch-account', async (_, accountId: string) => {
  console.log('[Main] Switching to account:', accountId);

  // Verify we have tokens for this account
  const accessToken = await secureStorage.getAccountToken(accountId, 'access_token');
  if (!accessToken) {
    throw new Error(`No tokens found for account: ${accountId}`);
  }

  // Update active account
  await secureStorage.setActiveAccountId(accountId);

  // Notify renderer of account change
  mainWindow?.webContents.send('account-changed', accountId);

  return { success: true, accountId, accessToken };
});

/**
 * Add a new account after successful login
 * Called by renderer after getting tokens from login endpoint
 */
ipcMain.handle(
  'auth:add-account',
  async (_, accountId: string, accessToken: string, refreshToken?: string) => {
    console.log('[Main] Adding account:', accountId);

    // Store tokens
    await secureStorage.saveAccountToken(accountId, 'access_token', accessToken);
    if (refreshToken) {
      await secureStorage.saveAccountToken(accountId, 'refresh_token', refreshToken);
    }

    // Add to accounts list
    await secureStorage.addAccountToList(accountId);

    // Set as active (new logins become active by default)
    await secureStorage.setActiveAccountId(accountId);

    // Notify renderer
    mainWindow?.webContents.send('account-changed', accountId);

    return { success: true, accountId };
  }
);

/**
 * Logout from a specific account
 * If it's the active account, switches to another available account
 */
ipcMain.handle('auth:logout-account', async (_, accountId: string) => {
  console.log('[Main] Logging out account:', accountId);

  // Clear tokens
  await secureStorage.clearAccountTokens(accountId);

  // Remove from accounts list
  await secureStorage.removeAccountFromList(accountId);

  // If this was the active account, switch to another
  const activeAccountId = await secureStorage.getActiveAccountId();
  if (activeAccountId === accountId) {
    const remainingAccounts = await secureStorage.getStoredAccountIds();
    if (remainingAccounts.length > 0) {
      await secureStorage.setActiveAccountId(remainingAccounts[0]);
      mainWindow?.webContents.send('account-changed', remainingAccounts[0]);
    } else {
      // No accounts left - user needs to login again
      await secureStorage.clearActiveAccountId();
      mainWindow?.webContents.send('account-changed', null);
    }
  }

  return { success: true };
});

/**
 * Clear all locally stored auth state (tokens + account list + active account)
 */
ipcMain.handle('auth:clear-all', async () => {
  await secureStorage.clearAllAuthData();
  mainWindow?.webContents.send('account-changed', null);
  return { success: true };
});

/**
 * Get token for a specific account
 */
ipcMain.handle(
  'auth:get-account-token',
  async (_, accountId: string, key: 'access_token' | 'refresh_token') => {
    return secureStorage.getAccountToken(accountId, key);
  }
);

/**
 * Update token for a specific account (e.g., after refresh)
 */
ipcMain.handle(
  'auth:update-account-token',
  async (_, accountId: string, key: 'access_token' | 'refresh_token', token: string) => {
    await secureStorage.saveAccountToken(accountId, key, token);
    return { success: true };
  }
);

/**
 * Migrate legacy tokens (call on startup)
 */
ipcMain.handle('auth:migrate-legacy', async (_, accountId: string) => {
  return secureStorage.migrateFromLegacyStorage(accountId);
});

// =============================================================================
// LEGACY TOKEN HANDLERS (for backward compatibility)
// =============================================================================

ipcMain.handle('auth:save-token', async (_, key, token) => {
  // For backward compat, save to active account if exists, otherwise global
  const activeAccount = await secureStorage.getActiveAccountId();
  if (activeAccount) {
    return secureStorage.saveAccountToken(activeAccount, key, token);
  }
  return secureStorage.saveToken(key, token);
});

ipcMain.handle('auth:get-token', async (_, key) => {
  // For backward compat, get from active account if exists, otherwise global
  const activeAccount = await secureStorage.getActiveAccountId();
  if (activeAccount) {
    return secureStorage.getAccountToken(activeAccount, key);
  }
  return secureStorage.getToken(key);
});

ipcMain.handle('auth:delete-token', async (_, key) => {
  const activeAccount = await secureStorage.getActiveAccountId();
  if (activeAccount) {
    return secureStorage.deleteAccountToken(activeAccount, key);
  }
  return secureStorage.deleteToken(key);
});

// =============================================================================
// API KEY HANDLERS
// =============================================================================

ipcMain.handle('settings:save-api-key', async (_, provider, apiKey) => {
  return secureStorage.saveApiKey(provider, apiKey);
});

ipcMain.handle('settings:get-api-key', async (_, provider) => {
  return secureStorage.getApiKey(provider);
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
  if (!mainWindow) {
    throw new Error('Main window not initialized');
  }

  if (!ingestionService) {
    ingestionService = new FileIngestionService(mainWindow, currentApiPort);
  } else {
    ingestionService.setApiPort(currentApiPort);
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

async function runApiServer(startPort: number) {
  try {
    const { start: startApiServer } = await import('@keimenon/api');
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'keimenon.db');
    const storagePath = path.join(userDataPath, 'storage');

    // Ensure directories exist
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });

    // Dynamic port selection
    const apiPort = await getAvailablePort(startPort);

    console.log('[Main] Starting Embedded API Server...', { dbPath, apiPort });

    // Inject Dev Auth flag if in dev mode
    if (!app.isPackaged) {
      process.env.ENABLE_DEV_AUTH = 'true';
      process.env.KEIMENON_RUNTIME_SKILLS_DIR = path.join(
        __dirname,
        '../../../agent_context/runtime-skills'
      );
    } else {
      process.env.KEIMENON_RUNTIME_SKILLS_DIR = path.join(
        process.resourcesPath,
        'app.asar/agent_context/runtime-skills'
      );
    }

    await startApiServer({
      port: apiPort,
      sqlitePath: dbPath,
      storagePath: storagePath,
      localDocsPath: userDataPath,
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
