---
name: Widget portability system
description: How Cubical's portable-widget system works — registry, drag, displaced band, section routing, portal ghost, snap hysteresis
---

# Widget portability system

## Portability default
Widgets are portable by default — `isPortableWidget(id)` returns `true` for any widget in `WIDGET_REGISTRY` that does NOT have `portable: false`. Widgets absent from the registry (e.g. file-finder) are NOT portable.

**Why:** Future widgets added to the registry automatically inherit portability without bespoke code.

## Drag is always-on (no isEditing guard)
`startDrag` in `HomeWorkspace` runs regardless of `isEditing`. A **6px dead-zone** threshold prevents accidental drags from content taps. Only resize stays gated on `isEditing`. `onPointerDown={onDragStart}` is set on `.grid-widget-outer` unconditionally.

**Why:** Spec rule — Edit Widgets mode must never be required for dragging.

## Portal drag ghost (above sidebar)
During drag, a ghost div is rendered via `createPortal` at `document.body`. The original widget gets class `is-dragging-outer` (opacity:0, pointer-events:none). Position updates use direct DOM (`el.style.transform = translate(x,y)`) for 60fps performance — NOT setState per frame. Initial position is set synchronously in the ref callback to avoid one-frame flash at (0,0).

Key refs: `portalDragElRef`, `portalOffsetRef` (cursor-to-widget offset), `portalInitPosRef` (initial portal position).
Ghost: `position:fixed; top:0; left:0; z-index:9999; pointer-events:none; willChange:transform`.

**Why:** z-index on `.is-active-outer` alone failed because stacking context ancestors can confine it. Portal at body is above everything.

**Sidebar detection still works:** Ghost has `pointer-events:none` so underlying nav links receive `pointerEnter` and set `hoverPageRef` normally.

## is-active-outer vs is-dragging-outer — IMPORTANT SPLIT
`.grid-widget-outer.is-active-outer` — ONLY disables CSS transitions (applies to both drag and resize).
`.grid-widget-outer.is-dragging-outer` — applies opacity:0 + pointer-events:none (drag only; portal ghost replaces it).

During RESIZE the widget must stay visible (no portal ghost exists). Do NOT add opacity:0 to `is-active-outer`.
During DRAG: both classes applied → widget hidden, ghost visible.

In `GridWidget`:
```tsx
const isActive   = activeItem?.id === item.id && activeMode !== null;
const isDragging = activeItem?.id === item.id && activeMode === 'drag';
// ...
className={`grid-widget-outer${isActive ? ' is-active-outer' : ''}${isDragging ? ' is-dragging-outer' : ''}`}
```

## Click vs drag suppression
After a drag completes, a browser-synthesised `click` event fires on the release target. Prevent it with a one-shot capture-phase listener added in `onUp` ONLY when `dragging === true`:

```typescript
const suppressClick = (ce: MouseEvent) => {
  ce.stopPropagation();
  document.removeEventListener('click', suppressClick, true);
};
document.addEventListener('click', suppressClick, true);
```

## Snap hysteresis (no rubber-banding)
Per-axis hysteresis in the drag closure prevents oscillation near grid lines.
- **SNAP_ENTER = 10px**: snap engages when cursor is within 10px of a grid line
- **SNAP_EXIT = 18px**: snap releases only when cursor moves 18px+ away from that grid line
- Each axis tracked independently (`snapX`, `snapY` closure vars, reset on each new drag)
- The old `snapItem()` (pure rounding) is NOT used in drag — only in resize snap (acceptable there since resize is deliberate)

**Why:** Pure rounding snaps/unsnaps at the same distance, causing oscillation near midpoints. Hysteresis prevents this.

## Cross-tab transfer — no auto-navigation
After `displace(id, dropPage)`, user remains on the current page. No `navigate(dropPage)` call.
A `transferToast` ("Notepad moved to Library") is shown via `useState<string|null>` in `HomeWorkspace`, auto-cleared after 2600ms.

## Snapback on invalid cross-tab drop
If `inSidebar && !hoverPageRef.current` (dropped over Profile, Settings, or empty sidebar region):
- Restore widget to exact `origX, origY` — no clamp, no transfer, no navigation.
- Distinguishes from normal Home repositioning (where clamping-to-canvas is appropriate).

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
- `calendar: { w: 120, h: 110 }` — allows tight tile day-card
- `clock: { w: 140, h: 100 }` — compact desk clock at minimum

## DisplacedWidgetBand
- One horizontal flex row (`flex-wrap: wrap`), body height **148px** (set once in `.displaced-band-body`)
- Notepad card: `flex: 0 0 480px; min-width: 300px` (wider than tall — spec requirement)
- Clock: `flex: 0 0 180px`, Calendar: `flex: 0 0 200px`, default: `flex: 0 0 200px`
- Header (grip icon + label + Recall) is the drag handle for horizontal reordering
- `reorderDisplaced(page, fromIdx, toIdx)` in PortableCtx reorders within a section
- There was a duplicate `.displaced-band-body` rule (min-height:220px) that was removed — keep only the first rule at height:148px

## DisplacedWidgetBand placement rule
Must appear AFTER the tool title/header block and BEFORE main content.

## Section routing
- `/store` → includes `/product/*`
- `/library` → includes `/tool/*`
- `/breakroom` → exact only
- Profile and Settings remain invalid drop targets
