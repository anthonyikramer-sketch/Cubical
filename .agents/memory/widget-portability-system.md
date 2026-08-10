---
name: Widget portability system
description: How Cubical's portable-widget system works — registry, drag, displaced band, section routing
---

# Widget portability system

## Portability default
Widgets are portable by default — `isPortableWidget(id)` returns `true` for any widget in `WIDGET_REGISTRY` that does NOT have `portable: false`. Widgets absent from the registry (e.g. file-finder) are NOT portable. Do not maintain a separate PORTABLE_WIDGETS Set.

**Why:** Future widgets added to the registry automatically inherit portability without bespoke code.

## Drag is always-on (no isEditing guard)
`startDrag` in `HomeWorkspace` runs regardless of `isEditing`. A **6px dead-zone** threshold prevents accidental drags from content taps. Only resize stays gated on `isEditing`. `onPointerDown={onDragStart}` is set on `.grid-widget-outer` unconditionally.

**Why:** Spec rule — Edit Widgets mode must never be required for dragging.

## Drag over sidebar (z-index + no freeze)
During drag, the widget visually follows the cursor everywhere (negative x is allowed — clamped on release). `.is-active-outer { z-index: 1000 }` renders it above the sidebar (z-index: 5). The sidebar-zone freeze (`return;` in onMove) was removed.

**Why:** Widget must visibly pass over sidebar for the transfer interaction to feel physical.

## CalendarMode thresholds (approx grid units)
```
tile   : w <= 4 || h <= 4   (≈ ≤ 328px wide or ≤ 368px tall)
full   : w >= 6 && h >= 6   (≈ ≥ 492px wide and ≥ 552px tall)
compact: in between
```
In DisplacedWidgetBand, Calendar is passed `gridW={3} gridH={3}` → tile (compact day-card) mode.

**Why:** Default size was always full; tile (the day-card the user wanted) was unreachable at min size.

## DisplacedWidgetBand
- One horizontal flex row (`flex-wrap: wrap`), standard card height 190px
- Notepad card: `flex: 0 0 380px`, Clock: `flex: 0 0 180px`, Calendar: `flex: 0 0 200px`
- Header (grip icon + label + Recall) is the drag handle for horizontal reordering
- `reorderDisplaced(page, fromIdx, toIdx)` in PortableCtx reorders within a section; order persists via the `displaced` array order

## Section routing
- `/store` → includes `/product/*`
- `/library` → includes `/tool/*`  
- `/breakroom` → exact only
- Profile and Settings remain invalid

## DisplacedWidgetBand placement rule
Must appear AFTER the tool title/header block and BEFORE main content. BulkFileRenamer and SpreadsheetCleaner previously had it ABOVE the title — fixed. FileFinderPage placements were already correct.

## Clock
- `WIDGET_MIN.clock = {w:140, h:100}` (allows very small compact clock)
- `compact = gridH <= 2`; in band uses `gridH={1}`
- `.clock-fill { padding: 14px 16px }`, `.clock-fill.clock-compact { padding: 8px 10px }`
