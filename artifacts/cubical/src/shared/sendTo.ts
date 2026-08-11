/**
 * Cubical — Cross-Tool "Send To" infrastructure
 *
 * Provides a reusable in-memory file-handoff queue with pub-sub notifications,
 * a tool compatibility registry, and localStorage-backed preferences (default
 * destinations per file category, follow toggle).
 *
 * Files are stored as Uint8Array bytes so any tool can reconstruct a File object
 * without hitting the disk again.  The queue lives in memory only; it is
 * intentionally not persisted because File bytes can be large and stale paths
 * would be confusing after a restart.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FileHandoff {
  id:         string;
  name:       string;
  path:       string;
  ext:        string;
  size:       number;
  mimeType:   string;
  sourceTool: string;
  destTool:   string;
  timestamp:  number;
  batchId:    string;
  bytes:      Uint8Array;
  /** When true the destination tool should auto-open this file on mount. */
  autoOpen:   boolean;
}

export interface SendToDestination {
  toolId:       string;
  label:        string;
  route:        string;
  /** Extensions this tool accepts; empty array = accepts any file type. */
  acceptedExts: string[];
}

export type FileCategory = 'pdf' | 'image' | 'other';

// ── Registry ──────────────────────────────────────────────────────────────────

export const SEND_TO_REGISTRY: SendToDestination[] = [
  {
    toolId:       'pdf-form-filler',
    label:        'PDF Form Filler',
    route:        '/tool/pdf-form-filler',
    acceptedExts: ['.pdf'],
  },
  {
    toolId:       'image-converter',
    label:        'Image Converter',
    route:        '/tool/image-converter',
    acceptedExts: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.heic', '.avif'],
  },
  {
    toolId:       'file-inspector',
    label:        'File Inspector',
    route:        '/tool/file-inspector',
    acceptedExts: [], // accepts all
  },
  {
    toolId:       'file-toolbox',
    label:        'File Toolbox',
    route:        '/tool/file-toolbox',
    acceptedExts: [], // accepts all
  },
];

/** Return destinations compatible with the given file extension. */
export function getCompatibleDestinations(ext: string): SendToDestination[] {
  const e = ext.toLowerCase();
  return SEND_TO_REGISTRY.filter(
    (d) => d.acceptedExts.length === 0 || d.acceptedExts.includes(e),
  );
}

// ── File helpers ──────────────────────────────────────────────────────────────

const EXT_MIME: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.bmp':  'image/bmp',
  '.tiff': 'image/tiff',
  '.tif':  'image/tiff',
  '.svg':  'image/svg+xml',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.mp4':  'video/mp4',
  '.mov':  'video/quicktime',
  '.txt':  'text/plain',
  '.csv':  'text/csv',
  '.zip':  'application/zip',
};

export function extToMime(ext: string): string {
  return EXT_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

export function extToCategory(ext: string): FileCategory {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.tiff','.tif','.svg','.heic','.avif'].includes(e)) return 'image';
  return 'other';
}

/** Reconstruct a browser File object from a handoff's bytes. */
export function handoffToFile(h: FileHandoff): File {
  return new File([h.bytes.buffer as ArrayBuffer], h.name, { type: h.mimeType, lastModified: h.timestamp });
}

// ── In-memory queue ───────────────────────────────────────────────────────────

const _queues    = new Map<string, FileHandoff[]>();
const _listeners = new Map<string, Set<() => void>>();

function _notify(toolId: string) {
  _listeners.get(toolId)?.forEach((cb) => cb());
}

export function enqueueHandoffs(toolId: string, items: FileHandoff[]): void {
  _queues.set(toolId, [...(_queues.get(toolId) ?? []), ...items]);
  _notify(toolId);
}

export function peekHandoffs(toolId: string): readonly FileHandoff[] {
  return _queues.get(toolId) ?? [];
}

export function removeHandoff(toolId: string, id: string): void {
  _queues.set(toolId, (_queues.get(toolId) ?? []).filter((h) => h.id !== id));
  _notify(toolId);
}

export function clearHandoffs(toolId: string): void {
  _queues.set(toolId, []);
  _notify(toolId);
}

export function subscribeHandoffs(toolId: string, cb: () => void): () => void {
  if (!_listeners.has(toolId)) _listeners.set(toolId, new Set());
  _listeners.get(toolId)!.add(cb);
  return () => _listeners.get(toolId)?.delete(cb);
}

// ── localStorage preferences ──────────────────────────────────────────────────

const DEFAULTS_KEY = 'cubical-sendto-defaults-v1';
const FOLLOW_KEY   = 'cubical-sendto-follow-v1';

function _readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw != null ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function _writeLocal(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function getDefaultDest(category: FileCategory): string | null {
  const map = _readLocal<Record<string, string>>(DEFAULTS_KEY, {});
  return map[category] ?? null;
}

export function setDefaultDest(category: FileCategory, toolId: string): void {
  const map = _readLocal<Record<string, string>>(DEFAULTS_KEY, {});
  map[category] = toolId;
  _writeLocal(DEFAULTS_KEY, map);
}

export function getSendToFollow(): boolean {
  return _readLocal<boolean>(FOLLOW_KEY, true);
}

export function setSendToFollow(v: boolean): void {
  _writeLocal(FOLLOW_KEY, v);
}
