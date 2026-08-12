import type { MatchResult } from './types';

/**
 * Apply approved fills to the original workbook and return it as a Blob.
 *
 * Strategy: read the original buffer with SheetJS (preserves all raw XML),
 * mutate only the approved value cells, then write back.  Because we don't
 * rebuild worksheets, all formatting (styles, borders, fonts, merges, etc.)
 * is preserved.
 */
export async function applyAndExport(
  originalBuffer: ArrayBuffer,
  approved: MatchResult[],
): Promise<Blob> {
  const XLSX = await import('xlsx');

  // Read preserving styles (raw XML kept intact)
  const wb = XLSX.read(originalBuffer, { type: 'array', cellStyles: true });

  for (const match of approved) {
    const { sheetName, valueAddr } = match.field;
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const value = match.isConflict && match.keepExisting
      ? match.field.existingValue
      : match.extractedValue;

    if (!value) continue; // safety: never write empty strings over existing content

    if (!ws[valueAddr]) {
      // Cell didn't exist — create a new string cell
      ws[valueAddr] = { t: 's', v: value };
    } else {
      // Update value; keep existing style index (.s) intact
      ws[valueAddr].v = value;
      ws[valueAddr].t = 's';
      delete ws[valueAddr].f; // remove formula if present — we're filling with a literal
      delete ws[valueAddr].w; // force re-format
    }
  }

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
