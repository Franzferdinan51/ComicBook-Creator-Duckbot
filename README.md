# Comic Studio

AI-powered creative studio — generate multi-page comics, screen/show storyboards, and music cues from a single story prompt.

Take a story → get a comic PDF, a screen-adaptation outline, a music-brief package, and a reusable project that external agents can keep building from.

## Getting started

**Double-click `start.command`** in this folder — opens the live source WebUI at `http://localhost:3008` with no terminal needed.

Or from the terminal:

```bash
npm install
npm start
# → http://localhost:3008
```

## What gets generated

| Artifact | Description |
|----------|-------------|
| `outputPath` | Comic PDF download |
| `studioBundlePath` | Unified JSON handoff for external agents; start here first |
| `projectPath` | Full `*-project.json` source-of-truth handoff for external agents |
| `agentPlaybookPath` | Repo playbook path for Hermes/OpenClaw agent follow-up |
| `agentWorkflowPackagePath` | Structured Hermes/OpenClaw execution pack across story, video, and music |
| `productionRunManifestPath` | MiniMax/Hermes/OpenClaw run order with preflight gates, music commands, video polling, and review checks |
| `coverImagePath` | AI-generated cover page image |
| `storyBible` | Premise, synopsis, chapter outline, scene beats |
| `adaptationPackage` | Per-scene screenplay summaries + visual goals |
| `screenplayPath` | Markdown screenplay handoff for movie/show development |
| `directorBriefPath` | Markdown production brief connecting story, visuals, trailer, and score |
| `seriesPackagePath` | Episodic show-bible JSON with episode seeds and showrunner notes |
| `trailerPackagePath` | Pitch / teaser trailer package for show or movie handoff |
| `videoPackagePath` | MiniMax-ready video generation package for real motion clips |
| `musicCuePackage` | Mood cues, song draft, theme-prompt for audio tools |
| `storyboardPackagePath` | Shot-by-shot show/movie storyboard package |
| `animaticTimelinePath` | Video/audio timing timeline for rough animatics |
| `songSheetPath` | Markdown song sheet for music follow-up |
| `musicCuePackagePath` | Music cue / score brief JSON for show/movie handoff |
| `songAudioPath` | Generated theme audio from the selected music provider |
| `agentGuidancePath` | Markdown handoff so external agents keep working from the same project |

## Project goals

Choose a goal preset to steer the generated handoff toward the right studio workflow:

| Goal | Best for |
|------|----------|
| `comic` | Comic-first pages and a readable issue flow |
| `screen` | Show/movie storyboards and shot lists |
| `music` | Song-first passes and soundtrack planning |
| `studio` | Balanced comic, adaptation, and music handoff |

You can also save a default project goal in the WebUI Settings page so new runs start with your preferred workflow.
When `screen` is selected, the app defaults to the storyboard widescreen render profile unless you explicitly choose another output profile.

## Quick example

```ts
import { createComic } from 'comic-creator';

const result = await createComic('A shy robot discovers a garden on Mars', {
  artStyle: 'manga',
  imageProvider: 'mock',     // or 'openrouter', 'lmstudio', 'minimax', 'xai', 'gemini'
  pageCount: 4,
  panelsPerPage: 4,
});

console.log('PDF:', result.outputPath);
console.log('Story Bible:', result.storyBible.synopsis);
console.log('Music cues:', result.musicCuePackage.cues);
console.log('Adaptation scenes:', result.adaptationPackage.sceneOutline);
```

## Layouts

- `grid-2x2` — 4 panels in 2 rows of 2 (default)
- `grid-2x3` — 6 panels in 3 rows of 2
- `strip-3` — 3 panels in a single row (good for action sequences)
- `custom` — auto-arrange N panels into a roughly square grid

## Output profiles

| Profile | Image size | Best for |
|---------|-----------|----------|
| `comic-print` | 1024×1536 | Print comics, physical distribution |
| `digital-portrait` | 896×1152 | Webtoons, vertical scroll |
| `storyboard-widescreen` | 1536×864 | Show/movie storyboards, cinematic |

## Providers

### Image (panel art + cover)

