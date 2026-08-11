---
name: PDF Form Filler architecture
description: Key decisions for the PdfFormFiller tool — rendering, coordinate system, detection, export, templates.
---

## Libraries
- `pdfjs-dist` — loaded via **dynamic import** inside a `useEffect` (not static) to keep initial bundle lean. Worker URL set with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href`.
- `pdf-lib` — loaded via **dynamic import** only at export time (`await import('pdf-lib')`).

**Why:** Both libraries are large. Dynamic import means users only pay the cost when they open the tool.

**How to apply:** Do not convert these to static top-level imports — it would add ~3 MB to the initial parse.

## Coordinate system
Fields are stored as **percentage of page dimensions** (0–1) from the **top-left corner** of the page.

- Display: `left: xPct*100%; top: yPct*100%; width: wPct*100%; height: hPct*100%` (on a position:relative container sized to match the canvas).
- Export: `pdfX = xPct * pdfWidth`, `pdfY = pdfHeight - (yPct + hPct) * pdfHeight` (flip because pdf-lib uses bottom-left origin).

**Why:** Avoids the pdf.js bottom-left vs screen top-left conversion problem during editing. Export conversion happens only once.

## Smart detection
`detectFields()` — iterates all pages via `page.getTextContent()`. Two triggers:
1. `/^[_\-─═]{3,}$/` — blank fill lines → field placed at that position.
2. `PFF_LABEL_KEYWORDS` match → field placed to the right of the label text.

Coordinates extracted from `item.transform[4]` (x) and `pageHeight - item.transform[5] - item.height` (y, flipped).

Detected fields get `isDetected: true` → amber border in the UI. User can "Accept All" or "Clear Detected".

## Template storage
Key: `cubical-pff-templates-v1` in localStorage.
Matching: `${fileName}::${fileSize}` — a template is offered automatically when the same PDF is reopened.
Templates store all field properties except `value` (which is always cleared on load).

## Route & catalog IDs
- Route: `/tool/pdf-form-filler`
- Catalog ID: `tool.pdf-form-filler`
- Legacy ID (LEGACY_ID_MAP): `pdf-form-filler` → `tool.pdf-form-filler`
- Icon: `FormInput` (from lucide-react — must be in ICON_REGISTRY)
