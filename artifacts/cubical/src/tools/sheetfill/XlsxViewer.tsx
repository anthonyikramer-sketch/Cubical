/**
 * XlsxViewer — renders an XLSX workbook (ArrayBuffer) as a scrollable
 * spreadsheet grid.  Supports:
 *   • Virtual cell overrides (live Filled Preview)
 *   • Highlighted changed cells with click-to-inspect
 *   • Sheet tab switching
 *   • Merged cells, basic formatting (bg color, bold, alignment)
 */

import { useEffect, useMemo, useRef, useState } from 'react';

// ── Public types ──────────────────────────────────────────────────────────────

export type HighlightType = 'added' | 'user-approved' | 'conflict';

export interface HighlightMeta {
  type: HighlightType;
  originalValue: string;
  newValue: string;
  sourceText: string;
  confidence: string;
  fieldLabel: string;
}

interface Props {
  data: ArrayBuffer;
  /** "SheetName!A1" → new value to show instead of the stored value. */
  virtualCells?: Record<string, string>;
  /** "SheetName!A1" → metadata shown when the cell is clicked. */
  highlightMeta?: Record<string, HighlightMeta>;
  onCellClick?: (id: string, meta: HighlightMeta, rect: DOMRect) => void;
}

// ── Parsed workbook data (computed once, never changes) ───────────────────────

interface ParsedCell {
  addr: string;          // "A1"
  value: string;         // display value
  bgColor: string | null;
  textColor: string | null;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right' | 'general';
  wrapText: boolean;
}

interface MergeRange {
  r1: number; c1: number;
  r2: number; c2: number;
  originAddr: string;
}

interface ParsedSheet {
  cells: Map<string, ParsedCell>; // addr → cell
  minR: number; maxR: number;
  minC: number; maxC: number;
  merges: MergeRange[];
  colLetters: string[];           // column header labels
  colWidths: number[];            // px
}

interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, ParsedSheet>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRgb(rgb: string | undefined): string | null {
  if (!rgb || !/^[0-9A-Fa-f]{6,8}$/.test(rgb)) return null;
  const hex = rgb.length === 8 ? rgb.slice(2) : rgb;
  // Ignore white / very near-white fills (they're just "no fill" in Excel)
  if (/^F{5,}/i.test(hex)) return null;
  return `#${hex}`;
}

function encodeCol(c: number): string {
  let s = '';
  let n = c;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function encodeCell(r: number, c: number): string {
  return `${encodeCol(c)}${r + 1}`;
}

async function parseWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(data, { type: 'array', cellStyles: true });

  const result: ParsedWorkbook = { sheetNames: wb.SheetNames, sheets: {} };

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const refStr = ws['!ref'];
    if (!refStr) {
      result.sheets[name] = { cells: new Map(), minR: 0, maxR: 0, minC: 0, maxC: 0, merges: [], colLetters: [], colWidths: [] };
      continue;
    }

    const range = XLSX.utils.decode_range(refStr);
    const { r: minR, c: minC } = range.s;
    const { r: maxR, c: maxC } = range.e;

    const cells = new Map<string, ParsedCell>();
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const addr = encodeCell(r, c);
        const cell = ws[addr];
        if (!cell) continue;

        const s = cell.s ?? {};
        let bgColor: string | null = null;
        let textColor: string | null = null;
        let bold = false;
        let italic = false;
        let align: ParsedCell['align'] = 'general';
        let wrapText = false;

        try {
          bgColor   = parseRgb(s.fill?.fgColor?.rgb ?? s.fill?.bgColor?.rgb);
          textColor = parseRgb(s.font?.color?.rgb);
          bold      = s.font?.bold === true;
          italic    = s.font?.italic === true;
          wrapText  = s.alignment?.wrapText === true;
          const h = s.alignment?.horizontal;
          if (h === 'center') align = 'center';
          else if (h === 'right') align = 'right';
          else if (h === 'left') align = 'left';
        } catch { /* style parse failed, use defaults */ }

        // Format cell value for display
        let value = '';
        if (cell.w !== undefined) {
          value = cell.w; // formatted value (SheetJS caches this)
        } else if (cell.v !== undefined) {
          value = String(cell.v);
        }

        cells.set(addr, { addr, value, bgColor, textColor, bold, italic, align, wrapText });
      }
    }

    // Merges
    const rawMerges: MergeRange[] = (ws['!merges'] ?? []).map((m: any) => ({
      r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c,
      originAddr: encodeCell(m.s.r, m.s.c),
    }));

    // Column widths
    const rawCols = ws['!cols'] ?? [];
    const colWidths = Array.from({ length: maxC - minC + 1 }, (_, i) => {
      const col = rawCols[minC + i];
      if (col?.wpx) return Math.max(60, col.wpx);
      if (col?.wch) return Math.max(60, Math.round(col.wch * 7));
      return 80;
    });

    const colLetters = Array.from({ length: maxC - minC + 1 }, (_, i) => encodeCol(minC + i));

    result.sheets[name] = { cells, minR, maxR, minC, maxC, merges: rawMerges, colLetters, colWidths };
  }

  return result;
}

// ── Highlight colors ──────────────────────────────────────────────────────────

const HL_BG: Record<HighlightType, string> = {
  added:          'hsl(142 52% 35% / .18)',
  'user-approved':'hsl(38 80% 40% / .18)',
  conflict:       'hsl(0 70% 48% / .14)',
};
const HL_BORDER: Record<HighlightType, string> = {
  added:          'hsl(142 52% 35% / .5)',
  'user-approved':'hsl(38 80% 40% / .5)',
  conflict:       'hsl(0 70% 48% / .4)',
};

