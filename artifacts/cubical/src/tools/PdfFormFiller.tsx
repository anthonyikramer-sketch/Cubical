import { useState, useEffect, useRef } from 'react';
import {
  AlertCircle, AlignCenter, AlignLeft, AlignRight, BookOpen, Check,
  ChevronLeft, ChevronRight, CircleUserRound, Download, FilePlus2, Files,
  FormInput, ListChecks, Minus, MousePointer2, Plus, Sparkles, Stamp, Trash2, X,
} from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

// ── Types & constants (mirrors App.tsx) ───────────────────────────────────────
type PffFieldType = 'text' | 'number' | 'date' | 'checkbox';
type PffAlign    = 'left' | 'center' | 'right';
type PffMode     = 'select' | 'add' | 'add-checkbox';

interface PffField {
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

interface PffTemplate {
  id:        string;
  name:      string;
  pdfKey:    string;
  createdAt: number;
  fields:    Omit<PffField, 'value'>[];
  stamps?:   string[];
}

interface PersonalDetail { key: string; value: string; }

const PFF_TEMPLATES_KEY  = 'cubical-pff-templates-v1';
const PFF_STAMPS_KEY     = 'cubical-pff-stamps-v1';
const PFF_MY_DETAILS_KEY = 'cubical-pff-my-details-v1';
const PFF_MAX_STAMPS     = 10;

const PFF_DEFAULT_DETAIL_KEYS = [
  'Name', 'Email', 'Phone', 'Address', 'City', 'State', 'ZIP', 'Company', 'Title',
];

const PFF_LABEL_KEYWORDS = [
  'name','date','address','phone','email','project','signature','initials',
  'notes','total','city','state','zip','company','title','department',
  'description','amount','qty','price','foreman','location','contact',
  'fax','website','number','ref','reference','id','po','invoice',
  'crew','hours','size','supervisor','manager','owner','client',
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

function pffGetStamps(pdfKey: string): string[] {
  try { return (JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string,string[]>)[pdfKey] ?? []; }
  catch { return []; }
}

function pffSaveStamps(pdfKey: string, stamps: string[]) {
  try {
    const all = JSON.parse(window.localStorage.getItem(PFF_STAMPS_KEY) ?? '{}') as Record<string,string[]>;
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
  const [detecting,    setDetecting]    = useState(false);
  const [exporting,    setExporting]    = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [pdfFileName,  setPdfFileName]  = useState('');
  const [pdfFileSize,  setPdfFileSize]  = useState(0);
  const [pdfjsLib,     setPdfjsLib]     = useState<any>(null);
  const [stamps,          setStamps]          = useState<string[]>([]);
  const [stampMode,       setStampMode]       = useState<string | null>(null);
  const [showStampPopout, setShowStampPopout] = useState(false);
  const [stampInput,      setStampInput]      = useState('');
  const stampBtnRef   = useRef<HTMLButtonElement>(null);
  const [templates,     setTemplates]    = useState<PffTemplate[]>(pffGetTemplates);
  const [showTplPanel,  setShowTplPanel] = useState(false);
  const [tplNameInput,  setTplNameInput] = useState('');
  const [offerTemplate, setOfferTemplate] = useState<PffTemplate | null>(null);
  const [myDetails, setMyDetails] = useState<PersonalDetail[]>(pffGetMyDetails);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);
  const dragRef       = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const resizeRef     = useRef<{ id: string; startX: number; startY: number; ow: number; oh: number } | null>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (!selectedId) return;
      setFields((prev) => prev.filter((f) => f.id !== selectedId));
      setSelectedId(null);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setStampMode(null); setMode('select'); setShowStampPopout(false); }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onEsc);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', onEsc); };
  }, [selectedId]);

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

  const detectFields = async () => {
    if (!pdfProxy) return;
    setDetecting(true);
    const detected: PffField[] = [];
    for (let pNum = 1; pNum <= pageCount; pNum++) {
      const page  = await pdfProxy.getPage(pNum);
      const vp    = page.getViewport({ scale: 1 });
      const pageW = vp.width;
      const pageH = vp.height;
      let foundAcro = false;
      try {
        const annotations = await page.getAnnotations();
        for (const ann of annotations) {
          if (ann.subtype !== 'Widget') continue;
          if (!ann.rect) continue;
          const [x1, y1, x2, y2] = ann.rect as number[];
          const wPct = (x2 - x1) / pageW;
          const hPct = (y2 - y1) / pageH;
          if (wPct < 0.01 || hPct < 0.003) continue;
          const xPct = x1 / pageW;
          const yPct = (pageH - y2) / pageH;
          detected.push({
            id: pffId(), pageIndex: pNum - 1,
            xPct: Math.max(0, Math.min(0.97, xPct)),
            yPct: Math.max(0, Math.min(0.97, yPct)),
            wPct: Math.min(wPct, 0.92),
            hPct: Math.max(hPct, 0.02),
            value: '', fontSize: 10, align: 'left', color: '#000000',
            label: (ann.fieldName || ann.alternativeText || '').replace(/\[\d+\]$/, '').trim(),
            type: 'text', isDetected: true,
          });
          foundAcro = true;
        }
      } catch { /* not all PDFs support getAnnotations */ }
      if (foundAcro) continue;
      const tc    = await page.getTextContent();
      const items = (tc.items as any[]).filter((i: any) => (i.str ?? '').trim());
      for (const item of items) {
        const str   = (item.str ?? '').trim();
        const tx    = item.transform as number[];
        const itmX  = tx[4];
        const itmY  = pageH - tx[5] - (item.height || 12);
        const itmW  = item.width  || 60;
        const itmH  = Math.max(item.height || 12, 14);
        const fontSize = Math.abs(tx[3]) || item.height || 12;
        if (/^[_\-─═]{3,}$/.test(str)) {
          const widthRatio = itmW / pageW;
          if (widthRatio < 0.04 || widthRatio > 0.60) continue;
          if (itmY / pageH < 0.09) continue;
          const tooClose = detected.some((d) => d.pageIndex === pNum - 1 && Math.abs(d.yPct - itmY / pageH) < 0.02 && Math.abs(d.xPct - itmX / pageW) < 0.10);
          if (tooClose) continue;
          detected.push({
            id: pffId(), pageIndex: pNum - 1,
            xPct: Math.max(0, itmX / pageW), yPct: Math.max(0, (itmY - 2) / pageH),
            wPct: Math.min(widthRatio, 0.55), hPct: Math.max(itmH / pageH, 0.025),
            value: '', fontSize: 10, align: 'left', color: '#000000', label: '', type: 'text', isDetected: true,
          });
          continue;
        }
        if (str.length > 35) continue;
        if (fontSize > 13) continue;
        if (itmY / pageH < 0.09) continue;
        const strL = str.toLowerCase().replace(/:$/, '').trim();
        const isLabel = PFF_LABEL_KEYWORDS.some((kw) => {
          if (strL === kw || strL === `${kw}:`) return true;
          if ((strL.startsWith(`${kw} `) || strL.startsWith(`${kw}:`)) && str.length <= kw.length + 14) return true;
          return false;
        });
        if (!isLabel) continue;
        const fx = itmX + itmW + 6;
        if (fx / pageW > 0.86) continue;
        const availW = Math.max((pageW - fx) * 0.45, 55);
        const tooClose = detected.some((d) => d.pageIndex === pNum - 1 && Math.abs(d.yPct - itmY / pageH) < 0.025 && Math.abs(d.xPct - fx / pageW) < 0.12);
        if (tooClose) continue;
        const fType: PffFieldType =
          strL.includes('date') ? 'date'
          : (strL.includes('phone') || strL.includes('fax') || strL.includes('qty') ||
             strL.includes('amount') || strL.includes('total') || strL.includes('number') ||
             strL.includes('zip') || strL.includes('size') || strL.includes('hours')) ? 'number'
          : 'text';
        detected.push({
          id: pffId(), pageIndex: pNum - 1,
          xPct: Math.min(fx / pageW, 0.90), yPct: Math.max(0, (itmY - 1) / pageH),
          wPct: Math.min(availW / pageW, 0.5), hPct: Math.max(itmH / pageH, 0.025),
          value: '', fontSize: 10, align: 'left', color: '#000000',
          label: str.replace(/:$/, '').trim(), type: fType, isDetected: true,
        });
      }
    }
    setFields((prev) => [...prev.filter((f) => !f.isDetected), ...detected]);
    setDetecting(false);
  };

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
          if (field.value !== 'checked') continue;
          const bx = field.xPct * width;
          const by = height - (field.yPct + field.hPct) * height;
          const fw = field.wPct * width;
          const fh = field.hPct * height;
          const p1 = { x: bx + fw * 0.15, y: by + fh * 0.50 };
          const p2 = { x: bx + fw * 0.40, y: by + fh * 0.20 };
          const p3 = { x: bx + fw * 0.85, y: by + fh * 0.78 };
          const thickness = Math.max(1, Math.min(fw, fh) * 0.1);
          try {
            pg.drawLine({ start: p1, end: p2, thickness, color: rgb(0, 0, 0) });
            pg.drawLine({ start: p2, end: p3, thickness, color: rgb(0, 0, 0) });
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

  const addStamp = () => {
    const text = stampInput.trim();
    if (!text) return;
    if (stamps.includes(text)) { setStampInput(''); return; }
    if (stamps.length >= PFF_MAX_STAMPS) { setError(`Stamp limit reached (max ${PFF_MAX_STAMPS}). Remove a stamp first.`); return; }
    const next = [...stamps, text];
    setStamps(next);
    if (pdfKey) pffSaveStamps(pdfKey, next);
    setStampInput('');
  };

  const removeStamp = (text: string) => {
    const next = stamps.filter((s) => s !== text);
    setStamps(next);
    if (stampMode === text) setStampMode(null);
    if (pdfKey) pffSaveStamps(pdfKey, next);
  };

  const selectStamp = (text: string) => {
    setStampMode(text);
    setShowStampPopout(false);
    setMode('select');
  };

  const saveTemplate = () => {
    if (!tplNameInput.trim() || !pdfFileName) return;
    const tpl: PffTemplate = {
      id: pffId(), name: tplNameInput.trim(), pdfKey, createdAt: Date.now(),
      fields: fields.map(({ value: _v, ...rest }) => rest), stamps,
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
    if (tpl.stamps) { setStamps(tpl.stamps); if (pdfKey) pffSaveStamps(pdfKey, tpl.stamps); }
    setOfferTemplate(null);
    setShowTplPanel(false);
  };

  const deleteTemplate = (id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    pffSaveTemplates(updated);
    setTemplates(updated);
  };

  const makeField = (xPct: number, yPct: number, value = '', label = ''): PffField => ({
    id: pffId(), pageIndex: currentPage - 1,
    xPct: Math.max(0, Math.min(0.94, xPct)), yPct: Math.max(0, Math.min(0.94, yPct)),
    wPct: 0.25, hPct: 0.04, value, fontSize: 11, align: 'left', color: '#000000', label, type: 'text', isDetected: false,
  });

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const xPct = e.nativeEvent.offsetX / canvas.offsetWidth;
    const yPct = e.nativeEvent.offsetY / canvas.offsetHeight;
    if (stampMode !== null) {
      const f = makeField(xPct, yPct, stampMode, stampMode);
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      return;
    }
    if (mode === 'add') {
      const f = makeField(xPct, yPct);
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      setMode('select');
    }
    if (mode === 'add-checkbox') {
      const f: PffField = {
        id: pffId(), pageIndex: currentPage - 1,
        xPct: Math.max(0, xPct - 0.02), yPct: Math.max(0, yPct - 0.02),
        wPct: 0.04, hPct: 0.04, value: '', fontSize: 11, align: 'left', color: '#000000', label: '', type: 'checkbox', isDetected: false,
      };
      setFields((prev) => [...prev, f]);
      setSelectedId(f.id);
      setMode('select');
    }
  };

  const updateField = (id: string, patch: Partial<PffField>) =>
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, ...patch } : f));
  const deleteField = (id: string) => { setFields((prev) => prev.filter((f) => f.id !== id)); if (selectedId === id) setSelectedId(null); };
  const duplicateField = (field: PffField) => {
    const dup: PffField = { ...field, id: pffId(), xPct: field.xPct + 0.02, yPct: field.yPct + 0.02, value: '' };
    setFields((prev) => [...prev, dup]);
    setSelectedId(dup.id);
  };

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

  const selectedField = fields.find((f) => f.id === selectedId);
  const pageFields    = fields.filter((f) => f.pageIndex === currentPage - 1);
  const isPlacingStamp    = stampMode !== null;
  const isAddMode         = mode === 'add';
  const isAddCheckboxMode = mode === 'add-checkbox';
  const canvasClass       = `pff-canvas${isAddMode || isAddCheckboxMode || isPlacingStamp ? ' pff-canvas--add' : ''}`;

  return (
    <section className="renamer-page pff-page" data-testid="pdf-form-filler">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(210 60% 42%)', background: 'hsl(210 60% 42% / .11)' }}><FormInput /></span>
            <div><h1>PDF Form Filler.</h1><p>Detect fields, fill them in, export a finished PDF.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />

      {/* Toolbar */}
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
          <button className={`pff-toolbar-btn${!isAddMode && !isPlacingStamp ? ' active' : ''}`} onClick={() => { setMode('select'); setStampMode(null); }} title="Select / move fields">
            <MousePointer2 className="w-4 h-4" /><span>Select</span>
          </button>
          <button className={`pff-toolbar-btn${isAddMode ? ' active' : ''}`} onClick={() => { setMode('add'); setStampMode(null); setShowStampPopout(false); }} title="Click on the PDF to add a text field">
            <Plus className="w-4 h-4" /><span>Add Field</span>
          </button>
          <button className={`pff-toolbar-btn${isAddCheckboxMode ? ' active' : ''}`} onClick={() => { setMode('add-checkbox'); setStampMode(null); setShowStampPopout(false); }} title="Click on the PDF to place a checkbox">
            <ListChecks className="w-4 h-4" /><span>Add Checkbox</span>
          </button>
          <div className="pff-stamp-wrap">
            <button ref={stampBtnRef} className={`pff-toolbar-btn${isPlacingStamp ? ' active' : ''}`} onClick={() => { setShowStampPopout((v) => !v); }} title="Stamp">
              <Stamp className="w-4 h-4" /><span>{isPlacingStamp ? `Stamp: ${stampMode}` : 'Stamp'}</span>
            </button>
            {showStampPopout && (
              <div id="pff-stamp-popout" className="pff-stamp-popout">
                <div className="pff-stamp-popout-header">Stamps</div>
                <div className="pff-stamp-new">
                  <input className="pff-side-input" type="text" placeholder="Create a stamp…" value={stampInput}
                    onChange={(e) => setStampInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addStamp(); }} autoFocus />
                </div>
                {stamps.length === 0 ? (
                  <p className="pff-stamp-empty">No stamps yet — type above and press Enter.</p>
                ) : (
                  <ul className="pff-stamp-list">
                    {stamps.map((s) => (
                      <li key={s} className={`pff-stamp-item${stampMode === s ? ' active' : ''}`} onClick={() => selectStamp(s)}>
                        <span className="pff-stamp-text">{s}</span>
                        <button className="pff-stamp-del" title="Remove stamp" onClick={(e) => { e.stopPropagation(); removeStamp(s); }}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                {stamps.length >= PFF_MAX_STAMPS && <p className="pff-stamp-limit">Limit reached ({PFF_MAX_STAMPS} stamps max)</p>}
              </div>
            )}
          </div>
          <div className="pff-toolbar-sep" />
          <button className="pff-toolbar-btn" onClick={() => void detectFields()} disabled={detecting} title="Auto-detect fillable areas">
            <Sparkles className="w-4 h-4" /><span>{detecting ? 'Detecting…' : 'Detect Fields'}</span>
          </button>
          {fields.some((f) => f.isDetected) && (<>
            <button className="pff-toolbar-btn" title="Accept all detected fields" onClick={() => setFields((prev) => prev.map((f) => ({ ...f, isDetected: false })))}>
              <Check className="w-4 h-4" /><span>Accept All</span>
            </button>
            <button className="pff-toolbar-btn pff-toolbar-btn--danger" title="Remove all detected fields" onClick={() => setFields((prev) => prev.filter((f) => !f.isDetected))}>
              <Trash2 className="w-4 h-4" /><span>Clear Detected</span>
            </button>
          </>)}
          <div className="pff-toolbar-sep" />
          {(() => {
            const fillableCount = fields.filter((f) => f.type !== 'checkbox' && pffMatchDetail(f.label, myDetails) && !f.value.trim()).length;
            return fillableCount > 0 ? (
              <button className="pff-toolbar-btn pff-toolbar-btn--autofill" title={`Fill ${fillableCount} field${fillableCount !== 1 ? 's' : ''} from My Details`}
                onClick={() => { setFields((prev) => prev.map((f) => { if (f.type === 'checkbox' || f.value.trim()) return f; const match = pffMatchDetail(f.label, myDetails); return match ? { ...f, value: match.value } : f; })); }}>
                <CircleUserRound className="w-4 h-4" /><span>Fill All ({fillableCount})</span>
              </button>
            ) : null;
          })()}
          <button className="pff-toolbar-btn" onClick={() => setShowTplPanel((v) => !v)} title="Templates">
            <BookOpen className="w-4 h-4" /><span>Templates</span>
          </button>
          <button className="pff-toolbar-btn pff-toolbar-btn--primary" onClick={() => void exportPdf()} disabled={exporting || !fields.some((f) => f.type === 'checkbox' ? f.value === 'checked' : f.value.trim())} title="Export filled PDF">
            <Download className="w-4 h-4" /><span>{exporting ? 'Exporting…' : 'Export PDF'}</span>
          </button>
        </>)}
      </div>

      {error && <div className="pff-error"><AlertCircle className="w-4 h-4 shrink-0" />{error}<button onClick={() => setError(null)}><X className="w-3 h-3" /></button></div>}

      {offerTemplate && (
        <div className="pff-offer-banner">
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>Template <strong>"{offerTemplate.name}"</strong> found for this PDF.</span>
          <button className="button-quiet" onClick={() => loadTemplate(offerTemplate)}>Apply template</button>
          <button className="pff-offer-dismiss" onClick={() => setOfferTemplate(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {!pdfProxy ? (
        <div className="toolbox-drop-panel" onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') void loadPdf(f); }}>
          <div className="empty-cube"><FormInput /></div>
          <h2>Open a PDF to get started.</h2>
          <p>Drop a PDF here, or use "Open PDF" above. Field detection, manual editing, and export all happen locally — nothing leaves your device.</p>
          <label className="file-picker" style={{ marginTop: 16 }}>
            <FilePlus2 /><span>Browse for a PDF</span>
            <input type="file" accept="application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadPdf(f); e.target.value = ''; }} />
          </label>
        </div>
      ) : (
        <div className="pff-editor-layout">
          <div className="pff-canvas-scroll">
            <div className="pff-canvas-wrap" ref={containerRef}
              onPointerMove={(e) => { handleFieldPtrMove(e); handleResizePtrMove(e); }}
              onPointerUp={() => { handleFieldPtrUp(); handleResizePtrUp(); }}>
              <canvas ref={canvasRef} className={canvasClass} onClick={handleCanvasClick} />
              {pageFields.map((field) => {
                const isSelected = field.id === selectedId;
                const isChecked  = field.value === 'checked';
                return (
                  <div key={field.id}
                    className={`pff-field${field.type === 'checkbox' ? ' pff-field--checkbox' : ''}${isSelected ? ' is-selected' : ''}${field.isDetected ? ' is-detected' : ''}`}
                    style={{ left: `${field.xPct * 100}%`, top: `${field.yPct * 100}%`, width: `${field.wPct * 100}%`, height: `${field.hPct * 100}%` }}
                    onPointerDown={(e) => handleFieldPtrDown(e, field)}>
                    {field.type === 'checkbox' ? (
                      <button className={`pff-checkbox-btn${isChecked ? ' is-checked' : ''}`}
                        title={field.label || (isChecked ? 'Checked — click to uncheck' : 'Unchecked — click to check')}
                        onClick={(e) => { e.stopPropagation(); updateField(field.id, { value: isChecked ? '' : 'checked' }); }}
                        onPointerDown={(e) => e.stopPropagation()} onFocus={() => setSelectedId(field.id)}>
                        {isChecked && <Check className="pff-checkbox-tick" />}
                      </button>
                    ) : (
                      <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                        className="pff-field-input" placeholder={field.label || ''}
                        value={field.value} style={{ fontSize: field.fontSize, textAlign: field.align, color: field.color ?? '#000000' }}
                        onChange={(e) => updateField(field.id, { value: e.target.value })}
                        onFocus={() => setSelectedId(field.id)} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} />
                    )}
                    {isSelected && <div className="pff-resize-handle" onPointerDown={(e) => handleResizePtrDown(e, field)} />}
                  </div>
                );
              })}
            </div>
          </div>
          {selectedField && (
            <div className="pff-side-panel">
              <div className="pff-side-title">Field properties</div>
              <label className="pff-side-label">Internal label</label>
              <input className="pff-side-input" type="text" value={selectedField.label}
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
                  <button key={t} className={`settings-mode-btn${selectedField.type === t ? ' active' : ''}`}
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
                    <input className="pff-side-input" type="number" min={6} max={36} value={selectedField.fontSize}
                      onChange={(e) => updateField(selectedField.id, { fontSize: +e.target.value })} style={{ width: 70 }} />
                    <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>pt</span>
                  </div>
                  <label className="pff-side-label">Alignment</label>
                  <div className="settings-mode-group" style={{ marginBottom: 10 }}>
                    {(['left','center','right'] as PffAlign[]).map((a) => (
                      <button key={a} className={`settings-mode-btn${selectedField.align === a ? ' active' : ''}`}
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
                      <button key={hex} className={`pff-color-swatch${(selectedField.color ?? '#000000') === hex ? ' active' : ''}`}
                        style={{ background: hex }} title={label} onClick={() => updateField(selectedField.id, { color: hex })} />
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
              {selectedField.isDetected && (
                <div className="pff-detected-note"><Sparkles className="w-3 h-3" /> Auto-detected — drag to adjust</div>
              )}
            </div>
          )}
        </div>
      )}

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
                <input className="pff-side-input" type="text" placeholder="Template name…" value={tplNameInput}
                  onChange={(e) => setTplNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveTemplate(); }} />
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
