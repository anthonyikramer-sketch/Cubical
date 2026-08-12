import { createPortal } from 'react-dom';
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
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
  ChevronUp,
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
  FormInput,
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
  Minus,
  Moon,
  MousePointer2,
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
  Stamp,
  StickyNote,
  Sun,
  TableProperties,
  Timer,
  Trash2,
  Trophy,
  Underline,
  X,
  Zap,
  Eraser,
} from 'lucide-react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';

// ─── Shared contexts & tool components ───────────────────────────────────────
import {
  NavProvider,
  BackButton,
  PortableProvider,
  usePortable,
  DisplacedWidgetBandCtx,
} from './shared/contexts';
// ─── Lazy-loaded tool pages (each becomes its own JS chunk) ──────────────────
const BulkFileRenamer     = lazy(() => import('./tools/BulkFileRenamer').then(m    => ({ default: m.BulkFileRenamer })));
const SpreadsheetCleaner  = lazy(() => import('./tools/SpreadsheetCleaner').then(m => ({ default: m.SpreadsheetCleaner })));
const StorageExplorer     = lazy(() => import('./tools/StorageExplorer').then(m    => ({ default: m.StorageExplorer })));
const StartupManager      = lazy(() => import('./tools/StartupManager').then(m     => ({ default: m.StartupManager })));
const SystemInfoPage      = lazy(() => import('./tools/SystemInfoPage').then(m     => ({ default: m.SystemInfoPage })));
const FileFinderPage      = lazy(() => import('./tools/FileFinderPage').then(m     => ({ default: m.FileFinderPage })));
const ProfilePage         = lazy(() => import('./tools/ProfilePage').then(m        => ({ default: m.ProfilePage })));
const SettingsPage        = lazy(() => import('./tools/SettingsPage').then(m       => ({ default: m.SettingsPage })));
const ImageConverter      = lazy(() => import('./tools/ImageConverter').then(m     => ({ default: m.ImageConverter })));
const FileOrganizerPage   = lazy(() => import('./tools/FileOrganizerPage').then(m  => ({ default: m.FileOrganizerPage })));
const DuplicateFinderPage = lazy(() => import('./tools/DuplicateFinderPage').then(m => ({ default: m.DuplicateFinderPage })));
const PdfToolkitPage      = lazy(() => import('./tools/PdfToolkitPage').then(m     => ({ default: m.PdfToolkitPage })));
const FileToolbox         = lazy(() => import('./tools/FileToolbox').then(m        => ({ default: m.FileToolbox })));
const FileInspector       = lazy(() => import('./tools/FileInspector').then(m      => ({ default: m.FileInspector })));
const PdfFormFiller       = lazy(() => import('./tools/PdfFormFiller').then(m      => ({ default: m.PdfFormFiller })));
const ClearBackground     = lazy(() => import('./tools/ClearBackground').then(m    => ({ default: m.ClearBackground })));
const SheetFill           = lazy(() => import('./tools/SheetFill').then(m          => ({ default: m.SheetFill })));
import { FileShelfWidget, FileShelfViewerLayer } from './widgets/FileShelfWidget';

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
  images:       ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.heic', '.cr2', '.nef', '.arw', '.dng'],
  videos:       ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'],
  audio:        ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'],
  archives:     ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
};

