# comic-creator

AI-powered multi-page comic book creator. Takes a story prompt, generates a page-by-page script with panel descriptions and dialogue, creates panel art via a configured image provider, and outputs a PDF or CBZ.

## Install

```bash
cd ~/.openclaw/workspace/skills/comic-creator
npm install --no-audit --no-fund
```

## Quick start

```ts
import { createComic } from 'comic-creator';

const result = await createComic('A shy robot discovers a garden on Mars', {
  artStyle: 'manga',
  imageProvider: 'mock',     // or 'openrouter', 'lmstudio', 'minimax'
  textProvider: 'mock',
  pageCount: 4,
  panelsPerPage: 4,
  outputFormat: 'pdf',
});

console.log('Comic saved at:', result.outputPath);
console.log('Agent handoff saved at:', result.agentGuidancePath);
```

Each run now also returns reusable story, adaptation, music, and agent-guidance
artifacts so CLI tools, MCP hosts, and external agents can keep working from
the same project foundation instead of starting over from the PDF.

For external-agent workflows, see
[`docs/agents/external-agent-guide.md`](./docs/agents/external-agent-guide.md).

## Layouts

- `grid-2x2` — 4 panels in 2 rows of 2 (default)
- `grid-2x3` — 6 panels in 3 rows of 2
- `strip-3` — 3 panels in a single row
- `custom` — auto-arrange N panels into a roughly square grid

## Providers (text + image)

- `mock` — deterministic, no API calls (best for testing and dry runs)
- `openrouter` — routes to FLUX, DALL-E, etc. via OpenRouter (best quality)
- `lmstudio` — local model, free, slower (best for privacy)
- `minimax` — MiniMax image gen (good for stylized art)

The `mock` provider generates a deterministic color grid PNG based on the panel
id and seed — perfect for end-to-end smoke tests without burning API credits.

## Test

```bash
npx tsx src/assembler/__test__.ts
```

Should print `PASS` and write `/tmp/assembler-test.pdf` (>5KB, starts with `%PDF-`).
