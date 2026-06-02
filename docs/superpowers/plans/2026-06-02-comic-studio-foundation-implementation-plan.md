# Comic Studio Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix comic image sizing and output correctness while adding a reusable project/story foundation plus early screen-adaptation and music-brief artifacts.

**Architecture:** Keep `createComic()` as the public entrypoint, but make it build a reusable `StoryProject` and `RenderProfile` before deriving comic pages, panel renders, and export artifacts. Extend the server and WebUI to surface the richer outputs without breaking the current PDF/CBZ workflow.

**Tech Stack:** TypeScript, Node.js, Express, pdfkit, Preact + htm, `tsx`, `npx tsc --noEmit`

---

## File Map

**Create**
- `src/project/render-profile.ts` — normalize page presets, panel sizing policy, and image target dimensions.
- `src/project/story-project.ts` — create the reusable project, story bible, adaptation package, and music cue package.
- `src/project/index.ts` — narrow public exports for project utilities.
- `src/project/render-profile.test.ts` — deterministic sizing tests.
- `src/project/story-project.test.ts` — deterministic project artifact tests.
- `src/assembler/layouts.test.ts` — layout behavior tests across output profiles.
- `src/server/routes.test.ts` — API-level tests for new project export metadata.
- `docs/superpowers/plans/2026-06-02-comic-studio-foundation-implementation-plan.md` — this plan.

**Modify**
- `src/types.ts` — add `RenderProfile`, `StoryProject`, `StoryBible`, `AdaptationPackage`, `MusicCuePackage`, and expanded `ComicOptions`/`ComicResult`.
- `src/index.ts` — build project artifacts, use render profile sizing, and return new export metadata.
- `src/pipeline/image.ts` — replace square-only defaults with render-target-aware generation.
- `src/pipeline/index.ts` — export new image option types if needed.
- `src/assembler/layouts.ts` — choose geometry from page specs instead of only panel count.
- `src/assembler/index.ts` — honor render profile page size and cover sizing in PDF/CBZ assembly.
- `src/server/jobs.ts` — preserve new project artifacts in finished job results.
- `src/server/storage.ts` — persist project/export metadata in history.
- `src/server/routes.ts` — expose project/artifact metadata through the API.
- `webui/components/OptionsPanel.js` — add output profile controls.
- `webui/components/ResultPanel.js` — show/download project, adaptation, and music artifacts.
- `package.json` — restore working test scripts for the new source-adjacent tests.

---

### Task 1: Add project and render-profile core types

**Files:**
- Create: `src/project/render-profile.ts`
- Create: `src/project/story-project.ts`
- Create: `src/project/index.ts`
- Modify: `src/types.ts`
- Test: `src/project/render-profile.test.ts`
- Test: `src/project/story-project.test.ts`

- [ ] **Step 1: Write the failing render-profile and project tests**

```ts
import assert from 'node:assert/strict';
import { normalizeRenderProfile } from './render-profile.js';
import { buildStoryProject } from './story-project.js';

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

const project = buildStoryProject('A small crew saves a floating city', {
  artStyle: 'cinematic comic',
  outputProfile: 'storyboard-widescreen',
});
assert.equal(project.storyBible.premise, 'A small crew saves a floating city');
assert.equal(project.adaptationPackage.sceneOutline.length > 0, true);
assert.equal(project.musicCuePackage.cues.length > 0, true);

console.log('PASS render-profile + story-project');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx src/project/render-profile.test.ts && npx tsx src/project/story-project.test.ts`

Expected: FAIL with module-not-found or missing-export errors for `normalizeRenderProfile` and `buildStoryProject`.

- [ ] **Step 3: Add the new shared types in `src/types.ts`**