function getFileIcon(ext: string): ReactNode {
  const e = ext.toLowerCase();
  if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.tiff','.heic','.cr2','.nef','.arw','.dng'].includes(e)) return <FileText />;
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
  Eraser,
  File, FileArchive, FileScan, FileSpreadsheet, FileText, Files,
  FolderCog, FolderOpen, FolderSearch, FormInput,
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
  { id: 'tool.sheet-fill',           type: 'tool', name: 'SheetFill',            description: 'Turn master documents into filled Excel templates.',               version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FileSpreadsheet', iconColor: 'hsl(142 52% 35%)', iconBg: 'hsl(142 52% 35% / .11)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.clear-background',    type: 'tool', name: 'Clear Background',    description: 'Remove white or solid-color backgrounds from images — locally, instantly.', version: '1.0.0', price: 'FREE', isFree: true, iconName: 'Eraser',        iconColor: 'hsl(195 60% 36%)', iconBg: 'hsl(195 60% 36% / .11)', deliveryType: 'bundled', status: 'active' },
  { id: 'tool.pdf-form-filler',     type: 'tool', name: 'PDF Form Filler',     description: 'Automatically detect fillable areas in PDFs, add text fields, save templates, and complete forms faster.', version: '1.0.0', price: 'FREE', isFree: true, iconName: 'FormInput',       iconColor: 'hsl(210 60% 42%)', iconBg: 'hsl(210 60% 42% / .11)', deliveryType: 'bundled', status: 'active' },
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
  'tool.pdf-form-filler':     '/tool/pdf-form-filler',
  'tool.sheet-fill':          '/tool/sheet-fill',
  'tool.clear-background':    '/tool/clear-background',
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
  'pdf-form-filler':     'tool.pdf-form-filler',
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

type WidgetId = 'calendar' | 'clock' | 'notepad' | 'file-finder' | 'link-shelf' | 'decision-maker' | 'calculator' | 'file-shelf';

type LayoutItem = { id: WidgetId; x: number; y: number; w: number; h: number; };

const WIDGET_LABELS: Record<WidgetId, string> = {
  calendar:         'Calendar',
  clock:            'Clock',
  notepad:          'Notepad',
  'file-finder':    'File Finder',
  'link-shelf':     'Link Shelf',
  'decision-maker': 'Decision Maker',
  calculator:       'Calculator',
  'file-shelf':     'File Shelf',
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
  'file-shelf':     { w: 220, h: 240 },
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
  { id: 'file-shelf',    label: 'File Shelf',     defaultW: 280, defaultH: 420, defaultX: 720, defaultY: 0   },
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
    const ids: WidgetId[] = ['calendar', 'clock', 'notepad', 'file-finder', 'link-shelf', 'decision-maker', 'calculator', 'file-shelf'];
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
// ─── App shell ────────────────────────────────────────────────────────────────

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
      <DisplacedWidgetBandImpl />

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
      <DisplacedWidgetBandImpl />
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
      <DisplacedWidgetBandImpl />
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

// Base path for Sakura assets — relative so packaged Electron (file://) resolves correctly.
// Vite sets import.meta.env.BASE_URL to './' for desktop builds and to the preview
// subpath (e.g. '/cubical/') for Replit web builds; either way the paths resolve.
const _B = import.meta.env.BASE_URL;

const SAKURA_DECOS: Partial<Record<WidgetId, React.ReactNode>> = {
  // Wide blossom branch draped along the top-centre of the calendar
  calendar: (
    <img
      src={_B + 'sakura/branch-wide.png'}
      className="sakura-deco sakura-deco--calendar"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Cat resting on a branch, peeking over the top-right of the clock
  clock: (
    <img
      src={_B + 'sakura/cat-branch.png'}
      className="sakura-deco sakura-deco--clock"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Single large sakura flower at the top-right corner of the notepad
  notepad: (
    <img
      src={_B + 'sakura/flower-corner.png'}
      className="sakura-deco sakura-deco--notepad"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Small blossom branch draping over the top-left of the link shelf
  'link-shelf': (
    <img
      src={_B + 'sakura/branch-wide.png'}
      className="sakura-deco sakura-deco--link-shelf"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Flower petal cluster at the top-right of the decision maker
  'decision-maker': (
    <img
      src={_B + 'sakura/flower-corner.png'}
      className="sakura-deco sakura-deco--decision-maker"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Cat on branch peeking over the top-right of the calculator
  calculator: (
    <img
      src={_B + 'sakura/cat-branch.png'}
      className="sakura-deco sakura-deco--calculator"
      alt="" aria-hidden draggable={false}
    />
  ),
  // Flower bloom at the top-left corner of the file finder (mirrored for variety)
  'file-finder': (
    <img
      src={_B + 'sakura/flower-corner.png'}
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
          {item.id === 'file-shelf'    && <FileShelfWidget />}
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
          <img src={import.meta.env.BASE_URL + 'sakura-env.png'} className="sakura-env-img" alt="" aria-hidden draggable={false} />
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

function DisplacedWidgetBandImpl() {
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

      <DisplacedWidgetBandImpl />

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
          <DisplacedWidgetBandCtx.Provider value={DisplacedWidgetBandImpl}>
          <AppShell libraryCount={libraryProducts.length}>
            <Suspense fallback={
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%' }}>
                <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'ff-spin 0.7s linear infinite' }} />
              </div>
            }>
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
              <Route path="/tool/pdf-form-filler"><PdfFormFiller /></Route>
              <Route path="/tool/sheet-fill"><SheetFill /></Route>
              <Route path="/tool/clear-background"><ClearBackground /></Route>
              <Route path="/profile"><ProfilePage /></Route>
              <Route path="/settings"><SettingsPage /></Route>
              <Route><NotFound /></Route>
            </Switch>
            </Suspense>
            {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check /> {toast}</div>}
          </AppShell>
          </DisplacedWidgetBandCtx.Provider>
        </NavProvider>
      </Router>
    <FileShelfViewerLayer />
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
