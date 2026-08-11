import { useState, useMemo, type ChangeEvent } from 'react';
import { Check, Download, FilePlus2, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

type SpreadsheetRow = string[];
type CleanedSpreadsheet = { rows: SpreadsheetRow[]; emptyRowsRemoved: number; duplicateRowsRemoved: number; textCellsCleaned: number; };

function parseCsv(csv: string): SpreadsheetRow[] {
  const rows: SpreadsheetRow[] = []; let row: string[] = []; let cell = ''; let insideQuotes = false;
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i]; const nx = csv[i + 1];
    if (ch === '"') { if (insideQuotes && nx === '"') { cell += '"'; i += 1; } else { insideQuotes = !insideQuotes; } }
    else if (ch === ',' && !insideQuotes) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !insideQuotes) { if (ch === '\r' && nx === '\n') i += 1; row.push(cell); rows.push(row); row = []; cell = ''; }
    else { cell += ch; }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  while (rows.length > 0 && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  return rows;
}

function csvEscape(value: string) { return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }
function toCsv(headers: string[], rows: SpreadsheetRow[]) { return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n'); }
function titleCase(value: string) { return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

export function SpreadsheetCleaner() {
  const [fileName, setFileName]       = useState<string | null>(null);
  const [headers, setHeaders]         = useState<string[]>([]);
  const [sourceRows, setSourceRows]   = useState<SpreadsheetRow[]>([]);
  const [parseError, setParseError]   = useState<string | null>(null);
  const [removeEmptyRows, setRemoveEmptyRows]         = useState(true);
  const [removeDuplicateRows, setRemoveDuplicateRows] = useState(true);
  const [trimText, setTrimText]                       = useState(true);
  const [collapseSpaces, setCollapseSpaces]           = useState(true);
  const [capitalization, setCapitalization] = useState<'unchanged' | 'uppercase' | 'lowercase' | 'title'>('unchanged');
  const [sortColumn, setSortColumn]   = useState('');
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const cleaned = useMemo<CleanedSpreadsheet>(() => {
    let rows = sourceRows.map((row) => [...row]);
    let emptyRowsRemoved = 0; let duplicateRowsRemoved = 0; let textCellsCleaned = 0;
    if (removeEmptyRows) { const before = rows.length; rows = rows.filter((row) => !row.every((cell) => cell.trim() === '')); emptyRowsRemoved = before - rows.length; }
    rows = rows.map((row) => row.map((cell) => {
      let next = cell;
      if (trimText) next = next.trim();
      if (collapseSpaces) next = next.replace(/\s+/g, ' ');
      if (capitalization === 'uppercase') next = next.toUpperCase();
      if (capitalization === 'lowercase') next = next.toLowerCase();
      if (capitalization === 'title') next = titleCase(next);
      if (next !== cell) textCellsCleaned += 1;
      return next;
    }));
    if (removeDuplicateRows) {
      const seen = new Set<string>();
      rows = rows.filter((row) => { const id = JSON.stringify(row); if (seen.has(id)) { duplicateRowsRemoved += 1; return false; } seen.add(id); return true; });
    }
    if (sortColumn) { const si = headers.indexOf(sortColumn); if (si >= 0) rows.sort((a, b) => (a[si] ?? '').localeCompare(b[si] ?? '', undefined, { numeric: true, sensitivity: 'base' })); }
    return { rows, emptyRowsRemoved, duplicateRowsRemoved, textCellsCleaned };
  }, [capitalization, collapseSpaces, headers, removeDuplicateRows, removeEmptyRows, sortColumn, sourceRows, trimText]);

  const selectSpreadsheet = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    setExportStatus(null); setParseError(null);
    try {
      const parsedRows = parseCsv(await file.text());
      if (parsedRows.length === 0 || parsedRows[0].length === 0) { setFileName(null); setHeaders([]); setSourceRows([]); setParseError('This CSV does not contain any data to preview.'); return; }
      const nextHeaders = parsedRows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
      setFileName(file.name); setHeaders(nextHeaders);
      setSourceRows(parsedRows.slice(1).map((row) => nextHeaders.map((_, i) => row[i] ?? '')));
    } catch { setFileName(null); setHeaders([]); setSourceRows([]); setParseError('This file could not be read as a CSV.'); }
  };

  const exportCleanedFile = () => {
    if (!fileName || headers.length === 0) return;
    const url = URL.createObjectURL(new Blob([toCsv(headers, cleaned.rows)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    const baseName = fileName.replace(/\.csv$/i, '');
    link.href = url; link.download = `${baseName}-cleaned.csv`; link.click(); URL.revokeObjectURL(url);
    setExportStatus(`Downloaded ${baseName}-cleaned.csv. Your original file remains unchanged.`);
  };

  return (
    <section className="renamer-page spreadsheet-page" data-testid="spreadsheet-cleaner">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon"><span className="renamer-tool-icon spreadsheet-tool-icon"><FileSpreadsheet /></span><div><h1>Spreadsheet Cleaner.</h1><p>Make messy tables easier to trust, one clean copy at a time.</p></div></div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Original stays safe</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice"><FilePlus2 /><div><strong>Safe copy mode</strong><span>Spreadsheet Cleaner reads your CSV and creates a new cleaned download. The original uploaded file is never modified.</span></div></div>
      <div className="spreadsheet-workspace">
        <div className="spreadsheet-controls">
          <div className="renamer-section-heading"><span className="eyebrow">01 · Choose a CSV</span>{fileName && <span className="library-count">{fileName}</span>}</div>
          <label className="file-picker"><FilePlus2 /><span>{fileName ? 'Choose another CSV' : 'Select CSV file'}</span><input type="file" accept=".csv,text/csv" onChange={selectSpreadsheet} data-testid="input-spreadsheet-picker" /></label>
          <p className="renamer-help">CSV files are supported in this browser prototype. The first row is treated as column names.</p>
          {parseError && <div className="renamer-error" role="alert" data-testid="spreadsheet-error"><span>!</span>{parseError}</div>}
          <div className="renamer-section-heading method-heading"><span className="eyebrow">02 · Clean up</span></div>
          <div className="spreadsheet-checkboxes">
            <label><input type="checkbox" checked={removeEmptyRows} onChange={(e) => setRemoveEmptyRows(e.target.checked)} /><span><strong>Remove empty rows</strong><small>Drop rows with no values</small></span></label>
            <label><input type="checkbox" checked={removeDuplicateRows} onChange={(e) => setRemoveDuplicateRows(e.target.checked)} /><span><strong>Remove duplicate rows</strong><small>Keep the first copy</small></span></label>
            <label><input type="checkbox" checked={trimText} onChange={(e) => setTrimText(e.target.checked)} /><span><strong>Trim text cells</strong><small>Remove leading and trailing spaces</small></span></label>
            <label><input type="checkbox" checked={collapseSpaces} onChange={(e) => setCollapseSpaces(e.target.checked)} /><span><strong>Collapse repeated spaces</strong><small>Make internal spacing consistent</small></span></label>
          </div>
          <label className="rename-field spreadsheet-select-field"><span>Standardize capitalization</span><select value={capitalization} onChange={(e) => setCapitalization(e.target.value as typeof capitalization)} data-testid="select-capitalization"><option value="unchanged">Unchanged</option><option value="uppercase">UPPERCASE</option><option value="lowercase">lowercase</option><option value="title">Title Case</option></select></label>
          <label className="rename-field spreadsheet-select-field"><span>Sort by column</span><select value={sortColumn} onChange={(e) => setSortColumn(e.target.value)} disabled={headers.length === 0} data-testid="select-sort-column"><option value="">Original order</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
        </div>
        <div className="spreadsheet-preview-panel">
          <div className="renamer-section-heading"><span className="eyebrow">03 · Preview cleaned result</span><span className="library-count">{headers.length} columns · {sourceRows.length} rows</span></div>
          {headers.length === 0 ? (
            <div className="renamer-empty" data-testid="spreadsheet-empty"><div className="empty-cube"><FileSpreadsheet /></div><h2>Your table starts here.</h2><p>Select a CSV to inspect its columns, clean up its values, and preview a fresh copy.</p></div>
          ) : (
            <>
              <div className="spreadsheet-summary" data-testid="spreadsheet-summary">
                <span><strong>{cleaned.emptyRowsRemoved}</strong> empty rows removed</span>
                <span><strong>{cleaned.duplicateRowsRemoved}</strong> duplicates removed</span>
                <span><strong>{cleaned.textCellsCleaned}</strong> text cells cleaned</span>
              </div>
              <div className="spreadsheet-table-wrap" data-testid="spreadsheet-preview-table">
                <table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{cleaned.rows.slice(0, 20).map((row, ri) => <tr key={`${ri}-${row.join('|')}`}>{headers.map((h, ci) => <td key={`${h}-${ci}`}>{row[ci] || <span className="table-empty">empty</span>}</td>)}</tr>)}</tbody></table>
              </div>
              {cleaned.rows.length > 20 && <p className="table-more">Showing the first 20 of {cleaned.rows.length} cleaned rows.</p>}
              {cleaned.rows.length === 0 && <p className="table-more">No data rows remain after cleanup.</p>}
            </>
          )}
          {exportStatus && <div className="renamer-completion" role="status" data-testid="spreadsheet-export-status"><Check /><div><strong>Cleaned copy exported</strong><span>{exportStatus}</span></div></div>}
          <div className="renamer-actions">
            <div><strong>Original file stays unchanged.</strong><span>Export creates a separate CSV copy.</span></div>
            <button type="button" className="button-primary" onClick={exportCleanedFile} disabled={!fileName || headers.length === 0} data-testid="button-export-cleaned-file">Export Cleaned File <Download /></button>
          </div>
        </div>
      </div>
    </section>
  );
}
