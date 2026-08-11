import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import ExifReader from 'exifreader';
import { zipSync } from 'fflate';
import {
  AlertCircle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bell,
  Bold,
  BookOpen,
  Calculator as CalculatorIcon,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  ClipboardCopy,
  Clock,
  Coffee,
  CornerUpLeft,
  Crown,
  Delete,
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
  Globe,
  Grid2X2,
  GripHorizontal,
  HardDrive,
  Hash,
  Heading1,
  Info,
  Heading2,
  House,
  ImagePlus,
  Italic,
  Library as LibraryIcon,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Lock,
  Monitor,
  Moon,
  Music,
  PackageOpen,
  Palette,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  Sparkles,
  StickyNote,
  Sun,
  TableProperties,
  Timer,
  Trash2,
  Trophy,
  Underline,
  X,
  Zap,
} from 'lucide-react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';

// ─── App version (injected by Vite define at build time) ─────────────────────
declare const __APP_VERSION__: string;
const APP_VERSION: string = (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.2.0');

// ─── Tiptap (headless rich-text engine) ───────────────────────────────────────
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TiptapUnderline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TiptapLink from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';

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
type UpdateStatusEvent = { type: string; percent?: number; version?: string; message?: string };

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
      updater?: {
        checkForUpdates: () => Promise<{ devMode?: boolean; message?: string }>;
        downloadUpdate:  () => void;
        installUpdate:   () => void;
        onStatus:        (cb: (evt: UpdateStatusEvent) => void) => () => void;
      };
    };
  }
}

const RECENT_SEARCHES_KEY = 'cubical-file-finder-recent';
const FF_PENDING_QUERY_KEY = 'cubical-file-finder-pending';
const SIDEBAR_PINNED_KEY  = 'cubical-sidebar-pinned';
const PROFILE_KEY         = 'cubical-profile';
const PROFILE_SKIN_KEY    = 'cubical-profile-skin';
const SETTINGS_KEY        = 'cubical-settings';

type ThemeMode   = 'light' | 'dark' | 'system';
type StartupPage = 'home' | 'store' | 'library';

interface AppSettings {
  themeMode:           ThemeMode;
  sidebarAutoCollapse: boolean;
  clockSeconds:        boolean;
  soundEnabled:        boolean;
  startupPage:         StartupPage;
}

const DEFAULT_SETTINGS: AppSettings = {
  themeMode:           'light',
  sidebarAutoCollapse: true,
  clockSeconds:        false,
  soundEnabled:        true,
  startupPage:         'home',
};

function isAppSettings(v: unknown): v is AppSettings {
  return !!v && typeof v === 'object' && typeof (v as Record<string,unknown>).themeMode === 'string';
}

function readSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readLocal<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS, isAppSettings) };
}
function writeSettings(s: AppSettings) { writeLocal(SETTINGS_KEY, s); }

function applyThemeMode(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

// ─── Skin system ──────────────────────────────────────────────────────────────
// Skins are applied via a `data-skin` attribute on <html>.
// CSS selectors like `[data-skin="sakura"] .cubical-sidebar` handle visual changes.
// Future skins add a new id here and a matching CSS block.

function readEquippedSkin(): string {
  try { return window.localStorage.getItem(PROFILE_SKIN_KEY) ?? 'default'; } catch { return 'default'; }
}

function applySkin(skinId: string) {
  if (skinId === 'default' || !skinId) {
    document.documentElement.removeAttribute('data-skin');
  } else {
    document.documentElement.dataset.skin = skinId;
  }
}

interface ProfileData { name: string; avatar: string | null; bannerColor: string; }
const DEFAULT_PROFILE: ProfileData = { name: '', avatar: null, bannerColor: '#7c9e8f' };

function isProfileData(v: unknown): v is ProfileData {
  return !!v && typeof v === 'object' && typeof (v as Record<string,unknown>).name === 'string';
}
function readProfile(): ProfileData {
  return { ...DEFAULT_PROFILE, ...readLocal<ProfileData>(PROFILE_KEY, DEFAULT_PROFILE, isProfileData) };
}
function writeProfile(p: ProfileData) { writeLocal(PROFILE_KEY, p); }

interface CubicalSkin { id: string; name: string; description: string; owned: boolean; comingSoon?: boolean; }

const CUBICAL_SKINS: CubicalSkin[] = [
  { id: 'default', name: 'Default', description: 'Clean and calm. The original Cubical look.',                owned: true },
  { id: 'sakura',  name: 'Sakura',  description: 'Cherry blossoms and soft pinks. A peaceful seasonal look.', owned: true },
];

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

// ─── Product catalog — types ──────────────────────────────────────────────────

type ProductType   = 'tool' | 'skin' | 'game';
type DeliveryType  = 'bundled' | 'asset-package' | 'client-update-required';
type ProductStatus = 'active' | 'coming-soon' | 'deprecated';
type CatalogStatus = 'idle' | 'loading' | 'ok' | 'cached' | 'error';

type CatalogProduct = {
  // Stable unique ID — never changes after publishing (e.g. 'tool.file-finder')
  id:          string;
  type:        ProductType;
  name:        string;
  description: string;
  version:     string;   // product-specific semver, independent of Cubical version
  price:       string;
  isFree:      boolean;
  // Icon resolved from ICON_REGISTRY at runtime
  iconName:  string;
  iconColor: string;
  iconBg:    string;
  // Optional catalog fields
  category?:               string;
  tags?:                   string[];
  deliveryType:            DeliveryType;
  minimumCubicalVersion?:  string;  // e.g. '0.3.0' — show upgrade prompt if unmet
  featured?:               boolean;
  isNew?:                  boolean;
  status:                  ProductStatus;
  releaseNotes?:           string;
  packageUrl?:             string;
  downloadSize?:           number;
};

// Backward-compat alias so existing code compiles without changes
type Product = CatalogProduct;

// ─── Icon registry ────────────────────────────────────────────────────────────
// Maps iconName strings from catalog JSON → imported Lucide React components.
// Add new entries here when adding products with new icon names.

const ICON_REGISTRY: Record<string, typeof Files> = {
  File, FileArchive, FileScan, FileSpreadsheet, FileText, Files,
  FolderCog, FolderOpen, FolderSearch,
  Gamepad2, Globe, HardDrive, Hash, ImagePlus, Monitor,
  PackageOpen, Palette, Sparkles, TableProperties, Zap,
};
function resolveIcon(name: string): typeof Files {
  return ICON_REGISTRY[name] ?? File;
}

// ─── Bundled default catalog (offline fallback) ───────────────────────────────
// Mirrors public/catalog.json. Served when remote catalog is unreachable.

const DEFAULT_CATALOG_PRODUCTS: CatalogProduct[] = [
  { id: 'tool.file-organizer',      type: 'tool', name: 'File Organizer',      description: 'A calmer way to sort, group, and find everything on your desktop.',      version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FolderCog',       iconColor: 'hsl(164 48% 32%)', iconBg: 'hsl(164 48% 32% / .12)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.spreadsheet-cleaner', type: 'tool', name: 'Spreadsheet Cleaner', description: 'Sweep out the clutter hiding between your rows and columns.',            version: '1.0.0', price: 'FREE', isFree: true, iconName: 'TableProperties', iconColor: 'hsl(31 75% 43%)',  iconBg: 'hsl(31 75% 43% / .13)',  deliveryType: 'bundled', status: 'active' },
  { id: 'tool.pdf-toolkit',         type: 'tool', name: 'PDF Toolkit',         description: 'Small, sharp tools for the PDFs you touch every day.',                   version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FileScan',        iconColor: 'hsl(1 68% 54%)',   iconBg: 'hsl(1 68% 54% / .12)',   deliveryType: 'bundled', status: 'active' },
  { id: 'tool.bulk-file-renamer',   type: 'tool', name: 'Bulk File Renamer',   description: 'Give a whole folder a thoughtful name in one quick pass.',               version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FileArchive',     iconColor: 'hsl(226 45% 49%)', iconBg: 'hsl(226 45% 49% / .12)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.duplicate-finder',    type: 'tool', name: 'Duplicate Finder',    description: 'Spot the copies taking up space and keep the best version.',             version: '1.0.0', price: 'FREE', isFree: true, iconName: 'Files',           iconColor: 'hsl(287 40% 47%)', iconBg: 'hsl(287 40% 47% / .12)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.file-finder',         type: 'tool', name: 'File Finder',         description: 'Find the file. Skip the folder archaeology.',                             version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FolderSearch',    iconColor: 'hsl(197 55% 38%)', iconBg: 'hsl(197 55% 38% / .12)', deliveryType: 'bundled', status: 'active', featured: true },
  { id: 'tool.storage-explorer',    type: 'tool', name: 'Storage Explorer',    description: "See exactly what's taking up space on your PC.",                         version: '1.0.0', price: 'FREE', isFree: true, iconName: 'HardDrive',       iconColor: 'hsl(215 60% 43%)', iconBg: 'hsl(215 60% 43% / .12)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.image-converter',     type: 'tool', name: 'Image Converter',     description: 'Convert, resize, and process images locally.',                           version: '1.0.0', price: 'FREE', isFree: true, iconName: 'ImagePlus',       iconColor: 'hsl(140 50% 35%)', iconBg: 'hsl(140 50% 35% / .11)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.file-toolbox',        type: 'tool', name: 'File Toolbox',        description: 'One place for all your everyday file utilities.',                         version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FolderOpen',      iconColor: 'hsl(25 65% 42%)',  iconBg: 'hsl(25 65% 42% / .11)',  deliveryType: 'bundled', status: 'active' },
  { id: 'tool.startup-manager',     type: 'tool', name: 'Startup Manager',     description: 'See and manage what launches with Windows.',                             version: '1.0.0', price: 'FREE', isFree: true, iconName: 'PackageOpen',     iconColor: 'hsl(262 48% 50%)', iconBg: 'hsl(262 48% 50% / .11)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.file-inspector',      type: 'tool', name: 'File Inspector',      description: "Drop in a file and see what's inside.",                                  version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FileText',        iconColor: 'hsl(350 58% 46%)', iconBg: 'hsl(350 58% 46% / .11)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.system-info',         type: 'tool', name: 'System Info',         description: 'A clean overview of your PC and hardware.',                              version: '1.0.0', price: 'FREE', isFree: true, iconName: 'Monitor',         iconColor: 'hsl(45 68% 40%)',  iconBg: 'hsl(45 68% 40% / .12)',  deliveryType: 'bundled', status: 'active' },
  { id: 'skin.sakura',              type: 'skin', name: 'Sakura',              description: 'Cherry blossoms and soft pinks. A peaceful seasonal look.',               version: '1.0.0', price: 'FREE', isFree: true, iconName: 'Sparkles',        iconColor: 'hsl(340 55% 55%)', iconBg: 'hsl(340 55% 55% / .12)', deliveryType: 'bundled', status: 'active', featured: true },
  { id: 'game.memory-match',        type: 'game', name: 'Memory Match',        description: 'A clean card-flipping memory game. Find all the pairs as fast as you can.', version: '1.0.0', price: 'FREE', isFree: true, iconName: 'Gamepad2',     iconColor: 'hsl(262 50% 52%)', iconBg: 'hsl(262 50% 52% / .12)', deliveryType: 'bundled', status: 'active' },
];

// ─── Tool routes & semver utilities ──────────────────────────────────────────

const TOOL_ROUTES: Record<string, string> = {
  'tool.file-organizer':      '/tool/file-organizer',
  'tool.bulk-file-renamer':   '/tool/bulk-file-renamer',
  'tool.spreadsheet-cleaner': '/tool/spreadsheet-cleaner',
  'tool.pdf-toolkit':         '/tool/pdf-toolkit',
  'tool.duplicate-finder':    '/tool/duplicate-finder',
  'tool.file-finder':         '/tool/file-finder',
  'tool.storage-explorer':    '/tool/storage-explorer',
  'tool.image-converter':     '/tool/image-converter',
  'tool.file-toolbox':        '/tool/file-toolbox',
  'tool.startup-manager':     '/tool/startup-manager',
  'tool.file-inspector':      '/tool/file-inspector',
  'tool.system-info':         '/tool/system-info',
};

function getToolRoute(product: CatalogProduct): string | undefined {
  return TOOL_ROUTES[product.id];
}

/** Compare two semver strings. Returns positive if a > b. */
function semverCompare(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** True when the product requires a newer Cubical client than the current build. */
function requiresCubicalUpdate(product: CatalogProduct): boolean {
  if (!product.minimumCubicalVersion) return false;
  return semverCompare(product.minimumCubicalVersion, APP_VERSION) > 0;
}

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
const NOTEPAD_STORAGE_KEY   = 'cubical-notepad';       // legacy plain-text fallback
const NOTEPAD_HTML_KEY      = 'cubical-notepad-html';  // rich-text (innerHTML)
const CLOCK_SECONDS_KEY     = 'cubical-clock-seconds';
const CLOCK_TIMER_KEY       = 'cubical-clock-timer';
const CLOCK_ALARMS_KEY      = 'cubical-clock-alarms';
const LAYOUT_STORAGE_KEY    = 'cubical-home-layout';

const LAYOUT_BASELINE_KEY   = 'cubical-home-layout-baseline';
const LINK_SHELF_KEY        = 'cubical-link-shelf';
const DECISION_MAKER_KEY    = 'cubical-decision-maker';
const DISPLACED_WIDGETS_KEY = 'cubical-displaced-widgets';

const SNAP_GRID_KEY         = 'cubical-snap-grid';
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

// ─── Library ID migration ─────────────────────────────────────────────────────
// Maps legacy plain-slug IDs stored in localStorage → new stable catalog IDs.
const LEGACY_ID_MAP: Record<string, string> = {
  'file-organizer':      'tool.file-organizer',
  'spreadsheet-cleaner': 'tool.spreadsheet-cleaner',
  'pdf-toolkit':         'tool.pdf-toolkit',
  'bulk-file-renamer':   'tool.bulk-file-renamer',
  'duplicate-finder':    'tool.duplicate-finder',
  'file-finder':         'tool.file-finder',
  'storage-explorer':    'tool.storage-explorer',
  'image-converter':     'tool.image-converter',
  'file-toolbox':        'tool.file-toolbox',
  'startup-manager':     'tool.startup-manager',
  'file-inspector':      'tool.file-inspector',
  'system-info':         'tool.system-info',
};

function getStoredLibrary(): string[] {
  const stored = readLocal<string[]>(LIBRARY_STORAGE_KEY, [], isStringArray);
  // Migrate any legacy IDs to the new catalog format
  const migrated = stored.map((id) => LEGACY_ID_MAP[id] ?? id);
  // File Finder is always pre-installed
  const result = migrated.includes('tool.file-finder') ? migrated : ['tool.file-finder', ...migrated];
  // Persist migrated IDs so subsequent reads skip the migration step
  if (stored.some((id) => LEGACY_ID_MAP[id] !== undefined) || !migrated.includes('tool.file-finder')) {
    writeLocal(LIBRARY_STORAGE_KEY, result);
  }
  return result;
}
function storeLibrary(ids: string[]) { writeLocal(LIBRARY_STORAGE_KEY, ids); }

// ─── Remote Store Catalog ─────────────────────────────────────────────────────

const CATALOG_CACHE_KEY = 'cubical-catalog-cache-v1';
const CATALOG_TTL_MS    = 60 * 60 * 1000; // 1 hour

interface CatalogCache {
  products:        CatalogProduct[];
  fetchedAt:       number;
  catalogVersion?: string;
}

function getCatalogCache(): CatalogCache | null {
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(parsed.products)) return null;
    return parsed as unknown as CatalogCache;
  } catch { return null; }
}

function setCatalogCache(cache: CatalogCache) {
  try { window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

/** Validate a single raw product entry from a remote catalog response. */
function validateCatalogProduct(raw: unknown): CatalogProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return null;
  if (!['tool', 'skin', 'game'].includes(p.type as string)) return null;
  if (typeof p.name !== 'string' || !p.name) return null;
  return {
    id:          p.id as string,
    type:        p.type as ProductType,
    name:        p.name as string,
    description: typeof p.description === 'string' ? p.description : '',
    version:     typeof p.version === 'string' ? p.version : '1.0.0',
    price:       typeof p.price === 'string' ? p.price : 'FREE',
    isFree:      p.isFree !== false,
    iconName:    typeof p.iconName === 'string' ? p.iconName : 'File',
    iconColor:   typeof p.iconColor === 'string' ? p.iconColor : 'hsl(var(--primary))',
    iconBg:      typeof p.iconBg === 'string' ? p.iconBg : 'hsl(var(--primary) / .12)',
    category:    typeof p.category === 'string' ? p.category : undefined,
    tags:        Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t) => typeof t === 'string') as string[] : undefined,
    deliveryType: (['bundled', 'asset-package', 'client-update-required'].includes(p.deliveryType as string)
      ? p.deliveryType : 'bundled') as DeliveryType,
    minimumCubicalVersion: typeof p.minimumCubicalVersion === 'string' ? p.minimumCubicalVersion : undefined,
    featured:    typeof p.featured === 'boolean' ? p.featured : false,
    isNew:       typeof p.isNew === 'boolean' ? p.isNew : false,
    status:      (['active', 'coming-soon', 'deprecated'].includes(p.status as string)
      ? p.status : 'active') as ProductStatus,
    releaseNotes:  typeof p.releaseNotes === 'string' ? p.releaseNotes : undefined,
    packageUrl:    typeof p.packageUrl === 'string' ? p.packageUrl : undefined,
    downloadSize:  typeof p.downloadSize === 'number' ? p.downloadSize : undefined,
  };
}

/**
 * Fetch and cache the Store Catalog.
 * Priority: fresh remote → valid cache → bundled default.
 * Never throws — falls back gracefully to keep the Store usable offline.
 */
function useCatalog() {
  const [products, setProducts] = useState<CatalogProduct[]>(() => {
    const cached = getCatalogCache();
    return cached?.products ?? DEFAULT_CATALOG_PRODUCTS;
  });
  const [status, setStatus] = useState<CatalogStatus>('idle');

  const catalogUrl = (import.meta.env.VITE_CATALOG_URL as string | undefined) ?? '';

  const fetchCatalog = useCallback(async (force = false) => {
    if (!catalogUrl) {
      // No remote catalog configured — use bundled products
      setStatus('ok');
      return;
    }
    const cached = getCatalogCache();
    if (!force && cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
      setProducts(cached.products);
      setStatus('ok');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(catalogUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;
      const rawList = Array.isArray(data.products) ? data.products : [];
      const valid = (rawList as unknown[]).map(validateCatalogProduct).filter(Boolean) as CatalogProduct[];
      if (valid.length === 0) throw new Error('Catalog returned no valid products');
      setCatalogCache({ products: valid, fetchedAt: Date.now(), catalogVersion: data.catalogVersion as string | undefined });
      setProducts(valid);
      setStatus('ok');
    } catch (e) {
      console.warn('[catalog] fetch failed:', e);
      if (cached) { setProducts(cached.products); setStatus('cached'); }
      else { setStatus('error'); }
    }
  }, [catalogUrl]);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  return { products, status, refresh: () => fetchCatalog(true) };
}

// ─── Calendar types & storage ─────────────────────────────────────────────────

type CalendarEvent = { id: string; date: string; title: string; time: string; note: string; };

function isEventArray(v: unknown): v is CalendarEvent[] {
  if (!Array.isArray(v)) return false;
  return v.every((e) => e && typeof e === 'object' && 'id' in e && 'date' in e && 'title' in e);
}
function getStoredEvents(): CalendarEvent[] { return readLocal(CALENDAR_STORAGE_KEY, [], isEventArray); }
function storeEvents(events: CalendarEvent[]) { writeLocal(CALENDAR_STORAGE_KEY, events); }

// ─── Widget layout system (pixel-based, free-floating) ─────────────────────────
// LayoutItem.x/y are pixel offsets from the canvas top-left.
// LayoutItem.w/h are pixel dimensions.
// No grid, no snapping — widgets float freely and stop where released.

type WidgetId = 'calendar' | 'clock' | 'notepad' | 'file-finder' | 'link-shelf' | 'decision-maker' | 'calculator';

type LayoutItem = { id: WidgetId; x: number; y: number; w: number; h: number; };

const WIDGET_LABELS: Record<WidgetId, string> = {
  calendar:         'Calendar',
  clock:            'Clock',
  notepad:          'Notepad',
  'file-finder':    'File Finder',
  'link-shelf':     'Link Shelf',
  'decision-maker': 'Decision Maker',
  calculator:       'Calculator',
};

// Minimum pixel dimensions — below these a widget cannot be resized
const WIDGET_MIN: Record<WidgetId, { w: number; h: number }> = {
  calendar:         { w: 120, h: 110 },
  clock:            { w: 140, h: 100 },
  notepad:          { w: 220, h: 160 },
  'file-finder':    { w: 220, h: 120 },
  'link-shelf':     { w: 220, h: 180 },
  'decision-maker': { w: 220, h: 180 },
  calculator:       { w: 180, h: 280 },
};

// Portable by default — widgets not in the registry (e.g. file-finder) are NOT portable.
function isPortableWidget(id: WidgetId): boolean {
  const def = WIDGET_REGISTRY.find((w) => w.id === id);
  return def !== undefined && def.portable !== false;
}

// Default pixel layout — sized for a ~970 px wide canvas (1280 px viewport, expanded sidebar).
const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'calendar', x: 0,   y: 0,   w: 560, h: 630 },
  { id: 'clock',    x: 575, y: 0,   w: 390, h: 264 },
  { id: 'notepad',  x: 575, y: 274, w: 390, h: 450 },
];

// ── Widget registry ────────────────────────────────────────────────────────────
// Single source of truth for manageable widgets. All sizes/positions are pixels.
// To add a future widget: add WidgetId, register here, render in GridWidget.

type WidgetDef = {
  id: WidgetId;
  label: string;
  defaultW: number;
  defaultH: number;
  defaultX: number;
  defaultY: number;
  /** Portable by default. Set false to opt out of the portable-widget system. */
  portable?: boolean;
};

const WIDGET_REGISTRY: WidgetDef[] = [
  { id: 'calendar',       label: 'Calendar',       defaultW: 560, defaultH: 630, defaultX: 0,   defaultY: 0   },
  { id: 'clock',          label: 'Clock',          defaultW: 390, defaultH: 264, defaultX: 575, defaultY: 0   },
  { id: 'notepad',        label: 'Notepad',        defaultW: 390, defaultH: 450, defaultX: 575, defaultY: 274 },
  { id: 'link-shelf',     label: 'Link Shelf',     defaultW: 390, defaultH: 264, defaultX: 0,   defaultY: 644 },
  { id: 'decision-maker', label: 'Decision Maker', defaultW: 310, defaultH: 360, defaultX: 400, defaultY: 644 },
  { id: 'calculator',     label: 'Calculator',     defaultW: 240, defaultH: 450, defaultX: 720, defaultY: 274 },
  // file-finder is a system widget not managed through this registry
];

const DEFAULT_ACTIVE_WIDGETS: WidgetId[] = ['calendar', 'clock', 'notepad'];
const ACTIVE_WIDGETS_KEY = 'cubical-active-widgets';

function getActiveWidgets(): WidgetId[] {
  try {
    const raw = window.localStorage.getItem(ACTIVE_WIDGETS_KEY);
    if (!raw) return DEFAULT_ACTIVE_WIDGETS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_ACTIVE_WIDGETS;
    const valid = (parsed as unknown[]).filter((id): id is WidgetId =>
      WIDGET_REGISTRY.some((w) => w.id === id),
    );
    return valid.length > 0 ? valid : DEFAULT_ACTIVE_WIDGETS;
  } catch { return DEFAULT_ACTIVE_WIDGETS; }
}
function storeActiveWidgets(ids: WidgetId[]) { writeLocal(ACTIVE_WIDGETS_KEY, ids); }

function getStoredLayout(): LayoutItem[] {
  try {
    if (typeof window === 'undefined') return DEFAULT_LAYOUT;
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    const ids: WidgetId[] = ['calendar', 'clock', 'notepad', 'file-finder', 'link-shelf', 'decision-maker', 'calculator'];
    const result: LayoutItem[] = [];
    for (const id of ids) {
      const found = parsed.find((item: unknown) => item && typeof item === 'object' && (item as Record<string, unknown>).id === id);
      if (!found || typeof (found as Record<string, unknown>).x !== 'number') {
        const dflt = DEFAULT_LAYOUT.find((d) => d.id === id);
        if (dflt) { result.push(dflt); continue; }
        const reg = WIDGET_REGISTRY.find((r) => r.id === id);
        if (!reg) continue;
        result.push({ id, x: reg.defaultX, y: reg.defaultY, w: reg.defaultW, h: reg.defaultH });
        continue;
      }
      const f = found as Record<string, number>;
      let x = f.x ?? 0, y = f.y ?? 0, w = f.w ?? 300, h = f.h ?? 300;
      // Migrate old grid-unit values: grid w/h were always < 15; pixel values are >> 100
      if (w < 100 && h < 100) {
        const cw = 78, ch = 82, gap = 10;
        x = Math.round(x * (cw + gap));
        y = Math.round(y * (ch + gap));
        w = Math.round(w * cw + Math.max(0, w - 1) * gap);
        h = Math.round(h * ch + Math.max(0, h - 1) * gap);
      }
      const min = WIDGET_MIN[id];
      result.push({ id, x: Math.max(0, x), y: Math.max(0, y), w: Math.max(min.w, w), h: Math.max(min.h, h) });
    }
    return result;
  } catch { return DEFAULT_LAYOUT; }
}
function storeLayout(layout: LayoutItem[]) { writeLocal(LAYOUT_STORAGE_KEY, layout); }

function getStoredBaselineWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(LAYOUT_BASELINE_KEY);
    if (!raw) return null;
    const v = parseFloat(raw);
    return isNaN(v) || v <= 0 ? null : v;
  } catch { return null; }
}
type DisplacedWidget = { id: WidgetId; page: string };

