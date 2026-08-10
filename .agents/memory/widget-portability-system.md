---
name: Widget portability system
description: How Cubical's portable-widget system works — registry, drag, displaced band, section routing, portal ghost, snap, click-to-expand
---

# Widget portability system

## Portability default
Widgets are portable by default — `isPortableWidget(id)` returns `true` for any widget in `WIDGET_REGISTRY` that does NOT have `portable: false`. Widgets absent from the registry (e.g. file-finder) are NOT portable.

## Drag is always-on (no isEditing guard)
`startDrag` in `HomeWorkspace` runs regardless of `isEditing`. A **6px dead-zone** threshold prevents accidental drags from content taps. Only resize stays gated on `isEditing`.

## Portal drag ghost (above sidebar)
During drag, a ghost div is rendered via `createPortal` at `document.body`. The original widget gets class `is-dragging-outer` (opacity:0, pointer-events:none). Position updates use direct DOM (`el.style.transform = translate(x,y)`) for 60fps performance. Initial position is set synchronously in the ref callback to avoid one-frame flash at (0,0).

Key refs: `portalDragElRef`, `portalOffsetRef` (cursor-to-widget offset), `portalInitPosRef` (initial portal position).
Ghost: `position:fixed; top:0; left:0; z-index:9999; pointer-events:none; willChange:transform`.

**Why:** z-index alone fails because stacking context ancestors confine it. Portal at body is above everything.

## is-active-outer vs is-dragging-outer — IMPORTANT SPLIT
`.grid-widget-outer.is-active-outer` — ONLY disables CSS transitions (applies to both drag and resize).
`.grid-widget-outer.is-dragging-outer` — applies opacity:0 + pointer-events:none (drag only; portal ghost replaces it).

During RESIZE the widget must stay visible (no portal ghost exists). Do NOT add opacity:0 to `is-active-outer`.

In `GridWidget`:
```tsx
const isActive   = activeItem?.id === item.id && activeMode !== null;
const isDragging = activeItem?.id === item.id && activeMode === 'drag';
```

## Click vs drag suppression
After any drag, a one-shot capture-phase `click` listener is added in `onUp` (only when `dragging === true`) that calls `stopPropagation()` and removes itself. Prevents Calendar open, calculator button press, etc. after drag.

## Coarse snap grid
`SNAP_GRID = 80` — deliberately coarse for a felt "stepping" quality. Values 40 and below feel like micro-snapping.

Per-axis hysteresis prevents rubber-banding near grid lines:
- **SNAP_ENTER = 16px**: snap engages when cursor is within 16px of a grid line
- **SNAP_EXIT = 28px**: snap releases only when cursor moves 28px+ away
- Each axis tracked independently (`snapX`, `snapY` closure vars, reset on each new drag)

## Cross-tab transfer — no auto-navigation
After `displace(id, dropPage)`, user remains on the current page. No `navigate(dropPage)` call.
A `transferToast` ("Notepad moved to Library") is shown via `useState<string|null>` in `HomeWorkspace`, auto-cleared after 2600ms.
**Tab flash** (user sees page "reload" on navigation after transfer) was caused by this `navigate()` call; removing it also fixes the flash.

## Snapback on invalid cross-tab drop
If `inSidebar && !hoverPageRef.current` (dropped over Profile, Settings, or empty sidebar region):
- HomeWorkspace: restore widget to exact `origX, origY`
- DisplacedWidgetBand: widget stays put (no snapback needed — it stays in place in the band)

## DisplacedWidgetBand — unified drag handler
`startBandDrag(origIdx, widgetId)` is placed on the ENTIRE card (not just header). Behaviour by movement:
- **< 6px movement**: treated as click → `toggleExpand(widgetId)` (Calendar exempt)
- **Drag within band bounds**: within-row reorder (same as before)
- **Drag outside band toward sidebar**: cross-tab portal drag (same portal ghost pattern as HomeWorkspace)

Sidebar detection: `const mainLeft = (bandRef.current?.closest('.cubical-main') ?? document.querySelector('.cubical-main'))?.getBoundingClientRect().left ?? 260`

Cross-tab drop outcomes from band:
- `dropPage === '/'` → `recall(widgetId)` (returns to Home)
- `dropPage && dropPage !== sectionPage` → `displace(widgetId, dropPage)` + toast
- `inSidebar && !dropPage` → widget stays put (invalid drop)

## Click-to-expand (transported widgets only)
`expandedIds: Set<WidgetId>` in `DisplacedWidgetBand`. Calendar is EXEMPT — it already has its own compact→full overlay on click.

Compact card: click anywhere → expand (body doesn't stopPropagation, so click bubbles to card's `startBandDrag` → click → `toggleExpand`)
Expanded card: body has `onPointerDown={(e) => e.stopPropagation()}` so controls work independently; collapse button (ChevronDown) in header.

CSS transitions: `width 220ms ease-out` on `.displaced-band-card`, `height 220ms ease-out` on `.displaced-band-body`.

## Expanded card dimensions
Compact body: 148px. Expanded body per widget:
- Calculator: 380px, width 240px
- Clock: 220px, width 240px
- Notepad: 300px, width 560px
- Link Shelf: 260px (overflow-y:auto), width 320px
- Decision Maker: 260px, width 320px
- Calendar: stays compact (own behavior), width 160px

## Sidebar collapse — immediate on pointer leave
`handleSidebarLeave` directly calls `setSidebarCollapsed(true)` — no setTimeout.

## CalendarMode thresholds (approx grid units)
```
tile   : w <= 4 || h <= 4
full   : w >= 6 && h >= 6
compact: in between
```
In DisplacedWidgetBand, Calendar is passed `gridW={3} gridH={3}` → tile (compact day-card) mode.

## WIDGET_MIN (minimum drag-resize bounds)
- `calendar: { w: 120, h: 110 }`
- `clock: { w: 140, h: 100 }`

## Notepad toolbar toggle icon
The toolbar visibility toggle button in the Notepad header uses `<Pencil />` icon (NOT `<Bold />`). Using Bold caused user confusion — the B icon highlights when toolbar is open, looking like bold formatting is active. Pencil is semantically clearer.

## DisplacedWidgetBand portal for cross-tab drag
Same pattern as HomeWorkspace: `createPortal` at `document.body`, `portalGhostRef`, `portalOffsetRef`, `portalInitRef`. Also has `bandToast` state for transfer feedback (same 2600ms auto-dismiss).

## DisplacedWidgetBand CSS — width-based (not flex-basis) for transitions
Use `flex: 0 0 auto; width: Xpx` (not `flex: 0 0 Xpx`) so CSS `transition: width` works reliably across browsers.
There was a duplicate `.displaced-band-body` rule (min-height:220px) that was removed — keep only `height:148px` in the first rule.

## Section routing
- `/store` → includes `/product/*`
- `/library` → includes `/tool/*`
- `/breakroom` → exact only
- Profile and Settings remain invalid drop targets
- Home `/` → handled via `recall()` (not `displace('/')`)
