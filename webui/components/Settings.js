/**
 * Settings — read/write the user's default preferences via /api/settings.
 * Saves on every change (debounced) and shows a toast on success.
 *
 * Also includes a "Provider credentials" section so the user can input
 * API keys and base URLs for each provider (overrides what's in
 * `~/.openclaw/openclaw.json`).
 *
 * Props: none — fully self-contained.
 */

import { useState, useEffect, useRef } from 'https://esm.sh/preact@10/hooks';
import { html, api, showToast } from './_lib.js';

const ART_STYLES = [
  'manga', 'noir', 'cartoon', 'watercolor', 'comic book',
  'anime', 'cyberpunk', 'fantasy', 'pixel art', 'storyboard',
];

const PROJECT_GOALS = [
  { value: 'comic', label: 'Comic-first' },
  { value: 'screen', label: 'Screen / show' },
  { value: 'music', label: 'Music-first' },
  { value: 'studio', label: 'Studio balance' },
];

const DEBOUNCE_MS = 350;
const PROVIDER_NAMES = ['openrouter', 'lmstudio', 'minimax', 'xai', 'gemini', 'comfyui'];
const CUSTOM_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const PROVIDER_HINTS = {
  openrouter: {
    label: 'OpenRouter',
    docs: 'Get a key at https://openrouter.ai/keys',
    baseUrlHint: 'https://openrouter.ai/api/v1',
  },
  lmstudio: {
    label: 'LM Studio (local)',
    docs: 'Run LM Studio locally and enable the OpenAI-compatible server.',
    baseUrlHint: 'http://127.0.0.1:1234/v1',
  },
  minimax: {
    label: 'MiniMax',
    docs: 'Get a key at https://platform.MiniMax.io/  (paste it once, leave the URL empty to auto-detect)',
    baseUrlHint: 'auto (anthropic-messages or native)',
  },
  xai: {
    label: 'xAI (Grok)',
    docs: 'Sign in with your xAI account — no API key to paste. The OAuth token is read from your openclaw auth store automatically. You can also paste an XAI_API_KEY below to override.',
    baseUrlHint: 'https://api.x.ai/v1',
    /** Marker so the Settings row renders the special "Sign in" UI. */
    authFlow: 'xai-oauth',
  },
  gemini: {
    label: 'Google Gemini',
    docs: 'Get a key at https://aistudio.google.com/apikey — text + Imagen / Gemini image gen',
    baseUrlHint: 'https://generativelanguage.googleapis.com',
  },
  comfyui: {
    label: 'ComfyUI (local)',
    docs: 'Run ComfyUI with --enable-openai-api --port 8188. Loads your own checkpoints for free local image gen.',
    baseUrlHint: 'http://127.0.0.1:8188/v1',
  },
};

