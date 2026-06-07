/**
 * Character consistency references — shared validation.
 *
 * Used by the CLI (`--character-reference=...`), the HTTP route
 * (POST /api/comic with `characterReferences: [...]`), and the MCP
 * tool (`create_comic({ characterReferences: [...] })`). Three
 * callers used to do the same parse/validate work in three
 * different ways; this module is the single source of truth.
 *
 * Rules (the strictest of the three legacy implementations, used
 * everywhere now):
 *   - Must be an array
 *   - Max 8 entries (matches the MCP zod schema limit)
 *   - Every entry must be a non-empty string
 *   - Length 1..2048 (matches the HTTP route limit)
 *   - Printable characters only (no control chars / NUL bytes)
 *
 * The CLI previously accepted the value as-is and only checked for
 * non-empty, so a stray 1 MB string or NUL bytes could be passed
 * straight through to the image provider. The HTTP route already
 * applied the strict version, and the MCP `validateMcpOptions`
 * helper applied a similar but slightly different check. This
 * module unifies them.
 */
export const CHARACTER_REFERENCE_MAX_ITEMS = 8;
export const CHARACTER_REFERENCE_MAX_LENGTH = 2048;

export type CharacterReferenceValidation =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

/**
 * Pure validator — no I/O, no logging. Safe to use from the CLI,
 * the HTTP route, and the MCP tool. Returns either the cleaned
 * array (with whitespace trimmed + empty entries dropped) or a
 * human-readable error message safe to surface to the user.
 *
 * Always returns the cleaned array, even when the input contains
 * extra whitespace or empty lines, so the caller doesn't have to
 * re-trim.
 */
export function validateCharacterReferences(raw: unknown): CharacterReferenceValidation {
  if (raw == null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'characterReferences must be an array of non-empty strings' };
  }
  if (raw.length > CHARACTER_REFERENCE_MAX_ITEMS) {
    return {
      ok: false,
      error: `characterReferences may include at most ${CHARACTER_REFERENCE_MAX_ITEMS} items (got ${raw.length})`,
    };
  }
  const cleaned: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') {
      return { ok: false, error: 'characterReferences must be an array of non-empty strings' };
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return { ok: false, error: 'characterReferences must contain no empty entries' };
    }
    if (trimmed.length > CHARACTER_REFERENCE_MAX_LENGTH) {
      return {
        ok: false,
        error: `each characterReference must be ${CHARACTER_REFERENCE_MAX_LENGTH} characters or fewer (got ${trimmed.length})`,
      };
    }
    // Reject control characters (incl. NUL) so a hostile value
    // can't smuggle shell metacharacters or break a downstream
    // log line. Printable ASCII + standard whitespace only.
    if (/[\x00-\x1f\x7f]/.test(trimmed)) {
      return {
        ok: false,
        error: 'characterReferences must not contain control characters or NUL bytes',
      };
    }
    cleaned.push(trimmed);
  }
  return { ok: true, value: cleaned };
}
