import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { generatePanelImages } from './image.js';
import type { ComicScript, RenderProfile } from '../types.js';

const script: ComicScript = {
  title: 'Consistency Test',
  artStyle: 'manga',
  pages: [
    {
      pageNumber: 1,
      layout: 'grid-2x2',
      panels: [
        {
          id: 'p1-panel1',
          description: 'A hero returns to the city skyline.',
        },
      ],
    },
  ],
};

const renderProfile: RenderProfile = {
  outputProfile: 'storyboard-widescreen',
  page: { width: 1600, height: 900, margin: 48, bleed: 0 },
  panel: { aspectRatio: '16:9', targetWidth: 1536, targetHeight: 864, fit: 'contain' },
  cover: { width: 1536, height: 864, aspectRatio: '16:9' },
};

function tinyPng(): Buffer {
  const png = new PNG({ width: 1, height: 1 });
  png.data[0] = 255;
  png.data[1] = 255;
  png.data[2] = 255;
  png.data[3] = 255;
  return PNG.sync.write(png);
}

let capturedPrompt = '';
let capturedOpts: Record<string, unknown> | null = null;

const images = await generatePanelImages(
  script,
  {
    artStyle: 'noir',
    renderProfile,
    model: 'image-01',
    seed: 42,
    aspectRatio: '16:9',
    promptOptimizer: true,
    aigcWatermark: true,
    subjectReference: [
      { type: 'character', image_file: '/tmp/hero-reference.png' },
      { type: 'character', image_url: 'https://example.com/hero-2.png' },
    ],
  },
  {
    name: 'capture',
    async generate(prompt, opts = {}) {
      capturedPrompt = prompt;
      capturedOpts = opts as Record<string, unknown>;
      return tinyPng();
    },
  }
);

assert.equal(images.size, 1);
assert.equal(capturedPrompt.includes('noir style.'), true);
assert.deepEqual(capturedOpts, {
  width: 1536,
  height: 864,
  model: 'image-01',
  seed: 42,
  aspectRatio: '16:9',
  promptOptimizer: true,
  aigcWatermark: true,
  subjectReference: [
    { type: 'character', image_file: '/tmp/hero-reference.png' },
    { type: 'character', image_url: 'https://example.com/hero-2.png' },
  ],
});

console.log('PASS pipeline/image');
