// ─── Local-storage helpers ────────────────────────────────────────────────────

export function readLocal<T>(key: string, fallback: T, validate: (v: unknown) => v is T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch { return fallback; }
}

export function writeLocal(key: string, value: unknown) {
  try { if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

// ─── Key constants ─────────────────────────────────────────────────────────────

export const LIBRARY_STORAGE_KEY   = 'cubical-library';
export const CALENDAR_STORAGE_KEY  = 'cubical-calendar-events';
export const NOTEPAD_STORAGE_KEY   = 'cubical-notepad';
export const NOTEPAD_HTML_KEY      = 'cubical-notepad-html';
export const CLOCK_SECONDS_KEY     = 'cubical-clock-seconds';
export const CLOCK_TIMER_KEY       = 'cubical-clock-timer';
export const CLOCK_ALARMS_KEY      = 'cubical-clock-alarms';
export const LAYOUT_STORAGE_KEY    = 'cubical-home-layout';
export const LAYOUT_BASELINE_KEY   = 'cubical-home-layout-baseline';
export const LINK_SHELF_KEY        = 'cubical-link-shelf';
export const DECISION_MAKER_KEY    = 'cubical-decision-maker';
export const DISPLACED_WIDGETS_KEY = 'cubical-displaced-widgets';
export const SNAP_GRID_KEY         = 'cubical-snap-grid';
export const ACTIVE_WIDGETS_KEY    = 'cubical-active-widgets';
export const RECENT_SEARCHES_KEY   = 'cubical-file-finder-recent';
export const FF_PENDING_QUERY_KEY  = 'cubical-file-finder-pending';
export const SIDEBAR_PINNED_KEY    = 'cubical-sidebar-pinned';
export const PROFILE_KEY           = 'cubical-profile';
export const PROFILE_SKIN_KEY      = 'cubical-profile-skin';
export const SETTINGS_KEY          = 'cubical-settings';

// ─── Settings ─────────────────────────────────────────────────────────────────

export type ThemeMode   = 'light' | 'dark' | 'system';
export type StartupPage = 'home' | 'store' | 'library';

export interface AppSettings {
  themeMode:           ThemeMode;
  sidebarAutoCollapse: boolean;
  clockSeconds:        boolean;
  soundEnabled:        boolean;
  startupPage:         StartupPage;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode:           'light',
  sidebarAutoCollapse: true,
  clockSeconds:        false,
  soundEnabled:        true,
  startupPage:         'home',
};

export function isAppSettings(v: unknown): v is AppSettings {
  return !!v && typeof v === 'object' && typeof (v as Record<string,unknown>).themeMode === 'string';
}

export function readSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readLocal<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS, isAppSettings) };
}
export function writeSettings(s: AppSettings) { writeLocal(SETTINGS_KEY, s); }

// ─── Profile ──────────────────────────────────────────────────────────────────

export interface ProfileData { name: string; avatar: string | null; bannerColor: string; }
export const DEFAULT_PROFILE: ProfileData = { name: '', avatar: null, bannerColor: '#7c9e8f' };

export function isProfileData(v: unknown): v is ProfileData {
  return !!v && typeof v === 'object' && typeof (v as Record<string,unknown>).name === 'string';
}
export function readProfile(): ProfileData {
  return { ...DEFAULT_PROFILE, ...readLocal<ProfileData>(PROFILE_KEY, DEFAULT_PROFILE, isProfileData) };
}
export function writeProfile(p: ProfileData) { writeLocal(PROFILE_KEY, p); }

export function readEquippedSkin(): string {
  try { return window.localStorage.getItem(PROFILE_SKIN_KEY) ?? 'default'; } catch { return 'default'; }
}

// ─── Skin catalog ─────────────────────────────────────────────────────────────

export interface CubicalSkin { id: string; name: string; description: string; owned: boolean; comingSoon?: boolean; }

export const CUBICAL_SKINS: CubicalSkin[] = [
  { id: 'default', name: 'Default', description: 'Clean and calm. The original Cubical look.',                owned: true },
  { id: 'sakura',  name: 'Sakura',  description: 'Cherry blossoms and soft pinks. A peaceful seasonal look.', owned: true },
];

// ─── Widget layout types ───────────────────────────────────────────────────────

export type WidgetId = 'calendar' | 'clock' | 'notepad' | 'file-finder' | 'link-shelf' | 'decision-maker' | 'calculator';

export type LayoutItem = { id: WidgetId; x: number; y: number; w: number; h: number; };

export const WIDGET_LABELS: Record<WidgetId, string> = {
  calendar:         'Calendar',
  clock:            'Clock',
  notepad:          'Notepad',
  'file-finder':    'File Finder',
  'link-shelf':     'Link Shelf',
  'decision-maker': 'Decision Maker',
  calculator:       'Calculator',
};

