import assert from 'node:assert/strict';
import { normalizeRenderProfile } from './render-profile.js';

const portrait = normalizeRenderProfile({
  outputProfile: 'comic-print',
  pageCount: 4,
  panelsPerPage: 4,
});
assert.equal(portrait.page.width, 504);
assert.equal(portrait.page.height, 777.6);
assert.equal(portrait.panel.aspectRatio, '2:3');

const widescreen = normalizeRenderProfile({
  outputProfile: 'storyboard-widescreen',
  pageCount: 3,
  panelsPerPage: 3,
});
assert.equal(widescreen.page.width, 960);
assert.equal(widescreen.page.height, 540);
assert.equal(widescreen.cover.width, 1600);
assert.equal(widescreen.panel.targetWidth, 1536);
assert.equal(widescreen.panel.targetHeight, 864);

const digital = normalizeRenderProfile({ outputProfile: 'digital-portrait' });
assert.equal(digital.cover.height > digital.cover.width, true);

console.log('PASS render-profile');
