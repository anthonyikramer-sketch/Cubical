import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Check, ClipboardCopy, Clock, ExternalLink, FolderOpen, FolderSearch,
  HardDrive, Lock, Search, Share2, X,
} from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';
import {
  SEND_TO_REGISTRY, getCompatibleDestinations, getDefaultDest, setDefaultDest,
  getSendToFollow, setSendToFollow, extToCategory, extToMime, enqueueHandoffs,
  type FileHandoff, type FileCategory,
} from '../shared/sendTo';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FileResult {
  name:     string;
  path:     string;
  dir:      string;
  size:     number;
  modified: number;
  ext:      string;
}

type FileTypeCategory = 'all' | 'documents' | 'pdfs' | 'spreadsheets' | 'images' | 'videos' | 'audio' | 'archives';
type DateCategory     = 'anytime' | 'today' | 'week' | 'month' | 'year';
type SortField        = 'relevance' | 'name' | 'date' | 'size' | 'type';
type SearchScope      = 'common' | 'custom' | 'all';

const FILE_TYPE_EXTS: Record<FileTypeCategory, string[]> = {
  all:          [],
  documents:    ['.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.md'],
  pdfs:         ['.pdf'],
  spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
  images:       ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.heic', '.cr2', '.nef', '.arw', '.dng'],
  videos:       ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'],
  audio:        ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'],
  archives:     ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
};

const RECENT_SEARCHES_KEY  = 'cubical-file-finder-recent';
const FF_PENDING_QUERY_KEY = 'cubical-file-finder-pending';

function readLocal<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

function writeLocal(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatModDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function highlightMatch(name: string, query: string): React.ReactNode {
  if (!query.trim()) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>{name.slice(0, idx)}<mark className="ff-highlight">{name.slice(idx, idx + query.length)}</mark>{name.slice(idx + query.length)}</>
  );
}

function getFileIcon(ext: string): React.ReactNode {
  const e = ext.toLowerCase();
  if (['.mp3','.wav','.flac','.aac','.m4a','.ogg','.wma'].includes(e)) return '♪';
  if (['.pdf'].includes(e)) return '📄';
  if (['.xls','.xlsx','.csv','.ods','.numbers'].includes(e)) return '📊';
  if (['.zip','.rar','.7z','.tar','.gz','.bz2'].includes(e)) return '🗜';
  return '📁';
}

const FF_TYPE_OPTS: { key: FileTypeCategory; label: string }[] = [
  { key: 'all',          label: 'All Files'    },
  { key: 'documents',    label: 'Documents'    },
  { key: 'pdfs',         label: 'PDFs'         },
  { key: 'spreadsheets', label: 'Spreadsheets' },
  { key: 'images',       label: 'Images'       },
  { key: 'videos',       label: 'Videos'       },
  { key: 'audio',        label: 'Audio'        },
  { key: 'archives',     label: 'Archives'     },
];

const FF_DATE_OPTS: { key: DateCategory; label: string }[] = [
  { key: 'anytime', label: 'Anytime'    },
  { key: 'today',   label: 'Today'      },
  { key: 'week',    label: 'This Week'  },
  { key: 'month',   label: 'This Month' },
  { key: 'year',    label: 'This Year'  },
];

const FF_SORT_OPTS: { key: SortField; label: string }[] = [
  { key: 'relevance', label: 'Relevance'     },
  { key: 'name',      label: 'Name'          },
  { key: 'date',      label: 'Date modified' },
  { key: 'size',      label: 'File size'     },
  { key: 'type',      label: 'Type'          },
];

