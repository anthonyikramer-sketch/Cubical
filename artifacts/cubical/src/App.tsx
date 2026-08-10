import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleUserRound,
  FileArchive,
  FileScan,
  Files,
  FolderCog,
  Grid2X2,
  Library as LibraryIcon,
  PackageOpen,
  Settings,
  Sparkles,
  TableProperties,
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
            <button className="button-primary" onClick={onOpen} data-testid="button-open-added"><Check /> In your library · Open</button>
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
      {products.length === 0 ? <EmptyLibrary /> : <div className="library-list" data-testid="library-list">{products.map((product, index) => <div className="library-row" style={{ animationDelay: `${index * 60}ms` }} key={product.id} data-testid={`row-library-${product.id}`}><ProductIcon product={product} /><div className="library-row-main"><div className="library-row-name">{product.name}</div><div className="library-row-description">{product.description}</div></div><button className="button-quiet" onClick={() => onOpen(product)} data-testid={`button-open-${product.id}`}>Open <ArrowRight className="ml-1 inline-block h-3 w-3" /></button></div>)}</div>}
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
  const openProduct = (product: Product) => setToast(`${product.name} would launch here`);

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
        <Route path="/profile"><PlaceholderPage type="profile" /></Route>
        <Route path="/settings"><PlaceholderPage type="settings" /></Route>
        <Route><NotFound /></Route>
      </Switch>
      {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check /> {toast}</div>}
    </AppShell>
  );
}

export default App;