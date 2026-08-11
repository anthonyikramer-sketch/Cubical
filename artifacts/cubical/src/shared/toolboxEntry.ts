import ExifReader from 'exifreader';
import { formatDuration } from './fileUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExifData = {
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

export type ToolboxEntry = {
  file: File;
  hash: string | null;
  dims: { w: number; h: number } | null;
  mediaDuration: number | null;
  videoDims: { w: number; h: number } | null;
  mediaCodec: string | null;
  exif: ExifData | null;
};

// ─── EXIF helpers ─────────────────────────────────────────────────────────────

export const RAW_EXIF_EXTS = new Set(['.cr2', '.nef', '.arw', '.dng', '.heic', '.heif']);

export function isExifCapableFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.toLowerCase() : '';
  return RAW_EXIF_EXTS.has(ext);
}

export function strTag(tags: Record<string, { description?: string; value?: unknown } | undefined>, key: string): string | null {
  const t = tags[key];
  if (!t) return null;
  const v = t.description ?? String(t.value ?? '');
  return v && v !== 'undefined' ? v.trim() || null : null;
}

export async function extractDimsFromExifTags(file: File): Promise<{ w: number; h: number } | null> {
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

export async function extractExif(file: File): Promise<ExifData | null> {
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

// ─── Media codec detection ─────────────────────────────────────────────────────

export async function detectMediaCodec(file: File): Promise<string | null> {
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

// ─── Build toolbox entry ──────────────────────────────────────────────────────

export async function buildToolboxEntry(file: File): Promise<ToolboxEntry> {
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
  // formatDuration imported but only used by consumers; keep it re-exported for convenience
  void formatDuration; // suppress unused-import lint
  return { file, hash, dims, mediaDuration, videoDims, mediaCodec, exif };
}

// Re-export for tool files that need it
export { formatDuration } from './fileUtils';
export { formatFileBytes } from './fileUtils';
