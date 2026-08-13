'use strict';

/**
 * Cubical — Electron preload script
 *
 * Runs in the renderer process before page content loads.
 * Uses contextBridge to expose a narrow, explicit API to the React renderer.
 * contextIsolation is enabled; nodeIntegration is disabled.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cubicalDesktop', {
  /** 'win32' | 'darwin' | 'linux' */
  platform: process.platform,

  /**
   * File Finder — secure IPC bridge.
   * The renderer can only invoke the specific operations listed here;
   * it has no direct filesystem access.
   */
  fileFinder: {
    /**
     * Start an async file search. Results stream back via onProgress / onComplete.
     * @param {string} query    — filename substring to match (case-insensitive)
     * @param {string[]} folders — resolved folder paths or magic tokens
     *   '__COMMON_FOLDERS__' → Desktop, Documents, Downloads, Pictures, Videos, Music
     *   '__ALL_DRIVES__'     → all available drives (slow on large disks)
     */
    startSearch: (query, folders) => ipcRenderer.send('file-finder:start', { query, folders }),

    /** Cancel any search currently in progress. */
    cancelSearch: () => ipcRenderer.send('file-finder:cancel'),

    /**
     * Open a file using the OS default application.
     * @returns {Promise<void>}
     */
    openFile: (filePath) => ipcRenderer.invoke('file-finder:open-file', filePath),

    /**
     * Open File Explorer / Finder and select the file.
     * @returns {Promise<void>}
     */
    openLocation: (filePath) => ipcRenderer.invoke('file-finder:open-location', filePath),

    /**
     * Show the native folder-picker dialog.
     * @returns {Promise<string|null>} Chosen path, or null if cancelled.
     */
    chooseFolderDialog: () => ipcRenderer.invoke('file-finder:choose-folder'),

    /**
     * Subscribe to progress updates during a search.
     * @param {function} cb — called with { found: number, scanning: string }
     * @returns {function} Unsubscribe function — call on component unmount.
     */
    onProgress: (cb) => {
      const handler = (_event, data) => cb(data);
      ipcRenderer.on('file-finder:progress', handler);
      return () => ipcRenderer.removeListener('file-finder:progress', handler);
    },

    /**
     * Read a local file's bytes for the Send To handoff system.
     * @param {string} filePath — absolute path to the file
     * @returns {Promise<ArrayBuffer|null>} Raw bytes, or null on error.
     */
    readFileBytes: (filePath) => ipcRenderer.invoke('file-finder:read-file', filePath),

    /**
     * Subscribe to the search-complete event.
     * @param {function} cb — called with { results: FileResult[] }
     * @returns {function} Unsubscribe function.
     */
    onComplete: (cb) => {
      const handler = (_event, data) => cb(data);
      ipcRenderer.on('file-finder:complete', handler);
      return () => ipcRenderer.removeListener('file-finder:complete', handler);
    },
  },

  /**
   * Auto-updater — secure IPC bridge.
   * Only functional in packaged desktop builds (uses the GitHub Releases config
   * baked into app-update.yml by electron-builder at package time).
   * In browser/dev mode, checkForUpdates returns a { devMode: true, message } object.
   */
  updater: {
    /**
     * Manually trigger an update check.
     * @returns {Promise<{ devMode?: boolean; message?: string }>}
     */
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),

    /** Begin downloading the available update (if one was found). */
    downloadUpdate: () => ipcRenderer.send('updater:download'),

    /** Quit the app and install the downloaded update. */
    installUpdate: () => ipcRenderer.send('updater:install'),

    /**
     * Subscribe to update status events.
     * @param {function} cb — called with { type: string, percent?, version?, message? }
     *   type values: 'checking' | 'available' | 'up-to-date' | 'downloading' | 'ready' | 'error'
     * @returns {function} Unsubscribe function.
     */
    onStatus: (cb) => {
      const handler = (_event, data) => cb(data);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
  },
});