| Provider | Default model | Notes |
|----------|--------------|-------|
| `mock` | — | Color grid placeholder; no API calls |
| `openrouter` | `flux.1-schnell` | FLUX, DALL-E, Stable Diffusion |
| `minimax` | `image-01` | MiniMax native; prompt optimizer supported |
| `lmstudio` | `sdxl` | Local SDXL — free, private |
| `xai` | `grok-imagine-image` | High-fidelity xAI image gen |
| `gemini` | `imagen-3.0-generate-002` | Google Imagen |
| `comfyui` | Local checkpoint | Any `.safetensors` via ComfyUI |
| `<custom>` | — | Any OpenAI-compatible endpoint via Settings |

### Text (script + story bible + music prompts)

| Provider | Default model |
|----------|--------------|
| `mock` | — |
| `openrouter` | `openrouter/auto` |
| `minimax` | `MiniMax-M3` |
| `lmstudio` | Local model (loopback, no key) |
| `xai` | `grok-2-latest` |
| `gemini` | `gemini-2.0-flash` |

### Music

`mock` provider ships today with a deterministic WAV placeholder. `minimax` runs the MiniMax music CLI and writes MP3 theme audio. Real audio generation plugs into the same `MusicProvider` interface.

## WebUI

```
open start.command
# → http://localhost:3008
```

The WebUI gives you:
- Story input + style/format/provider options
- Project goal preset for comic / screen / music / studio workflows
- Comic Reader with a panel-page view that still works if the PDF preview cannot load
- Movie / Show tab with pitch, trailer, story, series, script, shots, previs, timeline, music, agents, and deliverables tabs
- Live job status and progress
- PDF preview with page navigation and thumbnails
- Refreshed studio theme with clearer workspace navigation
- Download as PDF or CBZ, or grab all panel images as a ZIP
- Cover image preview + download
- Story Bible, Adaptation Package, and Music Cue Package download cards
- History of past comics with generated cover thumbnails
- Provider credential settings
- Production readiness panel in Settings for Node.js, output paths, provider readiness, MiniMax CLI, and Hermes/OpenClaw guidance

## CLI

```bash
node bin/comic-creator.mjs "A robot discovers a garden"
node bin/comic-creator.mjs --style=noir --pages=4 --panels=3 --output=/tmp/my-comic.pdf "A robot discovers a garden"
node bin/comic-creator.mjs --agent-playbook
```

| Flag | Default | Description |
|------|---------|-------------|
| `--style=<name>` | `manga` | Art style |
| `--pages=<n>` | `4` | Number of pages |
| `--panels=<n>` | `4` | Panels per page |
| `--layout=<name>` | `auto` | `grid-2x2` \| `grid-2x3` \| `strip-3` \| `custom` |
| `--format=<pdf\|cbz>` | `pdf` | Output container |
| `--image-provider=<name>` | `mock` | Image provider |
| `--text-provider=<name>` | `mock` | Text/script provider |
| `--music-provider=<name>` | `mock` | Music provider |
| `--project-goal=<name>` | `comic` | `comic` \| `screen` \| `music` \| `studio` |
| `--character-reference=<path-or-url>` | — | Repeatable reference image URL/path used for recurring character consistency in MiniMax image generation |
| `--output-profile=<name>` | `comic-print` | Output profile |
| `--output=<path>` | auto | Override output path |
| `--json` | off | Print the full `ComicResult` JSON |
| `--studio-bundle` | off | Print the unified studio bundle JSON |
| `--agent-workflow-package` | off | Print the Hermes/OpenClaw workflow package JSON |
| `--production-run-manifest` | off | Print the MiniMax production run manifest JSON |
| `--screenplay` | off | Print the generated screenplay markdown |
| `--director-brief` | off | Print the generated director brief markdown |
| `--video-package` | off | Print the generated MiniMax-ready video package JSON |
| `--series-package` | off | Print the episodic series package JSON |
| `--trailer-package` | off | Print the trailer package JSON |
| `--music-cue-package` | off | Print the music cue package JSON |
| `--agent-playbook` | off | Print the repo-level Hermes/OpenClaw playbook |
| `--preflight` | off | Print production readiness diagnostics JSON |
| `--share=<jobId>` | off | Print the public share-card JSON for an existing history entry |
| `--search-history` | off | List history entries (newest first); use with `--search-q`, `--search-tags`, `--search-favorites`, `--search-project-goal`, `--limit` |
| `--search-q=<text>` | — | Substring filter for `--search-history` (matches title, prompt, tags) |
| `--search-tags=<a,b>` | — | Comma-separated tag filter; entries must include ALL listed tags |
| `--search-favorites` | off | When set with `--search-history`, only return favorited entries |
| `--search-project-goal=<name>` | — | Filter history by `comic` \| `screen` \| `music` \| `studio` |
| `--favorite=<jobId>` | — | Mark a history entry as a favorite (idempotent) |
| `--unfavorite=<jobId>` | — | Remove the favorite flag from a history entry (idempotent) |
| `--tag=<jobId>` | — | Edit tags for a history entry (reads tags from the next `--tags=<a,b>` flag) |
| `--tags=<a,b>` | — | Comma-separated tag list, lowercased, deduped, max 16 |
| `--run-production=<jobId>` | — | Actually run the production run manifest against MiniMax (`mmx music generate`, `mmx video generate --async` + polling, `mmx video download`); writes a `*-production-run-report.json` next to the PDF |
| `--run-production-dry-run` | off | Plan the production run but skip real `mmx` calls (with `--run-production`) |
| `--run-production-out=<dir>` | — | Override the output directory for produced theme audio, video clips, and the run report |
| `--run-production-resume` | off | Resume from a prior in-flight or errored run; skip phases already done with outputs on disk (with `--run-production`). Preflight always re-runs. Ignored in `--run-production-dry-run`. |

