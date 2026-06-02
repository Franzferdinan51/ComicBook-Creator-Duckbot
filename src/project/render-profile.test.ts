import assert from 'node:assert/strict';
import { normalizeRenderProfile } from './render-profile.js';

const portrait = normalizeRenderProfile({
  outputProfile: 'comic-print',
  pageCount: 4,
  panelsPerPage: 4,
});
assert.equal(portrait.page.width, 825);
assert.equal(portrait.page.height, 1275);
assert.equal(portrait.panel.aspectRatio, '2:3');

const widescreen = normalizeRenderProfile({
  outputProfile: 'storyboard-widescreen',
  pageCount: 3,
  panelsPerPage: 3,
});
assert.equal(widescreen.page.width, 1600);
assert.equal(widescreen.page.height, 900);
assert.equal(widescreen.cover.width, 1600);
assert.equal(widescreen.panel.targetWidth, 1536);
assert.equal(widescreen.panel.targetHeight, 864);

const digital = normalizeRenderProfile({ outputProfile: 'digital-portrait' });
assert.equal(digital.cover.height > digital.cover.width, true);

console.log('PASS render-profile');
