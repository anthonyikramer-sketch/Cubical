import type { XlsxField } from './types';

/**
 * Analyze an XLSX workbook (as ArrayBuffer) and return:
 *   • An ordered list of detected fillable label-value pairs.
 *   • The raw workbook data (passed through to xlsxWrite).
 *
 * Detection strategy:
 *   For each non-empty text cell, look for the "value slot" — the nearest
 *   empty cell to its right on the same row.  This covers the most common
 *   Excel form pattern (label | value).
 *
 *   Cells that look like section headers (entire row is non-empty,
 *   or the cell is very wide/merged) without a right-side empty slot are
 *   skipped — they are structure, not input fields.
 */
export async function analyzeXlsx(arrayBuffer: ArrayBuffer): Promise<{
  fields: XlsxField[];
  workbookData: ArrayBuffer;
}> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellStyles: true });

  const fields: XlsxField[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const ref = ws['!ref'];
    if (!ref) continue;

    const range = XLSX.utils.decode_range(ref);

    // Build a set of cells that belong to a merge (non-top-left cells)
    const mergedNonOrigin = new Set<string>();
    for (const merge of (ws['!merges'] ?? [])) {
      for (let r = merge.s.r; r <= merge.e.r; r++) {
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          if (r !== merge.s.r || c !== merge.s.c) {
            mergedNonOrigin.add(XLSX.utils.encode_cell({ r, c }));
          }
        }
      }
    }

    // Find the end column of a cell's merge (or the cell's own column if not merged)
    function mergeEndCol(r: number, c: number): number {
      for (const merge of (ws['!merges'] ?? [])) {
        if (merge.s.r === r && merge.s.c === c) return merge.e.c;
      }
      return c;
    }

    // Get the string value of a cell, or empty string
    function cellStr(r: number, c: number): string {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) return '';
      if (cell.t === 's' || cell.t === 'str') return String(cell.v ?? '').trim();
      if (cell.t === 'n') return String(cell.v ?? '').trim();
      if (cell.t === 'b') return String(cell.v).trim();
      return '';
    }

    function isEmptyCell(r: number, c: number): boolean {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (!cell) return true;
      const v = cell.v;
      return v === undefined || v === null || String(v).trim() === '';
    }

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const labelAddr = XLSX.utils.encode_cell({ r: row, c: col });
        if (mergedNonOrigin.has(labelAddr)) continue;

        const labelCell = ws[labelAddr];
        if (!labelCell) continue;

        // Must be a reasonably short text string to be a label
        const labelText = cellStr(row, col);
        if (!labelText || labelText.length === 0) continue;
        if (labelText.length > 80) continue;
        // Skip pure numbers as labels
        if (!isNaN(Number(labelText.replace(/[$,]/g, '')))) continue;

        // Find value slot: first empty cell to the right after the merge ends
        const mergeEnd = mergeEndCol(row, col);
        let valueCol = mergeEnd + 1;
        // Allow skipping one more column (some forms have a narrow spacer column)
        if (valueCol <= range.e.c && !isEmptyCell(row, valueCol) && isEmptyCell(row, valueCol + 1)) {
          valueCol = valueCol + 1;
        }

        if (valueCol > range.e.c) continue;
        // The immediate right cell must be empty OR already contain a value (existing data)
        // — but NOT another label text that is itself followed by an empty cell
        const rightText = cellStr(row, valueCol);
        const rightIsLabel = rightText.length > 0 && rightText.length < 80 && isNaN(Number(rightText.replace(/[$,]/g, '')));
        if (rightIsLabel) continue;

        const valueAddr = XLSX.utils.encode_cell({ r: row, c: valueCol });
        if (mergedNonOrigin.has(valueAddr)) continue;

        const existingValue = isEmptyCell(row, valueCol) ? '' : cellStr(row, valueCol);

        // Avoid duplicate value cells
        const id = `${sheetName}!${valueAddr}`;
        if (fields.some((f) => f.id === id)) continue;

        fields.push({
          id,
          sheetName,
          label: labelText,
          labelAddr,
          valueAddr,
          existingValue,
        });
      }
    }
  }

  return { fields, workbookData: arrayBuffer };
}
