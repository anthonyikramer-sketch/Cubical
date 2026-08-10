import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCopy,
  Clock,
  Coffee,
  Crown,
  Download,
  ExternalLink,
  File,
  FilePlus2,
  FileArchive,
  FileScan,
  FileSpreadsheet,
  FileText,
  Files,
  FolderCog,
  FolderOpen,
  FolderSearch,
  Gamepad2,
  Grid2X2,
  GripHorizontal,
  HardDrive,
  House,
  Library as LibraryIcon,
  Lock,
  Music,
  PackageOpen,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  TableProperties,
  Timer,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';

// ─── File Finder — shared types & helpers ─────────────────────────────────────

interface FileResult {
  name: string;
  path: string;
  dir: string;
  size: number;
  modified: number; // ms timestamp
  ext: string;
}

// Extend the window type so TypeScript knows about the Electron bridge.
// When running as a web app the whole cubicalDesktop object will be undefined.
declare global {
  interface Window {
    cubicalDesktop?: {
      platform?: string;
      fileFinder?: {
        startSearch:        (query: string, folders: string[]) => void;
        cancelSearch:       () => void;
        openFile:           (filePath: string) => Promise<void>;
        openLocation:       (filePath: string) => Promise<void>;
        chooseFolderDialog: () => Promise<string | null>;
        onProgress:  (cb: (data: { found: number; scanning: string }) => void) => () => void;
        onComplete:  (cb: (data: { results: FileResult[] }) => void) => () => void;
      };
    };
  }
}

const RECENT_SEARCHES_KEY = 'cubical-file-finder-recent';
const FF_PENDING_QUERY_KEY = 'cubical-file-finder-pending';

type FileTypeCategory = 'all' | 'documents' | 'pdfs' | 'spreadsheets' | 'images' | 'videos' | 'audio' | 'archives';
type DateCategory    = 'anytime' | 'today' | 'week' | 'month' | 'year';
type SortField       = 'relevance' | 'name' | 'date' | 'size' | 'type';
type SearchScope     = 'common' | 'custom' | 'all';

const FILE_TYPE_EXTS: Record<FileTypeCategory, string[]> = {
  all:          [],
  documents:    ['.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.md'],
  pdfs:         ['.pdf'],
  spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
  images:       ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.heic'],
  videos:       ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'],
  audio:        ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'],
  archives:     ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
};

function getFileIcon(ext: string): ReactNode {
  const e = ext.toLowerCase();
  if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.tiff','.heic'].includes(e)) return <FileText />;
  if (['.mp4','.mov','.avi','.mkv','.wmv','.m4v','.webm'].includes(e)) return <FileText />;
  if (['.mp3','.wav','.flac','.aac','.m4a','.ogg','.wma'].includes(e)) return <Music />;
  if (['.pdf'].includes(e)) return <FileScan />;
  if (['.xls','.xlsx','.csv','.ods','.numbers'].includes(e)) return <FileSpreadsheet />;
  if (['.doc','.docx','.rtf','.odt','.pages','.md'].includes(e)) return <FileText />;
  if (['.zip','.rar','.7z','.tar','.gz','.bz2'].includes(e)) return <FileArchive />;
  if (['.txt'].includes(e)) return <FileText />;
  return <File />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)         return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatModDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function highlightMatch(name: string, query: string): ReactNode {
  if (!query.trim()) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>{name.slice(0, idx)}<mark className="ff-highlight">{name.slice(idx, idx + query.length)}</mark>{name.slice(idx + query.length)}</>
  );
}

// ─── Product catalog ──────────────────────────────────────────────────────────

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  icon: typeof Files;
  iconColor: string;
  iconBg: string;
};

const PRODUCTS: Product[] = [
  { id: 'file-organizer', name: 'File Organizer', description: 'A calmer way to sort, group, and find everything on your desktop.', price: '$1.99', icon: FolderCog, iconColor: 'hsl(164 48% 32%)', iconBg: 'hsl(164 48% 32% / .12)' },
  { id: 'spreadsheet-cleaner', name: 'Spreadsheet Cleaner', description: 'Sweep out the clutter hiding between your rows and columns.', price: '$2.99', icon: TableProperties, iconColor: 'hsl(31 75% 43%)', iconBg: 'hsl(31 75% 43% / .13)' },
  { id: 'pdf-toolkit', name: 'PDF Toolkit', description: 'Small, sharp tools for the PDFs you touch every day.', price: '$3.99', icon: FileScan, iconColor: 'hsl(1 68% 54%)', iconBg: 'hsl(1 68% 54% / .12)' },
  { id: 'bulk-file-renamer', name: 'Bulk File Renamer', description: 'Give a whole folder a thoughtful name in one quick pass.', price: 'FREE', icon: FileArchive, iconColor: 'hsl(226 45% 49%)', iconBg: 'hsl(226 45% 49% / .12)' },
  { id: 'duplicate-finder', name: 'Duplicate Finder', description: 'Spot the copies taking up space and keep the best version.', price: 'FREE', icon: Files, iconColor: 'hsl(287 40% 47%)', iconBg: 'hsl(287 40% 47% / .12)' },
  { id: 'file-finder', name: 'File Finder', description: 'Find the file. Skip the folder archaeology.', price: 'FREE', icon: FolderSearch, iconColor: 'hsl(197 55% 38%)', iconBg: 'hsl(197 55% 38% / .12)' },
];

const TOOL_ROUTES: Partial<Record<Product['id'], string>> = {
  'bulk-file-renamer':   '/tool/bulk-file-renamer',
  'spreadsheet-cleaner': '/tool/spreadsheet-cleaner',
  'file-finder':         '/tool/file-finder',
};

function getToolRoute(product: Product) { return TOOL_ROUTES[product.id]; }

// ─── Local-storage helpers ────────────────────────────────────────────────────

function readLocal<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

function writeLocal(key: string, value: unknown) {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const LIBRARY_STORAGE_KEY   = 'cubical-library';
const CALENDAR_STORAGE_KEY  = 'cubical-calendar-events';
const NOTEPAD_STORAGE_KEY   = 'cubical-notepad';
const CLOCK_SECONDS_KEY     = 'cubical-clock-seconds';
const LAYOUT_STORAGE_KEY    = 'cubical-home-layout';

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function getStoredLibrary(): string[] {
  const validIds = new Set(PRODUCTS.map((p) => p.id));
  const stored = readLocal<string[]>(LIBRARY_STORAGE_KEY, [], isStringArray).filter((id) => validIds.has(id));
  // file-finder is always free and pre-installed — ensure it is always in the library.
  return stored.includes('file-finder') ? stored : ['file-finder', ...stored];
}
function storeLibrary(ids: string[]) { writeLocal(LIBRARY_STORAGE_KEY, ids); }

// ─── Calendar types & storage ─────────────────────────────────────────────────

type CalendarEvent = { id: string; date: string; title: string; time: string; note: string; };

function isEventArray(v: unknown): v is CalendarEvent[] {
  if (!Array.isArray(v)) return false;
  return v.every((e) => e && typeof e === 'object' && 'id' in e && 'date' in e && 'title' in e);
}
function getStoredEvents(): CalendarEvent[] { return readLocal(CALENDAR_STORAGE_KEY, [], isEventArray); }
function storeEvents(events: CalendarEvent[]) { writeLocal(CALENDAR_STORAGE_KEY, events); }

// ─── Grid layout system ───────────────────────────────────────────────────────

const GRID_COLS = 12;
const GRID_ROWS = 10;
const GRID_GAP  = 10; // px
const CELL_H    = 82; // px, fixed row height

type WidgetId = 'calendar' | 'clock' | 'notepad' | 'file-finder';

type LayoutItem = { id: WidgetId; x: number; y: number; w: number; h: number; };

const WIDGET_LABELS: Record<WidgetId, string> = { calendar: 'Calendar', clock: 'Clock', notepad: 'Notepad', 'file-finder': 'File Finder' };

const WIDGET_MIN: Record<WidgetId, { w: number; h: number }> = {
  calendar:      { w: 2, h: 2 },
  clock:         { w: 2, h: 1 },
  notepad:       { w: 2, h: 2 },
  'file-finder': { w: 2, h: 1 },
};

const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'calendar', x: 0, y: 0, w: 7, h: 7 },
  { id: 'clock',    x: 7, y: 0, w: 5, h: 3 },
  { id: 'notepad',  x: 7, y: 3, w: 5, h: 5 },
];

function getStoredLayout(): LayoutItem[] {
  try {
    if (typeof window === 'undefined') return DEFAULT_LAYOUT;
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    // 'file-finder' is included so stored layouts with it are restored; it is not
    // in DEFAULT_LAYOUT so new users don't see it until a future "add widget" UI exists.
    const ids: WidgetId[] = ['calendar', 'clock', 'notepad', 'file-finder'];
    const result: LayoutItem[] = [];
    for (const id of ids) {
      const found = parsed.find((item: unknown) => item && typeof item === 'object' && (item as Record<string, unknown>).id === id);
      if (!found || typeof (found as Record<string, unknown>).x !== 'number') {
        const dflt = DEFAULT_LAYOUT.find((d) => d.id === id);
        if (!dflt) continue; // not in default layout — skip if also not in storage
        result.push(dflt);
        continue;
      }
      const f = found as Record<string, number>;
      const min = WIDGET_MIN[id];
      const w = Math.max(min.w, Math.min(GRID_COLS, f.w ?? min.w));
      const h = Math.max(min.h, Math.min(GRID_ROWS, f.h ?? min.h));
      result.push({
        id,
        x: Math.max(0, Math.min(GRID_COLS - w, f.x ?? 0)),
        y: Math.max(0, Math.min(GRID_ROWS - h, f.y ?? 0)),
        w,
        h,
      });
    }
    return result;
  } catch { return DEFAULT_LAYOUT; }
}
function storeLayout(layout: LayoutItem[]) { writeLocal(LAYOUT_STORAGE_KEY, layout); }

function rectsOverlap(a: LayoutItem, b: LayoutItem): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ─── App shell ────────────────────────────────────────────────────────────────

const CRUMB_MAP: Record<string, string> = {
  '/': 'SHELF / HOME',
  '/store': 'SHELF / STORE',
  '/library': 'SHELF / LIBRARY',
  '/breakroom': 'SHELF / BREAKROOM',
  '/profile': 'SHELF / PROFILE',
  '/settings': 'SHELF / SETTINGS',
  '/tool/file-finder': 'SHELF / FILE FINDER',
};

function AppShell({ children, libraryCount }: { children: ReactNode; libraryCount: number }) {
  const [location] = useLocation();
  const navItems = [
    { href: '/', label: 'Home', icon: House },
    { href: '/store', label: 'Store', icon: Grid2X2 },
    { href: '/library', label: 'Library', icon: LibraryIcon },
    { href: '/breakroom', label: 'Breakroom', icon: Coffee },
  ];
  const utilityItems = [
    { href: '/profile', label: 'Profile', icon: CircleUserRound },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];
  const crumb = CRUMB_MAP[location] ?? `SHELF / ${location.slice(1).toUpperCase().replace(/\//g, ' / ')}`;
  const isActive = (href: string) => {
    if (href === '/library') return location === '/library' || location.startsWith('/tool/');
    return location === href;
  };
  return (
    <div className="cubical-shell">
      <aside className="cubical-sidebar" data-testid="sidebar-navigation">
        <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-brand">
          <span className="brand-mark">C</span><span className="brand-word">cubical</span>
        </Link>
        <div className="mt-12 w-full">
          <div className="side-label mb-3">Your shelf</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Main navigation">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={`nav-link ${isActive(href) ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}>
                <Icon /><span>{label}{label === 'Library' && libraryCount > 0 ? ` · ${libraryCount}` : ''}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom w-full">
          <div className="side-label mb-3">The little things</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Utility navigation">
            {utilityItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}>
                <Icon /><span>{label}</span>
              </Link>
            ))}
          </nav>
          <p className="sidebar-footnote">A personal shelf for useful little tools.<br />Made for curious desktops.</p>
        </div>
      </aside>
      <main className="cubical-main">
        <header className="topbar">
          <span className="crumb" data-testid="text-location">{crumb}</span>
          <span className="topbar-hint"><i className="status-dot" /> Local prototype · everything stays here</span>
        </header>
        {children}
      </main>
    </div>
  );
}

// ─── Store components ─────────────────────────────────────────────────────────

function ProductIcon({ product, size = 'normal' }: { product: Product; size?: 'normal' | 'large' }) {
  const Icon = product.icon;
  return (
    <span
      className={`tool-icon ${size === 'large' ? 'h-[66px] w-[66px] rounded-[19px]' : ''}`}
      style={{ '--icon-color': product.iconColor, '--icon-bg': product.iconBg } as CSSProperties}
      data-testid={`icon-product-${product.id}`}
    ><Icon /></span>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="product-card" data-testid={`card-product-${product.id}`}>
      <ProductIcon product={product} />
      <div className="card-meta">
        <span className="card-name" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
        <span className="price" data-testid={`text-product-price-${product.id}`}>{product.price}</span>
      </div>
      <p className="card-description" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
      <div className="card-footer"><span>View tool</span><ArrowRight /></div>
    </Link>
  );
}

