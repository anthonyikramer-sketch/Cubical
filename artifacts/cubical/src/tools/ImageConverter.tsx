import { useState, useEffect, useRef } from 'react';
import { zipSync } from 'fflate';
import { AlertTriangle, ArrowRight, Download, FileArchive, ImagePlus, X } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';
import { peekHandoffs, removeHandoff, clearHandoffs, subscribeHandoffs, handoffToFile, type FileHandoff } from '../shared/sendTo';
import { IncomingFilesQueue } from '../shared/IncomingFilesQueue';
import {
  SHELF_DRAG_TYPE, TOOL_OUTPUT_DRAG_TYPE,
  getActiveDragMime, isMimeCompatible,
  decodeShelfDrag, shelfPayloadToFile,
  encodeToolOutput,
} from '../shared/fileShelfHandoff';

/** Extract the uppercased file extension without the leading dot. */
function getFileExt(name: string): string {
  const m = name.match(/\.([^.]+)$/);
  return m ? m[1].toUpperCase() : '???';
}

/**
 * Extensions that browsers cannot decode via the Canvas API.
 * Files with these extensions will still be accepted but a warning is shown.
 * This set is the single source of truth — the file-picker accept attribute is
 * derived from it at module load time to prevent drift.
 */
const NON_RENDERABLE_EXTS = new Set([
  'CR2', 'CR3', 'NEF', 'ARW', 'DNG', 'HEIC', 'HEIF',
  'TIFF', 'TIF', 'RAF', 'ORF', 'RW2', 'PEF', 'SRW',
]);

/** Accept string for the file input — image/* plus every RAW/HEIC extension. */
const IMAGE_ACCEPT = [
  'image/*',
  ...[...NON_RENDERABLE_EXTS].map((ext) => `.${ext.toLowerCase()}`),
].join(',');

function isNonRenderable(name: string): boolean {
  return NON_RENDERABLE_EXTS.has(getFileExt(name));
}

