import { readSettings, isStringArray, readLocal, writeLocal } from './storage';
import type { ThemeMode } from './storage';

// ─── Skin functions ───────────────────────────────────────────────────────────

export function applySkin(skinId: string) {
  if (skinId === 'default' || !skinId) {
    document.documentElement.removeAttribute('data-skin');
  } else {
    document.documentElement.dataset.skin = skinId;
  }
}

export function applyThemeMode(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

// ─── Theme palette system ─────────────────────────────────────────────────────

type ThemeVars = {
  background: string; foreground: string; border: string; input: string; ring: string;
  card: string; 'card-foreground': string; 'card-border': string;
  primary: string; 'primary-foreground': string;
  secondary: string; 'secondary-foreground': string;
  muted: string; 'muted-foreground': string;
  accent: string; 'accent-foreground': string;
};

type ThemePalette = { light: ThemeVars; dark: ThemeVars };

const THEME_PALETTES: Record<string, ThemePalette | null> = {
  'default': null,
  'midnight-office': (() => {
    const v: ThemeVars = { background:'222 35% 10%', foreground:'210 25% 88%', border:'220 20% 22%', input:'220 20% 22%', ring:'210 75% 58%', card:'222 30% 14%', 'card-foreground':'210 25% 88%', 'card-border':'220 20% 22%', primary:'210 75% 58%', 'primary-foreground':'222 35% 10%', secondary:'220 22% 20%', 'secondary-foreground':'210 25% 88%', muted:'220 22% 18%', 'muted-foreground':'215 15% 58%', accent:'210 75% 62%', 'accent-foreground':'222 35% 10%' };
    return { light: v, dark: v };
  })(),
  'cozy-desk': {
    light: { background:'35 55% 95%', foreground:'25 45% 20%', border:'33 30% 84%', input:'33 30% 84%', ring:'25 52% 38%', card:'36 52% 98%', 'card-foreground':'25 45% 20%', 'card-border':'33 30% 84%', primary:'25 52% 38%', 'primary-foreground':'36 52% 98%', secondary:'33 38% 89%', 'secondary-foreground':'25 45% 20%', muted:'33 32% 89%', 'muted-foreground':'25 20% 50%', accent:'32 78% 56%', 'accent-foreground':'25 45% 20%' },
    dark:  { background:'25 30% 11%', foreground:'35 28% 84%', border:'28 20% 20%', input:'28 20% 20%', ring:'25 55% 52%', card:'27 26% 15%', 'card-foreground':'35 28% 84%', 'card-border':'28 20% 20%', primary:'25 55% 55%', 'primary-foreground':'25 30% 11%', secondary:'28 18% 18%', 'secondary-foreground':'35 28% 84%', muted:'28 16% 18%', 'muted-foreground':'25 14% 55%', accent:'32 78% 60%', 'accent-foreground':'25 30% 11%' },
  },
  'retro-terminal': (() => {
    const v: ThemeVars = { background:'120 60% 4%', foreground:'120 85% 68%', border:'120 45% 18%', input:'120 45% 18%', ring:'120 90% 42%', card:'120 45% 7%', 'card-foreground':'120 85% 68%', 'card-border':'120 45% 18%', primary:'120 90% 42%', 'primary-foreground':'120 60% 4%', secondary:'120 30% 10%', 'secondary-foreground':'120 85% 68%', muted:'120 28% 10%', 'muted-foreground':'120 40% 42%', accent:'120 100% 50%', 'accent-foreground':'120 60% 4%' };
    return { light: v, dark: v };
  })(),
  'neon-nights': (() => {
    const v: ThemeVars = { background:'270 70% 5%', foreground:'280 15% 88%', border:'270 42% 18%', input:'270 42% 18%', ring:'300 75% 60%', card:'270 55% 9%', 'card-foreground':'280 15% 88%', 'card-border':'270 42% 18%', primary:'300 75% 60%', 'primary-foreground':'270 70% 5%', secondary:'270 32% 13%', 'secondary-foreground':'280 15% 88%', muted:'270 30% 13%', 'muted-foreground':'270 18% 58%', accent:'185 100% 52%', 'accent-foreground':'270 70% 5%' };
    return { light: v, dark: v };
  })(),
  'forest-mode': (() => {
    const v: ThemeVars = { background:'135 35% 11%', foreground:'120 20% 82%', border:'130 25% 22%', input:'130 25% 22%', ring:'130 48% 50%', card:'133 28% 15%', 'card-foreground':'120 20% 82%', 'card-border':'130 25% 22%', primary:'130 48% 52%', 'primary-foreground':'135 35% 11%', secondary:'130 22% 18%', 'secondary-foreground':'120 20% 82%', muted:'130 20% 18%', 'muted-foreground':'120 14% 52%', accent:'78 55% 52%', 'accent-foreground':'135 35% 11%' };
    return { light: v, dark: v };
  })(),
  'coffee-frame': {
    light: { background:'30 42% 93%', foreground:'25 45% 18%', border:'28 28% 82%', input:'28 28% 82%', ring:'25 55% 35%', card:'30 40% 97%', 'card-foreground':'25 45% 18%', 'card-border':'28 28% 82%', primary:'25 55% 35%', 'primary-foreground':'30 40% 97%', secondary:'28 35% 87%', 'secondary-foreground':'25 45% 18%', muted:'28 32% 87%', 'muted-foreground':'25 18% 50%', accent:'36 75% 60%', 'accent-foreground':'25 45% 18%' },
    dark:  { background:'24 28% 10%', foreground:'30 25% 83%', border:'26 18% 19%', input:'26 18% 19%', ring:'25 58% 50%', card:'25 24% 14%', 'card-foreground':'30 25% 83%', 'card-border':'26 18% 19%', primary:'25 58% 52%', 'primary-foreground':'24 28% 10%', secondary:'26 16% 17%', 'secondary-foreground':'30 25% 83%', muted:'26 14% 17%', 'muted-foreground':'25 12% 54%', accent:'36 75% 62%', 'accent-foreground':'24 28% 10%' },
  },
  'sparkle-trail': {
    light: { background:'275 30% 96%', foreground:'270 40% 18%', border:'275 22% 86%', input:'275 22% 86%', ring:'280 58% 52%', card:'275 28% 98%', 'card-foreground':'270 40% 18%', 'card-border':'275 22% 86%', primary:'280 58% 52%', 'primary-foreground':'275 30% 96%', secondary:'275 22% 90%', 'secondary-foreground':'270 40% 18%', muted:'275 20% 90%', 'muted-foreground':'270 15% 50%', accent:'335 85% 65%', 'accent-foreground':'270 40% 18%' },
    dark:  { background:'268 38% 9%', foreground:'275 18% 86%', border:'268 28% 18%', input:'268 28% 18%', ring:'280 62% 62%', card:'268 32% 13%', 'card-foreground':'275 18% 86%', 'card-border':'268 28% 18%', primary:'280 62% 64%', 'primary-foreground':'268 38% 9%', secondary:'268 22% 16%', 'secondary-foreground':'275 18% 86%', muted:'268 20% 16%', 'muted-foreground':'270 12% 56%', accent:'335 85% 68%', 'accent-foreground':'268 38% 9%' },
  },
  'winter-pack': {
    light: { background:'200 42% 95%', foreground:'210 35% 18%', border:'200 28% 84%', input:'200 28% 84%', ring:'210 62% 45%', card:'200 45% 98%', 'card-foreground':'210 35% 18%', 'card-border':'200 28% 84%', primary:'210 62% 45%', 'primary-foreground':'200 45% 98%', secondary:'200 30% 88%', 'secondary-foreground':'210 35% 18%', muted:'200 28% 88%', 'muted-foreground':'210 15% 50%', accent:'195 68% 52%', 'accent-foreground':'210 35% 18%' },
    dark:  { background:'210 32% 10%', foreground:'200 22% 84%', border:'208 22% 19%', input:'208 22% 19%', ring:'210 65% 55%', card:'210 28% 14%', 'card-foreground':'200 22% 84%', 'card-border':'208 22% 19%', primary:'210 65% 58%', 'primary-foreground':'210 32% 10%', secondary:'208 20% 17%', 'secondary-foreground':'200 22% 84%', muted:'208 18% 17%', 'muted-foreground':'210 12% 55%', accent:'195 68% 56%', 'accent-foreground':'210 32% 10%' },
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

export function applyTheme(cosmeticId: string, themeMode?: ThemeMode) {
  const root = document.documentElement;
  const palette = THEME_PALETTES[cosmeticId] ?? null;
  if (!palette) {
    for (const key of THEME_VAR_KEYS) { root.style.removeProperty(`--${key}`); }
    return;
  }
  const mode = themeMode ?? readSettings().themeMode;
  const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const vars = isDark ? palette.dark : palette.light;
  for (const key of THEME_VAR_KEYS) { root.style.setProperty(`--${key}`, vars[key]); }
}

// ─── Cosmetic storage ─────────────────────────────────────────────────────────

const OWNED_COSMETICS_KEY   = 'cubical-owned-cosmetics';
const EQUIPPED_COSMETIC_KEY = 'cubical-equipped-cosmetic';

export function getOwnedCosmetics(): string[] {
  return readLocal<string[]>(OWNED_COSMETICS_KEY, ['default'], isStringArray);
}
export function getEquippedCosmetic(): string {
  try { return localStorage.getItem(EQUIPPED_COSMETIC_KEY) ?? 'default'; } catch { return 'default'; }
}
export function storeOwnedCosmetics(ids: string[]) { writeLocal(OWNED_COSMETICS_KEY, ids); }
export function storeEquippedCosmetic(id: string) { try { localStorage.setItem(EQUIPPED_COSMETIC_KEY, id); } catch {} }
