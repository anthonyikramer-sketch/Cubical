import type { ReactNode } from 'react';
import {
  File,
  FileArchive,
  FileScan,
  FileSpreadsheet,
  FileText,
  Music,
} from 'lucide-react';

// ─── File type categories ─────────────────────────────────────────────────────

export type FileTypeCategory = 'all' | 'documents' | 'pdfs' | 'spreadsheets' | 'images' | 'videos' | 'audio' | 'archives';

export const FILE_TYPE_EXTS: Record<FileTypeCategory, string[]> = {
  all:          [],
  documents:    ['.doc', '.docx', '.txt', '.rtf', '.odt', '.pages', '.md'],
  pdfs:         ['.pdf'],
  spreadsheets: ['.xls', '.xlsx', '.csv', '.ods', '.numbers'],
  images:       ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.heic', '.cr2', '.nef', '.arw', '.dng'],
  videos:       ['.mp4', '.mov', '.avi', '.mkv', '.wmv', '.m4v', '.webm'],
  audio:        ['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.wma'],
  archives:     ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'],
};

// ─── Format utilities ─────────────────────────────────────────────────────────

/** Format bytes for File Finder results (compact units). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)       return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)         return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/** Format bytes with more decimal places for file details. */
export function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function formatModDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDuration(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── File icon resolver ───────────────────────────────────────────────────────

export function getFileIcon(ext: string): ReactNode {
  const e = ext.toLowerCase();
  if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp','.tiff','.heic','.cr2','.nef','.arw','.dng'].includes(e)) return <FileText />;
  if (['.mp4','.mov','.avi','.mkv','.wmv','.m4v','.webm'].includes(e)) return <FileText />;
  if (['.mp3','.wav','.flac','.aac','.m4a','.ogg','.wma'].includes(e)) return <Music />;
  if (['.pdf'].includes(e)) return <FileScan />;
  if (['.xls','.xlsx','.csv','.ods','.numbers'].includes(e)) return <FileSpreadsheet />;
  if (['.doc','.docx','.rtf','.odt','.pages','.md'].includes(e)) return <FileText />;
  if (['.zip','.rar','.7z','.tar','.gz','.bz2'].includes(e)) return <FileArchive />;
  if (['.txt'].includes(e)) return <FileText />;
  return <File />;
}

// ─── Highlight search match in filename ──────────────────────────────────────

export function highlightMatch(name: string, query: string): ReactNode {
  if (!query.trim()) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>{name.slice(0, idx)}<mark className="ff-highlight">{name.slice(idx, idx + query.length)}</mark>{name.slice(idx + query.length)}</>
  );
}

// ─── MIME category label ──────────────────────────────────────────────────────

export function mimeCategory(type: string): string {
  if (type.startsWith('image/')) return 'Image';
  if (type.startsWith('video/')) return 'Video';
  if (type.startsWith('audio/')) return 'Audio';
  if (type.startsWith('text/'))  return 'Text file';
  if (type === 'application/pdf') return 'PDF document';
  if (/spreadsheet|excel|csv/.test(type)) return 'Spreadsheet';
  if (/zip|archive|compressed|7z|rar/.test(type)) return 'Archive';
  return 'File';
}
