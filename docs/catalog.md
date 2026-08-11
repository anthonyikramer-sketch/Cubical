# Cubical Store Catalog — Developer Guide

## Overview

The Cubical Store Catalog is a JSON document that controls which products appear in the Cubical Store. Already-installed clients refresh the catalog from a remote endpoint without requiring a full application reinstall. Adding a new Tool, Skin, or Game to the catalog makes it appear in every installed copy of Cubical that can reach the endpoint.

---

## Two independent update paths

| Path | When to use |
|---|---|
| **Client update** (`CUBICAL_UPDATE_URL`) | Electron app code changed — new features, bug fixes, new bundled tool implementations |
| **Catalog update** (`CUBICAL_CATALOG_URL`) | A new product listing should appear in Store — no code change required |

---

## Catalog endpoint

Set the environment variable at build/deploy time:

```
CUBICAL_CATALOG_URL=https://your-host.example.com/catalog.json
```

The client fetches this URL and expects a JSON response matching the schema below. A local development fallback is served from `public/catalog.json`.

---

## Schema

```json
{
  "catalogVersion": "2025.08.10",
  "minClientVersion": "0.2.0",
  "products": [ /* array of CatalogProduct */ ]
}
```

### CatalogProduct fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Stable unique ID — never changes after publishing. Format: `type.slug` |
| `type` | `"tool" \| "skin" \| "game"` | ✅ | Product category |
| `name` | `string` | ✅ | Display name |
| `description` | `string` | ✅ | One-sentence description shown on the Store card |
| `version` | `string` | ✅ | Product version (`major.minor.patch`) — independent of Cubical version |
| `price` | `string` | ✅ | Display string — `"FREE"` or `"$1.99"` etc. |
| `isFree` | `boolean` | ✅ | Machine-readable free flag |
| `iconName` | `string` | ✅ | Lucide icon name resolved at runtime (e.g. `"FolderSearch"`) |
| `iconColor` | `string` | ✅ | CSS color string for the icon |
| `iconBg` | `string` | ✅ | CSS color string for the icon background |
| `deliveryType` | `"bundled" \| "asset-package" \| "client-update-required"` | ✅ | See delivery types below |
| `status` | `"active" \| "coming-soon" \| "deprecated"` | ✅ | Visibility state |
| `minimumCubicalVersion` | `string` | ❌ | Minimum client version required — Store shows upgrade prompt if unmet |
| `category` | `string` | ❌ | Semantic category slug (`"file-management"`, `"system"`, etc.) |
| `tags` | `string[]` | ❌ | Search/filter tags |
| `featured` | `boolean` | ❌ | Highlight in Store |
| `isNew` | `boolean` | ❌ | Show "New" badge |
| `releaseNotes` | `string` | ❌ | Short changelog / what's new text |
| `packageUrl` | `string` | ❌ | Download URL for asset packages (future use) |
| `downloadSize` | `number` | ❌ | Package size in bytes (future use) |

---

## Stable product IDs

IDs must never change once published. Format: `type.slug`

```
tool.file-finder
tool.pdf-toolkit
skin.sakura
game.memory-match
```

Renaming a product uses the `name` field — **not** a new ID.

---

## Delivery types

### `bundled`
The product's functionality already exists inside the currently installed Cubical build. The Store listing appears immediately and the user can install/open it without any download.

### `asset-package`
The product requires downloading non-executable assets (theme images, sounds, etc.) from `packageUrl`. Reserved for future skin downloads.

### `client-update-required`
The catalog can list this product immediately, but its implementation requires a newer Cubical client. The Store will show "Requires Cubical X.Y.Z" instead of an install button. Once the user updates Cubical, the product becomes available. **Use this to preview upcoming tools before their client release ships.**

---

## Example entries

### Tool (bundled)
```json
{
  "id": "tool.unit-converter",
  "type": "tool",
  "name": "Unit Converter",
  "description": "Convert between units of length, weight, temperature, and more.",
  "version": "1.0.0",
  "price": "FREE",
  "isFree": true,
  "iconName": "Calculator",
  "iconColor": "hsl(210 55% 42%)",
  "iconBg": "hsl(210 55% 42% / .12)",
  "deliveryType": "bundled",
  "minimumCubicalVersion": "0.3.0",
  "category": "utilities",
  "tags": ["converter", "units", "math"],
  "status": "active",
  "featured": false,
  "isNew": true
}
```

### Skin (bundled)
```json
{
  "id": "skin.midnight",
  "type": "skin",
  "name": "Midnight",
  "description": "Deep navy blues and silver accents. Built for late-night work sessions.",
  "version": "1.0.0",
  "price": "FREE",
  "isFree": true,
  "iconName": "Moon",
  "iconColor": "hsl(220 50% 55%)",
  "iconBg": "hsl(220 50% 55% / .12)",
  "deliveryType": "bundled",
  "category": "theme",
  "tags": ["theme", "dark", "night"],
  "status": "active",
  "featured": false,
  "isNew": false
}
```

### Game (requires update)
```json
{
  "id": "game.word-scramble",
  "type": "game",
  "name": "Word Scramble",
  "description": "Unscramble the word before the timer runs out.",
  "version": "1.0.0",
  "price": "FREE",
  "isFree": true,
  "iconName": "Shuffle",
  "iconColor": "hsl(35 70% 45%)",
  "iconBg": "hsl(35 70% 45% / .12)",
  "deliveryType": "client-update-required",
  "minimumCubicalVersion": "0.3.0",
  "category": "games",
  "tags": ["game", "words", "puzzle"],
  "status": "active",
  "featured": false,
  "isNew": true
}
```

---

## Catalog validation rules

The client validates each entry before rendering it. An invalid entry is silently skipped — it does not crash the Store.

**Required to pass validation:**
- `id` must be a non-empty string
- `type` must be `"tool"`, `"skin"`, or `"game"`
- `name` must be a non-empty string

**On fetch failure:**
1. If a valid cached catalog exists → use it (shown as "Offline · cached")
2. If no cache exists → fall back to the bundled `public/catalog.json`
3. Cubical never shows an empty Store due to a network error

---

## Adding a new product — checklist

1. Choose a stable ID: `type.slug` (e.g. `tool.unit-converter`)
2. Add the entry to the remote catalog JSON
3. If `deliveryType` is `bundled`, ensure the feature code ships in the Cubical client **before or at the same time** as the catalog entry
4. If `deliveryType` is `client-update-required`, set `minimumCubicalVersion` to the client version that will contain the implementation
5. Deploy the updated catalog JSON to the endpoint at `CUBICAL_CATALOG_URL`
6. Installed clients will pick up the new listing within one cache TTL (1 hour) or immediately on next Store open

---

## Environment variables

| Variable | Purpose |
|---|---|
| `VITE_CATALOG_URL` | Remote catalog endpoint URL (set at build time for production) |
| `CUBICAL_UPDATE_URL` | Electron auto-updater feed URL for `electron-updater` generic provider |

See `.env.example` for documentation.
