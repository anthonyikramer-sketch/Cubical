/**
 * PdfViewer — renders a PDF (ArrayBuffer) as stacked canvas pages.
 * Exposes scrollToPage() via ref for "View Source" navigation.
 *
 * defaultFit prop: auto-sizes to show a full page on first load.
 * initialScale / initialPage: restore saved viewer state on mount.
 * onScaleChange / onPageChange: report state changes to the parent.
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
}

interface Props {
  data: ArrayBuffer;
  className?: string;
  /** Auto-compute an initial scale so one full page fits inside the viewer. */
  defaultFit?: boolean;
  /** Restore a previously-saved scale (overrides defaultFit). */
  initialScale?: number;
  /** Restore a previously-saved page (scroll there after load). */
  initialPage?: number;
  /** Called whenever the user changes the zoom level. */
  onScaleChange?: (scale: number) => void;
  /** Called whenever the most-visible page changes (1-based). */
  onPageChange?: (page: number) => void;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(({
  data, className = '', defaultFit,
  initialScale, initialPage,
  onScaleChange, onPageChange,
}, ref) => {
  const [totalPages, setTotalPages]           = useState(0);
  const [scale, setScale]                     = useState(initialScale ?? 1.0);
  const [fitPageScale, setFitPageScale]       = useState(1.0);
  const [fitWidthScale, setFitWidthScale]     = useState(1.0);
  const [loading, setLoading]                 = useState(true);

  const pdfDocRef       = useRef<any>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const pageRefs        = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs      = useRef<(HTMLCanvasElement | null)[]>([]);
  const versionRef      = useRef(0);
  const didFitRef       = useRef(false);
  const didScrollRef    = useRef(false); // scroll-to-initial-page done once
  const renderTasksRef  = useRef<any[]>([]);
  const onScaleChangeRef = useRef(onScaleChange);
  const onPageChangeRef  = useRef(onPageChange);

  // Keep callback refs fresh without triggering effects
  useEffect(() => { onScaleChangeRef.current = onScaleChange; }, [onScaleChange]);
  useEffect(() => { onPageChangeRef.current  = onPageChange;  }, [onPageChange]);

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
    didFitRef.current    = false;
    didScrollRef.current = false;
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

  // ── Auto-fit or restore saved scale ──────────────────────────────────────
  useEffect(() => {
    if (didFitRef.current || totalPages === 0 || !pdfDocRef.current) return;
    didFitRef.current = true;

    // If a saved scale was provided, use it directly — no need to compute
    if (initialScale != null) {
      setScale(initialScale);
      return;
    }

    if (!defaultFit) return;

    (async () => {
      const page = await pdfDocRef.current.getPage(1);
      const vp1  = page.getViewport({ scale: 1 });

      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const c = containerRef.current;
      if (!c) return;
      const availW = c.clientWidth  - 32;
      const availH = c.clientHeight - 32;
      if (availW <= 0 || availH <= 0) return;

      const s  = Math.min(availW / vp1.width, availH / vp1.height);
      const sw = availW / vp1.width;
      setFitPageScale(+s.toFixed(3));
      setFitWidthScale(+sw.toFixed(3));
      setScale(+s.toFixed(3));
    })();
  }, [totalPages, defaultFit, initialScale]);

  // ── Re-render pages when totalPages or scale changes ─────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || totalPages === 0) return;

    renderTasksRef.current.forEach(t => { try { t.cancel(); } catch {} });
    renderTasksRef.current = [];

    versionRef.current++;
    const v = versionRef.current;

    (async () => {
      const doc = pdfDocRef.current;
      for (let p = 1; p <= totalPages; p++) {
        if (v !== versionRef.current) return;
        const page     = await doc.getPage(p);
        const canvas   = canvasRefs.current[p - 1];
        if (!canvas) continue;
        const viewport = page.getViewport({ scale });
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTasksRef.current.push(task);
        try {
          await task.promise;
        } catch (e: unknown) {
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'RenderingCancelledException') return;
          throw e;
        }
        renderTasksRef.current = renderTasksRef.current.filter(t => t !== task);

        if (p === 1 && containerRef.current && !defaultFit && initialScale == null) {
          const avail = containerRef.current.clientWidth - 32;
          if (avail > 0) setFitWidthScale(+(avail / viewport.width * scale).toFixed(3));
        }
      }

      // After first render pass completes, scroll to the saved page
      if (!didScrollRef.current && initialPage != null && initialPage > 1 && v === versionRef.current) {
        didScrollRef.current = true;
        // Small delay to let layout settle
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const idx = Math.max(0, Math.min(initialPage - 1, pageRefs.current.length - 1));
        pageRefs.current[idx]?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    })();
  }, [totalPages, scale]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Track most-visible page with IntersectionObserver ────────────────────
  useEffect(() => {
    if (totalPages === 0) return;
    const ratios = new Map<number, number>(); // pageIndex → intersectionRatio

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
          if (idx !== -1) ratios.set(idx, entry.intersectionRatio);
        });
        // Find most-visible page
        let bestIdx = 0, bestRatio = -1;
        ratios.forEach((ratio, idx) => { if (ratio > bestRatio) { bestRatio = ratio; bestIdx = idx; } });
        onPageChangeRef.current?.(bestIdx + 1);
      },
      { root: containerRef.current, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] },
    );

    const refs = pageRefs.current.filter(Boolean);
    refs.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [totalPages]); // eslint-disable-line react-hooks/exhaustive-deps

  const changeScale = useCallback((next: number) => {
    const s = +Math.max(0.3, Math.min(3.0, next)).toFixed(2);
    setScale(s);
    onScaleChangeRef.current?.(s);
  }, []);

  const zoom     = (delta: number) => changeScale(scale + delta);
  const fitPage  = () => changeScale(fitPageScale);
  const fitWidth = () => changeScale(fitWidthScale);
  const reset    = () => changeScale(1.0);

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
