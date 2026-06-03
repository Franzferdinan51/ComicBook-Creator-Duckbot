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

const PROJECT_GOAL_LABELS = {
  comic: 'Comic',
  screen: 'Screen',
  music: 'Music',
  studio: 'Studio',
};

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

      if (!result) {
        try {
          const bundle = await api(`/api/comic/${entry.jobId}/studio-bundle`);
          if (bundle && bundle.format === 'studio-bundle') {
            result = {
              script: entry.scriptJson,
              outputPath: bundle.artifactPaths?.outputPath || entry.outputPath,
              pdfPath: bundle.artifactPaths?.pdfPath ?? null,
              cbzPath: bundle.artifactPaths?.cbzPath ?? null,
              coverImagePath: bundle.artifactPaths?.coverImagePath ?? null,
              project: bundle.project,
              projectPath: bundle.artifactPaths?.projectPath ?? null,
              storyBible: bundle.storyBible,
              adaptationPackage: bundle.adaptationPackage,
              musicCuePackage: bundle.musicCuePackage,
              agentGuidancePackage: bundle.agentGuidancePackage,
              agentGuidancePath: bundle.artifactPaths?.agentGuidancePath ?? null,
              songSheetPath: bundle.artifactPaths?.songSheetPath ?? null,
              songAudioPath: bundle.artifactPaths?.songAudioPath ?? null,
              musicProvider: bundle.musicProvider || entry.musicProvider || 'mock',
              storyboardPackagePath: bundle.artifactPaths?.storyboardPackagePath ?? null,
              animaticTimelinePath: bundle.artifactPaths?.animaticTimelinePath ?? null,
              studioBundlePath: bundle.artifactPaths?.studioBundlePath ?? entry.studioBundlePath ?? null,
              pages: [],
            };
          }
        } catch { /* studio bundle may be unavailable — fall through */ }
      }

      if (!result && entry.scriptJson) {
        // Reconstruct a result-shaped object from the persisted history.
        result = {
          script: entry.scriptJson,
          outputPath: entry.outputPath,
          project: entry.project || null,
          projectPath: entry.projectPath || null,
          storyBible: entry.storyBible || null,
          adaptationPackage: entry.adaptationPackage || null,
          musicCuePackage: entry.musicCuePackage || null,
          agentGuidancePackage: entry.agentGuidancePackage || null,
          agentGuidancePath: entry.agentGuidancePath || null,
          songSheetPath: entry.songSheetPath || null,
          songAudioPath: entry.songAudioPath || null,
          musicProvider: entry.musicProvider || 'mock',
          storyboardPackagePath: entry.storyboardPackagePath || null,
          animaticTimelinePath: entry.animaticTimelinePath || null,
          studioBundlePath: entry.studioBundlePath || null,
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

  function handleDownloadStudioBundle(entry, e) {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/studio-bundle`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-studio-bundle.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Studio bundle downloaded.', 'success');
  }

  function handleDownloadAgentPlaybook(e) {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = '/api/agent-playbook';
    a.download = 'hermes-openclaw-playbook.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Agent playbook downloaded.', 'success');
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

  // Map art styles to background gradients for history thumbnails
  const ART_GRADIENTS = {
    manga: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
    anime: 'linear-gradient(135deg, #0ea5e9 0%, #7dd3fc 100%)',
    noir: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
    cartoon: 'linear-gradient(135deg, #f59e0b 0%, #fcd34d 100%)',
    watercolor: 'linear-gradient(135deg, #10b981 0%, #6ee7b7 100%)',
    cyberpunk: 'linear-gradient(135deg, #dc2626 0%, #f472b6 100%)',
    fantasy: 'linear-gradient(135deg, #7c3aed 0%, #fbbf24 100%)',
    'pixel art': 'linear-gradient(135deg, #0891b2 0%, #22d3ee 100%)',
    storyboard: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)',
  };
  function thumbGradient(style) {
    const key = (style || '').toLowerCase();
    return ART_GRADIENTS[key] || 'linear-gradient(135deg, var(--bg-2), var(--surface-2))';
  }

  function projectGoalLabel(entry) {
    const goal = entry?.project?.projectGoal || entry?.projectGoal || 'comic';
    return PROJECT_GOAL_LABELS[goal] || goal;
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
              <div
                class="history-thumb"
                style=${{ background: thumbGradient(entry.artStyle) }}
              >
                <span class="history-thumb-label">${entry.artStyle || '—'}</span>
                <span class="history-thumb-pages">${entry.pageCount || '?'}p</span>
              </div>
              <div class="history-info">
                <h3 class="history-title" title=${entry.title || ''}>${entry.title || 'Untitled'}</h3>
                <div class="history-meta">
                  <span class="history-badge">${entry.artStyle || '—'}</span>
                  <span class="history-badge">Goal: ${projectGoalLabel(entry)}</span>
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
                  onClick=${handleDownloadAgentPlaybook}
                  title="Download the repo-level Hermes/OpenClaw playbook"
                >Playbook</button>
                <button
                  type="button"
                  onClick=${(e) => handleDownloadStudioBundle(entry, e)}
                  title="Download the unified studio bundle for this history item"
                >Bundle</button>
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
