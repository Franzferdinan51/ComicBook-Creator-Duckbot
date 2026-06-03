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
  musicProvider: 'mock',
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
The adaptation package includes screenplay scenes and storyboard prompts; the
music package includes cue mapping, a song draft, and a music-generation
prompt for follow-up audio tools. The default pipeline also writes a song
sheet markdown file and a theme WAV through the selected music provider
(`mock` today, with the provider surface ready for real audio engines).
For show/movie workflows, it also writes a storyboard package JSON and an
animatic timeline JSON tied to the generated panel images and temporary theme.

For external-agent workflows, see
[`docs/agents/external-agent-guide.md`](./docs/agents/external-agent-guide.md).

## Layouts

- `grid-2x2` — 4 panels in 2 rows of 2 (default)
- `grid-2x3` — 6 panels in 3 rows of 2
- `strip-3` — 3 panels in a single row
- `custom` — auto-arrange N panels into a roughly square grid

## Providers (text + image + music)

- `mock` — deterministic, no API calls (best for testing and dry runs)
- `openrouter` — routes to FLUX, DALL-E, etc. via OpenRouter (best quality)
- `lmstudio` — local model, free, slower (best for privacy)
- `minimax` — MiniMax image gen (good for stylized art)

The `mock` provider generates a deterministic color grid PNG based on the panel
id and seed — perfect for end-to-end smoke tests without burning API credits.
Music currently ships with the deterministic `mock` provider, which writes a
playable WAV placeholder from the generated song draft. Pass
`musicProvider: 'mock'` in code or `--music-provider=mock` in the CLI; future
music backends plug into the same provider contract.

## Test

```bash
npx tsx src/assembler/__test__.ts
```

Should print `PASS` and write `/tmp/assembler-test.pdf` (>5KB, starts with `%PDF-`).