## MCP server

External agents (OpenClaw, Claude Desktop, etc.) can invoke the pipeline via MCP tool calls.

```bash
comic-creator-mcp
```

Tools: `create_comic`, `regenerate_comic`, `get_comic`, `get_project`, `get_agent_guidance`, `get_screenplay`, `get_director_brief`, `get_agent_playbook`, `get_agent_workflow_package`, `get_production_run_manifest`, `run_production_manifest`, `get_production_run_report`, `get_studio_bundle`, `get_music_cue_package`, `get_series_package`, `get_trailer_package`, `get_video_package`, `get_song_sheet`, `get_storyboard_package`, `get_animatic_timeline`, `get_theme_audio`, `get_share_card`, `get_comic_pdf`, `get_comic_cover`, `get_comic_image`, `list_providers`, `get_preflight`, `get_history`, `search_history`, `patch_history_meta`, `get_settings`, `update_settings`.

MCP provider fields are registry-based, not hard-coded. Agents should call `list_providers` first, then pass any registered text/image/music provider name into `create_comic` or `regenerate_comic`, including built-ins such as `xai`, `gemini`, `comfyui`, `minimax`, and WebUI-created custom OpenAI-compatible providers.

For stronger recurring-character continuity, pass one or more `--character-reference=...` flags in the CLI, `characterReferences` in HTTP or MCP, or fill the WebUI Character consistency references box. The app forwards these to MiniMax as `subject_reference` entries for panel art and cover generation, then carries the same continuity data into the movie/show handoff so generated video commands can use `--first-frame` and `--subject-image` when those references exist.

Run `comic-creator --preflight`, `GET /api/preflight`, MCP `get_preflight`, or the WebUI Production readiness panel in Settings before production runs. The report checks Node.js, output directory writability, package entrypoints, provider readiness, MiniMax CLI availability, and the Hermes/OpenClaw guidance files.

The WebUI result panel also exposes a unified studio bundle download that packages the project, adaptation, music, and artifact-path map into one JSON handoff. External agents should start from preflight, then the studio bundle, then open the specialized files as needed. The workflow package is the next best handoff when Hermes/OpenClaw needs a track-by-track execution plan across story, video, and music. The production run manifest is the concrete next handoff when an agent is ready to run MiniMax music/video generation with `mmx auth status`, `mmx music generate`, `mmx video generate`, `mmx video task get`, and `mmx video download`. When score planning is the next step, grab the music cue package before the theme audio. When the next step is real motion instead of a storyboard-only pass, use the video package and production run manifest to drive `mmx video` clip generation.

