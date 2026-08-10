'use strict';

/**
 * Cubical — Electron main process
 * Runs in Node.js (CommonJS). Loads the built Vite output from dist/public/.
 */

const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const isDev = process.env.ELECTRON_DEV === 'true';

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    title: 'Cubical',
    backgroundColor: '#FAF7F3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'public', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// ─── File Finder — search helpers ────────────────────────────────────────────

// Directories that are never useful to recurse into when searching user files.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.cache',
  '$RECYCLE.BIN', 'System Volume Information', '$WinREAgent',
  'Recovery', 'PerfLogs', 'Windows', 'Program Files',
  'Program Files (x86)', 'ProgramData',
]);

function getCommonFolders() {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    path.join(home, 'Pictures'),
    path.join(home, 'Videos'),
    path.join(home, 'Music'),
  ].filter((f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } });
}

function resolveSearchFolders(folders) {
  if (folders.length === 1 && folders[0] === '__COMMON_FOLDERS__') return getCommonFolders();
  if (folders.length === 1 && folders[0] === '__ALL_DRIVES__') {
    if (process.platform === 'win32') {
      const drives = [];
      for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
        try { fs.accessSync(`${l}:\\`); drives.push(`${l}:\\`); } catch { /* drive absent */ }
      }
      return drives.length > 0 ? drives : getCommonFolders();
    }
    return [os.homedir()]; // Non-Windows fallback
  }
  return folders.filter((f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } });
}

// ─── File Finder — async search engine ───────────────────────────────────────

let activeSearchId = 0; // Increment to cancel any in-progress search
const MAX_RESULTS  = 500;
const MAX_DEPTH    = 12;

async function walkDir(dir, query, searchId, results, sendProgress, depth) {
  if (activeSearchId !== searchId) return;
  if (depth > MAX_DEPTH)           return;
  if (results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch { return; /* permission denied or path gone */ }

  for (const entry of entries) {
    if (activeSearchId !== searchId) return;
    if (results.length >= MAX_RESULTS) return;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      await walkDir(fullPath, query, searchId, results, sendProgress, depth + 1);
    } else if (entry.isFile()) {
      if (entry.name.toLowerCase().includes(query.toLowerCase())) {
        try {
          const stat = await fs.promises.stat(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            dir,
            size: stat.size,
            modified: stat.mtimeMs,
            ext: path.extname(entry.name).toLowerCase(),
          });
          // Send a progress update every 25 new results
          if (results.length % 25 === 0) sendProgress({ found: results.length, scanning: dir });
        } catch { /* file gone or no permission */ }
      }
    }
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.on('file-finder:start', async (event, { query, folders }) => {
  const searchId = ++activeSearchId;
  const sender   = event.sender;

  const send = (channel, data) => { if (!sender.isDestroyed()) sender.send(channel, data); };

  const resolvedFolders = resolveSearchFolders(folders ?? ['__COMMON_FOLDERS__']);
  const results = [];

  send('file-finder:progress', { found: 0, scanning: 'Starting…' });

  for (const folder of resolvedFolders) {
    if (activeSearchId !== searchId) break;
    send('file-finder:progress', { found: results.length, scanning: folder });
    await walkDir(folder, query, searchId, results, (prog) => send('file-finder:progress', prog), 0);
  }

  if (activeSearchId === searchId) {
    send('file-finder:complete', { results });
  }
});

ipcMain.on('file-finder:cancel', () => { activeSearchId++; });

ipcMain.handle('file-finder:open-file', async (_event, filePath) => {
  const err = await shell.openPath(filePath);
  if (err) console.error('[file-finder] openPath error:', err);
});

ipcMain.handle('file-finder:open-location', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('file-finder:choose-folder', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose a folder to search in Cubical',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
