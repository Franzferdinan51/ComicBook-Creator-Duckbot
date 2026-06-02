# pipeline/

This module is populated by a separate task. It exports the following surface
that `src/index.ts` imports:

```ts
// src/pipeline/index.ts (built by the pipeline task)
export interface ScriptGeneratorOptions {
  pageCount: number;
  panelsPerPage: number;
  artStyle: string;
}

export interface ImageGeneratorOptions {
  artStyle: string;
  seed?: number;
}

export function generateScript(
  story: string,
  opts: ScriptGeneratorOptions,
  provider: TextProvider,
): Promise<ComicScript>;

export function generatePanelImages(
  script: ComicScript,
  opts: ImageGeneratorOptions,
  provider: ImageProvider,
): Promise<Map<string, Buffer>>;
```

`generateScript` takes the user's free-form story and produces a `ComicScript`
(title + artStyle + N pages × M panels with dialogue / caption).
`generatePanelImages` walks the script and produces one PNG Buffer per panel id.

Until the pipeline task lands, `src/index.ts` will fail to resolve these imports.
The assembler can be tested standalone with `npx tsx src/assembler/__test__.ts`.
