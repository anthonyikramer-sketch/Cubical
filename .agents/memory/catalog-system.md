---
name: Catalog & Distribution System
description: Remote store catalog, stable product IDs, version handling, and auto-updater for Cubical desktop distribution.
---

## Stable product ID format
`tool.<slug>`, `skin.<slug>`, `game.<slug>` — e.g. `tool.file-finder`.
A `LEGACY_ID_MAP` in App.tsx migrates old plain-slug IDs from localStorage on first load.
`Product = CatalogProduct` alias keeps all component signatures unchanged.

**Why:** localStorage previously stored plain slugs like `file-finder`. Migration ensures users don't lose their library when upgrading.

**How to apply:** Any new product must use the `tool.|skin.|game.` prefix. Never use plain slugs.

## CatalogProduct type
Defined in App.tsx — key fields: `id`, `type` (tool/skin/game), `iconName` (string key into `ICON_REGISTRY`), `isFree`, `deliveryType` (bundled/asset-package/client-update-required), `minimumCubicalVersion`, `status`.

**Icon resolution:** `resolveIcon(product.iconName)` — NOT `product.icon`. Icons come from ICON_REGISTRY, not stored on the product object.

## useCatalog() hook
Fetches from `VITE_CATALOG_URL` env var (if set), caches in localStorage (`cubical-catalog-cache-v1`) with 1-hour TTL. Falls back: fresh remote → valid cache → DEFAULT_CATALOG_PRODUCTS (14-item bundled list in App.tsx). Called at App level; `catalogProducts` and `catalogStatus` passed down to StorePage.

## StorePage props
Now requires: `{ libraryIds, catalogProducts, catalogStatus, onRefresh }` — not the old `{ libraryIds }`. Has category tabs (All / Tools / Skins / Games).

## Auto-updater (Electron)
`electron-updater` conditionally required in `main.cjs` only when `app.isPackaged` — no crash in browser/dev mode. `autoDownload = false` — user initiates. IPC: `updater:check`, `updater:install`, `updater:download`. Preload bridge: `window.cubicalDesktop.updater`.
`UpdatePanel` component in Settings → About detects `window.cubicalDesktop?.updater` and shows a dev note when absent.

## requiresCubicalUpdate(product)
Returns true when `product.minimumCubicalVersion` semver is greater than `APP_VERSION`. ProductDetail shows an upgrade prompt instead of install button when true.

## Version
Cubical is version `0.2.0` (defined in `artifacts/cubical/package.json`). Injected via Vite define as `__APP_VERSION__` → `APP_VERSION` constant in App.tsx.