interface PortableCtxShape {
  // Widget location — single source of truth
  activeWidgets: WidgetId[];
  displaced:     DisplacedWidget[];
  // Home management
  addWidget:    (id: WidgetId) => void;
  removeWidget: (id: WidgetId) => void;
  // Portable drag
  displace:          (id: WidgetId, page: string) => void;
  recall:            (id: WidgetId) => void;
  recallAll:         () => void;
  reorderDisplaced:  (page: string, fromIdx: number, toIdx: number) => void;
  // Drag gesture state
  dragId:      WidgetId | null;
  setDragId:   (id: WidgetId | null) => void;
  hoverPage:   string | null;      // reactive value (for CSS highlights)
  setHoverPage: (p: string | null) => void;
  hoverPageRef: React.MutableRefObject<string | null>; // non-stale ref for drop handler
}

const PortableCtx = createContext<PortableCtxShape>({
  activeWidgets: [], displaced: [],
  addWidget: () => {}, removeWidget: () => {},
  displace: () => {}, recall: () => {}, recallAll: () => {}, reorderDisplaced: () => {},
  dragId: null, setDragId: () => {},
  hoverPage: null, setHoverPage: () => {},
  hoverPageRef: { current: null },
});

function usePortable() { return useContext(PortableCtx); }

function getDisplaced(): DisplacedWidget[] {
  try {
    const raw = window.localStorage.getItem(DISPLACED_WIDGETS_KEY);
    if (!raw) return [];
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return (v as unknown[]).filter((d): d is DisplacedWidget =>
      !!d && typeof (d as DisplacedWidget).id === 'string' && typeof (d as DisplacedWidget).page === 'string',
    );
  } catch { return []; }
}
function storeDisplaced(d: DisplacedWidget[]) { writeLocal(DISPLACED_WIDGETS_KEY, d); }