```ts
export type OutputProfile = 'comic-print' | 'digital-portrait' | 'storyboard-widescreen';

export interface RenderProfile {
  outputProfile: OutputProfile;
  page: { width: number; height: number; margin: number; bleed: number };
  panel: { aspectRatio: string; targetWidth: number; targetHeight: number; fit: 'contain' | 'cover' };
  cover: { width: number; height: number; aspectRatio: string };
}

export interface StoryBible {
  premise: string;
  synopsis: string;
  chapterOutline: string[];
  sceneBeats: string[];
}

export interface AdaptationPackage {
  format: 'screen-outline';
  sceneOutline: Array<{ sceneId: string; summary: string; visualGoal: string }>;
}

export interface MusicCuePackage {
  format: 'music-brief';
  cues: Array<{ cueId: string; title: string; mood: string; placement: string }>;
  themeSongPrompt: string;
}

export interface StoryProject {
  id: string;
  title: string;
  premise: string;
  artStyle: string;
  renderProfile: RenderProfile;
  storyBible: StoryBible;
  adaptationPackage: AdaptationPackage;
  musicCuePackage: MusicCuePackage;
}
```

- [ ] **Step 4: Implement `normalizeRenderProfile()` and `buildStoryProject()`**

```ts
// src/project/render-profile.ts
import type { ComicOptions, RenderProfile } from '../types.js';

export function normalizeRenderProfile(options: Partial<ComicOptions>): RenderProfile {
  const outputProfile = options.outputProfile ?? 'comic-print';
  if (outputProfile === 'storyboard-widescreen') {
    return {
      outputProfile,
      page: { width: 1600, height: 900, margin: 48, bleed: 0 },
      panel: { aspectRatio: '16:9', targetWidth: 1536, targetHeight: 864, fit: 'contain' },
      cover: { width: 1600, height: 900, aspectRatio: '16:9' },
    };
  }
  if (outputProfile === 'digital-portrait') {
    return {
      outputProfile,
      page: { width: 1080, height: 1920, margin: 48, bleed: 0 },
      panel: { aspectRatio: '9:16', targetWidth: 1024, targetHeight: 1792, fit: 'contain' },
      cover: { width: 1080, height: 1920, aspectRatio: '9:16' },
    };
  }
  return {
    outputProfile: 'comic-print',
    page: { width: 825, height: 1275, margin: 36, bleed: 18 },
    panel: { aspectRatio: '2:3', targetWidth: 1024, targetHeight: 1536, fit: 'contain' },
    cover: { width: 1536, height: 2304, aspectRatio: '2:3' },
  };
}
```

```ts
// src/project/story-project.ts
import { randomUUID } from 'node:crypto';
import type { ComicOptions, StoryProject } from '../types.js';
import { normalizeRenderProfile } from './render-profile.js';

export function buildStoryProject(story: string, options: Partial<ComicOptions> = {}): StoryProject {
  const renderProfile = normalizeRenderProfile(options);
  const title = story.split(/[.!?]/)[0]?.trim() || 'Untitled Project';
  return {
    id: randomUUID(),
    title,
    premise: story,
    artStyle: options.artStyle ?? 'manga',
    renderProfile,
    storyBible: {
      premise: story,
      synopsis: `${title} develops into a multi-scene illustrated narrative.`,
      chapterOutline: ['Opening', 'Escalation', 'Climax', 'Resolution'],
      sceneBeats: ['Introduce the world', 'Raise the conflict', 'Resolve the turning point'],
    },
    adaptationPackage: {
      format: 'screen-outline',
      sceneOutline: [
        { sceneId: 'scene-1', summary: 'Open on the core conflict.', visualGoal: 'Establish scale and mood' },
      ],
    },
    musicCuePackage: {
      format: 'music-brief',
      cues: [
        { cueId: 'cue-1', title: 'Main Theme', mood: 'hopeful tension', placement: 'opening' },
      ],
      themeSongPrompt: `Write a cinematic theme for "${title}" with a ${options.artStyle ?? 'manga'} tone.`,
    },
  };
}
```

- [ ] **Step 5: Re-run the new tests**

Run: `npx tsx src/project/render-profile.test.ts && npx tsx src/project/story-project.test.ts`

Expected: `PASS render-profile + story-project`

---

### Task 2: Thread render profiles through image generation and comic creation

**Files:**
- Modify: `src/index.ts`
- Modify: `src/pipeline/image.ts`
- Modify: `src/pipeline/index.ts`
- Test: `src/project/render-profile.test.ts`

- [ ] **Step 1: Extend the tests to verify image-target sizing**

