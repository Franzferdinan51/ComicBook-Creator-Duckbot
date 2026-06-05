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
assert.equal(widescreen.cover.width, 1536);
assert.equal(widescreen.cover.height, 864);
assert.equal(widescreen.panel.targetWidth, 1536);
assert.equal(widescreen.panel.targetHeight, 864);

const digital = normalizeRenderProfile({ outputProfile: 'digital-portrait' });
assert.equal(digital.cover.height > digital.cover.width, true);

for (const profile of [
  normalizeRenderProfile({ outputProfile: 'comic-print' }),
  normalizeRenderProfile({ outputProfile: 'digital-portrait' }),
  normalizeRenderProfile({ outputProfile: 'storyboard-widescreen' }),
]) {
  for (const [label, size] of Object.entries({
    panelWidth: profile.panel.targetWidth,
    panelHeight: profile.panel.targetHeight,
    coverWidth: profile.cover.width,
    coverHeight: profile.cover.height,
  })) {
    assert.equal(size % 8, 0, `${profile.outputProfile} ${label} must be divisible by 8`);
    assert.equal(size >= 512, true, `${profile.outputProfile} ${label} must be at least 512px`);
  }
}

console.log('PASS render-profile');
