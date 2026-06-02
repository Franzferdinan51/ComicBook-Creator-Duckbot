/**
 * Pipeline — public surface for the script + image generation stage.
 *
 * `src/index.ts` imports `generateScript` and `generatePanelImages` from
 * this module. Keep the surface area narrow; everything else stays
 * private to the file that defines it.
 */

export { generateScript, extractJSON } from './script.js';
export type { ScriptGeneratorOptions } from './script.js';

export { generatePanelImages } from './image.js';
export type { ImageGeneratorOptions } from './image.js';
