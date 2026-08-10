import { useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  FilePlus2,
  FileArchive,
  FileScan,
  Files,
  FolderCog,
  Grid2X2,
  Library as LibraryIcon,
  PackageOpen,
  RotateCcw,
  Settings,
  Sparkles,
  TableProperties,
  Trash2,
} from 'lucide-react';
import { Link, Route, Switch, useLocation } from 'wouter';

type Product = {
  id: string;
  name: string;
  description: string;
  price: string;
  icon: typeof Files;
  iconColor: string;
  iconBg: string;
};

const PRODUCTS: Product[] = [
  { id: 'file-organizer', name: 'File Organizer', description: 'A calmer way to sort, group, and find everything on your desktop.', price: '$1.99', icon: FolderCog, iconColor: 'hsl(164 48% 32%)', iconBg: 'hsl(164 48% 32% / .12)' },
  { id: 'spreadsheet-cleaner', name: 'Spreadsheet Cleaner', description: 'Sweep out the clutter hiding between your rows and columns.', price: '$2.99', icon: TableProperties, iconColor: 'hsl(31 75% 43%)', iconBg: 'hsl(31 75% 43% / .13)' },
  { id: 'pdf-toolkit', name: 'PDF Toolkit', description: 'Small, sharp tools for the PDFs you touch every day.', price: '$3.99', icon: FileScan, iconColor: 'hsl(1 68% 54%)', iconBg: 'hsl(1 68% 54% / .12)' },
  { id: 'bulk-file-renamer', name: 'Bulk File Renamer', description: 'Give a whole folder a thoughtful name in one quick pass.', price: '$0.99', icon: FileArchive, iconColor: 'hsl(226 45% 49%)', iconBg: 'hsl(226 45% 49% / .12)' },
  { id: 'duplicate-finder', name: 'Duplicate Finder', description: 'Spot the copies taking up space and keep the best version.', price: 'FREE', icon: Files, iconColor: 'hsl(287 40% 47%)', iconBg: 'hsl(287 40% 47% / .12)' },
];

const TOOL_ROUTES: Partial<Record<Product['id'], string>> = {
  'bulk-file-renamer': '/tool/bulk-file-renamer',
};

function getToolRoute(product: Product) {
  return TOOL_ROUTES[product.id];
}

function getStoredLibrary() {
  try {
    const stored = localStorage.getItem('cubical-library');
    return stored ? JSON.parse(stored) as string[] : [];
  } catch {
    return [];
  }
}

function AppShell({ children, libraryCount }: { children: ReactNode; libraryCount: number }) {
  const [location] = useLocation();
  const navItems = [
    { href: '/', label: 'Store', icon: Grid2X2 },
    { href: '/library', label: 'Library', icon: LibraryIcon },
  ];
  const utilityItems = [
    { href: '/profile', label: 'Profile', icon: CircleUserRound },
    { href: '/settings', label: 'Settings', icon: Settings },
  ];
  return (
    <div className="cubical-shell">
      <aside className="cubical-sidebar" data-testid="sidebar-navigation">
        <Link href="/" className="flex items-center gap-3 no-underline" data-testid="link-brand">
          <span className="brand-mark">C</span><span className="brand-word">cubical</span>
        </Link>
        <div className="mt-12 w-full">
          <div className="side-label mb-3">Your shelf</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Main navigation">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}>
                <Icon /><span>{label}{label === 'Library' && libraryCount > 0 ? ` · ${libraryCount}` : ''}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom w-full">
          <div className="side-label mb-3">The little things</div>
          <nav className="sidebar-nav flex flex-col gap-1" aria-label="Utility navigation">
            {utilityItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}>
                <Icon /><span>{label}</span>
              </Link>
            ))}
          </nav>
          <p className="sidebar-footnote">A personal shelf for useful little tools.<br />Made for curious desktops.</p>
        </div>
      </aside>
      <main className="cubical-main">
        <header className="topbar">
          <span className="crumb" data-testid="text-location">{location === '/' ? 'SHELF / STORE' : `SHELF / ${location.slice(1).toUpperCase()}`}</span>
          <span className="topbar-hint"><i className="status-dot" /> Local prototype · everything stays here</span>
        </header>
        {children}
      </main>
    </div>
  );
}

function ProductIcon({ product, size = 'normal' }: { product: Product; size?: 'normal' | 'large' }) {
  const Icon = product.icon;
  return <span className={`tool-icon ${size === 'large' ? 'h-[66px] w-[66px] rounded-[19px]' : ''}`} style={{ '--icon-color': product.iconColor, '--icon-bg': product.iconBg } as CSSProperties} data-testid={`icon-product-${product.id}`}><Icon /></span>;
}