export function FileFinderPage() {
  const ff         = typeof window !== 'undefined' ? window.cubicalDesktop?.fileFinder : undefined;
  const isDesktop  = !!ff;

  // ── Search state ──
  const [query,          setQuery]         = useState('');
  const [results,        setResults]       = useState<FileResult[]>([]);
  const [hasSearched,    setHasSearched]   = useState(false);
  const [searching,      setSearching]     = useState(false);
  const [progress,       setProgress]      = useState<{ found: number; scanning: string } | null>(null);
  const [scope,          setScope]         = useState<SearchScope>('common');
  const [customFolder,   setCustomFolder]  = useState<string | null>(null);
  const [typeFilter,     setTypeFilter]    = useState<FileTypeCategory>('all');
  const [dateFilter,     setDateFilter]    = useState<DateCategory>('anytime');
  const [sortBy,         setSortBy]        = useState<SortField>('relevance');
  const [sortAsc,        setSortAsc]       = useState(true);
  const [copiedPath,     setCopiedPath]    = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readLocal<string[]>(RECENT_SEARCHES_KEY, [], isStringArray),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Send To state ──
  const [follow, setFollow] = useState<boolean>(getSendToFollow);
  const [sendToDefaults, setSendToDefaults] = useState<Record<FileCategory, string | null>>(() => ({
    pdf:   getDefaultDest('pdf'),
    image: getDefaultDest('image'),
    other: getDefaultDest('other'),
  }));
  const [pickerState, setPickerState] = useState<{
    file: FileResult; anchorY: number; anchorX: number;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [sendingPath,  setSendingPath]  = useState<string | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Effects ──
  useEffect(() => {
    try {
      const pending = window.localStorage?.getItem(FF_PENDING_QUERY_KEY);
      if (pending) { window.localStorage.removeItem(FF_PENDING_QUERY_KEY); setQuery(pending); }
    } catch { /* unavailable */ }
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!ff) return;
    const unsub1 = ff.onProgress(setProgress);
    const unsub2 = ff.onComplete((data) => { setResults(data.results); setSearching(false); setProgress(null); });
    return () => { unsub1(); unsub2(); };
  }, [ff]);

  // Close picker on Escape
  useEffect(() => {
    if (!pickerState) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerState(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pickerState]);

  // ── Search helpers ──
  const doSearch = (overrideQuery?: string) => {
    if (!ff) return;
    const term = (overrideQuery ?? query).trim();
    if (!term) return;
    const folders = scope === 'custom' && customFolder
      ? [customFolder]
      : scope === 'all' ? ['__ALL_DRIVES__'] : ['__COMMON_FOLDERS__'];
    const next = [term, ...recentSearches.filter((s) => s !== term)].slice(0, 8);
    setRecentSearches(next);
    writeLocal(RECENT_SEARCHES_KEY, next);
    setSearching(true); setResults([]); setHasSearched(true);
    setProgress({ found: 0, scanning: 'Starting…' });
    ff.startSearch(term, folders);
  };

  const handleCancel = () => { ff?.cancelSearch(); setSearching(false); setProgress(null); };

  const handleChooseFolder = async () => {
    if (!ff) return;
    const folder = await ff.chooseFolderDialog();
    if (folder) { setCustomFolder(folder); setScope('custom'); }
  };

  const handleCopyPath = async (filePath: string) => {
    try {
      await navigator.clipboard.writeText(filePath);
      setCopiedPath(filePath);
      setTimeout(() => setCopiedPath((p) => (p === filePath ? null : p)), 1800);
    } catch { /* unavailable */ }
  };

  const clearRecent = () => { setRecentSearches([]); writeLocal(RECENT_SEARCHES_KEY, []); };

  // ── Send To helpers ──
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  };

  const openPicker = (file: FileResult, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPickerState({ file, anchorY: rect.bottom + 6, anchorX: rect.left });
    setPickerSearch('');
  };

  const toggleFollow = () => {
    const next = !follow;
    setFollow(next);
    setSendToFollow(next);
  };

  const handleSendTo = async (file: FileResult, destId: string) => {
    const dest = SEND_TO_REGISTRY.find((d) => d.toolId === destId);
    if (!dest || !ff) return;
    setPickerState(null);
    setSendingPath(file.path);
    try {
      // Read bytes via Electron IPC (readFileBytes added to bridge)
      const ab: ArrayBuffer | null = await (ff as any).readFileBytes?.(file.path) ?? null;
      if (!ab) { showToast(`Could not read "${file.name}"`); return; }
      const category = extToCategory(file.ext);
      const handoff: FileHandoff = {
        id:         `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        name:       file.name,
        path:       file.path,
        ext:        file.ext,
        size:       file.size,
        mimeType:   extToMime(file.ext),
        sourceTool: 'file-finder',
        destTool:   destId,
        timestamp:  Date.now(),
        batchId:    `batch-${Date.now().toString(36)}`,
        bytes:      new Uint8Array(ab),
        autoOpen:   follow,
      };
      enqueueHandoffs(destId, [handoff]);
      // Persist default for this category
      setDefaultDest(category, destId);
      setSendToDefaults((prev) => ({ ...prev, [category]: destId }));
      if (follow) {
        window.location.hash = dest.route;
      } else {
        showToast(`Sent "${file.name}" to ${dest.label} ✓`);
      }
    } finally {
      setSendingPath(null);
    }
  };

  // ── Filtering / sorting ──
  const filteredResults = useMemo(() => {
    let out = results;
    if (typeFilter !== 'all') {
      const exts = FILE_TYPE_EXTS[typeFilter];
      out = out.filter((r) => exts.includes(r.ext));
    }
    if (dateFilter !== 'anytime') {
      const cutoffs: Record<string, number> = { today: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
      const cut = Date.now() - (cutoffs[dateFilter] ?? 0);
      out = out.filter((r) => r.modified >= cut);
    }
    return out;
  }, [results, typeFilter, dateFilter]);

  const sortedResults = useMemo(() => {
    const q = query.toLowerCase();
    const score = (r: FileResult) => r.name.toLowerCase() === q ? 2 : r.name.toLowerCase().startsWith(q) ? 1 : 0;
    return [...filteredResults].sort((a, b) => {
      let cmp = 0;
      if      (sortBy === 'relevance') cmp = score(b) - score(a);
      else if (sortBy === 'name')      cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'date')      cmp = b.modified - a.modified;
      else if (sortBy === 'size')      cmp = b.size - a.size;
      else if (sortBy === 'type')      cmp = a.ext.localeCompare(b.ext);
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredResults, sortBy, sortAsc, query]);

  // ── Desktop-required gate ──
  if (!isDesktop) {
    return (
      <section className="ff-page">
        <BackButton fallback="/library" label="Back to library" />
        <div className="page-intro">
          <div className="eyebrow">A focused little utility</div>
          <h1 className="display-title mt-4">File Finder.</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>It's here somewhere.</p>
        </div>
        <DisplacedWidgetBand />
        <div className="ff-desktop-required">
          <FolderSearch className="ff-dr-icon" />
          <h2 className="ff-dr-title">Desktop app required</h2>
          <p className="ff-dr-body">
            File Finder searches your real local filesystem — that's not possible from a browser.
            Run the Cubical desktop app on Windows to use it.
          </p>
          <div className="ff-privacy-badge">
            <Lock className="w-3.5 h-3.5 shrink-0" /> Your files stay on your computer.
          </div>
        </div>
      </section>
    );
  }

  const customLabel = customFolder
    ? (customFolder.split(/[\\/]/).filter(Boolean).pop() ?? customFolder)
    : 'Choose Folder';

  // ── Render ──
  return (
    <section className="ff-page">
      <BackButton fallback="/library" label="Back to library" />

      <div className="ff-header">
        <div className="page-intro !mb-0">
          <div className="eyebrow">A focused little utility</div>
          <h1 className="display-title mt-2">File Finder.</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>It's here somewhere.</p>
        </div>
        <div className="ff-privacy-badge">
          <Lock className="w-3.5 h-3.5 shrink-0" /> Your files stay on your computer.
        </div>
      </div>

      <DisplacedWidgetBand />

      <div className="ff-search-bar">
        <div className="ff-search-wrap">
          <Search className="ff-search-icon" />
          <input
            ref={inputRef}
            className="ff-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doSearch()}
            placeholder="Search your computer…"
            disabled={searching}
          />
          {query && !searching && (
            <button className="ff-search-clear" onClick={() => { setQuery(''); setHasSearched(false); setResults([]); inputRef.current?.focus(); }}>
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {searching
          ? <button className="button-quiet ff-action-btn" onClick={handleCancel}>Cancel</button>
          : <button className="button-primary ff-action-btn" onClick={() => doSearch()} disabled={!query.trim()}>Search</button>
        }
      </div>

      <div className="ff-scope-row">
        <button className={`ff-scope-btn${scope === 'common' ? ' active' : ''}`} onClick={() => setScope('common')}>
          Common Folders
        </button>
        <button className={`ff-scope-btn${scope === 'custom' ? ' active' : ''}`} onClick={handleChooseFolder}>
          <FolderOpen className="w-3.5 h-3.5 shrink-0" /> {customLabel}
        </button>
        <button
          className={`ff-scope-btn${scope === 'all' ? ' active' : ''}`}
          onClick={() => setScope('all')}
          title="Searches all available drives — may be slow on large disks"
        >
          <HardDrive className="w-3.5 h-3.5 shrink-0" /> Entire Computer
        </button>
      </div>

      <div className="ff-filters">
        <div className="ff-chip-row">
          {FF_TYPE_OPTS.map(({ key, label }) => (
            <button key={key} className={`ff-chip${typeFilter === key ? ' active' : ''}`} onClick={() => setTypeFilter(key)}>
              {label}
            </button>
          ))}
        </div>
        <div className="ff-chip-row">
          {FF_DATE_OPTS.map(({ key, label }) => (
            <button key={key} className={`ff-chip${dateFilter === key ? ' active' : ''}`} onClick={() => setDateFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {searching && progress && (
        <div className="ff-progress">
          <span className="ff-spinner" />
          <span className="ff-progress-text">
            {progress.found} found · scanning {progress.scanning.split(/[\\/]/).slice(-2).join('/')}
          </span>
        </div>
      )}

      {!searching && sortedResults.length > 0 && (
        <div className="ff-sort-bar">
          <span className="ff-result-count">
            {sortedResults.length} {sortedResults.length === 1 ? 'result' : 'results'}
            {filteredResults.length < results.length ? ` (filtered from ${results.length})` : ''}
          </span>
          {/* Follow toggle */}
          <div className="ff-follow-wrap">
            <span className="ff-follow-label-text">Follow</span>
            <button
              className={`ff-follow-btn${follow ? ' on' : ''}`}
              onClick={toggleFollow}
              title={follow ? 'Follow ON — navigates to tool after sending' : 'Follow OFF — stays in File Finder after sending'}
            >
              {follow ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="ff-sort-group">
            <span className="ff-sort-label">Sort:</span>
            {FF_SORT_OPTS.map(({ key, label }) => (
              <button
                key={key}
                className={`ff-sort-btn${sortBy === key ? ' active' : ''}`}
                onClick={() => sortBy === key ? setSortAsc(!sortAsc) : (setSortBy(key), setSortAsc(true))}
              >
                {label}{sortBy === key && <span className="ff-sort-arrow">{sortAsc ? ' ↑' : ' ↓'}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {!searching && hasSearched && (
        <div className="ff-results">
          {sortedResults.length === 0 ? (
            <div className="ff-empty">
              <FolderSearch className="ff-empty-icon" />
              <p>No luck. Try another name or somewhere else.</p>
            </div>
          ) : sortedResults.map((r) => {
            const category     = extToCategory(r.ext);
            const defaultId    = sendToDefaults[category] ?? null;
            const defaultDest  = defaultId ? SEND_TO_REGISTRY.find((d) => d.toolId === defaultId) : null;
            const compatible   = getCompatibleDestinations(r.ext);
            const isSending    = sendingPath === r.path;

            return (
              <div key={r.path} className="ff-row">
                <span className="ff-row-icon">{getFileIcon(r.ext)}</span>
                <div className="ff-row-main">
                  <div className="ff-row-name">{highlightMatch(r.name, query)}</div>
                  <div className="ff-row-path" title={r.path}>{r.dir}</div>
                  <div className="ff-row-meta">{formatBytes(r.size)} · {formatModDate(r.modified)}</div>
                </div>
                <div className="ff-row-actions">
                  <button className="ff-action" onClick={() => ff.openFile(r.path)} title="Open with default app">
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </button>
                  <button className="ff-action" onClick={() => ff.openLocation(r.path)} title="Show in File Explorer">
                    <FolderOpen className="w-3.5 h-3.5" /> Location
                  </button>
                  <button
                    className={`ff-action${copiedPath === r.path ? ' ff-action-copied' : ''}`}
                    onClick={() => handleCopyPath(r.path)}
                  >
                    {copiedPath === r.path
                      ? <><Check className="w-3.5 h-3.5" /> Copied</>
                      : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy Path</>}
                  </button>
                  {/* Send To — only show when compatible destinations exist */}
                  {compatible.length > 0 && (
                    <div className="ff-sendto-wrap">
                      <button
                        className={`ff-action ff-sendto-main${isSending ? ' ff-action-copied' : ''}`}
                        disabled={isSending}
                        onClick={(e) => {
                          if (defaultDest && !isSending) void handleSendTo(r, defaultDest.toolId);
                          else openPicker(r, e);
                        }}
                        title={defaultDest ? `Send to ${defaultDest.label}` : 'Send to another tool'}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {isSending
                          ? 'Sending…'
                          : defaultDest
                            ? <>Send to <span className="ff-sendto-dest">{defaultDest.label}</span></>
                            : 'Send to…'}
                      </button>
                      {/* Chevron always opens picker */}
                      <button
                        className="ff-sendto-chevron"
                        onClick={(e) => openPicker(r, e)}
                        title="Choose destination"
                        disabled={isSending}
                      >▾</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!hasSearched && !searching && recentSearches.length > 0 && (
        <div className="ff-recent">
          <div className="ff-recent-head">
            <span className="eyebrow">Recent searches</span>
            <button className="ff-recent-clear" onClick={clearRecent}>Clear</button>
          </div>
          <div className="ff-recent-list">
            {recentSearches.map((s) => (
              <button key={s} className="ff-recent-item" onClick={() => { setQuery(s); doSearch(s); }}>
                <Clock className="w-3 h-3 shrink-0 opacity-40" /> {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Destination picker overlay (fixed, dismisses on backdrop click) */}
      {pickerState && (
        <div className="ff-sendto-overlay" onMouseDown={() => setPickerState(null)}>
          <div
            className="ff-sendto-picker"
            style={{ top: pickerState.anchorY, left: pickerState.anchorX }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="ff-sendto-picker-head">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <input
                className="ff-sendto-picker-search"
                placeholder="Search tools…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                autoFocus
              />
            </div>
            {(() => {
              const compatible = getCompatibleDestinations(pickerState.file.ext);
              const filtered   = compatible.filter(
                (d) => !pickerSearch.trim() || d.label.toLowerCase().includes(pickerSearch.toLowerCase()),
              );
              return filtered.length === 0 ? (
                <p className="ff-sendto-picker-empty">No compatible tools found.</p>
              ) : filtered.map((dest) => (
                <button
                  key={dest.toolId}
                  className="ff-sendto-picker-item"
                  onClick={() => void handleSendTo(pickerState.file, dest.toolId)}
                >
                  {dest.label}
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="ff-sendto-toast">
          <Check className="w-3.5 h-3.5" style={{ color: 'hsl(var(--primary))' }} />
          {toast}
        </div>
      )}
    </section>
  );
}
