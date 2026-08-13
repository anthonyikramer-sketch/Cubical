import { useState, useEffect } from 'react';
import {
  Bell, Check, CircleUserRound, ClipboardCopy, House, Info, Lock, Monitor, Moon,
  Plus, RefreshCw, Settings, Sun, X, Zap,
} from 'lucide-react';
import { BackButton } from '../shared/contexts';

// ── Local mirrors of types / storage ─────────────────────────────────────────
// These intentionally duplicate App.tsx definitions so Settings is self-contained.
// They access the SAME localStorage keys so data is shared.

type ThemeMode   = 'light' | 'dark' | 'system';
type StartupPage = 'home' | 'store' | 'library';

interface AppSettings {
  themeMode:           ThemeMode;
  sidebarAutoCollapse: boolean;
  clockSeconds:        boolean;
  soundEnabled:        boolean;
  startupPage:         StartupPage;
}

interface PersonalDetail { key: string; value: string; }

const SETTINGS_KEY      = 'cubical-settings';
const CLOCK_SECONDS_KEY = 'cubical-clock-seconds';
const LAYOUT_STORAGE_KEY = 'cubical-home-layout';
const PFF_MY_DETAILS_KEY = 'cubical-pff-my-details-v1';
const PROFILE_SKIN_KEY   = 'cubical-profile-skin';

const DEFAULT_SETTINGS: AppSettings = {
  themeMode:           'light',
  sidebarAutoCollapse: true,
  clockSeconds:        false,
  soundEnabled:        true,
  startupPage:         'home',
};

const PFF_DEFAULT_DETAIL_KEYS = [
  'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Company', 'Title',
];

type UpdateState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
type UpdateStatusEvent = { type: string; percent?: number; version?: string; message?: string };

declare const __APP_VERSION__: string;

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

function getEquippedCosmetic(): string {
  try { return window.localStorage.getItem(PROFILE_SKIN_KEY) ?? 'default'; } catch { return 'default'; }
}

function applyTheme(skinId: string, _mode: ThemeMode) {
  // Re-apply skin to trigger any theme-mode-aware CSS
  if (skinId === 'default' || !skinId) {
    document.documentElement.removeAttribute('data-skin');
  } else {
    document.documentElement.dataset.skin = skinId;
  }
}