// ── Grid renderer (pure rendering, no async) ──────────────────────────────────

function SheetGrid({
  sheet, sheetName, virtualCells, highlightMeta, onCellClick,
}: {
  sheet: ParsedSheet;
  sheetName: string;
  virtualCells: Record<string, string>;
  highlightMeta: Record<string, HighlightMeta>;
  onCellClick?: Props['onCellClick'];
}) {
  const { cells, minR, maxR, minC, maxC, merges, colLetters, colWidths } = sheet;

  // Precompute covered cells + merge spans
  const covered = useMemo(() => new Set<string>(), [merges]); // reset when merges change
  const spans = useMemo(() => {
    const s = new Map<string, { rowspan: number; colspan: number }>();
    covered.clear();
    for (const m of merges) {
      s.set(m.originAddr, {
        rowspan: m.r2 - m.r1 + 1,
        colspan: m.c2 - m.c1 + 1,
      });
      for (let r = m.r1; r <= m.r2; r++) {
        for (let c = m.c1; c <= m.c2; c++) {
          if (r !== m.r1 || c !== m.c1) covered.add(encodeCell(r, c));
        }
      }
    }
    return s;
  }, [merges, covered]);

  const numRows = maxR - minR + 1;
  const numCols = maxC - minC + 1;

  return (
    <table className="sf-xlsx-table" cellSpacing={0} cellPadding={0}>
      <colgroup>
        <col style={{ width: 40, minWidth: 40 }} />
        {colWidths.map((w, i) => <col key={i} style={{ width: w, minWidth: w }} />)}
      </colgroup>
      <thead>
        <tr>
          <th className="sf-cell-header sf-corner" />
          {colLetters.map((letter) => (
            <th key={letter} className="sf-cell-header sf-col-header">{letter}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: numRows }, (_, ri) => {
          const rowIdx = minR + ri;
          return (
            <tr key={rowIdx}>
              <td className="sf-cell-header sf-row-header">{rowIdx + 1}</td>
              {Array.from({ length: numCols }, (_, ci) => {
                const colIdx = minC + ci;
                const addr = encodeCell(rowIdx, colIdx);
                if (covered.has(addr)) return null;

                const id       = `${sheetName}!${addr}`;
                const cell     = cells.get(addr);
                const span     = spans.get(addr);
                const virtVal  = virtualCells[id];
                const hl       = highlightMeta[id];
                const value    = virtVal !== undefined ? virtVal : (cell?.value ?? '');

                const inlineStyle: React.CSSProperties = {};
                if (hl) {
                  inlineStyle.background = HL_BG[hl.type];
                  inlineStyle.outline    = `1px solid ${HL_BORDER[hl.type]}`;
                  inlineStyle.outlineOffset = '-1px';
                } else if (cell?.bgColor) {
                  inlineStyle.background = cell.bgColor;
                }
                if (cell?.textColor && !hl) inlineStyle.color = cell.textColor;
                if (cell?.bold)   inlineStyle.fontWeight = 'bold';
                if (cell?.italic) inlineStyle.fontStyle  = 'italic';
                if (cell?.align && cell.align !== 'general') inlineStyle.textAlign = cell.align;
                if (cell?.wrapText) inlineStyle.whiteSpace = 'normal';

                return (
                  <td
                    key={colIdx}
                    rowSpan={span?.rowspan}
                    colSpan={span?.colspan}
                    className={`sf-xlsx-cell${hl ? ` sf-hl-${hl.type}` : ''}`}
                    style={inlineStyle}
                    title={hl ? `${hl.fieldLabel}: ${value}` : undefined}
                    onClick={hl ? (e) => onCellClick?.(id, hl, (e.currentTarget as HTMLElement).getBoundingClientRect()) : undefined}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function XlsxViewer({ data, virtualCells = {}, highlightMeta = {}, onCellClick }: Props) {
  const [loading, setLoading]       = useState(true);
  const [parsed,  setParsed]        = useState<ParsedWorkbook | null>(null);
  const [activeSheet, setActiveSheet] = useState('');
  const lastDataRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (lastDataRef.current === data) return;
    lastDataRef.current = data;
    setLoading(true);
    parseWorkbook(data)
      .then((wb) => { setParsed(wb); setActiveSheet(wb.sheetNames[0] ?? ''); })
      .catch(() => { /* show nothing on error */ })
      .finally(() => setLoading(false));
  }, [data]);

  if (loading) {
    return <div className="sf-viewer-loading"><span className="ff-spinner" /> Loading spreadsheet…</div>;
  }
  if (!parsed || parsed.sheetNames.length === 0) {
    return <div className="sf-viewer-loading">No data found in workbook.</div>;
  }

  const sheet = parsed.sheets[activeSheet];

  return (
    <div className="sf-xlsx-root">
      {/* Sheet tabs */}
      {parsed.sheetNames.length > 1 && (
        <div className="sf-xlsx-tabs">
          {parsed.sheetNames.map((name) => (
            <button
              key={name}
              className={`sf-xlsx-tab${activeSheet === name ? ' active' : ''}`}
              onClick={() => setActiveSheet(name)}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* Scrollable grid */}
      <div className="sf-xlsx-scroll">
        {sheet && (
          <SheetGrid
            sheet={sheet}
            sheetName={activeSheet}
            virtualCells={virtualCells}
            highlightMeta={highlightMeta}
            onCellClick={onCellClick}
          />
        )}
      </div>
    </div>
  );
}
