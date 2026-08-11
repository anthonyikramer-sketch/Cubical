import { useState, useMemo, type ChangeEvent } from 'react';
import { File, FilePlus2, FolderCog, FolderOpen, RotateCcw } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

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

function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function FileOrganizerPage() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...picked.filter((f) => !existing.has(f.name + f.size))];
    });
    e.target.value = '';
  };

  const groups = useMemo(() => {
    const map: Record<string, File[]> = {};
    for (const f of files) {
      const cat = mimeCategory(f.type);
      if (!map[cat]) map[cat] = [];
      map[cat].push(f);
    }
    return Object.entries(map).sort((a, b) => b[1].length - a[1].length);
  }, [files]);

  const totalSize = files.reduce((s, f) => s + f.size, 0);

  return (
    <section className="renamer-page" data-testid="file-organizer">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(164 48% 32%)', background: 'hsl(164 48% 32% / .12)' }}><FolderCog /></span>
            <div><h1>File Organizer.</h1><p>Sort, group, and make sense of your files in one pass.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Files stay on your computer</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <FolderCog />
        <div>
          <strong>Group files by type</strong>
          <span>Select files to see how they'd be organized by category. Nothing is moved — this is a preview only.</span>
        </div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Select files</span><span className="library-count">{files.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={handleFiles} /></label>
          {files.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>{formatFileBytes(totalSize)} total</p>
              <button type="button" className="text-button" style={{ marginTop: 6 }} onClick={() => setFiles([])}><RotateCcw /> Clear</button>
            </div>
          )}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading"><span className="eyebrow">02 · Organized by type</span></div>
          {files.length === 0 ? (
            <div className="renamer-empty"><FolderOpen style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select files to see how they would be grouped.</p></div>
          ) : (
            <div className="storage-folder-list">
              {groups.map(([cat, catFiles]) => (
                <div key={cat}>
                  <div className="renamer-section-heading" style={{ marginTop: 12 }}>
                    <span className="eyebrow">{cat}</span>
                    <span className="library-count" style={{ opacity: .7 }}>{catFiles.length} file{catFiles.length !== 1 ? 's' : ''} · {formatFileBytes(catFiles.reduce((s, f) => s + f.size, 0))}</span>
                  </div>
                  {catFiles.map((f) => (
                    <div className="storage-folder-row" key={f.name + f.size}>
                      <File className="storage-folder-row-icon" />
                      <span className="storage-folder-name" style={{ flex: 1, minWidth: 'auto', fontSize: 12 }}>{f.name}</span>
                      <span className="storage-folder-size">{formatFileBytes(f.size)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
