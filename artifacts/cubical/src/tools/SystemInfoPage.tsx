import { Globe, HardDrive, Hash, Monitor, Sparkles, Zap } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

export function SystemInfoPage() {
  const isDesktop = !!(window.cubicalDesktop);

  const cores    = navigator.hardwareConcurrency ?? null;
  const memGb    = (navigator as any).deviceMemory as number | undefined;
  const ua       = navigator.userAgent;
  const uaData   = (navigator as any).userAgentData as { platform?: string; architecture?: string } | undefined;
  const osPlatform = uaData?.platform ?? navigator.platform ?? '';
  const osName   = osPlatform || (ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Linux') ? 'Linux' : 'Unknown');
  const screenW  = screen.width;
  const screenH  = screen.height;
  const dpr      = window.devicePixelRatio ?? 1;
  const physW    = Math.round(screenW * dpr);
  const physH    = Math.round(screenH * dpr);
  const elMatch  = ua.match(/Electron\/([\d.]+)/);
  const crMatch  = ua.match(/Chrome\/([\d.]+)/);
  const shellVal = elMatch ? `Electron ${elMatch[1]}` : crMatch ? `Chromium ${crMatch[1]}` : 'Browser';
  const archVal  = uaData?.architecture ?? (ua.includes('x86_64') || ua.includes('Win64') || ua.includes('x64') ? 'x64 (64-bit)' : '—');

  const liveCards: { label: string; value: string; detail: string; Icon: typeof Monitor }[] = [
    { label: 'Platform',          value: osName || '—',                    detail: elMatch ? 'Running in Electron (desktop shell)' : 'Running in web browser',        Icon: Monitor   },
    { label: 'Logical CPU cores', value: cores !== null ? `${cores}` : '—', detail: cores !== null ? 'navigator.hardwareConcurrency' : 'Not reported by this environment', Icon: Zap   },
    { label: 'Device memory',     value: memGb !== undefined ? `≥ ${memGb} GB` : '—', detail: memGb !== undefined ? 'Rounded by browser privacy spec' : 'Not exposed in this browser', Icon: Hash },
    { label: 'Display (logical)', value: `${screenW} × ${screenH}`,       detail: `Physical: ${physW} × ${physH} · ${dpr}× pixel ratio`,                            Icon: Monitor   },
    { label: 'Architecture',      value: archVal,                           detail: uaData ? 'From UA-CH client hints' : 'Inferred from user-agent string',           Icon: Globe     },
    { label: 'Shell / Runtime',   value: shellVal,                          detail: (crMatch ? `Chrome ${crMatch[1]}` : ua).slice(0, 70),                             Icon: Globe     },
  ];

  const desktopCards: { label: string; value: string; detail: string; Icon: typeof Monitor }[] = [
    { label: 'Operating System', value: 'Windows 11 Pro',       detail: 'Version 23H2 · Build 22631',            Icon: Monitor   },
    { label: 'Processor',        value: 'Intel Core i7-13700K', detail: '16 cores / 24 threads · 3.40 GHz base', Icon: Zap       },
    { label: 'Memory',           value: '32 GB DDR5',           detail: '4800 MHz · 2 slots used of 4',          Icon: Hash      },
    { label: 'Storage',          value: '1 TB NVMe SSD',        detail: 'Samsung 980 Pro · C:\\ primary drive',  Icon: HardDrive },
    { label: 'Display',          value: '2560 × 1440',          detail: '27 in · 144 Hz · HDR400',               Icon: Monitor   },
    { label: 'Architecture',     value: 'x64 (64-bit)',         detail: 'AMD64 compatible',                      Icon: Globe     },
  ];

  const cards = isDesktop ? desktopCards : liveCards;

  return (
    <section className="renamer-page" data-testid="system-info">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · {isDesktop ? 'local prototype' : 'works in browser'}</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(45 68% 40%)', background: 'hsl(45 68% 40% / .12)' }}><Monitor /></span>
            <div><h1>System Info.</h1><p>A clean overview of your PC and hardware.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> {isDesktop ? 'Preview mode' : 'Live data'}</span>
      </div>
      <DisplacedWidgetBand />
      {isDesktop && (
        <div className="renamer-notice">
          <Monitor />
          <div>
            <strong>Reading system information</strong>
            <span>System Info is gathering your hardware and OS details from the desktop bridge.</span>
          </div>
        </div>
      )}
      <div className="system-info-grid">
        {cards.map(({ label, value, detail, Icon }) => (
          <div className="system-info-card" key={label}>
            <div className="system-info-card-header">
              <Icon className="system-info-icon" />
              <span className="system-info-label">{label}</span>
            </div>
            <div className="system-info-value">{value}</div>
            <div className="system-info-detail">{detail}</div>
          </div>
        ))}
      </div>
      {isDesktop && <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> CPU, RAM, GPU, storage, display, and network details are read directly from your system when running as a desktop app.</p></div>}
    </section>
  );
}
