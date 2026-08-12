---
name: File Shelf ⇄ Tool handoff system
description: Two-way drag-and-drop system letting tools send/receive files through File Shelf
---

## System overview

`src/shared/fileShelfHandoff.ts` is the single source of truth for all File Shelf ↔ Tool drag-and-drop.

## Drag type constants

- `SHELF_DRAG_TYPE = 'application/x-cubicle-shelf-file'` — File Shelf → Tool
- `TOOL_OUTPUT_DRAG_TYPE = 'application/x-cubicle-tool-output'` — Tool → File Shelf

## Active drag MIME workaround

`dataTransfer.getData()` is blocked during `dragover` (browser security). Solution: module-level `_activeDragMime` set by `setActiveDragMime(mime)` at `dragStart` time. Tools read it via `getActiveDragMime()` during `dragover` to decide compat/incompat feedback.

**How to apply:** Any new tool that wants shelf drag feedback must check `getActiveDragMime()` during dragover, not `getData()`.

## Shelf → Tool flow

1. File row `onDragStart`: `setData(SHELF_DRAG_TYPE, encodeShelfDrag(file))` + `setActiveDragMime(file.mimeType)`
2. File row `onDragEnd`: `setActiveDragMime(null)`
3. Tool drop zone `dragover`: checks `e.dataTransfer.types.includes(SHELF_DRAG_TYPE)` → reads `getActiveDragMime()` → `isMimeCompatible()` → sets CSS class `is-shelf-drag-compat` or `is-shelf-drag-incompat`
4. Tool `drop`: `getData(SHELF_DRAG_TYPE)` → `decodeShelfDrag()` → `shelfPayloadToFile()` → feed to existing load handler

**Why `shelfPayloadToFile()` can return null:** If the file was too large to store as a data URL in localStorage, `dataUrl` is undefined. Tools should handle this gracefully.

## Tool → Shelf flow

1. Tool result element: `draggable` + `onDragStart`: `setData(TOOL_OUTPUT_DRAG_TYPE, encodeToolOutput({filename, mimeType, objectUrl}))`
2. File Shelf `handleDrop`: reads `getData(TOOL_OUTPUT_DRAG_TYPE)` synchronously before any await → `decodeToolOutput()` → `toolOutputToFile()` (fetches blob from object URL) → opens `AddFileDialog`
3. Folder row `onDrop`: same pattern but sets `addFileFolderId = folder.id` → pre-selects folder in dialog

**Why synchronous read before await:** React synthetic events are cleared after yield. Always capture `getData()` and `e.dataTransfer.files` before any `await`.

## Tools integrated

| Tool | Shelf → Tool | Tool → Shelf |
|------|-------------|-------------|
| ImageConverter | ✅ image/* MIME | ✅ each result row is draggable |
| ClearBackground | ✅ image/* MIME | ✅ result panel draggable; filename = `{base}-no-bg.png` |
| PdfFormFiller | ✅ application/pdf | ❌ (not applicable — form fill, not file output) |
| SheetFill DropZone | ✅ per shelfMimes prop | ❌ (output is a download, not a drag source) |

## CSS classes

- `.is-shelf-drag-compat` — green outline + tint on any tool drop zone during compatible shelf drag
- `.is-shelf-drag-incompat` — red outline + reduced opacity during incompatible shelf drag
- `.fsw-fill.is-tool-drag-over` — blue dashed outline on File Shelf widget during tool output drag
- `.image-result-row` — grab cursor (draggable result)
- `.cb-preview-frame[draggable="true"]` — grab cursor on result panel

## AddFileDialog defaultFolderId

When tool output is dropped on a folder row, `addFileFolderId` state is set to `folder.id` and passed as `defaultFolderId` to `AddFileDialog`. Each entry's initial `folderId` is set from this prop.
