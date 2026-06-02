/**
 * comic-creator — URL validation for user-supplied endpoints.
 *
 * Rejects URLs that:
 *   - aren't http(s)
 *   - are RFC 1918 / link-local / loopback / multicast / cloud metadata
 *     addresses — UNLESS the server is running with `COMIC_WEBUI_ALLOW_PRIVATE=1`
 *     (useful for self-hosted LocalAI/Ollama on the LAN)
 *   - are too long
 *
 * Returns the normalized URL (no trailing slash) on success, or a
 * `{ ok: false, error }` shape on failure.
 */

export interface UrlCheck {
  ok: boolean;
  url?: string;
  error?: string;
  isPrivate?: boolean;
}

const MAX_URL_LENGTH = 2048;

function isPrivateHostname(host: string): boolean {
  // IPv6 — anything starting with ::, fc.., fd.., fe80: is private
  if (host.startsWith('[')) {
    const inner = host.slice(1, -1).toLowerCase();
    if (inner === '::1' || inner === '::') return true;
    if (inner.startsWith('fc') || inner.startsWith('fd')) return true;
    if (inner.startsWith('fe80:')) return true;
    if (inner.startsWith('::ffff:')) {
      // IPv4-mapped: check the IPv4 part
      const v4 = inner.slice(7);
      return isPrivateIPv4(v4);
    }
    return false;
  }
  // IPv4 dotted-quad
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isPrivateIPv4(host);
  }
  // Hostname: localhost + common LAN names
  const lower = host.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return true;
  if (lower === 'metadata.google.internal' || lower === 'metadata') return true; // GCP
  return false;
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 (loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local) — includes AWS/GCP metadata at 169.254.169.254
  if (a === 169 && b === 254) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 224.0.0.0/4 (multicast)
  if (a >= 224 && a <= 239) return true;
  return false;
}

/**
 * Check a URL for safety. Returns the normalized URL on success.
 *
 * @param allowPrivate — when true, accept private/loopback addresses
 *   (used when the server is explicitly configured for self-hosted
 *   internal endpoints via `COMIC_WEBUI_ALLOW_PRIVATE=1`).
 */
export function checkProviderUrl(raw: unknown, opts: { allowPrivate?: boolean } = {}): UrlCheck {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, error: 'baseUrl is required' };
  }
  if (raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: `baseUrl too long (max ${MAX_URL_LENGTH})` };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'baseUrl is not a valid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: `unsupported protocol "${parsed.protocol}" (only http/https)` };
  }
  const allowPrivate = Boolean(opts.allowPrivate)
    || process.env.COMIC_WEBUI_ALLOW_PRIVATE === '1'
    || process.env.COMIC_WEBUI_ALLOW_PRIVATE === 'true';
  const isPrivate = isPrivateHostname(parsed.hostname);
  if (isPrivate && !allowPrivate) {
    return {
      ok: false,
      error:
        `baseUrl host "${parsed.hostname}" is a private/internal address. ` +
        `If you're running a self-hosted endpoint (LocalAI, Ollama, etc.) on the LAN, ` +
        `set COMIC_WEBUI_ALLOW_PRIVATE=1 in the server's environment.`,
      isPrivate: true,
    };
  }
  // Strip trailing slashes for consistency.
  const normalized = parsed.toString().replace(/\/+$/, '');
  return { ok: true, url: normalized, isPrivate };
}
