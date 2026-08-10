---
name: Widget portability system
description: How Cubical's portable-widget system works — registry, drag, displaced band, section routing, portal ghost
---

# Widget portability system

## Portability default
Widgets are portable by default — `isPortableWidget(id)` returns `true` for any widget in `WIDGET_REGISTRY` that does NOT have `portable: false`. Widgets absent from the registry (e.g. file-finder) are NOT portable.

**Why:** Future widgets added to the registry automatically inherit portability without bespoke code.

## Drag is always-on (no isEditing guard)
`startDrag` in `HomeWorkspace` runs regardless of `isEditing`. A **6px dead-zone** threshold prevents accidental drags from content taps. Only resize stays gated on `isEditing`. `onPointerDown={onDragStart}` is set on `.grid-widget-outer` unconditionally.

**Why:** Spec rule — Edit Widgets mode must never be required for dragging.

## Portal drag ghost (above sidebar)
During drag, a ghost div is rendered via `createPortal` at `document.body`. The original widget gets `opacity:0; pointer-events:none`. Position updates use direct DOM (`el.style.transform = translate(x,y)`) for 60fps performance — NOT setState per frame. Initial position is set synchronously in the ref callback to avoid one-frame flash at (0,0).

Key refs: `portalDragElRef`, `portalOffsetRef` (cursor-to-widget offset), `portalInitPosRef` (initial portal position).
Ghost: `position:fixed; top:0; left:0; z-index:9999; pointer-events:none; willChange:transform`.

**Why:** z-index on `.is-active-outer` alone failed because stacking context ancestors can confine it. Portal at body is above everything.

**Sidebar detection still works:** Ghost has `pointer-events:none` so underlying nav links receive `pointerEnter` and set `hoverPageRef` normally.

## Click vs drag suppression
After a drag completes, a browser-synthesised `click` event fires on the release target, which would trigger any child `onClick`. Prevent it with a one-shot capture-phase listener added in `onUp` ONLY when `dragging === true`:

```typescript
const suppressClick = (ce: MouseEvent) => {
  ce.stopPropagation();
  document.removeEventListener('click', suppressClick, true);
};
document.addEventListener('click', suppressClick, true);
```

This is universal — protects Calendar, Clock, Link Shelf, Decision Maker, Calculator, and future widgets without per-widget hacks.

## Sidebar collapse — immediate on pointer leave
`handleSidebarLeave` directly calls `setSidebarCollapsed(true)` — no setTimeout. Guard: pinned sidebar and `window.innerWidth <= 800` are exempt. `readSettings().sidebarAutoCollapse` must be true (same gate as before).

## CalendarMode thresholds (approx grid units)
```
tile   : w <= 4 || h <= 4   (≈ ≤ 328px wide or ≤ 368px tall)
full   : w >= 6 && h >= 6   (≈ ≥ 492px wide and ≥ 552px tall)
compact: in between
```
In DisplacedWidgetBand, Calendar is passed `gridW={3} gridH={3}` → tile (compact day-card) mode.

## WIDGET_MIN (minimum drag-resize bounds)
- `calendar: { w: 120, h: 110 }` — allows tight tile day-card; previously 280x280 caused visible empty space
- `clock: { w: 140, h: 100 }` — compact desk clock at minimum

## DisplacedWidgetBand
- One horizontal flex row (`flex-wrap: wrap`), standard card height 190px
- Notepad card: `flex: 0 0 380px`, Clock: `flex: 0 0 180px`, Calendar: `flex: 0 0 200px`
- Header (grip icon + label + Recall) is the drag handle for horizontal reordering
- `reorderDisplaced(page, fromIdx, toIdx)` in PortableCtx reorders within a section; order persists via the `displaced` array order

## DisplacedWidgetBand placement rule
Must appear AFTER the tool title/header block and BEFORE main content.

## Section routing
- `/store` → includes `/product/*`
- `/library` → includes `/tool/*`
- `/breakroom` → exact only
- Profile and Settings remain invalid
