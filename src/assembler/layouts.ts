/**
 * Pure layout helpers for the comic page assembler.
 *
 * These functions take a Page (or its panel count) and a page size,
 * and return the absolute rectangle (x, y, w, h) for each panel.
 *
 * No side effects, no I/O — easy to unit-test.
 */

import type { Page, PageLayout, Panel } from '../types.js';

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
  panelIndex: number;
}

export interface PageGeometry {
  width: number;
  height: number;
  panels: PanelRect[];
}

const DEFAULT_GAP = 8;

function squareGrid(
  panels: Panel[],
  pageWidth: number,
  pageHeight: number,
  margin: number,
  gap: number,
  cols: number
): PageGeometry {
  const n = panels.length;
  const rows = Math.max(1, Math.ceil(n / cols));
  const usableW = pageWidth - 2 * margin;
  const usableH = pageHeight - 2 * margin;
  const w = (usableW - gap * (cols - 1)) / cols;
  const h = (usableH - gap * (rows - 1)) / rows;
  const rects: PanelRect[] = [];
  panels.forEach((_panel: Panel, i: number) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    rects.push({
      x: margin + c * (w + gap),
      y: margin + r * (h + gap),
      w,
      h,
      panelIndex: i,
    });
  });
  return { width: pageWidth, height: pageHeight, panels: rects };
}

export function layoutPage(
  page: Page,
  pageWidth: number,
  pageHeight: number,
  margin: number,
  gap: number = DEFAULT_GAP
): PageGeometry {
  const explicit = page.layout as PageLayout | undefined;
  const n = page.panels.length;

  if (explicit === 'grid-2x2' || (!explicit && n === 4)) {
    return squareGrid(page.panels, pageWidth, pageHeight, margin, gap, 2);
  }
  if (explicit === 'grid-2x3' || (!explicit && n === 6)) {
    return squareGrid(page.panels, pageWidth, pageHeight, margin, gap, 2);
  }
  if (explicit === 'strip-3' || (!explicit && n === 3)) {
    // 3 panels in a row. Use a SQUARE cell aspect (1:1) so the
    // generated panel image (typically 1024x1024, 1408x768, 1:1, or
    // 16:9) fits the cell without being squished into a tall thin
    // strip. We compute the largest n-column row of squares that fits
    // the page width, then center the strip vertically with the
    // remaining height (which is used for the title bar).
    const cols = 3;
    const usableW = pageWidth - 2 * margin;
    const w = (usableW - gap * (cols - 1)) / cols;
    const h = w; // square cells
    // If the row is taller than the page (e.g. wide landscape page),
    // shrink to fit.
    const maxH = pageHeight - 2 * margin;
    const cellH = Math.min(h, maxH);
    const cellW = cellH === h ? w : cellH;
    const rowW = cols * cellW + (cols - 1) * gap;
    const xStart = margin + (usableW - rowW) / 2;
    const yStart = margin + (maxH - cellH) / 2;
    const rects: PanelRect[] = [];
    page.panels.forEach((_panel: Panel, i: number) => {
      rects.push({
        x: xStart + i * (cellW + gap),
        y: yStart,
        w: cellW,
        h: cellH,
        panelIndex: i,
      });
    });
    return { width: pageWidth, height: pageHeight, panels: rects };
  }
  // custom: pack into the closest-to-square grid
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return squareGrid(page.panels, pageWidth, pageHeight, margin, gap, cols);
}
