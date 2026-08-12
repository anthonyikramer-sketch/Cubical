import type { PdfLine } from './types';

/**
 * Extract all text lines from a PDF ArrayBuffer using pdfjs-dist.
 * Lines are trimmed and blank lines are removed.
 */
export async function extractPdfLines(arrayBuffer: ArrayBuffer): Promise<PdfLine[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;

  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const lines: PdfLine[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by their approximate Y position to reconstruct lines
    type Item = { x: number; y: number; text: string };
    const items: Item[] = content.items
      .filter((item): item is typeof item & { str: string } => 'str' in item)
      .map((item) => ({
        x: (item as any).transform[4] as number,
        y: Math.round((item as any).transform[5] as number),
        text: item.str as string,
      }))
      .filter((i) => i.text.trim().length > 0);

    // Group by Y (same logical line)
    const byY = new Map<number, Item[]>();
    for (const item of items) {
      const key = item.y;
      if (!byY.has(key)) byY.set(key, []);
      byY.get(key)!.push(item);
    }

    // Sort Y descending (PDF coords: top = high Y)
    const ys = [...byY.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const row = byY.get(y)!.sort((a, b) => a.x - b.x);
      const text = row.map((i) => i.text).join(' ').trim();
      if (text) lines.push({ text, page: p });
    }
  }

  return lines;
}
