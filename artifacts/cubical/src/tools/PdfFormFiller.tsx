import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle, AlignCenter, AlignLeft, AlignRight, BookOpen, Check,
  ChevronLeft, ChevronRight, CircleUserRound, Download, FilePlus2, Files,
  FormInput, ListChecks, Minus, MousePointer2, Plus, Search, Stamp, Trash2, X,
} from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

// ── Types & constants ─────────────────────────────────────────────────────────
type PffFieldType = 'text' | 'number' | 'date' | 'checkbox';
type PffAlign    = 'left' | 'center' | 'right';
type PffMode     = 'select' | 'add' | 'add-checkbox';

interface PffField {
  id:        string;
  pageIndex: number;
  xPct:      number;
  yPct:      number;
  wPct:      number;
  hPct:      number;
  value:     string;
  fontSize:  number;
  align:     PffAlign;
  color:     string;
  label:     string;
  type:      PffFieldType;
}

interface PffStamp {
  text:     string;
  fontSize: number;
  color:    string;
}

interface PffTemplate {
  id:        string;
  name:      string;
  pdfKey:    string;
  createdAt: number;
  fields:    Omit<PffField, 'value'>[];
  stamps?:   PffStamp[];
}

interface PersonalDetail { key: string; value: string; }

interface PffFindMatch {
  pageIndex: number;
  xPct:      number;
  yPct:      number;
  wPct:      number;
  hPct:      number;
}

interface PffFindSpan {
  str:       string;
  x:         number;
  y:         number;
  w:         number;
  h:         number;
  pageW:     number;
  pageH:     number;
  charStart: number;
  charEnd:   number;
}

interface PffFindPage {
  pageIndex: number;
  spans:     PffFindSpan[];
  fullText:  string;
}

const PFF_TEMPLATES_KEY  = 'cubical-pff-templates-v1';
const PFF_STAMPS_KEY     = 'cubical-pff-stamps-v1';
const PFF_MY_DETAILS_KEY = 'cubical-pff-my-details-v1';
const PFF_MAX_STAMPS     = 10;

const PFF_STAMP_FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24];

const PFF_DEFAULT_DETAIL_KEYS = [
  'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Company', 'Title',
];

const PFF_COLORS = [
  { hex: '#000000', label: 'Black'     },
  { hex: '#cc2222', label: 'Red'       },
  { hex: '#1a5fb4', label: 'Blue'      },
  { hex: '#2d7d2d', label: 'Green'     },
  { hex: '#555555', label: 'Dark gray' },
  { hex: '#7b2fa3', label: 'Purple'    },
];

