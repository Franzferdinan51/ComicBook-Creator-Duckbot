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
const STALE_PROGRESS_TICKS = 180; // after this, keep polling but stop advancing progress
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
  // Wall-clock start time of the worker, returned by the server. Used to
  // compute an ETA by tracking elapsed time and how far through the
  // visual progress we are. Stays null while the job is still queued.
  const [startedAt, setStartedAt] = useState(null);
  // Number of seconds the worker has been running — used to render the
  // ETA line. Bumped from a 1s interval so it ticks even when the
  // server is slow to respond.
  const [elapsedSec, setElapsedSec] = useState(0);
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

  // Tick a 1s timer while loading so the ETA line updates even between polls.
  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return undefined;
    }
    const interval = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [loading]);

  async function pollLoop(jid) {
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setProgressPct(0);
    setStageIdx(0);
    setStartedAt(null);

    let lastUpdate = 0;
    for (let i = 0; !cancelRef.current; i++) {
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

      // Track the worker's start time so the ETA can compare elapsed to
      // progress. The first response usually has null (job still queued);
      // we keep polling until the server reports a startedAt.
      if (data.startedAt && !startedAt) {
        setStartedAt(data.startedAt);
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
      // Bump progress smoothly between 0-95% while pending; after a few
      // minutes stop advancing the bar, but keep polling until the job ends.
      const pct = i >= STALE_PROGRESS_TICKS
        ? 95
        : Math.min(95, Math.round((i / STALE_PROGRESS_TICKS) * 100));
      const now = Date.now();
      if (now - lastUpdate > 200) {        // throttle state updates
        setStageIdx(stage);
        setProgressPct(pct);
        lastUpdate = now;
      }
    }
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

  // Compute the ETA string. We need both `startedAt` (from the server)
  // and some real progress — anything before startedAt is just queue
  // time, which we don't count. After the worker starts, the visual
  // percentage is roughly the fraction of work done, so:
  //   eta_seconds ≈ (elapsed / progress_fraction) - elapsed
  // We only show the ETA once we have at least 8% of progress so the
  // first second doesn't display a wildly inflated estimate.
  let etaLabel = '';
  if (loading && startedAt && progressPct >= 8) {
    const elapsedMs = Date.now() - new Date(startedAt).getTime();
    const elapsedSec = Math.max(1, Math.floor(elapsedMs / 1000));
    const fraction = progressPct / 100;
    const totalSec = elapsedSec / fraction;
    const remainingSec = Math.max(0, Math.round(totalSec - elapsedSec));
    etaLabel = `~${formatDuration(remainingSec)} left`;
  } else if (loading) {
    // Worker hasn't started yet — show the elapsed "queue + run" time
    // so the user sees something moving.
    etaLabel = `${formatDuration(elapsedSec)} elapsed`;
  }

  return html`
    <section class="panel" aria-labelledby="generate-title">
      <header class="panel-title">
        <h2 id="generate-title">Generate</h2>
      </header>

      ${loading ? html`
        <div class="progress-wrap" role="status" aria-live="polite">
          <div class="progress-label">
            <span>${STAGES[stageIdx]}…</span>
            <span>${progressPct}%${etaLabel ? ` · ${etaLabel}` : ''}</span>
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
          Generating… ${etaLabel ? `· ${etaLabel}` : ''}
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

/** Human-friendly "1m 23s" / "47s" / "2h" formatter for the ETA line.
 *  Mirrors the one in Settings.js but lives here so this component is
 *  self-contained. */
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}
