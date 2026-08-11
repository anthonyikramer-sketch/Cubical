import { useState } from 'react';
import ExifReader from 'exifreader';
import { Check, ClipboardCopy, Download, ExternalLink, FilePlus2, FileText } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

// ── Local types & utilities (mirrors App.tsx) ─────────────────────────────────

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

function mimeCategory(type: string): string {
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('text/'))  return 'Text file';
  if (type === 'application/pdf') return 'PDF document';
  if (/spreadsheet|excel|csv/.test(type)) return 'Spreadsheet';
  if (/zip|archive|compressed|7z|rar/.test(type)) return 'Archive';
  return 'File';
}

const RAW_EXIF_EXTS = new Set(['.cr2', '.nef', '.arw', '.dng', '.heic', '.heif']);

function isExifCapableFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.toLowerCase() : '';
  return RAW_EXIF_EXTS.has(ext);
}

async function extractDimsFromExifTags(file: File): Promise<{ w: number; h: number } | null> {
  try {
    const buf  = await file.arrayBuffer();
    const tags = ExifReader.load(buf) as Record<string, { description?: string; value?: unknown } | undefined>;
    const numTag = (key: string): number | null => {
      const t = tags[key];
      if (!t) return null;
      const v = typeof t.value === 'number' ? t.value
               : typeof t.description === 'string' ? Number(t.description)
               : NaN;
      return isFinite(v) && v > 0 ? v : null;
    };
    const w = numTag('ImageWidth')  ?? numTag('PixelXDimension');
    const h = numTag('ImageLength') ?? numTag('PixelYDimension');
    if (w !== null && h !== null) return { w, h };
    return null;
  } catch { return null; }
}

function strTag(tags: Record<string, { description?: string; value?: unknown } | undefined>, key: string): string | null {
  const t = tags[key];
  if (!t) return null;
  const v = t.description ?? String(t.value ?? '');
  return v && v !== 'undefined' ? v.trim() || null : null;
}

async function extractExif(file: File): Promise<ExifData | null> {
  try {
    const buf = await file.arrayBuffer();
    const expanded = ExifReader.load(buf, { expanded: true }) as {
      exif?: Record<string, { description?: string; value?: unknown } | undefined>;
      gps?:  { Latitude?: number; Longitude?: number };
    };
    const tags = expanded.exif ?? {};
    const gps  = expanded.gps;
    let gpsLat: string | null = null;
    let gpsLon: string | null = null;
    if (gps?.Latitude  != null) gpsLat = gps.Latitude.toFixed(6);
    if (gps?.Longitude != null) gpsLon = gps.Longitude.toFixed(6);
    const exif: ExifData = {
      make:         strTag(tags, 'Make'),
      model:        strTag(tags, 'Model'),
      dateTaken:    strTag(tags, 'DateTimeOriginal') ?? strTag(tags, 'DateTime'),
      iso:          strTag(tags, 'ISOSpeedRatings') ?? strTag(tags, 'ISO'),
      shutterSpeed: strTag(tags, 'ExposureTime') ?? strTag(tags, 'ShutterSpeedValue'),
      aperture:     strTag(tags, 'FNumber') ?? strTag(tags, 'ApertureValue'),
      focalLength:  strTag(tags, 'FocalLength'),
      flash:        strTag(tags, 'Flash'),
      gpsLat,
      gpsLon,
      orientation:  strTag(tags, 'Orientation'),
    };
    const hasAny = Object.values(exif).some((v) => v !== null);
    return hasAny ? exif : null;
  } catch { return null; }
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
      return null;
    }
    if (mime === 'video/webm' || mime === 'audio/webm' || mime === 'video/x-matroska' || mime === 'video/mkv') {
      if (findSeq('V_AV1'))             return 'AV1';
      if (findSeq('V_VP9'))             return 'VP9';
      if (findSeq('V_VP8'))             return 'VP8';
      if (findSeq('V_MPEG4/ISO/AVC'))   return 'H.264';
      if (findSeq('V_MPEGH/ISO/HEVC'))  return 'H.265 / HEVC';
      return null;
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
  const exif = isExifCapableFile(file) ? await extractExif(file) : null;
  if (dims === null && isExifCapableFile(file)) {
    dims = await extractDimsFromExifTags(file);
  }
  return { file, hash, dims, mediaDuration, videoDims, mediaCodec, exif };
}

// ── Text preview ──────────────────────────────────────────────────────────────

