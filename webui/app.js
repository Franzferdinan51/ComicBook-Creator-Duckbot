/**
 * Comic Creator — WebUI SPA entry point.
 * Preact + htm, no build step, served by the Express server at the same origin.
 * Hash router: #/  #/settings  #/history
 */

import { render } from 'https://esm.sh/preact@10';
import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10/hooks';

import { html, api, readHash, hashToPage, navTo, showToast } from './components/_lib.js';
import { StoryInput, STORY_MIN_LEN } from './components/StoryInput.js';
import { OptionsPanel } from './components/OptionsPanel.js';
import { GenerateButton } from './components/GenerateButton.js';
import { ResultPanel } from './components/ResultPanel.js';
import { MoviePanel } from './components/MoviePanel.js';
import { Settings } from './components/Settings.js';
import { History } from './components/History.js';
import { StatusBar } from './components/StatusBar.js';

// ---------------------------------------------------------------------------
// Top-level app
// ---------------------------------------------------------------------------

function App() {
  // ---- routing ---------------------------------------------------------
  const [page, setPage] = useState(() => hashToPage(readHash()));

  useEffect(() => {
    function onHash() { setPage(hashToPage(readHash())); }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // ---- form state ------------------------------------------------------
  const [story, setStory] = useState('');
  const [options, setOptions] = useState({});
  const [providers, setProviders] = useState({ text: [], image: [] });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ---- result state ----------------------------------------------------
  const [result, setResult] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [viewingTitle, setViewingTitle] = useState(null);

  // ---- bootstrap: load providers + default settings on mount ----------
  useEffect(() => {
    api('/api/providers')
      .then((p) => setProviders(p || { text: [], image: [] }))
      .catch(() => setProviders({ text: [], image: [] }));

    api('/api/settings')
      .then((s) => {
        if (!s) return;
        setOptions((prev) => ({
          ...prev,
          artStyle: prev.artStyle ?? s.defaultArtStyle,
          pageCount: prev.pageCount ?? s.defaultPageCount,
          outputFormat: prev.outputFormat ?? s.defaultOutputFormat,
          projectGoal: prev.projectGoal ?? s.defaultProjectGoal,
          textProvider: prev.textProvider ?? s.defaultTextProvider,
          imageProvider: prev.imageProvider ?? s.defaultImageProvider,
        }));
      })
      .catch(() => { /* leave defaults — server may be offline */ })
      .finally(() => setSettingsLoaded(true));
  }, []);

  // ---- handlers --------------------------------------------------------
  const handleNav = useCallback((p) => navTo(p), []);

  const handleGenerateDone = useCallback((r, jid) => {
    setResult(r);
    setActiveJobId(jid);
    setViewingTitle(null);
    if (r && r.script && r.script.title) setViewingTitle(r.script.title);
    showToast('Comic ready!', 'success');
  }, []);

  const handleGenerateError = useCallback((err) => {
    showToast(err.message, 'error');
  }, []);

  const handleRegenerate = useCallback(async () => {
    // The ResultPanel already POSTs /regenerate and gets a new jobId back
    // via the `onRegenerate` prop. Wire it here to keep the form in sync.
    // (ResultPanel calls api(...) directly; we expose a hook to set the
    // active jobId so the GenerateButton starts polling it.)
  }, []);

  // ResultPanel's "Regenerate" button returns the new jobId — we hook it up
  // by attaching an onRegenerate prop that resets the form's active job.
  const handleRegenerateNew = useCallback((newJobId) => {
    setResult(null);                  // hide old result
    setActiveJobId(newJobId);         // GenerateButton will see this and start polling
    setViewingTitle(null);
  }, []);

  const handleOpenHistory = useCallback((entry, res, jid) => {
    setResult(res);
    setActiveJobId(jid);
    setViewingTitle(entry?.title || res?.script?.title || null);
  }, []);

  const handleBackFromResult = useCallback(() => {
    setResult(null);
    setActiveJobId(null);
    setViewingTitle(null);
  }, []);

  // ---- derived ---------------------------------------------------------
  const storyValid = (story || '').trim().length >= STORY_MIN_LEN;
  const activeTextProvider = options.textProvider || providers.text[0]?.name;
  const activeImageProvider = options.imageProvider || providers.image[0]?.name;
  const noProvidersAvailable =
    providers.text.length > 0 && providers.image.length > 0 &&
    !providers.text.some((p) => p.available) &&
    !providers.image.some((p) => p.available);

  // ---- render ----------------------------------------------------------
  return html`
    <div class="app-root">
      <header class="app-header" role="banner">
        <h1 class="brand">🎨 Comic Creator</h1>
        <nav class="header-nav" aria-label="Primary">
          <button
            type="button"
            class=${page === 'home' ? 'active' : ''}
            onClick=${() => handleNav('home')}
            aria-current=${page === 'home' ? 'page' : undefined}
          >Create</button>
          <button
            type="button"
            class=${page === 'history' ? 'active' : ''}
            onClick=${() => handleNav('history')}
            aria-current=${page === 'history' ? 'page' : undefined}
          >History</button>
          <button
            type="button"
            class=${page === 'movie' ? 'active' : ''}
            onClick=${() => handleNav('movie')}
            aria-current=${page === 'movie' ? 'page' : undefined}
          >Movie / Show</button>
          <button
            type="button"
            class=${page === 'settings' ? 'active' : ''}
            onClick=${() => handleNav('settings')}
            aria-current=${page === 'settings' ? 'page' : undefined}
          >Settings</button>
        </nav>
      </header>
      <${StatusBar}
        activeTextProvider=${activeTextProvider}
        activeImageProvider=${activeImageProvider}
      />

      <main class="app-main" role="main">
        ${page === 'home' ? html`
          ${noProvidersAvailable ? html`
            <div class="panel notice-panel" role="alert">
              <strong>No image or text providers are available.</strong>
              <p class="muted">
                The <code>mock</code> provider is always present, but you've selected a different
                one. Edit the providers on the server (set the appropriate env var) or pick
                <code>mock</code> in the Options panel.
              </p>
            </div>
          ` : null}

          <div class=${'layout-grid ' + (result ? 'has-result' : '')}>
            <${StoryInput}
              value=${story}
              onChange=${setStory}
              disabled=${!!activeJobId}
            />
            <${OptionsPanel}
              options=${options}
              providers=${providers}
              onChange=${setOptions}
              disabled=${!!activeJobId}
            />
            <${GenerateButton}
              story=${story}
              options=${options}
              externalJobId=${activeJobId}
              onDone=${handleGenerateDone}
              onError=${handleGenerateError}
            />
          </div>

          ${result ? html`
            <div class="result-slot">
              <${ResultPanel}
                result=${result}
                jobId=${activeJobId}
                onRegenerate=${handleRegenerateNew}
                onClose=${handleBackFromResult}
                onOpenMovie=${() => handleNav('movie')}
              />
            </div>
          ` : null}

          ${!settingsLoaded ? html`
            <p class="muted small" aria-live="polite">Loading server settings…</p>
          ` : null}
        ` : null}

        ${page === 'settings' ? html`<${Settings} />` : null}
        ${page === 'history' ? html`<${History} onOpen=${handleOpenHistory} />` : null}
        ${page === 'movie' ? html`
          <${MoviePanel}
            result=${result}
            jobId=${activeJobId}
            onOpenComic=${() => handleNav('home')}
          />
        ` : null}
      </main>

<footer class="app-footer">
        <span class="muted small">
          ${viewingTitle ? `Viewing "${viewingTitle}" · ← → arrow keys to flip pages` : 'Comic Creator · ⌘+Enter to generate, Esc to stop watching.'}
        </span>
      </footer>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const root = document.getElementById('app');
if (root) {
  render(html`<${App} />`, root);
} else {
  console.error('No #app element found in DOM');
}