export function ImageConverter() {
  const [files, setFiles]         = useState<File[]>([]);
  const [format, setFormat]       = useState<'png' | 'jpeg' | 'webp'>('png');
  const [quality, setQuality]     = useState(90);
  const [maxWidth, setMaxWidth]   = useState('');
  const [maxHeight, setMaxHeight] = useState('');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress]   = useState<{ done: number; total: number } | null>(null);
  const [results, setResults]     = useState<{ name: string; url: string }[]>([]);
  const [zipFilename, setZipFilename] = useState('converted-images');
  const [previews, setPreviews] = useState<{ name: string; url: string }[]>([]);
  const [failedThumbs, setFailedThumbs] = useState<Set<number>>(new Set());
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [shelfDragState, setShelfDragState] = useState<'none' | 'compat' | 'incompat'>('none');
  const cancelledRef = useRef(false);
  const previewUrlsRef = useRef<string[]>([]);
  const dragIndexRef = useRef<number | null>(null);
  const dropCounterRef = useRef(0);

  // Send To incoming queue
  const IC_TOOL_ID = 'image-converter';
  const [incomingIC,     setIncomingIC]     = useState<FileHandoff[]>(() => [...peekHandoffs(IC_TOOL_ID)]);
  const [showIncomingIC, setShowIncomingIC] = useState(() => peekHandoffs(IC_TOOL_ID).length > 0);

  useEffect(() => {
    const items = [...peekHandoffs(IC_TOOL_ID)];
    if (items.length > 0) {
      setShowIncomingIC(true);
      const first = items.find((h) => h.autoOpen);
      if (first) {
        const file = handoffToFile(first);
        const dt = new DataTransfer();
        dt.items.add(file);
        handleFiles(dt.files);
        removeHandoff(IC_TOOL_ID, first.id);
        setIncomingIC([...peekHandoffs(IC_TOOL_ID)]);
      }
    }
    return subscribeHandoffs(IC_TOOL_ID, () => {
      const updated = [...peekHandoffs(IC_TOOL_ID)];
      setIncomingIC(updated);
      setShowIncomingIC(updated.length > 0);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    // Accept standard image/* MIME types AND files with known RAW/HEIC extensions
    const accepted = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || isNonRenderable(f.name),
    );
    previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    const newPreviews = accepted.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    previewUrlsRef.current = newPreviews.map((p) => p.url);
    setFiles(accepted);
    setPreviews(newPreviews);
    setFailedThumbs(new Set());
    setResults([]);
  };

  /** Append dropped files to the existing list without replacing them. */
  const addFiles = (list: FileList) => {
    const incoming = Array.from(list).filter(
      (f) => f.type.startsWith('image/') || isNonRenderable(f.name),
    );
    if (!incoming.length) return;
    const newPreviews = incoming.map((f) => ({ name: f.name, url: URL.createObjectURL(f) }));
    previewUrlsRef.current = [...previewUrlsRef.current, ...newPreviews.map((p) => p.url)];
    setFiles((prev) => [...prev, ...incoming]);
    setPreviews((prev) => [...prev, ...newPreviews]);
    setResults([]);
  };

  /** MIME types accepted by the Image Converter for shelf drag compatibility. */
  const IC_ACCEPTED_MIMES = ['image/*'];

  const handleDropZoneDragEnter = (e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.types.includes('Files');
    const hasShelf = e.dataTransfer.types.includes(SHELF_DRAG_TYPE);
    if (!hasFiles && !hasShelf) return;
    e.preventDefault();
    if (hasShelf) {
      const mime = getActiveDragMime();
      setShelfDragState(mime && isMimeCompatible(mime, IC_ACCEPTED_MIMES) ? 'compat' : 'incompat');
    } else {
      dropCounterRef.current += 1;
      setIsDraggingOver(true);
    }
  };

  const handleDropZoneDragLeave = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(SHELF_DRAG_TYPE)) { setShelfDragState('none'); return; }
    // Only decrement for file drags — thumbnail reorder drags must not affect this counter.
    if (!e.dataTransfer.types.includes('Files')) return;
    dropCounterRef.current = Math.max(0, dropCounterRef.current - 1);
    if (dropCounterRef.current === 0) setIsDraggingOver(false);
  };

  const handleDropZoneDragOver = (e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.types.includes('Files');
    const hasShelf = e.dataTransfer.types.includes(SHELF_DRAG_TYPE);
    if (!hasFiles && !hasShelf) return;
    e.preventDefault();
  };

  const handleDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dropCounterRef.current = 0;
    setIsDraggingOver(false);
    setShelfDragState('none');
    // Handle File Shelf → Image Converter
    const shelfRaw = e.dataTransfer.getData(SHELF_DRAG_TYPE);
    if (shelfRaw) {
      const payload = decodeShelfDrag(shelfRaw);
      if (payload) {
        const file = shelfPayloadToFile(payload);
        if (file) { const dt = new DataTransfer(); dt.items.add(file); addFiles(dt.files); }
      }
      return;
    }
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrlsRef.current[index]);
    const newFiles    = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    previewUrlsRef.current = newPreviews.map((p) => p.url);
    setFiles(newFiles);
    setPreviews(newPreviews);
    setFailedThumbs((prev) => {
      const next = new Set<number>();
      prev.forEach((n) => { if (n < index) next.add(n); else if (n > index) next.add(n - 1); });
      return next;
    });
    setResults([]);
  };

  const reorderImages = (from: number, to: number) => {
    if (from === to) return;
    const newFiles    = [...files];
    const newPreviews = [...previews];
    const [movedFile]    = newFiles.splice(from, 1);
    const [movedPreview] = newPreviews.splice(from, 1);
    newFiles.splice(to, 0, movedFile);
    newPreviews.splice(to, 0, movedPreview);
    previewUrlsRef.current = newPreviews.map((p) => p.url);
    setFiles(newFiles);
    setPreviews(newPreviews);
    setFailedThumbs(new Set());
    setResults([]);
  };

  const cancelConversion = () => {
    cancelledRef.current = true;
  };

  const convertAll = async () => {
    if (!files.length) return;
    cancelledRef.current = false;
    setConverting(true);
    setProgress({ done: 0, total: files.length });
    setResults([]);
    const out: { name: string; url: string }[] = [];
    const allocatedNames = new Set<string>();
    for (const file of files) {
      if (cancelledRef.current) break;
      const imgUrl = URL.createObjectURL(file);
      const img    = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = imgUrl; });
      if (cancelledRef.current) { URL.revokeObjectURL(imgUrl); break; }
      let w = img.naturalWidth, h = img.naturalHeight;
      const mw = parseInt(maxWidth), mh = parseInt(maxHeight);
      if (!isNaN(mw) && mw > 0) { const s = mw / w; h = Math.round(h * s); w = mw; }
      if (!isNaN(mh) && mh > 0 && h > mh) { const s = mh / h; w = Math.round(w * s); h = mh; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      if (format === 'jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(imgUrl);
      const mime = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, quality / 100));
      if (!blob) continue;
      const ext  = format === 'jpeg' ? 'jpg' : format;
      const stem = file.name.replace(/\.[^.]+$/, '');
      let candidate = `${stem}.${ext}`;
      let counter   = 2;
      while (allocatedNames.has(candidate)) {
        candidate = `${stem}-${counter}.${ext}`;
        counter++;
      }
      allocatedNames.add(candidate);
      out.push({ name: candidate, url: URL.createObjectURL(blob) });
      setProgress((p) => p ? { done: p.done + 1, total: p.total } : p);
    }
    if (cancelledRef.current) {
      out.forEach((r) => URL.revokeObjectURL(r.url));
      setResults([]);
    } else {
      setResults(out);
    }
    setConverting(false);
    setProgress(null);
  };

  const downloadAllAsZip = async () => {
    if (results.length < 2) return;
    const zipFiles: Record<string, Uint8Array> = {};
    for (const r of results) {
      const blob = await fetch(r.url).then((res) => res.blob());
      const buf  = await blob.arrayBuffer();
      zipFiles[r.name] = new Uint8Array(buf);
    }
    const zipped = zipSync(zipFiles);
    const url    = URL.createObjectURL(new Blob([zipped], { type: 'application/zip' }));
    const a      = document.createElement('a');
    a.href       = url;
    a.download   = `${zipFilename.trim() || 'converted-images'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatLabels: Record<string, string> = {
    png: 'Lossless, great for graphics',
    jpeg: 'Smaller files, ideal for photos',
    webp: 'Modern format, best of both',
  };

  return (
    <section className="renamer-page" data-testid="image-converter">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(140 50% 35%)', background: 'hsl(140 50% 35% / .11)' }}><ImagePlus /></span>
            <div><h1>Image Converter.</h1><p>Convert, resize, and process images locally.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Original stays safe</span>
      </div>
      <DisplacedWidgetBand />
      {showIncomingIC && (
        <IncomingFilesQueue
          files={incomingIC}
          onOpen={(h) => {
            const file = handoffToFile(h);
            const dt = new DataTransfer();
            dt.items.add(file);
            handleFiles(dt.files);
            removeHandoff(IC_TOOL_ID, h.id);
            setIncomingIC([...peekHandoffs(IC_TOOL_ID)]);
          }}
          onRemove={(h) => { removeHandoff(IC_TOOL_ID, h.id); setIncomingIC([...peekHandoffs(IC_TOOL_ID)]); }}
          onClear={() => { clearHandoffs(IC_TOOL_ID); setIncomingIC([]); setShowIncomingIC(false); }}
          onDismiss={() => setShowIncomingIC(false)}
        />
      )}
      <div className="renamer-notice">
        <ImagePlus />
        <div><strong>Converts entirely in your browser</strong><span>No upload, no server. Your images never leave your computer.</span></div>
      </div>
      <div className="image-converter-workspace">
        <div
          className={`image-converter-controls${shelfDragState === 'compat' ? ' is-shelf-drag-compat' : shelfDragState === 'incompat' ? ' is-shelf-drag-incompat' : ''}`}
          onDragEnter={handleDropZoneDragEnter}
          onDragLeave={handleDropZoneDragLeave}
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
        >
          <div className="renamer-section-heading">
            <span className="eyebrow">01 · Select images</span>
            {files.length > 0 && <span className="library-count">{files.length} image{files.length !== 1 ? 's' : ''}</span>}
          </div>
          <label className={`file-picker${isDraggingOver ? ' is-drag-over' : ''}`}>
            <ImagePlus /><span>{isDraggingOver ? 'Drop to add images' : files.length ? 'Choose different images' : 'Select images — or drop files here'}</span>
            <input type="file" accept={IMAGE_ACCEPT} multiple onChange={(e) => handleFiles(e.target.files)} data-testid="input-image-picker" />
          </label>
          {previews.length > 0 && (
            <div className="ic-thumb-strip" data-testid="image-thumbnail-strip">
              {previews.map((p, i) => (
                <div
                  className={`ic-thumb-item${dragOverIndex === i ? ' is-drag-over' : ''}`}
                  key={i}
                  draggable
                  onDragStart={() => { dragIndexRef.current = i; }}
                  onDragOver={(e) => { e.preventDefault(); if (dragOverIndex !== i) setDragOverIndex(i); }}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={() => {
                    const from = dragIndexRef.current;
                    setDragOverIndex(null);
                    dragIndexRef.current = null;
                    if (from !== null) reorderImages(from, i);
                  }}
                  onDragEnd={() => { setDragOverIndex(null); dragIndexRef.current = null; }}
                >
                  <div className="ic-thumb-img-wrap">
                    {failedThumbs.has(i) ? (
                      <div className="ic-thumb-placeholder" aria-label={p.name}>
                        <span className="ic-thumb-ext">{getFileExt(p.name)}</span>
                      </div>
                    ) : (
                      <img
                        src={p.url}
                        alt={p.name}
                        className="ic-thumb-img"
                        onError={() => setFailedThumbs((prev) => new Set(prev).add(i))}
                      />
                    )}
                    {isNonRenderable(p.name) && (
                      <div
                        className="ic-thumb-raw-badge"
                        title="RAW/HEIC files cannot be decoded in the browser. Convert to JPEG or PNG with a native app first for best results."
                        aria-label="RAW format — may not convert correctly in browser"
                      >
                        <AlertTriangle />
                      </div>
                    )}
                    <button
                      type="button"
                      className="ic-thumb-remove"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => removeImage(i)}
                      data-testid={`button-remove-image-${i}`}
                    >
                      <X />
                    </button>
                  </div>
                  <span className="ic-thumb-name">{p.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Output format</span></div>
          <div className="rename-method-selector">
            {(['png', 'jpeg', 'webp'] as const).map((f) => (
              <button key={f} type="button" className={`rename-method-card${format === f ? ' is-selected' : ''}`} onClick={() => setFormat(f)}>
                <div><strong>{f === 'jpeg' ? 'JPG' : f.toUpperCase()}</strong><span>{formatLabels[f]}</span></div>
              </button>
            ))}
          </div>
          {format === 'jpeg' && (
            <label className="rename-field">
              <span>Quality — {quality}%</span>
              <input type="range" min="10" max="100" step="5" value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
          )}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">03 · Resize (optional)</span></div>
          <div className="rename-field-pair">
            <label className="rename-field"><span>Max width (px)</span><input type="number" min="1" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} placeholder="Original" /></label>
            <label className="rename-field"><span>Max height (px)</span><input type="number" min="1" value={maxHeight} onChange={(e) => setMaxHeight(e.target.value)} placeholder="Original" /></label>
          </div>
          <p className="renamer-help">Resize maintains aspect ratio. Leave blank to keep original dimensions.</p>
        </div>
        <div className="image-converter-results">
          <div className="renamer-section-heading">
            <span className="eyebrow">04 · Download</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {results.length > 0 && <span className="library-count">{results.length} ready</span>}
              {results.length >= 2 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="text"
                    value={zipFilename}
                    onChange={(e) => setZipFilename(e.target.value)}
                    placeholder="converted-images"
                    aria-label="ZIP filename"
                    data-testid="input-zip-filename"
                    style={{ fontSize: 11, height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', width: 140, minWidth: 80 }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', userSelect: 'none' }}>.zip</span>
                  <button type="button" className="button-quiet" onClick={downloadAllAsZip} style={{ fontSize: 11, minHeight: 30, padding: '0 12px' }} data-testid="button-download-all-zip">
                    <FileArchive /> Download all as ZIP
                  </button>
                </div>
              )}
            </div>
          </div>
          {converting && progress && (
            <div className="ic-progress-wrap">
              <div className="ic-progress-label">
                <span>{progress.done} of {progress.total} converted</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                  <button type="button" className="button-quiet" onClick={cancelConversion} style={{ fontSize: 11, minHeight: 28, padding: '0 12px' }} data-testid="button-cancel-conversion">
                    <X /> Cancel
                  </button>
                </div>
              </div>
              <div className="ic-progress-bar">
                <div className="ic-progress-fill" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
          {results.length === 0 && !converting ? (
            <div className="renamer-empty"><div className="empty-cube"><ImagePlus /></div><h2>Converted images appear here.</h2><p>Choose images and a format, then click Convert.</p></div>
          ) : results.length === 0 ? null : (
            <div className="image-result-list">
              {results.map((r, i) => {
                const ext = r.name.split('.').pop()?.toLowerCase() ?? 'png';
                const resultMime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
                return (
                  <div
                    className="image-result-row"
                    key={i}
                    draggable
                    title="Drag to File Shelf to save"
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        TOOL_OUTPUT_DRAG_TYPE,
                        encodeToolOutput({ filename: r.name, mimeType: resultMime, objectUrl: r.url }),
                      );
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <img src={r.url} alt={r.name} className="image-result-thumb" />
                    <span className="image-result-name">{r.name}</span>
                    <a href={r.url} download={r.name} className="button-primary" style={{ fontSize: 11, minHeight: 34, padding: '0 14px', textDecoration: 'none' }}>
                      <Download /> Save
                    </a>
                  </div>
                );
              })}
            </div>
          )}
          {files.some((f) => isNonRenderable(f.name)) && (
            <div className="ic-raw-warning" data-testid="raw-format-warning">
              <AlertTriangle />
              <div>
                <strong>Some files may not convert correctly</strong>
                <span>
                  RAW and HEIC formats ({files.filter((f) => isNonRenderable(f.name)).map((f) => getFileExt(f.name)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}) cannot be decoded directly in the browser.
                  For reliable results, convert them to JPEG or PNG with a native app (e.g. Photos, Lightroom, Preview) first.
                  You can still try — some HEIC files may work depending on your browser and OS.
                </span>
              </div>
            </div>
          )}
          <div className="renamer-actions">
            <div><strong>Originals untouched.</strong><span>Converted copies are downloaded separately.</span></div>
            <button type="button" className="button-primary" onClick={convertAll} disabled={files.length === 0 || converting} data-testid="button-convert">
              {converting && progress
                ? `${progress.done} of ${progress.total} converted…`
                : converting ? 'Converting…' : <><span>Convert</span><ArrowRight /></>}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
