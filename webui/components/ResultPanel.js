/**
 * ResultPanel — renders a finished comic: PDF preview (via pdf.js), page
 * thumbnails, a download button, and a "Regenerate with new options" button.
 *
 * Props:
 *   result:  ComicResult  (the value of GET /api/comic/:jobId when status=done)
 *   jobId:   string
 *   onRegenerate: (newJobId: string) => void
 *   onClose: () => void
 *
 * pdf.js is loaded lazily on first mount — the script tag is appended once,
 * cached, and reused across re-mounts.
 */

import { useState, useEffect, useRef } from 'https://esm.sh/preact@10/hooks';
import { html, api, showToast } from './_lib.js';

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/`;
const PDFJS_SCRIPT_SRC = `${PDFJS_BASE}pdf.min.js`;
const PDFJS_WORKER_SRC = `${PDFJS_BASE}pdf.worker.min.js`;
const RENDER_SCALE = 1.25;

// Promise that resolves when pdf.js is loaded (singleton).
let pdfJsLoadPromise = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfJsLoadPromise) return pdfJsLoadPromise;
  pdfJsLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_SCRIPT_SRC;
    s.async = true;
    s.onload = () => {
      if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_SRC;
      }
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('Failed to load pdf.js from CDN'));
    document.head.appendChild(s);
  });
  return pdfJsLoadPromise;
}

export function ResultPanel({ result, jobId, onRegenerate, onClose }) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfError, setPdfError] = useState(null);
  const [thumbs, setThumbs] = useState([]); // array of { dataUrl, page }
  const [regenLoading, setRegenLoading] = useState(false);
  const canvasRef = useRef(null);

  // Render the currently-selected page into the main canvas.
  useEffect(() => {
    if (!result || !jobId) return;
    let cancelled = false;
    let doc;

    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;

        const res = await fetch(`/api/comic/${jobId}/pdf`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        doc = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled) return;
        setTotalPages(doc.numPages);
        await renderPage(doc, Math.min(page, doc.numPages));
        if (cancelled) return;
        await renderThumbnails(doc);
      } catch (err) {
        if (!cancelled) setPdfError(err.message);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, jobId]);

  // Re-render when the user flips pages.
  useEffect(() => {
    if (!result || !jobId || totalPages === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        const res = await fetch(`/api/comic/${jobId}/pdf`);
        const buf = await res.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        if (cancelled) return;
        await renderPage(doc, page);
      } catch (err) {
        if (!cancelled) setPdfError(err.message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function renderPage(doc, num) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const p = await doc.getPage(num);
    const vp = p.getViewport({ scale: RENDER_SCALE });
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext('2d');
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
  }

  async function renderThumbnails(doc) {
    const out = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      const vp = p.getViewport({ scale: 0.25 });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      const ctx = c.getContext('2d');
      await p.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push({ dataUrl: c.toDataURL('image/png'), page: i });
    }
    setThumbs(out);
  }

  async function handleRegenerate() {
    if (!jobId) return;
    setRegenLoading(true);
    try {
      const { jobId: newId } = await api(`/api/comic/${jobId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),    // re-run with original options; App can prefill from history if desired
      });
      showToast('Regenerating with the same options…', 'info');
      onRegenerate && onRegenerate(newId);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRegenLoading(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/api/comic/${jobId}/pdf`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('PDF link copied!', 'success'))
        .catch(() => showToast('Could not copy. Long-press the link.', 'error'));
    } else {
      showToast('Clipboard API not available in this browser.', 'error');
    }
  }

  if (!result) return null;

  const title = result.script?.title || 'Comic ready';
  const artStyle = result.script?.artStyle || '—';
  const pageCount = result.script?.pages?.length || 0;
  const panelCount = (result.script?.pages || []).reduce(
    (acc, p) => acc + (p.panels?.length || 0), 0
  );

  return html`
    <section class="panel result-panel" aria-labelledby="result-title">
      <header class="panel-title">
        <h2 id="result-title">✅ ${title}</h2>
        ${onClose ? html`
          <button class="btn-ghost close-btn" type="button" onClick=${onClose} aria-label="Close result">✕</button>
        ` : null}
      </header>

      <div class="result-meta">
        <span class="badge">${artStyle}</span>
        <span>${pageCount} pages</span>
        <span>${panelCount} panels</span>
      </div>

      ${pdfError ? html`
        <div class="error-state" role="alert">
          <p>Could not render PDF preview: <code>${pdfError}</code></p>
          <p>You can still download it below.</p>
        </div>
      ` : null}

      <div class="pdf-viewer">
        <div class="pdf-canvas-wrap">
          <canvas ref=${canvasRef} aria-label="Comic page preview"></canvas>
        </div>
        ${totalPages > 1 ? html`
          <div class="page-nav">
            <button
              type="button"
              class="btn-ghost"
              disabled=${page <= 1}
              onClick=${() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >‹ Prev</button>
            <span>Page ${page} of ${totalPages}</span>
            <button
              type="button"
              class="btn-ghost"
              disabled=${page >= totalPages}
              onClick=${() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >Next ›</button>
          </div>
        ` : null}
      </div>

      ${thumbs.length > 1 ? html`
        <div class="thumb-strip" role="tablist" aria-label="Page thumbnails">
          ${thumbs.map((t) => html`
            <button
              key=${t.page}
              type="button"
              class=${'thumb-btn' + (t.page === page ? ' active' : '')}
              onClick=${() => setPage(t.page)}
              role="tab"
              aria-selected=${t.page === page}
              aria-label=${`Go to page ${t.page}`}
            >
              <img src=${t.dataUrl} alt=${`Page ${t.page} thumbnail`} class="thumb" />
            </button>
          `)}
        </div>
      ` : null}

      <div class="result-actions">
        <a
          class="btn"
          href=${`/api/comic/${jobId}/pdf`}
          download
          target="_blank"
          rel="noopener"
        >📥 Download PDF</a>

        <button class="btn btn-ghost" type="button" onClick=${copyLink}>
          🔗 Copy link
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          disabled=${regenLoading}
          onClick=${handleRegenerate}
        >
          ${regenLoading
            ? html`<span class="spinner" aria-hidden="true"></span> Starting…`
            : '↻ Regenerate with new options'}
        </button>
      </div>
    </section>
  `;
}
