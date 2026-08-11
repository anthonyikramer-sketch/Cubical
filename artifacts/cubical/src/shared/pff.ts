// ─── PDF Form Filler — types & storage ───────────────────────────────────────

export type PffFieldType = 'text' | 'number' | 'date' | 'checkbox';
export type PffAlign    = 'left' | 'center' | 'right';
export type PffMode     = 'select' | 'add' | 'add-checkbox';

export interface PffField {
  id:         string;
  pageIndex:  number;
  xPct:       number;
  yPct:       number;
  wPct:       number;
  hPct:       number;
  value:      string;
  fontSize:   number;
  align:      PffAlign;
  color:      string;
  label:      string;
  type:       PffFieldType;
  isDetected: boolean;
}

export interface PffTemplate {
  id:        string;
  name:      string;
  pdfKey:    string;
  createdAt: number;
  fields:    Omit<PffField, 'value'>[];
  stamps?:   string[];
}

export interface PersonalDetail {
  key:   string;
  value: string;
}

export const PFF_TEMPLATES_KEY  = 'cubical-pff-templates-v1';
export const PFF_STAMPS_KEY     = 'cubical-pff-stamps-v1';
export const PFF_MY_DETAILS_KEY = 'cubical-pff-my-details-v1';
export const PFF_MAX_STAMPS     = 10;

export const PFF_DEFAULT_DETAIL_KEYS = [
  'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Company', 'Title',
];

export function pffGetMyDetails(): PersonalDetail[] {
  try {
    const raw = window.localStorage.getItem(PFF_MY_DETAILS_KEY);
    if (!raw) return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' }));
    return JSON.parse(raw) as PersonalDetail[];
  } catch { return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' })); }
}

export function pffSaveMyDetails(details: PersonalDetail[]) {
  try { window.localStorage.setItem(PFF_MY_DETAILS_KEY, JSON.stringify(details)); } catch {}
}

export function pffMatchDetail(label: string, details: PersonalDetail[]): PersonalDetail | undefined {
  if (!label.trim()) return undefined;
  const lnorm = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return details.find((d) => {
    if (!d.value.trim()) return false;
    const knorm = d.key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return lnorm.includes(knorm) || knorm.includes(lnorm);
  });
}

export const PFF_LABEL_KEYWORDS = [
  'name','date','address','phone','email','project','signature','initials',
  'notes','total','city','state','zip','company','title','department',
  'description','amount','qty','price','foreman','location','contact',
  'fax','website','number','ref','reference','id','po','invoice',
  'crew','hours','size','supervisor','manager','owner','client',
];

export const PFF_COLORS = [
  { hex: '#000000', label: 'Black'     },
  { hex: '#cc2222', label: 'Red'       },
  { hex: '#1a5fb4', label: 'Blue'      },
  { hex: '#2d7d2d', label: 'Green'     },
  { hex: '#555555', label: 'Dark gray' },
  { hex: '#7b2fa3', label: 'Purple'    },
];

export function pffId() { return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

export function pffHexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

export function pffGetTemplates(): PffTemplate[] {
  try { return JSON.parse(window.localStorage.getItem(PFF_TEMPLATES_KEY) ?? '[]') as PffTemplate[]; }
  catch { return []; }
}
export function pffSaveTemplates(ts: PffTemplate[]) {
  try { window.localStorage.setItem(PFF_TEMPLATES_KEY, JSON.stringify(ts)); } catch {}
}
export function pffGetStamps(pdfKey: string): string[] {
  try { return (JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string,string[]>)[pdfKey] ?? []; }
  catch { return []; }
}
export function pffSaveStamps(pdfKey: string, stamps: string[]) {
  try {
    const all = JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string,string[]>;
    all[pdfKey] = stamps;
    window.localStorage.setItem(PFF_STAMPS_KEY, JSON.stringify(all));
  } catch {}
}
