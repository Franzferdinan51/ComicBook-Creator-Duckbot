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
    // 3 in a row, single row, full height
    const cols = 3;
    const usableW = pageWidth - 2 * margin;
    const usableH = pageHeight - 2 * margin;
    const w = (usableW - gap * (cols - 1)) / cols;
    const h = usableH;
    const rects: PanelRect[] = [];
    page.panels.forEach((_panel: Panel, i: number) => {
      rects.push({
        x: margin + i * (w + gap),
        y: margin,
        w,
        h,
        panelIndex: i,
      });
    });
    return { width: pageWidth, height: pageHeight, panels: rects };
  }
  // custom: pack into the closest-to-square grid
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  return squareGrid(page.panels, pageWidth, pageHeight, margin, gap, cols);
}
