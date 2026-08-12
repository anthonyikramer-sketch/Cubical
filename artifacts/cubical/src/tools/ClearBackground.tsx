/**
 * Clear Background — remove white (or any solid-color) backgrounds from images
 * by converting matching pixels to transparency.
 *
 * Processing is 100% local: canvas 2-D API only, no external requests.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Pipette, RefreshCw, RotateCcw, UploadCloud } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface RgbColor { r: number; g: number; b: number }

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };

function colorDistance(a: RgbColor, b: RgbColor): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Maximum possible distance in RGB space (black → white) */
const MAX_DIST = Math.sqrt(3 * 255 ** 2);

/**
 * Remove background from imageData in-place.
 * Uses soft alpha blending so anti-aliased edges don't leave a hard ring.
 */
function removeBackground(
  data: Uint8ClampedArray,
  target: RgbColor,
  tolerance: number, // 0-100 user-facing → mapped to 0-MAX_DIST internally
): void {
  const threshold = (tolerance / 100) * MAX_DIST;
  const feather   = threshold * 0.25; // blend zone width

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a === 0) continue; // already transparent — skip
    const pixel: RgbColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
    const dist = colorDistance(pixel, target);
    if (dist <= threshold) {
      // Inside threshold → calculate soft alpha
      const alpha = dist <= threshold - feather
        ? 0
        : Math.round(((dist - (threshold - feather)) / feather) * a);
      data[i + 3] = Math.min(a, alpha);
    }
  }
}