For history-loaded projects, several downloads now fall back to the structured artifact already stored in the result bundle when the original exported file is missing on disk. That keeps screenplay, director brief, storyboard, animatic, series, trailer, video, music, and agent workflow handoffs usable after reopens or partial cleanup.

### Resuming an interrupted production run

A real `mmx video generate` task can take 5–10 minutes per clip. If a
run times out on clip 3, you don't want to re-pay for clips 1 and 2.
Pass `--run-production-resume` (or `resume: true` in the
`/api/comic/:jobId/run-production` body, or `resume: true` to the
`run_production_manifest` MCP tool) and the runner will:

1. Load the prior `*-production-run-report.json` from the output dir.
2. Carry forward any phase whose `status === 'done'` AND whose
   expected output files still exist on disk.
3. Re-run only the phases that need work (the ones that errored or
   have missing outputs). Preflight always re-runs (it's cheap and
   gates are time-sensitive).
4. Mark carried-forward phases with a "reused from prior report"
   step so the WebUI can show what was reused.

Resume is **ignored** in `--run-production-dry-run` mode (dry-runs
never read the on-disk report, so there's nothing to reuse).

### Share cards and history curation

Every history entry exposes a public, secret-free share card via:

- HTTP: `GET /api/share/:jobId` — title, art style, project goal, page/panel counts, preview URLs, all artifact URLs
- MCP: `get_share_card(jobId)` — same payload, callable from any MCP client
- CLI: `comic-creator --share=<jobId>` — prints the JSON to stdout

Use these for posting a "view this comic" link in chat without leaking file paths or settings.

History entries can also be curated from the CLI / MCP / HTTP — search by free text, tags, project goal, or favorites-only, then star or re-tag entries to organize your library:

- HTTP: `GET /api/history?q=...&tags=...&favorite=true&projectGoal=screen&limit=10` and `PATCH /api/history/:jobId` with `{ favorite, tags, projectGoal }`
- MCP: `search_history(...)` and `patch_history_meta(jobId, { favorite, tags, projectGoal })`
- CLI: `--search-history --search-q=robot --search-favorites --search-project-goal=screen`, plus `--favorite=<jobId>`, `--unfavorite=<jobId>`, `--tag=<jobId> --tags=cult-classic,redo`

## Agent playbook

External agents should start with [`docs/agents/hermes-openclaw-playbook.md`](docs/agents/hermes-openclaw-playbook.md) and then load the generated `*-agent-guidance.md` handoff for the specific comic run.

## Tests

```bash
npm test          # all tests
npm run test:server   # server integration
npm run test:mcp      # MCP end-to-end
```

## Project structure

```
comic-creator/
├── start.command            # double-click to launch WebUI (macOS)
├── SKILL.md                 # OpenClaw skill entry
├── README.md                # this file
├── package.json
├── bin/
│   ├── comic-creator.mjs       # CLI entry point
│   └── comic-creator-mcp.mjs    # MCP server entry point
├── webui/                  # Static WebUI (served by the server)
│   ├── index.html
│   ├── app.css / app.js
│   └── components/
├── src/
│   ├── index.ts            # createComic() + startWebUI()
│   ├── types.ts            # Shared types (ComicScript, ComicResult, StoryProject…)
│   ├── cli.ts              # CLI entry
│   ├── providers/           # Text + image + music providers
│   ├── pipeline/           # generateScript() + generatePanelImages()
│   ├── project/             # StoryProject + StoryBible + MusicAssets + VideoAssets
│   │   ├── story-project.ts
│   │   ├── render-profile.ts
│   │   ├── music-assets.ts
│   │   ├── video-assets.ts
│   │   └── agent-guidance.ts
│   ├── assembler/          # PDF/CBZ page assembly
│   └── server/             # WebUI HTTP API
├── docs/
│   └── agents/             # External agent integration guide
└── state/                  # Persisted state (history + settings)
```

## License

MIT — Franzferdinan51 / DuckBot
