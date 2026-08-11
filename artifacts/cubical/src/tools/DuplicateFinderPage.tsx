import { useState, useMemo, type ChangeEvent } from 'react';
import { Check, File, Files, FilePlus2, RotateCcw } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

function formatFileBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function DuplicateFinderPage() {
  const [files, setFiles] = useState<File[]>([]);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]);
    e.target.value = '';
  };

  const groups = useMemo(() => {
    const map = new Map<string, File[]>();
    for (const f of files) {
      const key = `${f.name}__${f.size}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.values()].filter((g) => g.length > 1);
  }, [files]);

  const wastedBytes = groups.reduce((sum, g) => sum + g.slice(1).reduce((s, f) => s + f.size, 0), 0);

  return (
    <section className="renamer-page" data-testid="duplicate-finder">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · works in browser</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(287 40% 47%)', background: 'hsl(287 40% 47% / .12)' }}><Files /></span>
            <div><h1>Duplicate Finder.</h1><p>Spot the copies taking up space and keep the best version.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Nothing is deleted</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <Files />
        <div>
          <strong>Find duplicate files</strong>
          <span>Select files to scan. Duplicates are detected by matching name and size. Nothing is deleted automatically.</span>
        </div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Select files</span><span className="library-count">{files.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={handleFiles} /></label>
          {files.length > 0 && <button type="button" className="text-button" style={{ marginTop: 8 }} onClick={() => setFiles([])}><RotateCcw /> Clear</button>}
        </div>
        <div className="renamer-preview">
          <div className="renamer-section-heading">
            <span className="eyebrow">02 · Duplicates found</span>
            {groups.length > 0 && <span className="library-count" style={{ opacity: .7 }}>{groups.length} group{groups.length !== 1 ? 's' : ''} · {formatFileBytes(wastedBytes)} wasted</span>}
          </div>
          {files.length === 0 ? (
            <div className="renamer-empty"><Files style={{ width: 32, height: 32, opacity: .35, marginBottom: 10 }} /><p>Select files to scan for duplicates.</p></div>
          ) : groups.length === 0 ? (
            <div className="renamer-empty"><Check style={{ width: 28, height: 28, color: 'hsl(140 50% 40%)', marginBottom: 10 }} /><p>No duplicates found in the selected files.</p></div>
          ) : (
            <div className="storage-folder-list">
              {groups.map((group, i) => (
                <div key={i}>
                  <div className="renamer-section-heading" style={{ marginTop: 12 }}>
                    <span className="eyebrow">"{group[0].name}"</span>
                    <span className="library-count" style={{ color: 'hsl(0 65% 50%)', opacity: 1 }}>{group.length}× · {formatFileBytes(group[0].size)} each</span>
                  </div>
                  {group.map((f, j) => (
                    <div className="storage-folder-row" key={j} style={{ opacity: j === 0 ? 1 : 0.6 }}>
                      <File className="storage-folder-row-icon" />
                      <span className="storage-folder-name" style={{ flex: 1, minWidth: 'auto', fontSize: 12 }}>{j === 0 ? '✓ Keep' : '⚠ Duplicate'} — {f.name}</span>
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
