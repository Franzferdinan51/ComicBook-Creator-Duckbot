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
  // Search/filter state — debounced when typing in the search box.
  const [query, setQuery] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [editingTags, setEditingTags] = useState(null); // jobId whose tags row is open
  const [tagInput, setTagInput] = useState('');

  function load() {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (projectGoal) params.set('projectGoal', projectGoal);
    if (favoritesOnly) params.set('favorite', 'true');
    params.set('limit', '50');
    const url = `/api/history${params.toString() ? `?${params.toString()}` : ''}`;
    api(url)
      .then((entries) => setHistory(entries || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  // Reload on filter changes. `query` is debounced by the input handler below.
  useEffect(() => { load(); }, [projectGoal, favoritesOnly]);
  // Re-run on query change (already debounced via the input's onChange).
  useEffect(() => { load(); }, [query]);

  async function toggleFavorite(entry) {
    try {
      const updated = await api(`/api/history/${entry.jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !entry.favorite }),
      });
      setHistory((rows) => rows.map((r) => (r.jobId === entry.jobId ? { ...r, ...updated } : r)));
    } catch (err) {
      showToast(`Couldn't update favorite: ${err.message}`, 'error');
    }
  }

  async function saveTags(entry, rawList) {
    const tags = rawList
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    try {
      const updated = await api(`/api/history/${entry.jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      setHistory((rows) => rows.map((r) => (r.jobId === entry.jobId ? { ...r, ...updated } : r)));
      setEditingTags(null);
      setTagInput('');
      showToast('Tags saved.', 'success');
    } catch (err) {
      showToast(`Couldn't save tags: ${err.message}`, 'error');
    }
  }

  async function handleOpen(entry) {
    setOpeningId(entry.jobId);
    try {
      // Try to get the live job first — has the full result + working PDF endpoint.
      let result = null;
      try {
        const data = await api(`/api/comic/${entry.jobId}`);
        if (data && data.status === 'done' && data.result) {
          result = {
            ...data.result,
            ...(data.fromHistory ? { fromHistory: true } : {}),
          };
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
              seriesPackage: bundle.seriesPackage,
              trailerPackage: bundle.trailerPackage,
              videoPackage: bundle.videoPackage,
              musicCuePackage: bundle.musicCuePackage,
              agentGuidancePackage: bundle.agentGuidancePackage,
              agentGuidancePath: bundle.artifactPaths?.agentGuidancePath ?? null,
              agentWorkflowPackage: bundle.agentWorkflowPackage,
              agentWorkflowPackagePath: bundle.artifactPaths?.agentWorkflowPackagePath ?? null,
              productionRunManifest: bundle.productionRunManifest,
              fromHistory: true,
              productionRunManifestPath: bundle.artifactPaths?.productionRunManifestPath ?? null,
              screenplayPath: bundle.artifactPaths?.screenplayPath ?? null,
              directorBriefPath: bundle.artifactPaths?.directorBriefPath ?? null,
              songSheetPath: bundle.artifactPaths?.songSheetPath ?? null,
              songAudioPath: bundle.artifactPaths?.songAudioPath ?? null,
              musicCuePackagePath: bundle.artifactPaths?.musicCuePackagePath ?? null,
              seriesPackagePath: bundle.artifactPaths?.seriesPackagePath ?? null,
              musicProvider: bundle.musicProvider || entry.musicProvider || 'mock',
              storyboardPackagePath: bundle.artifactPaths?.storyboardPackagePath ?? null,
              trailerPackagePath: bundle.artifactPaths?.trailerPackagePath ?? null,
              videoPackagePath: bundle.artifactPaths?.videoPackagePath ?? null,
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
          seriesPackage: entry.seriesPackage || null,
          trailerPackage: entry.trailerPackage || null,
          videoPackage: entry.videoPackage || null,
          musicCuePackage: entry.musicCuePackage || null,
          agentGuidancePackage: entry.agentGuidancePackage || null,
          agentGuidancePath: entry.agentGuidancePath || null,
          agentWorkflowPackage: entry.agentWorkflowPackage || null,
          agentWorkflowPackagePath: entry.agentWorkflowPackagePath || null,
          productionRunManifest: entry.productionRunManifest || null,
          productionRunManifestPath: entry.productionRunManifestPath || null,
          screenplayPath: entry.screenplayPath || null,
          directorBriefPath: entry.directorBriefPath || null,
          songSheetPath: entry.songSheetPath || null,
          songAudioPath: entry.songAudioPath || null,
          musicCuePackagePath: entry.musicCuePackagePath || null,
          seriesPackagePath: entry.seriesPackagePath || null,
          musicProvider: entry.musicProvider || 'mock',
          storyboardPackagePath: entry.storyboardPackagePath || null,
          trailerPackagePath: entry.trailerPackagePath || null,
          videoPackagePath: entry.videoPackagePath || null,
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

  function handleDownloadMusicCuePackage(entry, e) {
    e.stopPropagation();
    if (!entry.musicCuePackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/music-cue-package`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-music-cue-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Music cue package downloaded.', 'success');
  }

  function handleDownloadSeriesPackage(entry, e) {
    e.stopPropagation();
    if (!entry.seriesPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/series-package`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-series-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Series package downloaded.', 'success');
  }

  function handleDownloadVideoPackage(entry, e) {
    e.stopPropagation();
    if (!entry.videoPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/video-package`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-video-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Video package downloaded.', 'success');
  }

  function handleDownloadScreenplay(entry, e) {
    e.stopPropagation();
    if (!entry.screenplayPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/screenplay`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-screenplay.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Screenplay downloaded.', 'success');
  }

  function handleDownloadDirectorBrief(entry, e) {
    e.stopPropagation();
    if (!entry.directorBriefPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/director-brief`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-director-brief.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Director brief downloaded.', 'success');
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

  function handleDownloadAgentWorkflowPackage(entry, e) {
    e.stopPropagation();
    if (!entry.agentWorkflowPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/agent-workflow-package`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-agent-workflow-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Agent workflow package downloaded.', 'success');
  }

  function handleDownloadProductionRunManifest(entry, e) {
    e.stopPropagation();
    if (!entry.productionRunManifestPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${entry.jobId}/production-run-manifest`;
    a.download = `${(entry.title || entry.jobId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-production-run-manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Production run manifest downloaded.', 'success');
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

      <div class="history-filters" role="search">
        <input
          id="history-search"
          type="search"
          class="history-search"
          placeholder="Search title or tag…"
          value=${query}
          onInput=${(e) => setQuery(e.target.value)}
          aria-label="Search history by title or tag"
        />
        <select
          id="history-goal-filter"
          class="history-goal-filter"
          value=${projectGoal}
          onChange=${(e) => setProjectGoal(e.target.value)}
          aria-label="Filter by project goal"
        >
          <option value="">All goals</option>
          <option value="comic">Comic</option>
          <option value="screen">Screen / Show</option>
          <option value="music">Music-first</option>
          <option value="studio">Studio balance</option>
        </select>
        <label class="history-fav-toggle" title="Show only starred comics">
          <input
            type="checkbox"
            checked=${favoritesOnly}
            onChange=${(e) => setFavoritesOnly(e.target.checked)}
          />
          <span>★ Favorites only</span>
        </label>
        ${(query || projectGoal || favoritesOnly) ? html`
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick=${() => { setQuery(''); setProjectGoal(''); setFavoritesOnly(false); }}
          >Clear filters</button>
        ` : null}
      </div>

      ${history.length === 0 && (query || projectGoal || favoritesOnly) ? html`
        <div class="empty-state">
          <h3>No matches</h3>
          <p>No comics match your current filters. Try clearing them.</p>
        </div>
      ` : history.length === 0 ? html`
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
                ${entry.coverImagePath ? html`
                  <img
                    class="history-cover-img"
                    src=${`/api/comic/${entry.jobId}/cover`}
                    alt=${`${entry.title || 'Comic'} cover`}
                    loading="lazy"
                  />
                ` : null}
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
                ${(entry.tags && entry.tags.length > 0) || editingTags === entry.jobId ? html`
                  <div class="history-tags">
                    ${(entry.tags || []).map((tag) => html`
                      <span key=${tag} class="history-tag">#${tag}</span>
                    `)}
                    ${editingTags === entry.jobId ? html`
                      <input
                        type="text"
                        class="history-tag-input"
                        placeholder="comma,separated,tags"
                        value=${tagInput}
                        onInput=${(e) => setTagInput(e.target.value)}
                        onKeyDown=${(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveTags(entry, tagInput); }
                          if (e.key === 'Escape') { setEditingTags(null); setTagInput(''); }
                        }}
                        autofocus
                      />
                      <button
                        type="button"
                        class="btn btn-ghost btn-sm"
                        onClick=${(e) => { e.stopPropagation(); saveTags(entry, tagInput); }}
                      >Save</button>
                    ` : html`
                      <button
                        type="button"
                        class="history-tag-edit"
                        onClick=${(e) => {
                          e.stopPropagation();
                          setEditingTags(entry.jobId);
                          setTagInput((entry.tags || []).join(', '));
                        }}
                        title="Edit tags"
                      >+ tag</button>
                    `}
                  </div>
                ` : html`
                  <button
                    type="button"
                    class="history-tag-add"
                    onClick=${(e) => {
                      e.stopPropagation();
                      setEditingTags(entry.jobId);
                      setTagInput('');
                    }}
                    title="Add tags"
                  >+ tag</button>
                `}
              </div>
              <button
                type="button"
                class=${'history-fav' + (entry.favorite ? ' is-fav' : '')}
                onClick=${(e) => { e.stopPropagation(); toggleFavorite(entry); }}
                title=${entry.favorite ? 'Unstar' : 'Star this comic'}
                aria-label=${entry.favorite ? 'Unstar comic' : 'Star comic'}
                aria-pressed=${entry.favorite ? 'true' : 'false'}
              >${entry.favorite ? '★' : '☆'}</button>
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
                ${entry.agentWorkflowPackagePath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadAgentWorkflowPackage(entry, e)}
                    title="Download the Hermes/OpenClaw workflow package for this history item"
                  >Workflow</button>
                ` : null}
                ${entry.productionRunManifestPath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadProductionRunManifest(entry, e)}
                    title="Download the MiniMax production run manifest for this history item"
                  >Run</button>
                ` : null}
                ${entry.musicCuePackagePath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadMusicCuePackage(entry, e)}
                    title="Download the music cue package for this history item"
                  >Music</button>
                ` : null}
                ${entry.seriesPackagePath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadSeriesPackage(entry, e)}
                    title="Download the episodic series package for this history item"
                  >Series</button>
                ` : null}
                ${entry.videoPackagePath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadVideoPackage(entry, e)}
                    title="Download the MiniMax-ready video package for this history item"
                  >Video</button>
                ` : null}
                ${entry.screenplayPath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadScreenplay(entry, e)}
                    title="Download the screenplay for this history item"
                  >Script</button>
                ` : null}
                ${entry.directorBriefPath ? html`
                  <button
                    type="button"
                    onClick=${(e) => handleDownloadDirectorBrief(entry, e)}
                    title="Download the director brief for this history item"
                  >Brief</button>
                ` : null}
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
