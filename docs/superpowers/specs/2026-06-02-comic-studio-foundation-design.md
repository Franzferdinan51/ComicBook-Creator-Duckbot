# Comic Studio Foundation Design

Date: 2026-06-02
Repository: `/Users/duckets/Desktop/ComicBook-Creator-Duckbot-main`

## Goal

Fix the current comic generator's image sizing and output-quality issues while reshaping the project so the same story foundation can later drive comic generation, screen/show adaptation assets, and soundtrack or song-development assets.

## Current State

The current repo already has a functional one-shot pipeline:

1. `createComic()` in `src/index.ts` accepts a story and options.
2. `generateScript()` in `src/pipeline/script.ts` produces a `ComicScript`.
3. `generatePanelImages()` in `src/pipeline/image.ts` renders one image per panel.
4. `assembleComic()` in `src/assembler/index.ts` exports PDF or CBZ.
5. The WebUI collects options and displays the finished comic.

This is enough for a v1 comic flow, but it has structural problems:

- Image-size controls in the UI do not fully map to the rendering pipeline.
- The core image path still behaves like a mostly square-image system.
- PDF output is locked to a single fixed page format with limited sizing intent.
- The data model is comic-only, so future screen or music features would be bolted on instead of derived from shared story assets.
- The current job output is optimized for a single generated artifact instead of a reusable project package.

## Product Direction

Use a hybrid direction:

1. Fix comic output quality first.
2. Make those fixes on top of a reusable project/story foundation.
3. Introduce structured adaptation outputs early, even if they begin as text-first or metadata-first artifacts.

This avoids two bad outcomes:

- fixing the comic maker in a way that blocks future film/music growth
- overbuilding a giant studio platform before the current comic output is dependable

## User-Facing Outcomes

After this work, the product should move toward these outcomes:

1. Comic pages render with deliberate page specs, panel specs, and image aspect handling.
2. The user can choose more intentional output settings instead of relying on hidden defaults.
3. A generation run creates reusable project assets, not just a final PDF.
4. The same source project can later feed comic, screenplay/storyboard, and music-brief outputs.

## Architecture

### 1. Project Layer

Add a reusable project model as the new source of truth.

It should carry:

- project id, title, and original premise
- genre, tone, audience, and format intent
- character summaries
- world notes
- visual direction
- output sizing presets
- adaptation goals

This becomes the backbone for every generator instead of treating each run as an isolated comic request.

### 2. Story Development Layer

Add a structured story-development stage that derives reusable narrative assets from the user prompt.

It should produce:

- synopsis
- issue or chapter outline
- scene or beat list
- emotional arc or motif notes
- adaptation-friendly summaries

This layer should feed both:

- comic page breakdown generation
- future screen/storyboard generation

### 3. Visual Production Layer

Refactor visual generation around explicit render targets rather than implicit defaults.

It should define:

- page format
- page aspect ratio
- panel aspect preferences
- cover aspect and resolution
- render presets per export type
- prompt-building rules that preserve art direction and framing intent

This is the main place where the current sizing issues get solved properly.

### 4. Export Layer

Support multiple artifact types from the same project package.

Phase-one exports:

- PDF comic
- CBZ comic
- project asset JSON
- story-bible style structured output
- screen adaptation outline
- music brief package

The movie/show and music outputs do not need to be full media generation in phase one. They do need to be first-class structured artifacts so the repo is moving toward the intended studio workflow.

### 5. UI Workflow Layer

Evolve the WebUI from a single flat comic form into a guided project workflow.

Suggested stages:

1. Story setup
2. Visual and output settings
3. Comic generation
4. Adaptation assets
5. Downloads and regeneration

## Data Model Changes

The current `ComicScript` and `ComicResult` types are not enough by themselves.

Introduce higher-level models such as:

- `StoryProject`
- `StoryBible`
- `RenderProfile`
- `AdaptationPackage`
- `MusicCuePackage`