function rgbToHex({ r, g, b }: RgbColor): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): RgbColor {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── Component ─────────────────────────────────────────────────────────────────

const DEFAULT_TOLERANCE = 30;

export function ClearBackground() {
  const [sourceImg,    setSourceImg]    = useState<HTMLImageElement | null>(null);
  const [sourceFile,   setSourceFile]   = useState<string | null>(null); // object URL
  const [targetColor,  setTargetColor]  = useState<RgbColor>(WHITE);
  const [tolerance,    setTolerance]    = useState(DEFAULT_TOLERANCE);
  const [resultUrl,    setResultUrl]    = useState<string | null>(null);
  const [isDragging,   setIsDragging]   = useState(false);
  const [isPicking,    setIsPicking]    = useState(false);
  const [processing,   setProcessing]   = useState(false);

  const dropRef      = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const origCanvasRef   = useRef<HTMLCanvasElement>(null);
  const resultCanvasRef = useRef<HTMLCanvasElement>(null);
  const prevResultUrl   = useRef<string | null>(null);

  // ── Process image whenever source, color, or tolerance changes ───────────
  const process = useCallback((img: HTMLImageElement, color: RgbColor, tol: number) => {
    const canvas  = document.createElement('canvas');
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    removeBackground(imageData.data, color, tol);
    ctx.putImageData(imageData, 0, 0);

    // Revoke previous object URL to avoid leaks
    if (prevResultUrl.current) URL.revokeObjectURL(prevResultUrl.current);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      prevResultUrl.current = url;
      setResultUrl(url);
      setProcessing(false);
    }, 'image/png');
  }, []);

  useEffect(() => {
    if (!sourceImg) return;
    setProcessing(true);
    // Defer to next tick so the spinner shows immediately
    const id = setTimeout(() => process(sourceImg, targetColor, tolerance), 16);
    return () => clearTimeout(id);
  }, [sourceImg, targetColor, tolerance, process]);

  // Draw orignal on canvas for pick-color cursor
  useEffect(() => {
    if (!sourceImg || !origCanvasRef.current) return;
    const cvs = origCanvasRef.current;
    cvs.width  = sourceImg.naturalWidth;
    cvs.height = sourceImg.naturalHeight;
    const ctx = cvs.getContext('2d')!;
    ctx.drawImage(sourceImg, 0, 0);
  }, [sourceImg]);

  // ── File loading ─────────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (sourceFile) URL.revokeObjectURL(sourceFile);
    const url = URL.createObjectURL(file);
    setSourceFile(url);
    const img = new Image();
    img.onload = () => {
      setSourceImg(img);
      setTargetColor(WHITE);
      setTolerance(DEFAULT_TOLERANCE);
      setResultUrl(null);
    };
    img.src = url;
  }, [sourceFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  // ── Drag & drop ──────────────────────────────────────────────────────────
  const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  // ── Pick color from original image ───────────────────────────────────────
  const handleOrigCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPicking || !origCanvasRef.current) return;
    const cvs  = origCanvasRef.current;
    const rect  = cvs.getBoundingClientRect();
    const scaleX = cvs.width  / rect.width;
    const scaleY = cvs.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top)  * scaleY);
    const ctx = cvs.getContext('2d', { willReadFrequently: true })!;
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    setTargetColor({ r, g, b });
    setIsPicking(false);
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href     = resultUrl;
    a.download = 'cleared.png';
    a.click();
  };

  // ── Reset adjustments ────────────────────────────────────────────────────
  const handleReset = () => {
    setTargetColor(WHITE);
    setTolerance(DEFAULT_TOLERANCE);
  };

  // ── New image ────────────────────────────────────────────────────────────
  const handleNewImage = () => {
    if (sourceFile) URL.revokeObjectURL(sourceFile);
    if (prevResultUrl.current) URL.revokeObjectURL(prevResultUrl.current);
    setSourceImg(null);
    setSourceFile(null);
    setResultUrl(null);
    setTargetColor(WHITE);
    setTolerance(DEFAULT_TOLERANCE);
    setIsPicking(false);
  };

  const swatchHex = rgbToHex(targetColor);
  const isWhite   = targetColor.r === 255 && targetColor.g === 255 && targetColor.b === 255;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <section className="cb-page">
      <BackButton fallback="/library" label="Back to library" />

      <div className="page-intro">
        <div className="eyebrow">A focused little utility</div>
        <h1 className="display-title mt-2">Clear Background.</h1>
        <p className="cb-subtitle">Turn solid-color image backgrounds into transparency.</p>
      </div>

      <DisplacedWidgetBand />

      {/* ── Drop zone / no image ── */}
      {!sourceImg && (
        <div
          ref={dropRef}
          className={`cb-dropzone${isDragging ? ' dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="cb-drop-icon" />
          <p className="cb-drop-title">Drop an image here</p>
          <p className="cb-drop-sub">or click to browse &nbsp;·&nbsp; PNG, JPG, WebP</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="cb-file-input"
            onChange={handleFileInput}
          />
        </div>
      )}

      {/* ── Editor ── */}
      {sourceImg && (
        <>
          {/* Previews */}
          <div className="cb-previews">
            {/* Original */}
            <div className="cb-preview-panel">
              <div className="cb-preview-label">Original</div>
              <div
                className={`cb-preview-frame cb-plain${isPicking ? ' cb-picking' : ''}`}
                title={isPicking ? 'Click a color to sample it' : undefined}
              >
                <canvas
                  ref={origCanvasRef}
                  className="cb-canvas"
                  onClick={handleOrigCanvasClick}
                  style={{ cursor: isPicking ? 'crosshair' : 'default' }}
                />
              </div>
            </div>

            {/* Result */}
            <div className="cb-preview-panel">
              <div className="cb-preview-label">Result</div>
              <div className="cb-preview-frame cb-checker">
                {processing ? (
                  <div className="cb-processing">
                    <span className="ff-spinner" />
                    <span>Processing…</span>
                  </div>
                ) : resultUrl ? (
                  <img src={resultUrl} className="cb-canvas" alt="Result" />
                ) : null}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="cb-controls">
            {/* Target color */}
            <div className="cb-control-row">
              <span className="cb-control-label">Target color</span>
              <div className="cb-color-group">
                <span
                  className="cb-swatch"
                  style={{ background: swatchHex, border: isWhite ? '1px solid hsl(var(--border))' : 'none' }}
                  title={swatchHex}
                />
                <button
                  className={`button-quiet cb-pick-btn${isPicking ? ' active' : ''}`}
                  onClick={() => setIsPicking((p) => !p)}
                  title="Click a pixel on the original image to use its color as the target"
                >
                  <Pipette className="w-3.5 h-3.5" />
                  {isPicking ? 'Click original…' : 'Pick Color'}
                </button>
                {!isWhite && (
                  <button
                    className="button-quiet cb-pick-btn"
                    onClick={() => { setTargetColor(WHITE); setIsPicking(false); }}
                    title="Reset target to white"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reset to White
                  </button>
                )}
                {/* Hidden color input as fallback color picker */}
                <label className="cb-pick-btn button-quiet cb-color-label" title="Enter a hex color">
                  <input
                    type="color"
                    className="cb-color-input"
                    value={swatchHex}
                    onChange={(e) => { setTargetColor(hexToRgb(e.target.value)); setIsPicking(false); }}
                  />
                  Hex
                </label>
              </div>
            </div>

            {/* Tolerance */}
            <div className="cb-control-row cb-tolerance-row">
              <span className="cb-control-label">Tolerance</span>
              <input
                type="range"
                min={0}
                max={100}
                value={tolerance}
                className="cb-slider"
                onChange={(e) => setTolerance(Number(e.target.value))}
              />
              <span className="cb-tol-value">{tolerance}</span>
            </div>

            {/* Hint when picking */}
            {isPicking && (
              <p className="cb-pick-hint">
                Click anywhere on the <strong>Original</strong> preview to sample a color.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="cb-actions">
            <div className="cb-actions-left">
              <button className="button-quiet" onClick={handleReset}>
                <RefreshCw className="w-3.5 h-3.5" /> Reset
              </button>
              <button className="button-quiet" onClick={handleNewImage}>
                <UploadCloud className="w-3.5 h-3.5" /> New Image
              </button>
            </div>
            <button
              className="button-primary cb-export-btn"
              onClick={handleExport}
              disabled={!resultUrl || processing}
            >
              <Download className="w-4 h-4" /> Export PNG
            </button>
          </div>
        </>
      )}
    </section>
  );
}
