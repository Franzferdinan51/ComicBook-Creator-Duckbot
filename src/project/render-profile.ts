import type { ComicOptions, RenderProfile } from '../types.js';

export function normalizeRenderProfile(
  options: Partial<ComicOptions> = {}
): RenderProfile {
  const outputProfile = options.outputProfile ?? 'comic-print';

  if (outputProfile === 'storyboard-widescreen') {
    return {
      outputProfile,
      page: { width: 1600, height: 900, margin: 48, bleed: 0 },
      panel: {
        aspectRatio: '16:9',
        targetWidth: 1536,
        targetHeight: 864,
        fit: 'contain',
      },
      cover: { width: 1600, height: 900, aspectRatio: '16:9' },
    };
  }

  if (outputProfile === 'digital-portrait') {
    return {
      outputProfile,
      page: { width: 1080, height: 1920, margin: 48, bleed: 0 },
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
    page: { width: 825, height: 1275, margin: 36, bleed: 18 },
    panel: {
      aspectRatio: '2:3',
      targetWidth: 1024,
      targetHeight: 1536,
      fit: 'contain',
    },
    cover: { width: 1536, height: 2304, aspectRatio: '2:3' },
  };
}
