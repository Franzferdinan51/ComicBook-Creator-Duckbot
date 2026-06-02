/**
 * Comic Creator — shared frontend library.
 * Preact + htm + helpers. CDN imports — no build step.
 * Imported by every component file under components/.
 */

import { h } from 'https://esm.sh/preact@10';
import htm from 'https://esm.sh/htm@3';

// Tagged-template literal helper, bound to Preact's `h`. Every component
// imports the same `html` so JSX-like syntax works without a build step.
export const html = htm.bind(h);

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

/**
 * Thin fetch wrapper. Throws on non-2xx with the server's `{ error }` message.
 * Returns parsed JSON when the response is JSON; otherwise the raw Response.
 */
export async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body && body.error) msg = body.error;
    } catch { /* not JSON */ }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res;
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

let toastSeq = 0;
const TOAST_LIFETIME_MS = 3500;

/**
 * Show a transient toast in the bottom-right corner. Pass 'success' | 'error' | 'info'.
 * The toast container is created lazily on first call so components don't need
 * to mount it themselves.
 */
export function showToast(message, type = 'info') {
  let host = document.getElementById('toast');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.dataset.id = String(++toastSeq);
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), TOAST_LIFETIME_MS);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Format a Date or ISO string as a short locale-friendly string. */
export function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Read a hash route like "#/settings" → "/settings", or "/" if absent. */
export function readHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  return h || '/';
}

/** Hash-route → simple page name used by the app. */
export function hashToPage(hash) {
  if (hash === '/settings') return 'settings';
  if (hash === '/history') return 'history';
  return 'home';
}

/** Navigate via the hash router. */
export function navTo(page) {
  const target = page === 'home' ? '/' : `/${page}`;
  if (window.location.hash !== `#${target}`) {
    window.location.hash = target;
  }
}
