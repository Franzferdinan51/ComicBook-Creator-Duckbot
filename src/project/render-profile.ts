import type { ComicOptions, RenderProfile } from '../types.js';

export function normalizeRenderProfile(
  options: Partial<ComicOptions> = {}
): RenderProfile {
  const outputProfile = options.outputProfile ?? 'comic-print';

  if (outputProfile === 'storyboard-widescreen') {
    return {
      outputProfile,
      // PDF page dimensions are in points, not pixels. Keep the
      // physical page at a sane landscape size while panel renders
      // stay high-resolution for export quality.
      page: { width: 960, height: 540, margin: 36, bleed: 0 },
      panel: {
        aspectRatio: '16:9',
        targetWidth: 1536,
        targetHeight: 864,
        fit: 'contain',
      },
      cover: { width: 1536, height: 864, aspectRatio: '16:9' },
    };
  }

  if (outputProfile === 'digital-portrait') {
    return {
      outputProfile,
      page: { width: 540, height: 960, margin: 36, bleed: 0 },
      panel: {
        aspectRatio: '9:16',
        targetWidth: 1024,
        targetHeight: 1792,
        fit: 'contain',
      },
      cover: { width: 1080, height: 1920, aspectRatio: '9:16' },
    };
  }

  return {
    outputProfile: 'comic-print',
    // PDF page dimensions are in PostScript points (1 inch = 72 points).
    // 6.625in × 10.25in = 477 × 738 points at standard print resolution.
    // The previous values (504 × 777.6) were inches, not points — fixed
    // to the correct physical page size for a US trade paperback.
    page: { width: 477, height: 738, margin: 24, bleed: 18 },
    panel: {
      aspectRatio: '2:3',
      targetWidth: 1024,
      targetHeight: 1536,
      fit: 'contain',
    },
    cover: { width: 1024, height: 1536, aspectRatio: '2:3' },
  };
}
