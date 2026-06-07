/**
 * ResultPanel — renders a finished comic: PDF preview (via pdf.js), page
 * thumbnails, a download button, and a "Regenerate with new options" button.
 *
 * Props:
 *   result:  ComicResult  (the value of GET /api/comic/:jobId when status=done)
 *   jobId:   string
 *   onRegenerate: (newJobId: string) => void
 *   onClose: () => void
 *   onOpenMovie: () => void
 *
 * pdf.js is loaded lazily on first mount — the script tag is appended once,
 * cached, and reused across re-mounts.
 */

import { useState, useEffect, useRef } from 'https://esm.sh/preact@10/hooks';
import { html, api, showToast } from './_lib.js';

const PROJECT_GOAL_LABELS = {
  comic: 'Comic',
  screen: 'Screen',
  music: 'Music',
  studio: 'Studio',
};

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

export function ResultPanel({ result, jobId, onRegenerate, onClose, onOpenMovie }) {
  const [page, setPage] = useState(1);
  const [readerPage, setReaderPage] = useState(1);
  const [readerMode, setReaderMode] = useState('pages');
  const [totalPages, setTotalPages] = useState(0);
  const [pdfError, setPdfError] = useState(null);
  const [thumbs, setThumbs] = useState([]); // array of { dataUrl, page }
  const [regenLoading, setRegenLoading] = useState(false);
  const [downloadingImages, setDownloadingImages] = useState(false);
  // Production-run state: `idle` (no run started), `planning`
  // (dry-run requested), `running` (real run in flight), `done`
  // (last run finished), `error` (last run errored).
  const [prodRunStatus, setProdRunStatus] = useState('idle');
  const [prodRunId, setProdRunId] = useState(null);
  const [prodRunReport, setProdRunReport] = useState(null);
  const [prodRunError, setProdRunError] = useState(null);
  const [prodRunDryRun, setProdRunDryRun] = useState(true);
  // Format selector for the primary download button. Persists per session
  // (kept in component state — not URL state) so refreshing the page
  // resets to PDF.
  const [downloadFormat, setDownloadFormat] = useState('pdf');
  // Bump this to force the PDF-fetch effect to re-run (used by the
  // "Try again" button on the error state). Useful when the user
  // hits a transient failure — e.g. server restart wiped the
  // in-memory job, then the history-fallback fix kicked in and the
  // same jobId is now retrievable again.
  const [reloadKey, setReloadKey] = useState(0);
  const panelRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    setPage(1);
    setReaderPage(1);
    setReaderMode('pages');
  }, [jobId]);

  useEffect(() => {
    if (!result || !panelRef.current) return;
    panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result, jobId]);

  // Render the currently-selected page into the main canvas.
  useEffect(() => {
    if (!result || !jobId || readerMode !== 'pdf') return;
    let cancelled = false;
    let doc;

    // Clear the previous error so the spinner/canvas re-renders cleanly
    // on a retry (otherwise an old error stays visible until the new
    // load finishes).
    setPdfError(null);
    setTotalPages(0);
    setThumbs([]);

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
  }, [result, jobId, reloadKey, readerMode]);

  // Add keyboard nav for pages once totalPages is known.
  useEffect(() => {
    if (totalPages <= 1) return;
    function onKey(e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [totalPages]);
  useEffect(() => {
    if (!result || !jobId || totalPages === 0 || readerMode !== 'pdf') return;
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
  }, [page, readerMode]);

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

  // Public share card URL — anyone with this link can read the comic's
  // metadata, project bundles, and artifact links (no auth, but no
  // secrets either). Useful for dropping in chat, docs, or static sites.
  function copyShareLink() {
    const url = `${window.location.origin}/api/share/${jobId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url)
        .then(() => showToast('Share link copied!', 'success'))
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

  function downloadJsonArtifact(filenameSuffix, payload, successMessage) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localSlug(result.script?.title)}-${filenameSuffix}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    showToast(successMessage, 'success');
  }

  function handleDownloadProject() {
    if (!result?.project) return;
    if (result?.projectPath) {
      const a = document.createElement('a');
      a.href = `/api/comic/${jobId}/project`;
      a.download = `${localSlug(result.script?.title)}-project.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Project JSON downloaded.', 'success');
      return;
    }
    downloadJsonArtifact('project', result.project, 'Project JSON downloaded.');
  }

  function handleDownloadScreenplay() {
    if (!result?.screenplayPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/screenplay`;
    a.download = `${localSlug(result.script?.title)}-screenplay.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Screenplay downloaded.', 'success');
  }

  function handleDownloadDirectorBrief() {
    if (!result?.directorBriefPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/director-brief`;
    a.download = `${localSlug(result.script?.title)}-director-brief.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Director brief downloaded.', 'success');
  }

  function handleDownloadAdaptation() {
    if (!result?.adaptationPackage) return;
    downloadJsonArtifact('adaptation', result.adaptationPackage, 'Adaptation outline downloaded.');
  }

  function handleDownloadVideoPackage() {
    if (!result?.videoPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/video-package`;
    a.download = `${localSlug(result.script?.title)}-video-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Video package downloaded.', 'success');
  }

  function handleDownloadTrailerPackage() {
    if (!result?.trailerPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/trailer-package`;
    a.download = `${localSlug(result.script?.title)}-trailer-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Trailer package downloaded.', 'success');
  }

  function handleDownloadMusic() {
    if (!result?.musicCuePackage) return;
    if (result?.musicCuePackagePath) {
      const a = document.createElement('a');
      a.href = `/api/comic/${jobId}/music-cue-package`;
      a.download = `${localSlug(result.script?.title)}-music-cue-package.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Music cue package downloaded.', 'success');
      return;
    }
    downloadJsonArtifact('music', result.musicCuePackage, 'Music cue package downloaded.');
  }

  function handleDownloadSeriesPackage() {
    if (!result?.seriesPackage) return;
    if (result?.seriesPackagePath) {
      const a = document.createElement('a');
      a.href = `/api/comic/${jobId}/series-package`;
      a.download = `${localSlug(result.script?.title)}-series-package.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Series package downloaded.', 'success');
      return;
    }
    downloadJsonArtifact('series-package', result.seriesPackage, 'Series package downloaded.');
  }

  function handleDownloadSongSheet() {
    if (!result?.songSheetPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/song-sheet`;
    a.download = `${localSlug(result.script?.title)}-song-sheet.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Song sheet downloaded.', 'success');
  }

  function handleDownloadStoryboardPackage() {
    if (!result?.storyboardPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/storyboard-package`;
    a.download = `${localSlug(result.script?.title)}-storyboard-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Storyboard package downloaded.', 'success');
  }

  function handleDownloadAnimaticTimeline() {
    if (!result?.animaticTimelinePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/animatic-timeline`;
    a.download = `${localSlug(result.script?.title)}-animatic-timeline.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Animatic timeline downloaded.', 'success');
  }

  function handleDownloadStudioBundle() {
    if (!result?.project) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/studio-bundle`;
    a.download = `${localSlug(result.script?.title)}-studio-bundle.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Studio bundle downloaded.', 'success');
  }

  function handleDownloadAgentWorkflowPackage() {
    if (!result?.agentWorkflowPackagePath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/agent-workflow-package`;
    a.download = `${localSlug(result.script?.title)}-agent-workflow-package.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Agent workflow package downloaded.', 'success');
  }

  function handleDownloadProductionRunManifest() {
    if (!result?.productionRunManifestPath) return;
    const a = document.createElement('a');
    a.href = `/api/comic/${jobId}/production-run-manifest`;
    a.download = `${localSlug(result.script?.title)}-production-run-manifest.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Production run manifest downloaded.', 'success');
  }

  // Run the production manifest. Two modes:
  //   - dryRun=true  → plan everything, don't actually call mmx
  //   - dryRun=false → actually invoke mmx music generate + mmx video
  //                    generate (async) + poll + download
  // In both modes the server returns 202 with a runId; we poll until
  // the run is done or errored, then render the phase status inline.
  async function handleRunProduction() {
    if (!jobId) return;
    if (!result?.musicCuePackage || !result?.videoPackage) {
      showToast('This comic has no music/video package — re-run with project-goal=screen or studio.', 'error');
      return;
    }
    setProdRunError(null);
    setProdRunReport(null);
    setProdRunStatus(prodRunDryRun ? 'planning' : 'running');
    try {
      const res = await fetch(`/api/comic/${jobId}/run-production`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: prodRunDryRun }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const { runId } = await res.json();
      setProdRunId(runId);
      showToast(
        prodRunDryRun ? 'Production run planned. Polling for report...' : 'Production run started. Polling for status...',
        'info'
      );
      // Poll until the run is done or errored.
      const start = Date.now();
      const timeoutMs = 30 * 60 * 1000; // 30 min hard cap
      while (Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 1500));
        const r = await fetch(`/api/production-run/${runId}`);
        if (!r.ok) {
          if (r.status === 404) throw new Error(`run ${runId} not found`);
          continue;
        }
        const rec = await r.json();
        if (rec.status === 'done') {
          setProdRunReport(rec.report);
          setProdRunStatus('done');
          showToast(
            prodRunDryRun
              ? 'Production plan ready — see report below.'
              : 'Production run complete. Report + artifacts saved.',
            'success'
          );
          return;
        }
        if (rec.status === 'error') {
          setProdRunError(rec.error || 'unknown error');
          setProdRunStatus('error');
          showToast(`Production run errored: ${rec.error}`, 'error');
          return;
        }
      }
      throw new Error('Timed out waiting for production run to finish.');
    } catch (err) {
      setProdRunError(err.message);
      setProdRunStatus('error');
      showToast(`Production run failed: ${err.message}`, 'error');
    }
  }

  function handleDownloadAgentGuidance() {
    if (result?.agentGuidancePath) {
      const a = document.createElement('a');
      a.href = `/api/comic/${jobId}/agent-guidance`;
      a.download = `${localSlug(result.script?.title)}-agent-guidance.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Agent guidance downloaded.', 'success');
      return;
    }
    if (!result?.agentGuidancePackage) return;
    const blob = new Blob([JSON.stringify(result.agentGuidancePackage, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${localSlug(result.script?.title)}-agent-guidance.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    showToast('Agent guidance downloaded.', 'success');
  }

  function handleDownloadAgentPlaybook() {
    const a = document.createElement('a');
    a.href = '/api/agent-playbook';
    a.download = 'hermes-openclaw-playbook.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Agent playbook downloaded.', 'success');
  }

  function themeAudioExtension() {
    const path = String(result?.songAudioPath || '').toLowerCase();
    if (path.endsWith('.mp3')) return 'mp3';
    if (path.endsWith('.wav')) return 'wav';
    return 'bin';
  }

  if (!result) return null;

  const title = result.script?.title || 'Comic ready';
  const artStyle = result.script?.artStyle || '—';
  const pageCount = result.script?.pages?.length || 0;
  const outputProfile = result.project?.renderProfile?.outputProfile || 'comic-print';
  const projectGoal = result.project?.projectGoal || 'comic';
  const projectGoalLabel = PROJECT_GOAL_LABELS[projectGoal] || projectGoal;
  const panelCount = (result.script?.pages || []).reduce(
    (acc, p) => acc + (p.panels?.length || 0), 0
  );
  const readerPages = (result.script?.pages || []).map((p) => ({
    pageNumber: p.pageNumber,
    layout: p.layout,
    panels: (p.panels || []).map((panel, index) => ({
      ...panel,
      panelIndex: index,
      imageUrl: jobId ? `/api/comic/${jobId}/images/${encodeURIComponent(panel.id)}` : null,
    })),
  }));
  const currentReaderPage = readerPages[
    Math.min(Math.max(readerPage - 1, 0), Math.max(readerPages.length - 1, 0))
  ];

  // Format availability — the server pre-renders BOTH formats at job
  // completion time, so both should normally be available. The fields
  // are nullable for legacy jobs that pre-date the dual-format field,
  // in which case we fall back to `outputPath` and guess by extension.
  const hasPdf = !!(result.pdfPath || (result.outputPath && /\.pdf$/i.test(result.outputPath)));
  const hasCbz = !!(result.cbzPath || (result.outputPath && /\.cbz$/i.test(result.outputPath)));
  // Title-based slug for the download filename attribute. Matches the
  // server's slugifyFilename() so the saved file name is the same on
  // both ends.
  const titleSlug = localSlug(title);

  return html`
    <section class="panel result-panel" aria-labelledby="result-title" ref=${panelRef}>
      <header class="panel-title">
        <h2 id="result-title">✅ ${title}</h2>
        ${onClose ? html`
          <button class="btn-ghost close-btn" type="button" onClick=${onClose} aria-label="Close result">✕</button>
        ` : null}
      </header>

      <div class="result-meta">
        <span class="badge">${artStyle}</span>
        <span class="badge">Goal: ${projectGoalLabel}</span>
        <span>${pageCount} pages</span>
        <span>${panelCount} panels</span>
        <span>${outputProfile}</span>
        ${result.fromHistory ? html`<span class="badge warn-badge" title="Loaded from history — cannot regenerate">📜 from history</span>` : null}
      </div>

      <div class="result-actions result-actions-top" role="group" aria-label="Download and share">
        <div class="format-selector" role="group" aria-label="Download format">
          <button
            type="button"
            class=${'format-chip' + (downloadFormat === 'pdf' ? ' active' : '')}
            onClick=${() => setDownloadFormat('pdf')}
            title="Download as a printable PDF document"
            disabled=${!hasPdf}
          >
            📄 PDF
          </button>
          <button
            type="button"
            class=${'format-chip' + (downloadFormat === 'cbz' ? ' active' : '')}
            onClick=${() => setDownloadFormat('cbz')}
            title="Download as a CBZ (zip of panel images — works in YACReader, Komga, CDisplay)"
            disabled=${!hasCbz}
          >
            📚 CBZ
          </button>
        </div>

        <a
          class="btn btn-primary btn-lg"
          href=${downloadFormat === 'cbz' && hasCbz
            ? `/api/comic/${jobId}/cbz`
            : `/api/comic/${jobId}/pdf`}
          download=${downloadFormat === 'cbz' && hasCbz ? `${titleSlug}.cbz` : `${titleSlug}.pdf`}
        >
          📥 Download ${downloadFormat.toUpperCase()}
        </a>

        <a
          class="btn btn-ghost"
          href=${downloadFormat === 'cbz' && hasCbz
            ? `/api/comic/${jobId}/cbz`
            : `/api/comic/${jobId}/pdf`}
          target="_blank"
          rel="noopener"
        >👁 Open in new tab</a>

        <button class="btn btn-ghost" type="button" onClick=${copyLink}>
          🔗 Copy link
        </button>

        <button class="btn btn-ghost" type="button" onClick=${copyShareLink} title="Copy a public share-card link (no auth, metadata only)">
          🌐 Copy share link
        </button>

        ${onOpenMovie ? html`
          <button
            class="btn btn-ghost"
            type="button"
            onClick=${onOpenMovie}
            title="Open the Movie / Show adaptation workspace"
          >
            🎬 Open Movie / Show board
          </button>
        ` : null}

        <button
          class="btn btn-ghost"
          type="button"
          disabled=${regenLoading || !!result.fromHistory}
          onClick=${handleRegenerate}
        >
          ${regenLoading
            ? html`<span class="spinner" aria-hidden="true"></span> Starting…`
            : (result.fromHistory
                ? html`<span class="muted small">↻ Cannot regenerate — job loaded from history</span>`
                : '↻ Regenerate with new options')}
        </button>
        ${result.fromHistory ? html`
          <span class="badge warn-badge" title="This comic was loaded from history — the live server job expired. You can still download the PDF but cannot regenerate it.">
            📜 from history
          </span>
        ` : null}
      </div>

      ${result.coverImagePath ? html`
        <div class="cover-preview-wrap">
          <p class="cover-preview-label">Cover / Title Page</p>
          <img
            class="cover-preview-img"
            src=${`/api/comic/${jobId}/cover`}
            alt="Cover illustration for ${title}"
          />
          <div class="cover-preview-actions">
            <a
              class="btn btn-ghost btn-sm"
              href=${`/api/comic/${jobId}/cover`}
              download=${`${titleSlug}-cover.jpg`}
              title="Download the cover image"
            >
              📷 Download cover
            </a>
          </div>
        </div>
      ` : null}

      <div class="reader-shell">
        <div class="reader-toolbar">
          <div>
            <p class="reader-eyebrow">Comic Reader</p>
            <h3>Read the generated comic pages</h3>
          </div>
          <div class="reader-mode-tabs" role="tablist" aria-label="Comic preview mode">
            <button
              type="button"
              role="tab"
              aria-selected=${readerMode === 'pages'}
              class=${'reader-mode-tab' + (readerMode === 'pages' ? ' active' : '')}
              onClick=${() => setReaderMode('pages')}
            >Panel pages</button>
            <button
              type="button"
              role="tab"
              aria-selected=${readerMode === 'pdf'}
              class=${'reader-mode-tab' + (readerMode === 'pdf' ? ' active' : '')}
              onClick=${() => setReaderMode('pdf')}
            >PDF preview</button>
          </div>
        </div>

        ${readerMode === 'pages' ? html`
          ${currentReaderPage ? html`
            <div class=${'comic-page-reader layout-' + currentReaderPage.layout}>
              <div class="comic-page-reader-head">
                <span>Page ${currentReaderPage.pageNumber} of ${readerPages.length}</span>
                <span>${currentReaderPage.layout || 'comic layout'}</span>
              </div>
              <div class="comic-panel-grid">
                ${currentReaderPage.panels.map((panel) => html`
                  <article class="comic-panel-frame" key=${panel.id}>
                    ${panel.imageUrl ? html`
                      <a href=${panel.imageUrl} target="_blank" rel="noopener" title=${panel.description || panel.id}>
                        <img src=${panel.imageUrl} alt=${panel.description || `Panel ${panel.panelIndex + 1}`} loading="lazy" />
                      </a>
                    ` : null}
                    <div class="comic-panel-caption">
                      <strong>${panel.id}</strong>
                      ${panel.caption ? html`<span>${panel.caption}</span>` : null}
                      ${panel.dialogue?.length ? html`<span>${panel.dialogue.join(' / ')}</span>` : null}
                    </div>
                  </article>
                `)}
              </div>
              ${readerPages.length > 1 ? html`
                <div class="page-nav reader-page-nav">
                  <button
                    type="button"
                    class="btn-ghost"
                    disabled=${readerPage <= 1}
                    onClick=${() => setReaderPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous comic page"
                  >‹ Prev</button>
                  <span>Page ${readerPage} of ${readerPages.length}</span>
                  <button
                    type="button"
                    class="btn-ghost"
                    disabled=${readerPage >= readerPages.length}
                    onClick=${() => setReaderPage((p) => Math.min(readerPages.length, p + 1))}
                    aria-label="Next comic page"
                  >Next ›</button>
                </div>
              ` : null}
            </div>
          ` : html`
            <div class="empty-state reader-empty">
              <h3>No comic page data found</h3>
              <p>The PDF and downloads may still be available, but the script did not include readable page data.</p>
            </div>
          `}
        ` : null}

        ${readerMode === 'pdf' ? html`
          ${pdfError ? html`
            <div class="error-state" role="alert">
              <p>Could not render PDF preview: <code>${pdfError}</code></p>
              <p>The panel-page reader does not need pdf.js and remains available for viewing the comic.</p>
              <div class="error-state-actions">
                <button
                  type="button"
                  class="btn btn-ghost"
                  onClick=${() => setReloadKey((k) => k + 1)}
                  title="Re-fetch the PDF and re-parse the preview"
                >
                  ↻ Try preview again
                </button>
                <a
                  class="btn btn-ghost"
                  href=${`/api/comic/${jobId}/pdf`}
                  target="_blank"
                  rel="noopener"
                >Open PDF in a new tab</a>
              </div>
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
        ` : null}
      </div>

      <div class="artifact-grid">
        <section class="panel artifact-panel">
          <h3>Project Assets</h3>
          <p>Goal: <strong>${projectGoalLabel}</strong></p>
          <p>Profile: <strong>${outputProfile}</strong></p>
          <p>${result.storyBible?.chapterOutline?.length || 0} outline beats prepared.</p>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadProject}>
            Download project JSON
          </button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStudioBundle}>
            Download studio bundle
          </button>
          ${result.agentWorkflowPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentWorkflowPackage}>
              Download agent workflow package
            </button>
          ` : null}
          ${result.productionRunManifestPath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadProductionRunManifest}>
              Download production run manifest
            </button>
          ` : null}
          ${(result.musicCuePackage && result.videoPackage) ? html`
            <div class="prod-run-controls">
              <label class="prod-run-toggle">
                <input
                  type="checkbox"
                  checked=${prodRunDryRun}
                  onChange=${(e) => setProdRunDryRun(e.currentTarget.checked)}
                />
                <span>Plan only (dry-run, no real mmx calls)</span>
              </label>
              <button
                class="btn btn-primary btn-sm"
                type="button"
                onClick=${handleRunProduction}
                disabled=${prodRunStatus === 'planning' || prodRunStatus === 'running'}
              >
                ${prodRunStatus === 'planning' || prodRunStatus === 'running'
                  ? html`<span class="spinner" /> ${prodRunDryRun ? 'Planning…' : 'Running…'}`
                  : html`Run production ${prodRunDryRun ? '(plan only)' : 'against MiniMax'}`}
              </button>
            </div>
            ${prodRunReport ? html`
              <div class="prod-run-report">
                <h4>Production run report</h4>
                <p class="prod-run-meta">
                  ${prodRunReport.dryRun ? 'Dry run' : 'Real run'} —
                  ${prodRunReport.phases?.length || 0} phases,
                  ${prodRunReport.taskIds?.length || 0} mmx task ids,
                  ${prodRunReport.files?.length || 0} files
                </p>
                <ul class="prod-run-phases">
                  ${(prodRunReport.phases || []).map((p) => html`
                    <li>
                      <span class="phase-id">${p.phaseId}</span>
                      <span class="phase-status phase-status-${p.status}">${p.status}</span>
                      ${p.error ? html`<span class="phase-error">${p.error}</span>` : null}
                    </li>
                  `)}
                </ul>
                <a
                  class="btn btn-ghost btn-sm"
                  href=${`/api/comic/${jobId}/production-run-report`}
                  target="_blank"
                  rel="noopener"
                >View full report JSON</a>
              </div>
            ` : null}
            ${prodRunError ? html`
              <p class="prod-run-error">Error: ${prodRunError}</p>
            ` : null}
          ` : null}
        </section>

        <section class="panel artifact-panel">
          <h3>Adaptation</h3>
          <p>${result.adaptationPackage?.screenplayScenes?.length || result.adaptationPackage?.sceneOutline?.length || 0} screenplay scenes prepared.</p>
          ${result.screenplayPath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>
              Download screenplay
            </button>
          ` : null}
          ${result.directorBriefPath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>
              Download director brief
            </button>
          ` : null}
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAdaptation}>
            Download adaptation JSON
          </button>
          ${result.seriesPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSeriesPackage}>
              Download series package
            </button>
          ` : null}
          ${result.storyboardPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStoryboardPackage}>
              Download storyboard package
            </button>
          ` : null}
          ${result.videoPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadVideoPackage}>
              Download video package
            </button>
          ` : null}
          ${result.trailerPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadTrailerPackage}>
              Download trailer package
            </button>
          ` : null}
          ${result.animaticTimelinePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAnimaticTimeline}>
              Download animatic timeline
            </button>
          ` : null}
        </section>

        <section class="panel artifact-panel">
          <h3>Music</h3>
          <p>${result.musicCuePackage?.songDraft?.sections?.length || 0} song sections and ${result.musicCuePackage?.cues?.length || 0} cues prepared.</p>
          ${result.musicCuePackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadMusic}>
              Download music cue package
            </button>
          ` : null}
          ${result.songSheetPath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSongSheet}>
              Download song sheet
            </button>
          ` : null}
          ${result.songAudioPath ? html`
            <a class="btn btn-ghost btn-sm" href=${`/api/comic/${jobId}/theme-audio`} download=${`${titleSlug}-theme.${themeAudioExtension()}`}>
              Download theme audio
            </a>
          ` : null}
        </section>

        <section class="panel artifact-panel">
          <h3>Agents</h3>
          <p>${result.agentGuidancePackage?.externalInterfaces?.length || 0} agent interfaces prepared.</p>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentPlaybook}>
            Download agent playbook
          </button>
          ${result.agentWorkflowPackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentWorkflowPackage}>
              Download agent workflow package
            </button>
          ` : null}
          ${result.productionRunManifestPath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadProductionRunManifest}>
              Download production run manifest
            </button>
          ` : null}
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentGuidance}>
            Download agent guidance
          </button>
        </section>
      </div>

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

      ${/* Per-panel image strip — shows every generated panel image, so
         the user can verify the script said N panels and we actually
         generated N images. Clicking a panel opens the full-size
         version in a new tab. */''}
      ${(() => {
        const allPanels = (result.pages || []).flatMap((p) => {
          const list = (p.panelImagePaths && p.panelImagePaths.length > 0)
            ? p.panelImagePaths
            : (p.imagePath ? [p.imagePath] : []);
          return list.map((img, i) => ({
            pageNumber: p.page.pageNumber,
            panelIndex: i,
            panelId: p.page.panels[i]?.id || `p${p.page.pageNumber}-panel${i + 1}`,
            description: p.page.panels[i]?.description || '',
            imagePath: img,
          }));
        });
        if (allPanels.length === 0) return null;
        return html`
          <details class="panel-strip-wrap" open>
            <summary>${allPanels.length} panel image${allPanels.length === 1 ? '' : 's'} (click any to open full size)</summary>
            <div class="panel-strip">
              ${allPanels.map((pan) => {
                // Convert the absolute server path to the public URL the
                // server exposes for image downloads.
                const filename = pan.imagePath.split('/').pop();
                const url = `/api/comic/${jobId}/images/${pan.panelId}`;
                // Override the panelId lookup by using the panel's actual id
                // (server stores files as p1-panel1.jpg etc).
                return html`
                  <a
                    key=${pan.panelId}
                    class="panel-thumb"
                    href=${`/api/comic/${jobId}/images/${pan.panelId}`}
                    target="_blank"
                    rel="noopener"
                    title=${`Page ${pan.pageNumber} panel ${pan.panelIndex + 1}: ${pan.description.slice(0, 80)}${pan.description.length > 80 ? '…' : ''}`}
                  >
                    <img
                      src=${`/api/comic/${jobId}/images/${pan.panelId}`}
                      alt=${`Page ${pan.pageNumber} panel ${pan.panelIndex + 1}`}
                      loading="lazy"
                    />
                    <span class="panel-thumb-label">p${pan.pageNumber}·${pan.panelIndex + 1}</span>
                  </a>
                `;
              })}
            </div>
          </details>
        `;
      })()}
    </section>
  `;
}
