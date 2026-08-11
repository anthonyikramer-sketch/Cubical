/**
 * Reusable "Incoming files" banner for Cubical tools that receive files via
 * the Send To system.  Renders a compact, dismissible queue with Open/Remove
 * actions per item.  Styling lives in index.css (.cubical-incoming-*).
 */

import { Inbox, X } from 'lucide-react';
import { type FileHandoff } from './sendTo';

interface IncomingFilesQueueProps {
  files:     FileHandoff[];
  onOpen:    (h: FileHandoff) => void;
  onRemove:  (h: FileHandoff) => void;
  onClear:   () => void;
  onDismiss: () => void;
}

export function IncomingFilesQueue({ files, onOpen, onRemove, onClear, onDismiss }: IncomingFilesQueueProps) {
  if (files.length === 0) return null;
  return (
    <div className="cubical-incoming-banner">
      <div className="cubical-incoming-header">
        <Inbox className="w-4 h-4 shrink-0" style={{ color: 'hsl(var(--primary))' }} />
        <span className="cubical-incoming-title">
          {files.length === 1 ? '1 file incoming from File Finder' : `${files.length} files incoming from File Finder`}
        </span>
        <button className="cubical-incoming-clear" onClick={onClear}>Clear all</button>
        <button className="cubical-incoming-close" onClick={onDismiss} title="Dismiss"><X className="w-3 h-3" /></button>
      </div>
      <ul className="cubical-incoming-list">
        {files.map((h) => (
          <li key={h.id} className="cubical-incoming-item">
            <span className="cubical-incoming-name">📄 {h.name}</span>
            <button className="cubical-incoming-open" onClick={() => onOpen(h)}>Open</button>
            <button className="cubical-incoming-del" onClick={() => onRemove(h)} title="Remove from queue">
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
