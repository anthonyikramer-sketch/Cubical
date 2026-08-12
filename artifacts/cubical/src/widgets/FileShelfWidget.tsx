// ─── File Shelf Widget ────────────────────────────────────────────────────────
// A compact, persistent reference shelf for local files.
// Files are stored as data URLs (≤ 4 MB) so they survive page reloads.

import { createPortal } from 'react-dom';
import {
  useCallback, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  AlertTriangle, Bookmark, ChevronLeft, File, FilePlus2,
  FileSpreadsheet, FileText, Folder, FolderPlus, Image as ImageIcon,
  Search, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { PdfViewer } from '../tools/sheetfill/PdfViewer';
import { XlsxViewer } from '../tools/sheetfill/XlsxViewer';

// ─── Constants ──────────────────────────────────────────────────────────────
const FILE_SHELF_KEY = 'cubical-file-shelf';
const MAX_STORE_BYTES = 4 * 1024 * 1024; // 4 MB per file

export const FS_COLORS = [
  '#5b8dd9', // blue
  '#58b06e', // green
  '#9b6fd4', // purple
  '#e07b4e', // orange
  '#d45b6b', // red
  '#5bb4b0', // teal
  '#c4a442', // amber
  '#94a3b8', // slate
];

// ─── Types ──────────────────────────────────────────────────────────────────
export interface ShelfFolder {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface ShelfFile {
  id: string;
  nickname: string;
  filename: string;
  mimeType: string;
  color: string;
  folderId: string | null;
  order: number;
  dataUrl?: string; // undefined = too large or unavailable
}

interface ShelfData {
  files: ShelfFile[];
  folders: ShelfFolder[];
}

// ─── Storage ────────────────────────────────────────────────────────────────
function isShelfData(v: unknown): v is ShelfData {
  return !!v && typeof v === 'object'
    && Array.isArray((v as ShelfData).files)
    && Array.isArray((v as ShelfData).folders);
}

function readShelf(): ShelfData {
  try {
    const raw = localStorage.getItem(FILE_SHELF_KEY);
    if (!raw) return { files: [], folders: [] };
    const p = JSON.parse(raw);
    return isShelfData(p) ? p : { files: [], folders: [] };
  } catch { return { files: [], folders: [] }; }
}

function writeShelf(data: ShelfData) {
  try { localStorage.setItem(FILE_SHELF_KEY, JSON.stringify(data)); } catch {}
}

// ─── Utilities ──────────────────────────────────────────────────────────────
function fileIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="fsw-type-icon" />;
  if (mime.startsWith('image/'))   return <ImageIcon className="fsw-type-icon" />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv')
    return <FileSpreadsheet className="fsw-type-icon" />;
  return <File className="fsw-type-icon" />;
}

function canPreview(mime: string): boolean {
  return mime === 'application/pdf'
    || mime.startsWith('image/')
    || mime.startsWith('text/')
    || mime === 'text/csv'
    || mime.includes('spreadsheet')
    || mime.includes('excel');
}

async function readFileAsDataUrl(file: File): Promise<string | undefined> {
  if (file.size > MAX_STORE_BYTES) return undefined;
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function dataUrlToBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function nextOrder(list: { order: number }[]): number {
  return list.length === 0 ? 0 : Math.max(...list.map(x => x.order)) + 1;
}

// ─── Module-level viewer pub-sub (tab-aware + persisted) ─────────────────────
export interface ViewerInfo {
  id: string;
  file: ShelfFile;
  /** Hash route of the tab this viewer belongs to, e.g. '/' or '/breakroom'. */
  tabId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type SetViewers = (vs: ViewerInfo[]) => void;
let _viewers: ViewerInfo[] = [];
const _viewerSubs = new Set<SetViewers>();

// ── Persistence ───────────────────────────────────────────────────────────────
const VIEWERS_STORAGE_KEY = 'cubical-shelf-viewers';

interface PersistedViewer { id: string; fileId: string; tabId: string; x: number; y: number; w: number; h: number; }

function _readPersisted(): PersistedViewer[] {
  try {
    const raw = localStorage.getItem(VIEWERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v: unknown): v is PersistedViewer =>
      !!v && typeof v === 'object' &&
      typeof (v as PersistedViewer).id     === 'string' &&
      typeof (v as PersistedViewer).fileId === 'string' &&
      typeof (v as PersistedViewer).tabId  === 'string',
    );
  } catch { return []; }
}

function _persist() {
  try {
    const records: PersistedViewer[] = _viewers.map(v => ({
      id: v.id, fileId: v.file.id, tabId: v.tabId,
      x: v.x, y: v.y, w: v.w, h: v.h,
    }));
    localStorage.setItem(VIEWERS_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

function _initViewers() {
  const records = _readPersisted();
  if (records.length === 0) return;
  const shelf   = readShelf();
  const fileMap = new Map(shelf.files.map(f => [f.id, f] as const));
  _viewers = records
    .map(r => { const file = fileMap.get(r.fileId); return file ? { id: r.id, file, tabId: r.tabId, x: r.x, y: r.y, w: r.w, h: r.h } : null; })
    .filter((v): v is ViewerInfo => v !== null);
}

// Hydrate from localStorage immediately when the module loads
_initViewers();

// ── Tab helpers ───────────────────────────────────────────────────────────────
function getCurrentTab(): string {
  const hash = window.location.hash;
  const path = hash.startsWith('#') ? hash.slice(1) : hash;
  return path || '/';
}

function tabLabel(tabId: string): string {
  if (tabId === '/') return 'Home';
  if (tabId === '/breakroom') return 'Breakroom';
  if (tabId.startsWith('/library') || tabId.startsWith('/tool/')) return 'Library';
  if (tabId.startsWith('/store')   || tabId.startsWith('/product/')) return 'Store';
  return tabId.slice(1).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || tabId;
}

function getAvailableTabs(): Array<{ tabId: string; label: string }> {
  const seen = new Set<string>();
  const tabs: Array<{ tabId: string; label: string }> = [];
  const add = (id: string) => { if (!seen.has(id)) { seen.add(id); tabs.push({ tabId: id, label: tabLabel(id) }); } };

  add('/'); // Home is always available

  // Tabs from displaced widgets
  try {
    const raw = localStorage.getItem('cubical-displaced-widgets');
    if (raw) {
      const parsed: Array<{ id: string; page: string }> = JSON.parse(raw);
      parsed.forEach(d => { if (d.page) add(d.page); });
    }
  } catch {}

  // Tabs where viewers already live
  _viewers.forEach(v => add(v.tabId));

  return tabs;
}

// ── Pub-sub helpers ───────────────────────────────────────────────────────────
function _notify() { _viewerSubs.forEach(fn => fn([..._viewers])); }

export function openShelfViewer(file: ShelfFile) {
  // If file already open anywhere, return (V1: focus-existing behavior)
  if (_viewers.some(v => v.file.id === file.id)) return;
  const tabId     = getCurrentTab();
  const tabCount  = _viewers.filter(v => v.tabId === tabId).length;
  const offset    = tabCount * 28;
  _viewers = [..._viewers, {
    id: crypto.randomUUID(), file, tabId,
    x: Math.max(60, 100 + offset), y: Math.max(60, 80 + offset),
    w: 600, h: 700,
  }];
  _notify();
  _persist();
}

function closeViewer(id: string) {
  _viewers = _viewers.filter(v => v.id !== id);
  _notify();
  _persist();
}

function patchViewer(id: string, patch: Partial<Pick<ViewerInfo, 'x' | 'y' | 'w' | 'h'>>) {
  _viewers = _viewers.map(v => v.id === id ? { ...v, ...patch } : v);
  _notify();
  _persist();
}

function moveViewerToTab(id: string, tabId: string) {
  _viewers = _viewers.map(v => v.id === id ? { ...v, tabId } : v);
  _notify();
  _persist();
}

function useViewerStore() {
  const [viewers, set] = useState<ViewerInfo[]>([..._viewers]);
  useEffect(() => { _viewerSubs.add(set); return () => { _viewerSubs.delete(set); }; }, []);
  return viewers;
}

// ─── ColorPicker ──────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="fsw-colorpicker">
      {FS_COLORS.map(c => (
        <button key={c} type="button" className={`fsw-swatch${c === value ? ' active' : ''}`}
          style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
    </div>
  );
}

// ─── Context menu ─────────────────────────────────────────────────────────────
interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

function CtxMenu({ items, x, y, onClose }: { items: MenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h, true);
    return () => document.removeEventListener('mousedown', h, true);
  }, [onClose]);
  const sx = Math.min(x, window.innerWidth - 180);
  const sy = Math.min(y, window.innerHeight - items.length * 34 - 8);
  return createPortal(
    <div ref={ref} className="fsw-ctxmenu" style={{ left: sx, top: sy }}>
      {items.map((item, i) =>
        item.divider ? <div key={i} className="fsw-ctx-divider" /> : (
          <button
            key={i}
            className={`fsw-ctx-item${item.danger ? ' danger' : ''}${item.disabled ? ' disabled' : ''}`}
            onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
          >{item.label}</button>
        )
      )}
    </div>,
    document.body
  );
}

// ─── Overlay / Dialog ─────────────────────────────────────────────────────────
function Overlay({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="fsw-overlay" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fsw-dialog">{children}</div>
    </div>,
    document.body
  );
}

function DlgHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="fsw-dlg-header">
      <span className="fsw-dlg-title">{title}</span>
      <button className="fsw-dlg-close" onClick={onClose}><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function DlgFooter({ children }: { children: ReactNode }) {
  return <div className="fsw-dlg-footer">{children}</div>;
}

function FormRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fsw-form-row">
      <label className="fsw-form-label">{label}</label>
      {children}
    </div>
  );
}

// ─── Dialogs ──────────────────────────────────────────────────────────────────
interface PendingFile { file: File; nickname: string; color: string; folderId: string | null; }

function AddFileDialog({
  files, folders, onAdd, onClose,
}: { files: File[]; folders: ShelfFolder[]; onAdd: (p: PendingFile[]) => void; onClose: () => void }) {
  const [entries, setEntries] = useState<PendingFile[]>(() =>
    files.map(f => ({ file: f, nickname: f.name.replace(/\.[^.]+$/, ''), color: FS_COLORS[0], folderId: null }))
  );
  const up = (i: number, patch: Partial<PendingFile>) =>
    setEntries(prev => prev.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const multi = entries.length > 1;
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title={`Add ${multi ? `${entries.length} Files` : 'File'}`} onClose={onClose} />
      <div className="fsw-dlg-body">
        {entries.map((entry, i) => (
          <div key={i}>
            {multi && <div className="fsw-add-filename">{entry.file.name}</div>}
            {!multi && <FormRow label="Nickname">
              <input className="fsw-input" value={entry.nickname} onChange={e => up(0, { nickname: e.target.value })} placeholder={entry.file.name} autoFocus />
            </FormRow>}
            {!multi && <FormRow label="Color"><ColorPicker value={entry.color} onChange={c => up(0, { color: c })} /></FormRow>}
            {!multi && folders.length > 0 && (
              <FormRow label="Folder">
                <select className="fsw-select" value={entry.folderId ?? ''} onChange={e => up(0, { folderId: e.target.value || null })}>
                  <option value="">Main File Shelf</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </FormRow>
            )}
          </div>
        ))}
        {multi && (
          <>
            <FormRow label="Color"><ColorPicker value={entries[0].color} onChange={c => setEntries(prev => prev.map(e => ({ ...e, color: c })))} /></FormRow>
            {folders.length > 0 && (
              <FormRow label="Folder">
                <select className="fsw-select" value={entries[0].folderId ?? ''} onChange={e => {
                  const fid = e.target.value || null;
                  setEntries(prev => prev.map(p => ({ ...p, folderId: fid })));
                }}>
                  <option value="">Main File Shelf</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </FormRow>
            )}
          </>
        )}
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        <button className="fsw-btn-primary" onClick={() => onAdd(entries)}>
          Add {multi ? `${entries.length} Files` : 'File'}
        </button>
      </DlgFooter>
    </Overlay>
  );
}

function CreateFolderDialog({ onCreate, onClose }: { onCreate: (name: string, color: string) => void; onClose: () => void }) {
  const [name, setName]   = useState('');
  const [color, setColor] = useState(FS_COLORS[0]);
  const confirm = () => { if (name.trim()) onCreate(name.trim(), color); };
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title="Create Folder" onClose={onClose} />
      <div className="fsw-dlg-body">
        <FormRow label="Folder Name">
          <input className="fsw-input" value={name} onChange={e => setName(e.target.value)}
            placeholder="New Folder" autoFocus onKeyDown={e => e.key === 'Enter' && confirm()} />
        </FormRow>
        <FormRow label="Color"><ColorPicker value={color} onChange={setColor} /></FormRow>
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        <button className="fsw-btn-primary" disabled={!name.trim()} onClick={confirm}>Create Folder</button>
      </DlgFooter>
    </Overlay>
  );
}

function RemoveFileDialog({ file, onConfirm, onClose }: { file: ShelfFile; onConfirm: () => void; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title="Remove File?" onClose={onClose} />
      <div className="fsw-dlg-body">
        <p className="fsw-dlg-text">Remove <strong>{file.nickname}</strong> from File Shelf?</p>
        <p className="fsw-dlg-note">This will not delete the original file from your computer.</p>
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        <button className="fsw-btn-danger" onClick={() => { onConfirm(); onClose(); }}>Remove</button>
      </DlgFooter>
    </Overlay>
  );
}

function DeleteFolderDialog({ folder, fileCount, onMoveFiles, onRemoveFiles, onClose }: {
  folder: ShelfFolder; fileCount: number;
  onMoveFiles: () => void; onRemoveFiles: () => void; onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title="Delete Folder" onClose={onClose} />
      <div className="fsw-dlg-body">
        {fileCount > 0 ? (
          <>
            <p className="fsw-dlg-text">
              This folder contains <strong>{fileCount}</strong> file{fileCount !== 1 ? 's' : ''}. What should happen to them?
            </p>
            <p className="fsw-dlg-note">Neither option deletes original files from your computer.</p>
          </>
        ) : (
          <p className="fsw-dlg-text">Delete <strong>{folder.name}</strong>? This cannot be undone.</p>
        )}
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        {fileCount > 0 && (
          <button className="fsw-btn-secondary" onClick={() => { onMoveFiles(); onClose(); }}>Move to Main Shelf</button>
        )}
        <button className="fsw-btn-danger" onClick={() => { fileCount > 0 ? onRemoveFiles() : onMoveFiles(); onClose(); }}>
          {fileCount > 0 ? 'Remove Files' : 'Delete Folder'}
        </button>
      </DlgFooter>
    </Overlay>
  );
}

function EditFileDialog({ file, folders, onSave, onClose }: {
  file: ShelfFile; folders: ShelfFolder[];
  onSave: (nickname: string, color: string, folderId: string | null) => void;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(file.nickname);
  const [color, setColor]       = useState(file.color);
  const [folderId, setFolderId] = useState<string | null>(file.folderId);
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title="Edit File" onClose={onClose} />
      <div className="fsw-dlg-body">
        <FormRow label="Nickname">
          <input className="fsw-input" value={nickname} onChange={e => setNickname(e.target.value)} autoFocus />
        </FormRow>
        <FormRow label="Color"><ColorPicker value={color} onChange={setColor} /></FormRow>
        {folders.length > 0 && (
          <FormRow label="Folder">
            <select className="fsw-select" value={folderId ?? ''} onChange={e => setFolderId(e.target.value || null)}>
              <option value="">Main File Shelf</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </FormRow>
        )}
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        <button className="fsw-btn-primary" onClick={() => onSave(nickname.trim() || file.filename, color, folderId)}>Save</button>
      </DlgFooter>
    </Overlay>
  );
}

function EditFolderDialog({ folder, onSave, onClose }: {
  folder: ShelfFolder;
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}) {
  const [name, setName]   = useState(folder.name);
  const [color, setColor] = useState(folder.color);
  const confirm = () => { if (name.trim()) onSave(name.trim(), color); };
  return (
    <Overlay onClose={onClose}>
      <DlgHeader title="Edit Folder" onClose={onClose} />
      <div className="fsw-dlg-body">
        <FormRow label="Name">
          <input className="fsw-input" value={name} onChange={e => setName(e.target.value)}
            autoFocus onKeyDown={e => e.key === 'Enter' && confirm()} />
        </FormRow>
        <FormRow label="Color"><ColorPicker value={color} onChange={setColor} /></FormRow>
      </div>
      <DlgFooter>
        <button className="fsw-btn-secondary" onClick={onClose}>Cancel</button>
        <button className="fsw-btn-primary" disabled={!name.trim()} onClick={confirm}>Save</button>
      </DlgFooter>
    </Overlay>
  );
}

// ─── FileShelfWidget ──────────────────────────────────────────────────────────
export function FileShelfWidget() {
  const [data, setData]           = useState<ShelfData>(() => readShelf());
  const [query, setQuery]         = useState('');
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu]     = useState<{ type: 'file' | 'folder'; id: string; x: number; y: number } | null>(null);
  const [addFileDlg, setAddFileDlg]     = useState<File[] | null>(null);
  const [createFolderDlg, setCreateFolderDlg] = useState(false);
  const [removeDlg, setRemoveDlg]       = useState<ShelfFile | null>(null);
  const [deleteFolderDlg, setDeleteFolderDlg] = useState<ShelfFolder | null>(null);
  const [editFileDlg, setEditFileDlg]   = useState<ShelfFile | null>(null);
  const [editFolderDlg, setEditFolderDlg] = useState<ShelfFolder | null>(null);
  const [dragFileId, setDragFileId]     = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { writeShelf(data); }, [data]);

  const update = useCallback((fn: (d: ShelfData) => ShelfData) => setData(fn), []);

  // ── Add files ──────────────────────────────────────────────────────────────
  const handleAddFiles = async (pending: PendingFile[]) => {
    const newFiles: ShelfFile[] = await Promise.all(pending.map(async (p, i) => {
      const dataUrl = await readFileAsDataUrl(p.file).catch(() => undefined);
      return {
        id: crypto.randomUUID(),
        nickname: p.nickname.trim() || p.file.name,
        filename: p.file.name,
        mimeType: p.file.type || 'application/octet-stream',
        color: p.color,
        folderId: p.folderId,
        order: nextOrder(data.files) + i,
        dataUrl,
      };
    }));
    update(d => ({ ...d, files: [...d.files, ...newFiles] }));
    setAddFileDlg(null);
  };

  // ── Folders ────────────────────────────────────────────────────────────────
  const createFolder = useCallback((name: string, color: string) => {
    update(d => ({ ...d, folders: [...d.folders, { id: crypto.randomUUID(), name, color, order: nextOrder(d.folders) }] }));
    setCreateFolderDlg(false);
  }, [update]);

  const deleteFolder = useCallback((folderId: string, moveFiles: boolean) => {
    update(d => ({
      files: moveFiles
        ? d.files.map(f => f.folderId === folderId ? { ...f, folderId: null } : f)
        : d.files.filter(f => f.folderId !== folderId),
      folders: d.folders.filter(f => f.id !== folderId),
    }));
    if (openFolderId === folderId) setOpenFolderId(null);
  }, [update, openFolderId]);

  const saveFolder = useCallback((folderId: string, name: string, color: string) => {
    update(d => ({ ...d, folders: d.folders.map(f => f.id === folderId ? { ...f, name, color } : f) }));
  }, [update]);

  // ── Files ──────────────────────────────────────────────────────────────────
  const removeFile  = useCallback((id: string) => update(d => ({ ...d, files: d.files.filter(f => f.id !== id) })), [update]);
  const moveFile    = useCallback((fileId: string, folderId: string | null) => update(d => ({ ...d, files: d.files.map(f => f.id === fileId ? { ...f, folderId } : f) })), [update]);
  const saveFile    = useCallback((fileId: string, nickname: string, color: string, folderId: string | null) =>
    update(d => ({ ...d, files: d.files.map(f => f.id === fileId ? { ...f, nickname, color, folderId } : f) })), [update]);

  // ── Context menu items ─────────────────────────────────────────────────────
  const fileCtxItems = useCallback((fileId: string): MenuItem[] => {
    const file = data.files.find(f => f.id === fileId);
    if (!file) return [];
    const folderDests: MenuItem[] = [];
    if (file.folderId !== null)
      folderDests.push({ label: '↩ Main File Shelf', onClick: () => moveFile(fileId, null) });
    data.folders.forEach(folder => {
      if (folder.id !== file.folderId)
        folderDests.push({ label: `→ ${folder.name}`, onClick: () => moveFile(fileId, folder.id) });
    });
    return [
      { label: 'Open',  onClick: () => openShelfViewer(file) },
      { label: 'Edit…', onClick: () => setEditFileDlg(file) },
      ...(folderDests.length > 0 ? [{ divider: true, label: '', onClick: () => {} }, ...folderDests, { divider: true, label: '', onClick: () => {} }] : [{ divider: true, label: '', onClick: () => {} }]),
      { label: 'Remove from File Shelf', onClick: () => setRemoveDlg(file), danger: true },
    ];
  }, [data.files, data.folders, moveFile]);

  const folderCtxItems = useCallback((folderId: string): MenuItem[] => {
    const folder = data.folders.find(f => f.id === folderId);
    if (!folder) return [];
    return [
      { label: 'Open',                   onClick: () => { setOpenFolderId(folderId); setQuery(''); } },
      { label: 'Rename / Change Color',  onClick: () => setEditFolderDlg(folder) },
      { divider: true, label: '', onClick: () => {} },
      { label: 'Delete Folder',          onClick: () => setDeleteFolderDlg(folder), danger: true },
    ];
  }, [data.folders]);

  // ── Drag-drop (external files into widget) ─────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) setAddFileDlg(files);
  }, []);

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const isSearching = query.trim().length > 0;
  const q = query.toLowerCase().trim();

  const visibleFolders = useMemo(() => {
    if (openFolderId !== null || isSearching) return [];
    return data.folders.slice().sort((a, b) => a.order - b.order);
  }, [data.folders, openFolderId, isSearching]);

  const visibleFiles = useMemo(() => {
    const sorted = data.files.slice().sort((a, b) => a.order - b.order);
    if (isSearching) {
      return sorted.filter(f =>
        f.nickname.toLowerCase().includes(q) ||
        f.filename.toLowerCase().includes(q)
      );
    }
    if (openFolderId !== null) return sorted.filter(f => f.folderId === openFolderId);
    return sorted.filter(f => f.folderId === null);
  }, [data.files, openFolderId, isSearching, q]);

  const openFolder = data.folders.find(f => f.id === openFolderId) ?? null;

  return (
    <div className="fsw-fill" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>

      {/* Header */}
      <div className="widget-header">
        <span className="widget-label"><Bookmark className="w-3.5 h-3.5" /> File Shelf</span>
      </div>

      {/* Breadcrumb / back button */}
      {openFolderId !== null && !isSearching && (
        <button className="fsw-back-btn" onClick={() => setOpenFolderId(null)}>
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="fsw-breadcrumb">File Shelf / {openFolder?.name ?? 'Folder'}</span>
        </button>
      )}

      {/* Search */}
      <div className="fsw-search-row">
        <Search className="fsw-search-icon" />
        <input
          className="fsw-search-input"
          placeholder="Search File Shelf…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className="fsw-search-clear" onClick={() => setQuery('')}><X className="w-3 h-3" /></button>
        )}
      </div>

      {/* Controls */}
      {!isSearching && (
        <div className="fsw-controls">
          <button className="fsw-ctrl-btn" onClick={() => fileInputRef.current?.click()}>
            <FilePlus2 className="w-3 h-3" /> Add File
          </button>
          {openFolderId === null && (
            <button className="fsw-ctrl-btn" onClick={() => setCreateFolderDlg(true)}>
              <FolderPlus className="w-3 h-3" /> Create Folder
            </button>
          )}
          <input
            ref={fileInputRef} type="file" multiple className="fsw-hidden-input"
            onChange={e => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) setAddFileDlg(files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* Scrollable list */}
      <div className="fsw-list">

        {/* Folders */}
        {visibleFolders.map(folder => (
          <div
            key={folder.id}
            className={`fsw-row fsw-folder-row${dragOverFolderId === folder.id ? ' drag-over' : ''}`}
            onClick={() => { setOpenFolderId(folder.id); setQuery(''); }}
            onContextMenu={e => { e.preventDefault(); setCtxMenu({ type: 'folder', id: folder.id, x: e.clientX, y: e.clientY }); }}
            onDragOver={e => { e.preventDefault(); setDragOverFolderId(folder.id); }}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={e => { e.preventDefault(); if (dragFileId) moveFile(dragFileId, folder.id); setDragFileId(null); setDragOverFolderId(null); }}
          >
            <span className="fsw-color-dot" style={{ background: folder.color }} />
            <Folder className="fsw-row-icon" />
            <span className="fsw-row-name">{folder.name}</span>
            <span className="fsw-folder-count">{data.files.filter(f => f.folderId === folder.id).length}</span>
          </div>
        ))}

        {/* Divider between folders and files */}
        {visibleFolders.length > 0 && visibleFiles.length > 0 && (
          <div className="fsw-section-divider" />
        )}

        {/* Files */}
        {visibleFiles.map(file => {
          const parentFolder = isSearching && file.folderId
            ? data.folders.find(f => f.id === file.folderId) : null;
          return (
            <div
              key={file.id}
              className="fsw-row fsw-file-row"
              draggable
              onDragStart={() => setDragFileId(file.id)}
              onDragEnd={() => { setDragFileId(null); setDragOverFolderId(null); }}
              onClick={() => openShelfViewer(file)}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ type: 'file', id: file.id, x: e.clientX, y: e.clientY }); }}
            >
              <span className="fsw-color-dot" style={{ background: file.color }} />
              {fileIcon(file.mimeType)}
              <div className="fsw-file-body">
                <span className="fsw-file-nick">{file.nickname}</span>
                {file.nickname !== file.filename && (
                  <span className="fsw-file-fname">{file.filename}</span>
                )}
                {parentFolder && <span className="fsw-folder-tag">{parentFolder.name}</span>}
              </div>
              <button
                className="fsw-remove-btn" title="Remove from File Shelf"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setRemoveDlg(file); }}
              ><X className="w-3 h-3" /></button>
            </div>
          );
        })}

        {/* Empty state */}
        {visibleFiles.length === 0 && visibleFolders.length === 0 && (
          <div className="fsw-empty">
            {isSearching
              ? 'No results.'
              : openFolderId !== null
              ? 'This folder is empty.'
              : <><span>Drop files here</span><span className="fsw-empty-sub">or use + Add File above</span></>}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CtxMenu
          x={ctxMenu.x} y={ctxMenu.y}
          items={ctxMenu.type === 'file' ? fileCtxItems(ctxMenu.id) : folderCtxItems(ctxMenu.id)}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* Dialogs */}
      {addFileDlg && <AddFileDialog files={addFileDlg} folders={data.folders} onAdd={handleAddFiles} onClose={() => setAddFileDlg(null)} />}
      {createFolderDlg && <CreateFolderDialog onCreate={createFolder} onClose={() => setCreateFolderDlg(false)} />}
      {removeDlg && <RemoveFileDialog file={removeDlg} onConfirm={() => removeFile(removeDlg.id)} onClose={() => setRemoveDlg(null)} />}
      {deleteFolderDlg && (
        <DeleteFolderDialog
          folder={deleteFolderDlg}
          fileCount={data.files.filter(f => f.folderId === deleteFolderDlg.id).length}
          onMoveFiles={() => deleteFolder(deleteFolderDlg.id, true)}
          onRemoveFiles={() => deleteFolder(deleteFolderDlg.id, false)}
          onClose={() => setDeleteFolderDlg(null)}
        />
      )}
      {editFileDlg && (
        <EditFileDialog
          file={editFileDlg} folders={data.folders}
          onSave={(n, c, f) => { saveFile(editFileDlg.id, n, c, f); setEditFileDlg(null); }}
          onClose={() => setEditFileDlg(null)}
        />
      )}
      {editFolderDlg && (
        <EditFolderDialog
          folder={editFolderDlg}
          onSave={(n, c) => { saveFolder(editFolderDlg.id, n, c); setEditFolderDlg(null); }}
          onClose={() => setEditFolderDlg(null)}
        />
      )}
    </div>
  );
}

