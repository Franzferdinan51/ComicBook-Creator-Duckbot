import assert from 'node:assert/strict';
import { layoutPage } from './layouts.js';

const portrait = layoutPage(
  {
    pageNumber: 1,
    layout: 'grid-2x2',
    panels: [
      { id: 'a', description: 'A' },
      { id: 'b', description: 'B' },
      { id: 'c', description: 'C' },
      { id: 'd', description: 'D' },
    ],
  },
  825,
  1275,
  36
);
assert.equal(portrait.panels.length, 4);
assert.equal(portrait.height > portrait.width, true);

const wide = layoutPage(
  {
    pageNumber: 1,
    layout: 'strip-3',
    panels: [
      { id: 'a', description: 'A' },
      { id: 'b', description: 'B' },
      { id: 'c', description: 'C' },
    ],
  },
  1600,
  900,
  48
);
assert.equal(wide.panels[0]!.w > wide.panels[0]!.h, true);

console.log('PASS layouts');
