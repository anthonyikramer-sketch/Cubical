'use strict';

/**
 * Cubical — Electron main process
 * Runs in Node.js (CommonJS). Loads the built Vite output from dist/public/.
 */

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Set when launching via `electron:dev` script (loads Vite dev server instead of built files)
const isDev = process.env.ELECTRON_DEV === 'true';

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    title: 'Cubical',
    backgroundColor: '#FAF7F3', // matches --background in index.css; prevents white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,  // keep renderer sandboxed
      webSecurity: true,
    },
  });

  if (isDev) {
    // Development: point at Vite dev server
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    // Production: load from the built output folder
    win.loadFile(path.join(__dirname, '..', 'dist', 'public', 'index.html'));
  }

  // Open any <a target="_blank"> or window.open() links in the user's default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit on all windows closed (except macOS, which keeps apps running in dock)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
