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
});
