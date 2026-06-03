# Comic Studio

AI-powered creative studio — generate multi-page comics, screen/show storyboards, and music cues from a single story prompt.

Take a story → get a comic PDF, a screen-adaptation outline, a music-brief package, and a reusable project that external agents can keep building from.

## Getting started

**Double-click `start.command`** in this folder — opens the WebUI at `http://localhost:3008` with no terminal needed.

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
| `coverImagePath` | AI-generated cover page image |
| `storyBible` | Premise, synopsis, chapter outline, scene beats |
| `adaptationPackage` | Per-scene screenplay summaries + visual goals |
| `musicCuePackage` | Mood cues, song draft, theme-prompt for audio tools |
| `storyboardPackagePath` | Shot-by-shot show/movie storyboard package |
| `animaticTimelinePath` | Video/audio timing timeline for rough animatics |
| `songSheetPath` | Markdown song sheet for music follow-up |
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
- Live job status and progress
- PDF preview with page navigation and thumbnails
- Download as PDF or CBZ, or grab all panel images as a ZIP
- Cover image preview + download
- Story Bible, Adaptation Package, and Music Cue Package download cards
- History of past comics
- Provider credential settings

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
| `--output-profile=<name>` | `comic-print` | Output profile |
| `--output=<path>` | auto | Override output path |
| `--json` | off | Print the full `ComicResult` JSON |
| `--studio-bundle` | off | Print the unified studio bundle JSON |
| `--agent-playbook` | off | Print the repo-level Hermes/OpenClaw playbook |

## MCP server

External agents (OpenClaw, Claude Desktop, etc.) can invoke the pipeline via MCP tool calls.

```bash
comic-creator-mcp
```

Tools: `create_comic`, `regenerate_comic`, `get_comic`, `get_project`, `get_agent_guidance`, `get_agent_playbook`, `get_studio_bundle`, `get_song_sheet`, `get_storyboard_package`, `get_animatic_timeline`, `get_theme_audio`, `get_comic_pdf`, `get_comic_cover`, `get_comic_image`, `list_providers`, `get_history`, `get_settings`, `update_settings`.

The WebUI result panel also exposes a unified studio bundle download that packages the project, adaptation, music, and artifact-path map into one JSON handoff. External agents should start from the studio bundle first, then open the specialized files as needed.

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
