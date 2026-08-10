# Cubical — Windows Desktop Build Guide

Cubical is packaged as a Windows desktop application using **Electron** and **electron-builder**. The Vite web app is built first, then wrapped in an Electron shell and compiled into a Windows installer.

---

## What you get

| Output | File | Description |
|---|---|---|
| NSIS Installer | `dist/installer/Cubical Setup x.x.x.exe` | Standard Windows installer with Start Menu + optional desktop shortcut |
| Portable | `dist/installer/Cubical x.x.x.exe` | Single `.exe`, no installation required |

Both are produced by a single `npm run electron:dist` command.

---

## Prerequisites (Windows PC)

1. **Node.js** 18 or later — https://nodejs.org
2. **pnpm** — run `npm install -g pnpm` (or use npm/yarn if you prefer)
3. **Git** — to clone the repo (or just download + unzip the project)

That's it. electron-builder downloads the correct Electron binary automatically.

---

## Build steps

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Install Electron and electron-builder locally in the cubical package
#    (these are desktop-only and not tracked in the workspace — install once per machine)
cd artifacts/cubical
pnpm add --save-dev electron electron-builder
cd ../..

# 3. Build the Vite frontend + package into Windows installers
pnpm --filter @workspace/cubical run electron:dist
```

The command:
- Runs `vite build` to produce the optimised web app in `dist/public/`
- Runs `electron-builder --win` to bundle Electron + the web app into installers
- Writes both outputs to `dist/installer/`

### Build only NSIS installer
```bash
pnpm --filter @workspace/cubical run electron:dist:nsis
```

### Build only portable .exe
```bash
pnpm --filter @workspace/cubical run electron:dist:portable
```

---

## Replacing the placeholder icon

The file `build/icon.ico` is a **green placeholder** generated during setup.

To replace it with the official Cubical icon:

1. Prepare a **256 × 256 px** image of your icon (PNG is fine)
2. Convert it to `.ico` using any of:
   - https://icoconvert.com (free, browser-based)
   - https://convertio.co/png-ico/
   - Photoshop / GIMP (Export As → ICO)
3. Overwrite `build/icon.ico` with the new file
4. Rebuild: `pnpm --filter @workspace/cubical run electron:dist`

The icon appears in:
- The app title bar
- Windows taskbar
- Start Menu shortcut
- Desktop shortcut
- The installer itself

---

## Development mode (live reload)

To run Cubical as a desktop window during development (pointing at the Vite dev server):

```bash
# Terminal 1 — start Vite dev server
pnpm --filter @workspace/cubical run dev

# Terminal 2 — launch Electron pointing at dev server
pnpm --filter @workspace/cubical run electron:dev
```

> Note: `electron:dev` requires Electron to be installed locally (`pnpm install`).

---

## Project structure (desktop-relevant files)

```
artifacts/cubical/
├── electron/
│   ├── main.cjs          ← Electron main process (Node.js)
│   └── preload.cjs       ← Renderer sandbox bridge
├── build/
│   └── icon.ico          ← App icon (replace with your final icon)
├── src/                  ← React + Vite source (unchanged web app)
├── dist/
│   ├── public/           ← Built web app (output of vite build)
│   └── installer/        ← Built Windows installers (output of electron-builder)
├── vite.config.ts        ← Vite config (works for both web and desktop)
└── package.json          ← Scripts + electron-builder config
```

---

## App ID

The Windows app is registered under `com.cubical.desktop`.
Change this in `package.json` → `"build"` → `"appId"` before publishing.

---

## File size

Expect the installer to be **~150–200 MB**. This is normal — Electron bundles a
full Chromium browser engine. The installed footprint is similar.

---

## All data stays local

All localStorage data (calendar events, notepad, widget layout, breakroom state, etc.)
is stored in the OS user-data directory:

```
C:\Users\<you>\AppData\Roaming\Cubical\
```

This directory persists across updates and uninstalls (unless you manually delete it).
