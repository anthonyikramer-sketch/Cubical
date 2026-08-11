import { useState } from 'react';
import { ClipboardCopy, ExternalLink, FilePlus2, FolderOpen, Sparkles } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

// ── Local copies of utilities (pure functions, same logic as App.tsx) ─────────

type ExifData = {
  make:         string | null;
  model:        string | null;
  dateTaken:    string | null;
  iso:          string | null;
  shutterSpeed: string | null;
  aperture:     string | null;
  focalLength:  string | null;
  flash:        string | null;
  gpsLat:       string | null;
  gpsLon:       string | null;
  orientation:  string | null;
};

type ToolboxEntry = {
  file: File;
  hash: string | null;
  dims: { w: number; h: number } | null;
  mediaDuration: number | null;
  videoDims: { w: number; h: number } | null;
  mediaCodec: string | null;
  exif: ExifData | null;
};

function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function detectMediaCodec(file: File): Promise<string | null> {
  const mime = file.type;
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'MP3';
  if (mime === 'audio/flac' || mime === 'audio/x-flac') return 'FLAC';
  if (mime === 'audio/wav'  || mime === 'audio/x-wav') return 'PCM';
  if (mime === 'audio/aac') return 'AAC';
  try {
    const buf   = await file.slice(0, 65536).arrayBuffer();
    const bytes = new Uint8Array(buf);
    function findSeq(tag: string): boolean {
      const codes = Array.from(tag).map((c) => c.charCodeAt(0));
      outer: for (let i = 0; i <= bytes.length - codes.length; i++) {
        for (let j = 0; j < codes.length; j++) { if (bytes[i + j] !== codes[j]) continue outer; }
        return true;
      }
      return false;
    }
    if (mime.includes('mp4') || mime === 'video/quicktime' || mime === 'audio/m4a' || mime === 'audio/x-m4a') {
      if (findSeq('avc1') || findSeq('avc3')) return 'H.264';
      if (findSeq('hvc1') || findSeq('hev1')) return 'H.265 / HEVC';
      if (findSeq('av01')) return 'AV1';
      if (findSeq('vp08')) return 'VP8';
      if (findSeq('vp09')) return 'VP9';
      if (findSeq('ap4h') || findSeq('apch') || findSeq('apcn') || findSeq('apco')) return 'Apple ProRes';
      if (findSeq('mp4a')) return 'AAC';
      return null;
    }
    if (mime === 'video/webm' || mime === 'audio/webm' || mime === 'video/x-matroska' || mime === 'video/mkv') {
      if (findSeq('V_AV1'))             return 'AV1';
      if (findSeq('V_VP9'))             return 'VP9';
      if (findSeq('V_VP8'))             return 'VP8';
      if (findSeq('V_MPEG4/ISO/AVC'))   return 'H.264';
      if (findSeq('V_MPEGH/ISO/HEVC'))  return 'H.265 / HEVC';
      if (findSeq('A_OPUS'))            return 'Opus';
      if (findSeq('A_VORBIS'))          return 'Vorbis';
      if (findSeq('A_FLAC'))            return 'FLAC';
      return null;
    }
    if (mime === 'audio/ogg' || mime === 'video/ogg' || mime === 'audio/x-ogg') {
      if (findSeq('OpusHead')) return 'Opus';
      if (findSeq('vorbis'))   return 'Vorbis';
      if (findSeq('fLaC'))     return 'FLAC';
      return 'Vorbis';
    }
    if (mime === 'video/avi' || mime === 'video/x-msvideo') {
      if (findSeq('xvid') || findSeq('XVID')) return 'Xvid';
      if (findSeq('DIVX') || findSeq('divx')) return 'DivX';
      if (findSeq('H264') || findSeq('avc1')) return 'H.264';
      return 'MPEG-4';
    }
    return null;
  } catch { return null; }
}