// ─── Viewer content renderers ─────────────────────────────────────────────────
function PdfContent({ dataUrl }: { dataUrl: string }) {
  const buf = useMemo(() => dataUrlToBuffer(dataUrl), [dataUrl]);
  return <PdfViewer data={buf} defaultFit={true} />;
}

function ImageContent({ dataUrl }: { dataUrl: string }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="fsv-image-wrap">
      <div className="fsv-img-controls">
        <button className="fsv-zoom-btn" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}><ZoomOut className="w-3.5 h-3.5" /></button>
        <span className="fsv-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button className="fsv-zoom-btn" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}><ZoomIn className="w-3.5 h-3.5" /></button>
        <button className="fsv-zoom-btn fsv-fit-btn" onClick={() => setZoom(1)}>Fit</button>
      </div>
      <div className="fsv-img-scroll">
        <img src={dataUrl} alt="Preview" className="fsv-img" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }} draggable={false} />
      </div>
    </div>
  );
}

function XlsxContent({ dataUrl }: { dataUrl: string }) {
  const buf = useMemo(() => dataUrlToBuffer(dataUrl), [dataUrl]);
  return <XlsxViewer data={buf} />;
}

function TextContent({ dataUrl }: { dataUrl: string }) {
  const text = useMemo(() => {
    try { return atob(dataUrl.split(',')[1] ?? ''); }
    catch { return 'Could not decode file contents.'; }
  }, [dataUrl]);
  return <div className="fsv-text-scroll"><pre className="fsv-text-pre">{text}</pre></div>;
}