function StorePage() {
  return (
    <section>
      <div className="page-intro">
        <div className="eyebrow">A small shelf of useful things</div>
        <h1 className="display-title mt-4">Tools worth<br /><em className="not-italic" style={{ color: 'hsl(var(--primary))' }}>keeping around.</em></h1>
        <p>Browse focused desktop tools made to do one thing well. Pick the ones that feel like you.</p>
      </div>
      <div className="mb-5 flex items-center justify-between">
        <span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>The current edit</span>
        <span className="library-count">06 tools · no noise</span>
      </div>
      <div className="product-grid" data-testid="product-catalog">
        {PRODUCTS.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}

function ScreenshotPlaceholder({ product }: { product: Product }) {
  return (
    <div className="screenshot-placeholder" data-testid={`placeholder-screenshot-${product.id}`}>
      <div className="window-bar"><i /><i /><i /><span className="ml-auto font-mono text-[9px] text-white/40">{product.name.toUpperCase()}</span></div>
      <div className="mock-ui">
        <div className="mock-ui-line" /><div className="mock-ui-line short" />
        <div className="mock-ui-blocks"><div className="mock-ui-block" /><div className="mock-ui-block" /></div>
      </div>
    </div>
  );
}

function ProductDetail({ product, isAdded, onAdd, onOpen }: { product: Product; isAdded: boolean; onAdd: () => void; onOpen: () => void }) {
  const toolRoute = getToolRoute(product);
  const isFree = product.price === 'FREE';
  return (
    <section>
      <Link href="/store" className="detail-back" data-testid="link-back-store"><ArrowLeft /> Back to store</Link>
      <div className="detail-layout">
        <div className="detail-copy">
          <ProductIcon product={product} size="large" />
          <div className="eyebrow mt-7">A focused little utility</div>
          <h1 data-testid="text-detail-name">{product.name}</h1>
          <p data-testid="text-detail-description">{product.description} Built to stay out of your way, feel good to use, and make a small part of your day lighter.</p>
          <div className="detail-price" data-testid="text-detail-price">{isFree ? 'FREE · local-only' : `${product.price} · one-time, local-only`}</div>
          {isAdded ? (
            toolRoute ? (
              <Link href={toolRoute} className="button-primary" data-testid="button-open-added"><Check /> In your library · Open</Link>
            ) : (
              <button className="button-primary" onClick={onOpen} data-testid="button-open-added"><Check /> In your library · Open</button>
            )
          ) : (
            <button className="button-primary" onClick={onAdd} data-testid={isFree ? 'button-get-free' : 'button-add-library'}>
              {isFree ? 'Get Free' : 'Add to library'} <ArrowRight />
            </button>
          )}
        </div>
        <ScreenshotPlaceholder product={product} />
      </div>
    </section>
  );
}

// ─── Library components ───────────────────────────────────────────────────────

function EmptyLibrary() {
  return (
    <div className="empty-state" data-testid="empty-library">
      <div className="empty-cube"><PackageOpen /></div>
      <h2>Your shelf is still open.</h2>
      <p>Tools you add from the Store will land here, ready for their next small job.</p>
      <Link href="/store" className="button-primary" data-testid="link-empty-store">Browse the store <ArrowRight /></Link>
    </div>
  );
}

function LibraryPage({ products, onOpen }: { products: Product[]; onOpen: (product: Product) => void }) {
  return (
    <section>
      <div className="library-head">
        <div className="page-intro !mb-0">
          <div className="eyebrow">Your chosen tools</div>
          <h1 className="display-title mt-4">Your library.</h1>
          <p>Everything you decided was worth keeping, in one quiet place.</p>
        </div>
        <span className="library-count" data-testid="text-library-count">{String(products.length).padStart(2, '0')} saved</span>
      </div>
      {products.length === 0 ? <EmptyLibrary /> : (
        <div className="library-list" data-testid="library-list">
          {products.map((product, index) => {
            const toolRoute = getToolRoute(product);
            return (
              <div className="library-row" style={{ animationDelay: `${index * 60}ms` }} key={product.id} data-testid={`row-library-${product.id}`}>
                <ProductIcon product={product} />
                <div className="library-row-main">
                  <div className="library-row-name">{product.name}</div>
                  <div className="library-row-description">{product.description}</div>
                </div>
                {toolRoute ? (
                  <Link className="button-quiet" href={toolRoute} data-testid={`button-open-${product.id}`}>Open <ArrowRight className="ml-1 inline-block h-3 w-3" /></Link>
                ) : (
                  <button className="button-quiet" onClick={() => onOpen(product)} data-testid={`button-open-${product.id}`}>Open <ArrowRight className="ml-1 inline-block h-3 w-3" /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Home widgets ─────────────────────────────────────────────────────────────

const DAY_LABELS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES  = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DOW_LONG     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function todayStr() {
  const d = new Date();
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

type CalendarMode = 'tile' | 'compact' | 'full';

function getCalendarMode(w: number, h: number): CalendarMode {
  if (w <= 2 || h <= 2) return 'tile';
  if (w >= 5 && h >= 5) return 'full';
  return 'compact';
}

// ── Shared calendar state hook ─────────────────────────────────────────────

function useCalendarState() {
  const now = new Date();
  const [viewYear, setViewYear]     = useState(now.getFullYear());
  const [viewMonth, setViewMonth]   = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [events, setEvents]         = useState<CalendarEvent[]>(getStoredEvents);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [formTitle, setFormTitle]   = useState('');
  const [formTime, setFormTime]     = useState('');
  const [formNote, setFormNote]     = useState('');

  useEffect(() => { storeEvents(events); }, [events]);

  const prevMonth = () => { if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); } else { setViewMonth((m) => m - 1); } };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); } else { setViewMonth((m) => m + 1); } };

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();
  const today          = todayStr();
  const eventsOnDate   = (date: string) => events.filter((e) => e.date === date);

  const cells: Array<string | null> = [
    ...Array.from({ length: firstDayOfWeek }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => toDateStr(viewYear, viewMonth, i + 1)),
  ];

  const openNew = () => { setEditingId(null); setFormTitle(''); setFormTime(''); setFormNote(''); setShowForm(true); };
  const openEdit = (ev: CalendarEvent) => { setEditingId(ev.id); setFormTitle(ev.title); setFormTime(ev.time); setFormNote(ev.note); setShowForm(true); };
  const cancelForm = () => { setShowForm(false); setEditingId(null); };

  const saveEvent = (overrideDate?: string) => {
    const targetDate = overrideDate ?? selectedDate;
    if (!formTitle.trim() || !targetDate) return;
    if (editingId) {
      setEvents((evs) => evs.map((e) => e.id === editingId ? { ...e, title: formTitle.trim(), time: formTime, note: formNote } : e));
    } else {
      setEvents((evs) => [...evs, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, date: targetDate, title: formTitle.trim(), time: formTime, note: formNote }]);
    }
    cancelForm();
  };

  const deleteEvent = (id: string) => { setEvents((evs) => evs.filter((e) => e.id !== id)); };

  const selectDate = (date: string) => { setSelectedDate(date); setShowForm(false); setEditingId(null); };

  return {
    viewYear, viewMonth, selectedDate, events, editingId, showForm,
    formTitle, setFormTitle, formTime, setFormTime, formNote, setFormNote,
    prevMonth, nextMonth, firstDayOfWeek, daysInMonth, today, eventsOnDate,
    cells, openNew, openEdit, cancelForm, saveEvent, deleteEvent, selectDate, setSelectedDate,
    monthLabel: MONTH_NAMES[viewMonth],
  };
}

// ── Calendar body (shared between full/compact/overlay) ─────────────────────

function CalendarBody({
  state,
  compact = false,
}: {
  state: ReturnType<typeof useCalendarState>;
  compact?: boolean;
}) {
  const {
    viewYear, viewMonth, selectedDate, editingId, showForm,
    formTitle, setFormTitle, formTime, setFormTime, formNote, setFormNote,
    prevMonth, nextMonth, today, eventsOnDate, cells,
    openNew, openEdit, cancelForm, saveEvent, deleteEvent, selectDate, monthLabel,
  } = state;

  const selectedEvents = selectedDate ? eventsOnDate(selectedDate) : [];
  const selectedLabel  = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('default', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  return (
    <>
      {/* Month navigation */}
      <div className={`widget-header ${compact ? 'cal-header-compact' : ''}`}>
        <span className="widget-label"><CalendarDays /> {compact ? '' : 'Calendar'}</span>
        <div className="cal-nav">
          <button type="button" onClick={prevMonth} aria-label="Previous month"><ChevronLeft /></button>
          <span>{monthLabel} {viewYear}</span>
          <button type="button" onClick={nextMonth} aria-label="Next month"><ChevronRight /></button>
        </div>
      </div>

      {/* Day grid */}
      <div className={`cal-grid ${compact ? 'cal-grid-compact' : ''}`}>
        {DAY_LABELS.map((d) => <span key={d} className="cal-dow">{d}</span>)}
        {cells.map((date, i) => {
          if (!date) return <span key={`e-${i}`} className="cal-cell cal-empty" />;
          const hasEvents = eventsOnDate(date).length > 0;
          const isToday    = date === today;
          const isSelected = date === selectedDate;
          return (
            <button key={date} type="button"
              className={`cal-cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
              onClick={() => selectDate(date)} aria-label={date} aria-pressed={isSelected}>
              {Number(date.slice(8))}
              {hasEvents && <i className="cal-dot" />}
            </button>
          );
        })}
      </div>

      {/* Day panel — only in full mode (not compact) */}
      {!compact && selectedDate && (
        <div className="cal-day-panel">
          <div className="cal-day-header">
            <span className="cal-day-label">{selectedLabel}</span>
            {!showForm && <button type="button" className="cal-add-btn" onClick={openNew}><Plus /> Add</button>}
          </div>
          {selectedEvents.length === 0 && !showForm && <p className="cal-no-events">No events on this day.</p>}
          {selectedEvents.map((ev) => (
            <div key={ev.id} className="cal-event">
              <div className="cal-event-body">
                <span className="cal-event-title">{ev.title}</span>
                {ev.time && <span className="cal-event-meta">{ev.time}</span>}
                {ev.note && <span className="cal-event-meta">{ev.note}</span>}
              </div>
              <div className="cal-event-actions">
                <button type="button" onClick={() => openEdit(ev)} aria-label="Edit"><Pencil /></button>
                <button type="button" onClick={() => deleteEvent(ev.id)} aria-label="Delete"><Trash2 /></button>
              </div>
            </div>
          ))}
          {showForm && (
            <div className="cal-form">
              <label className="rename-field">
                <span>Title</span>
                <input autoFocus value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Event title"
                  onKeyDown={(e) => { if (e.key === 'Enter') saveEvent(); if (e.key === 'Escape') cancelForm(); }} />
              </label>
              <div className="rename-field-pair">
                <label className="rename-field"><span>Time (optional)</span><input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} /></label>
                <label className="rename-field"><span>Note (optional)</span><input value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="Short note" /></label>
              </div>
              <div className="cal-form-actions">
                <button type="button" className="button-quiet" onClick={cancelForm}>Cancel</button>
                <button type="button" className="button-primary" onClick={() => saveEvent()} disabled={!formTitle.trim()}>
                  {editingId ? 'Save changes' : 'Add event'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ── CalendarWidget ─────────────────────────────────────────────────────────

function CalendarWidget({ gridW, gridH }: { gridW: number; gridH: number }) {
  const mode  = getCalendarMode(gridW, gridH);
  const state = useCalendarState();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const now   = new Date();

  // Tile mode: just a date display + click to expand
  if (mode === 'tile') {
    const todayDate = now.getDate();
    const todayDow  = DOW_LONG[now.getDay()].toUpperCase();
    const todayMon  = MONTH_SHORT[now.getMonth()];
    const todayEvents = state.eventsOnDate(todayStr());
    return (
      <>
        <button type="button" className="cal-tile" onClick={() => setOverlayOpen(true)} aria-label="Open calendar">
          <span className="cal-tile-month">{todayMon}</span>
          <span className="cal-tile-day">{todayDate}</span>
          <span className="cal-tile-weekday">{todayDow}</span>
          {todayEvents.length > 0 && <span className="cal-tile-events">{todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''}</span>}
          <span className="cal-tile-hint">Tap to open</span>
        </button>
        {overlayOpen && createPortal(
          <div className="cal-overlay" onClick={() => setOverlayOpen(false)}>
            <div className="cal-overlay-panel" onClick={(e) => e.stopPropagation()}>
              <div className="cal-overlay-header">
                <span className="widget-label"><CalendarDays /> Calendar</span>
                <button type="button" className="cal-overlay-close" onClick={() => setOverlayOpen(false)}><X /></button>
              </div>
              <CalendarBody state={state} />
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  // Compact mode: calendar grid only, no day panel
  if (mode === 'compact') {
    return (
      <div className="cal-widget-inner">
        <CalendarBody state={state} compact />
      </div>
    );
  }

  // Full mode: calendar + day event panel
  return (
    <div className="cal-widget-inner cal-widget-full">
      <CalendarBody state={state} />
    </div>
  );
}

// ── ClockWidget ────────────────────────────────────────────────────────────

function ClockWidget({ gridH }: { gridH: number }) {
  const [now, setNow] = useState(() => new Date());
  const [showSeconds, setShowSeconds] = useState(() => {
    try { return window.localStorage.getItem(CLOCK_SECONDS_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => { writeLocal(CLOCK_SECONDS_KEY, showSeconds); }, [showSeconds]);

  const hours   = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm    = hours >= 12 ? 'PM' : 'AM';
  const h12     = hours % 12 || 12;
  const timeStr = `${h12}:${String(minutes).padStart(2, '0')}${(showSeconds && gridH >= 3) ? `:${String(seconds).padStart(2, '0')}` : ''}`;
  const dateStr = now.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });

  // Minimal: just time (h=1)
  if (gridH <= 1) {
    return (
      <div className="clock-fill clock-minimal">
        <div className="clock-time clock-time-sm">{timeStr}<span className="clock-ampm">{ampm}</span></div>
      </div>
    );
  }

  // Standard: time + AM/PM (h=2)
  if (gridH <= 2) {
    return (
      <div className="clock-fill">
        <div className="widget-header">
          <span className="widget-label"><Clock /> Clock</span>
        </div>
        <div className="clock-display">
          <div className="clock-time">{timeStr}<span className="clock-ampm">{ampm}</span></div>
        </div>
      </div>
    );
  }

  // Full: time + AM/PM + date + seconds toggle (h>=3)
  return (
    <div className="clock-fill">
      <div className="widget-header">
        <span className="widget-label"><Clock /> Clock</span>
        <label className="clock-toggle">
          <input type="checkbox" checked={showSeconds} onChange={(e) => setShowSeconds(e.target.checked)} />
          <span>Seconds</span>
        </label>
      </div>
      <div className="clock-display">
        <div className="clock-time">{timeStr}<span className="clock-ampm">{ampm}</span></div>
        <div className="clock-date">{dateStr}</div>
      </div>
    </div>
  );
}

// ── NotepadWidget ──────────────────────────────────────────────────────────

function NotepadWidget() {
  const [content, setContent] = useState<string>(() => {
    try { return window.localStorage.getItem(NOTEPAD_STORAGE_KEY) ?? ''; } catch { return ''; }
  });
  const [confirmClear, setConfirmClear] = useState(false);
  const saveTimeout = useRef<number | null>(null);

  const handleChange = (value: string) => {
    setContent(value);
    setConfirmClear(false);
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
    saveTimeout.current = window.setTimeout(() => { writeLocal(NOTEPAD_STORAGE_KEY, value); }, 400);
  };

  const clearNote = () => {
    setContent('');
    setConfirmClear(false);
    writeLocal(NOTEPAD_STORAGE_KEY, '');
    if (saveTimeout.current) window.clearTimeout(saveTimeout.current);
  };

  return (
    <div className="notepad-fill">
      <div className="widget-header">
        <span className="widget-label"><StickyNote /> Notepad</span>
        <div className="notepad-header-actions">
          {content.trim() && !confirmClear && (
            <button type="button" className="text-button" onClick={() => setConfirmClear(true)}><Trash2 /> Clear</button>
          )}
          {confirmClear && (
            <span className="notepad-confirm">
              Clear?&nbsp;
              <button type="button" onClick={clearNote}>Yes</button>
              <button type="button" onClick={() => setConfirmClear(false)}>No</button>
            </span>
          )}
        </div>
      </div>
      <textarea
        className="notepad-textarea notepad-textarea-fill"
        value={content}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Type freely. Notes save automatically and stay after refresh."
        data-testid="notepad-textarea"
      />
      <div className="notepad-footer">
        {content.length > 0 ? `${content.length} character${content.length !== 1 ? 's' : ''} · saved locally` : 'Empty · start typing'}
      </div>
    </div>
  );
}

// ─── Grid widget shell ────────────────────────────────────────────────────────

function GridWidget({
  item, cellW, isEditing, isActive, isConflict,
  onDragStart, onResizeStart,
}: {
  item: LayoutItem;
  cellW: number;
  isEditing: boolean;
  isActive: boolean;
  isConflict: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
}) {
  const left   = item.x * (cellW + GRID_GAP);
  const top    = item.y * (CELL_H + GRID_GAP);
  const width  = item.w * cellW + (item.w - 1) * GRID_GAP;
  const height = item.h * CELL_H + (item.h - 1) * GRID_GAP;

  return (
    <div
      className={`grid-widget${isEditing ? ' is-editable' : ''}${isActive ? ' is-active' : ''}${isConflict ? ' is-conflict' : ''}`}
      style={{ left, top, width, height }}
      onPointerDown={isEditing ? onDragStart : undefined}
      data-testid={`grid-widget-${item.id}`}
    >
      {/* Edit-mode drag indicator badge */}
      {isEditing && (
        <div className="widget-edit-badge" aria-hidden>
          <GripHorizontal />
          <span>{WIDGET_LABELS[item.id]}</span>
        </div>
      )}

      {/* Widget content */}
      <div className={`grid-widget-content${isEditing ? ' is-locked' : ''}`}>
        {item.id === 'calendar'     && <CalendarWidget gridW={item.w} gridH={item.h} />}
        {item.id === 'clock'        && <ClockWidget gridH={item.h} />}
        {item.id === 'notepad'      && <NotepadWidget />}
        {item.id === 'file-finder'  && <FileFinderWidget gridW={item.w} gridH={item.h} />}
      </div>

      {/* Resize handle */}
      {isEditing && (
        <div
          className="widget-resize-handle"
          onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
          aria-label={`Resize ${WIDGET_LABELS[item.id]}`}
        />
      )}
    </div>
  );
}

// ─── File Finder widget ───────────────────────────────────────────────────────

function FileFinderWidget({ gridW: _gridW, gridH }: { gridW: number; gridH: number }) {
  const [input, setInput] = useState('');
  const recentSearches = useMemo(
    () => readLocal<string[]>(RECENT_SEARCHES_KEY, [], isStringArray).slice(0, 5),
    [],
  );

  const goSearch = () => {
    if (input.trim()) writeLocal(FF_PENDING_QUERY_KEY, input.trim());
    window.location.hash = '/tool/file-finder';
  };

  const isSmall = gridH <= 1;
  const isLarge = gridH >= 4;

  return (
    <div className="widget-ff">
      <div className="widget-ff-top">
        <FolderSearch className="widget-ff-icon" />
        {!isSmall && <span className="widget-ff-title">File Finder</span>}
      </div>
      <div className="widget-ff-search-row">
        <input
          className="widget-ff-input"
          placeholder={isSmall ? 'Search files…' : 'Search your computer…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && goSearch()}
        />
        <button className="widget-ff-go" onClick={goSearch} title="Open File Finder">
          <Search className="w-4 h-4" />
        </button>
      </div>
      {isLarge && recentSearches.length > 0 && (
        <div className="widget-ff-recent">
          {recentSearches.map((s) => (
            <button
              key={s}
              className="widget-ff-recent-item"
              onClick={() => { writeLocal(FF_PENDING_QUERY_KEY, s); window.location.hash = '/tool/file-finder'; }}
            >
              <Clock className="w-3 h-3 opacity-40 shrink-0" /> <span className="truncate">{s}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Home workspace (grid engine) ─────────────────────────────────────────────

function HomeWorkspace({ isEditing }: { isEditing: boolean }) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const cellWRef      = useRef(76);
  const activeItemRef = useRef<LayoutItem | null>(null);
  const isConflictRef = useRef(false);

  const [cellW, setCellW]           = useState(76);
  const [layout, setLayout]         = useState<LayoutItem[]>(() => getStoredLayout());
  const [activeItem, setActiveItem] = useState<LayoutItem | null>(null);
  const [activeMode, setActiveMode] = useState<'drag' | 'resize' | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  // Measure container width and keep cellW in sync
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      const cw = Math.max(40, Math.floor((w - (GRID_COLS - 1) * GRID_GAP) / GRID_COLS));
      setCellW(cw);
      cellWRef.current = cw;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const workspaceH = GRID_ROWS * CELL_H + (GRID_ROWS - 1) * GRID_GAP;

  // Display layout: show activeItem at its preview position
  const displayLayout = layout.map((item) => (activeItem?.id === item.id ? activeItem : item));

  // ── Drag ──────────────────────────────────────────────────────────────────

  const startDrag = (id: WidgetId, e: React.PointerEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const currentLayout = layout;
    const item = currentLayout.find((l) => l.id === id)!;
    const { x: origX, y: origY } = item;
    const startMX = e.clientX;
    const startMY = e.clientY;

    const preview = { ...item };
    setActiveItem(preview);
    activeItemRef.current = preview;
    setActiveMode('drag');
    setIsConflict(false);
    isConflictRef.current = false;

    const onMove = (ev: PointerEvent) => {
      const cw = cellWRef.current;
      const dx = Math.round((ev.clientX - startMX) / (cw + GRID_GAP));
      const dy = Math.round((ev.clientY - startMY) / (CELL_H + GRID_GAP));
      const proposed: LayoutItem = {
        ...item,
        x: Math.max(0, Math.min(GRID_COLS - item.w, origX + dx)),
        y: Math.max(0, Math.min(GRID_ROWS - item.h, origY + dy)),
      };
      const conflict = currentLayout.some((other) => other.id !== id && rectsOverlap(proposed, other));
      setActiveItem(proposed);
      activeItemRef.current = proposed;
      setIsConflict(conflict);
      isConflictRef.current = conflict;
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const finalItem    = activeItemRef.current;
      const finalConflict = isConflictRef.current;
      if (finalItem && !finalConflict) {
        setLayout((prev) => {
          const next = prev.map((l) => (l.id === finalItem.id ? finalItem : l));
          storeLayout(next);
          return next;
        });
      }
      setActiveItem(null);
      activeItemRef.current = null;
      setActiveMode(null);
      setIsConflict(false);
      isConflictRef.current = false;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // ── Resize ────────────────────────────────────────────────────────────────

  const startResize = (id: WidgetId, e: React.PointerEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const currentLayout = layout;
    const item = currentLayout.find((l) => l.id === id)!;
    const { w: origW, h: origH, x, y } = item;
    const startMX = e.clientX;
    const startMY = e.clientY;
    const min = WIDGET_MIN[id];

    setActiveItem({ ...item });
    activeItemRef.current = { ...item };
    setActiveMode('resize');
    setIsConflict(false);
    isConflictRef.current = false;

    const onMove = (ev: PointerEvent) => {
      const cw = cellWRef.current;
      const dx = Math.round((ev.clientX - startMX) / (cw + GRID_GAP));
      const dy = Math.round((ev.clientY - startMY) / (CELL_H + GRID_GAP));
      const newW = Math.max(min.w, Math.min(GRID_COLS - x, origW + dx));
      const newH = Math.max(min.h, Math.min(GRID_ROWS - y, origH + dy));
      const proposed: LayoutItem = { ...item, w: newW, h: newH };
      const conflict = currentLayout.some((other) => other.id !== id && rectsOverlap(proposed, other));
      setActiveItem(proposed);
      activeItemRef.current = proposed;
      setIsConflict(conflict);
      isConflictRef.current = conflict;
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const finalItem    = activeItemRef.current;
      const finalConflict = isConflictRef.current;
      if (finalItem && !finalConflict) {
        setLayout((prev) => {
          const next = prev.map((l) => (l.id === finalItem.id ? finalItem : l));
          storeLayout(next);
          return next;
        });
      }
      setActiveItem(null);
      activeItemRef.current = null;
      setActiveMode(null);
      setIsConflict(false);
      isConflictRef.current = false;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={`home-workspace${isEditing ? ' is-editing' : ''}`}
      style={{ height: workspaceH }}
      data-testid="home-workspace"
    >
      {displayLayout.map((item) => {
        const isActive   = activeItem?.id === item.id && activeMode !== null;
        const showConflict = isActive && isConflict;
        return (
          <GridWidget
            key={item.id}
            item={item}
            cellW={cellW}
            isEditing={isEditing}
            isActive={isActive}
            isConflict={showConflict}
            onDragStart={(e) => startDrag(item.id, e)}
            onResizeStart={(e) => startResize(item.id, e)}
          />
        );
      })}
    </div>
  );
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage() {
  const [isEditing, setIsEditing] = useState(false);
  return (
    <div className="home-page" data-testid="home-page">

      {/* Header row */}
      <div className="home-header-row">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1 className="display-title" style={{ marginTop: '0.75rem' }}>Good to be back.</h1>
          {isEditing && <p className="home-edit-hint">Drag widgets to reposition · drag the corner ↘ to resize · widgets snap to the grid</p>}
        </div>

        {/* Edit Layout button — always visible */}
        {!isEditing ? (
          <button
            type="button"
            className="home-edit-btn"
            onClick={() => setIsEditing(true)}
            data-testid="button-customize-layout"
          >
            <Pencil /> Edit Layout
          </button>
        ) : (
          <button
            type="button"
            className="home-edit-btn home-edit-btn-done"
            onClick={() => setIsEditing(false)}
            data-testid="button-done-editing"
          >
            <Check /> Done
          </button>
        )}
      </div>

      <HomeWorkspace isEditing={isEditing} />
    </div>
  );
}

// ─── Bulk File Renamer ────────────────────────────────────────────────────────

type RenameMethod = 'full' | 'prefix' | 'suffix' | 'replace' | 'sequence';
type SelectedFile = { key: string; file: File; };
type RenamePreview = { key: string; originalName: string; proposedName: string; conflict: boolean; };

function fileStemAndExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) return { stem: fileName, extension: '' };
  return { stem: fileName.slice(0, extensionIndex), extension: fileName.slice(extensionIndex) };
}

function getProposedName(
  fileName: string,
  method: RenameMethod,
  options: { prefix: string; suffix: string; search: string; replacement: string; sequenceStart: number; sequenceDigits: number },
  index: number,
  fullName?: string,
) {
  if (method === 'full') {
    const { extension, stem } = fileStemAndExtension(fileName);
    const nextStem = fullName === undefined ? stem : fullName.trim();
    return nextStem ? `${nextStem}${extension}` : '';
  }
  if (method === 'prefix') return `${options.prefix}${fileName}`;
  if (method === 'suffix') {
    const { stem, extension } = fileStemAndExtension(fileName);
    return `${stem}${options.suffix}${extension}`;
  }
  if (method === 'replace') {
    if (!options.search) return fileName;
    return fileName.split(options.search).join(options.replacement);
  }
  const sequence = String(options.sequenceStart + index).padStart(options.sequenceDigits, '0');
  return `${sequence} - ${fileName}`;
}

function ToolIconBadge() { return <span className="renamer-tool-icon"><FileArchive /></span>; }

function RenameMethodCard({ method, active, title, description, onSelect }: {
  method: RenameMethod; active: boolean; title: string; description: string; onSelect: (method: RenameMethod) => void;
}) {
  return (
    <button type="button" className={`rename-method-card ${active ? 'active' : ''}`} onClick={() => onSelect(method)} aria-pressed={active} data-testid={`button-method-${method}`}>
      <span className="rename-method-radio" />
      <span><strong>{title}</strong><small>{description}</small></span>
    </button>
  );
}

function BulkFileRenamer() {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [method, setMethod]               = useState<RenameMethod>('full');
  const [prefix, setPrefix]               = useState('project-');
  const [suffix, setSuffix]               = useState('-final');
  const [search, setSearch]               = useState('');
  const [replacement, setReplacement]     = useState('');
  const [sequenceStart, setSequenceStart] = useState(1);
  const [sequenceDigits, setSequenceDigits] = useState(2);
  const [fullRenameNames, setFullRenameNames] = useState<Record<string, string>>({});
  const [completion, setCompletion]       = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  const options = { prefix, suffix, search, replacement, sequenceStart, sequenceDigits };
  const previews = useMemo<RenamePreview[]>(() => {
    const originalNames  = new Set(selectedFiles.map(({ file }) => file.name.toLowerCase()));
    const proposedNames  = selectedFiles.map(({ key, file }, index) => getProposedName(file.name, method, options, index, fullRenameNames[key]));
    const proposedCounts = proposedNames.reduce((counts, name) => {
      const n = name.toLowerCase(); counts.set(n, (counts.get(n) ?? 0) + 1); return counts;
    }, new Map<string, number>());
    return selectedFiles.map(({ key, file }, index) => {
      const proposedName         = proposedNames[index];
      const normalizedProposedName = proposedName.toLowerCase();
      const isSameName           = normalizedProposedName === file.name.toLowerCase();
      const conflict = !proposedName.trim() || (!isSameName && originalNames.has(normalizedProposedName)) || (proposedCounts.get(normalizedProposedName) ?? 0) > 1;
      return { key, originalName: file.name, proposedName, conflict };
    });
  }, [fullRenameNames, method, options.prefix, options.replacement, options.search, options.sequenceDigits, options.sequenceStart, options.suffix, selectedFiles]);

  const conflictCount = previews.filter((p) => p.conflict).length;
  const blockingReason = selectedFiles.length === 0
    ? 'Select at least one file to preview new names.'
    : conflictCount > 0
      ? 'A proposed filename already exists among the selected files or is duplicated in this batch.'
      : method === 'replace' && !search
        ? 'Enter the text you want to replace to create a preview.'
        : null;

  const updateOption = (update: () => void) => { update(); setCompletion(null); setActionError(null); };
  const setFullRenameName = (key: string, value: string) => updateOption(() => setFullRenameNames((c) => ({ ...c, [key]: value })));

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    setSelectedFiles((current) => {
      const existing = new Set(current.map(({ key }) => key));
      return [...current, ...incoming.map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}`, file })).filter(({ key }) => !existing.has(key))];
    });
    setFullRenameNames((current) => {
      const next = { ...current };
      incoming.forEach((file) => { const key = `${file.name}-${file.size}-${file.lastModified}`; if (!(key in next)) next[key] = fileStemAndExtension(file.name).stem; });
      return next;
    });
    setCompletion(null); setActionError(null); event.target.value = '';
  };

  const removeFile = (key: string) => {
    setSelectedFiles((c) => c.filter((sf) => sf.key !== key));
    setFullRenameNames((c) => { const next = { ...c }; delete next[key]; return next; });
    setCompletion(null); setActionError(null);
  };

  const clearFiles = () => { setSelectedFiles([]); setFullRenameNames({}); setCompletion(null); setActionError(null); };

  const renameFiles = () => {
    if (blockingReason) { setActionError(blockingReason); return; }
    setActionError(null);
    setCompletion(`${previews.length} file${previews.length === 1 ? '' : 's'} checked successfully. This browser prototype did not change files.`);
  };

  return (
    <section className="renamer-page" data-testid="bulk-file-renamer">
      <Link href="/library" className="detail-back" data-testid="link-back-library"><ArrowLeft /> Back to library</Link>
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><ToolIconBadge /><div><h1>Bulk File Renamer.</h1><p>Give a whole folder a thoughtful name in one quick pass.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Ready when you are</span>
      </div>
      <div className="renamer-notice">
        <FilePlus2 />
        <div><strong>Safe preview mode</strong><span>Files are selected only for this session. Nothing is changed until you review the preview and click Rename Files.</span></div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Choose files</span><span className="library-count">{selectedFiles.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={selectFiles} data-testid="input-file-picker" /></label>
          <p className="renamer-help">Choose multiple files from your computer to build a rename preview.</p>
          {selectedFiles.length > 0 && (
            <div className="selected-file-list" data-testid="selected-file-list">
              {selectedFiles.map(({ key, file }) => (
                <div className="selected-file" key={key}><span>{file.name}</span><button type="button" onClick={() => removeFile(key)} aria-label={`Remove ${file.name}`}><Trash2 /></button></div>
              ))}
              <button type="button" className="text-button" onClick={clearFiles} data-testid="button-clear-files"><RotateCcw /> Clear selection</button>
            </div>
          )}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Rename method</span></div>
          <div className="rename-method-grid">
            <RenameMethodCard method="full"     active={method === 'full'}     title="Full Rename"  description="Type a complete filename"    onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="prefix"   active={method === 'prefix'}   title="Add before"   description="Put text at the start"       onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="suffix"   active={method === 'suffix'}   title="Add after"    description="Put text before extension"   onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="replace"  active={method === 'replace'}  title="Replace text" description="Swap a specific phrase"      onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="sequence" active={method === 'sequence'} title="Number files" description="Add an ordered number"       onSelect={(m) => updateOption(() => setMethod(m))} />
          </div>
          <div className="rename-options">
            {method === 'full' && selectedFiles.length === 0 && <p className="rename-mode-note">Select one file to type its complete filename. The extension stays protected.</p>}
            {method === 'full' && selectedFiles.length === 1 && (() => {
              const sf = selectedFiles[0];
              const { extension, stem } = fileStemAndExtension(sf.file.name);
              return <label className="rename-field"><span>Filename</span><div className="filename-input-row"><input value={fullRenameNames[sf.key] ?? stem} onChange={(e) => setFullRenameName(sf.key, e.target.value)} placeholder={stem} data-testid="input-full-rename" /><span>{extension || 'no extension'}</span></div><small className="rename-field-hint">The file extension is protected and stays unchanged.</small></label>;
            })()}
            {method === 'full' && selectedFiles.length > 1 && <p className="rename-mode-note">Full Rename is for manual per-file editing. Edit each proposed filename directly in the preview table; use the batch methods for larger groups.</p>}
            {method === 'prefix'   && <label className="rename-field"><span>Text before filename</span><input value={prefix} onChange={(e) => updateOption(() => setPrefix(e.target.value))} placeholder="project-" data-testid="input-prefix" /></label>}
            {method === 'suffix'   && <label className="rename-field"><span>Text after filename</span><input value={suffix} onChange={(e) => updateOption(() => setSuffix(e.target.value))} placeholder="-final" data-testid="input-suffix" /></label>}
            {method === 'replace'  && <div className="rename-field-pair"><label className="rename-field"><span>Find</span><input value={search} onChange={(e) => updateOption(() => setSearch(e.target.value))} placeholder="draft" data-testid="input-replace-search" /></label><label className="rename-field"><span>Replace with</span><input value={replacement} onChange={(e) => updateOption(() => setReplacement(e.target.value))} placeholder="final" data-testid="input-replace-value" /></label></div>}
            {method === 'sequence' && <div className="rename-field-pair"><label className="rename-field"><span>Start at</span><input type="number" min="0" value={sequenceStart} onChange={(e) => updateOption(() => setSequenceStart(Math.max(0, Number(e.target.value) || 0)))} data-testid="input-sequence-start" /></label><label className="rename-field"><span>Number width</span><input type="number" min="1" max="6" value={sequenceDigits} onChange={(e) => updateOption(() => setSequenceDigits(Math.min(6, Math.max(1, Number(e.target.value) || 1))))} data-testid="input-sequence-digits" /></label></div>}
          </div>
        </div>
        <div className="renamer-preview-panel">
          <div className="renamer-section-heading"><span className="eyebrow">03 · Preview changes</span><span className="library-count">{previews.length} preview{previews.length === 1 ? '' : 's'}</span></div>
          {selectedFiles.length === 0 ? (
            <div className="renamer-empty" data-testid="renamer-empty"><div className="empty-cube"><Files /></div><h2>Your preview starts here.</h2><p>Select a few files on the left to see the original and proposed names side-by-side.</p></div>
          ) : (
            <div className="rename-preview-table" data-testid="rename-preview-table">
              <div className="preview-table-head"><span>Original filename</span><span>Proposed filename</span></div>
              <div className="preview-table-body">
                {previews.map((preview) => (
                  <div className={`preview-row ${preview.conflict ? 'conflict' : ''}`} key={preview.key}>
                    <span title={preview.originalName}>{preview.originalName}</span>
                    <span title={preview.proposedName}>
                      {method === 'full' && selectedFiles.length > 1 ? (
                        <span className="preview-edit-name"><input value={fullRenameNames[preview.key] ?? fileStemAndExtension(preview.originalName).stem} onChange={(e) => setFullRenameName(preview.key, e.target.value)} aria-label={`New filename for ${preview.originalName}`} data-testid={`input-full-rename-${preview.key}`} /><i>{fileStemAndExtension(preview.originalName).extension || 'no extension'}</i></span>
                      ) : (
                        preview.proposedName || 'No filename proposed'
                      )}
                      {preview.conflict && <b>Conflict</b>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {blockingReason && selectedFiles.length > 0 && <div className="renamer-error" role="alert" data-testid="renamer-error"><span>!</span>{blockingReason}</div>}
          {actionError && <div className="renamer-error" role="alert" data-testid="renamer-action-error"><span>!</span>{actionError}</div>}
          {completion && <div className="renamer-completion" role="status" data-testid="renamer-completion"><Check /><div><strong>Rename check complete</strong><span>{completion}</span></div></div>}
          <div className="renamer-actions">
            <div><strong>Nothing gets overwritten.</strong><span>Conflicts must be resolved before continuing.</span></div>
            <button type="button" className="button-primary" onClick={renameFiles} disabled={selectedFiles.length === 0 || Boolean(blockingReason)} data-testid="button-rename-files">Rename Files <ArrowRight /></button>
          </div>
        </div>
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>Desktop functionality required later.</strong> Cubical is currently running in a browser, so it can read selected filenames but cannot safely rename files in place. A future Windows desktop build will connect this preview to a filesystem permission layer; this prototype never deletes or overwrites anything.</p></div>
    </section>
  );
}

// ─── Spreadsheet Cleaner ──────────────────────────────────────────────────────

type SpreadsheetRow = string[];
type CleanedSpreadsheet = { rows: SpreadsheetRow[]; emptyRowsRemoved: number; duplicateRowsRemoved: number; textCellsCleaned: number; };

function parseCsv(csv: string): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = []; let row: string[] = []; let cell = ''; let insideQuotes = false;
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i]; const nx = csv[i + 1];
    if (ch === '"') { if (insideQuotes && nx === '"') { cell += '"'; i += 1; } else { insideQuotes = !insideQuotes; } }
    else if (ch === ',' && !insideQuotes) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !insideQuotes) { if (ch === '\r' && nx === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else { cell += ch; }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  while (rows.length > 0 && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

function csvEscape(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
function toCsv(headers: string[], rows: SpreadsheetRow[]) { return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n'); }
function titleCase(value: string) { return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

function SpreadsheetCleaner() {
  const [fileName, setFileName]       = useState<string | null>(null);
  const [headers, setHeaders]         = useState<string[]>([]);
  const [sourceRows, setSourceRows]   = useState<SpreadsheetRow[]>([]);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [removeEmptyRows, setRemoveEmptyRows]         = useState(true);
  const [removeDuplicateRows, setRemoveDuplicateRows] = useState(true);
  const [trimText, setTrimText]                       = useState(true);
  const [collapseSpaces, setCollapseSpaces]           = useState(true);
  const [capitalization, setCapitalization] = useState<'unchanged' | 'uppercase' | 'lowercase' | 'title'>('unchanged');
  const [sortColumn, setSortColumn]   = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const cleaned = useMemo<CleanedSpreadsheet>(() => {
    let rows = sourceRows.map((row) => [...row]);
    let emptyRowsRemoved = 0; let duplicateRowsRemoved = 0; let textCellsCleaned = 0;
    if (removeEmptyRows) { const before = rows.length; rows = rows.filter((row) => !row.every((cell) => cell.trim() === '')); emptyRowsRemoved = before - rows.length; }
    rows = rows.map((row) => row.map((cell) => {
      let next = cell;
      if (trimText) next = next.trim();
      if (collapseSpaces) next = next.replace(/\s+/g, ' ');
      if (capitalization === 'uppercase') next = next.toUpperCase();
      if (capitalization === 'lowercase') next = next.toLowerCase();
      if (capitalization === 'title') next = titleCase(next);
      if (next !== cell) textCellsCleaned += 1;
      return next;
    }));
    if (removeDuplicateRows) {
      const seen = new Set<string>();
      rows = rows.filter((row) => { const id = JSON.stringify(row); if (seen.has(id)) { duplicateRowsRemoved += 1; return false; } seen.add(id); return true; });
    }
    if (sortColumn) { const si = headers.indexOf(sortColumn); if (si >= 0) rows.sort((a, b) => (a[si] ?? '').localeCompare(b[si] ?? '', undefined, { numeric: true, sensitivity: 'base' })); }
    return { rows, emptyRowsRemoved, duplicateRowsRemoved, textCellsCleaned };
  }, [capitalization, collapseSpaces, headers, removeDuplicateRows, removeEmptyRows, sortColumn, sourceRows, trimText]);

  const selectSpreadsheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setExportStatus(null); setParseError(null);
    try {
      const parsedRows = parseCsv(await file.text());
      if (parsedRows.length === 0 || parsedRows[0].length === 0) { setFileName(null); setHeaders([]); setSourceRows([]); setParseError('This CSV does not contain any data to preview.'); return; }
      const nextHeaders = parsedRows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
      setFileName(file.name); setHeaders(nextHeaders);
      setSourceRows(parsedRows.slice(1).map((row) => nextHeaders.map((_, i) => row[i] ?? '')));
    } catch { setFileName(null); setHeaders([]); setSourceRows([]); setParseError('This file could not be read as a CSV.'); }
  };

  const exportCleanedFile = () => {
    if (!fileName || headers.length === 0) return;
    const url = URL.createObjectURL(new Blob([toCsv(headers, cleaned.rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    const baseName = fileName.replace(/\.csv$/i, '');
    link.href = url; link.download = `${baseName}-cleaned.csv`; link.click(); URL.revokeObjectURL(url);
    setExportStatus(`Downloaded ${baseName}-cleaned.csv. Your original file remains unchanged.`);
  };

  return (
    <section className="renamer-page spreadsheet-page" data-testid="spreadsheet-cleaner">
      <Link href="/library" className="detail-back" data-testid="link-back-library"><ArrowLeft /> Back to library</Link>
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><span className="renamer-tool-icon spreadsheet-tool-icon"><FileSpreadsheet /></span><div><h1>Spreadsheet Cleaner.</h1><p>Make messy tables easier to trust, one clean copy at a time.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Original stays safe</span>
      </div>
      <div className="renamer-notice"><FilePlus2 /><div><strong>Safe copy mode</strong><span>Spreadsheet Cleaner reads your CSV and creates a new cleaned download. The original uploaded file is never modified.</span></div></div>
      <div className="spreadsheet-workspace">
        <div className="spreadsheet-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Choose a CSV</span>{fileName && <span className="library-count">{fileName}</span>}</div>
          <label className="file-picker"><FilePlus2 /><span>{fileName ? 'Choose another CSV' : 'Select CSV file'}</span><input type="file" accept=".csv,text/csv" onChange={selectSpreadsheet} data-testid="input-spreadsheet-picker" /></label>
          <p className="renamer-help">CSV files are supported in this browser prototype. The first row is treated as column names.</p>
          {parseError && <div className="renamer-error" role="alert" data-testid="spreadsheet-error"><span>!</span>{parseError}</div>}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Clean up</span></div>
          <div className="spreadsheet-checkboxes">
            <label><input type="checkbox" checked={removeEmptyRows} onChange={(e) => setRemoveEmptyRows(e.target.checked)} /><span><strong>Remove empty rows</strong><small>Drop rows with no values</small></span></label>
            <label><input type="checkbox" checked={removeDuplicateRows} onChange={(e) => setRemoveDuplicateRows(e.target.checked)} /><span><strong>Remove duplicate rows</strong><small>Keep the first copy</small></span></label>
            <label><input type="checkbox" checked={trimText} onChange={(e) => setTrimText(e.target.checked)} /><span><strong>Trim text cells</strong><small>Remove leading and trailing spaces</small></span></label>
            <label><input type="checkbox" checked={collapseSpaces} onChange={(e) => setCollapseSpaces(e.target.checked)} /><span><strong>Collapse repeated spaces</strong><small>Make internal spacing consistent</small></span></label>
          </div>
          <label className="rename-field spreadsheet-select-field"><span>Standardize capitalization</span><select value={capitalization} onChange={(e) => setCapitalization(e.target.value as typeof capitalization)} data-testid="select-capitalization"><option value="unchanged">Unchanged</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="title">Title Case</option></select></label>
          <label className="rename-field spreadsheet-select-field"><span>Sort by column</span><select value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} disabled={headers.length === 0} data-testid="select-sort-column"><option value="">Original order</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
        </div>
        <div className="spreadsheet-preview-panel">
          <div className="renamer-section-heading"><span className="eyebrow">03 · Preview cleaned result</span><span className="library-count">{headers.length} columns · {sourceRows.length} rows</span></div>
          {headers.length === 0 ? (
            <div className="renamer-empty" data-testid="spreadsheet-empty"><div className="empty-cube"><FileSpreadsheet /></div><h2>Your table starts here.</h2><p>Select a CSV to inspect its columns, clean up its values, and preview a fresh copy.</p></div>
          ) : (
            <>
              <div className="spreadsheet-summary" data-testid="spreadsheet-summary">
                <span><strong>{cleaned.emptyRowsRemoved}</strong> empty rows removed</span>
                <span><strong>{cleaned.duplicateRowsRemoved}</strong> duplicates removed</span>
                <span><strong>{cleaned.textCellsCleaned}</strong> text cells cleaned</span>
              </div>
              <div className="spreadsheet-table-wrap" data-testid="spreadsheet-preview-table">
                <table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{cleaned.rows.slice(0, 20).map((row, ri) => <tr key={`${ri}-${row.join('|')}`}>{headers.map((h, ci) => <td key={`${h}-${ci}`}>{row[ci] || <span className="table-empty">empty</span>}</td>)}</tr>)}</tbody></table>
              </div>
              {cleaned.rows.length > 20 && <p className="table-more">Showing the first 20 of {cleaned.rows.length} cleaned rows.</p>}
              {cleaned.rows.length === 0 && <p className="table-more">No data rows remain after cleanup.</p>}
            </>
          )}
          {exportStatus && <div className="renamer-completion" role="status" data-testid="spreadsheet-export-status"><Check /><div><strong>Cleaned copy exported</strong><span>{exportStatus}</span></div></div>}
          <div className="renamer-actions">
            <div><strong>Original file stays unchanged.</strong><span>Export creates a separate CSV copy.</span></div>
            <button type="button" className="button-primary" onClick={exportCleanedFile} disabled={!fileName || headers.length === 0} data-testid="button-export-cleaned-file">Export Cleaned File <Download /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Breakroom ────────────────────────────────────────────────────────────────

// ── Snake game engine ──────────────────────────────────────────────────────

const SNAKE_GRID = 20;
const SNAKE_CELL = 20;

type Vec2 = { x: number; y: number };
type SnakeState = {
  snake: Vec2[]; food: Vec2; dir: Vec2; nextDir: Vec2;
  score: number; started: boolean; dead: boolean;
  lastTick: number; interval: number;
};

function makeSnakeInitial(): SnakeState {
  const cx = Math.floor(SNAKE_GRID / 2);
  const cy = Math.floor(SNAKE_GRID / 2);
  return {
    snake: [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }],
    food: { x: 5, y: 5 },
    dir: { x: 0, y: 0 }, nextDir: { x: 1, y: 0 },
    score: 0, started: false, dead: false, lastTick: 0, interval: 150,
  };
}

function snakeSpawnFood(s: SnakeState) {
  const occ = new Set(s.snake.map((p) => `${p.x},${p.y}`));
  let x = 0, y = 0;
  do { x = Math.floor(Math.random() * SNAKE_GRID); y = Math.floor(Math.random() * SNAKE_GRID); }
  while (occ.has(`${x},${y}`));
  s.food = { x, y };
}

function snakeTick(s: SnakeState) {
  s.dir = s.nextDir;
  const head = s.snake[0];
  const next: Vec2 = {
    x: (head.x + s.dir.x + SNAKE_GRID) % SNAKE_GRID,
    y: (head.y + s.dir.y + SNAKE_GRID) % SNAKE_GRID,
  };
  if (s.snake.some((p) => p.x === next.x && p.y === next.y)) { s.dead = true; return; }
  s.snake.unshift(next);
  if (next.x === s.food.x && next.y === s.food.y) {
    s.score += 1;
    s.interval = Math.max(60, 150 - s.score * 4);
    snakeSpawnFood(s);
  } else { s.snake.pop(); }
}

function snakeRender(ctx: CanvasRenderingContext2D, s: SnakeState) {
  const SIZE = SNAKE_GRID * SNAKE_CELL;
  ctx.fillStyle = '#0d1b12';
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= SNAKE_GRID; i++) {
    ctx.beginPath(); ctx.moveTo(i * SNAKE_CELL, 0); ctx.lineTo(i * SNAKE_CELL, SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * SNAKE_CELL); ctx.lineTo(SIZE, i * SNAKE_CELL); ctx.stroke();
  }

  // Food — glowing circle
  const fx = s.food.x * SNAKE_CELL + SNAKE_CELL / 2;
  const fy = s.food.y * SNAKE_CELL + SNAKE_CELL / 2;
  ctx.shadowColor = 'hsl(31,90%,58%)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'hsl(31,90%,58%)';
  ctx.beginPath(); ctx.arc(fx, fy, SNAKE_CELL / 2 - 2, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Snake segments
  s.snake.forEach((seg, i) => {
    const x = seg.x * SNAKE_CELL + 1.5;
    const y = seg.y * SNAKE_CELL + 1.5;
    const w = SNAKE_CELL - 3;
    const h = SNAKE_CELL - 3;
    const r = i === 0 ? 6 : 3;
    const l = Math.max(28, 46 - i * 1.1);
    ctx.fillStyle = i === 0 ? 'hsl(164,70%,46%)' : `hsl(164,55%,${l}%)`;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  });

  // Overlays
  if (!s.started && !s.dead) {
    ctx.fillStyle = 'rgba(13,27,18,0.76)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 14px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press ↑ ↓ ← → to start', SIZE / 2, SIZE / 2 - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.44)';
    ctx.font = '11px system-ui,sans-serif';
    ctx.fillText('WASD also works', SIZE / 2, SIZE / 2 + 13);
  }
  if (s.dead) {
    ctx.fillStyle = 'rgba(13,27,18,0.84)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'hsl(1,68%,65%)';
    ctx.font = 'bold 22px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', SIZE / 2, SIZE / 2 - 14);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '14px system-ui,sans-serif';
    ctx.fillText(`Score: ${s.score}`, SIZE / 2, SIZE / 2 + 12);
  }
}

function SnakeGame({ onEnd, onScoreChange }: { onEnd: (score: number) => void; onScoreChange?: (s: number) => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const stateRef   = useRef<SnakeState>(makeSnakeInitial());
  const callbackRef = useRef({ onEnd, onScoreChange });
  callbackRef.current = { onEnd, onScoreChange };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    Object.assign(s, makeSnakeInitial());
    snakeSpawnFood(s);
    canvas.focus();

    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      if (st.dead) return;
      const MAP: Record<string, Vec2> = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
        a: { x: -1, y: 0 }, d: { x: 1, y: 0 },
      };
      const nd = MAP[e.key];
      if (!nd) return;
      if (e.key.startsWith('Arrow')) e.preventDefault();
      if (st.started && nd.x === -st.dir.x && nd.y === -st.dir.y) return;
      st.nextDir = nd;
      st.started = true;
    };

    window.addEventListener('keydown', onKey);

    let rafId: number;
    let gameEnded = false;

    const loop = (ts: number) => {
      const st = stateRef.current;
      if (st.dead && !gameEnded) {
        gameEnded = true;
        snakeRender(ctx, st);
        setTimeout(() => callbackRef.current.onEnd(st.score), 1200);
        return;
      }
      rafId = requestAnimationFrame(loop);
      if (st.started && !st.dead) {
        if (st.lastTick === 0) st.lastTick = ts;
        if (ts - st.lastTick >= st.interval) {
          const prevScore = st.score;
          st.lastTick = ts;
          snakeTick(st);
          if (st.score !== prevScore) callbackRef.current.onScoreChange?.(st.score);
        }
      }
      snakeRender(ctx, st);
    };

    rafId = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(rafId); window.removeEventListener('keydown', onKey); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={SNAKE_GRID * SNAKE_CELL}
      height={SNAKE_GRID * SNAKE_CELL}
      className="snake-canvas"
      tabIndex={0}
      aria-label="Office Snake game"
    />
  );
}

type DailyGameId = 'snake' | 'memory';

// ── Daily Game card ────────────────────────────────────────────────────────

type DailyGamePhase = 'idle' | 'playing' | 'ended';

const DAILY_GAME_ROTATION: DailyGameId[] = ['snake', 'memory'];

function getDailyPlayedKey(gameId: DailyGameId) {
  const d = new Date();
  return `cubical-breakroom-played-${gameId}-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const GAME_META: Record<DailyGameId, {
  name: string; emoji: string; desc: string;
  bestKey: string; unit: string; unitSingular: string;
  completionLines: string[];
  endEmoji: (score: number) => string;
}> = {
  snake: {
    name: 'Office Snake',
    emoji: '🐍',
    desc: 'Navigate the corridors. Eat the memos. Try not to crash into a deadline.',
    bestKey: 'cubical-breakroom-snake-best',
    unit: 'memos',
    unitSingular: 'memo',
    completionLines: [
      'Break successfully taken.',
      'Productivity temporarily defeated.',
      "Your manager probably won't notice.",
      'Snake: 1. Deadlines: 0.',
      "That's enough fun for one afternoon.",
      'Inbox can wait. Snake cannot.',
    ],
    endEmoji: (s) => s >= 10 ? '🏆' : s >= 5 ? '🎉' : '😅',
  },
  memory: {
    name: 'Memory Match',
    emoji: '🃏',
    desc: 'Flip the cards, find the pairs. Prove you still have working memory after that last meeting.',
    bestKey: 'cubical-breakroom-memory-best',
    unit: 'pairs',
    unitSingular: 'pair',
    completionLines: [
      'Memory like an elephant.',
      'HR would be impressed.',
      'Filing system: mental.',
      'All 8 pairs found. Brain.exe working.',
      "That's the kind of focus meetings need.",
      'Matched them all. Take a bow.',
    ],
    endEmoji: (s) => s >= 8 ? '🏆' : s >= 5 ? '🎉' : '😅',
  },
};
const COMPLETION_LINES = [
  'Break successfully taken.',
  'Productivity temporarily defeated.',
  'Your manager probably won\'t notice.',
  'Snake: 1. Deadlines: 0.',
  'That\'s enough fun for one afternoon.',
  'Inbox can wait. Snake cannot.',
];

function DailyGameCard() {
  const gameId = getDailyGameId();
  const meta   = GAME_META[gameId];

  const [phase, setPhase]       = useState<DailyGamePhase>('idle');
  const [liveScore, setLiveScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    try { return parseInt(localStorage.getItem(meta.bestKey) ?? '0', 10) || 0; } catch { return 0; }
  });
  const [playedToday, setPlayedToday] = useState(() => {
    try { return localStorage.getItem(getDailyPlayedKey(gameId)) === 'true'; } catch { return false; }
  });
  const [isNewBest, setIsNewBest] = useState(false);

  const today = new Date().toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });
  const completionLine = meta.completionLines[finalScore % meta.completionLines.length];

  const handleEnd = (score: number) => {
    setFinalScore(score);
    setPhase('ended');
    const nb = score > bestScore;
    if (nb) {
      setBestScore(score);
      try { localStorage.setItem(meta.bestKey, String(score)); } catch {}
    }
    setIsNewBest(nb);
    if (!playedToday) {
      setPlayedToday(true);
      try { localStorage.setItem(getDailyPlayedKey(gameId), 'true'); } catch {}
    }
  };

  const startGame  = () => { setLiveScore(0); setIsNewBest(false); setPhase('playing'); };
  const backToIdle = () => { setPhase('idle'); };

  const liveUnit = liveScore === 1 ? meta.unitSingular : meta.unit;

  return (
    <div className="daily-card" data-testid="daily-game-card">
      <div className="daily-card-top">
        <div className="daily-badge-row">
          <span className="daily-badge"><Zap /> Today's game</span>
          <span className="daily-date">{today}</span>
        </div>

        {/* Idle state */}
        {phase === 'idle' && (
          <div className="daily-idle">
            <div className="daily-game-emoji">{meta.emoji}</div>
            <div className="daily-game-info">
              <h2 className="daily-game-name">{meta.name}</h2>
              <p className="daily-game-desc">{meta.desc}</p>
              <div className="daily-stats-row">
                {playedToday && <span className="daily-played-badge"><Check /> Played today</span>}
                {bestScore > 0 && (
                  <span className="daily-best-score"><Trophy /> Best: {bestScore} {meta.unit}</span>
                )}
              </div>
            </div>
            <button className="button-primary daily-play-btn" onClick={startGame} data-testid="button-play-daily">
              <Play /> {playedToday ? 'Play Again' : "Play Today's Game"}
            </button>
          </div>
        )}

        {/* Playing state */}
        {phase === 'playing' && (
          <div className="daily-playing">
            <div className="daily-playing-header">
              <span className="daily-live-score"><Trophy /> {liveScore} {liveUnit}</span>
              <button className="button-quiet" onClick={backToIdle} data-testid="button-give-up"><X /> Give up</button>
            </div>
            {gameId === 'snake' && (
              <>
                <div className="snake-wrapper">
                  <SnakeGame onEnd={handleEnd} onScoreChange={setLiveScore} />
                </div>
                <p className="snake-hint">Arrow keys or WASD to steer · don't hit yourself</p>
              </>
            )}
            {gameId === 'memory' && (
              <MemoryGame onEnd={handleEnd} onScoreChange={setLiveScore} />
            )}
          </div>
        )}

        {/* Ended state */}
        {phase === 'ended' && (
          <div className="daily-ended">
            <div className="daily-ended-emoji">{meta.endEmoji(finalScore)}</div>
            <div className="daily-ended-score">{finalScore}</div>
            <div className="daily-ended-label">{finalScore === 1 ? meta.unitSingular : meta.unit} {gameId === 'memory' ? 'matched' : 'eaten'}</div>
            {isNewBest && <div className="daily-new-best">✨ New personal best!</div>}
            <p className="daily-completion-msg">"{completionLine}"</p>
            <div className="daily-ended-actions">
              <button className="button-quiet" onClick={backToIdle}>Back</button>
              <button className="button-primary" onClick={startGame} data-testid="button-play-again">
                <RotateCcw /> Play Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Break Timer ────────────────────────────────────────────────────────────

type TimerPreset = 5 | 10 | 15;

function BreakTimerCard() {
  const [preset, setPreset]     = useState<TimerPreset | null>(null);
  const [remaining, setRemaining] = useState(0); // seconds
  const [running, setRunning]   = useState(false);
  const [done, setDone]         = useState(false);
  const intervalRef             = useRef<number | null>(null);

  const clearTimer = () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };

  const startPreset = (p: TimerPreset) => {
    clearTimer();
    setPreset(p);
    setRemaining(p * 60);
    setRunning(true);
    setDone(false);
  };

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearTimer(); setRunning(false); setDone(true); return 0; }
        return r - 1;
      });
    }, 1000);
    return clearTimer;
  }, [running]);

  const pause  = () => { clearTimer(); setRunning(false); };
  const resume = () => {
    if (remaining <= 0) return;
    setDone(false);
    setRunning(true);
  };
  const reset  = () => {
    clearTimer();
    setRunning(false);
    setDone(false);
    if (preset) setRemaining(preset * 60);
  };
  const clear  = () => { clearTimer(); setPreset(null); setRemaining(0); setRunning(false); setDone(false); };

  const mins    = Math.floor(remaining / 60);
  const secs    = remaining % 60;
  const pct     = preset ? ((preset * 60 - remaining) / (preset * 60)) * 100 : 0;

  return (
    <div className="break-timer-card" data-testid="break-timer-card">
      <div className="break-timer-header">
        <span className="widget-label"><Timer /> Break Timer</span>
      </div>

      {!preset ? (
        <div className="break-timer-presets">
          <p className="break-timer-hint">Take five. Or ten. You've earned it.</p>
          {([5, 10, 15] as TimerPreset[]).map((p) => (
            <button key={p} className="break-preset-btn" onClick={() => startPreset(p)} data-testid={`button-preset-${p}`}>
              {p} min
            </button>
          ))}
        </div>
      ) : (
        <div className="break-timer-active">
          <div className="break-timer-ring" style={{ '--pct': `${pct}` } as CSSProperties}>
            <svg viewBox="0 0 64 64" className="break-ring-svg">
              <circle cx="32" cy="32" r="28" className="break-ring-bg" />
              <circle cx="32" cy="32" r="28" className="break-ring-fg"
                strokeDasharray={`${(pct / 100) * 175.93} 175.93`}
                transform="rotate(-90 32 32)"
              />
            </svg>
            <div className="break-ring-time">
              {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
            </div>
          </div>

          {done ? (
            <div className="break-timer-done">
              <p>Time's up! Back to it. 👋</p>
              <button className="button-primary" style={{ marginTop: 10 }} onClick={clear}>Done</button>
            </div>
          ) : (
            <div className="break-timer-controls">
              {running
                ? <button className="break-ctrl-btn" onClick={pause} aria-label="Pause"><Pause /></button>
                : <button className="break-ctrl-btn" onClick={resume} aria-label="Resume"><Play /></button>
              }
              <button className="break-ctrl-btn" onClick={reset} aria-label="Reset"><RotateCcw /></button>
              <button className="break-ctrl-btn break-ctrl-cancel" onClick={clear} aria-label="Cancel"><X /></button>
            </div>
          )}
          <span className="break-preset-label">{preset}-minute break</span>
        </div>
      )}
    </div>
  );
}

// ── Games catalog ──────────────────────────────────────────────────────────

type BreakGame = {
  id: string; name: string; description: string;
  price: string; emoji: string; tags: string[];
  owned?: boolean;
};

const BREAK_GAMES: BreakGame[] = [
  { id: 'office-snake',           name: 'Office Snake',          description: 'Navigate the corridors. Eat the memos. Try not to crash into a deadline.',            price: 'FREE',  emoji: '🐍', tags: ['Arcade'], owned: true },
  { id: 'spreadsheet-survivor',   name: 'Spreadsheet Survivor',  description: 'Merge cells, dodge pivot tables, and somehow survive until Friday.',                   price: '$1.99', emoji: '📊', tags: ['Strategy'] },
  { id: 'coffee-solitaire',       name: 'Coffee Break Solitaire',description: 'The classic card game. With coffee. All you ever really needed.',                      price: '$0.99', emoji: '☕', tags: ['Cards'] },
  { id: 'inbox-zero-hero',        name: 'Inbox Zero Hero',        description: 'Sort, archive, and unsubscribe your way to legendary inbox status.',                   price: '$1.49', emoji: '📬', tags: ['Puzzle'] },
  { id: 'desktop-defender',       name: 'Desktop Defender',       description: 'They are coming for your files. Defend the hard drive at all costs.',                  price: '$2.99', emoji: '🖥️', tags: ['Action'] },
  { id: 'paper-jam',              name: 'Paper Jam',              description: 'Clear the printer before your boss notices. A race against corporate time.',           price: '$1.49', emoji: '🖨️', tags: ['Puzzle'] },
  { id: 'corporate-climber',      name: 'Corporate Climber',      description: 'Platform jumping meets org-chart politics. Reach the top floor without selling out.',  price: '$2.49', emoji: '🏢', tags: ['Platformer'] },
];

const OWNED_GAMES_KEY = 'cubical-breakroom-owned-games';
function getOwnedGames(): string[] {
  return readLocal<string[]>(OWNED_GAMES_KEY, ['office-snake'], isStringArray);
}
function storeOwnedGames(ids: string[]) { writeLocal(OWNED_GAMES_KEY, ids); }

function GameCard({ game, isOwned, onAcquire, onPlay }: { game: BreakGame; isOwned: boolean; onAcquire: (id: string) => void; onPlay: (id: string) => void }) {
  const isFree = game.price === 'FREE';
  return (
    <div className={`game-card${isOwned ? ' is-owned' : ''}`} data-testid={`card-game-${game.id}`}>
      <div className="game-card-cover">
        <span className="game-emoji" aria-hidden>{game.emoji}</span>
        {isOwned && <span className="game-owned-badge"><Check /> Owned</span>}
      </div>
      <div className="game-card-body">
        <div className="game-card-tags">
          {game.tags.map((t) => <span key={t} className="game-tag">{t}</span>)}
        </div>
        <span className="game-card-name">{game.name}</span>
        <p className="game-card-desc">{game.description}</p>
        <div className="game-card-footer">
          <span className={`game-price${isFree ? ' is-free' : ''}`}>{game.price}</span>
          {isOwned
            ? <button className="button-primary game-action-btn" onClick={() => onPlay(game.id)} data-testid={`button-play-${game.id}`}><Play /> Play</button>
            : <button className="button-quiet game-action-btn" onClick={() => onAcquire(game.id)} data-testid={`button-get-${game.id}`}>{isFree ? 'Get Free' : 'Purchase'} <ArrowRight /></button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Game Play Modal ────────────────────────────────────────────────────────

const GAME_PLAY_META: Record<string, { unitSingular: string; unit: string; endAction: string; endEmoji: (s: number) => string }> = {
  'office-snake': {
    unitSingular: 'memo', unit: 'memos', endAction: 'eaten',
    endEmoji: (s) => s >= 10 ? '🏆' : s >= 5 ? '🎉' : '😅',
  },
  'coffee-solitaire': {
    unitSingular: 'pair', unit: 'pairs', endAction: 'matched',
    endEmoji: (s) => s >= 8 ? '🏆' : s >= 5 ? '🎉' : '😅',
  },
};

type GamePlayPhase = 'playing' | 'ended';

function GamePlayModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const game    = BREAK_GAMES.find((g) => g.id === gameId)!;
  const meta    = GAME_PLAY_META[gameId];
  const isPlayable = !!meta;

  const [phase, setPhase]           = useState<GamePlayPhase>('playing');
  const [liveScore, setLiveScore]   = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [isNewBest, setIsNewBest]   = useState(false);
  const [playKey, setPlayKey]       = useState(0); // increment to remount game

  const bestKey = `cubical-game-best-${gameId}`;
  const [bestScore, setBestScore]   = useState(() => {
    try { return parseInt(localStorage.getItem(bestKey) ?? '0', 10) || 0; } catch { return 0; }
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleEnd = (score: number) => {
    setFinalScore(score);
    setPhase('ended');
    if (score > bestScore) {
      setIsNewBest(true);
      setBestScore(score);
      try { localStorage.setItem(bestKey, String(score)); } catch {}
    }
  };

  const handleRestart = () => {
    setLiveScore(0);
    setIsNewBest(false);
    setPhase('playing');
    setPlayKey((k) => k + 1);
  };

  const unit = (s: number) => (s === 1 ? meta?.unitSingular : meta?.unit) ?? '';

  return createPortal(
    <div className="game-play-overlay" onClick={onClose} aria-modal role="dialog">
      <div className="game-play-panel" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="game-play-header">
          <button className="game-play-back" onClick={onClose} data-testid="button-back-breakroom">
            <ArrowLeft /> Back to Breakroom
          </button>
          <div className="game-play-title">
            <span className="game-play-emoji">{game.emoji}</span>
            <span>{game.name}</span>
          </div>
        </div>

        {/* Body */}
        {!isPlayable ? (
          /* ── Coming Soon ── */
          <div className="game-coming-soon">
            <div className="game-coming-soon-inner">
              <div className="game-coming-emoji">{game.emoji}</div>
              <h2 className="game-coming-title">{game.name}</h2>
              <p className="game-coming-desc">
                This one's still being polished. We're ironing out the last few bugs — check back soon.
              </p>
              <div className="game-coming-tags">
                {game.tags.map((t) => <span key={t} className="game-tag">{t}</span>)}
              </div>
              <span className="game-coming-badge"><Sparkles /> Coming soon</span>
              <button className="button-primary" onClick={onClose} style={{ marginTop: 20 }} data-testid="button-back-coming-soon">
                <ArrowLeft /> Back to Breakroom
              </button>
            </div>
          </div>
        ) : phase === 'playing' ? (
          /* ── Playing ── */
          <div className="game-play-playing">
            <div className="game-play-score-row">
              <span className="daily-live-score"><Trophy /> {liveScore} {unit(liveScore)}</span>
              <button className="button-quiet" onClick={onClose} data-testid="button-give-up-modal"><X /> Give up</button>
            </div>
            {gameId === 'office-snake' && (
              <>
                <div className="snake-wrapper">
                  <SnakeGame key={playKey} onEnd={handleEnd} onScoreChange={setLiveScore} />
                </div>
                <p className="snake-hint">Arrow keys or WASD to steer · don't hit yourself</p>
              </>
            )}
            {gameId === 'coffee-solitaire' && (
              <MemoryGame key={playKey} onEnd={handleEnd} onScoreChange={setLiveScore} />
            )}
          </div>
        ) : (
          /* ── Ended ── */
          <div className="game-play-ended">
            <div className="daily-ended-emoji">{meta.endEmoji(finalScore)}</div>
            <div className="daily-ended-score">{finalScore}</div>
            <div className="daily-ended-label">{unit(finalScore)} {meta.endAction}</div>
            {isNewBest && <div className="daily-new-best">✨ New personal best!</div>}
            {bestScore > 0 && !isNewBest && (
              <div className="game-play-prev-best"><Trophy /> Best: {bestScore} {unit(bestScore)}</div>
            )}
            <div className="daily-ended-actions">
              <button className="button-quiet" onClick={onClose} data-testid="button-back-ended"><ArrowLeft /> Breakroom</button>
              <button className="button-primary" onClick={handleRestart} data-testid="button-play-again-modal"><RotateCcw /> Play Again</button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Cosmetics catalog ──────────────────────────────────────────────────────

type CosmeticType = 'Theme' | 'Background' | 'Avatar Frame' | 'Cursor' | 'Pack';
type Cosmetic = {
  id: string; name: string; type: CosmeticType; price: string;
  description: string; palette: string[]; isDefault?: boolean;
};

const COSMETICS: Cosmetic[] = [
  { id: 'default',          name: 'Workspace Classic',  type: 'Theme',        price: 'Free',  description: 'The clean, familiar look you know.',                isDefault: true, palette: ['#FAF7F3','#1a2e1f','#5a7a60'] },
  { id: 'midnight-office',  name: 'Midnight Office',    type: 'Theme',        price: '$2.99', description: 'A darker late-night workspace for the night owls.', palette: ['#0f1117','#1e2d3d','#4c9eff'] },
  { id: 'cozy-desk',        name: 'Cozy Desk',          type: 'Theme',        price: '$1.99', description: 'Warm tones and soft lighting. Like your favourite café.', palette: ['#fdf6ec','#7a4f2a','#d4a76a'] },
  { id: 'retro-terminal',   name: 'Retro Terminal',     type: 'Theme',        price: '$3.99', description: 'Old-school phosphor glow. Real ones remember CRT.', palette: ['#0a0f0a','#1a3a1a','#33ff33'] },
  { id: 'neon-nights',      name: 'Neon Nights',        type: 'Theme',        price: '$2.49', description: 'Colorful cyber-inspired glow. Very 1984, very good.', palette: ['#0d0018','#2d0050','#ff2dce','#00f5ff'] },
  { id: 'forest-mode',      name: 'Forest Mode',        type: 'Background',   price: '$1.49', description: 'Calm woodland background for when you need to breathe.', palette: ['#1a3a1e','#2d6a2e','#6aab6e'] },
  { id: 'coffee-frame',     name: 'Coffee Cup Frame',   type: 'Avatar Frame', price: '$0.99', description: 'The most important cup of the day. Now around your face.', palette: ['#5c3317','#8b5e3c','#f0c98a'] },
  { id: 'sparkle-trail',    name: 'Sparkle Trail',      type: 'Cursor',       price: '$1.99', description: 'Leave a little magic behind wherever you click.', palette: ['#ffe566','#ff9ef5','#66e8ff'] },
  { id: 'winter-pack',      name: 'Winter Office',      type: 'Pack',         price: '$4.99', description: 'Seasonal winter cosmetic collection. Frosty, cosy, limited.', palette: ['#e8f4f8','#a8d4e6','#4a90c4','#2c5f8a'] },
];

const OWNED_COSMETICS_KEY   = 'cubical-breakroom-owned-cosmetics';
const EQUIPPED_COSMETIC_KEY = 'cubical-breakroom-equipped';

// ── Theme palette system ───────────────────────────────────────────────────
// Values are bare HSL components (e.g. "164 48% 32%") matching the CSS
// custom-property convention used throughout index.css.

type ThemeVars = {
  background: string;
  foreground: string;
  border: string;
  input: string;
  ring: string;
  card: string;
  'card-foreground': string;
  'card-border': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
};

const THEME_PALETTES: Record<string, ThemeVars> = {
  'default': {
    background:           '42 43% 95%',
    foreground:           '222 35% 18%',
    border:               '40 25% 86%',
    input:                '40 25% 86%',
    ring:                 '165 48% 36%',
    card:                 '45 44% 98%',
    'card-foreground':    '222 35% 18%',
    'card-border':        '40 25% 86%',
    primary:              '164 48% 32%',
    'primary-foreground': '42 43% 95%',
    secondary:            '42 35% 90%',
    'secondary-foreground': '222 35% 18%',
    muted:                '40 22% 91%',
    'muted-foreground':   '218 14% 48%',
    accent:               '24 92% 62%',
    'accent-foreground':  '222 35% 18%',
  },
  'midnight-office': {
    background:           '222 35% 10%',
    foreground:           '210 25% 88%',
    border:               '220 20% 22%',
    input:                '220 20% 22%',
    ring:                 '210 75% 58%',
    card:                 '222 30% 14%',
    'card-foreground':    '210 25% 88%',
    'card-border':        '220 20% 22%',
    primary:              '210 75% 58%',
    'primary-foreground': '222 35% 10%',
    secondary:            '220 22% 20%',
    'secondary-foreground': '210 25% 88%',
    muted:                '220 22% 18%',
    'muted-foreground':   '215 15% 58%',
    accent:               '210 75% 62%',
    'accent-foreground':  '222 35% 10%',
  },
  'cozy-desk': {
    background:           '35 55% 95%',
    foreground:           '25 45% 20%',
    border:               '33 30% 84%',
    input:                '33 30% 84%',
    ring:                 '25 52% 38%',
    card:                 '36 52% 98%',
    'card-foreground':    '25 45% 20%',
    'card-border':        '33 30% 84%',
    primary:              '25 52% 38%',
    'primary-foreground': '36 52% 98%',
    secondary:            '33 38% 89%',
    'secondary-foreground': '25 45% 20%',
    muted:                '33 32% 89%',
    'muted-foreground':   '25 20% 50%',
    accent:               '32 78% 56%',
    'accent-foreground':  '25 45% 20%',
  },
  'retro-terminal': {
    background:           '120 60% 4%',
    foreground:           '120 85% 68%',
    border:               '120 45% 18%',
    input:                '120 45% 18%',
    ring:                 '120 90% 42%',
    card:                 '120 45% 7%',
    'card-foreground':    '120 85% 68%',
    'card-border':        '120 45% 18%',
    primary:              '120 90% 42%',
    'primary-foreground': '120 60% 4%',
    secondary:            '120 30% 10%',
    'secondary-foreground': '120 85% 68%',
    muted:                '120 28% 10%',
    'muted-foreground':   '120 40% 42%',
    accent:               '120 100% 50%',
    'accent-foreground':  '120 60% 4%',
  },
  'neon-nights': {
    background:           '270 70% 5%',
    foreground:           '280 15% 88%',
    border:               '270 42% 18%',
    input:                '270 42% 18%',
    ring:                 '300 75% 60%',
    card:                 '270 55% 9%',
    'card-foreground':    '280 15% 88%',
    'card-border':        '270 42% 18%',
    primary:              '300 75% 60%',
    'primary-foreground': '270 70% 5%',
    secondary:            '270 32% 13%',
    'secondary-foreground': '280 15% 88%',
    muted:                '270 30% 13%',
    'muted-foreground':   '270 18% 58%',
    accent:               '185 100% 52%',
    'accent-foreground':  '270 70% 5%',
  },
  'forest-mode': {
    background:           '135 35% 11%',
    foreground:           '120 20% 82%',
    border:               '130 25% 22%',
    input:                '130 25% 22%',
    ring:                 '130 48% 50%',
    card:                 '133 28% 15%',
    'card-foreground':    '120 20% 82%',
    'card-border':        '130 25% 22%',
    primary:              '130 48% 52%',
    'primary-foreground': '135 35% 11%',
    secondary:            '130 22% 18%',
    'secondary-foreground': '120 20% 82%',
    muted:                '130 20% 18%',
    'muted-foreground':   '120 14% 52%',
    accent:               '78 55% 52%',
    'accent-foreground':  '135 35% 11%',
  },
  'coffee-frame': {
    background:           '30 42% 93%',
    foreground:           '25 45% 18%',
    border:               '28 28% 82%',
    input:                '28 28% 82%',
    ring:                 '25 55% 35%',
    card:                 '30 40% 97%',
    'card-foreground':    '25 45% 18%',
    'card-border':        '28 28% 82%',
    primary:              '25 55% 35%',
    'primary-foreground': '30 40% 97%',
    secondary:            '28 35% 87%',
    'secondary-foreground': '25 45% 18%',
    muted:                '28 32% 87%',
    'muted-foreground':   '25 18% 50%',
    accent:               '36 75% 60%',
    'accent-foreground':  '25 45% 18%',
  },
  'sparkle-trail': {
    background:           '275 30% 96%',
    foreground:           '270 40% 18%',
    border:               '275 22% 86%',
    input:                '275 22% 86%',
    ring:                 '280 58% 52%',
    card:                 '275 28% 98%',
    'card-foreground':    '270 40% 18%',
    'card-border':        '275 22% 86%',
    primary:              '280 58% 52%',
    'primary-foreground': '275 30% 96%',
    secondary:            '275 22% 90%',
    'secondary-foreground': '270 40% 18%',
    muted:                '275 20% 90%',
    'muted-foreground':   '270 15% 50%',
    accent:               '335 85% 65%',
    'accent-foreground':  '270 40% 18%',
  },
  'winter-pack': {
    background:           '200 42% 95%',
    foreground:           '210 35% 18%',
    border:               '200 28% 84%',
    input:                '200 28% 84%',
    ring:                 '210 62% 45%',
    card:                 '200 45% 98%',
    'card-foreground':    '210 35% 18%',
    'card-border':        '200 28% 84%',
    primary:              '210 62% 45%',
    'primary-foreground': '200 45% 98%',
    secondary:            '200 30% 88%',
    'secondary-foreground': '210 35% 18%',
    muted:                '200 28% 88%',
    'muted-foreground':   '210 15% 50%',
    accent:               '195 68% 52%',
    'accent-foreground':  '210 35% 18%',
  },
};

const THEME_VAR_KEYS: (keyof ThemeVars)[] = [
  'background', 'foreground', 'border', 'input', 'ring',
  'card', 'card-foreground', 'card-border',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
];

function applyTheme(cosmeticId: string) {
  const palette = THEME_PALETTES[cosmeticId] ?? THEME_PALETTES['default'];
  const root = document.documentElement;
  for (const key of THEME_VAR_KEYS) {
    root.style.setProperty(`--${key}`, palette[key]);
  }
}

function getOwnedCosmetics(): string[] {
  return readLocal<string[]>(OWNED_COSMETICS_KEY, ['default'], isStringArray);
}
function getEquippedCosmetic(): string {
  try { return localStorage.getItem(EQUIPPED_COSMETIC_KEY) ?? 'default'; } catch { return 'default'; }
}
function storeOwnedCosmetics(ids: string[]) { writeLocal(OWNED_COSMETICS_KEY, ids); }
function storeEquippedCosmetic(id: string) { try { localStorage.setItem(EQUIPPED_COSMETIC_KEY, id); } catch {} }

function CosmeticCard({ cosmetic, isOwned, isEquipped, onAcquire, onEquip }: {
  cosmetic: Cosmetic; isOwned: boolean; isEquipped: boolean;
  onAcquire: (id: string) => void; onEquip: (id: string) => void;
}) {
  const isFree = cosmetic.price === 'Free' || cosmetic.isDefault;
  return (
    <div className={`cosmetic-card${isOwned ? ' is-owned' : ''}${isEquipped ? ' is-equipped' : ''}`} data-testid={`card-cosmetic-${cosmetic.id}`}>
      <div className="cosmetic-preview" aria-hidden>
        {cosmetic.palette.map((c, i) => <span key={i} style={{ background: c }} />)}
      </div>
      <div className="cosmetic-card-body">
        <div className="cosmetic-meta-row">
          <span className="cosmetic-type-badge">{cosmetic.type}</span>
          {isEquipped && <span className="cosmetic-equipped-badge"><Check /> Equipped</span>}
        </div>
        <span className="cosmetic-name">{cosmetic.name}</span>
        <p className="cosmetic-desc">{cosmetic.description}</p>
        <div className="cosmetic-footer">
          <span className={`cosmetic-price${isFree ? ' is-free' : ''}`}>{cosmetic.price}</span>
          {isOwned
            ? isEquipped
              ? <span className="cosmetic-active-label">Active</span>
              : <button className="button-quiet cosmetic-action-btn" onClick={() => onEquip(cosmetic.id)} data-testid={`button-equip-${cosmetic.id}`}>Equip</button>
            : <button className="button-quiet cosmetic-action-btn" onClick={() => onAcquire(cosmetic.id)} data-testid={`button-buy-${cosmetic.id}`}>{isFree ? 'Get Free' : 'Purchase'} <ArrowRight /></button>
          }
        </div>
      </div>
    </div>
  );
}

// ── Breakroom page ─────────────────────────────────────────────────────────

function BreakroomPage() {
  const [ownedGames, setOwnedGames]         = useState<string[]>(getOwnedGames);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>(getOwnedCosmetics);
  const [equippedCosmetic, setEquippedCosmetic] = useState<string>(getEquippedCosmetic);
  const [toast, setToast]                   = useState<string | null>(null);
  const [activeGameId, setActiveGameId]     = useState<string | null>(null);

  useEffect(() => { storeOwnedGames(ownedGames); }, [ownedGames]);
  useEffect(() => { storeOwnedCosmetics(ownedCosmetics); }, [ownedCosmetics]);
  useEffect(() => { storeEquippedCosmetic(equippedCosmetic); }, [equippedCosmetic]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const acquireGame = (id: string) => {
    const g = BREAK_GAMES.find((x) => x.id === id);
    if (!g) return;
    setOwnedGames((prev) => prev.includes(id) ? prev : [...prev, id]);
    setToast(g.price === 'FREE' ? `${g.name} added to your games (free)` : `${g.name} purchased — enjoy!`);
  };

  const acquireCosmetic = (id: string) => {
    const c = COSMETICS.find((x) => x.id === id);
    if (!c) return;
    setOwnedCosmetics((prev) => prev.includes(id) ? prev : [...prev, id]);
    setToast(c.price === 'Free' ? `${c.name} added to your collection` : `${c.name} purchased!`);
  };

  const equipCosmetic = (id: string) => {
    setEquippedCosmetic(id);
    applyTheme(id);
    const c = COSMETICS.find((x) => x.id === id);
    setToast(`${c?.name ?? id} equipped. Looking sharp.`);
  };

  const yourGames  = BREAK_GAMES.filter((g) => ownedGames.includes(g.id));
  const storeGames = BREAK_GAMES.filter((g) => !ownedGames.includes(g.id));

  return (
    <div className="breakroom-page" data-testid="breakroom-page">
      {/* Page header */}
      <div className="page-intro breakroom-intro">
        <div className="eyebrow">⏸ Take a breather</div>
        <h1 className="display-title mt-4">The Breakroom.</h1>
        <p>You've been working. This is the part where you stop for a moment.<br />Games, timers, and a small excuse to close the spreadsheet.</p>
      </div>

      {/* Daily game + Break timer row */}
      <div id="daily-game-section" className="breakroom-top-row">
        <DailyGameCard />
        <BreakTimerCard />
      </div>

      {/* Your Games */}
      {yourGames.length > 0 && (
        <div className="breakroom-section">
          <div className="breakroom-section-header">
            <div>
              <div className="eyebrow">Your games</div>
              <h2 className="breakroom-section-title"><Gamepad2 /> Your Library</h2>
            </div>
            <span className="library-count">{String(yourGames.length).padStart(2,'0')} owned</span>
          </div>
          <div className="game-grid">
            {yourGames.map((g) => (
              <GameCard key={g.id} game={g} isOwned onAcquire={acquireGame} onPlay={setActiveGameId} />
            ))}
          </div>
        </div>
      )}

      {/* Game store */}
      {storeGames.length > 0 && (
        <div className="breakroom-section">
          <div className="breakroom-section-header">
            <div>
              <div className="eyebrow">Get more</div>
              <h2 className="breakroom-section-title"><Sparkles /> Game Store</h2>
            </div>
          </div>
          <div className="game-grid">
            {storeGames.map((g) => (
              <GameCard key={g.id} game={g} isOwned={false} onAcquire={acquireGame} onPlay={setActiveGameId} />
            ))}
          </div>
        </div>
      )}

      {/* Cosmetics */}
      <div className="breakroom-section">
        <div className="breakroom-section-header">
          <div>
            <div className="eyebrow">Cosmetics</div>
            <h2 className="breakroom-section-title"><Palette /> Make it yours</h2>
          </div>
          <span className="library-count">{ownedCosmetics.length} owned</span>
        </div>
        <p className="breakroom-section-sub">Themes, backgrounds, and decorations. None of them make you more productive. That's the point.</p>
        <div className="cosmetics-grid">
          {COSMETICS.map((c) => (
            <CosmeticCard
              key={c.id} cosmetic={c}
              isOwned={ownedCosmetics.includes(c.id)}
              isEquipped={equippedCosmetic === c.id}
              onAcquire={acquireCosmetic}
              onEquip={equipCosmetic}
            />
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-message" role="status" data-testid="breakroom-toast">
          <Check /> {toast}
        </div>
      )}

      {/* Game Play Modal */}
      {activeGameId && (
        <GamePlayModal gameId={activeGameId} onClose={() => setActiveGameId(null)} />
      )}
    </div>
  );
}

// ─── File Finder page ─────────────────────────────────────────────────────────

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

function FileFinderPage() {
  const ff = typeof window !== 'undefined' ? window.cubicalDesktop?.fileFinder : undefined;
  const isDesktop = !!ff;

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

  // Consume any pending query forwarded from the home widget
  useEffect(() => {
    try {
      const pending = window.localStorage?.getItem(FF_PENDING_QUERY_KEY);
      if (pending) {
        window.localStorage.removeItem(FF_PENDING_QUERY_KEY);
        setQuery(pending);
      }
    } catch { /* localStorage unavailable */ }
    inputRef.current?.focus();
  }, []);

  // Wire up Electron streaming listeners
  useEffect(() => {
    if (!ff) return;
    const unsub1 = ff.onProgress(setProgress);
    const unsub2 = ff.onComplete((data) => {
      setResults(data.results);
      setSearching(false);
      setProgress(null);
    });
    return () => { unsub1(); unsub2(); };
  }, [ff]);

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
    setSearching(true);
    setResults([]);
    setHasSearched(true);
    setProgress({ found: 0, scanning: 'Starting…' });
    ff.startSearch(term, folders);
  };

  const handleCancel = () => {
    ff?.cancelSearch();
    setSearching(false);
    setProgress(null);
  };

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
    } catch { /* clipboard unavailable */ }
  };

  const clearRecent = () => { setRecentSearches([]); writeLocal(RECENT_SEARCHES_KEY, []); };

  // Filter
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

  // Sort
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

  // ── Desktop-only gate ──────────────────────────────────────────────────────
  if (!isDesktop) {
    return (
      <section className="ff-page">
        <div className="page-intro">
          <div className="eyebrow">A focused little utility</div>
          <h1 className="display-title mt-4">File Finder.</h1>
          <p className="mt-1 text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>It's here somewhere.</p>
        </div>
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

  // ── Full search UI ─────────────────────────────────────────────────────────
  return (
    <section className="ff-page">

      {/* Header */}
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

      {/* Search bar */}
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

      {/* Scope selector */}
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

      {/* Filters */}
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

      {/* Progress */}
      {searching && progress && (
        <div className="ff-progress">
          <span className="ff-spinner" />
          <span className="ff-progress-text">
            {progress.found} found · scanning {progress.scanning.split(/[\\/]/).slice(-2).join('/')}
          </span>
        </div>
      )}

      {/* Sort bar */}
      {!searching && sortedResults.length > 0 && (
        <div className="ff-sort-bar">
          <span className="ff-result-count">
            {sortedResults.length} {sortedResults.length === 1 ? 'result' : 'results'}
            {filteredResults.length < results.length ? ` (filtered from ${results.length})` : ''}
          </span>
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

      {/* Results */}
      {!searching && hasSearched && (
        <div className="ff-results">
          {sortedResults.length === 0 ? (
            <div className="ff-empty">
              <FolderSearch className="ff-empty-icon" />
              <p>No luck. Try another name or somewhere else.</p>
            </div>
          ) : sortedResults.map((r) => (
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
                <button className={`ff-action${copiedPath === r.path ? ' ff-action-copied' : ''}`} onClick={() => handleCopyPath(r.path)}>
                  {copiedPath === r.path
                    ? <><Check className="w-3.5 h-3.5" /> Copied</>
                    : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy Path</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent searches — shown only when idle */}
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

    </section>
  );
}

// ─── Placeholder & utility pages ──────────────────────────────────────────────

function PlaceholderPage({ type }: { type: 'profile' | 'settings' }) {
  const profile = type === 'profile';
  return (
    <section className="placeholder-page">
      <div className="eyebrow">{profile ? 'A little about you' : 'Make it yours'}</div>
      <h1 className="display-title mt-4">{profile ? 'Profile.' : 'Settings.'}</h1>
      <div className="placeholder-panel" data-testid={`placeholder-${type}`}>
        <Sparkles className="mb-5 h-6 w-6 text-[hsl(var(--accent))]" />
        <h2 className="font-display text-xl font-semibold tracking-tight">{profile ? 'This is a local prototype.' : 'Nothing to tune just yet.'}</h2>
        <p>{profile ? 'Accounts, names, and cloud profiles are intentionally not part of Cubical yet. For now, this shelf belongs entirely to the person sitting at this desktop.' : 'Cubical keeps things intentionally simple for this first pass. There are no accounts, sync settings, payments, or automatic updates to configure.'}</p>
      </div>
    </section>
  );
}

function NotFound() {
  return <section className="placeholder-page"><div className="eyebrow">Shelf / missing</div><h1 className="display-title mt-4">That page wandered off.</h1><div className="mt-8"><Link href="/store" className="button-primary" data-testid="link-not-found-store">Back to store <ArrowRight /></Link></div></section>;
}

// ─── Hash location hook ───────────────────────────────────────────────────────
// Inline implementation — avoids importing from the wouter/use-hash-location
// sub-path which triggers Vite HMR deduplication issues. Works identically in
// the web browser and in Electron (file:// URLs where path routing breaks).

function useHashLocation(): [string, (to: string, opts?: { replace?: boolean }) => void] {
  const getPath = () => decodeURIComponent(window.location.hash.replace(/^#/, '')) || '/';
  const [path, setPath] = useState(getPath);
  useEffect(() => {
    const handler = () => setPath(getPath());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  const navigate = (to: string, { replace = false } = {}) => {
    if (replace) window.history.replaceState(null, '', '#' + to);
    else window.location.hash = to;
  };
  return [path, navigate];
}

// ─── Root app ─────────────────────────────────────────────────────────────────

function App() {
  const [libraryIds, setLibraryIds] = useState<string[]>(getStoredLibrary);
  const [toast, setToast]           = useState<string | null>(null);
  const libraryProducts = useMemo(() => PRODUCTS.filter((product) => libraryIds.includes(product.id)), [libraryIds]);

  // Apply the persisted cosmetic theme on first mount so every page reflects it.
  useEffect(() => { applyTheme(getEquippedCosmetic()); }, []);

  useEffect(() => { storeLibrary(libraryIds); }, [libraryIds]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 2800); return () => window.clearTimeout(t); }, [toast]);

  const addToLibrary = (product: Product) => {
    setLibraryIds((current) => current.includes(product.id) ? current : [...current, product.id]);
    setToast(`${product.name} added to your library`);
  };
  const openProduct = (product: Product) => {
    const toolRoute = getToolRoute(product);
    if (toolRoute) { window.location.hash = toolRoute; return; }
    setToast(`${product.name} would launch here`);
  };

  // useHashLocation makes all routes use hash-based URLs (e.g. /#/store).
  // This is required for Electron, which loads the app as a file:// URL where
  // path-based routing would 404. It also works identically in the web browser.
  // All existing useLocation() calls, CRUMB_MAP keys, and isActive() checks are
  // unaffected — useHashLocation returns the path portion without the '#'.
  return (
    <Router hook={useHashLocation}>
      <AppShell libraryCount={libraryProducts.length}>
        <Switch>
          <Route path="/"><HomePage /></Route>
          <Route path="/store"><StorePage /></Route>
          <Route path="/product/:id">{(params) => {
            const product = PRODUCTS.find((item) => item.id === params.id);
            if (!product) return <NotFound />;
            return <ProductDetail product={product} isAdded={libraryIds.includes(product.id)} onAdd={() => addToLibrary(product)} onOpen={() => openProduct(product)} />;
          }}</Route>
          <Route path="/library"><LibraryPage products={libraryProducts} onOpen={openProduct} /></Route>
          <Route path="/breakroom"><BreakroomPage /></Route>
          <Route path="/tool/bulk-file-renamer"><BulkFileRenamer /></Route>
          <Route path="/tool/spreadsheet-cleaner"><SpreadsheetCleaner /></Route>
          <Route path="/tool/file-finder"><FileFinderPage /></Route>
          <Route path="/profile"><PlaceholderPage type="profile" /></Route>
          <Route path="/settings"><PlaceholderPage type="settings" /></Route>
          <Route><NotFound /></Route>
        </Switch>
        {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check /> {toast}</div>}
      </AppShell>
    </Router>
  );
}

export default App;

function MemoryGame({ onEnd, onScoreChange }: { onEnd: (score: number) => void; onScoreChange?: (s: number) => void }) {
  const [cards, setCards]     = useState<MemoryCard[]>(() => makeMemoryCards());
  const [selected, setSelected] = useState<number[]>([]);
  const [locked, setLocked]   = useState(false);
  const onEndRef              = useRef(onEnd);
  const onScoreRef            = useRef(onScoreChange);
  onEndRef.current   = onEnd;
  onScoreRef.current = onScoreChange;

  // Detect completion
  useEffect(() => {
    const matchedPairs = cards.filter((c) => c.matched).length / 2;
    if (matchedPairs !== MEMORY_EMOJIS.length) return undefined;
    const timeout = setTimeout(() => onEndRef.current(matchedPairs), 500);
    return () => clearTimeout(timeout);
  }, [cards]);

  const handleFlip = (clickedId: number) => {
    if (locked) return;
    if (selected.includes(clickedId)) return;

    const card = cards.find((c) => c.id === clickedId);
    if (!card || card.flipped || card.matched) return;

    setCards((prev) => prev.map((c) => c.id === clickedId ? { ...c, flipped: true } : c));

    if (selected.length === 0) {
      setSelected([clickedId]);
    } else {
      const firstId = selected[0];
      setSelected([firstId, clickedId]);
      setLocked(true);
      setTimeout(() => {
        setCards((prev) => {
          const first  = prev.find((c) => c.id === firstId)!;
          const second = prev.find((c) => c.id === clickedId)!;
          if (first.emoji === second.emoji) {
            const next = prev.map((c) =>
              c.id === firstId || c.id === clickedId ? { ...c, matched: true } : c
            );
            const pairs = next.filter((c) => c.matched).length / 2;
            onScoreRef.current?.(pairs);
            return next;
          }
          return prev.map((c) =>
            c.id === firstId || c.id === clickedId ? { ...c, flipped: false } : c
          );
        });
        setSelected([]);
        setLocked(false);
      }, 850);
    }
  };

  const matchedPairs = cards.filter((c) => c.matched).length / 2;

  return (
    <div className="memory-game">
      <div className="memory-grid">
        {cards.map((card) => (
          <button
            key={card.id}
            className={`memory-card${card.flipped || card.matched ? ' is-flipped' : ''}${card.matched ? ' is-matched' : ''}`}
            onClick={() => handleFlip(card.id)}
            aria-label={card.flipped || card.matched ? card.emoji : 'Hidden card'}
            disabled={card.matched || locked}
          >
            <span className="memory-card-back">?</span>
            <span className="memory-card-front">{card.emoji}</span>
          </button>
        ))}
      </div>
      <p className="memory-hint">{matchedPairs} of {MEMORY_EMOJIS.length} pairs found · tap cards to flip</p>
    </div>
  );
}

type MemoryCard = { id: number; emoji: string; flipped: boolean; matched: boolean; };

function getDailyGameId(): DailyGameId {
  // Days since Unix epoch (local midnight) — increments by exactly 1 every day
  // regardless of month/year boundaries, so alternation is always reliable.
  const localMidnight = new Date();
  localMidnight.setHours(0, 0, 0, 0);
  const dayIndex = Math.floor(localMidnight.getTime() / 86_400_000);
  return DAILY_GAME_ROTATION[dayIndex % DAILY_GAME_ROTATION.length];
}

function makeMemoryCards(): MemoryCard[] {
  const pairs = [...MEMORY_EMOJIS, ...MEMORY_EMOJIS];
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs.map((emoji, id) => ({ id, emoji, flipped: false, matched: false }));
}

const MEMORY_EMOJIS = ['📎', '🖇️', '📝', '✏️', '📌', '🗂️', '📋', '🖊️'];