const TEXT_EXTENSIONS = new Set([
  'txt','md','markdown','rst','log','csv','tsv',
  'json','yaml','yml','toml','ini','cfg','conf','env','properties',
  'js','jsx','ts','tsx','mjs','cjs',
  'py','rb','php','java','c','cpp','cc','h','hpp','cs','go','rs','swift','kt','scala',
  'html','htm','xml','svg','css','scss','sass','less',
  'sh','bash','zsh','fish','ps1','bat','cmd',
  'sql','graphql','gql',
  'diff','patch','gitignore','editorconfig','prettierrc','eslintrc',
  'dockerfile','makefile','cmake',
  'vue','svelte','astro',
]);

const LANGUAGE_LABELS: Record<string, string> = {
  js:'JavaScript', jsx:'JavaScript', mjs:'JavaScript', cjs:'JavaScript',
  ts:'TypeScript', tsx:'TypeScript',
  py:'Python', rb:'Ruby', php:'PHP', java:'Java',
  c:'C', cpp:'C++', cc:'C++', h:'C/C++ Header', hpp:'C++ Header',
  cs:'C#', go:'Go', rs:'Rust', swift:'Swift', kt:'Kotlin', scala:'Scala',
  html:'HTML', htm:'HTML', xml:'XML', svg:'SVG',
  css:'CSS', scss:'SCSS', sass:'Sass', less:'Less',
  sh:'Shell', bash:'Bash', zsh:'Zsh', fish:'Fish', ps1:'PowerShell', bat:'Batch', cmd:'Batch',
  sql:'SQL', graphql:'GraphQL', gql:'GraphQL',
  json:'JSON', yaml:'YAML', yml:'YAML', toml:'TOML', ini:'INI',
  md:'Markdown', markdown:'Markdown', rst:'reStructuredText',
  vue:'Vue', svelte:'Svelte', astro:'Astro',
  csv:'CSV', tsv:'TSV', log:'Log', txt:'Plain text',
};

const TEXT_PREVIEW_BYTES = 8192;
const TEXT_PREVIEW_LINES = 100;

function fileExt(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true;
  if (['application/json','application/xml','application/javascript',
       'application/typescript','application/x-sh','image/svg+xml'].includes(file.type)) return true;
  return TEXT_EXTENSIONS.has(fileExt(file.name));
}

function detectLanguageLabel(file: File): string {
  const ext = fileExt(file.name);
  if (ext && LANGUAGE_LABELS[ext]) return LANGUAGE_LABELS[ext];
  if (file.type === 'application/json') return 'JSON';
  if (file.type === 'image/svg+xml')    return 'SVG';
  if (file.type.startsWith('text/'))    return 'Plain text';
  return 'Text';
}

