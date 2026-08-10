---
name: Hash routing and Replit preview
description: Cubical uses hash routing (wouter useHashLocation). Screenshots via path URLs always show Home. Navigation works correctly via sidebar links.
---

Cubical uses an inline `useHashLocation` hook (not the external `wouter/use-hash-location` import, which caused React deduplication errors). Routes are `/#/store`, `/#/tool/file-finder`, etc.

**Why:** Electron loads the app as a `file://` URL where path-based routing fails; hash routing works in both browser and Electron identically.

**How to apply:**
- When screenshotting a specific page via the Replit `Screenshot` tool, always use `path="/"` — sub-paths like `/store` all load `index.html` without a hash and render Home.
- Verify page-level rendering by checking the TypeScript output, Vite build output, and browser console (no errors) rather than by screenshotting specific routes.
- Do NOT import from `wouter/use-hash-location` — it caused Vite HMR deduplication creating a second React copy. The inline hook in App.tsx before the App function is the correct approach.
