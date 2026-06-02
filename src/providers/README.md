# providers/

This module is populated by a separate task. It exports the following surface
that `src/index.ts` imports:

```ts
// src/providers/index.ts (built by the providers task)
export interface TextProvider {
  name: string;
  generate(opts: { prompt: string; system?: string; json?: boolean }): Promise<string>;
}

export interface ImageProvider {
  name: string;
  generate(opts: { prompt: string; seed?: number; width?: number; height?: number }): Promise<Buffer>;
}

export function getTextProvider(name: string): TextProvider;
export function getImageProvider(name: string): ImageProvider;
export function listTextProviders(): string[];
export function listImageProviders(): string[];
```

Expected provider names (matching `ComicOptions.imageProvider` / `textProvider`):
- `mock`     — deterministic, no API calls
- `openrouter` — OpenRouter (text + image via FLUX, DALL-E, etc.)
- `lmstudio` — local LM Studio at `http://127.0.0.1:1234/v1`
- `minimax`  — MiniMax AI Platform

Until the providers task lands, `src/index.ts` will fail to resolve these imports.
The assembler can be tested standalone with `npx tsx src/assembler/__test__.ts`.