function UnavailableContent({ file }: { file: ShelfFile }) {
  const handleDownload = () => {
    if (!file.dataUrl) return;
    const a = document.createElement('a');
    a.href = file.dataUrl; a.download = file.filename; a.click();
  };
  return (
    <div className="fsv-unavail">
      <AlertTriangle className="w-8 h-8 fsv-unavail-icon" />
      <p className="fsv-unavail-title">
        {file.dataUrl ? 'Preview unavailable' : 'File unavailable'}
      </p>
      <p className="fsv-unavail-sub">
        {file.dataUrl
          ? `${file.filename} — this file type cannot be previewed.`
          : `File Shelf can't preview this file. It may have been too large to store, or the data is no longer available.`}
      </p>
      {file.dataUrl && (
        <button className="fsw-btn-secondary" onClick={handleDownload}>Download File</button>
      )}
    </div>
  );
}

function ViewerContent({ file }: { file: ShelfFile }) {
  if (!file.dataUrl)                                                    return <UnavailableContent file={file} />;
  if (file.mimeType === 'application/pdf')                              return <PdfContent dataUrl={file.dataUrl} />;
  if (file.mimeType.startsWith('image/'))                               return <ImageContent dataUrl={file.dataUrl} />;
  if (file.mimeType.includes('spreadsheet') || file.mimeType.includes('excel')) return <XlsxContent dataUrl={file.dataUrl} />;
  if (file.mimeType.startsWith('text/') || file.mimeType === 'text/csv') return <TextContent dataUrl={file.dataUrl} />;
  return <UnavailableContent file={file} />;
}

