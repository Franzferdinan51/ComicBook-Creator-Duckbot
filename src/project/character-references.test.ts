import assert from 'node:assert/strict';
import {
  CHARACTER_REFERENCE_MAX_ITEMS,
  CHARACTER_REFERENCE_MAX_LENGTH,
  validateCharacterReferences,
} from './character-references.js';

// Happy path: array of valid URL/path strings.
{
  const r = validateCharacterReferences([
    'https://example.com/hero.png',
    '  /tmp/hero-2.png  ',
  ]);
  assert.equal(r.ok, true);
  if (r.ok) {
    // Whitespace trimmed but the entries themselves are non-empty
    assert.deepEqual(r.value, [
      'https://example.com/hero.png',
      '/tmp/hero-2.png',
    ]);
  }
}

// Empty / whitespace-only entries are a hard error — the caller
// almost certainly made a typo (e.g. an empty line in a textarea)
// and silently dropping them would mask the mistake.
{
  const r1 = validateCharacterReferences(['']);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error, /no empty entries/i);
  const r2 = validateCharacterReferences(['   \t  ']);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error, /no empty entries/i);
}

// null / undefined → empty array (no error).
{
  for (const empty of [null, undefined]) {
    const r = validateCharacterReferences(empty);
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value, []);
  }
}

// Not an array → error.
{
  const r = validateCharacterReferences('https://example.com/hero.png');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /array/i);
}

// Non-string entry → error.
{
  const r = validateCharacterReferences(['https://example.com/hero.png', 42]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /non-empty strings/i);
}

// Too many entries → error with the actual count.
{
  const tooMany = Array.from({ length: CHARACTER_REFERENCE_MAX_ITEMS + 1 }, (_, i) => `ref-${i}.png`);
  const r = validateCharacterReferences(tooMany);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.match(r.error, /at most/);
    assert.match(r.error, new RegExp(String(tooMany.length)));
  }
}

// Entry too long → error.
{
  const tooLong = 'a'.repeat(CHARACTER_REFERENCE_MAX_LENGTH + 1);
  const r = validateCharacterReferences([tooLong]);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /characters or fewer/);
}

// Control character / NUL → error.
{
  const r1 = validateCharacterReferences(['good.png\x00evil']);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.match(r1.error, /control characters/i);
  const r2 = validateCharacterReferences(['good\n.png']);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.match(r2.error, /control characters/i);
}

// All whitespace → error (treated as empty after trim) — covered
// by the "empty / whitespace-only entries are a hard error" case
// above.

// Boundary: exactly MAX_LENGTH is allowed.
{
  const exact = 'a'.repeat(CHARACTER_REFERENCE_MAX_LENGTH);
  const r = validateCharacterReferences([exact]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value[0]?.length, CHARACTER_REFERENCE_MAX_LENGTH);
}

// Boundary: exactly MAX_ITEMS is allowed.
{
  const exact = Array.from({ length: CHARACTER_REFERENCE_MAX_ITEMS }, (_, i) => `ref-${i}.png`);
  const r = validateCharacterReferences(exact);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.length, CHARACTER_REFERENCE_MAX_ITEMS);
}

console.log('PASS character-references');