The comic-specific structures should remain, but become derived artifacts rather than the only canonical model.

### RenderProfile

This should be the central sizing contract.

It should hold:

- target page size preset, such as comic trim, US letter, or widescreen storyboard
- page width and height
- page bleed or margin intent
- default panel aspect ratio policy
- per-export image resolutions
- cover resolution and aspect

Every layer that currently guesses at size should read from this model instead.

## Sizing And Output Fixes

### Problem

The current system exposes image aspect settings in the UI, but the main generation and export path still behaves inconsistently:

- image generation defaults to square dimensions
- cover generation hardcodes a cinematic size
- PDF pages use fixed `LETTER` output
- panel layout and image fitting are only partially coordinated

### Required Fixes

1. Add a single source of truth for output sizing.
2. Ensure panel image requests use explicit target dimensions derived from the chosen render profile.
3. Ensure cover generation uses the same profile system instead of a hardcoded special case.
4. Allow export targets such as comic print, digital portrait, or widescreen storyboard.
5. Preserve aspect ratio intentionally and expose the chosen behavior clearly.

### Expected Behavior

If a user selects a widescreen or storyboard-oriented project, the render targets should follow that choice through:

- panel prompt planning
- provider image request size
- page layout selection
- PDF assembly
- cover export

If a user selects a print-comic profile, the outputs should instead optimize for comic-page readability and balanced panel composition.

## Future Show Or Movie Path

This repository should move toward a screen-adaptation workflow without pretending to generate a finished film immediately.

Phase-one screen outputs should include:

- scene list
- adaptation outline
- shot-friendly beat breakdown
- storyboard-friendly visual summaries
- optional dialogue and narration separation

This creates a bridge from comic creation into a future show or movie toolchain.

## Future Music Path

The song and soundtrack direction should begin as structured creative outputs tied to the project.

Phase-one music outputs should include:

- theme-song concept
- lyric prompt or draft
- soundtrack cue list
- mood and instrumentation notes
- scene-to-cue mapping

Later media-generation systems can consume these artifacts, but phase one should establish the schema and workflow now.

## Implementation Strategy

### Phase 1: Foundation And Output Fixes

- introduce project and render-profile models
- fix image sizing flow end-to-end
- expand export metadata and saved artifacts
- keep existing comic generation path working

### Phase 2: Adaptation Artifacts

- derive story bible assets
- add screen adaptation outline export
- add soundtrack and song-brief export
- expose them in the UI as downloadable outputs

### Phase 3: Richer Regeneration And Creative Controls

- allow targeted regeneration by page, panel, cover, scene, or cue
- add continuity controls for character or location consistency
- add project-level presets for comic, film, and music goals

## Testing Strategy

Testing should stay deterministic with the `mock` provider wherever possible.

Required coverage areas:

1. Render-profile normalization
2. Panel image target dimension selection
3. PDF and CBZ export behavior across multiple output profiles
4. Project artifact generation
5. Adaptation-package and music-package mock outputs

Add source-adjacent tests that prove the new output-spec pipeline is obeyed even without real provider credentials.

## Risks

### Over-scoping

Trying to fully build comic, movie, and music generation at once would stall delivery. The repo should instead add a durable shared foundation and phase in richer media outputs.

### Backward Compatibility

Existing callers may depend on `createComic()` returning the current `ComicResult` shape. New project-level artifacts should be additive or carefully versioned.

### UI Complexity

If the WebUI becomes a large flat form, the new power will feel more confusing. The UI should shift toward staged workflow panels instead of only adding more fields.

## Recommendation

Approve a hybrid redesign:

1. fix comic sizing and output correctness immediately
2. introduce a reusable project and render-profile foundation
3. add structured screen-adaptation and music-brief outputs as first-class artifacts

This gives the current product a better comic result now while making the longer-term studio vision materially more true in this codebase.
