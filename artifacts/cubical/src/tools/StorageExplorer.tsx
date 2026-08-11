import { useState } from 'react';
import { FolderOpen, HardDrive, Sparkles } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';
import { formatFileBytes } from '../shared/fileUtils';

export function StorageExplorer() {
  const hasApi    = typeof (window as any).showDirectoryPicker === 'function';
  const [scanning, setScanning]   = useState(false);
  const [entries, setEntries]     = useState<{ name: string; size: number; kind: string }[]>([]);
  const [dirName, setDirName]     = useState<string | null>(null);
  const [totalSize, setTotalSize] = useState(0);
  const [error, setError]         = useState<string | null>(null);

  const scanSubDir = async (handle: any, depth: number): Promise<number> => {
    let total = 0;
    try {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          try { total += (await entry.getFile()).size; } catch { /* locked */ }
        } else if (depth < 2) {
          total += await scanSubDir(entry, depth + 1);
        }
      }
    } catch { /* skip inaccessible */ }
    return total;
  };

  const handleScan = async () => {
    setError(null);
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setDirName(dirHandle.name);
      setScanning(true);
      setEntries([]);
      const topEntries: { name: string; size: number; kind: string }[] = [];
      let grand = 0;
      for await (const entry of dirHandle.values()) {
        let size = 0;
        if (entry.kind === 'file') {
          try { size = (await entry.getFile()).size; } catch { /* skip */ }
        } else {
          size = await scanSubDir(entry, 0);
        }
        grand += size;
        topEntries.push({ name: entry.name, size, kind: entry.kind });
      }
      topEntries.sort((a, b) => b.size - a.size);
      setEntries(topEntries.slice(0, 24));
      setTotalSize(grand);
    } catch (e: any) {
      if ((e as any)?.name !== 'AbortError') setError('Could not read folder. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  const maxSize = entries[0]?.size || 1;

  const previewEntries = [
    { name: 'Documents', size: '12.4 GB', pct: 62 },
    { name: 'Downloads', size: '6.7 GB',  pct: 34 },
    { name: 'Pictures',  size: '4.1 GB',  pct: 21 },
    { name: 'Videos',    size: '2.3 GB',  pct: 12 },
    { name: 'AppData',   size: '1.8 GB',  pct: 9  },
  ];

  return (
    <section className="renamer-page" data-testid="storage-explorer">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · {hasApi ? 'works in browser' : 'local prototype'}</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(215 60% 43%)', background: 'hsl(215 60% 43% / .12)' }}><HardDrive /></span>
            <div><h1>Storage Explorer.</h1><p>See exactly what's taking up space on your PC.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> {hasApi ? (scanning ? 'Scanning…' : dirName ? 'Scanned' : 'Ready') : 'Preview mode'}</span>
      </div>
      <DisplacedWidgetBand />
      {hasApi ? (
        <>
          <div className="renamer-notice">
            <HardDrive />
            <div>
              <strong>{dirName ? `Showing: ${dirName}` : 'Choose a folder to scan'}</strong>
              <span>Select any folder and Storage Explorer will measure what is taking up space. Nothing is moved or changed.</span>
            </div>
            <button type="button" className="button-primary" onClick={handleScan} disabled={scanning} style={{ flexShrink: 0, fontSize: 12, minHeight: 36, padding: '0 16px' }}>
              {scanning ? 'Scanning…' : dirName ? 'Scan another' : 'Select folder'}
            </button>
          </div>
          {error && <p style={{ color: 'hsl(0 65% 50%)', fontSize: 13, margin: '8px 0' }}>{error}</p>}
          {(entries.length > 0 || scanning) && (
            <div className="storage-explorer-workspace">
              <div className="storage-drive-card">
                <div className="storage-drive-header">
                  <HardDrive className="storage-drive-icon" />
                  <div className="storage-drive-meta-wrap">
                    <div className="storage-drive-name">{dirName}</div>
                    <div className="storage-drive-meta">{scanning ? 'Scanning…' : `${formatFileBytes(totalSize)} total · ${entries.length} items shown`}</div>
                  </div>
                </div>
                <div className="storage-bar-track"><div className="storage-bar-fill" style={{ width: scanning ? '60%' : '100%' }} /></div>
              </div>
              {entries.length > 0 && (
                <div className="storage-folder-list">
                  <div className="renamer-section-heading">
                    <span className="eyebrow">Largest items</span>
                    <span className="library-count" style={{ opacity: .55 }}>{entries.length} shown</span>
                  </div>
                  {entries.map((e) => (
                    <div className="storage-folder-row" key={e.name}>
                      <FolderOpen className="storage-folder-row-icon" />
                      <span className="storage-folder-name">{e.name}</span>
                      <div className="storage-row-bar-track"><div className="storage-row-bar-fill" style={{ width: `${Math.round(e.size / maxSize * 100)}%` }} /></div>
                      <span className="storage-folder-size">{formatFileBytes(e.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="renamer-notice">
            <HardDrive />
            <div>
              <strong>Desktop access required</strong>
              <span>Storage Explorer needs direct filesystem access. It will be fully functional in the Cubical desktop app for Windows.</span>
            </div>
          </div>
          <div className="storage-explorer-workspace">
            <div className="storage-drive-card">
              <div className="storage-drive-header">
                <HardDrive className="storage-drive-icon" />
                <div className="storage-drive-meta-wrap">
                  <div className="storage-drive-name">C:\ — Local Drive</div>
                  <div className="storage-drive-meta">19.8 GB used of 59.5 GB · Preview</div>
                </div>
              </div>
              <div className="storage-bar-track"><div className="storage-bar-fill" style={{ width: '33%' }} /></div>
            </div>
            <div className="storage-folder-list">
              <div className="renamer-section-heading">
                <span className="eyebrow">Largest folders</span>
                <span className="library-count" style={{ opacity: .55 }}>Preview data</span>
              </div>
              {previewEntries.map((e) => (
                <div className="storage-folder-row" key={e.name}>
                  <FolderOpen className="storage-folder-row-icon" />
                  <span className="storage-folder-name">{e.name}</span>
                  <div className="storage-row-bar-track"><div className="storage-row-bar-fill" style={{ width: `${e.pct}%` }} /></div>
                  <span className="storage-folder-size">{e.size}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> Folder scanning, drill-down, and file-type breakdowns connect to the local filesystem. The layout above shows what Storage Explorer will look like.</p></div>
        </>
      )}
    </section>
  );
}
