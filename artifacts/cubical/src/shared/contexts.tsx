import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  type WidgetId,
  type DisplacedWidget,
  getActiveWidgets,
  getDisplaced,
  storeActiveWidgets,
  storeDisplaced,
} from './storage';

// ─── Portable widget context ──────────────────────────────────────────────────

export interface PortableCtxShape {
  activeWidgets: WidgetId[];
  displaced:     DisplacedWidget[];
  addWidget:    (id: WidgetId) => void;
  removeWidget: (id: WidgetId) => void;
  displace:          (id: WidgetId, page: string) => void;
  recall:            (id: WidgetId) => void;
  recallAll:         () => void;
  reorderDisplaced:  (page: string, fromIdx: number, toIdx: number) => void;
  dragId:      WidgetId | null;
  setDragId:   (id: WidgetId | null) => void;
  hoverPage:   string | null;
  setHoverPage: (p: string | null) => void;
  hoverPageRef: MutableRefObject<string | null>;
}

export const PortableCtx = createContext<PortableCtxShape>({
  activeWidgets: [], displaced: [],
  addWidget: () => {}, removeWidget: () => {},
  displace: () => {}, recall: () => {}, recallAll: () => {}, reorderDisplaced: () => {},
  dragId: null, setDragId: () => {},
  hoverPage: null, setHoverPage: () => {},
  hoverPageRef: { current: null },
});

export function usePortable() { return useContext(PortableCtx); }

export function PortableProvider({ children }: { children: ReactNode }) {
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>(() => {
    const all  = getActiveWidgets();
    const disp = getDisplaced().map((d) => d.id);
    return all.filter((id) => !disp.includes(id));
  });
  const [displaced, setDisplaced] = useState<DisplacedWidget[]>(getDisplaced);
  const [dragId, setDragId]       = useState<WidgetId | null>(null);
  const [hoverPage, _setHoverPage] = useState<string | null>(null);
  const hoverPageRef = useRef<string | null>(null);

  const setHoverPage = useCallback((p: string | null) => {
    hoverPageRef.current = p;
    _setHoverPage(p);
  }, []);

  useEffect(() => { storeActiveWidgets(activeWidgets); }, [activeWidgets]);
  useEffect(() => { storeDisplaced(displaced); }, [displaced]);

  const addWidget = useCallback((id: WidgetId) => {
    setActiveWidgets((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const removeWidget = useCallback((id: WidgetId) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
  }, []);

  const displace = useCallback((id: WidgetId, page: string) => {
    setActiveWidgets((prev) => prev.filter((w) => w !== id));
    setDisplaced((prev) => [...prev.filter((d) => d.id !== id), { id, page }]);
  }, []);

  const recall = useCallback((id: WidgetId) => {
    setDisplaced((prev) => {
      const entry = prev.find((d) => d.id === id);
      if (!entry) return prev;
      setActiveWidgets((aw) => aw.includes(id) ? aw : [...aw, id]);
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const recallAll = useCallback(() => {
    setDisplaced((prev) => {
      const ids = prev.map((d) => d.id);
      setActiveWidgets((aw) => {
        const missing = ids.filter((id) => !aw.includes(id));
        return missing.length > 0 ? [...aw, ...missing] : aw;
      });
      return [];
    });
  }, []);

  const reorderDisplaced = useCallback((page: string, fromIdx: number, toIdx: number) => {
    setDisplaced((prev) => {
      const section = prev.filter((d) => d.page === page);
      const others  = prev.filter((d) => d.page !== page);
      if (fromIdx < 0 || fromIdx >= section.length || toIdx < 0 || toIdx >= section.length) return prev;
      const reordered = [...section];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return [...others, ...reordered];
    });
  }, []);

  return (
    <PortableCtx.Provider value={{
      activeWidgets, displaced,
      addWidget, removeWidget,
      displace, recall, recallAll, reorderDisplaced,
      dragId, setDragId,
      hoverPage, setHoverPage, hoverPageRef,
    }}>
      {children}
    </PortableCtx.Provider>
  );
}

// ─── Navigation history context ───────────────────────────────────────────────

type NavCtxValue = { goBack: (fallback?: string) => void; canGoBack: boolean };
export const NavCtx = createContext<NavCtxValue>({ goBack: () => {}, canGoBack: false });
export const useNavBack = () => useContext(NavCtx);

export function NavProvider({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const stackRef = useRef<string[]>([]);
  const skipRef  = useRef(false);
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    const stack = stackRef.current;
    if (stack[stack.length - 1] !== location) {
      stackRef.current = [...stack, location];
      setDepth(stackRef.current.length);
    }
  }, [location]);

  const goBack = useCallback((fallback = '/') => {
    const stack = stackRef.current;
    if (stack.length > 1) {
      const next = stack.slice(0, -1);
      stackRef.current = next;
      skipRef.current  = true;
      setDepth(next.length);
      navigate(next[next.length - 1]);
    } else {
      navigate(fallback);
    }
  }, [navigate]);

  const value = useMemo(() => ({ goBack, canGoBack: depth > 1 }), [goBack, depth]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

// ─── BackButton ───────────────────────────────────────────────────────────────

export function BackButton({ fallback = '/', label }: { fallback?: string; label?: string }) {
  const { goBack, canGoBack } = useNavBack();
  if (!canGoBack) return null;
  return (
    <button type="button" className="detail-back" onClick={() => goBack(fallback)} data-testid="btn-nav-back">
      <ArrowLeft /> {label ?? 'Back'}
    </button>
  );
}

// ─── DisplacedWidgetBand — forwarding component ───────────────────────────────
// The real implementation lives in App.tsx (it renders home widgets).
// Tool files import this thin wrapper; App.tsx provides the real component
// via DisplacedWidgetBandCtx.Provider.

// eslint-disable-next-line @typescript-eslint/no-empty-function
const Noop = () => null;

export const DisplacedWidgetBandCtx = createContext<ComponentType>(Noop);

export function DisplacedWidgetBand() {
  const Impl = useContext(DisplacedWidgetBandCtx);
  return <Impl />;
}