function readTextSlice(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob   = file.slice(0, TEXT_PREVIEW_BYTES);
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FileInspector() {
  const [entry,       setEntry]       = useState<ToolboxEntry | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [copied,      setCopied]      = useState<string | null>(null);
  const [imgSrc,      setImgSrc]      = useState<string | null>(null);
  const [mediaUrl,    setMediaUrl]    = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<{ content: string; truncated: boolean; lang: string } | null>(null);

  const clearMedia = () => {
    if (mediaUrl) { URL.revokeObjectURL(mediaUrl); setMediaUrl(null); }
    if (imgSrc)   { URL.revokeObjectURL(imgSrc);   setImgSrc(null);   }
  };

  const loadFile = async (file: File) => {
    clearMedia();
    setTextPreview(null);
    setLoading(true);
    const built = await buildToolboxEntry(file);
    if (built.dims) {
      setImgSrc(URL.createObjectURL(file));
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/')) {
      setMediaUrl(URL.createObjectURL(file));
    } else if (isTextFile(file)) {
      try {
        const raw       = await readTextSlice(file);
        const allLines  = raw.split('\n');
        const truncated = allLines.length > TEXT_PREVIEW_LINES || file.size > TEXT_PREVIEW_BYTES;
        const lines     = allLines.slice(0, TEXT_PREVIEW_LINES);
        setTextPreview({ content: lines.join('\n'), truncated, lang: detectLanguageLabel(file) });
      } catch { /* ignore read errors */ }
    }
    setEntry(built);
    setLoading(false);
  };

  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  const ext = entry ? (entry.file.name.includes('.') ? `.${entry.file.name.split('.').pop()}` : '—') : '';
  const isVideo = entry?.file.type.startsWith('video/');
  const isAudio = entry?.file.type.startsWith('audio/');

  return (
    <section className="renamer-page" data-testid="file-inspector">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(350 58% 46%)', background: 'hsl(350 58% 46% / .11)' }}><FileText /></span>
            <div><h1>File Inspector.</h1><p>Drop in a file and see what's inside.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Local only</span>
      </div>
      <DisplacedWidgetBand />
      <div
        className="toolbox-drop-panel"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
      >
        {!entry && !loading ? (
          <>
            <div className="empty-cube"><FileText /></div>
            <h2>Drop a file to inspect it.</h2>
            <p>File Inspector reads name, size, type, dates, dimensions for images, and a SHA-256 hash — entirely in your browser.</p>
            <label className="file-picker" style={{ marginTop: 16 }}>
              <FilePlus2 /><span>Browse for a file</span>
              <input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }} data-testid="input-inspector-picker" />
            </label>
          </>
        ) : loading ? (
          <p className="toolbox-loading">Inspecting file…</p>
        ) : entry && (
          <div className="toolbox-file-info">
            {imgSrc && <div className="inspector-img-wrap"><img src={imgSrc} alt={entry.file.name} className="inspector-img-thumb" /></div>}
            <div className="toolbox-info-grid">
              <span className="toolbox-info-label">File name</span>  <span className="toolbox-info-value">{entry.file.name}</span>
              <span className="toolbox-info-label">Category</span>   <span className="toolbox-info-value">{mimeCategory(entry.file.type)}</span>
              <span className="toolbox-info-label">MIME type</span>  <span className="toolbox-info-value">{entry.file.type || '—'}</span>
              <span className="toolbox-info-label">Extension</span>  <span className="toolbox-info-value">{ext}</span>
              <span className="toolbox-info-label">Size</span>       <span className="toolbox-info-value">{formatFileBytes(entry.file.size)} ({entry.file.size.toLocaleString()} bytes)</span>
              <span className="toolbox-info-label">Modified</span>   <span className="toolbox-info-value">{new Date(entry.file.lastModified).toLocaleString()}</span>
              {entry.dims && (<><span className="toolbox-info-label">Dimensions</span><span className="toolbox-info-value">{entry.dims.w} × {entry.dims.h} px</span></>)}
              {entry.videoDims && (<><span className="toolbox-info-label">Resolution</span><span className="toolbox-info-value">{entry.videoDims.w} × {entry.videoDims.h} px</span></>)}
              {entry.mediaDuration !== null && (<><span className="toolbox-info-label">Duration</span><span className="toolbox-info-value">{formatDuration(entry.mediaDuration)}</span></>)}
              {entry.mediaCodec && (<><span className="toolbox-info-label">Codec</span><span className="toolbox-info-value">{entry.mediaCodec}</span></>)}
              {entry.hash && (<><span className="toolbox-info-label">SHA-256</span><span className="toolbox-info-value toolbox-hash">{entry.hash}</span></>)}
            </div>
            {entry.exif && (
              <div className="inspector-exif-section">
                <div className="inspector-exif-heading">Camera &amp; EXIF</div>
                <div className="inspector-exif-grid">
                  {(entry.exif.make || entry.exif.model) && (() => {
                    const val = [entry.exif.make, entry.exif.model].filter(Boolean).join(' ');
                    return (
                      <div className="inspector-exif-row">
                        <span className="toolbox-info-label">Camera</span>
                        <span className="toolbox-info-value">{val}</span>
                        <button type="button" className={`exif-copy-btn${copied === 'exif-camera' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(val, 'exif-camera')}>
                          {copied === 'exif-camera' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                        </button>
                      </div>
                    );
                  })()}
                  {entry.exif.dateTaken && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Date taken</span>
                      <span className="toolbox-info-value">{entry.exif.dateTaken}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-date' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.dateTaken!, 'exif-date')}>
                        {copied === 'exif-date' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.iso && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">ISO</span>
                      <span className="toolbox-info-value">{entry.exif.iso}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-iso' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(String(entry.exif!.iso!), 'exif-iso')}>
                        {copied === 'exif-iso' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.shutterSpeed && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Shutter speed</span>
                      <span className="toolbox-info-value">{entry.exif.shutterSpeed}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-shutter' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.shutterSpeed!, 'exif-shutter')}>
                        {copied === 'exif-shutter' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.aperture && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Aperture</span>
                      <span className="toolbox-info-value">{entry.exif.aperture}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-aperture' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.aperture!, 'exif-aperture')}>
                        {copied === 'exif-aperture' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.focalLength && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Focal length</span>
                      <span className="toolbox-info-value">{entry.exif.focalLength}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-focal' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.focalLength!, 'exif-focal')}>
                        {copied === 'exif-focal' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.flash && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Flash</span>
                      <span className="toolbox-info-value">{entry.exif.flash}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-flash' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.flash!, 'exif-flash')}>
                        {copied === 'exif-flash' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {entry.exif.orientation && (
                    <div className="inspector-exif-row">
                      <span className="toolbox-info-label">Orientation</span>
                      <span className="toolbox-info-value">{entry.exif.orientation}</span>
                      <button type="button" className={`exif-copy-btn${copied === 'exif-orient' ? ' is-copied' : ''}`} title="Copy value" onClick={() => copyText(entry.exif!.orientation!, 'exif-orient')}>
                        {copied === 'exif-orient' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {(entry.exif.gpsLat && entry.exif.gpsLon) && (() => {
                    const val = `${entry.exif.gpsLat}, ${entry.exif.gpsLon}`;
                    return (
                      <div className="inspector-exif-row">
                        <span className="toolbox-info-label">GPS</span>
                        <span className="toolbox-info-value">
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}`} target="_blank" rel="noopener noreferrer" className="inspector-gps-link">{val} ↗</a>
                        </span>
                        <button type="button" className={`exif-copy-btn${copied === 'exif-gps' ? ' is-copied' : ''}`} title="Copy coordinates" onClick={() => copyText(val, 'exif-gps')}>
                          {copied === 'exif-gps' ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
                        </button>
                      </div>
                    );
                  })()}
                </div>
                <button
                  type="button"
                  className={`button-quiet exif-copy-all-btn${copied === 'exif-all' ? ' is-copied' : ''}`}
                  onClick={() => {
                    const exif = entry.exif!;
                    const lines: string[] = [];
                    if (exif.make || exif.model) lines.push(`Camera: ${[exif.make, exif.model].filter(Boolean).join(' ')}`);
                    if (exif.dateTaken)          lines.push(`Date taken: ${exif.dateTaken}`);
                    if (exif.iso)                lines.push(`ISO: ${exif.iso}`);
                    if (exif.shutterSpeed)       lines.push(`Shutter speed: ${exif.shutterSpeed}`);
                    if (exif.aperture)           lines.push(`Aperture: ${exif.aperture}`);
                    if (exif.focalLength)        lines.push(`Focal length: ${exif.focalLength}`);
                    if (exif.flash)              lines.push(`Flash: ${exif.flash}`);
                    if (exif.orientation)        lines.push(`Orientation: ${exif.orientation}`);
                    if (exif.gpsLat && exif.gpsLon) lines.push(`GPS: ${exif.gpsLat}, ${exif.gpsLon}`);
                    copyText(lines.join('\n'), 'exif-all');
                  }}
                >
                  {copied === 'exif-all' ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
                  {copied === 'exif-all' ? 'Copied!' : 'Copy all EXIF'}
                </button>
              </div>
            )}
            {mediaUrl && isVideo && (
              <video key={mediaUrl} src={mediaUrl} controls className="inspector-media-player"
                style={{ width: '100%', maxHeight: 360, borderRadius: 8, marginTop: 12, background: '#000' }} />
            )}
            {mediaUrl && isAudio && (
              <audio key={mediaUrl} src={mediaUrl} controls className="inspector-media-player"
                style={{ width: '100%', marginTop: 12 }} />
            )}
            {textPreview && (
              <div className="inspector-text-preview">
                <div className="inspector-text-preview-header">
                  <span className="inspector-text-lang">{textPreview.lang}</span>
                  {textPreview.truncated && (
                    <span className="inspector-text-truncated-note">
                      Showing first {TEXT_PREVIEW_LINES} lines · {formatFileBytes(entry.file.size)} total
                    </span>
                  )}
                  <button type="button" className="inspector-text-copy-btn button-quiet" onClick={() => copyText(textPreview.content, 'text')}>
                    <ClipboardCopy className="w-3.5 h-3.5" />
                    {copied === 'text' ? 'Copied!' : 'Copy content'}
                  </button>
                </div>
                <pre className="inspector-text-code"><code>{textPreview.content}</code></pre>
              </div>
            )}
            <div className="toolbox-actions">
              <button type="button" className="button-quiet" onClick={() => copyText(entry.file.name, 'name')}><ClipboardCopy /> {copied === 'name' ? 'Copied!' : 'Copy filename'}</button>
              {entry.hash && <button type="button" className="button-quiet" onClick={() => copyText(entry.hash!, 'hash')}><ClipboardCopy /> {copied === 'hash' ? 'Copied!' : 'Copy SHA-256'}</button>}
              {(isAudio || isVideo) && mediaUrl && (
                <>
                  <a href={mediaUrl} download={entry.file.name} className="button-quiet"><Download /> Download</a>
                  <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="button-quiet"><ExternalLink /> Open in tab</a>
                </>
              )}
              <button type="button" className="button-quiet" onClick={() => { setEntry(null); setCopied(null); clearMedia(); setTextPreview(null); }}>Inspect another file</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
