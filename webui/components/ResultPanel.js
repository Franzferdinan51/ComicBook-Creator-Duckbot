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

// ---------------------------------------------------------------------------
// buildStoreZip — minimal STORE-mode (uncompressed) ZIP writer.
//
// Each entry: local file header (30 + name bytes) + raw file data.
// Followed by a single central directory record per file (46 + name bytes)
// and a single EOCD record (22 bytes). No compression, no extra fields,
// no data descriptors, no zip64 — exactly what the server's CBZ assembler
// produces, and it round-trips through macOS / Windows / Linux unzip.
//
// Spec: https://pkwarefiles.azureedge.net/webdocs/casestudies/APPNOTE.TXT
// ---------------------------------------------------------------------------
function buildStoreZip(entries) {
  const enc = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = e.data;
    const crc = crc32(data);
    const size = data.length;
    // Local file header
    const lfh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, 0x04034b50, true);   // signature
    lv.setUint16(4, 20, true);            // version needed
    lv.setUint16(6, 0, true);             // flags
    lv.setUint16(8, 0, true);             // method = STORE
    lv.setUint16(10, 0, true);            // mod time
    lv.setUint16(12, 0x21, true);         // mod date (2000-01-01 placeholder)
    lv.setUint32(14, crc, true);          // CRC-32
    lv.setUint32(18, size, true);         // compressed size
    lv.setUint32(22, size, true);         // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);            // extra field length
    lfh.set(nameBytes, 30);
    localParts.push(lfh, data);
    // Central directory header
    const cdh = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);            // version made by
    cv.setUint16(6, 20, true);            // version needed
    cv.setUint16(8, 0, true);             // flags
    cv.setUint16(10, 0, true);            // method
    cv.setUint16(12, 0, true);            // mod time
    cv.setUint16(14, 0x21, true);         // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);            // extra field length
    cv.setUint16(32, 0, true);            // comment length
    cv.setUint16(34, 0, true);            // disk number
    cv.setUint16(36, 0, true);            // internal attrs
    cv.setUint32(38, 0, true);            // external attrs
    cv.setUint32(42, offset, true);       // local header offset
    cdh.set(nameBytes, 46);
    centralParts.push(cdh);
    offset += lfh.length + data.length;
  }
  // EOCD
  const cdSize = centralParts.reduce((n, p) => n + p.length, 0);
  const cdOffset = offset;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);              // disk number
  ev.setUint16(6, 0, true);              // start disk
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);             // comment length
  return concatBytes([...localParts, ...centralParts, eocd]);
}

function concatBytes(arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

// Standard CRC-32 (polynomial 0xEDB88320) — table-driven for speed.
let _crc32Table = null;
function crc32(buf) {
  if (!_crc32Table) {
    _crc32Table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      _crc32Table[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = _crc32Table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function ResultPanel({ result, jobId, onRegenerate, onClose }) {
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfError, setPdfError] = useState(null);
  const [thumbs, setThumbs] = useState([]); // array of { dataUrl, page }
  const [regenLoading, setRegenLoading] = useState(false);
  const [downloadingImages, setDownloadingImages] = useState(false);
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

  // Filename slug mirroring the server's slugifyFilename() so the
  // downloaded ZIP / JSON matches the PDF name.
  function localSlug(raw) {
    const slug = String(raw || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/, '');
    return slug || 'comic';
  }

  // Build a small ZIP of every page's panel images and trigger a download.
  // Done client-side to avoid streaming large base64 blobs back through the
  // server. Each entry is a STORE-mode (no compression) ZIP record; this
  // matches what the server's CBZ assembler produces and is fast for
  // already-compressed JPEGs/PNGs.
  async function handleDownloadAllImages() {
    if (!result || !jobId) return;
    const pages = result.script?.pages || [];
    if (pages.length === 0) {
      showToast('No pages to download.', 'error');
      return;
    }
    setDownloadingImages(true);
    try {
      // Fetch every panel image in parallel.
      const entries = [];
      await Promise.all(
        pages.map(async (p) => {
          for (let i = 0; i < p.panels.length; i++) {
            const panel = p.panels[i];
            const url = `/api/comic/${jobId}/images/${panel.id}`;
            const r = await fetch(url);
            if (!r.ok) continue;
            const buf = new Uint8Array(await r.arrayBuffer());
            const ext = (r.headers.get('content-type') || '').includes('jpeg') ? 'jpg' : 'png';
            entries.push({
              name: `page-${p.pageNumber}-panel-${i + 1}.${ext}`,
              data: buf,
            });
          }
        })
      );
      if (entries.length === 0) {
        showToast('No images were generated.', 'error');
        return;
      }
      const zipBytes = buildStoreZip(entries);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${localSlug(result.script?.title)}-pages.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      showToast(`Zipped ${entries.length} panel image(s).`, 'success');
    } catch (err) {
      showToast(`Download failed: ${err.message}`, 'error');
    } finally {
      setDownloadingImages(false);
    }
  }

  function handleDownloadScript() {
    if (!result || !result.script) return;
    const blob = new Blob([JSON.stringify(result.script, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localSlug(result.script.title)}-script.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    showToast('Script JSON downloaded.', 'success');
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

      <div class="result-actions result-actions-top" role="group" aria-label="Download and share">
        <a
          class="btn btn-primary btn-lg"
          href=${`/api/comic/${jobId}/pdf`}
          download
        >📥 Download PDF</a>

        <a
          class="btn btn-ghost"
          href=${`/api/comic/${jobId}/pdf`}
          target="_blank"
          rel="noopener"
        >👁 Open in new tab</a>

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

      ${pdfError ? html`
        <div class="error-state" role="alert">
          <p>Could not render PDF preview: <code>${pdfError}</code></p>
          <p>You can still download it above.</p>
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

      <div class="result-actions" role="group" aria-label="More actions">
        <button
          class="btn btn-ghost"
          type="button"
          disabled=${downloadingImages}
          onClick=${handleDownloadAllImages}
          title="Download every page as a ZIP of PNG/JPG files"
        >
          ${downloadingImages
            ? html`<span class="spinner" aria-hidden="true"></span> Zipping…`
            : '🖼 Download all pages (.zip)'}
        </button>

        <button
          class="btn btn-ghost"
          type="button"
          onClick=${handleDownloadScript}
          title="Download the underlying JSON script for this comic"
        >
          📝 Download script (.json)
        </button>
      </div>
    </section>
  `;
}
