/**
 * File Shelf ⇄ Tool drag-and-drop handoff utilities.
 *
 * SHELF_DRAG_TYPE        File Shelf → Tool  (drag a shelf file onto a tool drop zone)
 * TOOL_OUTPUT_DRAG_TYPE  Tool → File Shelf  (drag a tool result onto File Shelf)
 *
 * Because dataTransfer.getData() is unavailable during `dragover`, we also
 * maintain a module-level `_activeDragMime` that tools can read synchronously
 * to decide whether to show compat / incompat feedback.
 */

// ── Drag type identifiers ─────────────────────────────────────────────────────

export const SHELF_DRAG_TYPE       = 'application/x-cubicle-shelf-file';
export const TOOL_OUTPUT_DRAG_TYPE = 'application/x-cubicle-tool-output';

// ── Active-drag MIME (readable during dragover) ───────────────────────────────

let _activeDragMime: string | null = null;
export function setActiveDragMime(mime: string | null): void { _activeDragMime = mime; }
export function getActiveDragMime(): string | null           { return _activeDragMime; }

// ── MIME compatibility ────────────────────────────────────────────────────────

/**
 * Returns true when `fileMime` matches any pattern in `acceptedMimes`.
 * Patterns may use wildcards: `'image/*'` matches any `'image/...'` MIME.
 */
export function isMimeCompatible(fileMime: string, acceptedMimes: string[]): boolean {
  return acceptedMimes.some((pattern) => {
    if (pattern.endsWith('/*')) return fileMime.startsWith(pattern.slice(0, -1));
    return fileMime === pattern;
  });
}

// ── File Shelf → Tool encoding ────────────────────────────────────────────────

export interface ShelfDragPayload {
  fileId:   string;
  filename: string;
  mimeType: string;
  /** undefined when the file was too large to store as a data URL. */
  dataUrl?: string;
}

export function encodeShelfDrag(
  file: { id: string; filename: string; mimeType: string; dataUrl?: string },
): string {
  return JSON.stringify({ fileId: file.id, filename: file.filename, mimeType: file.mimeType, dataUrl: file.dataUrl });
}

export function decodeShelfDrag(raw: string): ShelfDragPayload | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (typeof p.fileId !== 'string' || typeof p.filename !== 'string' || typeof p.mimeType !== 'string') return null;
    return { fileId: p.fileId, filename: p.filename, mimeType: p.mimeType, dataUrl: p.dataUrl as string | undefined };
  } catch { return null; }
}

/** Reconstruct a browser File from a ShelfDragPayload (requires dataUrl). */
export function shelfPayloadToFile(p: ShelfDragPayload): File | null {
  if (!p.dataUrl) return null;
  try {
    const base64 = p.dataUrl.split(',')[1] ?? '';
    const binary  = atob(base64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes.buffer as ArrayBuffer], p.filename, { type: p.mimeType });
  } catch { return null; }
}

// ── Tool → File Shelf encoding ────────────────────────────────────────────────

export interface ToolOutputPayload {
  filename:  string;
  mimeType:  string;
  /** Temporary object URL — valid while the source tool page is mounted. */
  objectUrl: string;
}

export function encodeToolOutput(p: ToolOutputPayload): string {
  return JSON.stringify(p);
}

export function decodeToolOutput(raw: string): ToolOutputPayload | null {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (typeof p.filename !== 'string' || typeof p.mimeType !== 'string' || typeof p.objectUrl !== 'string') return null;
    return { filename: p.filename, mimeType: p.mimeType, objectUrl: p.objectUrl };
  } catch { return null; }
}

/** Fetch the blob behind an object URL and return it as a File. */
export async function toolOutputToFile(p: ToolOutputPayload): Promise<File | null> {
  try {
    const blob = await fetch(p.objectUrl).then((r) => r.blob());
    return new File([blob], p.filename, { type: p.mimeType });
  } catch { return null; }
}