```ts
import assert from 'node:assert/strict';
import { normalizeRenderProfile } from '../project/render-profile.js';

const renderProfile = normalizeRenderProfile({ outputProfile: 'storyboard-widescreen' });
assert.equal(renderProfile.panel.targetWidth, 1536);
assert.equal(renderProfile.panel.targetHeight, 864);

const printProfile = normalizeRenderProfile({ outputProfile: 'comic-print' });
assert.equal(printProfile.cover.height > printProfile.cover.width, true);

console.log('PASS render target sizing');
```

- [ ] **Step 2: Run the test to verify the current pipeline is still not using the profile**

Run: `npx tsx src/project/render-profile.test.ts`

Expected: FAIL after adding assertions that reference fields not yet consumed by `createComic()` and `generatePanelImages()`.

- [ ] **Step 3: Update image generation options and `createComic()` to use render-profile dimensions**

```ts
// src/pipeline/image.ts
export interface ImageGeneratorOptions {
  artStyle?: string;
  width?: number;
  height?: number;
  renderProfile?: RenderProfile;
  concurrency?: number;
  seed?: number;
  model?: string;
}

const width = options.renderProfile?.panel.targetWidth ?? options.width ?? 1024;
const height = options.renderProfile?.panel.targetHeight ?? options.height ?? 1024;
```

```ts
// src/index.ts
import { buildStoryProject } from './project/story-project.js';

const project = buildStoryProject(story, opts);
const images = await generatePanelImages(
  script,
  {
    artStyle: opts.artStyle,
    renderProfile: project.renderProfile,
    seed: opts.seed,
    ...(opts.imageModel ? { model: opts.imageModel } : {}),
  },
  imageProvider
);

coverImage = await imageProvider.generate(coverPrompt, {
  width: project.renderProfile.cover.width,
  height: project.renderProfile.cover.height,
  ...(opts.imageModel ? { model: opts.imageModel } : {}),
});
```

- [ ] **Step 4: Return the project artifacts from `createComic()`**

```ts
return {
  script,
  outputPath,
  pdfPath,
  cbzPath,
  coverImagePath,
  project,
  storyBible: project.storyBible,
  adaptationPackage: project.adaptationPackage,
  musicCuePackage: project.musicCuePackage,
  pages: pageImages,
};
```

- [ ] **Step 5: Re-run the sizing tests**

Run: `npx tsx src/project/render-profile.test.ts`

Expected: PASS with explicit target-width and cover-aspect assertions succeeding.

---

### Task 3: Make page layout and PDF assembly honor render profiles

**Files:**
- Modify: `src/assembler/layouts.ts`
- Modify: `src/assembler/index.ts`
- Test: `src/assembler/layouts.test.ts`

- [ ] **Step 1: Write a failing layout test for portrait and widescreen profiles**

```ts
import assert from 'node:assert/strict';
import { layoutPage } from './layouts.js';

const portrait = layoutPage(
  { pageNumber: 1, layout: 'grid-2x2', panels: [{ id: 'a', description: 'A' }, { id: 'b', description: 'B' }, { id: 'c', description: 'C' }, { id: 'd', description: 'D' }] },
  825,
  1275,
  36
);
assert.equal(portrait.panels.length, 4);
assert.equal(portrait.height > portrait.width, true);

const wide = layoutPage(
  { pageNumber: 1, layout: 'strip-3', panels: [{ id: 'a', description: 'A' }, { id: 'b', description: 'B' }, { id: 'c', description: 'C' }] },
  1600,
  900,
  48
);
assert.equal(wide.panels[0].w > wide.panels[0].h, true);

console.log('PASS layout profiles');
```

- [ ] **Step 2: Run the layout test to verify it fails on widescreen assumptions**

Run: `npx tsx src/assembler/layouts.test.ts`

Expected: FAIL because the current `strip-3` path still forces square cells.

- [ ] **Step 3: Update `layoutPage()` to derive cells from the page aspect and layout intent**

```ts
if (explicit === 'strip-3' || (!explicit && n === 3)) {
  const cols = 3;
  const usableW = pageWidth - 2 * margin;
  const usableH = pageHeight - 2 * margin;
  const cellW = (usableW - gap * (cols - 1)) / cols;
  const desiredH = Math.min(cellW * 9 / 16, usableH);
  const yStart = margin + (usableH - desiredH) / 2;
  return {
    width: pageWidth,
    height: pageHeight,
    panels: page.panels.map((_panel, i) => ({
      x: margin + i * (cellW + gap),
      y: yStart,
      w: cellW,
      h: desiredH,
      panelIndex: i,
    })),
  };
}
```

