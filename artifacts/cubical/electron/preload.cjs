'use strict';

/**
 * Cubical — Electron preload script
 *
 * Runs in the renderer process before page content loads, with access to
 * a limited set of Node.js / Electron APIs. Use contextBridge to safely
 * expose anything the renderer needs from Node/Electron.
 *
 * Currently Cubical uses only browser APIs (localStorage, canvas, etc.),
 * so this file intentionally exposes very little. It exists as a clean
 * hook for future desktop-specific features (native file dialogs, OS
 * notifications, system tray, etc.).
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('cubicalDesktop', {
  /** 'win32' | 'darwin' | 'linux' — lets the renderer know it's running as a desktop app */
  platform: process.platform,
});