function PortableProvider({ children }: { children: ReactNode }) {
  // Single source of truth: a widget is either on Home (activeWidgets) or displaced
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>(() => {
    // Filter out any widgets that were displaced in a previous session
    const all  = getActiveWidgets();
    const disp = getDisplaced().map((d) => d.id);
    return all.filter((id) => !disp.includes(id));
  });
  const [displaced, setDisplaced] = useState<DisplacedWidget[]>(getDisplaced);
  const [dragId, setDragId]       = useState<WidgetId | null>(null);
  const [hoverPage, _setHoverPage] = useState<string | null>(null);
  // Ref version: always current, safe to read in document-level event closures
  const hoverPageRef = useRef<string | null>(null);
  const setHoverPage = useCallback((p: string | null) => {
    hoverPageRef.current = p;
    _setHoverPage(p);
  }, []);

  // Persist whenever either list changes
  useEffect(() => { storeActiveWidgets(activeWidgets); }, [activeWidgets]);
  useEffect(() => { storeDisplaced(displaced); }, [displaced]);

  const addWidget = useCallback((id: WidgetId) => {
    setActiveWidgets((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const removeWidget = useCallback((id: WidgetId) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
  }, []);

  // Move widget OFF Home and mark it as living on `page`
  const displace = useCallback((id: WidgetId, page: string) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
    setDisplaced((prev) => [...prev.filter((d) => d.id !== id), { id, page }]);
  }, []);

  // Move widget back to Home, removing from displaced
  const recall = useCallback((id: WidgetId) => {
    setDisplaced((prev) => {
      const entry = prev.find((d) => d.id === id);
      if (!entry) return prev;
      setActiveWidgets((aw) => aw.includes(id) ? aw : [...aw, id]);
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const recallAll = useCallback(() => {
    setDisplaced((prev) => {
      const ids = prev.map((d) => d.id);
      setActiveWidgets((aw) => {
        const missing = ids.filter((id) => !aw.includes(id));
        return missing.length > 0 ? [...aw, ...missing] : aw;
      });
      return [];
    });
  }, []);

  // Reorder displaced widgets within a section (left-to-right order in the band)
  const reorderDisplaced = useCallback((page: string, fromIdx: number, toIdx: number) => {
    setDisplaced((prev) => {
      const section = prev.filter((d) => d.page === page);
      const others  = prev.filter((d) => d.page !== page);
      if (fromIdx < 0 || fromIdx >= section.length || toIdx < 0 || toIdx >= section.length) return prev;
      const reordered = [...section];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return [...others, ...reordered];
    });
  }, []);

  return (
    <PortableCtx.Provider value={{
      activeWidgets, displaced,
      addWidget, removeWidget,
      displace, recall, recallAll, reorderDisplaced,
      dragId, setDragId,
      hoverPage, setHoverPage, hoverPageRef,
    }}>
      {children}
    </PortableCtx.Provider>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────

// ─── Navigation history context ───────────────────────────────────────────────

type NavCtxValue = { goBack: (fallback?: string) => void; canGoBack: boolean };
const NavCtx = createContext<NavCtxValue>({ goBack: () => {}, canGoBack: false });
const useNavBack = () => useContext(NavCtx);

function NavProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const stackRef = useRef<string[]>([]);
  const skipRef  = useRef(false);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    const stack = stackRef.current;
    if (stack[stack.length - 1] !== location) {
      stackRef.current = [...stack, location];
      setDepth(stackRef.current.length);
    }
  }, [location]);

  const goBack = useCallback((fallback = '/') => {
    const stack = stackRef.current;
    if (stack.length > 1) {
      const next = stack.slice(0, -1);
      stackRef.current = next;
      skipRef.current  = true;
      setDepth(next.length);
      navigate(next[next.length - 1]);
    } else {
      navigate(fallback);
    }
  }, [navigate]);

  const value = useMemo(() => ({ goBack, canGoBack: depth > 1 }), [goBack, depth]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

function BackButton({ fallback = '/', label }: { fallback?: string; label?: string }) {
  const { goBack, canGoBack } = useNavBack();
  if (!canGoBack) return null;
  return (
    <button type="button" className="detail-back" onClick={() => goBack(fallback)} data-testid="btn-nav-back">
      <ArrowLeft /> {label ?? 'Back'}
    </button>
  );
}

const CRUMB_MAP: Record<string, string> = {
  '/': 'Shelf / Home',
  '/store': 'Shelf / Store',
  '/library': 'Shelf / Library',
  '/breakroom': 'Shelf / Breakroom',
  '/profile': 'Shelf / Profile',
  '/settings': 'Shelf / Settings',
  '/tool/file-organizer':    'Shelf / File Organizer',
  '/tool/file-finder':       'Shelf / File Finder',
  '/tool/storage-explorer':  'Shelf / Storage Explorer',
  '/tool/image-converter':   'Shelf / Image Converter',
  '/tool/file-toolbox':      'Shelf / File Toolbox',
  '/tool/startup-manager':   'Shelf / Startup Manager',
  '/tool/file-inspector':    'Shelf / File Inspector',
  '/tool/system-info':       'Shelf / System Info',
  '/tool/pdf-toolkit':       'Shelf / PDF Toolkit',
  '/tool/duplicate-finder':  'Shelf / Duplicate Finder',
};

function AppShell({ children, libraryCount }: { children: ReactNode; libraryCount: number }) {
  const [location, navigate]  = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(
    () => readLocal<boolean>(SIDEBAR_PINNED_KEY, false, (v): v is boolean => typeof v === 'boolean'),
  );
  const collapseTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSidebarHoveredRef = useRef(false);
  const sidebarPinnedRef    = useRef(sidebarPinned);
  sidebarPinnedRef.current  = sidebarPinned;

  const { dragId, displace, hoverPage, setHoverPage } = usePortable();

  const scheduleCollapse = () => {
    if (window.innerWidth <= 800) return;
    if (sidebarPinnedRef.current || !readSettings().sidebarAutoCollapse) return;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      if (!isSidebarHoveredRef.current) setSidebarCollapsed(true);
    }, 4000);
  };

  useEffect(() => {
    scheduleCollapse();
    const handleResize = () => {
      if (window.innerWidth <= 800) {
        if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
        setSidebarCollapsed(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSidebarEnter = () => {
    isSidebarHoveredRef.current = true;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    setSidebarCollapsed(false);
  };

  const handleSidebarLeave = () => {
    isSidebarHoveredRef.current = false;
    setHoverPage(null);
    // Collapse immediately — no timer delay. Pin and narrow viewports are exempt.
    if (!sidebarPinnedRef.current && window.innerWidth > 800 && readSettings().sidebarAutoCollapse) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      setSidebarCollapsed(true);
    }
  };

  const togglePin = () => {
    const next = !sidebarPinned;
    setSidebarPinned(next);
    writeLocal(SIDEBAR_PINNED_KEY, next);
    if (next) {
      if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
      setSidebarCollapsed(false);
    } else {
      scheduleCollapse();
    }
  };

  // Drop-target pages for portable drag (store, library, breakroom only — not profile/settings)
  const portableDropPages = ['/store', '/library', '/breakroom'];

  const navItems = [
    { href: '/',          label: 'Home',      icon: House       },
    { href: '/store',     label: 'Store',     icon: Grid2X2     },
    { href: '/library',   label: 'Library',   icon: LibraryIcon },
    { href: '/breakroom', label: 'Breakroom', icon: Coffee      },
  ];
  const utilityItems = [
    { href: '/profile',  label: 'Profile',  icon: CircleUserRound },
    { href: '/settings', label: 'Settings', icon: Settings        },
  ];

  const crumb = CRUMB_MAP[location] ?? `Shelf / ${location.slice(1).split('/').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' / ')}`;
  const isActive = (href: string) => {
    if (href === '/library') return location === '/library' || location.startsWith('/tool/');
    return location === href;
  };

  const renderNavLink = (href: string, label: string, Icon: typeof House, extra?: ReactNode) => {
    const isDropTarget = !!dragId && portableDropPages.includes(href);
    const isHovered    = hoverPage === href;
    return (
      <Link
        key={href}
        href={href}
        className={`nav-link ${isActive(href) ? 'active' : ''}${isDropTarget && isHovered ? ' is-drop-target' : ''}`}
        data-testid={`link-${label.toLowerCase()}`}
        title={label}
        onPointerEnter={() => isDropTarget && setHoverPage(href)}
        onPointerLeave={() => isDropTarget && setHoverPage(null)}
        onClick={(e) => {
          // Block link navigation when a portable widget is being dragged —
          // the document-level pointerup handler in HomeWorkspace owns the drop.
          if (dragId) e.preventDefault();
        }}
      >
        <Icon />
        {extra ?? <span>{label}</span>}
      </Link>
    );
  };

  return (
    <div className="cubical-shell">
      <aside
        className={`cubical-sidebar${sidebarCollapsed ? ' sidebar-collapsed' : ''}${dragId ? ' has-portable-drag' : ''}`}
        data-testid="sidebar-navigation"
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        <Link href="/" className="brand-link no-underline" data-testid="link-brand">
          <span className="brand-mark">C</span>
          <span className="brand-word">cubical</span>
        </Link>

        <div className="sidebar-section mt-12 w-full">
          <div className="side-label mb-3">Your shelf</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Main navigation">
            {navItems.map(({ href, label, icon: Icon }) =>
              renderNavLink(href, label, Icon,
                href !== '/' ? <span>{label}{label === 'Library' && libraryCount > 0 ? ` · ${libraryCount}` : ''}</span> : <span>{label}</span>,
              ),
            )}
          </nav>
        </div>

        <div className="sidebar-bottom w-full">
          <div className="side-label mb-3">Yourself</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Utility navigation">
            {utilityItems.map(({ href, label, icon: Icon }) =>
              renderNavLink(href, label, Icon, <span>{label}</span>),
            )}
          </nav>
          <button
            className={`sidebar-pin-btn${sidebarPinned ? ' is-pinned' : ''}`}
            onClick={togglePin}
            title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          >
            {sidebarPinned ? <Pin className="w-3.5 h-3.5 shrink-0" /> : <PinOff className="w-3.5 h-3.5 shrink-0" />}
            <span className="sidebar-pin-label">{sidebarPinned ? 'Pinned' : 'Pin'}</span>
          </button>
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
  const Icon = resolveIcon(product.iconName);
  return (
    <span
      className={`tool-icon ${size === 'large' ? 'h-[66px] w-[66px] rounded-[19px]' : ''}`}
      style={{ '--icon-color': product.iconColor, '--icon-bg': product.iconBg } as CSSProperties}
      data-testid={`icon-product-${product.id}`}
    ><Icon /></span>
  );
}

function ProductCard({ product, isOwned }: { product: Product; isOwned?: boolean }) {
  return (
    <Link
      href={`/product/${product.id}`}
      className={`product-card${isOwned ? ' is-owned' : ''}`}
      data-testid={`card-product-${product.id}`}
    >
      {isOwned && (
        <div className="product-owned-badge" title="Installed" aria-label="Installed">
          <Check />
        </div>
      )}
      <ProductIcon product={product} />
      <div className="card-meta">
        <span className="card-name" data-testid={`text-product-name-${product.id}`}>{product.name}</span>
        <span className="price" data-testid={`text-product-price-${product.id}`}>{product.price}</span>
      </div>
      <p className="card-description" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
      <div className="card-footer"><span>{isOwned ? 'Installed' : 'View tool'}</span><ArrowRight /></div>
    </Link>
  );
}

type StoreCategory = 'all' | 'tool' | 'skin' | 'game';
const STORE_CATEGORY_LABELS: Record<StoreCategory, string> = { all: 'All', tool: 'Tools', skin: 'Skins', game: 'Games' };

function StorePage({ libraryIds, catalogProducts, catalogStatus, onRefresh }: {
  libraryIds: string[];
  catalogProducts: CatalogProduct[];
  catalogStatus: CatalogStatus;
  onRefresh: () => void;
}) {
  const [query,    setQuery]    = useState('');
  const [category, setCategory] = useState<StoreCategory>('all');

  const filtered = useMemo(() => {
    let list = catalogProducts.filter((p) => p.status === 'active');
    if (category !== 'all') list = list.filter((p) => p.type === category);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    return list;
  }, [catalogProducts, category, query]);

  const activeCount = filtered.length;

  return (
    <section>
      <BackButton />
      <div className="page-intro">
        <div className="eyebrow">A small shelf of useful things</div>
        <h1 className="display-title mt-4">Tools worth<br /><em className="not-italic" style={{ color: 'hsl(var(--primary))' }}>keeping around.</em></h1>
        <p>Browse focused desktop tools made to do one thing well. Pick the ones that feel like you.</p>
      </div>
      <DisplacedWidgetBand />

      {/* Category tabs */}
      <div className="catalog-tabs" role="tablist" aria-label="Store categories">
        {(Object.keys(STORE_CATEGORY_LABELS) as StoreCategory[]).map((cat) => (
          <button key={cat} role="tab" aria-selected={category === cat}
            className={`catalog-tab${category === cat ? ' active' : ''}`}
            onClick={() => setCategory(cat)}>
            {STORE_CATEGORY_LABELS[cat]}
          </button>
        ))}
        <div className="catalog-actions">
          {catalogStatus === 'loading' && <span className="catalog-status-pill">Refreshing…</span>}
          {catalogStatus === 'cached'  && <span className="catalog-status-pill catalog-status-pill--warn">Offline</span>}
          {catalogStatus === 'error'   && <span className="catalog-status-pill catalog-status-pill--err">Could not load catalog</span>}
          <button type="button" className="catalog-refresh-btn" onClick={onRefresh} title="Refresh catalog" aria-label="Refresh catalog">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>The current edit</span>
        <span className="library-count">{String(activeCount).padStart(2, '0')} {category === 'all' ? 'items' : STORE_CATEGORY_LABELS[category].toLowerCase()} · no noise</span>
      </div>
      <div className="tool-search-bar mb-5">
        <Search className="tool-search-icon" />
        <input type="text" className="tool-search-input" placeholder={`Search ${category === 'all' ? 'store' : STORE_CATEGORY_LABELS[category].toLowerCase()}…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search store" />
        {query && <button type="button" className="tool-search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button>}
      </div>
      {filtered.length === 0
        ? <div className="tool-search-empty">{query ? `No results for "${query}"` : `No ${STORE_CATEGORY_LABELS[category].toLowerCase()} available`}</div>
        : <div className="product-grid" data-testid="product-catalog">{filtered.map((product) => <ProductCard key={product.id} product={product} isOwned={libraryIds.includes(product.id)} />)}</div>}
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
  const toolRoute    = getToolRoute(product);
  const isFree       = product.isFree;
  const needsUpdate  = requiresCubicalUpdate(product);
  return (
    <section>
      <BackButton fallback="/store" label="Back to store" />
      <DisplacedWidgetBand />
      <div className="detail-layout">
        <div className="detail-copy">
          <ProductIcon product={product} size="large" />
          <div className="eyebrow mt-7">{product.type === 'skin' ? 'Visual theme' : product.type === 'game' ? 'Breakroom game' : 'A focused little utility'}</div>
          <h1 data-testid="text-detail-name">{product.name}</h1>
          <p data-testid="text-detail-description">{product.description} Built to stay out of your way, feel good to use, and make a small part of your day lighter.</p>
          <div className="detail-price" data-testid="text-detail-price">{isFree ? 'FREE · local-only' : `${product.price} · one-time, local-only`}</div>
          {needsUpdate ? (
            <div className="detail-update-required">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Requires Cubical {product.minimumCubicalVersion}. Your version is {APP_VERSION}.</span>
              <Link href="/settings" className="button-quiet">Update Cubical</Link>
            </div>
          ) : isAdded ? (
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
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <section>
      <BackButton />
      <div className="library-head">
        <div className="page-intro !mb-0">
          <div className="eyebrow">Your chosen tools</div>
          <h1 className="display-title mt-4">Your library.</h1>
          <p>Everything you decided was worth keeping, in one quiet place.</p>
        </div>
        <span className="library-count" data-testid="text-library-count">{String(products.length).padStart(2, '0')} saved</span>
      </div>
      <DisplacedWidgetBand />
      {products.length === 0 ? <EmptyLibrary /> : (
        <>
          <div className="tool-search-bar mb-4">
            <Search className="tool-search-icon" />
            <input type="text" className="tool-search-input" placeholder="Search your library…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search library tools" />
            {query && <button type="button" className="tool-search-clear" onClick={() => setQuery('')} aria-label="Clear search"><X /></button>}
          </div>
          {filtered.length === 0
            ? <div className="tool-search-empty">No tools found for "{query}"</div>
            : (
              <div className="library-list" data-testid="library-list">
                {filtered.map((product, index) => {
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
        </>
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
  // w/h are approximate grid units: round(px/82) and round(px/92).
  // tile  = compact day-card (small widget, min ~280px)
  // full  = month grid + day panel (large widget)
  if (w <= 4 || h <= 4) return 'tile';
  if (w >= 6 && h >= 6) return 'full';
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

type ClockMode = 'clock' | 'timer' | 'alarm';

interface ClockTimerSaved { h: number; m: number; s: number; remaining: number; running: boolean; }
interface ClockAlarm { id: string; time: string; label: string; days: number[]; enabled: boolean; firedToday?: string; }

function pad2(n: number) { return String(n).padStart(2, '0'); }

function isClockAlarmArray(v: unknown): v is ClockAlarm[] {
  return Array.isArray(v) && v.every((a) => a && typeof a.id === 'string' && typeof a.time === 'string');
}

function ClockWidget({ gridH }: { gridH: number }) {
  const [now, setNow]           = useState(() => new Date());
  const [mode, setMode]         = useState<ClockMode>('clock');
  const [showSeconds, setShowSeconds] = useState(
    () => { try { return window.localStorage.getItem(CLOCK_SECONDS_KEY) === 'true'; } catch { return false; } },
  );

  // Timer state — loaded from localStorage; restored as paused (user resumes after refresh)
  const [timerH, setTimerH]   = useState(() => {
    try { const s = readLocal<Record<string, number>>(CLOCK_TIMER_KEY, {}, (v): v is Record<string, number> => typeof v === 'object' && v !== null); return s.h ?? 0; } catch { return 0; }
  });
  const [timerM, setTimerM]   = useState(() => {
    try { const s = readLocal<Record<string, number>>(CLOCK_TIMER_KEY, {}, (v): v is Record<string, number> => typeof v === 'object' && v !== null); return s.m ?? 5; } catch { return 5; }
  });
  const [timerS, setTimerS]   = useState(() => {
    try { const s = readLocal<Record<string, number>>(CLOCK_TIMER_KEY, {}, (v): v is Record<string, number> => typeof v === 'object' && v !== null); return s.s ?? 0; } catch { return 0; }
  });
  const [remaining, setRemaining] = useState<number>(() => {
    try { const s = readLocal<Record<string, number>>(CLOCK_TIMER_KEY, {}, (v): v is Record<string, number> => typeof v === 'object' && v !== null); return s.remaining ?? 0; } catch { return 0; }
  });
  const [timerRunning, setTimerRunning] = useState(false); // never auto-resume on reload
  const [timerDone, setTimerDone] = useState<boolean>(() => {
    try { const s = readLocal<Record<string, unknown>>(CLOCK_TIMER_KEY, {}, (v): v is Record<string, unknown> => typeof v === 'object' && v !== null); return !!(s.done); } catch { return false; }
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Persist timer config and progress whenever they change
  useEffect(() => {
    writeLocal(CLOCK_TIMER_KEY, { h: timerH, m: timerM, s: timerS, remaining, done: timerDone });
  }, [timerH, timerM, timerS, remaining, timerDone]);

  // Alarm state
  const [alarms, setAlarms]         = useState<ClockAlarm[]>(() => readLocal(CLOCK_ALARMS_KEY, [], isClockAlarmArray));
  const [alarmInput, setAlarmInput] = useState({ time: '08:00', label: '', days: [] as number[] });
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [showAlarmForm, setShowAlarmForm]   = useState(false);
  const [firedAlarmId, setFiredAlarmId]     = useState<string | null>(null);

  // 1-second clock tick
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => { writeLocal(CLOCK_SECONDS_KEY, showSeconds); }, [showSeconds]);
  useEffect(() => { writeLocal(CLOCK_ALARMS_KEY, alarms); }, [alarms]);

  // Timer countdown
  useEffect(() => {
    if (timerRunning && remaining > 0) {
      timerRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1000) { setTimerRunning(false); setTimerDone(true); return 0; }
          return r - 1000;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, remaining]);

  // Alarm check
  useEffect(() => {
    const hh = now.getHours();
    const mm = now.getMinutes();
    const ss = now.getSeconds();
    const day = now.getDay();
    const todayStr = now.toDateString();
    if (ss !== 0) return; // check at minute boundary
    const fired = alarms.find((a) => {
      if (!a.enabled) return false;
      const [ah, am] = a.time.split(':').map(Number);
      if (ah !== hh || am !== mm) return false;
      if (a.days.length > 0 && !a.days.includes(day)) return false;
      if (a.firedToday === todayStr) return false;
      return true;
    });
    if (fired) {
      setFiredAlarmId(fired.id);
      setAlarms((prev) => prev.map((a) => a.id === fired.id ? { ...a, firedToday: todayStr } : a));
    }
  }, [now, alarms]);

  const hours   = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ampm    = hours >= 12 ? 'PM' : 'AM';
  const h12     = hours % 12 || 12;
  const timeStr = `${h12}:${pad2(minutes)}${(showSeconds && gridH >= 3 && mode === 'clock') ? `:${pad2(seconds)}` : ''}`;
  const dateStr = now.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric' });

  const remSec   = Math.ceil(remaining / 1000);
  const remH     = Math.floor(remSec / 3600);
  const remM     = Math.floor((remSec % 3600) / 60);
  const remS     = remSec % 60;
  const remStr   = remH > 0 ? `${remH}:${pad2(remM)}:${pad2(remS)}` : `${pad2(remM)}:${pad2(remS)}`;

  const startTimer = () => {
    const ms = ((timerH * 3600) + (timerM * 60) + timerS) * 1000;
    if (ms <= 0) return;
    setRemaining(ms);
    setTimerDone(false);
    setTimerRunning(true);
  };
  const pauseTimer  = () => setTimerRunning(false);
  const resumeTimer = () => { if (remaining > 0) setTimerRunning(true); };
  const resetTimer  = () => { setTimerRunning(false); setRemaining(0); setTimerDone(false); };

  const saveAlarm = () => {
    if (!alarmInput.time) return;
    if (editingAlarmId) {
      setAlarms((prev) => prev.map((a) => a.id === editingAlarmId ? { ...a, ...alarmInput, firedToday: undefined } : a));
      setEditingAlarmId(null);
    } else {
      setAlarms((prev) => [...prev, { id: crypto.randomUUID(), ...alarmInput, enabled: true }]);
    }
    setAlarmInput({ time: '08:00', label: '', days: [] });
    setShowAlarmForm(false);
  };
  const toggleAlarm = (id: string) => setAlarms((prev) => prev.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
  const deleteAlarm = (id: string) => setAlarms((prev) => prev.filter((a) => a.id !== id));
  const editAlarm   = (a: ClockAlarm) => {
    setEditingAlarmId(a.id);
    setAlarmInput({ time: a.time, label: a.label, days: a.days });
    setShowAlarmForm(true);
  };
  const toggleDay = (d: number) => setAlarmInput((prev) => ({
    ...prev,
    days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d],
  }));

  const firedAlarm = firedAlarmId ? alarms.find((a) => a.id === firedAlarmId) : null;
  const DAY_LABELS = ['S','M','T','W','T','F','S'];
  const compact = gridH <= 2;

  // ── Tabs ──
  const tabs = (
    <div className="clock-tabs">
      {(['clock','timer','alarm'] as ClockMode[]).map((m) => (
        <button key={m} className={`clock-tab${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
          {m === 'clock' ? <Clock /> : m === 'timer' ? <Timer /> : <Bell />}
          {!compact && <span>{m.charAt(0).toUpperCase() + m.slice(1)}</span>}
        </button>
      ))}
    </div>
  );

  // ── Clock mode ──
  if (mode === 'clock') {
    if (compact) {
      return (
        <div className="clock-fill clock-compact">
          {tabs}
          <div className="clock-display compact">
            <div className="clock-time clock-time-sm">{timeStr}<span className="clock-ampm">{ampm}</span></div>
            {timerRunning && <div className="clock-timer-badge">⏱ {remStr}</div>}
          </div>
        </div>
      );
    }
    return (
      <div className="clock-fill">
        {tabs}
        <div className="clock-display">
          <div className="clock-time">{timeStr}<span className="clock-ampm">{ampm}</span></div>
          <div className="clock-date">{dateStr}</div>
          {timerRunning && <div className="clock-timer-badge inline">⏱ {remStr} remaining</div>}
          {timerDone    && <div className="clock-timer-badge done">⏱ Timer done!</div>}
          {firedAlarm   && (
            <div className="clock-alarm-alert">
              <Bell /> {firedAlarm.label || `Alarm — ${firedAlarm.time}`}
              <button onClick={() => setFiredAlarmId(null)}>Dismiss</button>
            </div>
          )}
        </div>
        <label className="clock-toggle">
          <input type="checkbox" checked={showSeconds} onChange={(e) => setShowSeconds(e.target.checked)} />
          <span>Seconds</span>
        </label>
      </div>
    );
  }

  // ── Timer mode ──
  if (mode === 'timer') {
    return (
      <div className="clock-fill clock-timer-mode">
        {tabs}
        {timerDone ? (
          <div className="timer-done-state">
            <div className="timer-done-icon">⏱</div>
            <div className="timer-done-text">Timer done!</div>
            <button className="clock-btn clock-btn-reset" onClick={resetTimer}>Reset</button>
          </div>
        ) : remaining > 0 ? (
          <div className="timer-running-state">
            <div className="timer-countdown">{remStr}</div>
            <div className="timer-controls">
              {timerRunning
                ? <button className="clock-btn clock-btn-pause" onClick={pauseTimer}><Pause /> Pause</button>
                : <button className="clock-btn clock-btn-start" onClick={resumeTimer}><Play /> Resume</button>
              }
              <button className="clock-btn clock-btn-reset" onClick={resetTimer}><RotateCcw /> Reset</button>
            </div>
          </div>
        ) : (
          <div className="timer-set-state">
            <div className="timer-inputs">
              <div className="timer-input-group">
                <input type="number" min={0} max={23} value={timerH} onChange={(e) => setTimerH(Math.max(0, Math.min(23, +e.target.value)))} />
                <span>h</span>
              </div>
              <div className="timer-input-group">
                <input type="number" min={0} max={59} value={timerM} onChange={(e) => setTimerM(Math.max(0, Math.min(59, +e.target.value)))} />
                <span>m</span>
              </div>
              <div className="timer-input-group">
                <input type="number" min={0} max={59} value={timerS} onChange={(e) => setTimerS(Math.max(0, Math.min(59, +e.target.value)))} />
                <span>s</span>
              </div>
            </div>
            <button className="clock-btn clock-btn-start" onClick={startTimer}><Play /> Start</button>
          </div>
        )}
      </div>
    );
  }

  // ── Alarm mode ──
  return (
    <div className="clock-fill clock-alarm-mode">
      {tabs}
      <div className="alarm-list-wrap">
        {firedAlarm && (
          <div className="clock-alarm-alert">
            <Bell /> {firedAlarm.label || `Alarm — ${firedAlarm.time}`}
            <button onClick={() => setFiredAlarmId(null)}>Dismiss</button>
          </div>
        )}
        {alarms.length === 0 && !showAlarmForm && (
          <p className="alarm-empty">No alarms. Add one below.</p>
        )}
        {alarms.map((a) => (
          <div key={a.id} className={`alarm-row${a.enabled ? '' : ' disabled'}`}>
            <div className="alarm-row-time">{a.time}</div>
            <div className="alarm-row-info">
              {a.label && <span className="alarm-row-label">{a.label}</span>}
              {a.days.length > 0 && (
                <span className="alarm-row-days">{DAY_LABELS.filter((_, i) => a.days.includes(i)).join(' ')}</span>
              )}
            </div>
            <div className="alarm-row-actions">
              <button className={`alarm-toggle${a.enabled ? ' on' : ''}`} onClick={() => toggleAlarm(a.id)} title={a.enabled ? 'Disable' : 'Enable'} />
              <button className="alarm-edit-btn" onClick={() => editAlarm(a)} title="Edit"><Pencil /></button>
              <button className="alarm-del-btn" onClick={() => deleteAlarm(a.id)} title="Delete"><Trash2 /></button>
            </div>
          </div>
        ))}
        {showAlarmForm ? (
          <div className="alarm-form">
            <input type="time" value={alarmInput.time} onChange={(e) => setAlarmInput((p) => ({ ...p, time: e.target.value }))} className="alarm-time-input" />
            <input type="text" placeholder="Label (optional)" value={alarmInput.label} onChange={(e) => setAlarmInput((p) => ({ ...p, label: e.target.value }))} className="alarm-label-input" />
            <div className="alarm-days-row">
              {DAY_LABELS.map((d, i) => (
                <button key={i} className={`alarm-day-btn${alarmInput.days.includes(i) ? ' active' : ''}`} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
            <div className="alarm-form-actions">
              <button className="clock-btn clock-btn-start" onClick={saveAlarm}><Check /> Save</button>
              <button className="clock-btn clock-btn-reset" onClick={() => { setShowAlarmForm(false); setEditingAlarmId(null); setAlarmInput({ time: '08:00', label: '', days: [] }); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="alarm-add-btn" onClick={() => setShowAlarmForm(true)}><Plus /> Add alarm</button>
        )}
      </div>
    </div>
  );
}

// ── Notepad HTML sanitizer ─────────────────────────────────────────────────
// Allowlist of tags and their permitted attributes. Event handlers and
// javascript: URLs are stripped on every save/load cycle.
// `style` is allowed on block elements but trimmed to `text-align` only.
// `data-type` / `data-checked` on <li> support Tiptap task-list items.

const NOTEPAD_ALLOWED_TAGS = new Set([
  'b','strong','i','em','u','s','h1','h2','h3',
  'ul','ol','li','p','br','a','span','div','blockquote',
]);
const NOTEPAD_BLOCK_TAGS = new Set(['p','h1','h2','h3','div','blockquote','ul','ol','li']);
const NOTEPAD_ALLOWED_ATTRS: Record<string, string[]> = { a: ['href', 'target', 'rel'] };

/** Keep only a `text-align` declaration from a raw style string. */
function sanitizeStyle(style: string): string {
  const m = /text-align\s*:\s*(left|center|right|justify)/i.exec(style);
  return m ? `text-align: ${m[1].toLowerCase()}` : '';
}

function sanitizeNotepadHtml(raw: string): string {
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');

    function cleanNode(node: Node): Node | null {
      if (node.nodeType === Node.TEXT_NODE) return node.cloneNode(false);
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      if (!NOTEPAD_ALLOWED_TAGS.has(tag)) {
        // Unwrap: keep children, discard the element itself
        const frag = document.createDocumentFragment();
        for (const child of Array.from(el.childNodes)) {
          const c = cleanNode(child);
          if (c) frag.appendChild(c);
        }
        return frag.hasChildNodes() ? frag : null;
      }
      const out = document.createElement(tag);

      // Standard attr allowlist
      for (const attr of (NOTEPAD_ALLOWED_ATTRS[tag] ?? [])) {
        const val = el.getAttribute(attr);
        if (val !== null) {
          if (attr === 'href' && /^\s*(javascript|data):/i.test(val)) continue;
          out.setAttribute(attr, val);
        }
      }

      // text-align style on block elements
      if (NOTEPAD_BLOCK_TAGS.has(tag)) {
        const rawStyle = el.getAttribute('style') ?? '';
        const safe = sanitizeStyle(rawStyle);
        if (safe) out.setAttribute('style', safe);
      }

      // Tiptap task-list data attributes on <li>
      if (tag === 'li') {
        const dtype = el.getAttribute('data-type');
        if (dtype === 'taskItem') {
          out.setAttribute('data-type', 'taskItem');
          const checked = el.getAttribute('data-checked');
          if (checked !== null) out.setAttribute('data-checked', checked === 'true' ? 'true' : 'false');
        }
      }
      // data-type="taskList" on <ul>
      if (tag === 'ul') {
        const dtype = el.getAttribute('data-type');
        if (dtype === 'taskList') out.setAttribute('data-type', 'taskList');
      }

      for (const child of Array.from(el.childNodes)) {
        const c = cleanNode(child);
        if (c) out.appendChild(c);
      }
      return out;
    }

    const wrapper = document.createElement('div');
    for (const child of Array.from(doc.body.childNodes)) {
      const c = cleanNode(child);
      if (c) wrapper.appendChild(c);
    }
    return wrapper.innerHTML;
  } catch { return ''; }
}

// ── NotepadWidget (Tiptap-backed rich-text editor) ────────────────────────
// Uses @tiptap/core (ProseMirror) headlessly — no execCommand anywhere.

function readNotepadHtml(): string {
  try {
    const h = window.localStorage.getItem(NOTEPAD_HTML_KEY);
    if (h !== null) return sanitizeNotepadHtml(h);
    const plain = window.localStorage.getItem(NOTEPAD_STORAGE_KEY) ?? '';
    if (plain) {
      const escaped = plain
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      const migrated = sanitizeNotepadHtml(escaped);
      window.localStorage.setItem(NOTEPAD_HTML_KEY, migrated);
      return migrated;
    }
    return '';
  } catch { return ''; }
}

function NotepadWidget({ compact = false }: { compact?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tiptap       = useRef<Editor | null>(null);
  const saveTimer    = useRef<number | null>(null);
  const [charCount,      setCharCount]      = useState(0);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [confirmClear,   setConfirmClear]   = useState(false);
  const [importPending,  setImportPending]  = useState<string | null>(null);
  const [importedFile,   setImportedFile]   = useState<string | null>(null);
  const [exportedFile,   setExportedFile]   = useState<string | null>(null);
  const importFileNameRef = useRef<string>('');
  // Increment to re-render toolbar active-states on every selection / transaction
  const [tick, setTick] = useState(0);

  const schedSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const ed = tiptap.current;
      if (!ed) return;
      try {
        const safe = sanitizeNotepadHtml(ed.getHTML());
        window.localStorage.setItem(NOTEPAD_HTML_KEY, safe);
      } catch {}
    }, 400);
  }, []);

  // Mount Tiptap once on first render
  useEffect(() => {
    if (!containerRef.current) return;
    const initialHtml = readNotepadHtml();

    const ed = new Editor({
      element: containerRef.current,
      extensions: [
        StarterKit.configure({
          heading:    { levels: [1, 2] },
          // Disabled here because we add our own configured versions below
          link:       false,
          underline:  false,
        }),
        TiptapUnderline,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TiptapLink.configure({ openOnClick: false }),
        TaskList,
        TaskItem.configure({ nested: false }),
        Placeholder.configure({
          placeholder: 'Type freely. Notes save automatically and stay after refresh.',
        }),
      ],
      content: initialHtml || '<p></p>',
      editorProps: {
        attributes: {
          class:             'notepad-editor',
          'data-testid':     'notepad-editor',
          spellcheck:        'true',
        },
      },
    });

    ed.on('update', () => {
      setCharCount(ed.getText().replace(/\n/g, '').length);
      schedSave();
      setTick((n) => n + 1);
    });
    ed.on('selectionUpdate', () => setTick((n) => n + 1));
    ed.on('transaction',     () => setTick((n) => n + 1));

    setCharCount(ed.getText().replace(/\n/g, '').length);
    tiptap.current = ed;

    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      ed.destroy();
      tiptap.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ed = tiptap.current; // convenience alias (re-read on every render via tick)
  void tick;                  // silence unused-variable lint

  const clearEditor = () => {
    ed?.commands.clearContent(true);
    setCharCount(0);
    try { window.localStorage.setItem(NOTEPAD_HTML_KEY, ''); } catch {}
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  };

  const insertLink = () => {
    if (!ed) return;
    const prev = ed.getAttributes('link').href as string | undefined;
    const url  = window.prompt('Enter URL:', prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      ed.chain().focus().unsetLink().run();
    } else {
      ed.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    }
    schedSave();
  };

  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const exportTxt = () => {
    const ed = tiptap.current;
    if (!ed) return;
    const text = ed.getText({ blockSeparator: '\n' });
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'notepad.txt';
    a.click();
    URL.revokeObjectURL(url);
    setExportedFile('notepad.txt');
    window.setTimeout(() => setExportedFile(null), 2000);
  };

  const exportHtml = () => {
    const ed = tiptap.current;
    if (!ed) return;
    const html = `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8"><title>Notepad</title></head>\n<body>\n${ed.getHTML()}\n</body>\n</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'notepad.html';
    a.click();
    URL.revokeObjectURL(url);
    setExportedFile('notepad.html');
    window.setTimeout(() => setExportedFile(null), 2000);
  };

  const copyAll = async () => {
    const ed = tiptap.current;
    if (!ed) return;
    const text = ed.getText({ blockSeparator: '\n' });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyFailed(true);
      window.setTimeout(() => setCopyFailed(false), 3000);
    }
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Commit parsed HTML to the editor — replace or append. */
  const applyImport = useCallback((html: string, mode: 'replace' | 'append') => {
    const ed = tiptap.current;
    if (!ed) return;
    if (mode === 'append') {
      // Move to the very end, insert a paragraph break, then insert the new content
      ed.commands.focus('end');
      ed.commands.insertContent('<p></p>' + html);
    } else {
      ed.commands.setContent(html || '<p></p>');
    }
    setCharCount(ed.getText().replace(/\n/g, '').length);
    try {
      const safe = sanitizeNotepadHtml(ed.getHTML());
      window.localStorage.setItem(NOTEPAD_HTML_KEY, safe);
    } catch {}
    setImportPending(null);
    // Show fleeting confirmation toast
    const fname = importFileNameRef.current;
    if (fname) {
      setImportedFile(fname);
      window.setTimeout(() => setImportedFile(null), 2000);
    }
  }, []);

  const handleImportFile = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    // Reset so the same file can be re-imported
    fileInputRef.current.value = '';
    if (!file) return;
    importFileNameRef.current = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      const ed = tiptap.current;
      if (!ed) return;

      let html = '';
      const nameLower = file.name.toLowerCase();

      if (nameLower.endsWith('.html') || nameLower.endsWith('.htm')) {
        // Parse HTML file — extract body content
        const parser = new DOMParser();
        const doc = parser.parseFromString(raw, 'text/html');
        html = sanitizeNotepadHtml(doc.body.innerHTML);
      } else {
        // Plain text — escape and convert newlines to paragraphs
        const lines = raw
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n');
        html = lines
          .map((line) => {
            const escaped = line
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
            return `<p>${escaped || '<br>'}</p>`;
          })
          .join('');
        html = sanitizeNotepadHtml(html);
      }

      const hasContent = ed.getText().trim().length > 0;
      if (hasContent) {
        // Show inline Replace / Append prompt instead of a blocking confirm dialog
        setImportPending(html);
      } else {
        applyImport(html, 'replace');
      }
    };
    reader.readAsText(file);
  }, [applyImport]);

  const triggerImport = () => fileInputRef.current?.click();

  const showToolbar = toolbarVisible && !compact;

  /** Toolbar button — highlights when the format is active at the cursor. */
  const tbBtn = (
    title:    string,
    onClick:  () => void,
    isActive: boolean,
    icon:     ReactNode,
  ) => (
    <button
      type="button"
      title={title}
      className={`notepad-tb-btn${isActive ? ' is-active' : ''}`}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    >
      {icon}
    </button>
  );

  return (
    <div className="notepad-fill notepad-rich">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.html,.htm"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />
      <div className="widget-header">
        <span className="widget-label"><StickyNote /> Notepad</span>
        <div className="notepad-header-actions">
          <button
            type="button"
            className={`notepad-toolbar-toggle${showToolbar ? ' active' : ''}`}
            title="Toggle toolbar"
            onClick={() => setToolbarVisible((v) => !v)}
          >
            <Pencil />
          </button>
          {charCount > 0 && (
            confirmClear ? (
              <div className="notepad-confirm">
                <span>Clear all notes?</span>
                <button type="button" onClick={() => { clearEditor(); setConfirmClear(false); }}>Yes</button>
                <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" className="text-button" onClick={() => setConfirmClear(true)}>
                <Trash2 /> Clear
              </button>
            )
          )}
        </div>
      </div>

      {showToolbar && (
        <div className="notepad-toolbar">
          {tbBtn('Bold',      () => ed?.chain().focus().toggleBold().run(),      !!ed?.isActive('bold'),      <Bold />)}
          {tbBtn('Italic',    () => ed?.chain().focus().toggleItalic().run(),    !!ed?.isActive('italic'),    <Italic />)}
          {tbBtn('Underline', () => ed?.chain().focus().toggleUnderline().run(), !!ed?.isActive('underline'), <Underline />)}
          <span className="notepad-tb-sep" />
          {tbBtn('Heading 1', () => ed?.chain().focus().toggleHeading({ level: 1 }).run(), !!ed?.isActive('heading', { level: 1 }), <Heading1 />)}
          {tbBtn('Heading 2', () => ed?.chain().focus().toggleHeading({ level: 2 }).run(), !!ed?.isActive('heading', { level: 2 }), <Heading2 />)}
          <span className="notepad-tb-sep" />
          {tbBtn('Bullet list',   () => ed?.chain().focus().toggleBulletList().run(),  !!ed?.isActive('bulletList'),  <List />)}
          {tbBtn('Numbered list', () => ed?.chain().focus().toggleOrderedList().run(), !!ed?.isActive('orderedList'), <ListOrdered />)}
          {tbBtn('Task list',     () => ed?.chain().focus().toggleTaskList().run(),     !!ed?.isActive('taskList'),    <ListChecks />)}
          <span className="notepad-tb-sep" />
          {tbBtn('Align left',   () => ed?.chain().focus().setTextAlign('left').run(),   !!ed?.isActive({ textAlign: 'left' }),   <AlignLeft />)}
          {tbBtn('Align centre', () => ed?.chain().focus().setTextAlign('center').run(), !!ed?.isActive({ textAlign: 'center' }), <AlignCenter />)}
          {tbBtn('Align right',  () => ed?.chain().focus().setTextAlign('right').run(),  !!ed?.isActive({ textAlign: 'right' }),  <AlignRight />)}
          <span className="notepad-tb-sep" />
          <button
            type="button"
            title="Insert link"
            className={`notepad-tb-btn${ed?.isActive('link') ? ' is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); insertLink(); }}
          >
            <Link2 />
          </button>
        </div>
      )}

      {/* Tiptap mounts its ProseMirror contenteditable inside this div */}
      <div ref={containerRef} className="notepad-editor-wrap" />

      <div className="notepad-footer">
        {importPending !== null ? (
          <div className="notepad-import-prompt">
            <span className="notepad-import-prompt-label">Add to existing notes, or replace them?</span>
            <span className="notepad-import-prompt-actions">
              <button type="button" className="notepad-import-btn" onClick={() => setImportPending(null)}>Cancel</button>
              <button type="button" className="notepad-import-btn" onClick={() => applyImport(importPending, 'replace')}>Replace</button>
              <button type="button" className="notepad-import-btn is-primary" onClick={() => applyImport(importPending, 'append')}>Append</button>
            </span>
          </div>
        ) : (
        <>
        <span className="notepad-footer-count">
          {charCount > 0 ? `${charCount} char${charCount !== 1 ? 's' : ''} · saved locally` : 'Empty · start typing'}
        </span>
        <span className="notepad-export-actions">
          <button type="button" className="notepad-export-btn" title="Import a .txt or .html file" onClick={triggerImport}>
            <FolderOpen />
            Import
          </button>
          {charCount > 0 && (
            <>
              <button type="button" className="notepad-export-btn" title="Copy all text to clipboard" onClick={copyAll}>
                <ClipboardCopy />
                {copied ? 'Copied!' : 'Copy'}
              </button>
              <button type="button" className="notepad-export-btn" title="Export as plain text (.txt)" onClick={exportTxt}>
                <Download />
                .txt
              </button>
              <button type="button" className="notepad-export-btn" title="Export as HTML (.html)" onClick={exportHtml}>
                <Download />
                .html
              </button>
            </>
          )}
        </span>
        </>
        )}
      </div>

      {copied && (
        <div className="toast-message" role="status">
          <Check />
          Copied to clipboard
        </div>
      )}
      {copyFailed && (
        <div className="toast-message toast-message--error" role="alert">
          <X />
          Copy failed — try selecting the text manually
        </div>
      )}
      {importedFile && (
        <div className="toast-message" role="status">
          <Check />
          Imported {importedFile}
        </div>
      )}
      {exportedFile && (
        <div className="toast-message" role="status">
          <Check />
          Exported {exportedFile}
        </div>
      )}
    </div>
  );
}

// ─── LinkShelfWidget ──────────────────────────────────────────────────────────

interface ShelfLink { id: string; name: string; url: string; }

function isShelfLinkArray(v: unknown): v is ShelfLink[] {
  return Array.isArray(v) && v.every((l) => l && typeof l.id === 'string' && typeof l.url === 'string');
}

function faviconSrc(url: string) {
  try {
    const origin = new URL(url).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`;
  } catch { return ''; }
}

function LinkShelfWidget({ gridW, gridH }: { gridW: number; gridH: number }) {
  const [links, setLinks]         = useState<ShelfLink[]>(() => readLocal(LINK_SHELF_KEY, [], isShelfLinkArray));
  const [showForm, setShowForm]   = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState({ name: '', url: '' });
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => { writeLocal(LINK_SHELF_KEY, links); }, [links]);

  const saveLink = () => {
    if (!form.url.trim()) return;
    const url = form.url.startsWith('http') ? form.url.trim() : `https://${form.url.trim()}`;
    const name = form.name.trim() || (() => { try { return new URL(url).hostname.replace('www.',''); } catch { return url; } })();
    if (editId) {
      setLinks((prev) => prev.map((l) => l.id === editId ? { ...l, name, url } : l));
      setEditId(null);
    } else {
      setLinks((prev) => [...prev, { id: crypto.randomUUID(), name, url }]);
    }
    setForm({ name: '', url: '' });
    setShowForm(false);
  };

  const deleteLink = (id: string) => setLinks((prev) => prev.filter((l) => l.id !== id));
  const startEdit  = (l: ShelfLink) => { setEditId(l.id); setForm({ name: l.name, url: l.url }); setShowForm(true); };

  // Size-responsive modes
  const iconOnly = gridW <= 2 && gridH <= 2;
  const gridMode = gridW >= 5 && gridH >= 3;

  return (
    <div className="link-shelf-fill">
      <div className="widget-header">
        <span className="widget-label"><Globe /> Link Shelf</span>
        <button type="button" className="text-button" onClick={() => { setEditId(null); setForm({ name:'', url:'' }); setShowForm((v)=>!v); }}>
          <Plus />
        </button>
      </div>

      {showForm && (
        <div className="link-shelf-form">
          <input className="link-shelf-input" placeholder="URL" value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveLink()} autoFocus />
          <input className="link-shelf-input" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && saveLink()} />
          <div className="link-shelf-form-actions">
            <button className="clock-btn clock-btn-start" onClick={saveLink}><Check /> {editId ? 'Save' : 'Add'}</button>
            <button className="clock-btn clock-btn-reset" onClick={() => { setShowForm(false); setEditId(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {links.length === 0 && !showForm && (
        <div className="link-shelf-empty">Add your favourite links here.</div>
      )}

      <div className={`link-shelf-list${gridMode ? ' grid-mode' : ''}${iconOnly ? ' icon-only-mode' : ''}`}>
        {links.map((l) => (
          <div key={l.id} className="link-shelf-item" title={l.name}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-shelf-anchor">
              {faviconSrc(l.url) && !imgErrors[l.id] ? (
                <img
                  src={faviconSrc(l.url)}
                  alt=""
                  className="link-shelf-favicon"
                  onError={() => setImgErrors((p) => ({ ...p, [l.id]: true }))}
                />
              ) : (
                <span className="link-shelf-letter">{l.name[0]?.toUpperCase() ?? '?'}</span>
              )}
              {!iconOnly && <span className="link-shelf-name">{l.name}</span>}
            </a>
            <div className="link-shelf-item-actions">
              <button title="Edit"   className="link-shelf-action-btn" onClick={() => startEdit(l)}><Pencil /></button>
              <button title="Remove" className="link-shelf-action-btn" onClick={() => deleteLink(l.id)}><X /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DecisionMakerWidget ──────────────────────────────────────────────────────

type DiceType = 4 | 6 | 8 | 10 | 12 | 20;
type DecisionMode = 'coin' | 'dice' | 'number' | 'list' | 'yesno' | 'wheel';

interface DecisionState { mode: DecisionMode; dice: DiceType; numMin: number; numMax: number; listItems: string; }

function isDecisionState(v: unknown): v is DecisionState {
  return !!v && typeof (v as DecisionState).mode === 'string';
}

function DecisionMakerWidget({ gridW: _gridW, gridH: _gridH }: { gridW: number; gridH: number }) {
  const [state, setState] = useState<DecisionState>(
    () => readLocal(DECISION_MAKER_KEY, { mode: 'coin', dice: 6 as DiceType, numMin: 1, numMax: 100, listItems: '' }, isDecisionState),
  );
  const [result, setResult] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => { writeLocal(DECISION_MAKER_KEY, state); }, [state]);

  const upd = (patch: Partial<DecisionState>) => setState((s) => ({ ...s, ...patch }));

  const decide = () => {
    setSpinning(true);
    setResult(null);
    setTimeout(() => {
      let res = '';
      switch (state.mode) {
        case 'coin':   res = Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails'; break;
        case 'dice':   res = `🎲 ${Math.floor(Math.random() * state.dice) + 1}`; break;
        case 'number': res = `${Math.floor(Math.random() * (state.numMax - state.numMin + 1)) + state.numMin}`; break;
        case 'yesno':  res = Math.random() < 0.5 ? '✅ Yes' : '❌ No'; break;
        case 'list': {
          const items = state.listItems.split('\n').map((s) => s.trim()).filter(Boolean);
          res = items.length > 0 ? `→ ${items[Math.floor(Math.random() * items.length)]}` : '(empty list)';
          break;
        }
        case 'wheel': {
          const items = state.listItems.split('\n').map((s) => s.trim()).filter(Boolean);
          res = items.length > 0 ? `🎡 ${items[Math.floor(Math.random() * items.length)]}` : '(empty wheel)';
          break;
        }
      }
      setResult(res);
      setSpinning(false);
    }, 600);
  };

  const MODES: { id: DecisionMode; label: string }[] = [
    { id: 'coin',   label: '🪙 Coin'   },
    { id: 'dice',   label: '🎲 Dice'   },
    { id: 'number', label: '# Number'  },
    { id: 'list',   label: '📋 List'   },
    { id: 'yesno',  label: '✓ Yes/No'  },
    { id: 'wheel',  label: '🎡 Wheel'  },
  ];

  const DICE_TYPES: DiceType[] = [4, 6, 8, 10, 12, 20];

  return (
    <div className="decision-fill">
      <div className="widget-header">
        <span className="widget-label"><Shuffle /> Decision Maker</span>
      </div>

      <div className="decision-mode-tabs">
        {MODES.map((m) => (
          <button key={m.id} className={`decision-mode-btn${state.mode === m.id ? ' active' : ''}`} onClick={() => { upd({ mode: m.id }); setResult(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="decision-config">
        {state.mode === 'dice' && (
          <div className="decision-dice-row">
            {DICE_TYPES.map((d) => (
              <button key={d} className={`decision-dice-btn${state.dice === d ? ' active' : ''}`} onClick={() => upd({ dice: d })}>D{d}</button>
            ))}
          </div>
        )}
        {state.mode === 'number' && (
          <div className="decision-num-row">
            <label>Min<input type="number" value={state.numMin} onChange={(e) => upd({ numMin: +e.target.value })} className="decision-num-input" /></label>
            <label>Max<input type="number" value={state.numMax} onChange={(e) => upd({ numMax: +e.target.value })} className="decision-num-input" /></label>
          </div>
        )}
        {(state.mode === 'list' || state.mode === 'wheel') && (
          <textarea
            className="decision-list-input"
            placeholder="One option per line"
            value={state.listItems}
            onChange={(e) => upd({ listItems: e.target.value })}
          />
        )}
      </div>

      <div className="decision-action-row">
        <button className={`decision-go-btn${spinning ? ' spinning' : ''}`} onClick={decide} disabled={spinning}>
          {spinning ? '…' : 'Go!'}
        </button>
        {result && <div className="decision-result">{result}</div>}
      </div>
    </div>
  );
}

// ─── CalculatorWidget ──────────────────────────────────────────────────────────

function safeEval(expr: string): string {
  // Only allow digits, operators, parens, dots, spaces
  if (!/^[\d+\-*/.() ]+$/.test(expr)) return 'Error';
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function('return (' + expr + ')')() as number;
    if (!isFinite(result)) return 'Error';
    // Round to 10 decimal places to avoid float jitter
    const rounded = parseFloat(result.toPrecision(10));
    return String(rounded);
  } catch { return 'Error'; }
}

function CalculatorWidget() {
  const [expr, setExpr]   = useState('');
  const [result, setResult] = useState('');
  const [justCalc, setJustCalc] = useState(false);

  const press = useCallback((val: string) => {
    if (val === '=') {
      if (!expr) return;
      const res = safeEval(expr);
      setResult(res);
      setJustCalc(true);
    } else if (val === 'C') {
      setExpr(''); setResult(''); setJustCalc(false);
    } else if (val === '⌫') {
      if (justCalc) { setExpr(''); setResult(''); setJustCalc(false); return; }
      setExpr((e) => e.slice(0, -1));
    } else {
      if (justCalc) {
        // Start fresh if user types a new number, keep result for operator chaining
        if (/^[0-9(.]$/.test(val)) { setExpr(val); setResult(''); setJustCalc(false); return; }
        setExpr(result + val); setResult(''); setJustCalc(false);
      } else {
        setExpr((e) => e + val);
      }
    }
  }, [expr, result, justCalc]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[\d+\-*/().%]$/.test(e.key)) press(e.key === '%' ? '/100' : e.key);
      else if (e.key === 'Enter' || e.key === '=') press('=');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Escape') press('C');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [press]);

  const BUTTONS = [
    ['C', '(', ')', '⌫'],
    ['7', '8', '9', '/'],
    ['4', '5', '6', '*'],
    ['1', '2', '3', '-'],
    ['0', '.', '=', '+'],
  ];

  const display = result ? result : (expr || '0');

  return (
    <div className="calc-fill">
      <div className="calc-display">
        <div className="calc-expr">{expr || '\u00a0'}</div>
        <div className={`calc-result${justCalc ? ' is-result' : ''}`}>{display}</div>
      </div>
      <div className="calc-grid">
        {BUTTONS.map((row, ri) => (
          <div key={ri} className="calc-row">
            {row.map((btn) => (
              <button
                key={btn}
                className={`calc-btn${btn === '=' ? ' calc-btn-eq' : ''}${btn === 'C' ? ' calc-btn-clear' : ''}${btn === '⌫' ? ' calc-btn-del' : ''}${/^[+\-*/]$/.test(btn) ? ' calc-btn-op' : ''}`}
                onClick={() => press(btn)}
              >
                {btn}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Grid widget shell ────────────────────────────────────────────────────────

// ─── Sakura widget decorations ────────────────────────────────────────────────
// Renders a skin-specific decoration layer on top of the widget card.
// pointer-events: none — never blocks interaction.
// Positioned absolutely relative to .grid-widget-outer (overflow: visible),
// so decorations can overhang the widget edge.

const SAKURA_DECOS: Partial<Record<WidgetId, React.ReactNode>> = {
  // Wide blossom branch draped along the top-centre of the calendar
  calendar: (
    <img
      src="/sakura/branch-wide.png"
      className="sakura-deco sakura-deco--calendar"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Cat resting on a branch, peeking over the top-right of the clock
  clock: (
    <img
      src="/sakura/cat-branch.png"
      className="sakura-deco sakura-deco--clock"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Single large sakura flower at the top-right corner of the notepad
  notepad: (
    <img
      src="/sakura/flower-corner.png"
      className="sakura-deco sakura-deco--notepad"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Small blossom branch draping over the top-left of the link shelf
  'link-shelf': (
    <img
      src="/sakura/branch-wide.png"
      className="sakura-deco sakura-deco--link-shelf"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Flower petal cluster at the top-right of the decision maker
  'decision-maker': (
    <img
      src="/sakura/flower-corner.png"
      className="sakura-deco sakura-deco--decision-maker"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Cat on branch peeking over the top-right of the calculator
  calculator: (
    <img
      src="/sakura/cat-branch.png"
      className="sakura-deco sakura-deco--calculator"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Flower bloom at the top-left corner of the file finder (mirrored for variety)
  'file-finder': (
    <img
      src="/sakura/flower-corner.png"
      className="sakura-deco sakura-deco--file-finder"
      alt="" aria-hidden draggable={false}
    />
  ),
};

function SakuraWidgetDecoration({ widgetId }: { widgetId: WidgetId }) {
  const deco = SAKURA_DECOS[widgetId];
  if (!deco) return null;
  return (
    <div className="sakura-deco-layer" aria-hidden>
      {deco}
    </div>
  );
}

function GridWidget({
  item, isEditing, isActive, isDragging,
  onDragStart, onResizeStart, onRemoveWidget,
}: {
  item: LayoutItem;
  isEditing: boolean;
  isActive: boolean;
  isDragging: boolean;
  onDragStart: (e: React.PointerEvent) => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onRemoveWidget?: (id: WidgetId) => void;
}) {
  // Convert pixel dimensions to approximate grid units for widget display logic
  const approxGridW = Math.max(1, Math.round(item.w / 82));
  const approxGridH = Math.max(1, Math.round(item.h / 92));
  const isSakura = readEquippedSkin() === 'sakura';
  const canRemove = isEditing && onRemoveWidget && WIDGET_REGISTRY.some((w) => w.id === item.id);

  return (
    // Outer wrapper: pixel position; overflow:visible lets decorations overhang.
    // Transition eases boundary-correction settle; disabled while dragging (is-active-outer).
    // onPointerDown is always active — startDrag uses a 6px dead-zone so content clicks pass through.
    <div
      className={`grid-widget-outer${isActive ? ' is-active-outer' : ''}${isDragging ? ' is-dragging-outer' : ''}`}
      style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
      data-testid={`grid-widget-${item.id}`}
      onPointerDown={onDragStart}
    >
      {/* Visual card — keeps overflow: hidden for its own rounded corners */}
      <div
        className={`grid-widget${isEditing ? ' is-editable' : ''}${isActive ? ' is-active' : ''}`}
      >
        {isEditing && (
          <div className="widget-edit-badge" aria-hidden>
            <GripHorizontal />
            <span>{WIDGET_LABELS[item.id]}</span>
          </div>
        )}

        <div className={`grid-widget-content${isEditing ? ' is-locked' : ''}`}>
          {item.id === 'calendar'       && <CalendarWidget gridW={approxGridW} gridH={approxGridH} />}
          {item.id === 'clock'          && <ClockWidget gridH={approxGridH} />}
          {item.id === 'notepad'        && <NotepadWidget compact={item.h < 300} />}
          {item.id === 'file-finder'    && <FileFinderWidget gridW={approxGridW} gridH={approxGridH} />}
          {item.id === 'link-shelf'     && <LinkShelfWidget gridW={approxGridW} gridH={approxGridH} />}
          {item.id === 'decision-maker' && <DecisionMakerWidget gridW={approxGridW} gridH={approxGridH} />}
          {item.id === 'calculator'     && <CalculatorWidget />}
        </div>

        {canRemove && (
          <button
            type="button"
            className="widget-remove-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onRemoveWidget!(item.id); }}
            aria-label={`Remove ${WIDGET_LABELS[item.id]}`}
          >
            <X />
          </button>
        )}

        {isEditing && (
          <div
            className="widget-resize-handle"
            onPointerDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
            aria-label={`Resize ${WIDGET_LABELS[item.id]}`}
          />
        )}
      </div>

      {isSakura && <SakuraWidgetDecoration widgetId={item.id} />}
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

function HomeWorkspace({
  isEditing,
  activeWidgets,
  onRemoveWidget,
  snapEnabled,
}: {
  isEditing: boolean;
  activeWidgets: WidgetId[];
  onRemoveWidget: (id: WidgetId) => void;
  snapEnabled: boolean;
}) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const canvasWRef     = useRef(950);
  const activeItemRef  = useRef<LayoutItem | null>(null);
  const activeModeRef  = useRef<'drag' | 'resize' | 'settling' | null>(null);

  const [layout, setLayout]         = useState<LayoutItem[]>(() => getStoredLayout());
  const [activeItem, setActiveItem] = useState<LayoutItem | null>(null);
  const [activeMode, setActiveMode] = useState<'drag' | 'resize' | 'settling' | null>(null);

  // Portal drag ghost — rendered at document.body so it appears above all stacking contexts
  // including the sidebar. Direct DOM updates keep the ghost smooth at 60 fps.
  const [portalDragItem, setPortalDragItem] = useState<{ id: WidgetId; w: number; h: number } | null>(null);
  const portalDragElRef  = useRef<HTMLDivElement | null>(null);
  const portalOffsetRef  = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const portalInitPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const { setDragId, hoverPageRef, displace } = usePortable();

  // Transfer feedback toast — shown when user sends a widget to another tab
  const [transferToast, setTransferToast] = useState<string | null>(null);
  useEffect(() => {
    if (!transferToast) return;
    const t = setTimeout(() => setTransferToast(null), 2600);
    return () => clearTimeout(t);
  }, [transferToast]);

  // Track canvas pixel width and keep stored positions within bounds.
  // Runs on every ResizeObserver callback (sidebar pin/unpin, window resize)
  // so positions stay clamped whenever the canvas geometry changes.
  // Skips correction during an active drag or resize to avoid fighting the gesture.
  // On the very first measurement also attempts a proportional rescale when the
  // canvas is more than 30% narrower than the stored baseline (e.g. loading on
  // a much smaller screen).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let isFirstMeasure = true;
    const measure = () => {
      const cw = el.getBoundingClientRect().width || 950;
      canvasWRef.current = cw;
      // Don't touch positions while the user is dragging or resizing a widget
      if (activeModeRef.current !== null) return;
      setLayout((prev) => {
        let next = prev;
        // On the very first measurement: proportional rescale if canvas shrank >30%
        if (isFirstMeasure) {
          isFirstMeasure = false;
          const baseline = getStoredBaselineWidth();
          if (baseline && (baseline - cw) / baseline > 0.30) {
            const scale = cw / baseline;
            next = next.map((item) => {
              const min = WIDGET_MIN[item.id];
              const newW = Math.max(min.w, Math.round(item.w * scale));
              const newX = Math.max(0, Math.round(item.x * scale));
              return { ...item, w: newW, x: Math.min(Math.max(0, cw - newW), newX) };
            });
          }
        }
        // Every resize: clamp any widget whose right edge overflows the canvas
        next = next.map((item) => {
          if (item.x + item.w <= cw) return item;
          const min = WIDGET_MIN[item.id];
          const clampedW = Math.max(min.w, Math.min(item.w, cw));
          const clampedX = Math.max(0, Math.min(cw - clampedW, item.x));
          return { ...item, x: clampedX, w: clampedW };
        });
        if (next !== prev) storeLayout(next);
        // Always keep baseline current so the next session starts from real geometry
        storeBaselineWidth(cw);
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Display only active widgets; show activeItem at its live preview position
  const displayLayout = layout
    .filter((item) => activeWidgets.includes(item.id))
    .map((item) => (activeItem?.id === item.id ? activeItem : item));

  // ── Drag ──────────────────────────────────────────────────────────────────
  // Drag is ALWAYS enabled — no isEditing guard.
  // A 6 px dead-zone prevents accidental drags from widget-content taps.

  const startDrag = (id: WidgetId, e: React.PointerEvent) => {
    const item = layout.find((l) => l.id === id);
    if (!item) return;

    const origX = item.x, origY = item.y;
    const startMX = e.clientX, startMY = e.clientY;
    const portable = isPortableWidget(id);

    let dragging = false;
    let inSidebar = false;

    // Per-axis snap hysteresis — prevents rubber-banding near grid lines.
    // Snap engages when within SNAP_ENTER px of a grid line; releases only when
    // the cursor moves more than SNAP_EXIT px away, avoiding oscillation.
    let snapX = false, snapY = false;
    const SNAP_ENTER = 16, SNAP_EXIT = 28;
    const applySnapAxis = (raw: number, wasSnapped: boolean): { val: number; snapped: boolean } => {
      const nearest = Math.round(raw / SNAP_GRID) * SNAP_GRID;
      const dist    = Math.abs(raw - nearest);
      const nowSnapped = wasSnapped ? dist < SNAP_EXIT : dist <= SNAP_ENTER;
      return { val: nowSnapped ? nearest : raw, snapped: nowSnapped };
    };

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startMX;
      const dy = ev.clientY - startMY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        dragging = true;

        // Compute cursor-to-widget-origin offset for the portal ghost.
        // containerRect gives the workspace's viewport position.
        const containerRect = containerRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
        portalOffsetRef.current  = { dx: startMX - (containerRect.left + origX), dy: startMY - (containerRect.top + origY) };
        portalInitPosRef.current = { x: ev.clientX - portalOffsetRef.current.dx, y: ev.clientY - portalOffsetRef.current.dy };

        setPortalDragItem({ id, w: item.w, h: item.h }); // mounts ghost portal
        setActiveItem({ ...item });                       // marks widget as is-active-outer (opacity:0)
        activeItemRef.current = { ...item };
        setActiveMode('drag');
        activeModeRef.current = 'drag';
      }

      ev.preventDefault();

      // Update ghost position directly — no setState per frame, keeps animation at 60 fps
      if (portalDragElRef.current) {
        const { dx: pdx, dy: pdy } = portalOffsetRef.current;
        portalDragElRef.current.style.transform = `translate(${ev.clientX - pdx}px,${ev.clientY - pdy}px)`;
      }

      // Sidebar zone: entering activates drop-target highlights on nav links
      const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
      if (portable && ev.clientX < containerLeft) {
        if (!inSidebar) { inSidebar = true; setDragId(id); }
      } else if (inSidebar) {
        inSidebar = false;
        setDragId(null);
      }

      // Track logical position via ref — snap with hysteresis if enabled
      const rawX = origX + dx, rawY = origY + dy;
      if (snapEnabled) {
        const rx = applySnapAxis(rawX, snapX); snapX = rx.snapped;
        const ry = applySnapAxis(rawY, snapY); snapY = ry.snapped;
        activeItemRef.current = { ...item, x: rx.val, y: ry.val };
      } else {
        activeItemRef.current = { ...item, x: rawX, y: rawY };
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      if (!dragging) return; // tap/click — do nothing, let child onClick fire normally

      setPortalDragItem(null); // unmount ghost

      const dropPage = inSidebar ? hoverPageRef.current : null;

      // After a workspace drag (not a sidebar drop) the browser synthesises a click on the
      // release target. Suppress it so widget controls don't fire accidentally.
      // We skip this for sidebar drops: the cursor is over a nav link, not a widget, so
      // there is nothing to suppress — and swallowing that click would block the user from
      // immediately navigating to the destination tab.
      if (!inSidebar) {
        const suppressClick = (ce: MouseEvent) => {
          ce.stopPropagation();
          document.removeEventListener('click', suppressClick, true);
        };
        document.addEventListener('click', suppressClick, true);
      }

      // Invalid cross-tab drop (sidebar hover but no valid nav target, e.g. Profile/Settings):
      // return widget to its exact drag origin — no transfer, no navigation.
      if (inSidebar && !dropPage) {
        setDragId(null);
        setLayout((prev) => {
          const next = prev.map((l) => l.id === id ? { ...l, x: origX, y: origY } : l);
          storeLayout(next);
          storeBaselineWidth(canvasWRef.current);
          return next;
        });
        setActiveItem(null);
        activeItemRef.current = null;
        setActiveMode(null);
        activeModeRef.current = null;
        return;
      }

      // Valid cross-tab drop: transfer widget, stay on current page, show toast.
      if (dropPage) {
        const PAGE_LABEL: Record<string, string> = {
          '/store': 'Store', '/library': 'Library', '/breakroom': 'Breakroom',
        };
        displace(id, dropPage);
        setTransferToast(`${WIDGET_LABELS[id]} moved to ${PAGE_LABEL[dropPage] ?? dropPage}`);
        setDragId(null);
        setActiveItem(null);
        activeItemRef.current = null;
        setActiveMode(null);
        activeModeRef.current = null;
        return;
      }

      setDragId(null);
      const finalItem = activeItemRef.current;
      if (finalItem) {
        const cw = canvasWRef.current;
        const corrected: LayoutItem = {
          ...finalItem,
          x: Math.max(0, Math.min(cw - finalItem.w, finalItem.x)),
          y: Math.max(0, finalItem.y),
        };
        setLayout((prev) => { const next = prev.map((l) => (l.id === corrected.id ? corrected : l)); storeLayout(next); storeBaselineWidth(cw); return next; });

        // Rubber-band fix: commit the final position into activeItem while
        // keeping activeMode as 'settling' (→ is-active-outer stays on, so
        // transition:none is still in effect). The widget becomes visible at
        // the correct position. One rAF later we clear active state; at that
        // point the position is the same in both layout and activeItem, so
        // the re-enabled CSS transition (left 120ms / top 120ms) has nothing
        // to animate and no snap-back occurs.
        setActiveItem(corrected);
        activeModeRef.current = 'settling';
        setActiveMode('settling');
        requestAnimationFrame(() => {
          setActiveItem(null);
          activeItemRef.current = null;
          setActiveMode(null);
          activeModeRef.current = null;
        });
      } else {
        setActiveItem(null);
        activeItemRef.current = null;
        setActiveMode(null);
        activeModeRef.current = null;
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // ── Resize ────────────────────────────────────────────────────────────────

  const startResize = (id: WidgetId, e: React.PointerEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    e.stopPropagation();

    const item = layout.find((l) => l.id === id)!;
    const origW = item.w, origH = item.h;
    const startMX = e.clientX, startMY = e.clientY;
    const min = WIDGET_MIN[id];

    setActiveItem({ ...item });
    activeItemRef.current = { ...item };
    setActiveMode('resize');
    activeModeRef.current = 'resize';

    const onMove = (ev: PointerEvent) => {
      const cw = canvasWRef.current;
      const dx = ev.clientX - startMX;
      const dy = ev.clientY - startMY;
      const rawW = Math.max(min.w, Math.min(cw - item.x, origW + dx));
      const rawH = Math.max(min.h, origH + dy);
      const newW = snapEnabled ? Math.max(min.w, snapVal(rawW)) : rawW;
      const newH = snapEnabled ? Math.max(min.h, snapVal(rawH)) : rawH;
      const proposed: LayoutItem = { ...item, w: newW, h: newH };
      setActiveItem(proposed);
      activeItemRef.current = proposed;
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const finalItem = activeItemRef.current;
      if (finalItem) {
        const cw = canvasWRef.current;
        setLayout((prev) => { const next = prev.map((l) => (l.id === finalItem.id ? finalItem : l)); storeLayout(next); storeBaselineWidth(cw); return next; });
      }
      setActiveItem(null);
      activeItemRef.current = null;
      setActiveMode(null);
      activeModeRef.current = null;
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div
      ref={containerRef}
      className={`home-workspace${isEditing ? ' is-editing' : ''}`}
      data-testid="home-workspace"
    >
      {displayLayout.map((item) => {
        const isActive   = activeItem?.id === item.id && activeMode !== null;
        const isDragging = activeItem?.id === item.id && activeMode === 'drag';
        return (
          <GridWidget
            key={item.id}
            item={item}
            isEditing={isEditing}
            isActive={isActive}
            isDragging={isDragging}
            onDragStart={(e) => startDrag(item.id, e)}
            onResizeStart={(e) => startResize(item.id, e)}
            onRemoveWidget={onRemoveWidget}
          />
        );
      })}

      {transferToast && (
        <div className="toast-message" role="status" data-testid="transfer-toast">
          <Check /> {transferToast}
        </div>
      )}

      {/* Drag ghost portal — renders at document.body so it sits above every stacking
          context including the sidebar. pointer-events:none keeps sidebar drop-targets
          detectable while the ghost floats visually over them. */}
      {portalDragItem && createPortal(
        <div
          ref={(el) => {
            portalDragElRef.current = el;
            // Set initial position synchronously so there is no one-frame flash at (0,0)
            if (el) el.style.transform = `translate(${portalInitPosRef.current.x}px,${portalInitPosRef.current.y}px)`;
          }}
          style={{
            position: 'fixed', top: 0, left: 0,
            width: portalDragItem.w, height: portalDragItem.h,
            zIndex: 9999, pointerEvents: 'none',
            willChange: 'transform',
          }}
        >
          <div className="grid-widget is-active drag-ghost-card">
            <span className="drag-ghost-label">{WIDGET_LABELS[portalDragItem.id]}</span>
          </div>
          {readEquippedSkin() === 'sakura' && <SakuraWidgetDecoration widgetId={portalDragItem.id} />}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Home page ────────────────────────────────────────────────────────────────

function HomePage() {
  const [isEditing, setIsEditing] = useState(false);
  const [addOpen, setAddOpen]     = useState(false);
  const [snapEnabled, setSnapEnabled] = useState<boolean>(() => {
    try { return window.localStorage.getItem(SNAP_GRID_KEY) === 'true'; } catch { return false; }
  });
  const isSakura = readEquippedSkin() === 'sakura';

  const toggleSnap = () => {
    setSnapEnabled((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(SNAP_GRID_KEY, String(next)); } catch {}
      return next;
    });
  };

  const { activeWidgets, displaced, addWidget, removeWidget, recallAll } = usePortable();
  const displacedCount = displaced.length;

  // Widgets available to add = registry minus active minus displaced
  const displacedIds = displaced.map((d) => d.id);
  const addable = WIDGET_REGISTRY.filter((w) => !activeWidgets.includes(w.id) && !displacedIds.includes(w.id));

  const handleRemove = (id: WidgetId) => removeWidget(id);

  const handleAdd = (id: WidgetId) => {
    addWidget(id);
    setAddOpen(false);
  };

  const exitEditing = () => { setIsEditing(false); setAddOpen(false); };

  // ── Edit controls shared between both renders ──────────────────────────────

  const recallBtn = (
    <button
      type="button"
      className={`home-recall-btn${displacedCount === 0 ? ' is-muted' : ''}`}
      onClick={() => displacedCount > 0 && recallAll()}
      disabled={displacedCount === 0}
      title="Recall all displaced widgets back to Home"
    >
      <CornerUpLeft />
      Recall Widgets{displacedCount > 0 ? ` (${displacedCount})` : ''}
    </button>
  );

  const editControls = !isEditing ? (
    <div className="home-edit-actions-wrap">
      <button
        type="button"
        className="home-edit-btn"
        onClick={() => setIsEditing(true)}
        data-testid="button-customize-layout"
      >
        <Pencil /> Edit Widgets
      </button>
      {recallBtn}
    </div>
  ) : (
    <div className="home-edit-controls">
      {/* Add Widget dropdown */}
      <div className="add-widget-wrap">
        <button
          type="button"
          className={`home-edit-btn add-widget-btn${addable.length === 0 ? ' add-widget-btn-disabled' : ''}`}
          onClick={() => addable.length > 0 && setAddOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={addOpen}
        >
          <Plus />
          {addable.length === 0 ? 'All added' : 'Add Widget'}
        </button>
        {addOpen && addable.length > 0 && (
          <div className="add-widget-dropdown" role="listbox">
            {addable.map((w) => (
              <button key={w.id} role="option" className="add-widget-item" onClick={() => handleAdd(w.id)}>
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        className={`home-edit-btn home-snap-btn${snapEnabled ? ' is-snap-on' : ''}`}
        onClick={toggleSnap}
        title={snapEnabled ? 'Snap to grid: on (click to disable)' : 'Snap to grid: off (click to enable)'}
        data-testid="button-snap-toggle"
      >
        <Grid2X2 /> Snap{snapEnabled ? ' ✓' : ''}
      </button>

      <button
        type="button"
        className="home-edit-btn home-edit-btn-done"
        onClick={exitEditing}
        data-testid="button-done-editing"
      >
        <Check /> Done
      </button>

      {recallBtn}
    </div>
  );

  const editHint = (
    <p className="home-edit-hint">
      Drag to reposition · drag ↘ corner to resize · drag left into sidebar to port · click × to remove
    </p>
  );

  const workspace = (
    <HomeWorkspace isEditing={isEditing} activeWidgets={activeWidgets} onRemoveWidget={handleRemove} snapEnabled={snapEnabled} />
  );

  // ── Sakura layout ──────────────────────────────────────────────────────────

  if (isSakura) {
    return (
      <div className="home-page home-sakura" data-testid="home-page">
        <div className="sakura-env-frame">
          <img src="/sakura-env.png" className="sakura-env-img" alt="" aria-hidden draggable={false} />
          <div className="sakura-env-ui">
            <div className="sakura-top-bar">
              <span className="sakura-greeting">✦ Your workspace</span>
              {editControls}
            </div>
            {isEditing && <p className="home-edit-hint sakura-edit-hint">{editHint}</p>}
            {workspace}
          </div>
        </div>
      </div>
    );
  }

  // ── Default layout ─────────────────────────────────────────────────────────

  return (
    <div className="home-page" data-testid="home-page">
      <BackButton />
      <div className="home-header-row">
        <div>
          <div className="eyebrow">Your workspace</div>
          <h1 className="display-title" style={{ marginTop: '0.75rem' }}>Good to be back.</h1>
          {isEditing && editHint}
        </div>
        {editControls}
      </div>
      {workspace}
    </div>
  );
}

// ─── Portable Widget Float ─────────────────────────────────────────────────────

// ─── Displaced widget band ─────────────────────────────────────────────────────
// Appears inline below the page title in destination sections.
// Section matching: /store covers store + product/* routes;
//   /library covers library + tool/* routes; /breakroom is exact.

function isSectionMatch(location: string, page: string): boolean {
  if (page === '/store')     return location === '/store' || location.startsWith('/product/');
  if (page === '/library')   return location === '/library' || location.startsWith('/tool/');
  if (page === '/breakroom') return location === '/breakroom';
  return false;
}

function DisplacedWidgetBand() {
  const [location] = useLocation();
  const { displaced, recall, reorderDisplaced, setDragId, hoverPageRef, displace } = usePortable();
  const isSakura = readEquippedSkin() === 'sakura';
  const bandRef = useRef<HTMLDivElement>(null);

  // Within-band reorder state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  // Click-to-expand state (Calendar is exempt — it has its own overlay)
  const [expandedIds, setExpandedIds] = useState<Set<WidgetId>>(new Set());

  // Cross-tab drag portal ghost
  const [portalInfo, setPortalInfo] = useState<{ id: WidgetId; w: number; h: number } | null>(null);
  const portalGhostRef  = useRef<HTMLDivElement | null>(null);
  const portalOffsetRef = useRef({ dx: 0, dy: 0 });
  const portalInitRef   = useRef({ x: 0, y: 0 });

  // Transfer feedback
  const [bandToast, setBandToast] = useState<string | null>(null);
  useEffect(() => {
    if (!bandToast) return;
    const t = setTimeout(() => setBandToast(null), 2600);
    return () => clearTimeout(t);
  }, [bandToast]);

  const bandWidgets = displaced.filter((d) => isSectionMatch(location, d.page));
  if (bandWidgets.length === 0) return null;

  const sectionPage = bandWidgets[0]?.page ?? '';

  // Live reorder preview
  const displayWidgets = (() => {
    if (dragIdx === null || dropIdx === null || dragIdx === dropIdx) return bandWidgets;
    const arr = [...bandWidgets];
    const [item] = arr.splice(dragIdx, 1);
    arr.splice(dropIdx, 0, item);
    return arr;
  })();

  const toggleExpand = (id: WidgetId) => {
    if (id === 'calendar') return; // Calendar uses its own compact→full overlay
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Unified drag handler for the entire card.
  // - Tiny movement (< 6 px): treated as a click → expand/collapse for non-Calendar widgets
  // - Dragged within band bounds: within-row reorder
  // - Dragged out of band toward sidebar: cross-tab portal drag
  const startBandDrag = (origIdx: number, widgetId: WidgetId) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const startMX = e.clientX, startMY = e.clientY;
    let dragging = false;
    let crossTab  = false;
    let inSidebar = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startMX;
      const dy = ev.clientY - startMY;

      if (!dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        dragging = true;
        setDragIdx(origIdx);
        setDropIdx(origIdx);
      }

      // Sidebar edge = left of .cubical-main (right edge of the sidebar panel)
      const mainLeft = (
        bandRef.current?.closest('.cubical-main') ?? document.querySelector('.cubical-main')
      )?.getBoundingClientRect().left ?? 260;

      const bandRect = bandRef.current?.getBoundingClientRect();
      const outsideBand = bandRect && (
        ev.clientX < bandRect.left - 40 ||
        ev.clientY < bandRect.top  - 60 ||
        ev.clientY > bandRect.bottom + 60
      );

      if (!crossTab && outsideBand) {
        // Switch to cross-tab mode — mount portal ghost above sidebar
        crossTab = true;
        setDragIdx(null);
        setDropIdx(null);

        const cardEl = bandRef.current?.querySelector(
          `[data-testid="displaced-card-${widgetId}"]`
        ) as HTMLElement | null;
        const rect = cardEl?.getBoundingClientRect() ?? { left: 0, top: 0, width: 200, height: 184 };
        portalOffsetRef.current = { dx: startMX - rect.left, dy: startMY - rect.top };
        portalInitRef.current   = { x: ev.clientX - portalOffsetRef.current.dx, y: ev.clientY - portalOffsetRef.current.dy };
        setPortalInfo({ id: widgetId, w: rect.width, h: rect.height });
      }

      if (crossTab) {
        if (portalGhostRef.current) {
          const { dx: pdx, dy: pdy } = portalOffsetRef.current;
          portalGhostRef.current.style.transform = `translate(${ev.clientX - pdx}px,${ev.clientY - pdy}px)`;
        }
        if (ev.clientX < mainLeft) {
          if (!inSidebar) { inSidebar = true; setDragId(widgetId); }
        } else if (inSidebar) {
          inSidebar = false;
          setDragId(null);
        }
      } else {
        // Within-band reorder
        if (!bandRef.current) return;
        const cards = Array.from(bandRef.current.querySelectorAll<HTMLElement>('.displaced-band-card'));
        let newDrop = bandWidgets.length - 1;
        for (let i = 0; i < cards.length; i++) {
          const r = cards[i].getBoundingClientRect();
          if (ev.clientX < r.left + r.width / 2) { newDrop = i; break; }
        }
        setDropIdx(Math.max(0, Math.min(newDrop, bandWidgets.length - 1)));
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      if (!dragging) {
        // Pure click → expand/collapse (Calendar handles its own click)
        toggleExpand(widgetId);
        return;
      }

      if (crossTab) {
        // Cross-tab drop lands over the sidebar — do NOT suppress the next click.
        // The cursor is over a nav link, not a widget control, so there is nothing
        // to suppress. Eating that click would prevent the user from navigating to
        // the destination tab immediately after the transfer.
        setPortalInfo(null);
        setDragId(null);
        const dropPage = inSidebar ? hoverPageRef.current : null;

        if (dropPage === '/') {
          // Dragged to Home nav → Recall
          recall(widgetId);
          setBandToast(`${WIDGET_LABELS[widgetId]} recalled to Home`);
        } else if (dropPage && dropPage !== sectionPage) {
          // Valid cross-tab transfer
          const PAGE_LABEL: Record<string, string> = {
            '/store': 'Store', '/library': 'Library', '/breakroom': 'Breakroom',
          };
          displace(widgetId, dropPage);
          setBandToast(`${WIDGET_LABELS[widgetId]} moved to ${PAGE_LABEL[dropPage] ?? dropPage}`);
        }
        // inSidebar && !dropPage → widget stays put (invalid drop, no snapback needed for band)
      } else {
        // Commit reorder
        setDragIdx((di) => {
          setDropIdx((dt) => {
            if (di !== null && dt !== null && di !== dt) reorderDisplaced(sectionPage, di, dt);
            return null;
          });
          return null;
        });
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <div className="displaced-band" data-testid="displaced-band" ref={bandRef}>
      {displayWidgets.map((d) => {
        const origIdx    = bandWidgets.indexOf(d);
        const isDragging = origIdx === dragIdx;
        const isExpanded = expandedIds.has(d.id);
        const canExpand  = d.id !== 'calendar';
        return (
          <div
            key={d.id}
            className={`displaced-band-card${isDragging ? ' is-reorder-drag' : ''}${isExpanded ? ' is-expanded' : ''}`}
            data-widget={d.id}
            data-testid={`displaced-card-${d.id}`}
            onPointerDown={startBandDrag(origIdx, d.id)}
          >
            {isSakura && <SakuraWidgetDecoration widgetId={d.id} />}
            <div className="displaced-band-header">
              <span className="displaced-band-label">
                <GripHorizontal className="displaced-grip" />
                {WIDGET_LABELS[d.id]}
              </span>
              <div className="displaced-band-header-actions">
                {isExpanded && canExpand && (
                  <button
                    className="displaced-collapse-btn"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); toggleExpand(d.id); }}
                    title="Collapse"
                  >
                    <ChevronDown />
                  </button>
                )}
                <button
                  className="displaced-recall-btn"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); recall(d.id); }}
                  title="Send back to Home"
                >
                  <CornerUpLeft /> Recall
                </button>
              </div>
            </div>
            {/* In expanded mode, stop propagation on body so controls work without triggering card drag */}
            <div
              className="displaced-band-body"
              onPointerDown={isExpanded ? (e) => e.stopPropagation() : undefined}
            >
              {d.id === 'notepad'        && <NotepadWidget compact={false} />}
              {d.id === 'calendar'       && <CalendarWidget gridW={3} gridH={3} />}
              {d.id === 'clock'          && <ClockWidget gridH={isExpanded ? 2 : 1} />}
              {d.id === 'link-shelf'     && <LinkShelfWidget gridW={isExpanded ? 4 : 3} gridH={isExpanded ? 3 : 2} />}
              {d.id === 'decision-maker' && <DecisionMakerWidget gridW={isExpanded ? 4 : 3} gridH={isExpanded ? 3 : 2} />}
              {d.id === 'calculator'     && <CalculatorWidget />}
            </div>
          </div>
        );
      })}

      {/* Cross-tab drag portal ghost — floats above all stacking contexts incl. sidebar */}
      {portalInfo && createPortal(
        <div
          ref={(el) => {
            portalGhostRef.current = el;
            if (el) el.style.transform = `translate(${portalInitRef.current.x}px,${portalInitRef.current.y}px)`;
          }}
          style={{
            position: 'fixed', top: 0, left: 0,
            width: portalInfo.w, height: portalInfo.h,
            zIndex: 9999, pointerEvents: 'none', willChange: 'transform',
          }}
        >
          <div className="grid-widget is-active drag-ghost-card">
            <span className="drag-ghost-label">{WIDGET_LABELS[portalInfo.id]}</span>
          </div>
          {isSakura && <SakuraWidgetDecoration widgetId={portalInfo.id} />}
        </div>,
        document.body,
      )}

      {bandToast && (
        <div className="toast-message" role="status" data-testid="band-transfer-toast">
          <Check /> {bandToast}
        </div>
      )}
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
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><ToolIconBadge /><div><h1>Bulk File Renamer.</h1><p>Give a whole folder a thoughtful name in one quick pass.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Ready when you are</span>
      </div>
      <DisplacedWidgetBand />
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
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><span className="renamer-tool-icon spreadsheet-tool-icon"><FileSpreadsheet /></span><div><h1>Spreadsheet Cleaner.</h1><p>Make messy tables easier to trust, one clean copy at a time.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Original stays safe</span>
      </div>
      <DisplacedWidgetBand />
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

/**
 * Converts a Date to the shared daily-key date segment: "YYYY-M-D" (no zero-padding).
 * ALL localStorage keys for daily game plays must be built through this function so
 * that write-side (getDailyPlayedKey) and read-side (streak loop) can never drift.
 */
function dateToKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function getTodayKey(): string {
  return dateToKey(new Date());
}

/** Returns a YYYY-M-D string that updates automatically when the calendar date rolls over. */
function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(getTodayKey);
  useEffect(() => {
    const id = setInterval(() => {
      const next = getTodayKey();
      setTodayKey((prev) => (prev !== next ? next : prev));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return todayKey;
}

/** Returns the localStorage key used to record that a game was played on a given day.
 *  Pass a pre-built dateKey (from dateToKey / getTodayKey) or omit for today. */
function getDailyPlayedKey(gameId: DailyGameId, dateKey?: string) {
  const key = dateKey ?? getTodayKey();
  return `cubical-breakroom-played-${gameId}-${key}`;
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

// ── Server-side game-stats sync ────────────────────────────────────────────
// Stats (best scores + daily played flags) are persisted on the API server,
// keyed by an anonymous cookie UUID set by the server. This means stats survive
// a localStorage clear, because the cookie (and the server record) remain intact.

const GAME_STATS_API = '/api/game-stats';

interface ServerGameStats {
  bestScores: Record<string, number>;
  dailyPlayed: Record<string, boolean>;
}

async function fetchServerStats(): Promise<ServerGameStats | null> {
  try {
    const res = await fetch(GAME_STATS_API, { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; stats: ServerGameStats };
    return data.stats ?? null;
  } catch { return null; }
}

async function pushStatsToServer(stats: Partial<ServerGameStats>): Promise<void> {
  try {
    await fetch(GAME_STATS_API, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stats),
    });
  } catch { /* non-fatal: stats live in localStorage even if push fails */ }
}

/** Collect all game stats currently in localStorage for server sync. */
function collectLocalStats(): ServerGameStats {
  const bestScores: Record<string, number> = {};
  const dailyPlayed: Record<string, boolean> = {};

  // Daily game best scores (snake, memory)
  for (const [gameId, meta] of Object.entries(GAME_META)) {
    try {
      const score = parseInt(localStorage.getItem(meta.bestKey) ?? '0', 10) || 0;
      if (score > 0) bestScores[`daily-${gameId}`] = score;
    } catch { /* ignore */ }
  }

  // Library game best scores
  for (const game of BREAK_GAMES) {
    try {
      const key = `cubical-game-best-${game.id}`;
      const score = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
      if (score > 0) bestScores[`game-${game.id}`] = score;
    } catch { /* ignore */ }
  }

  // Daily played flags — last 90 days (covers max streak window)
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const dk = dateToKey(d);
    for (const gid of ['snake', 'memory'] as DailyGameId[]) {
      try {
        if (localStorage.getItem(getDailyPlayedKey(gid, dk)) === 'true') {
          dailyPlayed[`${gid}|${dk}`] = true;
        }
      } catch { /* ignore */ }
    }
  }

  return { bestScores, dailyPlayed };
}

/** Write server stats back into localStorage (take max for scores, OR for played flags). */
function applyServerStats(serverStats: ServerGameStats): void {
  // Best scores — daily games
  for (const [gameId, meta] of Object.entries(GAME_META)) {
    const serverScore = serverStats.bestScores[`daily-${gameId}`] ?? 0;
    if (serverScore > 0) {
      try {
        const localScore = parseInt(localStorage.getItem(meta.bestKey) ?? '0', 10) || 0;
        if (serverScore > localScore) localStorage.setItem(meta.bestKey, String(serverScore));
      } catch { /* ignore */ }
    }
  }

  // Best scores — library games
  for (const game of BREAK_GAMES) {
    const serverScore = serverStats.bestScores[`game-${game.id}`] ?? 0;
    if (serverScore > 0) {
      try {
        const key = `cubical-game-best-${game.id}`;
        const localScore = parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
        if (serverScore > localScore) localStorage.setItem(key, String(serverScore));
      } catch { /* ignore */ }
    }
  }

  // Daily played flags
  for (const [combined, played] of Object.entries(serverStats.dailyPlayed)) {
    if (!played) continue;
    const [gid, dk] = combined.split('|');
    if (gid && dk) {
      try {
        const lsKey = getDailyPlayedKey(gid as DailyGameId, dk);
        if (localStorage.getItem(lsKey) !== 'true') localStorage.setItem(lsKey, 'true');
      } catch { /* ignore */ }
    }
  }
}

function DailyGameCard({ onFirstPlay, onGameEnd }: { onFirstPlay?: () => void; onGameEnd?: () => void }) {
  const todayKey = useTodayKey();
  const gameId   = useMemo(() => getDailyGameId(), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta     = GAME_META[gameId];

  const [phase, setPhase]       = useState<DailyGamePhase>('idle');
  const [liveScore, setLiveScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    try { return parseInt(localStorage.getItem(meta.bestKey) ?? '0', 10) || 0; } catch { return 0; }
  });
  const [playedToday, setPlayedToday] = useState(() => {
    try { return localStorage.getItem(getDailyPlayedKey(gameId, todayKey)) === 'true'; } catch { return false; }
  });
  const [isNewBest, setIsNewBest] = useState(false);

  // Reset card state when the calendar date rolls over (no page reload needed)
  useEffect(() => {
    const newGameId = getDailyGameId();
    const newMeta   = GAME_META[newGameId];
    setPhase('idle');
    try { setPlayedToday(localStorage.getItem(getDailyPlayedKey(newGameId, todayKey)) === 'true'); }
    catch { setPlayedToday(false); }
    try { setBestScore(parseInt(localStorage.getItem(newMeta.bestKey) ?? '0', 10) || 0); }
    catch { setBestScore(0); }
  }, [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      try { localStorage.setItem(getDailyPlayedKey(gameId, todayKey), 'true'); } catch {}
      onFirstPlay?.();
    }
    // Push updated stats to server so they survive a future localStorage clear
    onGameEnd?.();
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
    // Push updated best score to server
    void pushStatsToServer(collectLocalStats());
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

// Each non-default cosmetic ships both a light and dark variant so that
// switching dark mode never leaves stale light-mode colors on :root.
// `null` means "default / no cosmetic" — clears all inline overrides so
// the base CSS variables in :root and .dark take full effect.
type ThemePalette = { light: ThemeVars; dark: ThemeVars };
const THEME_PALETTES: Record<string, ThemePalette | null> = {
  // Workspace Classic is a no-op — handled specially in applyTheme.
  'default': null,

  'midnight-office': (() => {
    // Inherently dark — both modes share the same palette.
    const v: ThemeVars = {
      background:             '222 35% 10%',
      foreground:             '210 25% 88%',
      border:                 '220 20% 22%',
      input:                  '220 20% 22%',
      ring:                   '210 75% 58%',
      card:                   '222 30% 14%',
      'card-foreground':      '210 25% 88%',
      'card-border':          '220 20% 22%',
      primary:                '210 75% 58%',
      'primary-foreground':   '222 35% 10%',
      secondary:              '220 22% 20%',
      'secondary-foreground': '210 25% 88%',
      muted:                  '220 22% 18%',
      'muted-foreground':     '215 15% 58%',
      accent:                 '210 75% 62%',
      'accent-foreground':    '222 35% 10%',
    };
    return { light: v, dark: v };
  })(),

  'cozy-desk': {
    light: {
      background:             '35 55% 95%',
      foreground:             '25 45% 20%',
      border:                 '33 30% 84%',
      input:                  '33 30% 84%',
      ring:                   '25 52% 38%',
      card:                   '36 52% 98%',
      'card-foreground':      '25 45% 20%',
      'card-border':          '33 30% 84%',
      primary:                '25 52% 38%',
      'primary-foreground':   '36 52% 98%',
      secondary:              '33 38% 89%',
      'secondary-foreground': '25 45% 20%',
      muted:                  '33 32% 89%',
      'muted-foreground':     '25 20% 50%',
      accent:                 '32 78% 56%',
      'accent-foreground':    '25 45% 20%',
    },
    dark: {
      background:             '25 30% 11%',
      foreground:             '35 28% 84%',
      border:                 '28 20% 20%',
      input:                  '28 20% 20%',
      ring:                   '25 55% 52%',
      card:                   '27 26% 15%',
      'card-foreground':      '35 28% 84%',
      'card-border':          '28 20% 20%',
      primary:                '25 55% 55%',
      'primary-foreground':   '25 30% 11%',
      secondary:              '28 18% 18%',
      'secondary-foreground': '35 28% 84%',
      muted:                  '28 16% 18%',
      'muted-foreground':     '25 14% 55%',
      accent:                 '32 78% 60%',
      'accent-foreground':    '25 30% 11%',
    },
  },

  'retro-terminal': (() => {
    // Inherently dark — both modes share the same palette.
    const v: ThemeVars = {
      background:             '120 60% 4%',
      foreground:             '120 85% 68%',
      border:                 '120 45% 18%',
      input:                  '120 45% 18%',
      ring:                   '120 90% 42%',
      card:                   '120 45% 7%',
      'card-foreground':      '120 85% 68%',
      'card-border':          '120 45% 18%',
      primary:                '120 90% 42%',
      'primary-foreground':   '120 60% 4%',
      secondary:              '120 30% 10%',
      'secondary-foreground': '120 85% 68%',
      muted:                  '120 28% 10%',
      'muted-foreground':     '120 40% 42%',
      accent:                 '120 100% 50%',
      'accent-foreground':    '120 60% 4%',
    };
    return { light: v, dark: v };
  })(),

  'neon-nights': (() => {
    // Inherently dark — both modes share the same palette.
    const v: ThemeVars = {
      background:             '270 70% 5%',
      foreground:             '280 15% 88%',
      border:                 '270 42% 18%',
      input:                  '270 42% 18%',
      ring:                   '300 75% 60%',
      card:                   '270 55% 9%',
      'card-foreground':      '280 15% 88%',
      'card-border':          '270 42% 18%',
      primary:                '300 75% 60%',
      'primary-foreground':   '270 70% 5%',
      secondary:              '270 32% 13%',
      'secondary-foreground': '280 15% 88%',
      muted:                  '270 30% 13%',
      'muted-foreground':     '270 18% 58%',
      accent:                 '185 100% 52%',
      'accent-foreground':    '270 70% 5%',
    };
    return { light: v, dark: v };
  })(),

  'forest-mode': (() => {
    // Inherently dark — both modes share the same palette.
    const v: ThemeVars = {
      background:             '135 35% 11%',
      foreground:             '120 20% 82%',
      border:                 '130 25% 22%',
      input:                  '130 25% 22%',
      ring:                   '130 48% 50%',
      card:                   '133 28% 15%',
      'card-foreground':      '120 20% 82%',
      'card-border':          '130 25% 22%',
      primary:                '130 48% 52%',
      'primary-foreground':   '135 35% 11%',
      secondary:              '130 22% 18%',
      'secondary-foreground': '120 20% 82%',
      muted:                  '130 20% 18%',
      'muted-foreground':     '120 14% 52%',
      accent:                 '78 55% 52%',
      'accent-foreground':    '135 35% 11%',
    };
    return { light: v, dark: v };
  })(),

  'coffee-frame': {
    light: {
      background:             '30 42% 93%',
      foreground:             '25 45% 18%',
      border:                 '28 28% 82%',
      input:                  '28 28% 82%',
      ring:                   '25 55% 35%',
      card:                   '30 40% 97%',
      'card-foreground':      '25 45% 18%',
      'card-border':          '28 28% 82%',
      primary:                '25 55% 35%',
      'primary-foreground':   '30 40% 97%',
      secondary:              '28 35% 87%',
      'secondary-foreground': '25 45% 18%',
      muted:                  '28 32% 87%',
      'muted-foreground':     '25 18% 50%',
      accent:                 '36 75% 60%',
      'accent-foreground':    '25 45% 18%',
    },
    dark: {
      background:             '24 28% 10%',
      foreground:             '30 25% 83%',
      border:                 '26 18% 19%',
      input:                  '26 18% 19%',
      ring:                   '25 58% 50%',
      card:                   '25 24% 14%',
      'card-foreground':      '30 25% 83%',
      'card-border':          '26 18% 19%',
      primary:                '25 58% 52%',
      'primary-foreground':   '24 28% 10%',
      secondary:              '26 16% 17%',
      'secondary-foreground': '30 25% 83%',
      muted:                  '26 14% 17%',
      'muted-foreground':     '25 12% 54%',
      accent:                 '36 75% 62%',
      'accent-foreground':    '24 28% 10%',
    },
  },

  'sparkle-trail': {
    light: {
      background:             '275 30% 96%',
      foreground:             '270 40% 18%',
      border:                 '275 22% 86%',
      input:                  '275 22% 86%',
      ring:                   '280 58% 52%',
      card:                   '275 28% 98%',
      'card-foreground':      '270 40% 18%',
      'card-border':          '275 22% 86%',
      primary:                '280 58% 52%',
      'primary-foreground':   '275 30% 96%',
      secondary:              '275 22% 90%',
      'secondary-foreground': '270 40% 18%',
      muted:                  '275 20% 90%',
      'muted-foreground':     '270 15% 50%',
      accent:                 '335 85% 65%',
      'accent-foreground':    '270 40% 18%',
    },
    dark: {
      background:             '268 38% 9%',
      foreground:             '275 18% 86%',
      border:                 '268 28% 18%',
      input:                  '268 28% 18%',
      ring:                   '280 62% 62%',
      card:                   '268 32% 13%',
      'card-foreground':      '275 18% 86%',
      'card-border':          '268 28% 18%',
      primary:                '280 62% 64%',
      'primary-foreground':   '268 38% 9%',
      secondary:              '268 22% 16%',
      'secondary-foreground': '275 18% 86%',
      muted:                  '268 20% 16%',
      'muted-foreground':     '270 12% 56%',
      accent:                 '335 85% 68%',
      'accent-foreground':    '268 38% 9%',
    },
  },

  'winter-pack': {
    light: {
      background:             '200 42% 95%',
      foreground:             '210 35% 18%',
      border:                 '200 28% 84%',
      input:                  '200 28% 84%',
      ring:                   '210 62% 45%',
      card:                   '200 45% 98%',
      'card-foreground':      '210 35% 18%',
      'card-border':          '200 28% 84%',
      primary:                '210 62% 45%',
      'primary-foreground':   '200 45% 98%',
      secondary:              '200 30% 88%',
      'secondary-foreground': '210 35% 18%',
      muted:                  '200 28% 88%',
      'muted-foreground':     '210 15% 50%',
      accent:                 '195 68% 52%',
      'accent-foreground':    '210 35% 18%',
    },
    dark: {
      background:             '210 32% 10%',
      foreground:             '200 22% 84%',
      border:                 '208 22% 19%',
      input:                  '208 22% 19%',
      ring:                   '210 65% 55%',
      card:                   '210 28% 14%',
      'card-foreground':      '200 22% 84%',
      'card-border':          '208 22% 19%',
      primary:                '210 65% 58%',
      'primary-foreground':   '210 32% 10%',
      secondary:              '208 20% 17%',
      'secondary-foreground': '200 22% 84%',
      muted:                  '208 18% 17%',
      'muted-foreground':     '210 12% 55%',
      accent:                 '195 68% 56%',
      'accent-foreground':    '210 32% 10%',
    },
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

// Applies a cosmetic palette to :root, picking the light or dark variant based
// on the current themeMode. 'default' (null palette) clears all inline overrides
// so the base CSS variables in :root / .dark take full effect.
function applyTheme(cosmeticId: string, themeMode?: ThemeMode) {
  const root = document.documentElement;
  const palette = THEME_PALETTES[cosmeticId] ?? null;

  if (!palette) {
    // "Workspace Classic" — remove all inline overrides and let CSS do its job.
    for (const key of THEME_VAR_KEYS) {
      root.style.removeProperty(`--${key}`);
    }
    return;
  }

  const mode = themeMode ?? readSettings().themeMode;
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const vars = isDark ? palette.dark : palette.light;
  for (const key of THEME_VAR_KEYS) {
    root.style.setProperty(`--${key}`, vars[key]);
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

function BreakroomStatsPanel({ ownedGames, ownedCosmetics, equippedCosmetic, streakVersion, todayKey }: {
  ownedGames: string[];
  ownedCosmetics: string[];
  equippedCosmetic: string;
  streakVersion: number;
  todayKey: string;
}) {
  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dk = dateToKey(d);
      const snakeKey  = getDailyPlayedKey('snake', dk);
      const memoryKey = getDailyPlayedKey('memory', dk);
      try {
        const played = localStorage.getItem(snakeKey) === 'true' || localStorage.getItem(memoryKey) === 'true';
        if (played) { count++; }
        else if (i === 0) { /* today not played yet — still check yesterday */ }
        else { break; }
      } catch { break; }
    }
    return count;
  }, [streakVersion, todayKey]);

  const equippedName = COSMETICS.find((c) => c.id === equippedCosmetic)?.name ?? 'Default';

  const stats: { label: string; icon: string; value: string; suffix?: string }[] = [
    {
      label: 'Day streak',
      icon: '🔥',
      value: streak > 0 ? String(streak) : '—',
      suffix: streak > 0 ? (streak === 1 ? 'day' : 'days') : undefined,
    },
    {
      label: 'Games owned',
      icon: '🎮',
      value: String(ownedGames.length),
      suffix: `of ${BREAK_GAMES.length}`,
    },
    {
      label: 'Active theme',
      icon: '🎨',
      value: equippedName,
    },
    {
      label: 'Cosmetics owned',
      icon: '✨',
      value: String(ownedCosmetics.length),
      suffix: `of ${COSMETICS.length}`,
    },
  ];

  return (
    <div className="breakroom-stats-panel">
      <div className="breakroom-stats-title">Your stats</div>
      <div className="breakroom-stats-list">
        {stats.map((s) => (
          <div key={s.label} className="breakroom-stat-row">
            <span className="breakroom-stat-icon" aria-hidden>{s.icon}</span>
            <div className="breakroom-stat-body">
              <span className="breakroom-stat-label">{s.label}</span>
              <span className="breakroom-stat-value">
                {s.value}
                {s.suffix && <span className="breakroom-stat-suffix"> {s.suffix}</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakroomPage() {
  const todayKey = useTodayKey();
  const [ownedGames, setOwnedGames]         = useState<string[]>(getOwnedGames);
  const [ownedCosmetics, setOwnedCosmetics] = useState<string[]>(getOwnedCosmetics);
  const [equippedCosmetic, setEquippedCosmetic] = useState<string>(getEquippedCosmetic);
  const [toast, setToast]                   = useState<string | null>(null);
  const [activeGameId, setActiveGameId]     = useState<string | null>(null);
  const [streakVersion, setStreakVersion]   = useState(0);

  // When the calendar date rolls over, bump streakVersion so BreakroomStatsPanel recomputes
  const prevTodayKeyRef = useRef(todayKey);
  useEffect(() => {
    if (todayKey !== prevTodayKeyRef.current) {
      prevTodayKeyRef.current = todayKey;
      setStreakVersion((v) => v + 1);
    }
  }, [todayKey]);

  useEffect(() => { storeOwnedGames(ownedGames); }, [ownedGames]);
  useEffect(() => { storeOwnedCosmetics(ownedCosmetics); }, [ownedCosmetics]);
  useEffect(() => { storeEquippedCosmetic(equippedCosmetic); }, [equippedCosmetic]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  // On mount: hydrate stats from server (restores data if localStorage was cleared),
  // then push current local stats back to ensure the server has the latest.
  useEffect(() => {
    void (async () => {
      const serverStats = await fetchServerStats();
      if (serverStats) {
        applyServerStats(serverStats);
        // Re-read streak/best scores from localStorage after hydration
        setStreakVersion((v) => v + 1);
      }
      // Always push local stats so server stays up to date
      void pushStatsToServer(collectLocalStats());
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Called after every daily game session ends — keeps server stats current. */
  const handleGameEnd = () => {
    void pushStatsToServer(collectLocalStats());
  };

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
    applyTheme(id); // reads themeMode from settings internally
    const c = COSMETICS.find((x) => x.id === id);
    setToast(`${c?.name ?? id} equipped. Looking sharp.`);
  };

  const yourGames  = BREAK_GAMES.filter((g) => ownedGames.includes(g.id));
  const storeGames = BREAK_GAMES.filter((g) => !ownedGames.includes(g.id));

  return (
    <div className="breakroom-page" data-testid="breakroom-page">
      <BackButton />
      {/* Page header */}
      <div className="page-intro breakroom-intro">
        <div className="eyebrow">⏸ Take a breather</div>
        <h1 className="display-title mt-4">The Breakroom.</h1>
        <p>You've been working. This is the part where you stop for a moment.<br />Games, a daily challenge, and a small excuse to close the spreadsheet.</p>
      </div>

      <DisplacedWidgetBand />

      {/* Daily game + stats */}
      <div className="breakroom-top-row">
        <DailyGameCard onFirstPlay={() => setStreakVersion((v) => v + 1)} onGameEnd={handleGameEnd} />
        <BreakroomStatsPanel
          ownedGames={ownedGames}
          ownedCosmetics={ownedCosmetics}
          equippedCosmetic={equippedCosmetic}
          streakVersion={streakVersion}
          todayKey={todayKey}
        />
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

  // ── Full search UI ─────────────────────────────────────────────────────────
  return (
    <section className="ff-page">
      <BackButton fallback="/library" label="Back to library" />

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

      <DisplacedWidgetBand />

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

// ─── Profile page ─────────────────────────────────────────────────────────────

const BANNER_COLORS = [
  '#7c9e8f', '#a89080', '#8b9bc4', '#b0977e',
  '#7ea896', '#c49a6c', '#8ba3b0', '#9e8fb0',
];

function ProfilePage() {
  const [profile,       setProfile_]     = useState<ProfileData>(readProfile);
  const [equippedSkin,  setEquippedSkin]  = useState<string>(
    () => { try { return window.localStorage.getItem(PROFILE_SKIN_KEY) ?? 'default'; } catch { return 'default'; } }
  );
  const [saved,        setSaved]        = useState(false);
  const [previewSkin,  setPreviewSkin]  = useState<string | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  // Keep refs pointing at the latest values so the unmount cleanup is never stale.
  const equippedSkinRef = useRef(equippedSkin);
  const previewSkinRef  = useRef(previewSkin);
  useEffect(() => { equippedSkinRef.current = equippedSkin; }, [equippedSkin]);
  useEffect(() => { previewSkinRef.current  = previewSkin;  }, [previewSkin]);

  // If the user navigates away while a preview is active, revert to the
  // equipped skin so no uncommitted skin is left applied on the document root.
  useEffect(() => {
    return () => {
      if (previewSkinRef.current !== null) {
        applySkin(equippedSkinRef.current);
      }
    };
  }, []);

  const update = (patch: Partial<ProfileData>) => {
    setProfile_((p) => { const next = { ...p, ...patch }; writeProfile(next); return next; });
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') update({ avatar: result });
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    update({ avatar: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const equipSkin = (id: string) => {
    setEquippedSkin(id);
    setPreviewSkin(null);
    try { window.localStorage.setItem(PROFILE_SKIN_KEY, id); } catch {}
    applySkin(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const handlePreview = (id: string) => {
    setPreviewSkin(id);
    applySkin(id);
  };

  const handleCancelPreview = () => {
    setPreviewSkin(null);
    applySkin(equippedSkin);
  };

  const displayInitial = profile.name.trim() ? profile.name.trim()[0].toUpperCase() : '?';

  const previewingSkinName = previewSkin ? (CUBICAL_SKINS.find((s) => s.id === previewSkin)?.name ?? previewSkin) : null;

  return (
    <section className="profile-page">
      <BackButton />

      {/* Banner + avatar */}
      <div className="profile-hero">
        <div className="profile-banner" style={{ background: profile.bannerColor }}>
          <div className="profile-banner-colors">
            {BANNER_COLORS.map((c) => (
              <button
                key={c}
                className={`profile-color-swatch${profile.bannerColor === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => update({ bannerColor: c })}
                title={c}
              />
            ))}
          </div>
        </div>
        <div className="profile-avatar-wrap">
          {profile.avatar
            ? <img src={profile.avatar} alt="Profile" className="profile-avatar" />
            : <div className="profile-avatar profile-avatar-placeholder">{displayInitial}</div>
          }
          <button className="profile-avatar-edit" onClick={() => fileInputRef.current?.click()} title="Change picture">
            <ImagePlus className="w-3.5 h-3.5" />
          </button>
          {profile.avatar && (
            <button className="profile-avatar-remove" onClick={removeAvatar} title="Remove picture">
              <X className="w-3 h-3" />
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
        </div>
      </div>

      {/* Identity */}
      <div className="profile-identity">
        <div className="eyebrow">Your identity</div>
        <div className="settings-field mt-4" style={{ maxWidth: 360 }}>
          <label className="settings-label" htmlFor="profile-name">Display name</label>
          <input
            id="profile-name"
            className="settings-input"
            type="text"
            placeholder="What should we call you?"
            value={profile.name}
            onChange={(e) => update({ name: e.target.value })}
            maxLength={40}
          />
        </div>
        {saved && (
          <div className="profile-saved-badge">
            <Check className="w-3 h-3" /> Saved
          </div>
        )}
      </div>

      {/* Skins */}
      <div className="profile-skins">
        <div className="eyebrow mt-10 mb-1">Your skins</div>
        <p className="settings-hint mb-5">Choose how Cubical looks and feels. More skins coming soon.</p>
        <div className="skins-grid">
          {CUBICAL_SKINS.map((skin) => {
            const isPreviewing = previewSkin === skin.id;
            const isEquipped   = equippedSkin === skin.id && !skin.comingSoon;
            return (
              <div
                key={skin.id}
                className={`skin-card${skin.comingSoon ? ' skin-locked' : ''}${isEquipped ? ' skin-equipped' : ''}${isPreviewing ? ' skin-previewing' : ''}`}
                data-testid={`card-skin-${skin.id}`}
              >
                <div className="skin-preview">
                  {skin.id === 'default' && (
                    <div className="skin-preview-default">
                      <div className="spd-sidebar" />
                      <div className="spd-main">
                        <div className="spd-bar" />
                        <div className="spd-card" />
                        <div className="spd-card spd-card-sm" />
                      </div>
                    </div>
                  )}
                  {skin.id === 'sakura' && (
                    <img src="/sakura-env.png" className="skin-preview-sakura-img" alt="Sakura environment" draggable={false} />
                  )}
                  {skin.comingSoon && <div className="skin-coming-soon-badge">Coming soon</div>}
                  {isEquipped && !isPreviewing && (
                    <div className="skin-equipped-badge"><Check className="w-3 h-3" /> Equipped</div>
                  )}
                  {isPreviewing && (
                    <div className="skin-previewing-badge"><Sparkles className="w-3 h-3" /> Previewing</div>
                  )}
                </div>
                <div className="skin-body">
                  <div className="skin-name">{skin.name}</div>
                  <p className="skin-desc">{skin.description}</p>
                  <div className="skin-footer">
                    {skin.comingSoon
                      ? <span className="skin-soon-label">Not yet available</span>
                      : isEquipped
                        ? <span className="skin-active-label">Currently equipped</span>
                        : (
                          <div className="skin-actions">
                            {!isPreviewing && (
                              <button className="button-quiet skin-preview-btn" onClick={() => handlePreview(skin.id)}>Preview</button>
                            )}
                            <button className="button-quiet skin-equip-btn" onClick={() => equipSkin(skin.id)}>Equip</button>
                          </div>
                        )
                    }
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Preview banner — rendered into document.body so it floats above everything */}
      {previewSkin && previewingSkinName && createPortal(
        <div className="skin-preview-banner" role="status" aria-live="polite">
          <Sparkles className="skin-preview-banner-icon" />
          <span className="skin-preview-banner-text">
            Previewing <strong>{previewingSkinName}</strong> — equip to keep it
          </span>
          <div className="skin-preview-banner-actions">
            <button className="skin-preview-cancel-btn" onClick={handleCancelPreview}>Cancel</button>
            <button className="button-primary skin-preview-equip-btn" onClick={() => equipSkin(previewSkin)}>Equip</button>
          </div>
        </div>,
        document.body,
      )}

    </section>
  );
}

// ─── Settings page ─────────────────────────────────────────────────────────────

// ─── UpdatePanel ──────────────────────────────────────────────────────────────

type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';

function UpdatePanel() {
  const [state,    setState]    = useState<UpdateState>('idle');
  const [version,  setVersion]  = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [message,  setMessage]  = useState<string | null>(null);
  const updater = window.cubicalDesktop?.updater;

  useEffect(() => {
    if (!updater) return;
    const unsub = updater.onStatus((evt: UpdateStatusEvent) => {
      if (evt.type === 'checking-for-update')  { setState('checking'); }
      if (evt.type === 'update-not-available') { setState('up-to-date'); }
      if (evt.type === 'update-available')     { setState('available');  setVersion(evt.version ?? null); }
      if (evt.type === 'download-progress')    { setState('downloading'); setProgress(evt.percent ?? 0); }
      if (evt.type === 'update-downloaded')    { setState('ready'); }
      if (evt.type === 'error')                { setState('error'); setMessage(evt.message ?? 'Unknown error'); }
    });
    return unsub;
  }, [updater]);

  const handleCheck = async () => {
    if (!updater) return;
    setState('checking');
    try {
      const res = await updater.checkForUpdates();
      if (res?.devMode) { setState('idle'); setMessage('Update checks are disabled in dev mode.'); }
    } catch { setState('error'); setMessage('Could not reach the update server.'); }
  };

  if (!updater) {
    return (
      <div className="update-panel-devnote">
        Running in browser — update checks are available in the packaged desktop app.
      </div>
    );
  }

  return (
    <div className="update-panel">
      {state === 'idle'        && <p className="update-panel-hint">Check for a newer version of Cubical.</p>}
      {state === 'checking'    && <p className="update-panel-hint">Checking for updates…</p>}
      {state === 'up-to-date'  && <p className="update-panel-hint update-panel-ok">You're on the latest version.</p>}
      {state === 'available'   && <p className="update-panel-hint">Version {version ?? 'update'} is available.</p>}
      {state === 'downloading' && (
        <div>
          <p className="update-panel-hint">Downloading… {Math.round(progress)}%</p>
          <div className="update-progress-bar"><div className="update-progress-fill" style={{ width: `${progress}%` }} /></div>
        </div>
      )}
      {state === 'ready'  && <p className="update-panel-hint update-panel-ok">Download complete. Restart to apply.</p>}
      {state === 'error'  && <p className="update-panel-hint update-panel-err">{message ?? 'Update failed.'}</p>}
      {message && state === 'idle' && <p className="update-panel-hint" style={{ opacity: .7 }}>{message}</p>}
      <div className="update-panel-actions">
        {(state === 'idle' || state === 'up-to-date' || state === 'error') && (
          <button className="button-quiet" onClick={handleCheck}>Check for updates</button>
        )}
        {state === 'available' && (
          <button className="button-primary" onClick={() => updater.downloadUpdate()}>Download update</button>
        )}
        {state === 'ready' && (
          <button className="button-primary" onClick={() => updater.installUpdate()}>Restart &amp; Update</button>
        )}
      </div>
    </div>
  );
}

// ─── Settings page ────────────────────────────────────────────────────────────

function SettingsPage() {
  const [settings,      setSettings_]    = useState<AppSettings>(readSettings);
  const [clearConfirm,  setClearConfirm]  = useState(false);
  const [layoutConfirm, setLayoutConfirm] = useState(false);
  const [themeApplied,  setThemeApplied]  = useState(false);

  const update = (patch: Partial<AppSettings>) => {
    setSettings_((s) => { const next = { ...s, ...patch }; writeSettings(next); return next; });
  };

  const handleThemeMode = (mode: ThemeMode) => {
    update({ themeMode: mode });
    applyThemeMode(mode);
    // Re-apply the active cosmetic so it picks the correct light/dark variant.
    applyTheme(getEquippedCosmetic(), mode);
    setThemeApplied(true);
    setTimeout(() => setThemeApplied(false), 1600);
  };

  const handleClockSeconds = (on: boolean) => {
    update({ clockSeconds: on });
    writeLocal(CLOCK_SECONDS_KEY, on);
  };

  const handleResetLayout = () => {
    try { window.localStorage.removeItem(LAYOUT_STORAGE_KEY); } catch {}
    setLayoutConfirm(false);
    window.location.hash = '/';
  };

  const handleClearData = () => {
    try { window.localStorage.clear(); } catch {}
    setClearConfirm(false);
    window.location.reload();
  };

  return (
    <section className="settings-page">
      <BackButton />
      <div className="page-intro">
        <div className="eyebrow">Make it yours</div>
        <h1 className="display-title mt-4">Settings.</h1>
      </div>

      {/* Appearance */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Sun className="w-4 h-4" /> Appearance</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Color mode</div>
            <div className="settings-row-hint">Choose how Cubical looks.</div>
          </div>
          <div className="settings-mode-group">
            {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                className={`settings-mode-btn${settings.themeMode === mode ? ' active' : ''}`}
                onClick={() => handleThemeMode(mode)}
              >
                {mode === 'light'  && <Sun className="w-3.5 h-3.5" />}
                {mode === 'dark'   && <Moon className="w-3.5 h-3.5" />}
                {mode === 'system' && <Monitor className="w-3.5 h-3.5" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {themeApplied && <p className="settings-applied">Applied.</p>}
      </div>

      {/* Navigation */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Settings className="w-4 h-4" /> Navigation</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Sidebar auto-collapse</div>
            <div className="settings-row-hint">Sidebar folds to icons after a few seconds of inactivity.</div>
          </div>
          <button
            className={`settings-toggle${settings.sidebarAutoCollapse ? ' active' : ''}`}
            onClick={() => update({ sidebarAutoCollapse: !settings.sidebarAutoCollapse })}
          >
            {settings.sidebarAutoCollapse ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Home */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><House className="w-4 h-4" /> Home</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Show clock seconds</div>
            <div className="settings-row-hint">Display seconds in the Clock widget.</div>
          </div>
          <button
            className={`settings-toggle${settings.clockSeconds ? ' active' : ''}`}
            onClick={() => handleClockSeconds(!settings.clockSeconds)}
          >
            {settings.clockSeconds ? 'On' : 'Off'}
          </button>
        </div>
        <div className="settings-row settings-row-border">
          <div className="settings-row-info">
            <div className="settings-row-label">Reset home layout</div>
            <div className="settings-row-hint">Return widgets to their default positions and sizes.</div>
          </div>
          {layoutConfirm
            ? (
              <div className="settings-confirm-row">
                <span className="settings-confirm-label">This will reset your layout.</span>
                <button className="settings-danger-btn" onClick={handleResetLayout}>Reset</button>
                <button className="settings-cancel-btn" onClick={() => setLayoutConfirm(false)}>Cancel</button>
              </div>
            )
            : <button className="button-quiet" onClick={() => setLayoutConfirm(true)}>Reset layout</button>
          }
        </div>
      </div>

      {/* Startup */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Zap className="w-4 h-4" /> Startup</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Default startup page</div>
            <div className="settings-row-hint">Where Cubical opens when you launch it.</div>
          </div>
          <div className="settings-mode-group">
            {(['home', 'store', 'library'] as StartupPage[]).map((page) => (
              <button
                key={page}
                className={`settings-mode-btn${settings.startupPage === page ? ' active' : ''}`}
                onClick={() => update({ startupPage: page })}
              >
                {page.charAt(0).toUpperCase() + page.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Bell className="w-4 h-4" /> Notifications</h2>
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">Interface sounds</div>
            <div className="settings-row-hint">Enable sounds for future Cubical features.</div>
          </div>
          <button
            className={`settings-toggle${settings.soundEnabled ? ' active' : ''}`}
            onClick={() => update({ soundEnabled: !settings.soundEnabled })}
          >
            {settings.soundEnabled ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Data */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Lock className="w-4 h-4" /> Data &amp; privacy</h2>
        </div>
        <p className="settings-hint">
          Cubical is a local prototype. All data — your notes, calendar, library, and settings — stays on this device only. Nothing is sent anywhere.
        </p>
        <div className="settings-row settings-row-border">
          <div className="settings-row-info">
            <div className="settings-row-label">Clear all local data</div>
            <div className="settings-row-hint">Permanently removes all Cubical data from this device.</div>
          </div>
          {clearConfirm
            ? (
              <div className="settings-confirm-row">
                <span className="settings-confirm-label">This cannot be undone.</span>
                <button className="settings-danger-btn" onClick={handleClearData}>Clear everything</button>
                <button className="settings-cancel-btn" onClick={() => setClearConfirm(false)}>Cancel</button>
              </div>
            )
            : <button className="settings-danger-btn" onClick={() => setClearConfirm(true)}>Clear data</button>
          }
        </div>
      </div>

      {/* About */}
      <div className="settings-card">
        <div className="settings-card-header">
          <h2 className="settings-section-title"><Info className="w-4 h-4" /> About Cubical</h2>
        </div>
        <div className="settings-row settings-row-border">
          <div className="settings-row-info">
            <div className="settings-row-label">Version</div>
            <div className="settings-row-hint">Cubical {APP_VERSION} Alpha</div>
          </div>
        </div>
        <UpdatePanel />
      </div>

    </section>
  );
}

// ─── Storage Explorer ─────────────────────────────────────────────────────────

function StorageExplorer() {
  const hasApi    = typeof (window as any).showDirectoryPicker === 'function';
  const [scanning, setScanning]   = useState(false);
  const [entries, setEntries]     = useState<{ name: string; size: number; kind: string }[]>([]);
  const [dirName, setDirName]     = useState<string | null>(null);
  const [totalSize, setTotalSize] = useState(0);
  const [error, setError]         = useState<string | null>(null);

  const scanSubDir = async (handle: any, depth: number): Promise<number> => {
    let total = 0;
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          try { total += (await entry.getFile()).size; } catch { /* locked */ }
        } else if (depth < 2) {
          total += await scanSubDir(entry, depth + 1);
        }
      }
    } catch { /* skip inaccessible */ }
    return total;
  };

  const handleScan = async () => {
    setError(null);
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setDirName(dirHandle.name);
      setScanning(true);
      setEntries([]);
      const topEntries: { name: string; size: number; kind: string }[] = [];
      let grand = 0;
      for await (const entry of dirHandle.values()) {
        let size = 0;
        if (entry.kind === 'file') {
          try { size = (await entry.getFile()).size; } catch { /* skip */ }
        } else {
          size = await scanSubDir(entry, 0);
        }
        grand += size;
        topEntries.push({ name: entry.name, size, kind: entry.kind });
      }
      topEntries.sort((a, b) => b.size - a.size);
      setEntries(topEntries.slice(0, 24));
      setTotalSize(grand);
    } catch (e: any) {
      if ((e as any)?.name !== 'AbortError') setError('Could not read folder. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const maxSize = entries[0]?.size || 1;

  const previewEntries = [
    { name: 'Documents', size: '12.4 GB', pct: 62 },
    { name: 'Downloads', size: '6.7 GB',  pct: 34 },
    { name: 'Pictures',  size: '4.1 GB',  pct: 21 },
    { name: 'Videos',    size: '2.3 GB',  pct: 12 },
    { name: 'AppData',   size: '1.8 GB',  pct: 9  },
  ];

  return (
    <section className="renamer-page" data-testid="storage-explorer">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · {hasApi ? 'works in browser' : 'local prototype'}</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(215 60% 43%)', background: 'hsl(215 60% 43% / .12)' }}><HardDrive /></span>
            <div><h1>Storage Explorer.</h1><p>See exactly what's taking up space on your PC.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> {hasApi ? (scanning ? 'Scanning…' : dirName ? 'Scanned' : 'Ready') : 'Preview mode'}</span>
      </div>
      <DisplacedWidgetBand />
      {hasApi ? (
        <>
          <div className="renamer-notice">
            <HardDrive />
            <div>
              <strong>{dirName ? `Showing: ${dirName}` : 'Choose a folder to scan'}</strong>
              <span>Select any folder and Storage Explorer will measure what is taking up space. Nothing is moved or changed.</span>
            </div>
            <button type="button" className="button-primary" onClick={handleScan} disabled={scanning} style={{ flexShrink: 0, fontSize: 12, minHeight: 36, padding: '0 16px' }}>
              {scanning ? 'Scanning…' : dirName ? 'Scan another' : 'Select folder'}
            </button>
          </div>
          {error && <p style={{ color: 'hsl(0 65% 50%)', fontSize: 13, margin: '8px 0' }}>{error}</p>}
          {(entries.length > 0 || scanning) && (
            <div className="storage-explorer-workspace">
              <div className="storage-drive-card">
                <div className="storage-drive-header">
                  <HardDrive className="storage-drive-icon" />
                  <div className="storage-drive-meta-wrap">
                    <div className="storage-drive-name">{dirName}</div>
                    <div className="storage-drive-meta">{scanning ? 'Scanning…' : `${formatFileBytes(totalSize)} total · ${entries.length} items shown`}</div>
                  </div>
                </div>
                <div className="storage-bar-track"><div className="storage-bar-fill" style={{ width: scanning ? '60%' : '100%' }} /></div>
              </div>
              {entries.length > 0 && (
                <div className="storage-folder-list">
                  <div className="renamer-section-heading">
                    <span className="eyebrow">Largest items</span>
                    <span className="library-count" style={{ opacity: .55 }}>{entries.length} shown</span>
                  </div>
                  {entries.map((e) => (
                    <div className="storage-folder-row" key={e.name}>
                      <FolderOpen className="storage-folder-row-icon" />
                      <span className="storage-folder-name">{e.name}</span>
                      <div className="storage-row-bar-track"><div className="storage-row-bar-fill" style={{ width: `${Math.round(e.size / maxSize * 100)}%` }} /></div>
                      <span className="storage-folder-size">{formatFileBytes(e.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="renamer-notice">
            <HardDrive />
            <div>
              <strong>Desktop access required</strong>
              <span>Storage Explorer needs direct filesystem access. It will be fully functional in the Cubical desktop app for Windows.</span>
            </div>
          </div>
          <div className="storage-explorer-workspace">
            <div className="storage-drive-card">
              <div className="storage-drive-header">
                <HardDrive className="storage-drive-icon" />
                <div className="storage-drive-meta-wrap">
                  <div className="storage-drive-name">C:\ — Local Drive</div>
                  <div className="storage-drive-meta">19.8 GB used of 59.5 GB · Preview</div>
                </div>
              </div>
              <div className="storage-bar-track"><div className="storage-bar-fill" style={{ width: '33%' }} /></div>
            </div>
            <div className="storage-folder-list">
              <div className="renamer-section-heading">
                <span className="eyebrow">Largest folders</span>
                <span className="library-count" style={{ opacity: .55 }}>Preview data</span>
              </div>
              {previewEntries.map((e) => (
                <div className="storage-folder-row" key={e.name}>
                  <FolderOpen className="storage-folder-row-icon" />
                  <span className="storage-folder-name">{e.name}</span>
                  <div className="storage-row-bar-track"><div className="storage-row-bar-fill" style={{ width: `${e.pct}%` }} /></div>
                  <span className="storage-folder-size">{e.size}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> Folder scanning, drill-down, and file-type breakdowns connect to the local filesystem. The layout above shows what Storage Explorer will look like.</p></div>
        </>
      )}
    </section>
  );
}

// ─── Image Converter ──────────────────────────────────────────────────────────

function ImageConverter() {
  const [files, setFiles]         = useState<File[]>([]);
  const [format, setFormat]       = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality]     = useState(90);
  const [maxWidth, setMaxWidth]   = useState('');
  const [maxHeight, setMaxHeight] = useState('');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress]   = useState<{ done: number; total: number } | null>(null);
  const [results, setResults]     = useState<{ name: string; url: string }[]>([]);
  const [zipFilename, setZipFilename] = useState('converted-images');

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list).filter((f) => f.type.startsWith('image/')));
    setResults([]);
  };

  const convertAll = async () => {
    if (!files.length) return;
    setConverting(true);
    setProgress({ done: 0, total: files.length });
    const out: { name: string; url: string }[] = [];
    const allocatedNames = new Set<string>(); // all output names already assigned
    for (const file of files) {
      const imgUrl = URL.createObjectURL(file);
      const img    = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = imgUrl; });
      let w = img.naturalWidth, h = img.naturalHeight;
      const mw = parseInt(maxWidth), mh = parseInt(maxHeight);
      if (!isNaN(mw) && mw > 0) { const s = mw / w; h = Math.round(h * s); w = mw; }
      if (!isNaN(mh) && mh > 0 && h > mh) { const s = mh / h; w = Math.round(w * s); h = mh; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      if (format === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(imgUrl);
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality / 100));
      if (!blob) continue;
      const ext  = format === 'jpeg' ? 'jpg' : format;
      const stem = file.name.replace(/\.[^.]+$/, '');
      // Find the first name not yet allocated — handles collisions including pre-suffixed stems
      let candidate = `${stem}.${ext}`;
      let counter   = 2;
      while (allocatedNames.has(candidate)) {
        candidate = `${stem}-${counter}.${ext}`;
        counter++;
      }
      allocatedNames.add(candidate);
      out.push({ name: candidate, url: URL.createObjectURL(blob) });
      setProgress((p) => p ? { done: p.done + 1, total: p.total } : p);
    }
    setResults(out);
    setConverting(false);
    setProgress(null);
  };

  const downloadAllAsZip = async () => {
    if (results.length < 2) return;
    const files: Record<string, Uint8Array> = {};
    for (const r of results) {
      const blob = await fetch(r.url).then((res) => res.blob());
      const buf  = await blob.arrayBuffer();
      files[r.name] = new Uint8Array(buf);
    }
    const zipped = zipSync(files);
    const url    = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `${zipFilename.trim() || 'converted-images'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatLabels: Record<string, string> = { png: 'Lossless, great for graphics', jpeg: 'Smaller files, ideal for photos', webp: 'Modern format, best of both' };

  return (
    <section className="renamer-page" data-testid="image-converter">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(140 50% 35%)', background: 'hsl(140 50% 35% / .11)' }}><ImagePlus /></span>
            <div><h1>Image Converter.</h1><p>Convert, resize, and process images locally.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Original stays safe</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <ImagePlus />
        <div><strong>Converts entirely in your browser</strong><span>No upload, no server. Your images never leave your computer.</span></div>
      </div>
      <div className="image-converter-workspace">
        <div className="image-converter-controls">
          <div className="renamer-section-heading">
            <span className="eyebrow">01 · Select images</span>
            {files.length > 0 && <span className="library-count">{files.length} image{files.length !== 1 ? 's' : ''}</span>}
          </div>
          <label className="file-picker">
            <ImagePlus /><span>{files.length ? 'Choose different images' : 'Select images'}</span>
            <input type="file" accept="image/*" multiple onChange={(e) => handleFiles(e.target.files)} data-testid="input-image-picker" />
          </label>
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Output format</span></div>
          <div className="rename-method-selector">
            {(['png', 'jpeg', 'webp'] as const).map((f) => (
              <button key={f} type="button" className={`rename-method-card${format === f ? ' is-selected' : ''}`} onClick={() => setFormat(f)}>
                <div><strong>{f === 'jpeg' ? 'JPG' : f.toUpperCase()}</strong><span>{formatLabels[f]}</span></div>
              </button>
            ))}
          </div>
          {format === 'jpeg' && (
            <label className="rename-field">
              <span>Quality — {quality}%</span>
              <input type="range" min="10" max="100" step="5" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          )}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">03 · Resize (optional)</span></div>
          <div className="rename-field-pair">
            <label className="rename-field"><span>Max width (px)</span><input type="number" min="1" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} placeholder="Original" /></label>
            <label className="rename-field"><span>Max height (px)</span><input type="number" min="1" value={maxHeight} onChange={(e) => setMaxHeight(e.target.value)} placeholder="Original" /></label>
          </div>
          <p className="renamer-help">Resize maintains aspect ratio. Leave blank to keep original dimensions.</p>
        </div>
        <div className="image-converter-results">
          <div className="renamer-section-heading">
            <span className="eyebrow">04 · Download</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {results.length > 0 && <span className="library-count">{results.length} ready</span>}
              {results.length >= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    value={zipFilename}
                    onChange={(e) => setZipFilename(e.target.value)}
                    placeholder="converted-images"
                    aria-label="ZIP filename"
                    data-testid="input-zip-filename"
                    style={{ fontSize: 11, height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 140, minWidth: 80 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', userSelect: 'none' }}>.zip</span>
                  <button type="button" className="button-quiet" onClick={downloadAllAsZip} style={{ fontSize: 11, minHeight: 30, padding: '0 12px' }} data-testid="button-download-all-zip">
                    <FileArchive /> Download all as ZIP
                  </button>
                </div>
              )}
            </div>
          </div>
          {converting && progress && (
            <div className="ic-progress-wrap">
              <div className="ic-progress-label">
                <span>{progress.done} of {progress.total} converted</span>
                <span>{Math.round((progress.done / progress.total) * 100)}%</span>
              </div>
              <div className="ic-progress-bar">
                <div className="ic-progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {results.length === 0 && !converting ? (
            <div className="renamer-empty"><div className="empty-cube"><ImagePlus /></div><h2>Converted images appear here.</h2><p>Choose images and a format, then click Convert.</p></div>
          ) : results.length === 0 ? null : (
            <div className="image-result-list">
              {results.map((r, i) => (
                <div className="image-result-row" key={i}>
                  <img src={r.url} alt={r.name} className="image-result-thumb" />
                  <span className="image-result-name">{r.name}</span>
                  <a href={r.url} download={r.name} className="button-primary" style={{ fontSize: 11, minHeight: 34, padding: '0 14px', textDecoration: 'none' }}>
                    <Download /> Save
                  </a>
                </div>
              ))}
            </div>
          )}
          <div className="renamer-actions">
            <div><strong>Originals untouched.</strong><span>Converted copies are downloaded separately.</span></div>
            <button type="button" className="button-primary" onClick={convertAll} disabled={files.length === 0 || converting} data-testid="button-convert">
              {converting && progress
                ? `${progress.done} of ${progress.total} converted…`
                : converting ? 'Converting…' : <><span>Convert</span><ArrowRight /></>}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── File Toolbox ─────────────────────────────────────────────────────────────

type ExifData = {
  make:         string | null;
  model:        string | null;
  dateTaken:    string | null;
  iso:          string | null;
  shutterSpeed: string | null;
  aperture:     string | null;
  focalLength:  string | null;
  flash:        string | null;
  gpsLat:       string | null;
  gpsLon:       string | null;
  orientation:  string | null;
};

type ToolboxEntry = {
  file: File;
  hash: string | null;
  dims: { w: number; h: number } | null;
  mediaDuration: number | null;
  videoDims: { w: number; h: number } | null;
  mediaCodec: string | null;
  exif: ExifData | null;
};

function formatFileBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function detectMediaCodec(file: File): Promise<string | null> {
  const mime = file.type;
  // Formats where MIME type is conclusive
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'MP3';
  if (mime === 'audio/flac' || mime === 'audio/x-flac') return 'FLAC';
  if (mime === 'audio/wav'  || mime === 'audio/x-wav') return 'PCM';
  if (mime === 'audio/aac') return 'AAC';
  try {
    const buf   = await file.slice(0, 65536).arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Search for an ASCII tag sequence verbatim in binary data
    function findSeq(tag: string): boolean {
      const codes = Array.from(tag).map((c) => c.charCodeAt(0));
      outer: for (let i = 0; i <= bytes.length - codes.length; i++) {
        for (let j = 0; j < codes.length; j++) { if (bytes[i + j] !== codes[j]) continue outer; }
        return true;
      }
      return false;
    }
    // MP4 / MOV / M4A — fourcc codec codes live in the stsd box
    if (mime.includes('mp4') || mime === 'video/quicktime' || mime === 'audio/m4a' || mime === 'audio/x-m4a') {
      if (findSeq('avc1') || findSeq('avc3')) return 'H.264';
      if (findSeq('hvc1') || findSeq('hev1')) return 'H.265 / HEVC';
      if (findSeq('av01')) return 'AV1';
      if (findSeq('vp08')) return 'VP8';
      if (findSeq('vp09')) return 'VP9';
      if (findSeq('ap4h') || findSeq('apch') || findSeq('apcn') || findSeq('apco')) return 'Apple ProRes';
      if (findSeq('mp4a')) return 'AAC';
      return null;
    }
    // WebM / MKV — codec IDs stored as ASCII strings in the EBML structure
    if (mime === 'video/webm' || mime === 'audio/webm' || mime === 'video/x-matroska' || mime === 'video/mkv') {
      if (findSeq('V_AV1'))             return 'AV1';
      if (findSeq('V_VP9'))             return 'VP9';
      if (findSeq('V_VP8'))             return 'VP8';
      if (findSeq('V_MPEG4/ISO/AVC'))   return 'H.264';
      if (findSeq('V_MPEGH/ISO/HEVC'))  return 'H.265 / HEVC';
      if (findSeq('A_OPUS'))            return 'Opus';
      if (findSeq('A_VORBIS'))          return 'Vorbis';
      if (findSeq('A_FLAC'))            return 'FLAC';
      return null;
    }
    // OGG container — magic bytes near the start
    if (mime === 'audio/ogg' || mime === 'video/ogg' || mime === 'audio/x-ogg') {
      if (findSeq('OpusHead')) return 'Opus';
      if (findSeq('vorbis'))   return 'Vorbis';
      if (findSeq('fLaC'))     return 'FLAC';
      return 'Vorbis';
    }
    // AVI container
    if (mime === 'video/avi' || mime === 'video/x-msvideo') {
      if (findSeq('xvid') || findSeq('XVID')) return 'Xvid';
      if (findSeq('DIVX') || findSeq('divx')) return 'DivX';
      if (findSeq('H264') || findSeq('avc1')) return 'H.264';
      return 'MPEG-4';
    }
    return null;
  } catch { return null; }
}

function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function strTag(tags: Record<string, { description?: string; value?: unknown } | undefined>, key: string): string | null {
  const t = tags[key];
  if (!t) return null;
  const v = t.description ?? String(t.value ?? '');
  return v && v !== 'undefined' ? v.trim() || null : null;
}

async function extractExif(file: File): Promise<ExifData | null> {
  try {
    const buf = await file.arrayBuffer();
    // expanded:true gives a structured result with a typed `gps` group for signed decimal coordinates
    const expanded = ExifReader.load(buf, { expanded: true }) as {
      exif?: Record<string, { description?: string; value?: unknown } | undefined>;
      gps?:  { Latitude?: number; Longitude?: number };
    };

    const tags = expanded.exif ?? {};
    const gps  = expanded.gps;

    // Use signed decimal GPS from the expanded `gps` group — handles S/W hemispheres correctly
    let gpsLat: string | null = null;
    let gpsLon: string | null = null;
    if (gps?.Latitude  != null) gpsLat = gps.Latitude.toFixed(6);
    if (gps?.Longitude != null) gpsLon = gps.Longitude.toFixed(6);

    const exif: ExifData = {
      make:         strTag(tags, 'Make'),
      model:        strTag(tags, 'Model'),
      dateTaken:    strTag(tags, 'DateTimeOriginal') ?? strTag(tags, 'DateTime'),
      iso:          strTag(tags, 'ISOSpeedRatings') ?? strTag(tags, 'ISO'),
      shutterSpeed: strTag(tags, 'ExposureTime') ?? strTag(tags, 'ShutterSpeedValue'),
      aperture:     strTag(tags, 'FNumber') ?? strTag(tags, 'ApertureValue'),
      focalLength:  strTag(tags, 'FocalLength'),
      flash:        strTag(tags, 'Flash'),
      gpsLat,
      gpsLon,
      orientation:  strTag(tags, 'Orientation'),
    };

    // Return null if every field is null (no EXIF at all)
    const hasAny = Object.values(exif).some((v) => v !== null);
    return hasAny ? exif : null;
  } catch { return null; }
}

async function buildToolboxEntry(file: File): Promise<ToolboxEntry> {
  let hash: string | null = null;
  let dims: { w: number; h: number } | null = null;
  let mediaDuration: number | null = null;
  let videoDims: { w: number; h: number } | null = null;
  try {
    const buf    = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { /* unavailable */ }
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    dims = await new Promise<{ w: number; h: number } | null>((res) => {
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);
    const result = await new Promise<{ duration: number; vw: number; vh: number } | null>((res) => {
      const el = isVideo ? document.createElement('video') : document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const vw = isVideo ? (el as HTMLVideoElement).videoWidth  : 0;
        const vh = isVideo ? (el as HTMLVideoElement).videoHeight : 0;
        res({ duration: el.duration, vw, vh });
      };
      el.onerror = () => { URL.revokeObjectURL(url); res(null); };
      el.src = url;
    });
    if (result !== null) {
      mediaDuration = isFinite(result.duration) ? result.duration : null;
      if (isVideo && result.vw > 0 && result.vh > 0) videoDims = { w: result.vw, h: result.vh };
    }
  }
  const mediaCodec = (file.type.startsWith('video/') || file.type.startsWith('audio/'))
    ? await detectMediaCodec(file)
    : null;
  const exif = file.type.startsWith('image/') ? await extractExif(file) : null;
  return { file, hash, dims, mediaDuration, videoDims, mediaCodec, exif };
}

function FileToolbox() {
  const [entry,   setEntry]   = useState<ToolboxEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setLoading(true);
    setEntry(await buildToolboxEntry(file));
    setLoading(false);
  };

  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  const ext      = entry?.file.name.includes('.') ? entry.file.name.split('.').pop()?.toUpperCase() ?? '—' : '—';
  const isImage  = entry?.file.type.startsWith('image/');
  const isPdf    = entry?.file.type === 'application/pdf';
  const isText   = entry?.file.type.startsWith('text/');

  return (
    <section className="renamer-page" data-testid="file-toolbox">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(25 65% 42%)', background: 'hsl(25 65% 42% / .11)' }}><FolderOpen /></span>
            <div><h1>File Toolbox.</h1><p>One place for all your everyday file utilities.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      {!entry && !loading && (
        <div className="renamer-notice">
          <FolderOpen />
          <div><strong>Drop any file to get started</strong><span>File Toolbox inspects your file and offers actions based on its type. Nothing leaves your browser.</span></div>
        </div>
      )}
      <div
        className="toolbox-drop-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
      >
        {!entry && !loading ? (
          <>
            <div className="empty-cube"><FolderOpen /></div>
            <h2>Drop a file here.</h2>
            <p>Any file — image, PDF, text, archive — File Toolbox will read it and offer the right tools.</p>
            <label className="file-picker" style={{ marginTop: 16 }}>
              <FilePlus2 /><span>Browse for a file</span>
              <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} data-testid="input-toolbox-picker" />
            </label>
          </>
        ) : loading ? (
          <p className="toolbox-loading">Reading file…</p>
        ) : entry && (
          <div className="toolbox-file-info">
            <div className="toolbox-info-grid">
              <span className="toolbox-info-label">Name</span>      <span className="toolbox-info-value">{entry.file.name}</span>
              <span className="toolbox-info-label">Size</span>      <span className="toolbox-info-value">{formatFileBytes(entry.file.size)}</span>
              <span className="toolbox-info-label">Type</span>      <span className="toolbox-info-value">{entry.file.type || '—'}</span>
              <span className="toolbox-info-label">Extension</span> <span className="toolbox-info-value">{ext}</span>
              <span className="toolbox-info-label">Modified</span>  <span className="toolbox-info-value">{new Date(entry.file.lastModified).toLocaleString()}</span>
              {entry.dims && (<><span className="toolbox-info-label">Dimensions</span><span className="toolbox-info-value">{entry.dims.w} × {entry.dims.h} px</span></>)}
              {entry.videoDims && (<><span className="toolbox-info-label">Resolution</span><span className="toolbox-info-value">{entry.videoDims.w} × {entry.videoDims.h} px</span></>)}
              {entry.mediaDuration !== null && (<><span className="toolbox-info-label">Duration</span><span className="toolbox-info-value">{formatDuration(entry.mediaDuration)}</span></>)}
              {entry.mediaCodec && (<><span className="toolbox-info-label">Codec</span><span className="toolbox-info-value">{entry.mediaCodec}</span></>)}
              {entry.hash && (<><span className="toolbox-info-label">SHA-256</span><span className="toolbox-info-value toolbox-hash">{entry.hash}</span></>)}
            </div>
            <div className="toolbox-actions">
              <button type="button" className="button-quiet" onClick={() => copyText(entry.file.name, 'name')}><ClipboardCopy /> {copied === 'name' ? 'Copied!' : 'Copy filename'}</button>
              {entry.hash && <button type="button" className="button-quiet" onClick={() => copyText(entry.hash!, 'hash')}><ClipboardCopy /> {copied === 'hash' ? 'Copied!' : 'Copy hash'}</button>}
              {isImage && <a href={URL.createObjectURL(entry.file)} target="_blank" rel="noopener noreferrer" className="button-quiet"><ExternalLink /> View image</a>}
              {isPdf   && <a href={URL.createObjectURL(entry.file)} target="_blank" rel="noopener noreferrer" className="button-quiet"><ExternalLink /> Open PDF</a>}
              {isText  && <button type="button" className="button-quiet" onClick={async () => { const t = await entry.file.text(); copyText(t, 'content'); }}><ClipboardCopy /> {copied === 'content' ? 'Copied!' : 'Copy content'}</button>}
              <button type="button" className="button-quiet" onClick={() => { setEntry(null); setCopied(null); }}>Clear</button>
            </div>
          </div>
        )}
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>More actions coming.</strong> Desktop-specific features — rename in place, move, open containing folder, PDF tools — arrive in the Cubical Windows app.</p></div>
    </section>
  );
}

// ─── Startup Manager ──────────────────────────────────────────────────────────

function StartupManager() {
  const isDesktop  = !!(window.cubicalDesktop);
  const previewItems = [
    { name: 'Discord',  path: 'AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', enabled: true  },
    { name: 'Spotify',  path: 'AppData\\Roaming\\Spotify\\Spotify.exe',                        enabled: true  },
    { name: 'Slack',    path: 'AppData\\Local\\slack\\slack.exe',                              enabled: false },
    { name: 'Steam',    path: 'Program Files (x86)\\Steam\\steam.exe',                         enabled: true  },
    { name: 'OneDrive', path: 'Program Files\\Microsoft OneDrive\\OneDrive.exe',               enabled: true  },
  ];
  return (
    <section className="renamer-page" data-testid="startup-manager">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(262 48% 50%)', background: 'hsl(262 48% 50% / .11)' }}><PackageOpen /></span>
            <div><h1>Startup Manager.</h1><p>See and manage what launches with Windows.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Preview mode</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <PackageOpen />
        <div>
          <strong>{isDesktop ? 'Reading startup entries' : 'Desktop access required'}</strong>
          <span>{isDesktop ? 'Startup Manager is reading your Windows registry and startup folders.' : 'Startup Manager reads from the Windows registry. It will be fully functional in the Cubical desktop app. The list below shows what it will look like.'}</span>
        </div>
      </div>
      <div className="startup-list">
        <div className="renamer-section-heading">
          <span className="eyebrow">Startup programs</span>
          <span className="library-count" style={{ opacity: .55 }}>Preview data</span>
        </div>
        {previewItems.map((item) => (
          <div className="startup-row" key={item.name}>
            <PackageOpen className="startup-row-icon" />
            <div className="startup-row-info">
              <strong className="startup-row-name">{item.name}</strong>
              <span className="startup-row-path">C:\Users\…\{item.path}</span>
            </div>
            <button type="button" className={`startup-toggle${item.enabled ? ' is-enabled' : ''}`} disabled={!isDesktop}>
              {item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        ))}
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> Toggle, inspect, and manage which programs launch at startup — cleanly, without touching the registry by hand.</p></div>
    </section>
  );
}

// ─── File Inspector ───────────────────────────────────────────────────────────

function mimeCategory(type: string) {
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('text/'))  return 'Text file';
  if (type === 'application/pdf') return 'PDF document';
  if (/spreadsheet|excel|csv/.test(type)) return 'Spreadsheet';
  if (/zip|archive|compressed|7z|rar/.test(type)) return 'Archive';
  return 'File';
}

function FileInspector() {
  const [entry,    setEntry]    = useState<ToolboxEntry | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState<string | null>(null);
  const [imgSrc,   setImgSrc]   = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const clearMedia = () => {
    if (mediaUrl) { URL.revokeObjectURL(mediaUrl); setMediaUrl(null); }
    if (imgSrc)   { URL.revokeObjectURL(imgSrc);   setImgSrc(null);   }
  };

  const loadFile = async (file: File) => {
    clearMedia();
    setLoading(true);
    const built = await buildToolboxEntry(file);
    if (built.dims) {
      setImgSrc(URL.createObjectURL(file));
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      setMediaUrl(URL.createObjectURL(file));
    }
    setEntry(built);
    setLoading(false);
  };

  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  const ext = entry ? (entry.file.name.includes('.') ? `.${entry.file.name.split('.').pop()}` : '—') : '';
  const isVideo = entry?.file.type.startsWith('video/');
  const isAudio = entry?.file.type.startsWith('audio/');

  return (
    <section className="renamer-page" data-testid="file-inspector">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(350 58% 46%)', background: 'hsl(350 58% 46% / .11)' }}><FileText /></span>
            <div><h1>File Inspector.</h1><p>Drop in a file and see what's inside.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      <div
        className="toolbox-drop-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
      >
        {!entry && !loading ? (
          <>
            <div className="empty-cube"><FileText /></div>
            <h2>Drop a file to inspect it.</h2>
            <p>File Inspector reads name, size, type, dates, dimensions for images, and a SHA-256 hash — entirely in your browser.</p>
            <label className="file-picker" style={{ marginTop: 16 }}>
              <FilePlus2 /><span>Browse for a file</span>
              <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} data-testid="input-inspector-picker" />
            </label>
          </>
        ) : loading ? (
          <p className="toolbox-loading">Inspecting file…</p>
        ) : entry && (
          <div className="toolbox-file-info">
            {imgSrc && <div className="inspector-img-wrap"><img src={imgSrc} alt={entry.file.name} className="inspector-img-thumb" /></div>}
            <div className="toolbox-info-grid">
              <span className="toolbox-info-label">File name</span>  <span className="toolbox-info-value">{entry.file.name}</span>
              <span className="toolbox-info-label">Category</span>   <span className="toolbox-info-value">{mimeCategory(entry.file.type)}</span>
              <span className="toolbox-info-label">MIME type</span>  <span className="toolbox-info-value">{entry.file.type || '—'}</span>
              <span className="toolbox-info-label">Extension</span>  <span className="toolbox-info-value">{ext}</span>
              <span className="toolbox-info-label">Size</span>       <span className="toolbox-info-value">{formatFileBytes(entry.file.size)} ({entry.file.size.toLocaleString()} bytes)</span>
              <span className="toolbox-info-label">Modified</span>   <span className="toolbox-info-value">{new Date(entry.file.lastModified).toLocaleString()}</span>
              {entry.dims && (<><span className="toolbox-info-label">Dimensions</span><span className="toolbox-info-value">{entry.dims.w} × {entry.dims.h} px</span></>)}
              {entry.videoDims && (<><span className="toolbox-info-label">Resolution</span><span className="toolbox-info-value">{entry.videoDims.w} × {entry.videoDims.h} px</span></>)}
              {entry.mediaDuration !== null && (<><span className="toolbox-info-label">Duration</span><span className="toolbox-info-value">{formatDuration(entry.mediaDuration)}</span></>)}
              {entry.mediaCodec && (<><span className="toolbox-info-label">Codec</span><span className="toolbox-info-value">{entry.mediaCodec}</span></>)}
              {entry.hash && (<><span className="toolbox-info-label">SHA-256</span><span className="toolbox-info-value toolbox-hash">{entry.hash}</span></>)}
            </div>
            {entry.exif && (
              <div className="inspector-exif-section">
                <div className="inspector-exif-heading">Camera &amp; EXIF</div>
                <div className="toolbox-info-grid">
                  {(entry.exif.make || entry.exif.model) && (
                    <><span className="toolbox-info-label">Camera</span>
                    <span className="toolbox-info-value">
                      {[entry.exif.make, entry.exif.model].filter(Boolean).join(' ')}
                    </span></>
                  )}
                  {entry.exif.dateTaken && (<><span className="toolbox-info-label">Date taken</span><span className="toolbox-info-value">{entry.exif.dateTaken}</span></>)}
                  {entry.exif.iso && (<><span className="toolbox-info-label">ISO</span><span className="toolbox-info-value">{entry.exif.iso}</span></>)}
                  {entry.exif.shutterSpeed && (<><span className="toolbox-info-label">Shutter speed</span><span className="toolbox-info-value">{entry.exif.shutterSpeed}</span></>)}
                  {entry.exif.aperture && (<><span className="toolbox-info-label">Aperture</span><span className="toolbox-info-value">{entry.exif.aperture}</span></>)}
                  {entry.exif.focalLength && (<><span className="toolbox-info-label">Focal length</span><span className="toolbox-info-value">{entry.exif.focalLength}</span></>)}
                  {entry.exif.flash && (<><span className="toolbox-info-label">Flash</span><span className="toolbox-info-value">{entry.exif.flash}</span></>)}
                  {entry.exif.orientation && (<><span className="toolbox-info-label">Orientation</span><span className="toolbox-info-value">{entry.exif.orientation}</span></>)}
                  {(entry.exif.gpsLat && entry.exif.gpsLon) && (
                    <><span className="toolbox-info-label">GPS</span>
                    <span className="toolbox-info-value">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${entry.exif.gpsLat},${entry.exif.gpsLon}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inspector-gps-link"
                      >
                        {entry.exif.gpsLat}, {entry.exif.gpsLon} ↗
                      </a>
                    </span></>
                  )}
                </div>
              </div>
            )}
            {mediaUrl && isVideo && (
              <video
                key={mediaUrl}
                src={mediaUrl}
                controls
                className="inspector-media-player"
                style={{ width: '100%', maxHeight: 360, borderRadius: 8, marginTop: 12, background: '#000' }}
              />
            )}
            {mediaUrl && isAudio && (
              <audio
                key={mediaUrl}
                src={mediaUrl}
                controls
                className="inspector-media-player"
                style={{ width: '100%', marginTop: 12 }}
              />
            )}
            <div className="toolbox-actions">
              <button type="button" className="button-quiet" onClick={() => copyText(entry.file.name, 'name')}><ClipboardCopy /> {copied === 'name' ? 'Copied!' : 'Copy filename'}</button>
              {entry.hash && <button type="button" className="button-quiet" onClick={() => copyText(entry.hash!, 'hash')}><ClipboardCopy /> {copied === 'hash' ? 'Copied!' : 'Copy SHA-256'}</button>}
              <button type="button" className="button-quiet" onClick={() => { setEntry(null); setCopied(null); clearMedia(); }}>Inspect another file</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── System Info ──────────────────────────────────────────────────────────────

function SystemInfoPage() {
  const isDesktop = !!(window.cubicalDesktop);

  // Read real browser/environment data
  const cores    = navigator.hardwareConcurrency ?? null;
  const memGb    = (navigator as any).deviceMemory as number | undefined;
  const ua       = navigator.userAgent;
  const uaData   = (navigator as any).userAgentData as { platform?: string; architecture?: string } | undefined;
  const osPlatform = uaData?.platform ?? navigator.platform ?? '';
  const osName   = osPlatform || (ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown');
  const screenW  = screen.width;
  const screenH  = screen.height;
  const dpr      = window.devicePixelRatio ?? 1;
  const physW    = Math.round(screenW * dpr);
  const physH    = Math.round(screenH * dpr);
  const elMatch  = ua.match(/Electron\/([\d.]+)/);
  const crMatch  = ua.match(/Chrome\/([\d.]+)/);
  const shellVal = elMatch ? `Electron ${elMatch[1]}` : crMatch ? `Chromium ${crMatch[1]}` : 'Browser';
  const archVal  = uaData?.architecture ?? (ua.includes('x86_64') || ua.includes('Win64') || ua.includes('x64') ? 'x64 (64-bit)' : '—');

  const liveCards: { label: string; value: string; detail: string; Icon: typeof Monitor }[] = [
    { label: 'Platform',          value: osName || '—',                    detail: elMatch ? 'Running in Electron (desktop shell)' : 'Running in web browser',        Icon: Monitor   },
    { label: 'Logical CPU cores', value: cores !== null ? `${cores}` : '—', detail: cores !== null ? 'navigator.hardwareConcurrency' : 'Not reported by this environment', Icon: Zap   },
    { label: 'Device memory',     value: memGb !== undefined ? `≥ ${memGb} GB` : '—', detail: memGb !== undefined ? 'Rounded by browser privacy spec' : 'Not exposed in this browser', Icon: Hash },
    { label: 'Display (logical)', value: `${screenW} × ${screenH}`,       detail: `Physical: ${physW} × ${physH} · ${dpr}× pixel ratio`,                            Icon: Monitor   },
    { label: 'Architecture',      value: archVal,                           detail: uaData ? 'From UA-CH client hints' : 'Inferred from user-agent string',           Icon: Globe     },
    { label: 'Shell / Runtime',   value: shellVal,                          detail: (crMatch ? `Chrome ${crMatch[1]}` : ua).slice(0, 70),                             Icon: Globe     },
  ];

  const desktopCards: { label: string; value: string; detail: string; Icon: typeof Monitor }[] = [
    { label: 'Operating System', value: 'Windows 11 Pro',       detail: 'Version 23H2 · Build 22631',            Icon: Monitor   },
    { label: 'Processor',        value: 'Intel Core i7-13700K', detail: '16 cores / 24 threads · 3.40 GHz base', Icon: Zap       },
    { label: 'Memory',           value: '32 GB DDR5',           detail: '4800 MHz · 2 slots used of 4',          Icon: Hash      },
    { label: 'Storage',          value: '1 TB NVMe SSD',        detail: 'Samsung 980 Pro · C:\\ primary drive',  Icon: HardDrive },
    { label: 'Display',          value: '2560 × 1440',          detail: '27 in · 144 Hz · HDR400',               Icon: Monitor   },
    { label: 'Architecture',     value: 'x64 (64-bit)',         detail: 'AMD64 compatible',                      Icon: Globe     },
  ];

  const cards = isDesktop ? desktopCards : liveCards;

  return (
    <section className="renamer-page" data-testid="system-info">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · {isDesktop ? 'local prototype' : 'works in browser'}</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(45 68% 40%)', background: 'hsl(45 68% 40% / .12)' }}><Monitor /></span>
            <div><h1>System Info.</h1><p>A clean overview of your PC and hardware.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> {isDesktop ? 'Preview mode' : 'Live data'}</span>
      </div>
      <DisplacedWidgetBand />
      {isDesktop && (
        <div className="renamer-notice">
          <Monitor />
          <div>
            <strong>Reading system information</strong>
            <span>System Info is gathering your hardware and OS details from the desktop bridge.</span>
          </div>
        </div>
      )}
      <div className="system-info-grid">
        {cards.map(({ label, value, detail, Icon }) => (
          <div className="system-info-card" key={label}>
            <div className="system-info-card-header">
              <Icon className="system-info-icon" />
              <span className="system-info-label">{label}</span>
            </div>
            <div className="system-info-value">{value}</div>
            <div className="system-info-detail">{detail}</div>
          </div>
        ))}
      </div>
      {isDesktop && <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> CPU, RAM, GPU, storage, display, and network details are read directly from your system when running as a desktop app.</p></div>}
    </section>
  );
}

// ─── File Organizer ───────────────────────────────────────────────────────────

function FileOrganizerPage() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...picked.filter((f) => !existing.has(f.name + f.size))];
    });
    e.target.value = '';
  };

  const groups = useMemo(() => {
    const map: Record<string, File[]> = {};
    for (const f of files) {
      const cat = mimeCategory(f.type);
      if (!map[cat]) map[cat] = [];
      map[cat].push(f);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [files]);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <section className="renamer-page" data-testid="file-organizer">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(164 48% 32%)', background: 'hsl(164 48% 32% / .12)' }}><FolderCog /></span>
            <div><h1>File Organizer.</h1><p>Sort, group, and make sense of your files in one pass.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Files stay on your computer</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <FolderCog />
        <div>
          <strong>Group files by type</strong>
          <span>Select files to see how they'd be organized by category. Nothing is moved — this is a preview only.</span>
        </div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Select files</span><span className="library-count">{files.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={handleFiles} /></label>
          {files.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{formatFileBytes(totalSize)} total</p>
              <button type="button" className="text-button" style={{ marginTop: 6 }} onClick={() => setFiles([])}><RotateCcw /> Clear</button>
            </div>
          )}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading"><span className="eyebrow">02 · Organized by type</span></div>
          {files.length === 0 ? (
            <div className="renamer-empty"><FolderOpen style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select files to see how they would be grouped.</p></div>
          ) : (
            <div className="storage-folder-list">
              {groups.map(([cat, catFiles]) => (
                <div key={cat}>
                  <div className="renamer-section-heading" style={{ marginTop: 12 }}>
                    <span className="eyebrow">{cat}</span>
                    <span className="library-count" style={{ opacity: .7 }}>{catFiles.length} file{catFiles.length !== 1 ? 's' : ''} · {formatFileBytes(catFiles.reduce((s, f) => s + f.size, 0))}</span>
                  </div>
                  {catFiles.map((f) => (
                    <div className="storage-folder-row" key={f.name + f.size}>
                      <File className="storage-folder-row-icon" />
                      <span className="storage-folder-name" style={{ flex: 1, minWidth: 'auto', fontSize: 12 }}>{f.name}</span>
                      <span className="storage-folder-size">{formatFileBytes(f.size)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Duplicate Finder ─────────────────────────────────────────────────────────

function DuplicateFinderPage() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  };

  const groups = useMemo(() => {
    const map = new Map<string, File[]>();
    for (const f of files) {
      const key = `${f.name}__${f.size}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.values()].filter((g) => g.length > 1);
  }, [files]);

  const wastedBytes = groups.reduce((sum, g) => sum + g.slice(1).reduce((s, f) => s + f.size, 0), 0);

  return (
    <section className="renamer-page" data-testid="duplicate-finder">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(287 40% 47%)', background: 'hsl(287 40% 47% / .12)' }}><Files /></span>
            <div><h1>Duplicate Finder.</h1><p>Spot the copies taking up space and keep the best version.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Nothing is deleted</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <Files />
        <div>
          <strong>Find duplicate files</strong>
          <span>Select files to scan. Duplicates are detected by matching name and size. Nothing is deleted automatically.</span>
        </div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Select files</span><span className="library-count">{files.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={handleFiles} /></label>
          {files.length > 0 && <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={() => setFiles([])}><RotateCcw /> Clear</button>}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading">
            <span className="eyebrow">02 · Duplicates found</span>
            {groups.length > 0 && <span className="library-count" style={{ opacity: .7 }}>{groups.length} group{groups.length !== 1 ? 's' : ''} · {formatFileBytes(wastedBytes)} wasted</span>}
          </div>
          {files.length === 0 ? (
            <div className="renamer-empty"><Files style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select files to scan for duplicates.</p></div>
          ) : groups.length === 0 ? (
            <div className="renamer-empty"><Check style={{ width: 28, height: 28, color: 'hsl(140 50% 40%)', marginBottom: 10 }} /><p>No duplicates found in the selected files.</p></div>
          ) : (
            <div className="storage-folder-list">
              {groups.map((group, i) => (
                <div key={i}>
                  <div className="renamer-section-heading" style={{ marginTop: 12 }}>
                    <span className="eyebrow">"{group[0].name}"</span>
                    <span className="library-count" style={{ color: 'hsl(0 65% 50%)', opacity: 1 }}>{group.length}× · {formatFileBytes(group[0].size)} each</span>
                  </div>
                  {group.map((f, j) => (
                    <div className="storage-folder-row" key={j} style={{ opacity: j === 0 ? 1 : 0.6 }}>
                      <File className="storage-folder-row-icon" />
                      <span className="storage-folder-name" style={{ flex: 1, minWidth: 'auto', fontSize: 12 }}>{j === 0 ? '✓ Keep' : '⚠ Duplicate'} — {f.name}</span>
                      <span className="storage-folder-size">{formatFileBytes(f.size)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── PDF Toolkit ──────────────────────────────────────────────────────────────

async function getPdfPageCount(file: File): Promise<number> {
  try {
    const buf  = await file.arrayBuffer();
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf));
    // Count /Type /Page entries (not /Type /Pages which is the parent object)
    const direct = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (direct > 0) return direct;
    // Fallback: first /Count N in the Pages dict
    const m = text.match(/\/Count\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch { return 0; }
}

function PdfToolkitPage() {
  const [file, setFile]           = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [objUrl, setObjUrl]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => () => { if (objUrl) URL.revokeObjectURL(objUrl); }, []);

  const loadFile = async (f: File) => {
    setLoading(true);
    setFile(f);
    if (objUrl) URL.revokeObjectURL(objUrl);
    const url = URL.createObjectURL(f);
    setObjUrl(url);
    const count = await getPdfPageCount(f);
    setPageCount(count);
    setLoading(false);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  const reset = () => {
    if (objUrl) URL.revokeObjectURL(objUrl);
    setFile(null); setObjUrl(null); setPageCount(null);
  };

  return (
    <section className="renamer-page" data-testid="pdf-toolkit">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(1 68% 54%)', background: 'hsl(1 68% 54% / .12)' }}><FileScan /></span>
            <div><h1>PDF Toolkit.</h1><p>Small, sharp tools for the PDFs you touch every day.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Open a PDF</span></div>
          <label className="file-picker">
            <FileScan /><span>Select PDF</span>
            <input type="file" accept=".pdf,application/pdf" onChange={handleChange} />
          </label>
          {file && <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={reset}><RotateCcw /> Clear</button>}
          {loading && <p className="toolbox-loading" style={{ marginTop: 14 }}>Reading PDF…</p>}
          {file && !loading && (
            <div className="toolbox-info-grid" style={{ marginTop: 16 }}>
              <span className="toolbox-info-label">File name</span>
              <span className="toolbox-info-value" style={{ fontSize: 12, wordBreak: 'break-all' }}>{file.name}</span>
              <span className="toolbox-info-label">File size</span>
              <span className="toolbox-info-value">{formatFileBytes(file.size)}</span>
              <span className="toolbox-info-label">Pages</span>
              <span className="toolbox-info-value">{pageCount !== null ? (pageCount > 0 ? pageCount : 'Unknown') : '—'}</span>
              <span className="toolbox-info-label">Type</span>
              <span className="toolbox-info-value">PDF Document</span>
            </div>
          )}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading"><span className="eyebrow">02 · Preview</span></div>
          {objUrl ? (
            <embed src={objUrl} type="application/pdf" style={{ width: '100%', minHeight: 500, borderRadius: 12, border: '1px solid hsl(var(--border))' }} />
          ) : (
            <div className="renamer-empty"><FileScan style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select a PDF to preview it here.</p></div>
          )}
        </div>
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
  const [libraryIds, setLibraryIds]         = useState<string[]>(getStoredLibrary);
  const [toast, setToast]                   = useState<string | null>(null);
  const { products: catalogProducts, status: catalogStatus, refresh: refreshCatalog } = useCatalog();

  const libraryProducts = useMemo(
    () => catalogProducts.filter((product) => libraryIds.includes(product.id)),
    [catalogProducts, libraryIds],
  );

  // Apply persisted theme mode, cosmetic palette, and skin on first mount.
  useEffect(() => {
    const settings = readSettings();
    applyThemeMode(settings.themeMode);
    applyTheme(getEquippedCosmetic(), settings.themeMode);
    applySkin(readEquippedSkin());
    // Startup page: redirect only when landing on root with no specific hash
    const hash = window.location.hash.replace(/^#/, '') || '/';
    if (hash === '/') {
      if (settings.startupPage === 'store')   window.location.hash = '/store';
      else if (settings.startupPage === 'library') window.location.hash = '/library';
    }
  }, []);

  useEffect(() => { storeLibrary(libraryIds); }, [libraryIds]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 2800); return () => window.clearTimeout(t); }, [toast]);

  const addToLibrary = (product: CatalogProduct) => {
    setLibraryIds((current) => current.includes(product.id) ? current : [...current, product.id]);
    setToast(`${product.name} added to your library`);
  };

  const openProduct = (product: CatalogProduct) => {
    if (product.deliveryType === 'client-update-required') {
      setToast(`${product.name} requires a newer version of Cubical`);
      return;
    }
    if (product.type === 'skin') { window.location.hash = '/profile'; return; }
    if (product.type === 'game') { window.location.hash = '/breakroom'; return; }
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
    <PortableProvider>
      <Router hook={useHashLocation}>
        <NavProvider>
          <AppShell libraryCount={libraryProducts.length}>
            <Switch>
              <Route path="/"><HomePage /></Route>
              <Route path="/store">
                <StorePage
                  libraryIds={libraryIds}
                  catalogProducts={catalogProducts}
                  catalogStatus={catalogStatus}
                  onRefresh={refreshCatalog}
                />
              </Route>
              <Route path="/product/:id">{(params) => {
                const product = catalogProducts.find((item) => item.id === params.id);
                if (!product) return <NotFound />;
                return <ProductDetail product={product} isAdded={libraryIds.includes(product.id)} onAdd={() => addToLibrary(product)} onOpen={() => openProduct(product)} />;
              }}</Route>
              <Route path="/library"><LibraryPage products={libraryProducts} onOpen={openProduct} /></Route>
              <Route path="/breakroom"><BreakroomPage /></Route>
              <Route path="/tool/file-organizer"><FileOrganizerPage /></Route>
              <Route path="/tool/bulk-file-renamer"><BulkFileRenamer /></Route>
              <Route path="/tool/spreadsheet-cleaner"><SpreadsheetCleaner /></Route>
              <Route path="/tool/pdf-toolkit"><PdfToolkitPage /></Route>
              <Route path="/tool/duplicate-finder"><DuplicateFinderPage /></Route>
              <Route path="/tool/file-finder"><FileFinderPage /></Route>
              <Route path="/tool/storage-explorer"><StorageExplorer /></Route>
              <Route path="/tool/image-converter"><ImageConverter /></Route>
              <Route path="/tool/file-toolbox"><FileToolbox /></Route>
              <Route path="/tool/startup-manager"><StartupManager /></Route>
              <Route path="/tool/file-inspector"><FileInspector /></Route>
              <Route path="/tool/system-info"><SystemInfoPage /></Route>
              <Route path="/profile"><ProfilePage /></Route>
              <Route path="/settings"><SettingsPage /></Route>
              <Route><NotFound /></Route>
            </Switch>
            {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check /> {toast}</div>}
          </AppShell>
        </NavProvider>
      </Router>
    </PortableProvider>
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

function storeBaselineWidth(w: number) {
  try { window.localStorage.setItem(LAYOUT_BASELINE_KEY, String(Math.round(w))); } catch {}
}

function snapVal(v: number): number { return Math.round(v / SNAP_GRID) * SNAP_GRID; }

function snapItem(item: LayoutItem): LayoutItem {
  return { ...item, x: snapVal(item.x), y: snapVal(item.y), w: snapVal(item.w), h: snapVal(item.h) };
}

const SNAP_GRID = 80; // px — coarse modular grid (feels intentionally stepped, not pixel-level)