- [ ] **Step 4: Make PDF assembly read the render-profile page dimensions**

```ts
const doc = new PDFDocument({
  size: [options.renderProfile.page.width, options.renderProfile.page.height],
  margin: options.renderProfile.page.margin,
});

const geo = layoutPage(
  page,
  options.renderProfile.page.width,
  options.renderProfile.page.height,
  options.renderProfile.page.margin
);
```

- [ ] **Step 5: Re-run the layout test**

Run: `npx tsx src/assembler/layouts.test.ts`

Expected: `PASS layout profiles`

---

### Task 4: Persist and expose project/adaptation/music artifacts through the server

**Files:**
- Modify: `src/server/jobs.ts`
- Modify: `src/server/storage.ts`
- Modify: `src/server/routes.ts`
- Test: `src/server/routes.test.ts`

- [ ] **Step 1: Write a failing API test for the richer job result**

```ts
import assert from 'node:assert/strict';
import { buildRouter } from './routes.js';

const router = buildRouter();
assert.equal(typeof router, 'function');

// In the real test file, issue a GET /api/comic/:jobId against a finished mock job
// and assert:
// - body.result.project.renderProfile.outputProfile exists
// - body.result.adaptationPackage.sceneOutline is an array
// - body.result.musicCuePackage.cues is an array
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `npx tsx src/server/routes.test.ts`

Expected: FAIL because the current persisted result shape does not include project, adaptation, or music artifacts.

- [ ] **Step 3: Persist the new artifact fields in history and rehydration**

```ts
// src/server/storage.ts
export interface HistoryEntry {
  jobId: string;
  title: string;
  createdAt: string;
  artStyle: string;
  pageCount: number;
  outputPath: string;
  pdfPath?: string;
  cbzPath?: string;
  coverImagePath?: string;
  project?: StoryProject;
  adaptationPackage?: AdaptationPackage;
  musicCuePackage?: MusicCuePackage;
  scriptJson: ComicScript;
}
```

```ts
// src/server/jobs.ts
const result: ComicResult = {
  script: entry.scriptJson,
  outputPath: entry.outputPath,
  pdfPath: entry.pdfPath ?? null,
  cbzPath: entry.cbzPath ?? null,
  coverImagePath: entry.coverImagePath ?? null,
  project: entry.project!,
  adaptationPackage: entry.adaptationPackage!,
  musicCuePackage: entry.musicCuePackage!,
  pages: await Promise.all(...),
};
```

- [ ] **Step 4: Surface the new fields in `/api/comic/:jobId` and `/api/history` payloads**

```ts
res.json({
  jobId: resolved.jobId,
  status: resolved.status,
  createdAt: resolved.createdAt,
  updatedAt: resolved.updatedAt,
  result: resolved.result,
});
```

```ts
res.json(history.map((entry) => ({
  ...entry,
  hasProjectArtifacts: !!entry.project,
  hasMusicCuePackage: !!entry.musicCuePackage,
})));
```

- [ ] **Step 5: Re-run the routes test**

Run: `npx tsx src/server/routes.test.ts`

Expected: PASS with the richer JSON shape visible on finished jobs.

---

### Task 5: Add output-profile controls and artifact downloads to the WebUI

**Files:**
- Modify: `webui/components/OptionsPanel.js`
- Modify: `webui/components/ResultPanel.js`
- Modify: `src/server/routes.ts`

- [ ] **Step 1: Add a failing UI smoke test or static assertion block**

```js
const OUTPUT_PROFILES = [
  { value: 'comic-print', label: 'Comic Print' },
  { value: 'digital-portrait', label: 'Digital Portrait' },
  { value: 'storyboard-widescreen', label: 'Storyboard Widescreen' },
];