function pffGetMyDetails(): PersonalDetail[] {
  try {
    const raw = window.localStorage.getItem(PFF_MY_DETAILS_KEY);
    if (!raw) return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' }));
    return JSON.parse(raw) as PersonalDetail[];
  } catch { return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' })); }
}

function pffSaveMyDetails(details: PersonalDetail[]) {
  try { window.localStorage.setItem(PFF_MY_DETAILS_KEY, JSON.stringify(details)); } catch {}
}

// ── UpdatePanel ───────────────────────────────────────────────────────────────

function UpdatePanel() {
  const [state,    setState]    = useState<UpdateState>('idle');
  const [version,  setVersion]  = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [message,  setMessage]  = useState<string | null>(null);
  const updater = window.cubicalDesktop?.updater;

  useEffect(() => {
    if (!updater) return;
    const unsub = updater.onStatus((evt: UpdateStatusEvent) => {
      // These names match what main.cjs sendUpdateEvent() actually sends —
      // NOT the raw electron-updater event names (which are longer).
      if (evt.type === 'checking')    { setState('checking'); }
      if (evt.type === 'up-to-date')  { setState('up-to-date'); }
      if (evt.type === 'available')   { setState('available');  setVersion(evt.version ?? null); }
      if (evt.type === 'downloading') { setState('downloading'); setProgress(evt.percent ?? 0); }
      if (evt.type === 'ready')       { setState('ready');      setVersion(evt.version ?? null); }
      if (evt.type === 'error')       { setState('error');      setMessage(evt.message ?? 'Unknown error'); }
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
          <button className="button-quiet" onClick={handleCheck}><RefreshCw className="w-3.5 h-3.5" /> Check for updates</button>
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

// ── My Details card ───────────────────────────────────────────────────────────

function MyDetailsSettingsCard() {
  const [details,    setDetails]    = useState<PersonalDetail[]>(pffGetMyDetails);
  const [newKey,     setNewKey]     = useState('');
  const [copiedIdx,  setCopiedIdx]  = useState<number | null>(null);
  const [copiedAll,  setCopiedAll]  = useState(false);

  const update = (idx: number, value: string) => {
    setDetails((prev) => {
      const next = prev.map((d, i) => i === idx ? { ...d, value } : d);
      pffSaveMyDetails(next);
      return next;
    });
  };

  const updateKey = (idx: number, key: string) => {
    setDetails((prev) => {
      const next = prev.map((d, i) => i === idx ? { ...d, key } : d);
      pffSaveMyDetails(next);
      return next;
    });
  };

  const addRow = () => {
    const key = newKey.trim();
    if (!key) return;
    setDetails((prev) => {
      const next = [...prev, { key, value: '' }];
      pffSaveMyDetails(next);
      return next;
    });
    setNewKey('');
  };

  const removeRow = (idx: number) => {
    setDetails((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      pffSaveMyDetails(next);
      return next;
    });
  };

  const copyRow = (idx: number) => {
    const val = details[idx]?.value;
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1800);
    }).catch(() => {});
  };

  const copyAll = () => {
    const filled = details.filter((d) => d.key.trim() && d.value.trim());
    if (!filled.length) return;
    const text = filled.map((d) => `${d.key}: ${d.value}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }).catch(() => {});
  };

  const filledCount = details.filter((d) => d.value.trim()).length;

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <h2 className="settings-section-title"><CircleUserRound className="w-4 h-4" /> My Details</h2>
      </div>
      <p className="settings-hint">
        Save your name, address, and other details once. PDF Form Filler uses them to autofill matching fields automatically. Use the copy buttons to paste any value into any other form or app. Everything stays on this device.
      </p>
      <div className="my-details-grid">
        {details.map((d, idx) => (
          <div key={idx} className="my-details-row">
            <input
              className="pff-side-input my-details-key-input"
              value={d.key}
              placeholder="Field name"
              onChange={(e) => updateKey(idx, e.target.value)}
              onBlur={(e) => { if (!e.target.value.trim()) removeRow(idx); }}
            />
            <input
              className="pff-side-input my-details-val-input"
              value={d.value}
              placeholder={`Your ${d.key.toLowerCase()}…`}
              onChange={(e) => update(idx, e.target.value)}
            />
            <button
              className={`my-details-copy-btn${copiedIdx === idx ? ' is-copied' : ''}`}
              title={d.value ? `Copy ${d.key}` : 'No value to copy'}
              disabled={!d.value.trim()}
              onClick={() => copyRow(idx)}
            >
              {copiedIdx === idx ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
            </button>
            <button className="my-details-del-btn" title="Remove" onClick={() => removeRow(idx)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="my-details-add-row">
        <input
          className="pff-side-input"
          value={newKey}
          placeholder="New field name…"
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addRow(); }}
          style={{ flex: 1 }}
        />
        <button className="button-quiet" onClick={addRow} disabled={!newKey.trim()}>
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </div>
      {filledCount > 1 && (
        <div className="my-details-copy-all-row">
          <button
            className={`my-details-copy-all-btn${copiedAll ? ' is-copied' : ''}`}
            onClick={copyAll}
          >
            {copiedAll
              ? <><Check className="w-3.5 h-3.5" /> Copied!</>
              : <><ClipboardCopy className="w-3.5 h-3.5" /> Copy all as text</>
            }
          </button>
          <span className="my-details-copy-all-hint">{filledCount} filled {filledCount === 1 ? 'field' : 'fields'}</span>
        </div>
      )}
    </div>
  );
}

// ── Settings page ─────────────────────────────────────────────────────────────

export function SettingsPage() {
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

  const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

  return (
    <section className="settings-page">
      <BackButton />
      <div className="page-intro">
        <div className="eyebrow">Make it yours</div>
        <h1 className="display-title mt-4">Settings.</h1>
      </div>

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

      <MyDetailsSettingsCard />

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
