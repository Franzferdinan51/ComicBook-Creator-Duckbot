/**
 * History — list of recent comics from GET /api/history. Each row is clickable
 * and loads the corresponding job (best-effort — the in-memory job may be
 * gone after a server restart, in which case we still show the scriptJson from
 * the history entry).
 *
 * Props:
 *   onOpen: (entry: HistoryEntry, result: ComicResult | null, jobId: string) => void
 */

import { useState, useEffect } from 'https://esm.sh/preact@10/hooks';
import { html, api, showToast, formatDate, navTo } from './_lib.js';

export function History({ onOpen }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingId, setOpeningId] = useState(null);

  function load() {
    setLoading(true);
    setError(null);
    api('/api/history')
      .then((entries) => setHistory(entries || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleOpen(entry) {
    setOpeningId(entry.jobId);
    try {
      // Try to get the live job first — has the full result + working PDF endpoint.
      let result = null;
      try {
        const data = await api(`/api/comic/${entry.jobId}`);
        if (data && data.status === 'done' && data.result) {
          result = data.result;
        }
      } catch { /* job may have been GC'd from in-memory map — fall through */ }

      if (!result && entry.scriptJson) {
        // Reconstruct a result-shaped object from the persisted history.
        result = {
          script: entry.scriptJson,
          outputPath: entry.outputPath,
          pages: [],
        };
      }

      if (!result) {
        showToast('Job not found on the server and no cached script.', 'error');
        return;
      }

      navTo('home');
      onOpen && onOpen(entry, result, entry.jobId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setOpeningId(null);
    }
  }

  async function handleDelete(entry, e) {
    e.stopPropagation();
    if (!confirm(`Remove "${entry.title || 'this comic'}" from history?\nThe PDF on disk is not deleted.`)) return;
    try {
      await api(`/api/history/${entry.jobId}`, { method: 'DELETE' });
      setHistory((h) => h.filter((row) => row.jobId !== entry.jobId));
      showToast('Removed from history.', 'info');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  if (loading) {
    return html`
      <section class="panel" aria-labelledby="history-title">
        <header class="panel-title">
          <h2 id="history-title">History</h2>
        </header>
        <div class="history-grid">
          ${[1, 2, 3, 4].map(() => html`<div class="skeleton skeleton-block"></div>`)}
        </div>
      </section>
    `;
  }

  if (error) {
    return html`
      <section class="panel" aria-labelledby="history-title">
        <header class="panel-title">
          <h2 id="history-title">History</h2>
        </header>
        <div class="error-state">
          <p>Could not load history: <code>${error}</code></p>
          <button class="btn" type="button" onClick=${load}>Try again</button>
        </div>
      </section>
    `;
  }

  return html`
    <section class="panel" aria-labelledby="history-title">
      <header class="panel-title">
        <h2 id="history-title">History</h2>
        <span class="muted small">${history.length} comic${history.length === 1 ? '' : 's'}</span>
      </header>

      ${history.length === 0 ? html`
        <div class="empty-state">
          <h3>No comics yet 🎨</h3>
          <p>Make your first comic — it will appear here automatically.</p>
          <a class="btn" href="#/" onClick=${() => navTo('home')}>Make your first comic</a>
        </div>
      ` : html`
        <div class="history-grid">
          ${history.map((entry) => html`
            <article
              key=${entry.jobId}
              class=${'history-card' + (openingId === entry.jobId ? ' opening' : '')}
              onClick=${() => handleOpen(entry)}
              role="button"
              tabIndex="0"
              onKeyDown=${(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(entry); } }}
            >
              <div class="history-thumb">
                <span>${entry.artStyle || '—'}</span>
              </div>
              <div class="history-info">
                <h3 class="history-title" title=${entry.title || ''}>${entry.title || 'Untitled'}</h3>
                <div class="history-meta">
                  <span class="history-badge">${entry.artStyle || '—'}</span>
                  <span>${entry.pageCount || '?'}p</span>
                  <span>${formatDate(entry.createdAt)}</span>
                </div>
              </div>
              <div class="history-actions">
                <button
                  type="button"
                  onClick=${(e) => { e.stopPropagation(); handleOpen(entry); }}
                >Open</button>
                <button
                  type="button"
                  class="delete"
                  onClick=${(e) => handleDelete(entry, e)}
                >Delete</button>
              </div>
            </article>
          `)}
        </div>
      `}
    </section>
  `;
}
