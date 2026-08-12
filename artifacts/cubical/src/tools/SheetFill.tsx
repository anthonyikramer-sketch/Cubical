/**
 * SheetFill — turn master documents into filled Excel templates.
 *
 * Confidence safety rules (unchanged):
 *   • High  → auto-approved, user may uncheck
 *   • Medium → NOT approved; user must opt in
 *   • Low / no match → leave blank ("Not found")
 *   • Conflicts → user chooses keep-existing vs. use-source
 *
 * Preview system:
 *   • PDF viewer with zoom + page navigation
 *   • Excel grid viewer with virtual cell overlay
 *   • Live Filled Preview updates as user approves/rejects
 *   • "View Source" jumps to the PDF page where a value was found
 *   • Before/After comparison in the Final Review step
 */

import {
  forwardRef, useCallback, useMemo, useRef, useState,
} from 'react';
import {
  AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Download,
  ExternalLink, FileSpreadsheet, FileText, Info, RefreshCw, TriangleAlert, X,
} from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';
import type { MatchResult } from './sheetfill/types';
import { PdfViewer } from './sheetfill/PdfViewer';
import type { PdfViewerHandle } from './sheetfill/PdfViewer';
import { XlsxViewer } from './sheetfill/XlsxViewer';
import type { HighlightMeta, HighlightType } from './sheetfill/XlsxViewer';

// ── Types ─────────────────────────────────────────────────────────────────────

type Step        = 'setup' | 'analyzing' | 'review' | 'final-review';
type PreviewTab  = 'pdf' | 'xlsx-orig' | 'xlsx-filled' | 'side-by-side' | 'compare';

interface AnalyzingStep { label: string; done: boolean; }

interface CellPopover {
  id: string;
  meta: HighlightMeta;
  rect: DOMRect;
}

// ── Drop zone ─────────────────────────────────────────────────────────────────

interface DropZoneProps {
  label: string;
  accept: string;
  acceptDesc: string;
  icon: React.ReactNode;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
  compact?: boolean;
}