// ─── Floating viewer panel ────────────────────────────────────────────────────
function FileShelfViewer({ info }: { info: ViewerInfo }) {
  const dragRef    = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);
  const resizeRef  = useRef<{ sw: number; sh: number; px: number; py: number } | null>(null);
  const [moveMenu, setMoveMenu] = useState<{ x: number; y: number } | null>(null);
  const MIN_W = 340, MIN_H = 260;

  const otherTabs = useMemo(
    () => getAvailableTabs().filter(t => t.tabId !== info.tabId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [info.tabId, info.id], // re-derive when viewer identity changes
  );

  const moveItems: MenuItem[] = useMemo(
    () => otherTabs.map(t => ({
      label: `Move to ${t.label}`,
      onClick: () => { moveViewerToTab(info.id, t.tabId); setMoveMenu(null); },
    })),
    [otherTabs, info.id],
  );

  const handleMoveBtnClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (moveMenu) { setMoveMenu(null); return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMoveMenu({ x: rect.left, y: rect.bottom + 4 });
  }, [moveMenu]);

  return (
    <div className="fsv-panel" style={{ left: info.x, top: info.y, width: info.w, height: info.h }}>
      {/* Title bar — drag handle */}
      <div
        className="fsv-titlebar"
        onPointerDown={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { sx: info.x, sy: info.y, px: e.clientX, py: e.clientY };
        }}
        onPointerMove={e => {
          if (!dragRef.current) return;
          patchViewer(info.id, {
            x: Math.max(0, dragRef.current.sx + (e.clientX - dragRef.current.px)),
            y: Math.max(0, dragRef.current.sy + (e.clientY - dragRef.current.py)),
          });
        }}
        onPointerUp={() => { dragRef.current = null; }}
      >
        <span className="fsv-title-icon">{fileIcon(info.file.mimeType)}</span>
        <span className="fsv-title-text" title={info.file.nickname}>{info.file.nickname}</span>
        <span className="fsv-title-fname">{info.file.filename}</span>
        {/* Move-to-tab button (only shown when other tabs exist) */}
        {otherTabs.length > 0 && (
          <button
            className="fsv-move-btn"
            title="Move to another tab"
            onPointerDown={e => e.stopPropagation()}
            onClick={handleMoveBtnClick}
          >⇄</button>
        )}
        <button className="fsv-close-btn" onPointerDown={e => e.stopPropagation()} onClick={() => closeViewer(info.id)}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="fsv-body">
        <ViewerContent file={info.file} />
      </div>

      {/* Resize handle */}
      <div
        className="fsv-resize"
        onPointerDown={e => {
          e.preventDefault();
          e.stopPropagation();
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          resizeRef.current = { sw: info.w, sh: info.h, px: e.clientX, py: e.clientY };
        }}
        onPointerMove={e => {
          if (!resizeRef.current) return;
          patchViewer(info.id, {
            w: Math.max(MIN_W, resizeRef.current.sw + (e.clientX - resizeRef.current.px)),
            h: Math.max(MIN_H, resizeRef.current.sh + (e.clientY - resizeRef.current.py)),
          });
        }}
        onPointerUp={() => { resizeRef.current = null; }}
      />

      {/* Move-to-tab context menu */}
      {moveMenu && moveItems.length > 0 && (
        <CtxMenu items={moveItems} x={moveMenu.x} y={moveMenu.y} onClose={() => setMoveMenu(null)} />
      )}
    </div>
  );
}

// ─── Viewer layer (mount once at app level, tab-filtered) ─────────────────────
export function FileShelfViewerLayer() {
  const [currentTab, setCurrentTab] = useState(getCurrentTab);
  const viewers = useViewerStore();

  // Track hash changes so we always show the right tab's viewers
  useEffect(() => {
    const handler = () => setCurrentTab(getCurrentTab());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const tabViewers = viewers.filter(v => v.tabId === currentTab);
  if (tabViewers.length === 0) return null;
  return createPortal(
    <div className="fsv-layer">
      {tabViewers.map(v => <FileShelfViewer key={v.id} info={v} />)}
    </div>,
    document.body
  );
}
