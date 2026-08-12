/**
 * PdfViewer — renders a PDF (ArrayBuffer) as stacked canvas pages.
 * Exposes scrollToPage() via ref for "View Source" navigation.
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react';

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
}

interface Props {
  data: ArrayBuffer;
  className?: string;
}

export const PdfViewer = forwardRef<PdfViewerHandle, Props>(({ data, className = '' }, ref) => {
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale]           = useState(1.2);
  const [fitScale, setFitScale]     = useState(1.2);
  const [loading, setLoading]       = useState(true);

  const pdfDocRef   = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs    = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRefs  = useRef<(HTMLCanvasElement | null)[]>([]);
  const versionRef  = useRef(0); // cancel stale renders

  useImperativeHandle(ref, () => ({
    scrollToPage: (page: number) => {
      const idx = Math.max(0, Math.min(page - 1, pageRefs.current.length - 1));
      pageRefs.current[idx]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  }));

  // Load PDF document
  useEffect(() => {
    setLoading(true);
    setTotalPages(0);
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

  // Re-render all pages when totalPages or scale changes
  useEffect(() => {
    if (!pdfDocRef.current || totalPages === 0) return;
    versionRef.current++;
    const v = versionRef.current;

    (async () => {
      const doc = pdfDocRef.current;
      for (let p = 1; p <= totalPages; p++) {
        if (v !== versionRef.current) return;
        const page = await doc.getPage(p);
        const canvas = canvasRefs.current[p - 1];
        if (!canvas) continue;
        const viewport = page.getViewport({ scale });
        canvas.width  = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;

        // After first page, compute fit-to-width scale
        if (p === 1 && containerRef.current) {
          const avail = containerRef.current.clientWidth - 32;
          if (avail > 0) setFitScale(+(avail / viewport.width * scale).toFixed(2));
        }
      }
    })();
  }, [totalPages, scale]);

  const zoom    = (delta: number) => setScale((s) => +Math.max(0.4, Math.min(3.0, s + delta)).toFixed(2));
  const fitW    = () => setScale(fitScale);
  const reset   = () => setScale(1.2);

  return (
    <div className={`sf-pdf-root ${className}`}>
      <div className="sf-viewer-controls">
        <button className="sf-ctrl-btn" onClick={() => zoom(-0.2)} title="Zoom out"><Minus className="w-3 h-3" /></button>
        <span className="sf-ctrl-pct">{Math.round(scale * 100)}%</span>
        <button className="sf-ctrl-btn" onClick={() => zoom(0.2)} title="Zoom in"><Plus className="w-3 h-3" /></button>
        <div className="sf-ctrl-sep" />
        <button className="sf-ctrl-btn" onClick={fitW} title="Fit to width"><Maximize2 className="w-3 h-3" /></button>
        <button className="sf-ctrl-btn" onClick={reset} title="100%"><RotateCcw className="w-3 h-3" /></button>
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
