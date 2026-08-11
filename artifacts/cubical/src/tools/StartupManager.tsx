import { PackageOpen, Sparkles } from 'lucide-react';
import { BackButton, DisplacedWidgetBand } from '../shared/contexts';

export function StartupManager() {
  const isDesktop  = !!(window.cubicalDesktop);
  const previewItems = [
    { name: 'Discord',  path: 'AppData\\Local\\Discord\\Update.exe --processStart Discord.exe', enabled: true  },
    { name: 'Spotify',  path: 'AppData\\Roaming\\Spotify\\Spotify.exe',                        enabled: true  },
    { name: 'Slack',    path: 'AppData\\Local\\slack\\slack.exe',                              enabled: false },
    { name: 'Steam',    path: 'Program Files (x86)\\Steam\\steam.exe',                         enabled: true  },
    { name: 'OneDrive', path: 'Program Files\\Microsoft OneDrive\\OneDrive.exe',               enabled: true  },
  ];
  return (
    <section className="renamer-page" data-testid="startup-manager">
      <BackButton fallback="/library" label="Back to library" />
      <div className="tool-title-row">
        <div>
          <div className="eyebrow">Cubical tool · local prototype</div>
          <div className="tool-title-with-icon">
            <span className="renamer-tool-icon" style={{ color: 'hsl(262 48% 50%)', background: 'hsl(262 48% 50% / .11)' }}><PackageOpen /></span>
            <div><h1>Startup Manager.</h1><p>See and manage what launches with Windows.</p></div>
          </div>
        </div>
        <span className="tool-status"><i className="status-dot" /> Preview mode</span>
      </div>
      <DisplacedWidgetBand />
      <div className="renamer-notice">
        <PackageOpen />
        <div>
          <strong>{isDesktop ? 'Reading startup entries' : 'Desktop access required'}</strong>
          <span>{isDesktop ? 'Startup Manager is reading your Windows registry and startup folders.' : 'Startup Manager reads from the Windows registry. It will be fully functional in the Cubical desktop app. The list below shows what it will look like.'}</span>
        </div>
      </div>
      <div className="startup-list">
        <div className="renamer-section-heading">
          <span className="eyebrow">Startup programs</span>
          <span className="library-count" style={{ opacity: .55 }}>Preview data</span>
        </div>
        {previewItems.map((item) => (
          <div className="startup-row" key={item.name}>
            <PackageOpen className="startup-row-icon" />
            <div className="startup-row-info">
              <strong className="startup-row-name">{item.name}</strong>
              <span className="startup-row-path">C:\Users\…\{item.path}</span>
            </div>
            <button type="button" className={`startup-toggle${item.enabled ? ' is-enabled' : ''}`} disabled={!isDesktop}>
              {item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        ))}
      </div>
      <div className="desktop-note"><Sparkles /><p><strong>Requires Cubical for Windows.</strong> Toggle, inspect, and manage which programs launch at startup — cleanly, without touching the registry by hand.</p></div>
    </section>
  );
}
