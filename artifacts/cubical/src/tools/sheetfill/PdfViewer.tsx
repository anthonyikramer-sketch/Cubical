/**
 * PdfViewer — renders a PDF (ArrayBuffer) as stacked canvas pages.
 * Exposes scrollToPage() via ref for "View Source" navigation.
 *
 * defaultFit prop: auto-sizes to show a full page on first load.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
}

interface Props {
  data: ArrayBuffer;
  className?: string;
  /** Auto-compute an initial scale so one full page fits inside the viewer. */
  defaultFit?: boolean;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(({ data, className = '', defaultFit }, ref) => {
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale]           = useState(1.0); // will be overridden by defaultFit
  const [fitPageScale, setFitPageScale] = useState(1.0); // "fit entire page" scale
  const [fitWidthScale, setFitWidthScale] = useState(1.0); // "fit width" scale
  const [loading, setLoading]       = useState(true);

  const pdfDocRef      = useRef<any>(null);
  const containerRef   = useRef<HTMLDivElement>(null);
  const pageRefs       = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs     = useRef<(HTMLCanvasElement | null)[]>([]);
  const versionRef     = useRef(0);
  const didFitRef      = useRef(false); // ensure auto-fit only runs once per load
  const renderTasksRef = useRef<any[]>([]); // active pdfjs render tasks — cancelled before each new pass

  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      const idx = Math.max(0, Math.min(page - 1, pageRefs.current.length - 1));
      pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }));

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setTotalPages(0);
    didFitRef.current = false; // reset fit for new document
    versionRef.current++;
    const v = versionRef.current;

    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).href;
        const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (v !== versionRef.current) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
      } finally {
        if (v === versionRef.current) setLoading(false);
      }
    })();
  }, [data]);

  // ── Auto-fit: compute scale so full page fits in viewer ──────────────────
  useEffect(() => {
    if (!defaultFit || didFitRef.current || totalPages === 0 || !pdfDocRef.current) return;
    didFitRef.current = true;

    (async () => {
      const page = await pdfDocRef.current.getPage(1);
      const vp1  = page.getViewport({ scale: 1 });

      // Wait for layout so container is sized
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const c = containerRef.current;
      if (!c) return;
      const availW = c.clientWidth  - 32; // 16px padding × 2
      const availH = c.clientHeight - 32;
      if (availW <= 0 || availH <= 0) return;

      const s = Math.min(availW / vp1.width, availH / vp1.height);
      const sw = availW / vp1.width;
      setFitPageScale(+s.toFixed(3));
      setFitWidthScale(+sw.toFixed(3));
      setScale(+s.toFixed(3));
    })();
  }, [totalPages, defaultFit]);

  // ── Re-render pages when totalPages or scale changes ─────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || totalPages === 0) return;

    // Cancel any in-flight render tasks before starting a new pass
    renderTasksRef.current.forEach(t => { try { t.cancel(); } catch {} });
    renderTasksRef.current = [];

    versionRef.current++;
    const v = versionRef.current;

    (async () => {
      const doc = pdfDocRef.current;
      for (let p = 1; p <= totalPages; p++) {
        if (v !== versionRef.current) return;
        const page    = await doc.getPage(p);
        const canvas  = canvasRefs.current[p - 1];
        if (!canvas) continue;
        const viewport = page.getViewport({ scale });
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTasksRef.current.push(task);
        try {
          await task.promise;
        } catch (e: unknown) {
          // RenderingCancelledException is expected when we cancel mid-pass
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'RenderingCancelledException') return;
          throw e;
        }
        renderTasksRef.current = renderTasksRef.current.filter(t => t !== task);

        // Compute fit-width scale from first rendered page
        if (p === 1 && containerRef.current && !defaultFit) {
          const avail = containerRef.current.clientWidth - 32;
          if (avail > 0) setFitWidthScale(+(avail / viewport.width * scale).toFixed(3));
        }
      }
    })();
  }, [totalPages, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom      = (delta: number) => setScale((s) => +Math.max(0.3, Math.min(3.0, s + delta)).toFixed(2));
  const fitPage   = () => setScale(fitPageScale);
  const fitWidth  = () => setScale(fitWidthScale);
  const reset     = () => setScale(1.0);

  return (
    <div className={`sf-pdf-root ${className}`}>
      <div className="sf-viewer-controls">
        <button className="sf-ctrl-btn" onClick={() => zoom(-0.2)} title="Zoom out"><Minus className="w-3 h-3" /></button>
        <span className="sf-ctrl-pct">{Math.round(scale * 100)}%</span>
        <button className="sf-ctrl-btn" onClick={() => zoom(0.2)} title="Zoom in"><Plus className="w-3 h-3" /></button>
        <div className="sf-ctrl-sep" />
        <button className="sf-ctrl-btn sf-ctrl-fit-page" onClick={fitPage}  title="Fit entire page"><Maximize2 className="w-3 h-3" /></button>
        <button className="sf-ctrl-btn"                  onClick={fitWidth} title="Fit to width"><span className="sf-fit-w-icon">↔</span></button>
        <button className="sf-ctrl-btn"                  onClick={reset}    title="100%"><RotateCcw className="w-3 h-3" /></button>
        {totalPages > 0 && (
          <span className="sf-ctrl-info">{totalPages} page{totalPages !== 1 ? 's' : ''}</span>
        )}
      </div>

      <div ref={containerRef} className="sf-pdf-pages">
        {loading && <div className="sf-viewer-loading"><span className="ff-spinner" /> Loading PDF…</div>}
        {Array.from({ length: totalPages }, (_, i) => (
          <div
            key={i}
            ref={(el) => { pageRefs.current[i] = el; }}
            className="sf-pdf-page"
          >
            <div className="sf-page-num">Page {i + 1}</div>
            <canvas
              ref={(el) => { canvasRefs.current[i] = el; }}
              className="sf-pdf-canvas"
            />
          </div>
        ))}
      </div>
    </div>
  );
});
PdfViewer.displayName = 'PdfViewer';
