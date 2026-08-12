/**
 * SheetFill — turn master documents into filled Excel templates.
 *
 * Flow: Import PDF + XLSX → Analyze → Review matches → Export filled .xlsx
 *
 * Safety rule (per spec):
 *   • High confidence → auto-approved (user may uncheck)
 *   • Medium confidence → NOT auto-approved (user must opt in)
 *   • Low / no match → not filled; shown as "Not found"
 *   • Conflicts → user chooses keep-existing vs. use-source
 */

import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronRight, Download, FileSpreadsheet,
  FileText, Info, RefreshCw, TriangleAlert, X,
} from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';
import type { MatchResult } from './sheetfill/types';

// ── Step types ────────────────────────────────────────────────────────────────

type Step = 'setup' | 'analyzing' | 'review' | 'done';

interface AnalyzingStep {
  label: string;
  done: boolean;
}

// ── File drop zone ─────────────────────────────────────────────────────────
interface DropZoneProps {
  label: string;
  accept: string;
  acceptDesc: string;
  icon: React.ReactNode;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  disabled?: boolean;
}

function DropZone({ label, accept, acceptDesc, icon, file, onFile, onClear, disabled }: DropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };

  return (
    <div className="sf-drop-zone-wrap">
      <div className="sf-drop-label">{label}</div>
      {file ? (
        <div className="sf-loaded-file">
          <div className="sf-loaded-icon">{icon}</div>
          <div className="sf-loaded-info">
            <div className="sf-loaded-name">{file.name}</div>
            <div className="sf-loaded-size">{(file.size / 1024).toFixed(1)} KB</div>
          </div>
          {!disabled && (
            <button className="sf-loaded-clear" onClick={onClear} title="Remove file">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <div
          className={`sf-drop-zone${dragging ? ' dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="sf-drop-icon">{icon}</div>
          <div className="sf-drop-text">Drop {acceptDesc} here</div>
          <div className="sf-drop-sub">or <span className="sf-drop-link">browse</span></div>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="sf-hidden-input"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function formatFilename(xlsxName: string): string {
  const base = xlsxName.replace(/\.xlsx?$/i, '');
  return `${base}_Filled.xlsx`;
}

export function SheetFill() {
  const [step,       setStep]       = useState<Step>('setup');
  const [pdfFile,    setPdfFile]    = useState<File | null>(null);
  const [xlsxFile,   setXlsxFile]   = useState<File | null>(null);
  const [matches,    setMatches]    = useState<MatchResult[]>([]);
  const [error,      setError]      = useState<string | null>(null);
  const [analyzing,  setAnalyzing]  = useState<AnalyzingStep[]>([]);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const downloadFilename = useRef('');
  const prevDownloadUrl  = useRef<string | null>(null);

  // ── Analysis pipeline ─────────────────────────────────────────────────
  const runAnalysis = useCallback(async () => {
    if (!pdfFile || !xlsxFile) return;
    setError(null);
    setStep('analyzing');

    const steps: AnalyzingStep[] = [
      { label: 'Reading source document…',    done: false },
      { label: 'Analyzing Excel template…',   done: false },
      { label: 'Matching fields…',             done: false },
    ];
    setAnalyzing([...steps]);

    const mark = (i: number) => {
      steps[i].done = true;
      setAnalyzing([...steps]);
    };

    try {
      const [pdfBuffer, xlsxBuffer] = await Promise.all([
        pdfFile.arrayBuffer(),
        xlsxFile.arrayBuffer(),
      ]);

      // Step 1 — PDF extraction
      const { extractPdfLines } = await import('./sheetfill/pdfExtract');
      let lines;
      try {
        lines = await extractPdfLines(pdfBuffer);
      } catch {
        throw new Error('Could not read the PDF. The file may be password-protected, corrupt, or contain only scanned images with no readable text.');
      }
      if (lines.length === 0) {
        throw new Error('The PDF appears to contain no readable text. SheetFill cannot extract information from scanned images or image-only PDFs.');
      }
      mark(0);

      // Step 2 — XLSX analysis
      const { analyzeXlsx } = await import('./sheetfill/xlsxAnalyze');
      let fields, workbookData;
      try {
        ({ fields, workbookData } = await analyzeXlsx(xlsxBuffer));
      } catch {
        throw new Error('Could not read the Excel file. The workbook may be corrupt, password-protected, or use features SheetFill does not support.');
      }
      if (fields.length === 0) {
        throw new Error('No fillable fields were found in the Excel template. The workbook may not follow a label → value layout, or all fields may already be filled.');
      }
      mark(1);

      // Step 3 — Semantic matching
      const { matchFields } = await import('./sheetfill/matcher');
      const results = matchFields(fields, lines);
      mark(2);

      // Store original buffer for export
      (window as any).__sf_xlsxBuffer = workbookData;

      setMatches(results);
      setStep('review');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setStep('setup');
    }
  }, [pdfFile, xlsxFile]);

  // ── Export ────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    const approvedMatches = matches.filter((m) => m.approved && m.extractedValue);
    const { applyAndExport } = await import('./sheetfill/xlsxWrite');
    const originalBuffer = (window as any).__sf_xlsxBuffer as ArrayBuffer;
    const blob = await applyAndExport(originalBuffer, approvedMatches);
    if (prevDownloadUrl.current) URL.revokeObjectURL(prevDownloadUrl.current);
    const url = URL.createObjectURL(blob);
    prevDownloadUrl.current = url;
    setDownloadUrl(url);
    downloadFilename.current = formatFilename(xlsxFile?.name ?? 'Template.xlsx');
    setStep('done');
  }, [matches, xlsxFile]);

  // ── Match update helpers ──────────────────────────────────────────────
  const toggleApproved = (id: string) => {
    setMatches((prev) => prev.map((m) =>
      m.field.id === id ? { ...m, approved: !m.approved } : m,
    ));
  };
  const setKeepExisting = (id: string, keep: boolean) => {
    setMatches((prev) => prev.map((m) =>
      m.field.id === id ? { ...m, keepExisting: keep, approved: !keep } : m,
    ));
  };

  const reset = () => {
    setPdfFile(null); setXlsxFile(null); setMatches([]);
    setError(null); setDownloadUrl(null);
    setStep('setup');
  };

  // Partition matches for review
  const highMatches     = matches.filter((m) => m.confidence === 'high' && !m.isConflict && m.extractedValue);
  const mediumMatches   = matches.filter((m) => m.confidence === 'medium' && !m.isConflict && m.extractedValue);
  const conflictMatches = matches.filter((m) => m.isConflict && m.extractedValue);
  const notFound        = matches.filter((m) => !m.extractedValue || m.confidence === 'low');

  const totalApproved = matches.filter((m) => m.approved && m.extractedValue).length;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <section className="sf-page">
      <BackButton fallback="/library" label="Back to library" />

      <div className="page-intro">
        <div className="eyebrow">A focused little utility</div>
        <h1 className="display-title mt-2">SheetFill.</h1>
        <p className="sf-subtitle">Turn master documents into filled Excel templates.</p>
      </div>

      <DisplacedWidgetBand />

      {/* ── Error banner ── */}
      {error && (
        <div className="sf-error-banner">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button className="sf-error-close" onClick={() => setError(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* ── Setup ── */}
      {step === 'setup' && (
        <>
          <div className="sf-drop-row">
            <DropZone
              label="1. Source Document"
              accept=".pdf,application/pdf"
              acceptDesc="a PDF"
              icon={<FileText className="w-8 h-8" />}
              file={pdfFile}
              onFile={setPdfFile}
              onClear={() => setPdfFile(null)}
            />
            <div className="sf-drop-divider">
              <ChevronRight className="sf-drop-arrow" />
            </div>
            <DropZone
              label="2. Excel Template"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              acceptDesc="an XLSX file"
              icon={<FileSpreadsheet className="w-8 h-8" />}
              file={xlsxFile}
              onFile={setXlsxFile}
              onClear={() => setXlsxFile(null)}
            />
          </div>

          <div className="sf-analyze-wrap">
            <button
              className="button-primary sf-analyze-btn"
              disabled={!pdfFile || !xlsxFile}
              onClick={runAnalysis}
            >
              Analyze & Fill →
            </button>
            <p className="sf-analyze-note">
              SheetFill reads your files locally — nothing is uploaded.
            </p>
          </div>
        </>
      )}

      {/* ── Analyzing ── */}
      {step === 'analyzing' && (
        <div className="sf-analyzing">
          <div className="sf-analyzing-steps">
            {analyzing.map((s, i) => (
              <div key={i} className={`sf-astep${s.done ? ' done' : i === analyzing.findIndex(x => !x.done) ? ' active' : ''}`}>
                <span className="sf-astep-icon">
                  {s.done ? <CheckCircle2 className="w-4 h-4" /> : <span className="ff-spinner" />}
                </span>
                <span className="sf-astep-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Review ── */}
      {step === 'review' && (
        <div className="sf-review">
          <div className="sf-review-header">
            <div>
              <div className="sf-review-title">Review Proposed Fills</div>
              <div className="sf-review-subtitle">
                {highMatches.length} ready to fill ·{' '}
                {mediumMatches.length + conflictMatches.length > 0
                  ? `${mediumMatches.length + conflictMatches.length} need your review · `
                  : ''}
                {notFound.length} not found
              </div>
            </div>
            <button className="button-quiet sf-review-restart" onClick={reset}>
              <RefreshCw className="w-3.5 h-3.5" /> Start Over
            </button>
          </div>

          {/* HIGH CONFIDENCE — auto-checked, user may uncheck */}
          {highMatches.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-head sf-group-high">
                <CheckCircle2 className="w-4 h-4" /> Ready to Fill
              </div>
              {highMatches.map((m) => (
                <label key={m.field.id} className={`sf-match-row${m.approved ? '' : ' sf-unchecked'}`}>
                  <input
                    type="checkbox"
                    checked={m.approved}
                    onChange={() => toggleApproved(m.field.id)}
                    className="sf-checkbox"
                  />
                  <div className="sf-match-body">
                    <div className="sf-match-label">{m.field.label}</div>
                    <div className="sf-match-value">{m.extractedValue}</div>
                  </div>
                  <div className="sf-match-sheet">{m.field.sheetName}</div>
                </label>
              ))}
            </div>
          )}

          {/* MEDIUM CONFIDENCE — NOT checked, user must opt in */}
          {mediumMatches.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-head sf-group-medium">
                <TriangleAlert className="w-4 h-4" /> Needs Your Review
              </div>
              <div className="sf-group-note">
                These are plausible matches but not certain. Check any you'd like to include.
              </div>
              {mediumMatches.map((m) => (
                <label key={m.field.id} className={`sf-match-row${m.approved ? ' sf-medium-approved' : ''}`}>
                  <input
                    type="checkbox"
                    checked={m.approved}
                    onChange={() => toggleApproved(m.field.id)}
                    className="sf-checkbox"
                  />
                  <div className="sf-match-body">
                    <div className="sf-match-label">{m.field.label}</div>
                    <div className="sf-match-value">{m.extractedValue}</div>
                    <div className="sf-match-source">
                      Matched from: <em>"{m.sourceText.length > 80 ? m.sourceText.slice(0, 80) + '…' : m.sourceText}"</em>
                    </div>
                  </div>
                  <div className="sf-match-sheet">{m.field.sheetName}</div>
                </label>
              ))}
            </div>
          )}

          {/* CONFLICTS */}
          {conflictMatches.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-head sf-group-conflict">
                <TriangleAlert className="w-4 h-4" /> Conflicts
              </div>
              <div className="sf-group-note">
                These fields already have values in the spreadsheet that differ from the source document.
              </div>
              {conflictMatches.map((m) => (
                <div key={m.field.id} className="sf-conflict-row">
                  <div className="sf-conflict-label">{m.field.label}</div>
                  <div className="sf-conflict-options">
                    <label className={`sf-conflict-opt${m.keepExisting ? ' selected' : ''}`}>
                      <input
                        type="radio"
                        name={`conflict-${m.field.id}`}
                        checked={m.keepExisting}
                        onChange={() => setKeepExisting(m.field.id, true)}
                      />
                      <span className="sf-conflict-badge">Keep current</span>
                      <span className="sf-conflict-val">{m.field.existingValue}</span>
                    </label>
                    <label className={`sf-conflict-opt${!m.keepExisting ? ' selected' : ''}`}>
                      <input
                        type="radio"
                        name={`conflict-${m.field.id}`}
                        checked={!m.keepExisting}
                        onChange={() => setKeepExisting(m.field.id, false)}
                      />
                      <span className="sf-conflict-badge sf-conflict-badge-new">Use source</span>
                      <span className="sf-conflict-val">{m.extractedValue}</span>
                    </label>
                  </div>
                  <div className="sf-match-sheet">{m.field.sheetName}</div>
                </div>
              ))}
            </div>
          )}

          {/* NOT FOUND */}
          {notFound.length > 0 && (
            <div className="sf-group">
              <div className="sf-group-head sf-group-nf">
                <Info className="w-4 h-4" /> Not Found in Source Document
              </div>
              <div className="sf-nf-list">
                {notFound.map((m) => (
                  <span key={m.field.id} className="sf-nf-chip" title={m.field.sheetName}>
                    {m.field.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* No matches at all */}
          {matches.length === 0 && (
            <div className="sf-no-matches">
              <Info className="w-5 h-5" />
              No matching information was found between the source document and the Excel template.
            </div>
          )}

          <div className="sf-review-footer">
            <span className="sf-footer-count">
              {totalApproved === 0 ? 'No fields selected' : `${totalApproved} field${totalApproved !== 1 ? 's' : ''} will be filled`}
            </span>
            <button
              className="button-primary sf-create-btn"
              disabled={totalApproved === 0}
              onClick={handleExport}
            >
              Create Spreadsheet →
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="sf-done">
          <CheckCircle2 className="sf-done-icon" />
          <h2 className="sf-done-title">Your spreadsheet is ready</h2>
          <p className="sf-done-body">
            {totalApproved} field{totalApproved !== 1 ? 's were' : ' was'} filled. The original file was not modified.
          </p>
          <div className="sf-done-actions">
            <a
              href={downloadUrl ?? '#'}
              download={downloadFilename.current}
              className="button-primary sf-dl-btn"
            >
              <Download className="w-4 h-4" /> Save Filled Spreadsheet
            </a>
            <button className="button-quiet" onClick={reset}>
              <RefreshCw className="w-3.5 h-3.5" /> Fill Another
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
