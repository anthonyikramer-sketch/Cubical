---
name: Sakura skin system
description: Architecture for the Cubical skin system — how skins are stored, applied, and styled.
---

# Cubical Skin System

## How it works

Skins are driven by a `data-skin` attribute on `<html>`.

- `applySkin('sakura')` sets `document.documentElement.dataset.skin = 'sakura'`
- `applySkin('default')` calls `removeAttribute('data-skin')`
- CSS selectors like `[data-skin="sakura"] .cubical-sidebar` handle all visual changes
- No skin-specific logic is needed in components (except `HomePage` which checks skin to conditionally render the environment image)

## Storage

- Key: `cubical-profile-skin` (PROFILE_SKIN_KEY in App.tsx)
- Default value: `'default'`
- `readEquippedSkin()` reads from localStorage
- `applySkin()` is called on: app mount, skin equip in ProfilePage

## Active skins

- `default` — no `data-skin` attribute, standard CSS variables apply
- `sakura` — sets `data-skin="sakura"`, overrides CSS vars + sidebar + widget styles

## Sakura home environment

- Image: `artifacts/cubical/public/sakura-env.png`
- `HomePage` calls `readEquippedSkin()` on render; if `'sakura'`, renders `.sakura-env-frame` layout
- Image uses `object-fit: cover; image-rendering: pixelated` — never blur or stretch
- Widgets remain fully interactive above the image via `z-index: 1` on `.sakura-env-ui`

## Adding future skins

1. Add entry to `CUBICAL_SKINS` array (owned: true)
2. Add `[data-skin="<id>"]` CSS block in index.css
3. Add skin preview in ProfilePage skin card JSX
4. If the skin has a home environment image, update `HomePage` `isSakura`-style check

**Why:** Keeping skin logic in CSS attribute selectors keeps components clean and avoids prop-drilling. The `data-skin` attribute approach scales to many skins without code changes.