function DropZone({ label, accept, acceptDesc, icon, file, onFile, onClear, disabled, compact }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) onFile(f);
  };

  if (file) {
    return (
      <div className={`sf-loaded-file${compact ? ' compact' : ''}`}>
        <div className="sf-loaded-icon">{icon}</div>
        <div className="sf-loaded-info">
          <div className="sf-loaded-name">{file.name}</div>
          <div className="sf-loaded-size">{(file.size / 1024).toFixed(1)} KB</div>
        </div>
        {!disabled && (
          <button className="sf-loaded-clear" onClick={onClear} title="Remove file"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
    );
  }

  return (
    <div className="sf-drop-zone-wrap">
      {!compact && <div className="sf-drop-label">{label}</div>}
      <div
        className={`sf-drop-zone${dragging ? ' dragging' : ''}${compact ? ' compact' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <div className="sf-drop-icon">{icon}</div>
        {compact
          ? <div className="sf-drop-text">Drop {acceptDesc}</div>
          : <>
              <div className="sf-drop-text">Drop {acceptDesc} here</div>
              <div className="sf-drop-sub">or <span className="sf-drop-link">browse</span></div>
            </>
        }
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="sf-hidden-input"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

// ── Cell popover ──────────────────────────────────────────────────────────────

const HL_LABEL: Record<HighlightType, string> = {
  added:          'Added (high confidence)',
  'user-approved':'User approved',
  conflict:       'Conflict resolved',
};

function CellPopoverCard({ popover, onClose }: { popover: CellPopover; onClose: () => void }) {
  const { meta, rect } = popover;
  const top  = rect.bottom + window.scrollY + 6;
  const left = Math.min(rect.left, window.innerWidth - 320 - 16);

  return (
    <>
      <div className="sf-popover-overlay" onMouseDown={onClose} />
      <div className="sf-cell-popover" style={{ top, left }}>
        <div className={`sf-popover-badge sf-hl-badge-${meta.type}`}>{HL_LABEL[meta.type]}</div>
        <div className="sf-popover-row">
          <span className="sf-popover-key">Field</span>
          <span className="sf-popover-val">{meta.fieldLabel}</span>
        </div>
        {meta.originalValue && (
          <div className="sf-popover-row">
            <span className="sf-popover-key">Original</span>
            <span className="sf-popover-val sf-popover-orig">{meta.originalValue}</span>
          </div>
        )}
        <div className="sf-popover-row">
          <span className="sf-popover-key">New value</span>
          <span className="sf-popover-val sf-popover-new">{meta.newValue}</span>
        </div>
        {meta.sourceText && (
          <div className="sf-popover-row">
            <span className="sf-popover-key">Source</span>
            <span className="sf-popover-val sf-popover-src">{meta.sourceText}</span>
          </div>
        )}
        <div className="sf-popover-row">
          <span className="sf-popover-key">Confidence</span>
          <span className="sf-popover-val">{meta.confidence}</span>
        </div>
        <button className="sf-popover-close" onClick={onClose}><X className="w-3 h-3" /></button>
      </div>
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFilename(xlsxName: string): string {
  return xlsxName.replace(/\.xlsx?$/i, '_Filled.xlsx');
}

const TAB_LABELS: Record<PreviewTab, string> = {
  'pdf':           'Master Document',
  'xlsx-orig':     'Excel Template',
  'xlsx-filled':   'Filled Preview',
  'side-by-side':  'Side by Side',
  'compare':       'Compare',
};

// ── Main component ─────────────────────────────────────────────────────────────

export function SheetFill() {
  // ── File state
  const [pdfFile,  setPdfFile]  = useState<File | null>(null);
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [pdfData,  setPdfData]  = useState<ArrayBuffer | null>(null);
  const [xlsxData, setXlsxData] = useState<ArrayBuffer | null>(null);

  // ── Workflow state
  const [step,       setStep]       = useState<Step>('setup');
  const [matches,    setMatches]    = useState<MatchResult[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [analyzing,  setAnalyzing]  = useState<AnalyzingStep[]>([]);

  // ── Preview state
  const [previewTab,   setPreviewTab]   = useState<PreviewTab>('pdf');
  const [cellPopover,  setCellPopover]  = useState<CellPopover | null>(null);
  const [downloadUrl,  setDownloadUrl]  = useState<string | null>(null);
  const downloadFilename = useRef('');
  const prevDownloadUrl  = useRef<string | null>(null);
  const pdfViewerRef     = useRef<PdfViewerHandle>(null);

  // ── Derived: virtualCells and highlightMeta from approved matches ─────────
  const virtualCells = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const m of matches) {
      if (!m.approved || !m.extractedValue) continue;
      const value = m.isConflict && m.keepExisting ? m.field.existingValue : m.extractedValue;
      if (value) map[m.field.id] = value;
    }
    return map;
  }, [matches]);

  const highlightMeta = useMemo<Record<string, HighlightMeta>>(() => {
    const map: Record<string, HighlightMeta> = {};
    for (const m of matches) {
      if (!m.approved || !m.extractedValue) continue;
      const type: HighlightType = m.isConflict ? 'conflict'
        : m.confidence === 'high' ? 'added' : 'user-approved';
      map[m.field.id] = {
        type,
        originalValue: m.field.existingValue,
        newValue: m.isConflict && m.keepExisting ? m.field.existingValue : m.extractedValue,
        sourceText: m.sourceText,
        confidence: m.confidence,
        fieldLabel: m.field.label,
      };
    }
    return map;
  }, [matches]);

  // ── File loading ──────────────────────────────────────────────────────────
  const loadPdfFile = useCallback(async (file: File) => {
    setPdfFile(file);
    const buf = await file.arrayBuffer();
    setPdfData(buf);
    // If xlsx already present → go straight to side-by-side
    setPreviewTab(xlsxData ? 'side-by-side' : 'pdf');
  }, [xlsxData]);

  const loadXlsxFile = useCallback(async (file: File) => {
    setXlsxFile(file);
    const buf = await file.arrayBuffer();
    setXlsxData(buf);
    // If pdf already present → go straight to side-by-side
    setPreviewTab(pdfData ? 'side-by-side' : 'xlsx-orig');
  }, [pdfData]);

  const clearPdf = () => { setPdfFile(null); setPdfData(null); if (previewTab === 'pdf' || previewTab === 'side-by-side') setPreviewTab('xlsx-orig'); };
  const clearXlsx = () => { setXlsxFile(null); setXlsxData(null); if (previewTab !== 'pdf') setPreviewTab('pdf'); };

  // ── Analysis pipeline ─────────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!pdfFile || !xlsxFile || !pdfData || !xlsxData) return;
    setError(null); setStep('analyzing');

    const steps: AnalyzingStep[] = [
      { label: 'Reading source document…',  done: false },
      { label: 'Analyzing Excel template…', done: false },
      { label: 'Matching fields…',           done: false },
    ];
    setAnalyzing([...steps]);
    const mark = (i: number) => { steps[i].done = true; setAnalyzing([...steps]); };

    try {
      const { extractPdfLines } = await import('./sheetfill/pdfExtract');
      let lines;
      try { lines = await extractPdfLines(pdfData); }
      catch { throw new Error('Could not read the PDF. The file may be password-protected, corrupt, or contain only scanned images.'); }
      if (lines.length === 0) throw new Error('The PDF contains no readable text. SheetFill cannot extract information from image-only PDFs.');
      mark(0);

      const { analyzeXlsx } = await import('./sheetfill/xlsxAnalyze');
      let fields;
      try { ({ fields } = await analyzeXlsx(xlsxData)); }
      catch { throw new Error('Could not read the Excel file. The workbook may be corrupt, password-protected, or use unsupported features.'); }
      if (fields.length === 0) throw new Error('No fillable fields were found in the Excel template. The workbook may not use a label → value layout, or all fields are already filled.');
      mark(1);

      const { matchFields } = await import('./sheetfill/matcher');
      const results = matchFields(fields, lines);
      mark(2);

      setMatches(results);
      setPreviewTab('xlsx-filled');
      setStep('review');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStep('setup');
    }
  }, [pdfFile, xlsxFile, pdfData, xlsxData]);

  // ── Create spreadsheet (review → final-review) ────────────────────────────
  const handleCreate = useCallback(async () => {
    const approved = matches.filter((m) => m.approved && m.extractedValue);
    const { applyAndExport } = await import('./sheetfill/xlsxWrite');
    const blob = await applyAndExport(xlsxData!, approved);
    if (prevDownloadUrl.current) URL.revokeObjectURL(prevDownloadUrl.current);
    const url = URL.createObjectURL(blob);
    prevDownloadUrl.current = url;
    setDownloadUrl(url);
    downloadFilename.current = formatFilename(xlsxFile?.name ?? 'Template.xlsx');
    setPreviewTab('compare');
    setStep('final-review');
  }, [matches, xlsxData, xlsxFile]);

  // ── Match toggles ─────────────────────────────────────────────────────────
  const toggleApproved = (id: string) =>
    setMatches((prev) => prev.map((m) => m.field.id === id ? { ...m, approved: !m.approved } : m));

  const setKeepExisting = (id: string, keep: boolean) =>
    setMatches((prev) => prev.map((m) => m.field.id === id ? { ...m, keepExisting: keep, approved: !keep } : m));

  // ── View Source ───────────────────────────────────────────────────────────
  const viewSource = (m: MatchResult) => {
    setPreviewTab('pdf');
    setTimeout(() => pdfViewerRef.current?.scrollToPage(m.sourcePage ?? 1), 120);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const reset = () => {
    setPdfFile(null); setXlsxFile(null); setPdfData(null); setXlsxData(null);
    setMatches([]); setError(null); setDownloadUrl(null);
    setStep('setup'); setPreviewTab('pdf');
  };

  // ── Partitioned matches for review ────────────────────────────────────────
  const highMatches     = matches.filter((m) => m.confidence === 'high'   && !m.isConflict && m.extractedValue);
  const mediumMatches   = matches.filter((m) => m.confidence === 'medium' && !m.isConflict && m.extractedValue);
  const conflictMatches = matches.filter((m) => m.isConflict && m.extractedValue);
  const notFound        = matches.filter((m) => !m.extractedValue || m.confidence === 'low');
  const totalApproved   = matches.filter((m) => m.approved && m.extractedValue).length;

  // ── Tab / state logic ────────────────────────────────────────────────────
  const hasPdf  = !!pdfData;
  const hasXlsx = !!xlsxData;
  const isReviewOrFinal = step === 'review' || step === 'final-review';

  // Review-phase tabs (used inside the two-column review workspace)
  const reviewTabs = useMemo<PreviewTab[]>(() => {
    const tabs: PreviewTab[] = [];
    if (hasPdf)  tabs.push('pdf');
    if (hasXlsx) tabs.push('xlsx-orig');
    if (isReviewOrFinal) tabs.push('xlsx-filled');
    if (hasPdf && hasXlsx) tabs.push('side-by-side');
    if (hasXlsx && isReviewOrFinal) tabs.push('compare');
    return tabs;
  }, [hasPdf, hasXlsx, isReviewOrFinal]);

  const activeTab = reviewTabs.includes(previewTab) ? previewTab : (reviewTabs[0] ?? 'pdf');

  // Setup-phase active tab (viewer workspace)
  const SETUP_TABS: PreviewTab[] = ['side-by-side', 'pdf', 'xlsx-orig'];
  const setupActiveTab: PreviewTab = SETUP_TABS.includes(previewTab) ? previewTab
    : hasPdf && hasXlsx ? 'side-by-side'
    : hasPdf ? 'pdf' : 'xlsx-orig';

  // Three mutually exclusive states
  const showInitialSetup    = step === 'setup' && !hasPdf && !hasXlsx;
  const showViewerWorkspace = (hasPdf || hasXlsx) && (step === 'setup' || step === 'analyzing');
  const showReviewWorkspace = step === 'review' || step === 'final-review';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="sf-page">
      <BackButton fallback="/library" label="Back to library" />

      <div className="page-intro">
        <div className="eyebrow">A focused little utility</div>
        <h1 className="display-title mt-2">SheetFill.</h1>
        <p className="sf-subtitle">Turn master documents into filled Excel templates.</p>
      </div>

      <DisplacedWidgetBand />

      {error && (
        <div className="sf-error-banner">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button className="sf-error-close" onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ══ STATE A: Initial setup (no files yet) ══ */}
      {showInitialSetup && (
        <>
          <div className="sf-drop-row">
            <DropZone
              label="1. Source Document" accept=".pdf,application/pdf" acceptDesc="a PDF"
              icon={<FileText className="w-8 h-8" />}
              file={pdfFile} onFile={loadPdfFile} onClear={clearPdf}
            />
            <div className="sf-drop-divider"><ChevronRight className="sf-drop-arrow" /></div>
            <DropZone
              label="2. Excel Template"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              acceptDesc="an XLSX file"
              icon={<FileSpreadsheet className="w-8 h-8" />}
              file={xlsxFile} onFile={loadXlsxFile} onClear={clearXlsx}
            />
          </div>
          <div className="sf-analyze-wrap">
            <button className="button-primary sf-analyze-btn" disabled={!pdfFile || !xlsxFile} onClick={runAnalysis}>
              Analyze & Fill →
            </button>
            <p className="sf-analyze-note">Files are read locally — nothing is uploaded.</p>
          </div>
        </>
      )}

      {/* ══ STATE B: Viewer workspace (one or both files loaded, setup/analyzing) ══ */}
      {showViewerWorkspace && (
        <div className="sf-viewer-workspace">

          {/* Tab bar — only when both files are present */}
          {hasPdf && hasXlsx && (
            <div className="sf-vtab-bar">
              <button className={`sf-vtab${setupActiveTab === 'side-by-side' ? ' active' : ''}`} onClick={() => setPreviewTab('side-by-side')}>Side by Side</button>
              <button className={`sf-vtab${setupActiveTab === 'pdf' ? ' active' : ''}`}          onClick={() => setPreviewTab('pdf')}>Master Document</button>
              <button className={`sf-vtab${setupActiveTab === 'xlsx-orig' ? ' active' : ''}`}    onClick={() => setPreviewTab('xlsx-orig')}>Excel Template</button>
            </div>
          )}

          <div className="sf-viewers-area">

            {/* ── Side by side ── */}
            {(setupActiveTab === 'side-by-side' || (!hasPdf && hasXlsx) || (hasPdf && !hasXlsx && false)) && setupActiveTab === 'side-by-side' && (
              <div className="sf-viewers-pair">
                {/* PDF block */}
                <div className="sf-viewer-block">
                  <div className="sf-file-above">
                    <span className="sf-file-above-label">Master Document</span>
                    <DropZone
                      label="Source Document" accept=".pdf,application/pdf" acceptDesc="PDF"
                      icon={<FileText className="w-3.5 h-3.5" />}
                      file={pdfFile} onFile={loadPdfFile} onClear={clearPdf}
                      disabled={step === 'analyzing'} compact
                    />
                  </div>
                  <div className="sf-doc-viewer">
                    {pdfData
                      ? <PdfViewer ref={pdfViewerRef} data={pdfData} defaultFit={true} />
                      : <div className="sf-viewer-empty-lg"><FileText className="w-10 h-10" /><p>Upload a PDF to preview it here.</p></div>}
                  </div>
                </div>

                {/* XLSX block */}
                <div className="sf-viewer-block">
                  <div className="sf-file-above">
                    <span className="sf-file-above-label">Excel Template</span>
                    <DropZone
                      label="Excel Template"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      acceptDesc="XLSX"
                      icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                      file={xlsxFile} onFile={loadXlsxFile} onClear={clearXlsx}
                      disabled={step === 'analyzing'} compact
                    />
                  </div>
                  <div className="sf-doc-viewer sf-doc-viewer-xlsx">
                    {xlsxData
                      ? <XlsxViewer data={xlsxData} />
                      : <div className="sf-viewer-empty-lg"><FileSpreadsheet className="w-10 h-10" /><p>Upload an XLSX to preview it here.</p></div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── PDF solo ── */}
            {setupActiveTab === 'pdf' && (
              <div className="sf-viewers-pair sf-viewer-solo">
                <div className="sf-viewer-block">
                  <div className="sf-file-above">
                    <span className="sf-file-above-label">Master Document</span>
                    <DropZone
                      label="Source Document" accept=".pdf,application/pdf" acceptDesc="PDF"
                      icon={<FileText className="w-3.5 h-3.5" />}
                      file={pdfFile} onFile={loadPdfFile} onClear={clearPdf}
                      disabled={step === 'analyzing'} compact
                    />
                    {!hasXlsx && (
                      <DropZone
                        label="Excel Template"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        acceptDesc="XLSX"
                        icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                        file={xlsxFile} onFile={loadXlsxFile} onClear={clearXlsx}
                        disabled={step === 'analyzing'} compact
                      />
                    )}
                  </div>
                  <div className="sf-doc-viewer">
                    {pdfData
                      ? <PdfViewer ref={pdfViewerRef} data={pdfData} defaultFit={true} />
                      : <div className="sf-viewer-empty-lg"><FileText className="w-10 h-10" /><p>Upload a PDF to preview it here.</p></div>}
                  </div>
                </div>
              </div>
            )}

            {/* ── Excel solo ── */}
            {setupActiveTab === 'xlsx-orig' && (
              <div className="sf-viewers-pair sf-viewer-solo">
                <div className="sf-viewer-block">
                  <div className="sf-file-above">
                    <span className="sf-file-above-label">Excel Template</span>
                    <DropZone
                      label="Excel Template"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      acceptDesc="XLSX"
                      icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                      file={xlsxFile} onFile={loadXlsxFile} onClear={clearXlsx}
                      disabled={step === 'analyzing'} compact
                    />
                    {!hasPdf && (
                      <DropZone
                        label="Source Document" accept=".pdf,application/pdf" acceptDesc="PDF"
                        icon={<FileText className="w-3.5 h-3.5" />}
                        file={pdfFile} onFile={loadPdfFile} onClear={clearPdf}
                        disabled={step === 'analyzing'} compact
                      />
                    )}
                  </div>
                  <div className="sf-doc-viewer sf-doc-viewer-xlsx">
                    {xlsxData
                      ? <XlsxViewer data={xlsxData} />
                      : <div className="sf-viewer-empty-lg"><FileSpreadsheet className="w-10 h-10" /><p>Upload an XLSX to preview it here.</p></div>}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Below-viewers: Analyze button or progress */}
          <div className="sf-below-viewers">
            {step === 'setup' && (
              <>
                <button
                  className="button-primary sf-analyze-btn"
                  disabled={!pdfFile || !xlsxFile}
                  onClick={runAnalysis}
                >
                  Analyze & Fill →
                </button>
                {(!hasPdf || !hasXlsx) && (
                  <p className="sf-analyze-note">
                    {!hasPdf && !hasXlsx ? 'Add both files to continue.' : !hasPdf ? 'Add the source PDF to continue.' : 'Add the Excel template to continue.'}
                  </p>
                )}
                {hasPdf && hasXlsx && (
                  <p className="sf-analyze-note">Files are read locally — nothing is uploaded.</p>
                )}
              </>
            )}
            {step === 'analyzing' && (
              <div className="sf-analyzing-steps">
                {analyzing.map((s, i) => (
                  <div key={i} className={`sf-astep${s.done ? ' done' : i === analyzing.findIndex((x) => !x.done) ? ' active' : ''}`}>
                    <span className="sf-astep-icon">
                      {s.done ? <CheckCircle2 className="w-4 h-4" /> : <span className="ff-spinner" />}
                    </span>
                    <span className="sf-astep-label">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ STATE C: Review workspace (two-column grid, existing layout) ══ */}
      {showReviewWorkspace && (
        <div className="sf-workspace">

          {/* ── LEFT: review controls ── */}
          <div className="sf-controls-pane">

            {/* ── Review ── */}
            {step === 'review' && (
              <div className="sf-review">
                <div className="sf-review-header">
                  <div className="sf-review-title">Review Proposed Fills</div>
                  <div className="sf-review-subtitle">
                    {highMatches.length} ready · {mediumMatches.length + conflictMatches.length} need review · {notFound.length} not found
                  </div>
                  <button className="button-quiet sf-restart-btn" onClick={reset}>
                    <RefreshCw className="w-3 h-3" /> Start Over
                  </button>
                </div>

                {/* HIGH confidence */}
                {highMatches.length > 0 && (
                  <div className="sf-group">
                    <div className="sf-group-head sf-group-high"><CheckCircle2 className="w-3.5 h-3.5" /> Ready to Fill</div>
                    {highMatches.map((m) => (
                      <div key={m.field.id} className={`sf-match-row${m.approved ? '' : ' sf-unchecked'}`}>
                        <input type="checkbox" className="sf-checkbox" checked={m.approved} onChange={() => toggleApproved(m.field.id)} />
                        <div className="sf-match-body">
                          <div className="sf-match-label">{m.field.label}</div>
                          <div className="sf-match-value">{m.extractedValue}</div>
                        </div>
                        <button className="sf-view-src" onClick={() => viewSource(m)} title="View source in PDF">
                          <ExternalLink className="w-3 h-3" /> Source
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* MEDIUM confidence */}
                {mediumMatches.length > 0 && (
                  <div className="sf-group">
                    <div className="sf-group-head sf-group-medium"><TriangleAlert className="w-3.5 h-3.5" /> Needs Your Review</div>
                    <div className="sf-group-note">Plausible matches — check any you'd like to include.</div>
                    {mediumMatches.map((m) => (
                      <div key={m.field.id} className={`sf-match-row${m.approved ? ' sf-medium-approved' : ''}`}>
                        <input type="checkbox" className="sf-checkbox" checked={m.approved} onChange={() => toggleApproved(m.field.id)} />
                        <div className="sf-match-body">
                          <div className="sf-match-label">{m.field.label}</div>
                          <div className="sf-match-value">{m.extractedValue}</div>
                          <div className="sf-match-source">From: <em>"{m.sourceText.length > 70 ? m.sourceText.slice(0, 70) + '…' : m.sourceText}"</em></div>
                        </div>
                        <button className="sf-view-src" onClick={() => viewSource(m)} title="View source in PDF">
                          <ExternalLink className="w-3 h-3" /> Source
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* CONFLICTS */}
                {conflictMatches.length > 0 && (
                  <div className="sf-group">
                    <div className="sf-group-head sf-group-conflict"><TriangleAlert className="w-3.5 h-3.5" /> Conflicts</div>
                    <div className="sf-group-note">These cells already have values that differ from the source.</div>
                    {conflictMatches.map((m) => (
                      <div key={m.field.id} className="sf-conflict-row">
                        <div className="sf-conflict-label">{m.field.label}</div>
                        <div className="sf-conflict-options">
                          <label className={`sf-conflict-opt${m.keepExisting ? ' selected' : ''}`}>
                            <input type="radio" name={`c-${m.field.id}`} checked={m.keepExisting} onChange={() => setKeepExisting(m.field.id, true)} />
                            <span className="sf-conflict-badge">Keep</span>
                            <span className="sf-conflict-val">{m.field.existingValue}</span>
                          </label>
                          <label className={`sf-conflict-opt${!m.keepExisting ? ' selected' : ''}`}>
                            <input type="radio" name={`c-${m.field.id}`} checked={!m.keepExisting} onChange={() => setKeepExisting(m.field.id, false)} />
                            <span className="sf-conflict-badge sf-conflict-badge-new">Use</span>
                            <span className="sf-conflict-val">{m.extractedValue}</span>
                          </label>
                        </div>
                        <button className="sf-view-src" onClick={() => viewSource(m)} title="View source in PDF">
                          <ExternalLink className="w-3 h-3" /> Source
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* NOT FOUND */}
                {notFound.length > 0 && (
                  <div className="sf-group">
                    <div className="sf-group-head sf-group-nf"><Info className="w-3.5 h-3.5" /> Not Found</div>
                    <div className="sf-nf-list">
                      {notFound.map((m) => <span key={m.field.id} className="sf-nf-chip">{m.field.label}</span>)}
                    </div>
                  </div>
                )}

                {matches.length === 0 && (
                  <div className="sf-no-matches"><Info className="w-4 h-4" /> No matches found between the documents.</div>
                )}

                <div className="sf-review-footer">
                  <span className="sf-footer-count">
                    {totalApproved === 0 ? 'Nothing selected' : `${totalApproved} field${totalApproved !== 1 ? 's' : ''} will be filled`}
                  </span>
                  <button className="button-primary sf-create-btn" disabled={totalApproved === 0} onClick={handleCreate}>
                    Create Spreadsheet →
                  </button>
                </div>
              </div>
            )}

            {/* ── Final Review ── */}
            {step === 'final-review' && (
              <div className="sf-final-review">
                <div className="sf-done-summary">
                  <CheckCircle2 className="sf-done-icon-sm" />
                  <div>
                    <div className="sf-done-title-sm">Spreadsheet ready</div>
                    <div className="sf-done-body-sm">{totalApproved} field{totalApproved !== 1 ? 's' : ''} filled. Original not modified.</div>
                  </div>
                </div>

                <div className="sf-final-btns">
                  <a href={downloadUrl ?? '#'} download={downloadFilename.current} className="button-primary sf-dl-btn">
                    <Download className="w-3.5 h-3.5" /> Export Filled Spreadsheet
                  </a>
                  <button className="button-quiet" onClick={() => { setStep('review'); setPreviewTab('xlsx-filled'); }}>
                    <ArrowLeft className="w-3 h-3" /> Return to Review
                  </button>
                  <button className="button-quiet" onClick={reset}>
                    <RefreshCw className="w-3 h-3" /> Fill Another
                  </button>
                </div>

                <div className="sf-final-view-btns">
                  <button className={`sf-fv-btn${activeTab === 'pdf' ? ' active' : ''}`}        onClick={() => setPreviewTab('pdf')}>View Master</button>
                  <button className={`sf-fv-btn${activeTab === 'xlsx-orig' ? ' active' : ''}`}  onClick={() => setPreviewTab('xlsx-orig')}>Original Excel</button>
                  <button className={`sf-fv-btn${activeTab === 'xlsx-filled' ? ' active' : ''}`} onClick={() => setPreviewTab('xlsx-filled')}>Filled Excel</button>
                  <button className={`sf-fv-btn${activeTab === 'compare' ? ' active' : ''}`}    onClick={() => setPreviewTab('compare')}>Compare</button>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: preview pane ── */}
          <div className="sf-preview-pane">
            {/* Tab bar */}
            {reviewTabs.length > 1 && step !== 'final-review' && (
              <div className="sf-preview-tabs">
                {reviewTabs.map((tab) => (
                  <button
                    key={tab}
                    className={`sf-preview-tab${activeTab === tab ? ' active' : ''}`}
                    onClick={() => setPreviewTab(tab)}
                  >
                    {TAB_LABELS[tab]}
                  </button>
                ))}
              </div>
            )}

            {/* ── Content ── */}
            <div className="sf-preview-content">

              {/* PDF single view */}
              {activeTab === 'pdf' && (
                <div className="sf-single-viewer">
                  <div className="sf-viewer-header">
                    <span className="sf-vh-label">Master Document</span>
                  </div>
                  {pdfData
                    ? <PdfViewer ref={pdfViewerRef} data={pdfData} />
                    : <div className="sf-viewer-empty"><FileText className="w-8 h-8" /><p>No PDF loaded.</p></div>}
                </div>
              )}

              {/* Excel original single view */}
              {activeTab === 'xlsx-orig' && (
                <div className="sf-single-viewer">
                  <div className="sf-viewer-header">
                    <span className="sf-vh-label">Excel Template</span>
                  </div>
                  {xlsxData
                    ? <XlsxViewer data={xlsxData} />
                    : <div className="sf-viewer-empty"><FileSpreadsheet className="w-8 h-8" /><p>No XLSX loaded.</p></div>}
                </div>
              )}

              {/* Filled preview */}
              {activeTab === 'xlsx-filled' && xlsxData && (
                <div className="sf-single-viewer">
                  <div className="sf-viewer-header">
                    <span className="sf-vh-label sf-vh-label-filled">Filled Preview</span>
                    <span className="sf-vh-note">Highlighted cells are proposed changes — click any to inspect</span>
                  </div>
                  <XlsxViewer
                    data={xlsxData}
                    virtualCells={virtualCells}
                    highlightMeta={highlightMeta}
                    onCellClick={(id, meta, rect) => setCellPopover({ id, meta, rect })}
                  />
                </div>
              )}

              {/* Side by side */}
              {activeTab === 'side-by-side' && (
                <div className="sf-sidebyside">
                  <div className="sf-sb-panel">
                    <div className="sf-viewer-header"><span className="sf-vh-label">Master Document</span></div>
                    {pdfData
                      ? <PdfViewer ref={pdfViewerRef} data={pdfData} />
                      : <div className="sf-viewer-empty"><FileText className="w-6 h-6" /><p>No PDF</p></div>}
                  </div>
                  <div className="sf-sb-panel">
                    <div className="sf-viewer-header"><span className="sf-vh-label">Excel Template</span></div>
                    {xlsxData
                      ? <XlsxViewer data={xlsxData} />
                      : <div className="sf-viewer-empty"><FileSpreadsheet className="w-6 h-6" /><p>No XLSX</p></div>}
                  </div>
                </div>
              )}

              {/* Compare: Original + Filled */}
              {activeTab === 'compare' && xlsxData && (
                <div className="sf-sidebyside">
                  <div className="sf-sb-panel">
                    <div className="sf-viewer-header"><span className="sf-vh-label">Original</span></div>
                    <XlsxViewer data={xlsxData} />
                  </div>
                  <div className="sf-sb-panel">
                    <div className="sf-viewer-header"><span className="sf-vh-label sf-vh-label-filled">Filled Preview</span></div>
                    <XlsxViewer
                      data={xlsxData}
                      virtualCells={virtualCells}
                      highlightMeta={highlightMeta}
                      onCellClick={(id, meta, rect) => setCellPopover({ id, meta, rect })}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cell popover ── */}
      {cellPopover && (
        <CellPopoverCard popover={cellPopover} onClose={() => setCellPopover(null)} />
      )}
    </section>
  );
}