async function buildToolboxEntry(file: File): Promise<ToolboxEntry> {
  let hash: string | null = null;
  let dims: { w: number; h: number } | null = null;
  let mediaDuration: number | null = null;
  let videoDims: { w: number; h: number } | null = null;
  try {
    const buf    = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { /* unavailable */ }
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    dims = await new Promise<{ w: number; h: number } | null>((res) => {
      const img = new Image();
      img.onload  = () => { URL.revokeObjectURL(url); res({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = () => { URL.revokeObjectURL(url); res(null); };
      img.src = url;
    });
  } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);
    const result = await new Promise<{ duration: number; vw: number; vh: number } | null>((res) => {
      const el = isVideo ? document.createElement('video') : document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const vw = isVideo ? (el as HTMLVideoElement).videoWidth  : 0;
        const vh = isVideo ? (el as HTMLVideoElement).videoHeight : 0;
        res({ duration: el.duration, vw, vh });
      };
      el.onerror = () => { URL.revokeObjectURL(url); res(null); };
      el.src = url;
    });
    if (result !== null) {
      mediaDuration = isFinite(result.duration) ? result.duration : null;
      if (isVideo && result.vw > 0 && result.vh > 0) videoDims = { w: result.vw, h: result.vh };
    }
  }
  const mediaCodec = (file.type.startsWith('video/') || file.type.startsWith('audio/'))
    ? await detectMediaCodec(file)
    : null;
  return { file, hash, dims, mediaDuration, videoDims, mediaCodec, exif: null };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileToolbox() {
  const [entry,   setEntry]   = useState<ToolboxEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied,  setCopied]  = useState<string | null>(null);

  const loadFile = async (file: File) => {
    setLoading(true);
    setEntry(await buildToolboxEntry(file));
    setLoading(false);
  };

  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  const ext      = entry?.file.name.includes('.') ? entry.file.name.split('.').pop()?.toUpperCase() ?? '—' : '—';
  const isImage  = entry?.file.type.startsWith('image/');
  const isPdf    = entry?.file.type === 'application/pdf';
  const isText   = entry?.file.type.startsWith('text/');

  return (
    <section className="renamer-page" data-testid="file-toolbox">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(25 65% 42%)', background: 'hsl(25 65% 42% / .11)' }}><FolderOpen /></span>
            <div><h1>File Toolbox.</h1><p>One place for all your everyday file utilities.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      {!entry && !loading && (
        <div className="renamer-notice">
          <FolderOpen />
          <div><strong>Drop any file to get started</strong><span>File Toolbox inspects your file and offers actions based on its type. Nothing leaves your browser.</span></div>
        </div>
      )}
      <div
        className="toolbox-drop-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
      >
        {!entry && !loading ? (
          <>
            <div className="empty-cube"><FolderOpen /></div>
            <h2>Drop a file here.</h2>
            <p>Any file — image, PDF, text, archive — File Toolbox will read it and offer the right tools.</p>
            <label className="file-picker" style={{ marginTop: 16 }}>
              <FilePlus2 /><span>Browse for a file</span>
              <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} data-testid="input-toolbox-picker" />
            </label>
          </>
        ) : loading ? (
          <p className="toolbox-loading">Reading file…</p>
        ) : entry && (
          <div className="toolbox-file-info">
            <div className="toolbox-info-grid">
              <span className="toolbox-info-label">Name</span>      <span className="toolbox-info-value">{entry.file.name}</span>
              <span className="toolbox-info-label">Size</span>      <span className="toolbox-info-value">{formatFileBytes(entry.file.size)}</span>
              <span className="toolbox-info-label">Type</span>      <span className="toolbox-info-value">{entry.file.type || '—'}</span>
              <span className="toolbox-info-label">Extension</span> <span className="toolbox-info-value">{ext}</span>
              <span className="toolbox-info-label">Modified</span>  <span className="toolbox-info-value">{new Date(entry.file.lastModified).toLocaleString()}</span>
              {entry.dims && (<><span className="toolbox-info-label">Dimensions</span><span className="toolbox-info-value">{entry.dims.w} × {entry.dims.h} px</span></>)}
              {entry.videoDims && (<><span className="toolbox-info-label">Resolution</span><span className="toolbox-info-value">{entry.videoDims.w} × {entry.videoDims.h} px</span></>)}
              {entry.mediaDuration !== null && (<><span className="toolbox-info-label">Duration</span><span className="toolbox-info-value">{formatDuration(entry.mediaDuration)}</span></>)}
              {entry.mediaCodec && (<><span className="toolbox-info-label">Codec</span><span className="toolbox-info-value">{entry.mediaCodec}</span></>)}
              {entry.hash && (<><span className="toolbox-info-label">SHA-256</span><span className="toolbox-info-value toolbox-hash">{entry.hash}</span></>)}
            </div>
            <div className="toolbox-actions">
              <button type="button" className="button-quiet" onClick={() => copyText(entry.file.name, 'name')}><ClipboardCopy /> {copied === 'name' ? 'Copied!' : 'Copy filename'}</button>
              {entry.hash && <button type="button" className="button-quiet" onClick={() => copyText(entry.hash!, 'hash')}><ClipboardCopy /> {copied === 'hash' ? 'Copied!' : 'Copy hash'}</button>}
              {isImage && <a href={URL.createObjectURL(entry.file)} target="_blank" rel="noopener noreferrer" className="button-quiet"><ExternalLink /> View image</a>}
              {isPdf   && <a href={URL.createObjectURL(entry.file)} target="_blank" rel="noopener noreferrer" className="button-quiet"><ExternalLink /> Open PDF</a>}
              {isText  && <button type="button" className="button-quiet" onClick={async () => { const t = await entry.file.text(); copyText(t, 'content'); }}><ClipboardCopy /> {copied === 'content' ? 'Copied!' : 'Copy content'}</button>}
              <button type="button" className="button-quiet" onClick={() => { setEntry(null); setCopied(null); }}>Clear</button>
            </div>
          </div>
        )}
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>More actions coming.</strong> Desktop-specific features — rename in place, move, open containing folder, PDF tools — arrive in the Cubical Windows app.</p></div>
    </section>
  );
}