function pffId() { return `pf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }

function pffHexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
}

function pffGetMyDetails(): PersonalDetail[] {
  try {
    const raw = window.localStorage.getItem(PFF_MY_DETAILS_KEY);
    if (!raw) return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' }));
    return JSON.parse(raw) as PersonalDetail[];
  } catch { return PFF_DEFAULT_DETAIL_KEYS.map((key) => ({ key, value: '' })); }
}

function pffMatchDetail(label: string, details: PersonalDetail[]): PersonalDetail | undefined {
  if (!label.trim()) return undefined;
  const lnorm = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return details.find((d) => {
    if (!d.value.trim()) return false;
    const knorm = d.key.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return lnorm.includes(knorm) || knorm.includes(lnorm);
  });
}

function pffGetTemplates(): PffTemplate[] {
  try { return JSON.parse(window.localStorage.getItem(PFF_TEMPLATES_KEY) ?? '[]') as PffTemplate[]; }
  catch { return []; }
}

function pffSaveTemplates(ts: PffTemplate[]) {
  try { window.localStorage.setItem(PFF_TEMPLATES_KEY, JSON.stringify(ts)); } catch {}
}

/** Load stamps from localStorage, migrating legacy string[] entries to PffStamp[]. */
function pffGetStamps(pdfKey: string): PffStamp[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string, unknown[]>;
    const raw = all[pdfKey] ?? [];
    return raw.map((s) =>
      typeof s === 'string'
        ? { text: s, fontSize: 12, color: '#000000' }
        : (s as PffStamp),
    );
  } catch { return []; }
}

function pffSaveStamps(pdfKey: string, stamps: PffStamp[]) {
  try {
    const all = JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string, PffStamp[]>;
    all[pdfKey] = stamps;
    window.localStorage.setItem(PFF_STAMPS_KEY, JSON.stringify(all));
  } catch {}
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PdfFormFiller() {
  const [pdfBytes,     setPdfBytes]     = useState<Uint8Array | null>(null);
  const [pdfProxy,     setPdfProxy]     = useState<any>(null);
  const [pageCount,    setPageCount]    = useState(0);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [scale,        setScale]        = useState(1.4);
  const [fields,       setFields]       = useState<PffField[]>([]);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [mode,         setMode]         = useState<PffMode>('select');
  const [exporting,    setExporting]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [pdfFileName,  setPdfFileName]  = useState('');
  const [pdfFileSize,  setPdfFileSize]  = useState(0);
  const [pdfjsLib,     setPdfjsLib]     = useState<any>(null);

  // Stamp state
  const [stamps,          setStamps]          = useState<PffStamp[]>([]);
  const [stampMode,       setStampMode]       = useState<PffStamp | null>(null);
  const [showStampPopout, setShowStampPopout] = useState(false);
  const [stampInput,      setStampInput]      = useState('');
  const [stampFontSize,   setStampFontSize]   = useState(12);
  const [stampColor,      setStampColor]      = useState('#000000');
  const stampBtnRef   = useRef<HTMLButtonElement>(null);

  // Templates
  const [templates,     setTemplates]    = useState<PffTemplate[]>(pffGetTemplates);
  const [showTplPanel,  setShowTplPanel] = useState(false);
  const [tplNameInput,  setTplNameInput] = useState('');
  const [offerTemplate, setOfferTemplate] = useState<PffTemplate | null>(null);

  // My Details
  const [myDetails, setMyDetails] = useState<PersonalDetail[]>(pffGetMyDetails);

  // Keep myDetails in sync when the user edits them in another tab / Settings panel
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PFF_MY_DETAILS_KEY) {
        setMyDetails(pffGetMyDetails());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Find
  const [showFind,    setShowFind]    = useState(false);
  const [findQuery,   setFindQuery]   = useState('');
  const [findMatches, setFindMatches] = useState<PffFindMatch[]>([]);
  const [findIndex,   setFindIndex]   = useState(0);
  const findCacheRef  = useRef<PffFindPage[] | null>(null);
  const findInputRef  = useRef<HTMLInputElement>(null);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const dragRef   = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef = useRef<{ id: string; startX: number; startY: number; ow: number; oh: number } | null>(null);

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  useEffect(() => {
    import('pdfjs-dist').then((lib: any) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      setPdfjsLib(lib);
    });
  }, []);

  useEffect(() => {
    if (!pdfProxy) return;
    void renderPage(pdfProxy, currentPage, scale);
  }, [pdfProxy, currentPage, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard: Delete, Escape, Ctrl+F
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Delete selected field
      if ((e.key === 'Delete' || e.key === 'Backspace') && !showFind) {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if (!selectedId) return;
        setFields((prev) => prev.filter((f) => f.id !== selectedId));
        setSelectedId(null);
        return;
      }
      // Ctrl+F / Cmd+F → open Find
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        if (!pdfProxy) return;
        e.preventDefault();
        openFind();
        return;
      }
      // Escape
      if (e.key === 'Escape') {
        setStampMode(null);
        setMode('select');
        setShowStampPopout(false);
        closeFind();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, showFind, pdfProxy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close stamp popout on outside click
  useEffect(() => {
    if (!showStampPopout) return;
    const handler = (e: MouseEvent) => {
      const popout = document.getElementById('pff-stamp-popout');
      if (popout && !popout.contains(e.target as Node) && !stampBtnRef.current?.contains(e.target as Node)) {
        setShowStampPopout(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStampPopout]);

  // ── PDF rendering ───────────────────────────────────────────────────────────

  const renderPage = async (doc: any, pageNum: number, sc: number) => {
    if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const page = await doc.getPage(pageNum);
    const vp   = page.getViewport({ scale: sc });
    canvas.width  = vp.width;
    canvas.height = vp.height;
    const ctx  = canvas.getContext('2d')!;
    const task = page.render({ canvasContext: ctx, viewport: vp });
    renderTaskRef.current = task;
    try { await task.promise; } catch { /* cancelled */ }
  };

  const loadPdf = async (file: File) => {
    if (!pdfjsLib) { setError('PDF engine is still loading — please try again in a moment.'); return; }
    setError(null);
    setFields([]);
    setSelectedId(null);
    setOfferTemplate(null);
    setStampMode(null);
    setPdfFileName(file.name);
    setPdfFileSize(file.size);
    findCacheRef.current = null;
    setFindMatches([]);
    setFindIndex(0);
    setShowFind(false);
    const pdfKey = `${file.name}::${file.size}`;
    setStamps(pffGetStamps(pdfKey));
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPdfBytes(bytes);
      const doc = await pdfjsLib.getDocument({ data: bytes }).promise;
      setPdfProxy(doc);
      setPageCount(doc.numPages);
      setCurrentPage(1);
      const matching = pffGetTemplates().find((t) => t.pdfKey === pdfKey);
      if (matching) setOfferTemplate(matching);
    } catch {
      setError('Could not read this PDF. It may be corrupted or password-protected.');
    }
  };

  // ── Find ────────────────────────────────────────────────────────────────────

  const buildFindCache = async (): Promise<PffFindPage[]> => {
    if (!pdfProxy) return [];
    const cache: PffFindPage[] = [];
    for (let p = 1; p <= pageCount; p++) {
      const page = await pdfProxy.getPage(p);
      const vp   = page.getViewport({ scale: 1 });
      const pageW = vp.width;
      const pageH = vp.height;
      const tc = await page.getTextContent();
      const spans: PffFindSpan[] = [];
      let charPos = 0;
      let fullText = '';
      for (const item of (tc.items as any[])) {
        const str = item.str ?? '';
        const x   = item.transform[4] as number;
        const y   = item.transform[5] as number;
        const w   = (item.width  as number) || str.length * 6;
        const h   = (item.height as number) || 12;
        spans.push({ str, x, y, w, h, pageW, pageH, charStart: charPos, charEnd: charPos + str.length });
        fullText += str;
        charPos  += str.length;
      }
      cache.push({ pageIndex: p - 1, spans, fullText });
    }
    findCacheRef.current = cache;
    return cache;
  };

  const runFind = async (query: string) => {
    if (!query.trim() || !pdfProxy) { setFindMatches([]); setFindIndex(0); return; }
    const cache = findCacheRef.current ?? await buildFindCache();
    const q       = query.toLowerCase();
    const matches: PffFindMatch[] = [];
    for (const pg of cache) {
      const text = pg.fullText.toLowerCase();
      let idx = 0;
      while (true) {
        const pos = text.indexOf(q, idx);
        if (pos === -1) break;
        // Find the span that starts at or contains this position
        const span = pg.spans.find((s) => s.charStart <= pos && s.charEnd > pos)
                  ?? pg.spans.find((s) => s.charStart >= pos && s.charStart < pos + q.length);
        if (span) {
          matches.push({
            pageIndex: pg.pageIndex,
            xPct:  span.x / span.pageW,
            yPct:  Math.max(0, (span.pageH - span.y - span.h) / span.pageH),
            wPct:  Math.min(span.w / span.pageW, 0.5),
            hPct:  Math.min(span.h / span.pageH + 0.005, 0.1),
          });
        }
        idx = pos + 1;
      }
    }
    setFindMatches(matches);
    setFindIndex(0);
    if (matches.length > 0) navigateToMatchImmediate(0, matches);
  };

  const navigateToMatchImmediate = (idx: number, matches?: PffFindMatch[]) => {
    const list  = matches ?? findMatches;
    const match = list[idx];
    if (!match) return;
    setFindIndex(idx);
    if (match.pageIndex !== currentPage - 1) setCurrentPage(match.pageIndex + 1);
    // Scroll the match into view after a brief render delay
    setTimeout(() => {
      const scroll = canvasScrollRef.current;
      const wrap   = containerRef.current;
      if (!scroll || !wrap) return;
      const targetY = match.yPct * wrap.offsetHeight - scroll.clientHeight / 3;
      scroll.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
    }, 60);
  };

  const openFind = () => {
    setShowFind(true);
    setTimeout(() => findInputRef.current?.focus(), 30);
  };

  const closeFind = () => {
    setShowFind(false);
    setFindQuery('');
    setFindMatches([]);
    setFindIndex(0);
  };

  const stepFind = (dir: 1 | -1) => {
    if (!findMatches.length) return;
    const next = (findIndex + dir + findMatches.length) % findMatches.length;
    navigateToMatchImmediate(next);
  };

  // ── Export ──────────────────────────────────────────────────────────────────

  const exportPdf = async () => {
    if (!pdfBytes) return;
    setExporting(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const doc  = await PDFDocument.load(pdfBytes);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const pages = doc.getPages();
      for (const field of fields) {
        const pg = pages[field.pageIndex];
        if (!pg) continue;
        const { width, height } = pg.getSize();
        if (field.type === 'checkbox') {
          const form = doc.getForm();
          const bx = field.xPct * width;
          const by = height - (field.yPct + field.hPct) * height;
          const fw = field.wPct * width;
          const fh = field.hPct * height;
          const cbName = `cb_${field.pageIndex}_${field.id ?? Math.random().toString(36).slice(2)}`;
          try {
            const cb = form.createCheckBox(cbName);
            cb.addToPage(pg, { x: bx, y: by, width: fw, height: fh });
            if (field.value === 'checked') cb.check();
          } catch { /* skip */ }
        } else {
          if (!field.value.trim()) continue;
          const x = field.xPct * width + 2;
          const y = height - (field.yPct + field.hPct) * height + 2;
          const [r, g, b] = pffHexToRgb(field.color ?? '#000000');
          try {
            pg.drawText(field.value, { x, y, size: field.fontSize, font, color: rgb(r, g, b), maxWidth: field.wPct * width - 4 });
          } catch { /* skip */ }
        }
      }
      const uri = await doc.saveAsBase64({ dataUri: true });
      const a = document.createElement('a');
      a.href = uri; a.download = `filled-${pdfFileName}`; a.click();
    } catch { setError('Export failed. Please try again.'); }
    finally   { setExporting(false); }
  };

  const pdfKey = pdfFileName ? `${pdfFileName}::${pdfFileSize}` : '';

  // ── Stamps ──────────────────────────────────────────────────────────────────

  const addStamp = () => {
    const text = stampInput.trim();
    if (!text) return;
    if (stamps.some((s) => s.text === text && s.fontSize === stampFontSize && s.color === stampColor)) {
      setStampInput('');
      return;
    }
    if (stamps.length >= PFF_MAX_STAMPS) { setError(`Stamp limit reached (max ${PFF_MAX_STAMPS}). Remove a stamp first.`); return; }
    const newStamp: PffStamp = { text, fontSize: stampFontSize, color: stampColor };
    const next = [...stamps, newStamp];
    setStamps(next);
    if (pdfKey) pffSaveStamps(pdfKey, next);
    setStampInput(''); // only clear text; color + size persist
  };

  const removeStamp = (stamp: PffStamp) => {
    const next = stamps.filter((s) => s !== stamp);
    setStamps(next);
    if (stampMode === stamp) setStampMode(null);
    if (pdfKey) pffSaveStamps(pdfKey, next);
  };

  const selectStamp = (stamp: PffStamp) => {
    setStampMode(stamp);
    setShowStampPopout(false);
    setMode('select');
  };

  // ── Templates ───────────────────────────────────────────────────────────────

  const saveTemplate = () => {
    if (!tplNameInput.trim() || !pdfFileName) return;
    const tpl: PffTemplate = {
      id: pffId(), name: tplNameInput.trim(), pdfKey, createdAt: Date.now(),
      fields: fields.map(({ value: _v, ...rest }) => rest),
      stamps,
    };
    const existing = pffGetTemplates();
    const updated  = [...existing.filter((t) => !(t.pdfKey === pdfKey && t.name === tpl.name)), tpl];
    pffSaveTemplates(updated);
    setTemplates(updated);
    setTplNameInput('');
    setShowTplPanel(false);
  };

  const loadTemplate = (tpl: PffTemplate) => {
    setFields(tpl.fields.map((f) => ({ ...f, color: f.color ?? '#000000', value: '' })));
    if (tpl.stamps) {
      // Migrate legacy string[] stamps if needed
      const migrated: PffStamp[] = tpl.stamps.map((s) =>
        typeof s === 'string'
          ? { text: s as unknown as string, fontSize: 12, color: '#000000' }
          : s,
      );
      setStamps(migrated);
      if (pdfKey) pffSaveStamps(pdfKey, migrated);
    }
    setOfferTemplate(null);
    setShowTplPanel(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    pffSaveTemplates(updated);
    setTemplates(updated);
  };

  // ── Field helpers ────────────────────────────────────────────────────────────

  const makeField = (xPct: number, yPct: number, value = '', label = ''): PffField => ({
    id: pffId(), pageIndex: currentPage - 1,
    xPct: Math.max(0, Math.min(0.94, xPct)),
    yPct: Math.max(0, Math.min(0.94, yPct)),
    wPct: 0.18, hPct: 0.028, value, fontSize: 12, align: 'left', color: '#000000', label, type: 'text',
  });

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const xPct = e.nativeEvent.offsetX / canvas.offsetWidth;
    const yPct = e.nativeEvent.offsetY / canvas.offsetHeight;

    if (stampMode !== null) {
      const f: PffField = {
        ...makeField(xPct, yPct, stampMode.text, stampMode.text),
        fontSize: stampMode.fontSize,
        color:    stampMode.color,
      };
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      // Stamp mode stays active for repeated placement
      return;
    }

    if (mode === 'add') {
      const f = makeField(xPct, yPct);
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      setMode('select');
      return;
    }

    if (mode === 'add-checkbox') {
      const f: PffField = {
        id: pffId(), pageIndex: currentPage - 1,
        xPct: Math.max(0, xPct - 0.015),
        yPct: Math.max(0, yPct - 0.015),
        wPct: 0.035, hPct: 0.035,
        value: 'checked', // default to checked
        fontSize: 12, align: 'left', color: '#000000', label: '', type: 'checkbox',
      };
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      // Checkbox mode stays active for repeated placement
      return;
    }
  };

  const updateField    = (id: string, patch: Partial<PffField>) =>
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  const deleteField    = (id: string) => { setFields((prev) => prev.filter((f) => f.id !== id)); if (selectedId === id) setSelectedId(null); };
  const duplicateField = (field: PffField) => {
    const dup: PffField = { ...field, id: pffId(), xPct: field.xPct + 0.02, yPct: field.yPct + 0.02, value: '' };
    setFields((prev) => [...prev, dup]);
    setSelectedId(dup.id);
  };

  // ── Drag / resize ────────────────────────────────────────────────────────────

  const handleFieldPtrDown = (e: React.PointerEvent, field: PffField) => {
    if (!containerRef.current) return;
    e.preventDefault(); e.stopPropagation();
    setSelectedId(field.id);
    dragRef.current = { id: field.id, startX: e.clientX, startY: e.clientY, ox: field.xPct, oy: field.yPct };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleFieldPtrMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    const r     = containerRef.current.getBoundingClientRect();
    const dxPct = (e.clientX - dragRef.current.startX) / r.width;
    const dyPct = (e.clientY - dragRef.current.startY) / r.height;
    updateField(dragRef.current.id, {
      xPct: Math.max(0, Math.min(0.95, dragRef.current.ox + dxPct)),
      yPct: Math.max(0, Math.min(0.95, dragRef.current.oy + dyPct)),
    });
  };
  const handleFieldPtrUp = () => { dragRef.current = null; };

  const handleResizePtrDown = (e: React.PointerEvent, field: PffField) => {
    e.preventDefault(); e.stopPropagation();
    resizeRef.current = { id: field.id, startX: e.clientX, startY: e.clientY, ow: field.wPct, oh: field.hPct };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const handleResizePtrMove = (e: React.PointerEvent) => {
    if (!resizeRef.current || !containerRef.current) return;
    const r     = containerRef.current.getBoundingClientRect();
    const dwPct = (e.clientX - resizeRef.current.startX) / r.width;
    const dhPct = (e.clientY - resizeRef.current.startY) / r.height;
    updateField(resizeRef.current.id, {
      wPct: Math.max(0.04, resizeRef.current.ow + dwPct),
      hPct: Math.max(0.02, resizeRef.current.oh + dhPct),
    });
  };
  const handleResizePtrUp = () => { resizeRef.current = null; };

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedField     = fields.find((f) => f.id === selectedId);
  const pageFields        = fields.filter((f) => f.pageIndex === currentPage - 1);
  const pageMatches       = findMatches.filter((m) => m.pageIndex === currentPage - 1);
  const isPlacingStamp    = stampMode !== null;
  const isAddMode         = mode === 'add';
  const isAddCheckboxMode = mode === 'add-checkbox';
  const canvasClass       = `pff-canvas${isAddMode || isAddCheckboxMode || isPlacingStamp ? ' pff-canvas--add' : ''}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <section className="renamer-page pff-page" data-testid="pdf-form-filler">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(210 60% 42%)', background: 'hsl(210 60% 42% / .11)' }}><FormInput /></span>
            <div><h1>PDF Form Filler.</h1><p>Fill in forms, place stamps, export a finished PDF.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />

      {/* ── Toolbar ── */}
      <div className="pff-toolbar">
        <label className="pff-toolbar-btn" title="Open PDF">
          <FilePlus2 className="w-4 h-4" /><span>Open PDF</span>
          <input type="file" accept="application/pdf" className="sr-only"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPdf(f); e.target.value = ''; }} />
        </label>

        {pdfProxy && (<>
          <div className="pff-toolbar-sep" />
          <button className="pff-toolbar-icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} title="Previous page"><ChevronLeft /></button>
          <span className="pff-page-label">{currentPage} / {pageCount}</span>
          <button className="pff-toolbar-icon" onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} title="Next page"><ChevronRight /></button>
          <button className="pff-toolbar-icon" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))} title="Zoom out"><Minus /></button>
          <span className="pff-page-label">{Math.round(scale * 100)}%</span>
          <button className="pff-toolbar-icon" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))} title="Zoom in"><Plus /></button>
          <button className="pff-toolbar-icon" onClick={() => setScale(1.4)} title="Fit page">↔</button>
          <div className="pff-toolbar-sep" />

          {/* Mode buttons */}
          <button
            className={`pff-toolbar-btn${!isAddMode && !isAddCheckboxMode && !isPlacingStamp ? ' active' : ''}`}
            onClick={() => { setMode('select'); setStampMode(null); }}
            title="Select / move fields">
            <MousePointer2 className="w-4 h-4" /><span>Select</span>
          </button>
          <button
            className={`pff-toolbar-btn${isAddMode ? ' active' : ''}`}
            onClick={() => { setMode('add'); setStampMode(null); setShowStampPopout(false); }}
            title="Click on the PDF to add a text field">
            <Plus className="w-4 h-4" /><span>Add Field</span>
          </button>

          {/* Stamp Box | Checkbox split control */}
          <div className="pff-sg-group">
            <div className="pff-stamp-wrap">
              <button
                ref={stampBtnRef}
                className={`pff-sg-left pff-toolbar-btn${isPlacingStamp ? ' active' : ''}`}
                onClick={() => { setShowStampPopout((v) => !v); }}
                title="Stamp Box">
                <Stamp className="w-4 h-4" />
                <span>{isPlacingStamp ? `Stamp: ${stampMode!.text}` : 'Stamp Box'}</span>
              </button>
              {showStampPopout && (
                <div id="pff-stamp-popout" className="pff-stamp-popout">
                  <div className="pff-stamp-popout-header">Stamp Box</div>

                  {/* Color swatches */}
                  <div className="pff-stamp-meta">
                    <div className="pff-stamp-meta-label">Color</div>
                    <div className="pff-color-swatches">
                      {PFF_COLORS.map(({ hex, label }) => (
                        <button
                          key={hex}
                          className={`pff-color-swatch${stampColor === hex ? ' active' : ''}`}
                          style={{ background: hex }}
                          title={label}
                          onClick={() => setStampColor(hex)} />
                      ))}
                    </div>
                  </div>

                  {/* Font size selector */}
                  <div className="pff-stamp-meta">
                    <div className="pff-stamp-meta-label">Size</div>
                    <select
                      className="pff-stamp-size-select"
                      value={stampFontSize}
                      onChange={(e) => setStampFontSize(Number(e.target.value))}>
                      {PFF_STAMP_FONT_SIZES.map((sz) => (
                        <option key={sz} value={sz}>{sz} pt</option>
                      ))}
                    </select>
                  </div>

                  {/* Text input */}
                  <div className="pff-stamp-new">
                    <input
                      className="pff-side-input"
                      type="text"
                      placeholder="Create a stamp…"
                      value={stampInput}
                      onChange={(e) => setStampInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addStamp(); }}
                      autoFocus />
                  </div>

                  {/* Stamp list */}
                  {stamps.length === 0 ? (
                    <p className="pff-stamp-empty">No stamps yet — type above and press Enter.</p>
                  ) : (
                    <ul className="pff-stamp-list">
                      {stamps.map((s, i) => (
                        <li
                          key={i}
                          className={`pff-stamp-item${stampMode === s ? ' active' : ''}`}
                          onClick={() => selectStamp(s)}>
                          <span
                            className="pff-stamp-color-dot"
                            style={{ background: s.color }} />
                          <span className="pff-stamp-text">{s.text}</span>
                          <span className="pff-stamp-size-badge">{s.fontSize}pt</span>
                          <button
                            className="pff-stamp-del"
                            title="Remove stamp"
                            onClick={(e) => { e.stopPropagation(); removeStamp(s); }}>×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {stamps.length >= PFF_MAX_STAMPS && (
                    <p className="pff-stamp-limit">Limit reached ({PFF_MAX_STAMPS} stamps max)</p>
                  )}
                </div>
              )}
            </div>

            <button
              className={`pff-sg-right pff-toolbar-btn${isAddCheckboxMode ? ' active' : ''}`}
              onClick={() => { setMode('add-checkbox'); setStampMode(null); setShowStampPopout(false); }}
              title="Click on the PDF to place a checkbox">
              <ListChecks className="w-4 h-4" /><span>Checkbox</span>
            </button>
          </div>

          <div className="pff-toolbar-sep" />

          {/* Fill All */}
          {(() => {
            const fillableCount = fields.filter((f) => f.type !== 'checkbox' && pffMatchDetail(f.label, myDetails) && !f.value.trim()).length;
            return fillableCount > 0 ? (
              <button
                className="pff-toolbar-btn pff-toolbar-btn--autofill"
                title={`Fill ${fillableCount} field${fillableCount !== 1 ? 's' : ''} from My Details`}
                onClick={() => setFields((prev) => prev.map((f) => {
                  if (f.type === 'checkbox' || f.value.trim()) return f;
                  const match = pffMatchDetail(f.label, myDetails);
                  return match ? { ...f, value: match.value } : f;
                }))}>
                <CircleUserRound className="w-4 h-4" /><span>Fill All ({fillableCount})</span>
              </button>
            ) : null;
          })()}

          {/* Find */}
          <button
            className={`pff-toolbar-btn${showFind ? ' active' : ''}`}
            onClick={() => showFind ? closeFind() : openFind()}
            title="Find text in PDF (Ctrl+F)">
            <Search className="w-4 h-4" /><span>Find</span>
          </button>

          {/* Templates */}
          <button className="pff-toolbar-btn" onClick={() => setShowTplPanel((v) => !v)} title="Templates">
            <BookOpen className="w-4 h-4" /><span>Templates</span>
          </button>

          {/* Export */}
          <button
            className="pff-toolbar-btn pff-toolbar-btn--primary"
            onClick={() => void exportPdf()}
            disabled={exporting || !fields.some((f) => f.type === 'checkbox' ? f.value === 'checked' : f.value.trim())}
            title="Export filled PDF">
            <Download className="w-4 h-4" /><span>{exporting ? 'Exporting…' : 'Export PDF'}</span>
          </button>
        </>)}
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="pff-error">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
          <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── Template offer banner ── */}
      {offerTemplate && (
        <div className="pff-offer-banner">
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>Template <strong>"{offerTemplate.name}"</strong> found for this PDF.</span>
          <button className="button-quiet" onClick={() => loadTemplate(offerTemplate)}>Apply template</button>
          <button className="pff-offer-dismiss" onClick={() => setOfferTemplate(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── Find bar ── */}
      {showFind && (
        <div className="pff-find-bar">
          <Search className="w-4 h-4 pff-find-icon" />
          <input
            ref={findInputRef}
            className="pff-find-input"
            type="text"
            placeholder="Find in PDF…"
            value={findQuery}
            onChange={(e) => { setFindQuery(e.target.value); void runFind(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter')        { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
              if (e.key === 'Escape')       { closeFind(); }
              if (e.key === 'F' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); findInputRef.current?.select(); }
            }} />
          {findQuery && (
            <span className="pff-find-count">
              {findMatches.length === 0 ? 'No results' : `${findIndex + 1} / ${findMatches.length}`}
            </span>
          )}
          <button className="pff-find-nav" onClick={() => stepFind(-1)} disabled={findMatches.length === 0} title="Previous result (Shift+Enter)">↑</button>
          <button className="pff-find-nav" onClick={() => stepFind(1)}  disabled={findMatches.length === 0} title="Next result (Enter)">↓</button>
          <button className="pff-find-close" onClick={closeFind} title="Close find bar"><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* ── Drop zone / Editor ── */}
      {!pdfProxy ? (
        <div
          className="toolbox-drop-panel"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') void loadPdf(f); }}>
          <div className="empty-cube"><FormInput /></div>
          <h2>Open a PDF to get started.</h2>
          <p>Drop a PDF here, or use "Open PDF" above. Fill fields, place stamps, and export — all locally, nothing leaves your device.</p>
          <label className="file-picker" style={{ marginTop: 16 }}>
            <FilePlus2 /><span>Browse for a PDF</span>
            <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPdf(f); e.target.value = ''; }} />
          </label>
        </div>
      ) : (
        <div className="pff-editor-layout">
          <div className="pff-canvas-scroll" ref={canvasScrollRef}>
            <div
              className="pff-canvas-wrap"
              ref={containerRef}
              onPointerMove={(e) => { handleFieldPtrMove(e); handleResizePtrMove(e); }}
              onPointerUp={() => { handleFieldPtrUp(); handleResizePtrUp(); }}>
              <canvas ref={canvasRef} className={canvasClass} onClick={handleCanvasClick} />

              {/* Find highlights */}
              {pageMatches.map((m, i) => (
                <div
                  key={i}
                  className={`pff-find-hl${i === findIndex ? ' is-current' : ''}`}
                  style={{
                    left:   `${m.xPct * 100}%`,
                    top:    `${m.yPct * 100}%`,
                    width:  `${m.wPct * 100}%`,
                    height: `${m.hPct * 100}%`,
                  }} />
              ))}

              {/* Fields */}
              {pageFields.map((field) => {
                const isSelected = field.id === selectedId;
                const isChecked  = field.value === 'checked';
                return (
                  <div
                    key={field.id}
                    className={`pff-field${field.type === 'checkbox' ? ' pff-field--checkbox' : ''}${isSelected ? ' is-selected' : ''}`}
                    style={{ left: `${field.xPct * 100}%`, top: `${field.yPct * 100}%`, width: `${field.wPct * 100}%`, height: `${field.hPct * 100}%` }}
                    onPointerDown={(e) => handleFieldPtrDown(e, field)}>
                    {field.type === 'checkbox' ? (
                      <button
                        className={`pff-checkbox-btn${isChecked ? ' is-checked' : ''}`}
                        title={field.label || (isChecked ? 'Checked — click to uncheck' : 'Unchecked — click to check')}
                        onClick={(e) => { e.stopPropagation(); updateField(field.id, { value: isChecked ? '' : 'checked' }); }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onFocus={() => setSelectedId(field.id)}>
                        {isChecked && <Check className="pff-checkbox-tick" />}
                      </button>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        className="pff-field-input"
                        placeholder={field.label || ''}
                        value={field.value}
                        style={{ fontSize: field.fontSize, textAlign: field.align, color: field.color ?? '#000000' }}
                        onChange={(e) => updateField(field.id, { value: e.target.value })}
                        onFocus={() => setSelectedId(field.id)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()} />
                    )}
                    {isSelected && (
                      <div className="pff-resize-handle" onPointerDown={(e) => handleResizePtrDown(e, field)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Side panel */}
          {selectedField && (
            <div className="pff-side-panel">
              <div className="pff-side-title">Field properties</div>
              <label className="pff-side-label">Internal label</label>
              <input
                className="pff-side-input"
                type="text"
                value={selectedField.label}
                placeholder={selectedField.type === 'checkbox' ? 'e.g. Agree to terms' : 'e.g. Project Name'}
                onChange={(e) => updateField(selectedField.id, { label: e.target.value })} />
              {selectedField.type !== 'checkbox' && (() => {
                const match = pffMatchDetail(selectedField.label, myDetails);
                return match ? (
                  <div className="pff-autofill-hint">
                    <CircleUserRound className="w-3 h-3" />
                    <span>Matches <strong>{match.key}</strong> in My Details</span>
                    <button className="pff-autofill-btn" onClick={() => updateField(selectedField.id, { value: match.value })}>Autofill</button>
                  </div>
                ) : null;
              })()}
              <label className="pff-side-label">Type</label>
              <div className="settings-mode-group" style={{ marginBottom: 10 }}>
                {(['text','number','date','checkbox'] as PffFieldType[]).map((t) => (
                  <button
                    key={t}
                    className={`settings-mode-btn${selectedField.type === t ? ' active' : ''}`}
                    onClick={() => updateField(selectedField.id, { type: t, value: '' })}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              {selectedField.type === 'checkbox' ? (
                <>
                  <label className="pff-side-label">State</label>
                  <div className="settings-mode-group" style={{ marginBottom: 10 }}>
                    <button className={`settings-mode-btn${selectedField.value !== 'checked' ? ' active' : ''}`} onClick={() => updateField(selectedField.id, { value: '' })}>Unchecked</button>
                    <button className={`settings-mode-btn${selectedField.value === 'checked' ? ' active' : ''}`} onClick={() => updateField(selectedField.id, { value: 'checked' })}>Checked</button>
                  </div>
                </>
              ) : (
                <>
                  <label className="pff-side-label">Font size</label>
                  <div className="pff-side-row">
                    <input
                      className="pff-side-input"
                      type="number" min={6} max={36}
                      value={selectedField.fontSize}
                      onChange={(e) => updateField(selectedField.id, { fontSize: +e.target.value })}
                      style={{ width: 70 }} />
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>pt</span>
                  </div>
                  <label className="pff-side-label">Alignment</label>
                  <div className="settings-mode-group" style={{ marginBottom: 10 }}>
                    {(['left','center','right'] as PffAlign[]).map((a) => (
                      <button
                        key={a}
                        className={`settings-mode-btn${selectedField.align === a ? ' active' : ''}`}
                        onClick={() => updateField(selectedField.id, { align: a })}>
                        {a === 'left' && <AlignLeft className="w-3 h-3" />}
                        {a === 'center' && <AlignCenter className="w-3 h-3" />}
                        {a === 'right' && <AlignRight className="w-3 h-3" />}
                      </button>
                    ))}
                  </div>
                  <label className="pff-side-label">Text color</label>
                  <div className="pff-color-swatches">
                    {PFF_COLORS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`pff-color-swatch${(selectedField.color ?? '#000000') === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => updateField(selectedField.id, { color: hex })} />
                    ))}
                  </div>
                </>
              )}
              <div className="pff-side-actions">
                <button className="button-quiet" onClick={() => duplicateField(selectedField)}>
                  <Files className="w-3.5 h-3.5" /> Duplicate
                </button>
                <button className="button-quiet pff-delete-btn" onClick={() => deleteField(selectedField.id)}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Templates panel ── */}
      {showTplPanel && (
        <div className="pff-tpl-panel">
          <div className="pff-tpl-panel-header">
            <span className="pff-side-title">Templates</span>
            <button onClick={() => setShowTplPanel(false)}><X className="w-4 h-4" /></button>
          </div>
          {pdfProxy && fields.length > 0 && (
            <div className="pff-tpl-save">
              <div className="pff-side-label">Save current layout as template</div>
              <div className="pff-side-row" style={{ gap: 8 }}>
                <input
                  className="pff-side-input"
                  type="text"
                  placeholder="Template name…"
                  value={tplNameInput}
                  onChange={(e) => setTplNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveTemplate(); }} />
                <button className="button-quiet" onClick={saveTemplate} disabled={!tplNameInput.trim()}>Save</button>
              </div>
            </div>
          )}
          {templates.length === 0 ? (
            <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', padding: '8px 0' }}>No templates saved yet.</p>
          ) : (
            <div className="pff-tpl-list">
              {templates.map((tpl) => (
                <div key={tpl.id} className="pff-tpl-row">
                  <div className="pff-tpl-info">
                    <span className="pff-tpl-name">{tpl.name}</span>
                    <span className="pff-tpl-meta">{tpl.fields.length} fields · {tpl.pdfKey.split('::')[0]}</span>
                  </div>
                  <button className="button-quiet" onClick={() => loadTemplate(tpl)}>Apply</button>
                  <button className="button-quiet pff-delete-btn" onClick={() => deleteTemplate(tpl.id)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