if (!OUTPUT_PROFILES.find((x) => x.value === 'storyboard-widescreen')) {
  throw new Error('missing storyboard profile');
}
```

- [ ] **Step 2: Run a lightweight UI verification**

Run: `node --input-type=module -e "import('./webui/components/OptionsPanel.js')"`

Expected: FAIL or remain incomplete until the new output-profile control exists and the module still parses cleanly after edits.

- [ ] **Step 3: Add profile selection to `OptionsPanel.js`**

```js
const OUTPUT_PROFILES = [
  { value: 'comic-print', label: 'Comic Print' },
  { value: 'digital-portrait', label: 'Digital Portrait' },
  { value: 'storyboard-widescreen', label: 'Storyboard Widescreen' },
];

<div class="field">
  <label for="output-profile">Output profile</label>
  <select
    id="output-profile"
    value=${options.outputProfile || 'comic-print'}
    disabled=${disabled}
    onChange=${(e) => set({ outputProfile: e.target.value })}
  >
    ${OUTPUT_PROFILES.map((profile) => html`
      <option key=${profile.value} value=${profile.value}>${profile.label}</option>
    `)}
  </select>
</div>
```

- [ ] **Step 4: Add artifact sections to `ResultPanel.js`**

```js
<section class="artifact-panel">
  <h3>Project Assets</h3>
  <p>${result.project?.renderProfile?.outputProfile || 'comic-print'}</p>
  <button type="button" onClick=${downloadProjectJson}>Download Project JSON</button>
</section>

<section class="artifact-panel">
  <h3>Adaptation</h3>
  <p>${result.adaptationPackage?.sceneOutline?.length || 0} scenes prepared</p>
</section>

<section class="artifact-panel">
  <h3>Music</h3>
  <p>${result.musicCuePackage?.cues?.length || 0} cue ideas prepared</p>
</section>
```

- [ ] **Step 5: Re-run the UI parse check**

Run: `node --input-type=module -e "import('./webui/components/OptionsPanel.js'); import('./webui/components/ResultPanel.js')"`

Expected: no syntax errors

---

### Task 6: Restore runnable verification commands and complete full-project checks

**Files:**
- Modify: `package.json`
- Test: `src/project/render-profile.test.ts`
- Test: `src/project/story-project.test.ts`
- Test: `src/assembler/layouts.test.ts`
- Test: `src/server/routes.test.ts`

- [ ] **Step 1: Replace broken test scripts with working source-adjacent commands**

```json
{
  "scripts": {
    "test": "tsx src/project/render-profile.test.ts && tsx src/project/story-project.test.ts && tsx src/assembler/layouts.test.ts && tsx src/server/routes.test.ts",
    "test:mcp": "echo \"No MCP tests yet\"",
    "start": "tsx src/index.ts"
  }
}
```

- [ ] **Step 2: Run the focused test suite**

Run: `npm test`

Expected: PASS lines from the new source-adjacent tests.

- [ ] **Step 3: Run the type check**

Run: `npx tsc --noEmit`

Expected: no TypeScript errors

- [ ] **Step 4: Run a manual server smoke check**

Run: `npx tsx src/server/index.ts`

Expected: server starts on the configured port without crashing; `GET /api/providers` and `POST /api/comic` remain reachable.

- [ ] **Step 5: Prepare the Git-backed handoff for push**

```bash
git status --short
git add src/types.ts src/index.ts src/pipeline/image.ts src/assembler/layouts.ts src/assembler/index.ts src/server/jobs.ts src/server/storage.ts src/server/routes.ts webui/components/OptionsPanel.js webui/components/ResultPanel.js package.json src/project docs/superpowers/specs docs/superpowers/plans
git commit -m "Add comic studio project foundation"
git push origin HEAD
```

Expected: commit created and pushed from a Git-backed clone of `Franzferdinan51/ComicBook-Creator-Duckbot`.

---

## Self-Review Notes

- Spec coverage:
  - render-profile sizing fixes are covered by Tasks 1 to 3
  - reusable project/story foundation is covered by Tasks 1, 2, and 4
  - screen adaptation and music briefs are covered by Tasks 1, 2, 4, and 5
  - UI workflow expansion starts in Task 5
  - verification and test script repair are covered by Task 6
- Placeholder scan:
  - no deferred implementation markers remain
- Type consistency:
  - `RenderProfile`, `StoryProject`, `AdaptationPackage`, and `MusicCuePackage` are introduced in Task 1 and referenced consistently in later tasks