export const WIDGET_MIN: Record<WidgetId, { w: number; h: number }> = {
  calendar:         { w: 120, h: 110 },
  clock:            { w: 140, h: 100 },
  notepad:          { w: 220, h: 160 },
  'file-finder':    { w: 220, h: 120 },
  'link-shelf':     { w: 220, h: 180 },
  'decision-maker': { w: 220, h: 180 },
  calculator:       { w: 180, h: 280 },
};

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'calendar', x: 0,   y: 0,   w: 560, h: 630 },
  { id: 'clock',    x: 575, y: 0,   w: 390, h: 264 },
  { id: 'notepad',  x: 575, y: 274, w: 390, h: 450 },
];

export type WidgetDef = {
  id: WidgetId;
  label: string;
  defaultW: number;
  defaultH: number;
  defaultX: number;
  defaultY: number;
  portable?: boolean;
};

export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: 'calendar',       label: 'Calendar',       defaultW: 560, defaultH: 630, defaultX: 0,   defaultY: 0   },
  { id: 'clock',          label: 'Clock',          defaultW: 390, defaultH: 264, defaultX: 575, defaultY: 0   },
  { id: 'notepad',        label: 'Notepad',        defaultW: 390, defaultH: 450, defaultX: 575, defaultY: 274 },
  { id: 'link-shelf',     label: 'Link Shelf',     defaultW: 390, defaultH: 264, defaultX: 0,   defaultY: 644 },
  { id: 'decision-maker', label: 'Decision Maker', defaultW: 310, defaultH: 360, defaultX: 400, defaultY: 644 },
  { id: 'calculator',     label: 'Calculator',     defaultW: 240, defaultH: 450, defaultX: 720, defaultY: 274 },
];

export const DEFAULT_ACTIVE_WIDGETS: WidgetId[] = ['calendar', 'clock', 'notepad'];

export function getActiveWidgets(): WidgetId[] {
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
export function storeActiveWidgets(ids: WidgetId[]) { writeLocal(ACTIVE_WIDGETS_KEY, ids); }

export function getStoredLayout(): LayoutItem[] {
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
export function storeLayout(layout: LayoutItem[]) { writeLocal(LAYOUT_STORAGE_KEY, layout); }

export function getStoredBaselineWidth(): number | null {
  try {
    const raw = window.localStorage.getItem(LAYOUT_BASELINE_KEY);
    if (!raw) return null;
    const v = parseFloat(raw);
    return isNaN(v) || v <= 0 ? null : v;
  } catch { return null; }
}
export function storeBaselineWidth(w: number) {
  try { window.localStorage.setItem(LAYOUT_BASELINE_KEY, String(Math.round(w))); } catch {}
}

// ─── Displaced widgets ────────────────────────────────────────────────────────

export type DisplacedWidget = { id: WidgetId; page: string };

export function getDisplaced(): DisplacedWidget[] {
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
export function storeDisplaced(d: DisplacedWidget[]) { writeLocal(DISPLACED_WIDGETS_KEY, d); }

// ─── Calendar types & storage ─────────────────────────────────────────────────

export type CalendarEvent = { id: string; date: string; title: string; time: string; note: string; };

export function isEventArray(v: unknown): v is CalendarEvent[] {
  if (!Array.isArray(v)) return false;
  return v.every((e) => e && typeof e === 'object' && 'id' in e && 'date' in e && 'title' in e);
}
export function getStoredEvents(): CalendarEvent[] { return readLocal(CALENDAR_STORAGE_KEY, [], isEventArray); }
export function storeEvents(events: CalendarEvent[]) { writeLocal(CALENDAR_STORAGE_KEY, events); }

// ─── Layout snap ──────────────────────────────────────────────────────────────

export const SNAP_GRID = 80;
export function snapVal(v: number): number { return Math.round(v / SNAP_GRID) * SNAP_GRID; }
export function snapItem(item: LayoutItem): LayoutItem {
  return { ...item, x: snapVal(item.x), y: snapVal(item.y), w: snapVal(item.w), h: snapVal(item.h) };
}

// ─── Library ID migration ─────────────────────────────────────────────────────

export const LEGACY_ID_MAP: Record<string, string> = {
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

export function getStoredLibrary(): string[] {
  const stored = readLocal<string[]>(LIBRARY_STORAGE_KEY, [], isStringArray);
  const migrated = stored.map((id) => LEGACY_ID_MAP[id] ?? id);
  const result = migrated.includes('tool.file-finder') ? migrated : ['tool.file-finder', ...migrated];
  if (stored.some((id) => LEGACY_ID_MAP[id] !== undefined) || !migrated.includes('tool.file-finder')) {
    writeLocal(LIBRARY_STORAGE_KEY, result);
  }
  return result;
}
export function storeLibrary(ids: string[]) { writeLocal(LIBRARY_STORAGE_KEY, ids); }
