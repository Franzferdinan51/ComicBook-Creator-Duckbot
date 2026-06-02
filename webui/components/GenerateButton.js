/**
 * GenerateButton — POSTs to /api/comic, polls /api/comic/:jobId, shows progress.
 * Renders the "Generate" button (or a disabled "Generating…" panel while a job runs).
 *
 * Props:
 *   story:     string
 *   options:   Partial<ComicOptions>
 *   onDone:    (result: ComicResult, jobId: string) => void
 *   onError:   (err: Error) => void
 *   externalJobId: optional — if set, the button is in "watching existing job" mode
 */

import { useState, useEffect, useRef } from 'https://esm.sh/preact@10/hooks';
import { html, api, sleep, showToast } from './_lib.js';

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_TICKS = 180;     // 3 minutes
const STAGES = [
  'Generating script',
  'Creating panel art',
  'Assembling PDF',
];

export function GenerateButton({ story, options = {}, onDone, onError, externalJobId }) {
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(externalJobId || null);
  const [stageIdx, setStageIdx] = useState(0);
  const [progressPct, setProgressPct] = useState(0);
  const [error, setError] = useState(null);
  const cancelRef = useRef(false);

  const tooShort = !story || story.trim().length < 3;

  // Cancel polling on unmount.
  useEffect(() => {
    return () => { cancelRef.current = true; };
  }, []);

  // Watch an externally-supplied job (e.g. the result page reloading an old job).
  useEffect(() => {
    if (externalJobId && externalJobId !== jobId) {
      setJobId(externalJobId);
      pollLoop(externalJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalJobId]);

  async function pollLoop(jid) {
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setProgressPct(0);
    setStageIdx(0);

    let lastUpdate = 0;
    for (let i = 0; i < POLL_MAX_TICKS; i++) {
      if (cancelRef.current) return;
      await sleep(POLL_INTERVAL_MS);
      if (cancelRef.current) return;

      let data;
      try {
        data = await api(`/api/comic/${jid}`);
      } catch (err) {
        setError(err.message);
        setLoading(false);
        onError && onError(err);
        return;
      }

      if (data.status === 'done') {
        setProgressPct(100);
        setStageIdx(STAGES.length - 1);
        setLoading(false);
        onDone && onDone(data.result, jid);
        return;
      }
      if (data.status === 'error') {
        const err = new Error(data.error || 'Generation failed');
        setError(err.message);
        setLoading(false);
        showToast(err.message, 'error');
        onError && onError(err);
        return;
      }

      // While pending, advance a stage every ~6 seconds (18 ticks / 3 stages).
      const stage = Math.min(Math.floor(i / 6), STAGES.length - 1);
      // Bump progress smoothly between 0-95% while pending; jump to 100 on done.
      const pct = Math.min(95, Math.round((i / POLL_MAX_TICKS) * 100));
      const now = Date.now();
      if (now - lastUpdate > 200) {        // throttle state updates
        setStageIdx(stage);
        setProgressPct(pct);
        lastUpdate = now;
      }
    }

    const err = new Error('Timed out waiting for comic to finish.');
    setError(err.message);
    setLoading(false);
    onError && onError(err);
  }

  async function handleGenerate() {
    if (tooShort) {
      showToast('Story must be at least 3 characters.', 'error');
      return;
    }
    setError(null);
    try {
      const { jobId: newId } = await api('/api/comic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, options }),
      });
      setJobId(newId);
      pollLoop(newId);
    } catch (err) {
      setError(err.message);
      showToast(err.message, 'error');
      onError && onError(err);
    }
  }

  // Cmd/Ctrl + Enter shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !loading && !tooShort) {
        e.preventDefault();
        handleGenerate();
      }
      if (e.key === 'Escape' && loading) {
        // Soft cancel: just stop polling. The server keeps running the job.
        cancelRef.current = true;
        setLoading(false);
        showToast('Stopped watching the job. It will finish in the background.', 'info');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, options, loading, tooShort]);

  return html`
    <section class="panel" aria-labelledby="generate-title">
      <header class="panel-title">
        <h2 id="generate-title">Generate</h2>
      </header>

      ${loading ? html`
        <div class="progress-wrap" role="status" aria-live="polite">
          <div class="progress-label">
            <span>${STAGES[stageIdx]}…</span>
            <span>${progressPct}%</span>
          </div>
          <div class="progress-bar" aria-hidden="true">
            <div class="progress-fill" style=${{ width: `${progressPct}%` }}></div>
          </div>
          <div class="progress-stages">
            ${STAGES.map((s, i) => html`
              <span
                key=${s}
                class=${'stage' + (i === stageIdx ? ' active' : i < stageIdx ? ' done' : '')}
              >
                ${i < stageIdx ? '✓' : i === stageIdx ? '●' : '○'} ${s}
              </span>
            `)}
          </div>
        </div>
        <button class="btn btn-full" type="button" disabled>
          <span class="spinner" aria-hidden="true"></span>
          Generating…
        </button>
        <p class="muted small">Press Esc to stop watching (the job will keep running).</p>
      ` : html`
        <button
          class="btn btn-full generate-btn"
          type="button"
          disabled=${tooShort}
          onClick=${handleGenerate}
          title=${tooShort ? 'Write a story first (at least 3 characters).' : 'Generate (⌘ + Enter)'}
        >
          ✨ Generate Comic
        </button>
        <p class="muted small hint">${tooShort ? 'Write a story first.' : 'Shortcut: ⌘ + Enter'}</p>
      `}

      ${error ? html`<p class="error-text" role="alert">⚠ ${error}</p>` : null}
    </section>
  `;
}
