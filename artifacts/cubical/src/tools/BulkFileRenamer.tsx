import { useState, useMemo, type ChangeEvent } from 'react';
import { ArrowRight, Check, FilePlus2, Files, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { BackButton } from '../shared/contexts';
import { DisplacedWidgetBand } from '../shared/contexts';

type RenameMethod = 'full' | 'prefix' | 'suffix' | 'replace' | 'sequence';
type SelectedFile = { key: string; file: File; };
type RenamePreview = { key: string; originalName: string; proposedName: string; conflict: boolean; };

function fileStemAndExtension(fileName: string) {
  const extensionIndex = fileName.lastIndexOf('.');
  if (extensionIndex <= 0) return { stem: fileName, extension: '' };
  return { stem: fileName.slice(0, extensionIndex), extension: fileName.slice(extensionIndex) };
}

function getProposedName(
  fileName: string,
  method: RenameMethod,
  options: { prefix: string; suffix: string; search: string; replacement: string; sequenceStart: number; sequenceDigits: number },
  index: number,
  fullName?: string,
) {
  if (method === 'full') {
    const { extension, stem } = fileStemAndExtension(fileName);
    const nextStem = fullName === undefined ? stem : fullName.trim();
    return nextStem ? `${nextStem}${extension}` : '';
  }
  if (method === 'prefix') return `${options.prefix}${fileName}`;
  if (method === 'suffix') {
    const { stem, extension } = fileStemAndExtension(fileName);
    return `${stem}${options.suffix}${extension}`;
  }
  if (method === 'replace') {
    if (!options.search) return fileName;
    return fileName.split(options.search).join(options.replacement);
  }
  const sequence = String(options.sequenceStart + index).padStart(options.sequenceDigits, '0');
  return `${sequence} - ${fileName}`;
}

function ToolIconBadge() { return <span className="renamer-tool-icon"><Files /></span>; }

function RenameMethodCard({ method, active, title, description, onSelect }: {
  method: RenameMethod; active: boolean; title: string; description: string; onSelect: (method: RenameMethod) => void;
}) {
  return (
    <button type="button" className={`rename-method-card ${active ? 'active' : ''}`} onClick={() => onSelect(method)} aria-pressed={active} data-testid={`button-method-${method}`}>
      <span className="rename-method-radio" />
      <span><strong>{title}</strong><small>{description}</small></span>
    </button>
  );
}

export function BulkFileRenamer() {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [method, setMethod]               = useState<RenameMethod>('full');
  const [prefix, setPrefix]               = useState('project-');
  const [suffix, setSuffix]               = useState('-final');
  const [search, setSearch]               = useState('');
  const [replacement, setReplacement]     = useState('');
  const [sequenceStart, setSequenceStart] = useState(1);
  const [sequenceDigits, setSequenceDigits] = useState(2);
  const [fullRenameNames, setFullRenameNames] = useState<Record<string, string>>({});
  const [completion, setCompletion]       = useState<string | null>(null);
  const [actionError, setActionError]     = useState<string | null>(null);

  const options = { prefix, suffix, search, replacement, sequenceStart, sequenceDigits };
  const previews = useMemo<RenamePreview[]>(() => {
    const originalNames  = new Set(selectedFiles.map(({ file }) => file.name.toLowerCase()));
    const proposedNames  = selectedFiles.map(({ key, file }, index) => getProposedName(file.name, method, options, index, fullRenameNames[key]));
    const proposedCounts = proposedNames.reduce((counts, name) => {
      const n = name.toLowerCase(); counts.set(n, (counts.get(n) ?? 0) + 1); return counts;
    }, new Map<string, number>());
    return selectedFiles.map(({ key, file }, index) => {
      const proposedName         = proposedNames[index];
      const normalizedProposedName = proposedName.toLowerCase();
      const isSameName           = normalizedProposedName === file.name.toLowerCase();
      const conflict = !proposedName.trim() || (!isSameName && originalNames.has(normalizedProposedName)) || (proposedCounts.get(normalizedProposedName) ?? 0) > 1;
      return { key, originalName: file.name, proposedName, conflict };
    });
  }, [fullRenameNames, method, options.prefix, options.replacement, options.search, options.sequenceDigits, options.sequenceStart, options.suffix, selectedFiles]);

  const conflictCount = previews.filter((p) => p.conflict).length;
  const blockingReason = selectedFiles.length === 0
    ? 'Select at least one file to preview new names.'
    : conflictCount > 0
      ? 'A proposed filename already exists among the selected files or is duplicated in this batch.'
      : method === 'replace' && !search
        ? 'Enter the text you want to replace to create a preview.'
        : null;

  const updateOption = (update: () => void) => { update(); setCompletion(null); setActionError(null); };
  const setFullRenameName = (key: string, value: string) => updateOption(() => setFullRenameNames((c) => ({ ...c, [key]: value })));

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    setSelectedFiles((current) => {
      const existing = new Set(current.map(({ key }) => key));
      return [...current, ...incoming.map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}`, file })).filter(({ key }) => !existing.has(key))];
    });
    setFullRenameNames((current) => {
      const next = { ...current };
      incoming.forEach((file) => { const key = `${file.name}-${file.size}-${file.lastModified}`; if (!(key in next)) next[key] = fileStemAndExtension(file.name).stem; });
      return next;
    });
    setCompletion(null); setActionError(null); event.target.value = '';
  };

  const removeFile = (key: string) => {
    setSelectedFiles((c) => c.filter((sf) => sf.key !== key));
    setFullRenameNames((c) => { const next = { ...c }; delete next[key]; return next; });
    setCompletion(null); setActionError(null);
  };

  const clearFiles = () => { setSelectedFiles([]); setFullRenameNames({}); setCompletion(null); setActionError(null); };

  const renameFiles = () => {
    if (blockingReason) { setActionError(blockingReason); return; }
    setActionError(null);
    setCompletion(`${previews.length} file${previews.length === 1 ? '' : 's'} checked successfully. This browser prototype did not change files.`);
  };

  return (
    <section className="renamer-page" data-testid="bulk-file-renamer">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><ToolIconBadge /><div><h1>Bulk File Renamer.</h1><p>Give a whole folder a thoughtful name in one quick pass.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Ready when you are</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <FilePlus2 />
        <div><strong>Safe preview mode</strong><span>Files are selected only for this session. Nothing is changed until you review the preview and click Rename Files.</span></div>
      </div>
      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Choose files</span><span className="library-count">{selectedFiles.length} selected</span></div>
          <label className="file-picker"><FilePlus2 /><span>Select files</span><input type="file" multiple onChange={selectFiles} data-testid="input-file-picker" /></label>
          <p className="renamer-help">Choose multiple files from your computer to build a rename preview.</p>
          {selectedFiles.length > 0 && (
            <div className="selected-file-list" data-testid="selected-file-list">
              {selectedFiles.map(({ key, file }) => (
                <div className="selected-file" key={key}><span>{file.name}</span><button type="button" onClick={() => removeFile(key)} aria-label={`Remove ${file.name}`}><Trash2 /></button></div>
              ))}
              <button type="button" className="text-button" onClick={clearFiles} data-testid="button-clear-files"><RotateCcw /> Clear selection</button>
            </div>
          )}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Rename method</span></div>
          <div className="rename-method-grid">
            <RenameMethodCard method="full"     active={method === 'full'}     title="Full Rename"  description="Type a complete filename"    onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="prefix"   active={method === 'prefix'}   title="Add before"   description="Put text at the start"       onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="suffix"   active={method === 'suffix'}   title="Add after"    description="Put text before extension"   onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="replace"  active={method === 'replace'}  title="Replace text" description="Swap a specific phrase"      onSelect={(m) => updateOption(() => setMethod(m))} />
            <RenameMethodCard method="sequence" active={method === 'sequence'} title="Number files" description="Add an ordered number"       onSelect={(m) => updateOption(() => setMethod(m))} />
          </div>
          <div className="rename-options">
            {method === 'full' && selectedFiles.length === 0 && <p className="rename-mode-note">Select one file to type its complete filename. The extension stays protected.</p>}
            {method === 'full' && selectedFiles.length === 1 && (() => {
              const sf = selectedFiles[0];
              const { extension, stem } = fileStemAndExtension(sf.file.name);
              return <label className="rename-field"><span>Filename</span><div className="filename-input-row"><input value={fullRenameNames[sf.key] ?? stem} onChange={(e) => setFullRenameName(sf.key, e.target.value)} placeholder={stem} data-testid="input-full-rename" /><span>{extension || 'no extension'}</span></div><small className="rename-field-hint">The file extension is protected and stays unchanged.</small></label>;
            })()}
            {method === 'full' && selectedFiles.length > 1 && <p className="rename-mode-note">Full Rename is for manual per-file editing. Edit each proposed filename directly in the preview table; use the batch methods for larger groups.</p>}
            {method === 'prefix'   && <label className="rename-field"><span>Text before filename</span><input value={prefix} onChange={(e) => updateOption(() => setPrefix(e.target.value))} placeholder="project-" data-testid="input-prefix" /></label>}
            {method === 'suffix'   && <label className="rename-field"><span>Text after filename</span><input value={suffix} onChange={(e) => updateOption(() => setSuffix(e.target.value))} placeholder="-final" data-testid="input-suffix" /></label>}
            {method === 'replace'  && <div className="rename-field-pair"><label className="rename-field"><span>Find</span><input value={search} onChange={(e) => updateOption(() => setSearch(e.target.value))} placeholder="draft" data-testid="input-replace-search" /></label><label className="rename-field"><span>Replace with</span><input value={replacement} onChange={(e) => updateOption(() => setReplacement(e.target.value))} placeholder="final" data-testid="input-replace-value" /></label></div>}
            {method === 'sequence' && <div className="rename-field-pair"><label className="rename-field"><span>Start at</span><input type="number" min="0" value={sequenceStart} onChange={(e) => updateOption(() => setSequenceStart(Math.max(0, Number(e.target.value) || 0)))} data-testid="input-sequence-start" /></label><label className="rename-field"><span>Number width</span><input type="number" min="1" max="6" value={sequenceDigits} onChange={(e) => updateOption(() => setSequenceDigits(Math.min(6, Math.max(1, Number(e.target.value) || 1))))} data-testid="input-sequence-digits" /></label></div>}
          </div>
        </div>
        <div className="renamer-preview-panel">
          <div className="renamer-section-heading"><span className="eyebrow">03 · Preview changes</span><span className="library-count">{previews.length} preview{previews.length === 1 ? '' : 's'}</span></div>
          {selectedFiles.length === 0 ? (
            <div className="renamer-empty" data-testid="renamer-empty"><div className="empty-cube"><Files /></div><h2>Your preview starts here.</h2><p>Select a few files on the left to see the original and proposed names side-by-side.</p></div>
          ) : (
            <div className="rename-preview-table" data-testid="rename-preview-table">
              <div className="preview-table-head"><span>Original filename</span><span>Proposed filename</span></div>
              <div className="preview-table-body">
                {previews.map((preview) => (
                  <div className={`preview-row ${preview.conflict ? 'conflict' : ''}`} key={preview.key}>
                    <span title={preview.originalName}>{preview.originalName}</span>
                    <span title={preview.proposedName}>
                      {method === 'full' && selectedFiles.length > 1 ? (
                        <span className="preview-edit-name"><input value={fullRenameNames[preview.key] ?? fileStemAndExtension(preview.originalName).stem} onChange={(e) => setFullRenameName(preview.key, e.target.value)} aria-label={`New filename for ${preview.originalName}`} data-testid={`input-full-rename-${preview.key}`} /><i>{fileStemAndExtension(preview.originalName).extension || 'no extension'}</i></span>
                      ) : (
                        preview.proposedName || 'No filename proposed'
                      )}
                      {preview.conflict && <b>Conflict</b>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {blockingReason && selectedFiles.length > 0 && <div className="renamer-error" role="alert" data-testid="renamer-error"><span>!</span>{blockingReason}</div>}
          {actionError && <div className="renamer-error" role="alert" data-testid="renamer-action-error"><span>!</span>{actionError}</div>}
          {completion && <div className="renamer-completion" role="status" data-testid="renamer-completion"><Check /><div><strong>Rename check complete</strong><span>{completion}</span></div></div>}
          <div className="renamer-actions">
            <div><strong>Nothing gets overwritten.</strong><span>Conflicts must be resolved before continuing.</span></div>
            <button type="button" className="button-primary" onClick={renameFiles} disabled={selectedFiles.length === 0 || Boolean(blockingReason)} data-testid="button-rename-files">Rename Files <ArrowRight /></button>
          </div>
        </div>
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>Desktop functionality required later.</strong> Cubical is currently running in a browser, so it can read selected filenames but cannot safely rename files in place. A future Windows desktop build will connect this preview to a filesystem permission layer; this prototype never deletes or overwrites anything.</p></div>
    </section>
  );
}
