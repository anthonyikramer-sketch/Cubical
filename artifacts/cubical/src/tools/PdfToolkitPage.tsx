import { useState, useEffect, type ChangeEvent } from 'react';
import { FileScan, RotateCcw } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

async function getPdfPageCount(file: File): Promise<number> {
  try {
    const buf  = await file.arrayBuffer();
    const text = new TextDecoder('latin1').decode(new Uint8Array(buf));
    const direct = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    if (direct > 0) return direct;
    const m = text.match(/\/Count\s+(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  } catch { return 0; }
}

export function PdfToolkitPage() {
  const [file, setFile]           = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [objUrl, setObjUrl]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => () => { if (objUrl) URL.revokeObjectURL(objUrl); }, []);

  const loadFile = async (f: File) => {
    setLoading(true);
    setFile(f);
    if (objUrl) URL.revokeObjectURL(objUrl);
    const url = URL.createObjectURL(f);
    setObjUrl(url);
    const count = await getPdfPageCount(f);
    setPageCount(count);
    setLoading(false);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = '';
  };

  const reset = () => {
    if (objUrl) URL.revokeObjectURL(objUrl);
    setFile(null); setObjUrl(null); setPageCount(null);
  };

  return (
    <section className="renamer-page" data-testid="pdf-toolkit">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(1 68% 54%)', background: 'hsl(1 68% 54% / .12)' }}><FileScan /></span>
            <div><h1>PDF Toolkit.</h1><p>Small, sharp tools for the PDFs you touch every day.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Open a PDF</span></div>
          <label className="file-picker">
            <FileScan /><span>Select PDF</span>
            <input type="file" accept=".pdf,application/pdf" onChange={handleChange} />
          </label>
          {file && <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={reset}><RotateCcw /> Clear</button>}
          {loading && <p className="toolbox-loading" style={{ marginTop: 14 }}>Reading PDF…</p>}
          {file && !loading && (
            <div className="toolbox-info-grid" style={{ marginTop: 16 }}>
              <span className="toolbox-info-label">File name</span>
              <span className="toolbox-info-value" style={{ fontSize: 12, wordBreak: 'break-all' }}>{file.name}</span>
              <span className="toolbox-info-label">File size</span>
              <span className="toolbox-info-value">{formatFileBytes(file.size)}</span>
              <span className="toolbox-info-label">Pages</span>
              <span className="toolbox-info-value">{pageCount !== null ? (pageCount > 0 ? pageCount : 'Unknown') : '—'}</span>
              <span className="toolbox-info-label">Type</span>
              <span className="toolbox-info-value">PDF Document</span>
            </div>
          )}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading"><span className="eyebrow">02 · Preview</span></div>
          {objUrl ? (
            <embed src={objUrl} type="application/pdf" style={{ width: '100%', minHeight: 500, borderRadius: 12, border: '1px solid hsl(var(--border))' }} />
          ) : (
            <div className="renamer-empty"><FileScan style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select a PDF to preview it here.</p></div>
          )}
        </div>
      </div>
    </section>
  );
}
