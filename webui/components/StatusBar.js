/**
 * StatusBar — slim bar at the top of the app showing server health,
 * API version, and the current model + provider status. Renders inline with
 * the header in the app layout.
 *
 * Polls /api/health and /api/providers every 5 s, falls back to "offline"
 * indicators if the server is unreachable.
 */

import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
import { html, api } from './_lib.js';

const POLL_MS = 5000;

export function StatusBar({ activeTextProvider, activeImageProvider }) {
  const [health, setHealth] = useState(null);
  const [providers, setProviders] = useState({ text: [], image: [] });
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let timer;

    async function tick() {
      try {
        const [h, p] = await Promise.all([
          api('/api/health'),
          api('/api/providers'),
        ]);
        if (cancelled) return;
        setHealth(h);
        setProviders(p);
        setLastUpdated(new Date());
      } catch (err) {
        if (cancelled) return;
        setHealth({ status: 'down', error: err.message });
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  const ok = health && health.status === 'ok';
  const dotClass = ok ? 'ok' : (health ? 'err' : 'loading');
  const textProvider = providers.text.find((p) => p.name === activeTextProvider);
  const imageProvider = providers.image.find((p) => p.name === activeImageProvider);

  // Warn if the selected provider is unavailable
  const textUnavailable = textProvider && !textProvider.available;
  const imageUnavailable = imageProvider && !imageProvider.available;
  const anyUnavailable = textUnavailable || imageUnavailable;

  return html`
    <div class=${'status-bar' + (anyUnavailable ? ' status-bar-warn' : '')} role="status" aria-live="polite">
      <span class="status-item">
        <span class=${'dot ' + dotClass} aria-hidden="true"></span>
        ${ok
          ? `Server ${health.version} · up ${Math.round(health.uptime || 0)}s`
          : (health && health.status === 'down'
              ? html`Server <span class="err">offline</span>`
              : html`<span class="muted">Checking server…</span>`)}
      </span>
      ${textProvider ? html`
        <span class="status-item" title=${textProvider.error || ''}>
          📝 text: <strong>${textProvider.name}</strong>
          ${textProvider.available
            ? html`<span class="muted">· ${textProvider.model || 'ok'}</span>`
            : html`<span class="err">· unavailable</span>`}
        </span>
      ` : null}
      ${imageProvider ? html`
        <span class="status-item" title=${imageProvider.error || ''}>
          🎨 image: <strong>${imageProvider.name}</strong>
          ${imageProvider.available
            ? html`<span class="muted">· ${imageProvider.model || 'ok'}</span>`
            : html`<span class="err">· unavailable</span>`}
        </span>
      ` : null}
      ${anyUnavailable ? html`
        <span class="status-item warn-badge">
          ⚠️ provider${textUnavailable && imageUnavailable ? 's' : ''} down — check Settings
        </span>
      ` : null}
      ${lastUpdated ? html`
        <span class="status-item muted small" title="Last poll time">
          · refreshed ${lastUpdated.toLocaleTimeString()}
        </span>
      ` : null}
    </div>
  `;
}