function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.id}`} className="product-card" data-testid={`card-product-${product.id}`}>
      <ProductIcon product={product} />
      <div className="card-meta"><span className="card-name" data-testid={`text-product-name-${product.id}`}>{product.name}</span><span className="price" data-testid={`text-product-price-${product.id}`}>{product.price}</span></div>
      <p className="card-description" data-testid={`text-product-description-${product.id}`}>{product.description}</p>
      <div className="card-footer"><span>View tool</span><ArrowRight /></div>
    </Link>
  );
}

function StorePage() {
  return (
    <section>
      <div className="page-intro">
        <div className="eyebrow">A small shelf of useful things</div>
        <h1 className="display-title mt-4">Tools worth<br /><em className="not-italic" style={{ color: 'hsl(var(--primary))' }}>keeping around.</em></h1>
        <p>Browse focused desktop tools made to do one thing well. Pick the ones that feel like you.</p>
      </div>
      <div className="mb-5 flex items-center justify-between"><span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>The current edit</span><span className="library-count">05 tools · no noise</span></div>
      <div className="product-grid" data-testid="product-catalog">{PRODUCTS.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </section>
  );
}

function ScreenshotPlaceholder({ product }: { product: Product }) {
  return (
    <div className="screenshot-placeholder" data-testid={`placeholder-screenshot-${product.id}`}>
      <div className="window-bar"><i /><i /><i /><span className="ml-auto font-mono text-[9px] text-white/40">{product.name.toUpperCase()}</span></div>
      <div className="mock-ui">
        <div className="mock-ui-line" /><div className="mock-ui-line short" />
        <div className="mock-ui-blocks"><div className="mock-ui-block" /><div className="mock-ui-block" /></div>
      </div>
    </div>
  );
}

function ProductDetail({ product, isAdded, onAdd, onOpen }: { product: Product; isAdded: boolean; onAdd: () => void; onOpen: () => void }) {
  const toolRoute = getToolRoute(product);
  return (
    <section>
      <Link href="/" className="detail-back" data-testid="link-back-store"><ArrowLeft /> Back to store</Link>
      <div className="detail-layout">
        <div className="detail-copy">
          <ProductIcon product={product} size="large" />
          <div className="eyebrow mt-7">A focused little utility</div>
          <h1 data-testid="text-detail-name">{product.name}</h1>
          <p data-testid="text-detail-description">{product.description} Built to stay out of your way, feel good to use, and make a small part of your day lighter.</p>
          <div className="detail-price" data-testid="text-detail-price">{product.price} · one-time, local-only</div>
          {isAdded ? (
            toolRoute ? (
              <Link href={toolRoute} className="button-primary" data-testid="button-open-added"><Check /> In your library · Open</Link>
            ) : (
              <button className="button-primary" onClick={onOpen} data-testid="button-open-added"><Check /> In your library · Open</button>
            )
          ) : (
            <button className="button-primary" onClick={onAdd} data-testid="button-add-library">Add to library <ArrowRight /></button>
          )}
        </div>
        <ScreenshotPlaceholder product={product} />
      </div>
    </section>
  );
}

function EmptyLibrary() {
  return (
    <div className="empty-state" data-testid="empty-library">
      <div className="empty-cube"><PackageOpen /></div>
      <h2>Your shelf is still open.</h2>
      <p>Tools you add from the Store will land here, ready for their next small job.</p>
      <Link href="/" className="button-primary" data-testid="link-empty-store">Browse the store <ArrowRight /></Link>
    </div>
  );
}

function LibraryPage({ products, onOpen }: { products: Product[]; onOpen: (product: Product) => void }) {
  return (
    <section>
      <div className="library-head"><div className="page-intro !mb-0"><div className="eyebrow">Your chosen tools</div><h1 className="display-title mt-4">Your library.</h1><p>Everything you decided was worth keeping, in one quiet place.</p></div><span className="library-count" data-testid="text-library-count">{String(products.length).padStart(2, '0')} saved</span></div>
      {products.length === 0 ? <EmptyLibrary /> : <div className="library-list" data-testid="library-list">{products.map((product, index) => {
        const toolRoute = getToolRoute(product);
        return (
          <div className="library-row" style={{ animationDelay: `${index * 60}ms` }} key={product.id} data-testid={`row-library-${product.id}`}>
            <ProductIcon product={product} />
            <div className="library-row-main"><div className="library-row-name">{product.name}</div><div className="library-row-description">{product.description}</div></div>
            {toolRoute ? (
              <Link className="button-quiet" href={toolRoute} data-testid={`button-open-${product.id}`}>Open <ArrowRight className="ml-1 inline-block h-3 w-3" /></Link>
            ) : (
              <button className="button-quiet" onClick={() => onOpen(product)} data-testid={`button-open-${product.id}`}>Open <ArrowRight className="ml-1 inline-block h-3 w-3" /></button>
            )}
          </div>
        );
      })}</div>}
    </section>
  );
}

type RenameMethod = 'full' | 'prefix' | 'suffix' | 'replace' | 'sequence';

type SelectedFile = {
  key: string;
  file: File;
};

type RenamePreview = {
  key: string;
  originalName: string;
  proposedName: string;
  conflict: boolean;
};

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

function ToolIconBadge() {
  return <span className="renamer-tool-icon"><FileArchive /></span>;
}

function RenameMethodCard({
  method,
  active,
  title,
  description,
  onSelect,
}: {
  method: RenameMethod;
  active: boolean;
  title: string;
  description: string;
  onSelect: (method: RenameMethod) => void;
}) {
  return (
    <button
      type="button"
      className={`rename-method-card ${active ? 'active' : ''}`}
      onClick={() => onSelect(method)}
      aria-pressed={active}
      data-testid={`button-method-${method}`}
    >
      <span className="rename-method-radio" />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  );
}

function BulkFileRenamer() {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [method, setMethod] = useState<RenameMethod>('full');
  const [prefix, setPrefix] = useState('project-');
  const [suffix, setSuffix] = useState('-final');
  const [search, setSearch] = useState('');
  const [replacement, setReplacement] = useState('');
  const [sequenceStart, setSequenceStart] = useState(1);
  const [sequenceDigits, setSequenceDigits] = useState(2);
  const [fullRenameNames, setFullRenameNames] = useState<Record<string, string>>({});
  const [completion, setCompletion] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const options = { prefix, suffix, search, replacement, sequenceStart, sequenceDigits };
  const previews = useMemo<RenamePreview[]>(() => {
    const originalNames = new Set(selectedFiles.map(({ file }) => file.name.toLowerCase()));
    const proposedNames = selectedFiles.map(({ key, file }, index) => getProposedName(file.name, method, options, index, fullRenameNames[key]));
    const proposedCounts = proposedNames.reduce((counts, name) => {
      const normalizedName = name.toLowerCase();
      counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    return selectedFiles.map(({ key, file }, index) => {
      const proposedName = proposedNames[index];
      const normalizedProposedName = proposedName.toLowerCase();
      const isSameName = normalizedProposedName === file.name.toLowerCase();
      const conflict = !proposedName.trim() || (!isSameName && originalNames.has(normalizedProposedName)) || (proposedCounts.get(normalizedProposedName) ?? 0) > 1;
      return { key, originalName: file.name, proposedName, conflict };
    });
  }, [fullRenameNames, method, options.prefix, options.replacement, options.search, options.sequenceDigits, options.sequenceStart, options.suffix, selectedFiles]);

  const conflictCount = previews.filter((preview) => preview.conflict).length;
  const blockingReason = selectedFiles.length === 0
    ? 'Select at least one file to preview new names.'
    : conflictCount > 0
      ? 'A proposed filename already exists among the selected files or is duplicated in this batch.'
      : method === 'replace' && !search
        ? 'Enter the text you want to replace to create a preview.'
        : null;

  const updateOption = (update: () => void) => {
    update();
    setCompletion(null);
    setActionError(null);
  };

  const setFullRenameName = (key: string, value: string) => {
    updateOption(() => setFullRenameNames((current) => ({ ...current, [key]: value })));
  };

  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incomingFiles = Array.from(event.target.files ?? []);
    setSelectedFiles((current) => {
      const existingKeys = new Set(current.map(({ key }) => key));
      const newFiles = incomingFiles
        .map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}`, file }))
        .filter(({ key }) => !existingKeys.has(key));
      return [...current, ...newFiles];
    });
    setFullRenameNames((current) => {
      const next = { ...current };
      incomingFiles.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!(key in next)) next[key] = fileStemAndExtension(file.name).stem;
      });
      return next;
    });
    setCompletion(null);
    setActionError(null);
    event.target.value = '';
  };

  const removeFile = (key: string) => {
    setSelectedFiles((current) => current.filter((selectedFile) => selectedFile.key !== key));
    setFullRenameNames((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setCompletion(null);
    setActionError(null);
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setFullRenameNames({});
    setCompletion(null);
    setActionError(null);
  };

  const renameFiles = () => {
    if (blockingReason) {
      setActionError(blockingReason);
      return;
    }
    setActionError(null);
    setCompletion(`${previews.length} file${previews.length === 1 ? '' : 's'} checked successfully. This browser prototype did not change files.`);
  };

  return (
    <section className="renamer-page" data-testid="bulk-file-renamer">
      <Link href="/library" className="detail-back" data-testid="link-back-library"><ArrowLeft /> Back to library</Link>
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><ToolIconBadge /><div><h1>Bulk File Renamer.</h1><p>Give a whole folder a thoughtful name in one quick pass.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Ready when you are</span>
      </div>

      <div className="renamer-notice">
        <FilePlus2 />
        <div><strong>Safe preview mode</strong><span>Files are selected only for this session. Nothing is changed until you review the preview and click Rename Files.</span></div>
      </div>

      <div className="renamer-workspace">
        <div className="renamer-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Choose files</span><span className="library-count">{selectedFiles.length} selected</span></div>
          <label className="file-picker">
            <FilePlus2 />
            <span>Select files</span>
            <input type="file" multiple onChange={selectFiles} data-testid="input-file-picker" />
          </label>
          <p className="renamer-help">Choose multiple files from your computer to build a rename preview.</p>
          {selectedFiles.length > 0 && (
            <div className="selected-file-list" data-testid="selected-file-list">
              {selectedFiles.map(({ key, file }) => (
                <div className="selected-file" key={key}>
                  <span>{file.name}</span>
                  <button type="button" onClick={() => removeFile(key)} aria-label={`Remove ${file.name}`} data-testid={`button-remove-file-${key}`}><Trash2 /></button>
                </div>
              ))}
              <button type="button" className="text-button" onClick={clearFiles} data-testid="button-clear-files"><RotateCcw /> Clear selection</button>
            </div>
          )}

          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Rename method</span></div>
          <div className="rename-method-grid">
            <RenameMethodCard method="full" active={method === 'full'} title="Full Rename" description="Type a complete filename" onSelect={(nextMethod) => updateOption(() => setMethod(nextMethod))} />
            <RenameMethodCard method="prefix" active={method === 'prefix'} title="Add before" description="Put text at the start" onSelect={(nextMethod) => updateOption(() => setMethod(nextMethod))} />
            <RenameMethodCard method="suffix" active={method === 'suffix'} title="Add after" description="Put text before extension" onSelect={(nextMethod) => updateOption(() => setMethod(nextMethod))} />
            <RenameMethodCard method="replace" active={method === 'replace'} title="Replace text" description="Swap a specific phrase" onSelect={(nextMethod) => updateOption(() => setMethod(nextMethod))} />
            <RenameMethodCard method="sequence" active={method === 'sequence'} title="Number files" description="Add an ordered number" onSelect={(nextMethod) => updateOption(() => setMethod(nextMethod))} />
          </div>

          <div className="rename-options">
            {method === 'full' && selectedFiles.length === 0 && <p className="rename-mode-note">Select one file to type its complete filename. The extension stays protected.</p>}
            {method === 'full' && selectedFiles.length === 1 && (() => {
              const selectedFile = selectedFiles[0];
              const { extension, stem } = fileStemAndExtension(selectedFile.file.name);
              return (
                <label className="rename-field"><span>Filename</span><div className="filename-input-row"><input value={fullRenameNames[selectedFile.key] ?? stem} onChange={(event) => setFullRenameName(selectedFile.key, event.target.value)} placeholder={stem} data-testid="input-full-rename" /><span>{extension || 'no extension'}</span></div><small className="rename-field-hint">The file extension is protected and stays unchanged.</small></label>
              );
            })()}
            {method === 'full' && selectedFiles.length > 1 && <p className="rename-mode-note">Full Rename is for manual per-file editing. Edit each proposed filename directly in the preview table; use the batch methods for larger groups.</p>}
            {method === 'prefix' && <label className="rename-field"><span>Text before filename</span><input value={prefix} onChange={(event) => updateOption(() => setPrefix(event.target.value))} placeholder="project-" data-testid="input-prefix" /></label>}
            {method === 'suffix' && <label className="rename-field"><span>Text after filename</span><input value={suffix} onChange={(event) => updateOption(() => setSuffix(event.target.value))} placeholder="-final" data-testid="input-suffix" /></label>}
            {method === 'replace' && <div className="rename-field-pair"><label className="rename-field"><span>Find</span><input value={search} onChange={(event) => updateOption(() => setSearch(event.target.value))} placeholder="draft" data-testid="input-replace-search" /></label><label className="rename-field"><span>Replace with</span><input value={replacement} onChange={(event) => updateOption(() => setReplacement(event.target.value))} placeholder="final" data-testid="input-replace-value" /></label></div>}
            {method === 'sequence' && <div className="rename-field-pair"><label className="rename-field"><span>Start at</span><input type="number" min="0" value={sequenceStart} onChange={(event) => updateOption(() => setSequenceStart(Math.max(0, Number(event.target.value) || 0)))} data-testid="input-sequence-start" /></label><label className="rename-field"><span>Number width</span><input type="number" min="1" max="6" value={sequenceDigits} onChange={(event) => updateOption(() => setSequenceDigits(Math.min(6, Math.max(1, Number(event.target.value) || 1))))} data-testid="input-sequence-digits" /></label></div>}
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
                        <span className="preview-edit-name"><input value={fullRenameNames[preview.key] ?? fileStemAndExtension(preview.originalName).stem} onChange={(event) => setFullRenameName(preview.key, event.target.value)} aria-label={`New filename for ${preview.originalName}`} data-testid={`input-full-rename-${preview.key}`} /><i>{fileStemAndExtension(preview.originalName).extension || 'no extension'}</i></span>
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

function PlaceholderPage({ type }: { type: 'profile' | 'settings' }) {
  const profile = type === 'profile';
  return (
    <section className="placeholder-page">
      <div className="eyebrow">{profile ? 'A little about you' : 'Make it yours'}</div>
      <h1 className="display-title mt-4">{profile ? 'Profile.' : 'Settings.'}</h1>
      <div className="placeholder-panel" data-testid={`placeholder-${type}`}>
        <Sparkles className="mb-5 h-6 w-6 text-[hsl(var(--accent))]" />
        <h2 className="font-display text-xl font-semibold tracking-tight">{profile ? 'This is a local prototype.' : 'Nothing to tune just yet.'}</h2>
        <p>{profile ? 'Accounts, names, and cloud profiles are intentionally not part of Cubical yet. For now, this shelf belongs entirely to the person sitting at this desktop.' : 'Cubical keeps things intentionally simple for this first pass. There are no accounts, sync settings, payments, or automatic updates to configure.'}</p>
      </div>
    </section>
  );
}

function NotFound() {
  return <section className="placeholder-page"><div className="eyebrow">Shelf / missing</div><h1 className="display-title mt-4">That page wandered off.</h1><div className="mt-8"><Link href="/" className="button-primary" data-testid="link-not-found-store">Back to store <ArrowRight /></Link></div></section>;
}

function App() {
  const [libraryIds, setLibraryIds] = useState<string[]>(getStoredLibrary);
  const [toast, setToast] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const libraryProducts = useMemo(() => PRODUCTS.filter((product) => libraryIds.includes(product.id)), [libraryIds]);

  useEffect(() => { localStorage.setItem('cubical-library', JSON.stringify(libraryIds)); }, [libraryIds]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 2800); return () => window.clearTimeout(timeout); }, [toast]);

  const addToLibrary = (product: Product) => {
    setLibraryIds((current) => current.includes(product.id) ? current : [...current, product.id]);
    setToast(`${product.name} added to your library`);
  };
  const openProduct = (product: Product) => {
    const toolRoute = getToolRoute(product);
    if (toolRoute) {
      setLocation(toolRoute);
      return;
    }
    setToast(`${product.name} would launch here`);
  };

  return (
    <AppShell libraryCount={libraryProducts.length}>
      <Switch>
        <Route path="/"><StorePage /></Route>
        <Route path="/product/:id">{(params) => {
          const product = PRODUCTS.find((item) => item.id === params.id);
          if (!product) return <NotFound />;
          return <ProductDetail product={product} isAdded={libraryIds.includes(product.id)} onAdd={() => addToLibrary(product)} onOpen={() => openProduct(product)} />;
        }}</Route>
        <Route path="/library"><LibraryPage products={libraryProducts} onOpen={openProduct} /></Route>
        <Route path="/tool/bulk-file-renamer"><BulkFileRenamer /></Route>
        <Route path="/profile"><PlaceholderPage type="profile" /></Route>
        <Route path="/settings"><PlaceholderPage type="settings" /></Route>
        <Route><NotFound /></Route>
      </Switch>
      {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check /> {toast}</div>}
    </AppShell>
  );
}

export default App;