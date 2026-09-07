import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } = require('electron');


import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initDB } from './database/schema';
import { startPollingEngine } from './workers/polling';
import { startScheduler } from './workers/scheduler';
import { registerIpcHandlers } from './ipc-handlers';

// ✅ ESM Path Resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// State
let mainWindow: any = null;
let tray: any = null;
let isQuitting = false;
let pendingDeepLinkUrl: string | null = null;

// ✅ Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

// Register Custom Protocol (Deep Linking)
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('fluxdm', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('fluxdm');
}

async function handleDeepLink(rawUrl: string) {
  try {
    console.log('🔗 Handling deep link:', rawUrl);
    if (!rawUrl || !rawUrl.startsWith('fluxdm:')) return;

    // Normalizing URL for standard URL parser (e.g. fluxdm://payment-success?session_id=... -> https://fluxdm.app/payment-success?...)
    const urlObj = new URL(rawUrl.replace('fluxdm://', 'https://fluxdm.app/'));
    const action = urlObj.pathname.replace('/', '') || urlObj.host;

    if (action === 'payment-success') {
      const sessionId = urlObj.searchParams.get('session_id');
      if (sessionId) {
        console.log('💳 Processing payment success for session:', sessionId);
        const { verifyAndActivateSession } = await import('./licensing/dodo');
        const result = await verifyAndActivateSession(sessionId);
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('licensing:payment-success', { sessionId, ...result });
        }
      }
    }

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('Failed to process deep link:', err);
  }
}

if (!gotTheLock) {
  app.quit();
} else {
  // Second Instance Behavior (Windows / Linux deep links)
  app.on('second-instance', (_event: any, commandLine: string[]) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }

    const deepLink = commandLine.find((arg: string) => arg.startsWith('fluxdm://'));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
  });

  // macOS Deep Link Handling
  app.on('open-url', (event: any, url: string) => {
    event.preventDefault();
    if (mainWindow) {
      handleDeepLink(url);
    } else {
      pendingDeepLinkUrl = url;
    }
  });

  // ✅ App Initialization
  app.whenReady().then(async () => {
    console.log('🚀 FluxDM Starting...');

    try {
      // Database & Workers
      initDB();
      await startPollingEngine();
      await startScheduler();
      registerIpcHandlers();

      createWindow();
      createTray();

      if (pendingDeepLinkUrl) {
        handleDeepLink(pendingDeepLinkUrl);
        pendingDeepLinkUrl = null;
      }

      // Check initial launch args on Windows/Linux
      const initialDeepLink = process.argv.find((arg: string) => arg.startsWith('fluxdm://'));
      if (initialDeepLink) {
        handleDeepLink(initialDeepLink);
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    } catch (error) {
      console.error('❌ Fatal error during app initialization:', error);
      // Don't quit, just log the error
    }
  });

  // Prevent app from crashing on uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Handle window close behavior
  app.on('window-all-closed', () => {
    // On macOS it's common for applications to stay open until the user explicitly quits
    if (process.platform !== 'darwin') {
      // On Windows/Linux, keep the app running in the system tray
      console.log('ℹ️ All windows closed, but app is still running in system tray');
      // Don't quit - the app will run in the background via the tray
    }
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs');

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 1024,
    minHeight: 768,
    show: true,
    title: 'FluxDM Automation',
    icon: path.join(process.env.PUBLIC || path.join(__dirname, '../../public'), 'vite.svg'),
    autoHideMenuBar: true, // Hide default menu in production
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open DevTools only in dev mode (packaged app shouldn't show it by default)
  if (!app.isPackaged && !process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // External Links
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // ✅ Window Close Behavior (Minimize to Tray)
  mainWindow.on('close', (event: any) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    return true;
  });
}

function createTray() {
  const iconPath = path.join(process.env.PUBLIC || path.join(__dirname, '../../public'), 'vite.svg');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('FluxDM Execution Engine');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'FluxDM Active 🟢', enabled: false },
    { type: 'separator' },
    {
      label: 'Open FluxDM',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// Global Handlers
ipcMain.handle('get-app-version', () => app.getVersion());