export function Settings() {
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState({ text: [], image: [] });
  const [overrides, setOverrides] = useState({});
  const [customProviders, setCustomProviders] = useState({});
  const [xaiAuth, setXaiAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef({});

  // Initial load
  useEffect(() => {
    Promise.all([
      api('/api/settings').catch((err) => { throw new Error(`settings: ${err.message}`); }),
      api('/api/providers').catch(() => ({ text: [], image: [] })),
      api('/api/provider-overrides').catch(() => ({})),
      api('/api/custom-providers').catch(() => ({})),
      api('/api/auth/xai/status').catch(() => null),
    ])
      .then(([s, p, o, c, xa]) => {
        setSettings(s);
        setProviders(p);
        setOverrides(o || {});
        setCustomProviders(c || {});
        setXaiAuth(xa);
        lastSavedRef.current = s;
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Debounced auto-save on any settings change.
  useEffect(() => {
    if (!settings) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const patch = diff(settings, lastSavedRef.current);
      if (Object.keys(patch).length === 0) return;
      try {
        const next = await api('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        lastSavedRef.current = next;
        showToast('Settings saved.', 'success');
      } catch (err) {
        showToast(`Save failed: ${err.message}`, 'error');
      }
    }, DEBOUNCE_MS);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [settings]);

  function update(patch) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  if (loading) {
    return html`
      <section class="panel" aria-labelledby="settings-title">
        <header class="panel-title">
          <h2 id="settings-title">Settings</h2>
        </header>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-text"></div>
        <div class="skeleton skeleton-block"></div>
      </section>
    `;
  }

  if (error) {
    return html`
      <section class="panel" aria-labelledby="settings-title">
        <header class="panel-title">
          <h2 id="settings-title">Settings</h2>
        </header>
        <div class="error-state">
          <p>Could not load settings: <code>${error}</code></p>
        </div>
      </section>
    `;
  }

  return html`
    <section class="panel" aria-labelledby="settings-title">
      <header class="panel-title">
        <h2 id="settings-title">Settings</h2>
        <span class="muted small">Auto-saves on change.</span>
      </header>

      <h3 class="section-heading">Defaults</h3>

      <div class="field">
        <label for="default-art-style">Default art style</label>
        <input
          id="default-art-style"
          type="text"
          value=${settings.defaultArtStyle || 'manga'}
          onInput=${(e) => update({ defaultArtStyle: e.target.value })}
          placeholder="e.g. manga, noir, watercolor"
        />
        <div class="presets">
          ${ART_STYLES.map((s) => html`
            <button
              key=${s}
              type="button"
              class=${'preset-chip' + (settings.defaultArtStyle === s ? ' active' : '')}
              onClick=${() => update({ defaultArtStyle: s })}
            >${s}</button>
          `)}
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="default-page-count">Default page count <span class="muted">(1-50)</span></label>
          <input
            id="default-page-count"
            type="number"
            min="1"
            max="50"
            value=${settings.defaultPageCount ?? 4}
            onInput=${(e) => {
              const n = parseInt(e.target.value, 10);
              update({ defaultPageCount: Number.isFinite(n) ? n : 4 });
            }}
          />
        </div>

        <div class="field">
          <label for="default-output-format">Default output format</label>
          <select
            id="default-output-format"
            value=${settings.defaultOutputFormat || 'pdf'}
            onChange=${(e) => update({ defaultOutputFormat: e.target.value })}
          >
            <option value="pdf">PDF</option>
            <option value="cbz">CBZ (zipped)</option>
          </select>
        </div>

        <div class="field">
          <label for="default-project-goal">Default project goal</label>
          <select
            id="default-project-goal"
            value=${settings.defaultProjectGoal || 'comic'}
            onChange=${(e) => update({ defaultProjectGoal: e.target.value })}
          >
            ${PROJECT_GOALS.map((goal) => html`
              <option key=${goal.value} value=${goal.value}>${goal.label}</option>
            `)}
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="default-text-provider">Default text provider</label>
          <select
            id="default-text-provider"
            value=${settings.defaultTextProvider || 'mock'}
            onChange=${(e) => update({ defaultTextProvider: e.target.value })}
          >
            ${providers.text.map((p) => html`
              <option key=${p.name} value=${p.name} disabled=${!p.available}>
                ${labelForProvider(p)}
              </option>
            `)}
          </select>
        </div>
        <div class="field">
          <label for="default-image-provider">Default image provider</label>
          <select
            id="default-image-provider"
            value=${settings.defaultImageProvider || 'mock'}
            onChange=${(e) => update({ defaultImageProvider: e.target.value })}
          >
            ${providers.image.map((p) => html`
              <option key=${p.name} value=${p.name} disabled=${!p.available}>
                ${labelForProvider(p)}
              </option>
            `)}
          </select>
        </div>
      </div>

      <h3 class="section-heading">Provider credentials</h3>
      <p class="muted small">
        These values override what's in <code>~/.openclaw/openclaw.json</code>.
        Leave the API key field empty to keep the existing value (or click
        "Clear" to remove the override entirely). Keys are stored locally in
        <code>state/provider-overrides.json</code>.
      </p>

      ${PROVIDER_NAMES.map((name) => {
        const hint = PROVIDER_HINTS[name];
        const isXai = name === 'xai';
        return html`
          <${ProviderCredentialsRow}
            key=${name}
            name=${name}
            hint=${hint}
            override=${overrides[name] || { name, hasKey: false, source: 'none' }}
            onChange=${(next) => setOverrides((prev) => ({ ...prev, [name]: next }))}
          >
            ${isXai && xaiAuth
              ? html`<${XaiAuthFlow} auth=${xaiAuth} onChange=${setXaiAuth} />`
              : null}
          <//>
        `;
      })}

      <h3 class="section-heading">Custom OpenAI-compatible endpoints</h3>
      <p class="muted small">
        Add any server that speaks the OpenAI API — LocalAI, Ollama (with
        <code>OPENAI_COMPAT=true</code>), vLLM, a custom proxy, a remote
        proxy for an internal model, or your own LLM runner. Each becomes
        a first-class text + image provider available everywhere in the
        app. (The built-in <code>xai</code>, <code>gemini</code>,
        <code>openrouter</code>, and <code>comfyui</code> providers already
        cover most popular hosted and local setups — use this section for
        anything else.)
      </p>

      <${CustomProviderList}
        providers=${customProviders}
        onChange=${setCustomProviders}
      />
    </section>
  `;
}

function labelForProvider(p) {
  if (p.name === 'mock') return 'mock (deterministic, no API calls)';
  const badge = p.apiStyle === 'anthropic-messages' ? ' [anthropic]' :
                p.isLocal ? ' [local]' : '';
  const status = p.available ? '' : ' — not configured';
  return `${p.name}${badge}${p.model ? ` (${p.model})` : ''}${status}`;
}

// ---------------------------------------------------------------------------
// Provider credentials row — input fields for apiKey + baseUrl + test/clear.
// ---------------------------------------------------------------------------

function ProviderCredentialsRow({ name, hint, override, onChange, children }) {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState(override.baseUrl || '');
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showKey, setShowKey] = useState(false);

  // Re-sync the baseUrl input when the override changes from outside.
  useEffect(() => {
    setBaseUrlInput(override.baseUrl || '');
  }, [override.baseUrl]);

  async function save() {
    setBusy(true);
    setTestResult(null);
    try {
      const body = {
        ...(apiKeyInput ? { apiKey: apiKeyInput } : {}),
        ...(apiKeyInput === '' && override.hasKey ? { clearApiKey: true } : {}),
        ...(baseUrlInput !== (override.baseUrl || '') ? { baseUrl: baseUrlInput || '' } : {}),
      };
      // Nothing to send.
      if (Object.keys(body).length === 0) {
        showToast('Nothing to save.', 'info');
        return;
      }
      const next = await api(`/api/provider-overrides/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      onChange(next);
      setApiKeyInput('');
      setTestResult(null);
      showToast(`${hint.label} credentials saved.`, 'success');
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm(`Clear ${hint.label} credentials? The provider will fall back to env or openclaw.json.`)) return;
    setBusy(true);
    try {
      await api(`/api/provider-overrides/${name}`, { method: 'DELETE' });
      onChange({ name, hasKey: false, source: 'none' });
      setApiKeyInput('');
      setBaseUrlInput('');
      setTestResult(null);
      showToast(`${hint.label} credentials cleared.`, 'success');
    } catch (err) {
      showToast(`Clear failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await api(`/api/provider-overrides/${name}/test`, { method: 'POST' });
      setTestResult({ ok: true, ...r });
      showToast(`${hint.label} test passed.`, 'success');
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      showToast(`Test failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return html`
    <details class="provider-creds" open=${!override.hasKey ? null : 'open'}>
      <summary>
        <span class="provider-creds-name">${hint.label}</span>
        ${override.hasKey
          ? html`<span class="badge ok">key set <span class="muted small">…${override.keyTail || ''}</span></span>`
          : html`<span class="badge warn">no override</span>`}
        ${override.baseUrl
          ? html`<span class="muted small creds-url">${override.baseUrl}</span>`
          : null}
      </summary>
      <div class="provider-creds-body">
        <p class="muted small">${hint.docs}</p>

        <div class="field">
          <label for=${`creds-key-${name}`}>API key</label>
          <div class="input-with-action">
            <input
              id=${`creds-key-${name}`}
              type=${showKey ? 'text' : 'password'}
              value=${apiKeyInput}
              onInput=${(e) => setApiKeyInput(e.target.value)}
              placeholder=${override.hasKey ? '••••••• (enter a new value to replace)' : 'paste your API key'}
              autocomplete="off"
              spellcheck="false"
            />
            <button
              type="button"
              class="ghost"
              onClick=${() => setShowKey(!showKey)}
              title=${showKey ? 'Hide' : 'Show'}
            >${showKey ? '🙈' : '👁'}</button>
          </div>
        </div>

        <div class="field">
          <label for=${`creds-url-${name}`}>Base URL <span class="muted small">(optional — leave empty for default)</span></label>
          <input
            id=${`creds-url-${name}`}
            type="text"
            value=${baseUrlInput}
            onInput=${(e) => setBaseUrlInput(e.target.value)}
            placeholder=${hint.baseUrlHint}
            spellcheck="false"
          />
        </div>

        <div class="action-row">
          <button
            type="button"
            class="primary"
            onClick=${save}
            disabled=${busy}
          >Save</button>
          <button
            type="button"
            class="ghost"
            onClick=${test}
            disabled=${busy}
            title="Make a real ping call to verify the credentials work"
          >Test connection</button>
          ${override.source === 'user'
            ? html`<button type="button" class="danger" onClick=${clear} disabled=${busy}>Clear override</button>`
            : null}
        </div>

        ${testResult
          ? testResult.ok
            ? html`<p class="test-result ok">✓ Connection works${testResult.sample ? ` — got: <code>${testResult.sample}</code>` : ''}${testResult.model ? ` (model: <code>${testResult.model}</code>)` : ''}</p>`
            : html`<p class="test-result bad">✗ ${testResult.error}</p>`
          : null}
      </div>

      ${children
        ? html`<div class="provider-creds-children">${children}</div>`
        : null}
    </details>
  `;
}

function diff(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (a[k] !== b[k]) out[k] = a[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Custom OpenAI-compatible endpoint management
// ---------------------------------------------------------------------------

function CustomProviderList({ providers, onChange }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // name being edited
  const [testResult, setTestResult] = useState(null);

  const list = Object.values(providers);

  async function add(e) {
    e?.preventDefault?.();
    setBusy(true);
    setTestResult(null);
    try {
      const created = await api('/api/custom-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          baseUrl: baseUrl.trim(),
          ...(apiKey ? { apiKey } : {}),
          ...(model ? { model } : {}),
        }),
      });
      onChange({ ...providers, [created.name]: created });
      setName(''); setBaseUrl(''); setApiKey(''); setModel('');
      showToast(`Custom provider "${created.name}" added.`, 'success');
    } catch (err) {
      showToast(`Add failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(n) {
    if (!confirm(`Remove custom provider "${n}"?`)) return;
    setBusy(true);
    try {
      await api(`/api/custom-providers/${encodeURIComponent(n)}`, { method: 'DELETE' });
      const next = { ...providers };
      delete next[n];
      onChange(next);
      showToast(`Removed "${n}".`, 'success');
    } catch (err) {
      showToast(`Remove failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function test(n) {
    setBusy(true);
    setTestResult(null);
    try {
      const r = await api(`/api/custom-providers/${encodeURIComponent(n)}/test`, { method: 'POST' });
      setTestResult({ name: n, ok: true, ...r });
      showToast(`"${n}" test passed.`, 'success');
    } catch (err) {
      setTestResult({ name: n, ok: false, error: err.message });
      showToast(`Test failed: ${err.message}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return html`
    <div class="custom-providers">
      ${list.length === 0
        ? html`<p class="muted small">No custom endpoints yet. Add one below.</p>`
        : html`
          <ul class="custom-list">
            ${list.map((p) => html`
              <li key=${p.name} class="custom-row">
                <div class="custom-row-main">
                  <span class="custom-name">${p.name}</span>
                  <code class="custom-url">${p.baseUrl}</code>
                  ${p.model ? html`<span class="muted small">model: <code>${p.model}</code></span>` : null}
                  ${p.hasKey
                    ? html`<span class="badge ok">key set <span class="muted small">…${p.keyTail || ''}</span></span>`
                    : html`<span class="badge warn">no key</span>`}
                </div>
                <div class="custom-row-actions">
                  <button type="button" class="ghost" onClick=${() => test(p.name)} disabled=${busy}>Test</button>
                  <button type="button" class="danger" onClick=${() => remove(p.name)} disabled=${busy}>Remove</button>
                </div>
                ${testResult && testResult.name === p.name
                  ? testResult.ok
                    ? html`<p class="test-result ok">✓ Connection works${testResult.sample ? ` — got: <code>${testResult.sample}</code>` : ''}</p>`
                    : html`<p class="test-result bad">✗ ${testResult.error}</p>`
                  : null}
              </li>
            `)}
          </ul>
        `}

      <details class="custom-add" open>
        <summary>Add an endpoint</summary>
        <form class="custom-form" onSubmit=${add}>
          <div class="field-row">
            <div class="field">
              <label for="cp-name">Name</label>
              <input
                id="cp-name"
                type="text"
                value=${name}
                onInput=${(e) => setName(e.target.value)}
                placeholder="e.g. localai, ollama, vllm-prod"
                pattern=${CUSTOM_NAME_RE.source}
                spellcheck="false"
                required
              />
              <span class="muted small">letters, digits, ., _, -. Can't be "mock", "openrouter", "lmstudio", or "minimax".</span>
            </div>
            <div class="field">
              <label for="cp-url">Base URL</label>
              <input
                id="cp-url"
                type="text"
                value=${baseUrl}
                onInput=${(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:8080/v1"
                spellcheck="false"
                required
              />
            </div>
          </div>

          <div class="field-row">
            <div class="field">
              <label for="cp-key">API key <span class="muted small">(optional)</span></label>
              <div class="input-with-action">
                <input
                  id="cp-key"
                  type=${showKey ? 'text' : 'password'}
                  value=${apiKey}
                  onInput=${(e) => setApiKey(e.target.value)}
                  placeholder="bearer token (if required)"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button type="button" class="ghost" onClick=${() => setShowKey(!showKey)} title=${showKey ? 'Hide' : 'Show'}>${showKey ? '🙈' : '👁'}</button>
              </div>
            </div>
            <div class="field">
              <label for="cp-model">Default model <span class="muted small">(optional)</span></label>
              <input
                id="cp-model"
                type="text"
                value=${model}
                onInput=${(e) => setModel(e.target.value)}
                placeholder="e.g. llama-3.1-70b, sdxl, dall-e-3"
                spellcheck="false"
              />
            </div>
          </div>

          <div class="action-row">
            <button type="submit" class="primary" disabled=${busy || !name || !baseUrl}>Add endpoint</button>
          </div>
        </form>
      </details>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// xAI sign-in flow — runs the openclaw device-flow OAuth and shows the
// device URL. The user clicks "Sign in with xAI" in the xAI row; the
// server spawns `openclaw models auth login --device-code
// --provider=xai`; we poll /api/auth/xai/status until the login is done.
// ---------------------------------------------------------------------------

function XaiAuthFlow({ auth, onChange }) {
  const [busy, setBusy] = useState(false);
  const [pollError, setPollError] = useState(null);

  // Poll /api/auth/xai/status whenever a login is in flight, or any time
  // the page mounts (so a sign-in triggered from outside — e.g. another
  // tab or a CLI invocation — gets picked up). The interval backs off
  // to a slower cadence once a login completes.
  useEffect(() => {
    let slowTimer = null;
    const fast = setInterval(async () => {
      try {
        const next = await api('/api/auth/xai/status');
        if (next && (next.login?.running || next.login?.status === 'success' || next.login?.status === 'error' || next.login?.status === 'cancelled')) {
          onChange(next);
        }
      } catch (err) {
        setPollError(err && err.message ? err.message : String(err));
      }
      // While running, poll fast. Once it completes, slow down.
      clearInterval(fast);
      slowTimer = setInterval(async () => {
        try {
          const next = await api('/api/auth/xai/status');
          if (next) onChange(next);
        } catch { /* ignore */ }
      }, 15000);
    }, 1500);
    return () => {
      clearInterval(fast);
      if (slowTimer) clearInterval(slowTimer);
    };
  }, [onChange]);

  async function startSignIn() {
    setBusy(true);
    setPollError(null);
    try {
      await api('/api/auth/xai/sign-in', { method: 'POST' });
      const next = await api('/api/auth/xai/status');
      onChange(next);
    } catch (err) {
      showToast(`Sign-in failed: ${err && err.message ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelSignIn() {
    setBusy(true);
    try {
      await api('/api/auth/xai/sign-in/cancel', { method: 'POST' });
      const next = await api('/api/auth/xai/status');
      onChange(next);
    } catch (err) {
      showToast(`Cancel failed: ${err && err.message ? err.message : String(err)}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!auth) {
    return html`<p class="muted small">Loading xAI auth status…</p>`;
  }

  const { signedIn, email, expiresAt, expiresIn, reason, source, login } = auth;

  // The login object may be undefined if the server hasn't reported it
  // yet; treat as idle in that case.
  const isRunning = Boolean(login?.running);
  const deviceUrl = login?.deviceUrl;

  return html`
    <div class="xai-auth">
      <div class="xai-auth-status">
        ${signedIn
          ? html`
            <div class="xai-auth-signed-in">
              <span class="badge ok">Signed in</span>
              ${email ? html`<span class="muted small">as <code>${email}</code></span>` : null}
              ${expiresAt
                ? html`<span class="muted small">— expires ${formatRelative(expiresIn)}</span>`
                : null}
              ${source === 'env'
                ? html`<span class="muted small">(via <code>XAI_API_KEY</code> env var)</span>`
                : null}
            </div>
          `
          : html`
            <div class="xai-auth-signed-out">
              <span class="badge warn">Not signed in</span>
              ${reason
                ? html`<span class="muted small">— ${reason}${expiresAt ? ` (expired ${formatRelative(expiresIn)})` : ''}</span>`
                : null}
            </div>
          `}
      </div>

      ${!isRunning
        ? html`
          <div class="action-row">
            <button
              type="button"
              class="primary"
              onClick=${startSignIn}
              disabled=${busy}
              title="Run the openclaw device-flow login for xAI"
            >${signedIn ? 'Re-authenticate' : 'Sign in with xAI'}</button>
            <span class="muted small">
              Runs <code>openclaw models auth login --provider=xai</code> in the background.
            </span>
          </div>
        `
        : html`
          <div class="xai-auth-running">
            <p>
              <strong>Waiting for you to sign in…</strong>
            </p>
            ${deviceUrl
              ? html`
                <p class="device-url">
                  Open this URL in your browser to grant access:
                  <br/>
                  <a href=${deviceUrl} target="_blank" rel="noreferrer noopener">
                    <code>${deviceUrl}</code>
                  </a>
                  <button
                    type="button"
                    class="ghost small"
                    onClick=${() => {
                      try { navigator.clipboard.writeText(deviceUrl); showToast('Copied.', 'success'); }
                      catch (err) { showToast('Copy failed: ' + (err && err.message ? err.message : String(err)), 'error'); }
                    }}
                  >Copy</button>
                </p>
              `
              : html`<p class="muted small">Capturing device URL from openclaw stdout…</p>`}
            <div class="action-row">
              <button type="button" class="danger" onClick=${cancelSignIn} disabled=${busy}>Cancel sign-in</button>
            </div>
            ${login?.status === 'success'
              ? html`<p class="test-result ok">✓ Signed in. The new token is now active.</p>`
              : null}
            ${login?.status === 'error'
              ? html`<p class="test-result bad">✗ ${login?.error || 'sign-in failed'}</p>`
              : null}
            ${pollError ? html`<p class="test-result bad">polling: ${pollError}</p>` : null}
          </div>
        `}
    </div>
  `;
}

/** Render a future timestamp as "in 2h 13m" / "1d ago" etc. */
function formatRelative(secondsFromNow) {
  if (secondsFromNow == null) return '';
  if (secondsFromNow < 0) {
    return `${formatDuration(-secondsFromNow)} ago`;
  }
  return `in ${formatDuration(secondsFromNow)}`;
}

function formatDuration(s) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(1)}d`;
}
