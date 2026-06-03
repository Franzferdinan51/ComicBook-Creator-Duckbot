---
name: comic-creator
description: AI-powered multi-page comic book creator. Takes a story prompt, generates a page-by-page script with panel descriptions and dialogue, creates panel art via the configured image provider, and outputs a PDF or CBZ.
triggers:
  - comic
  - comic book
  - manga
  - graphic novel
  - make a comic
  - draw a comic
  - create comic
  - make a manga
---

# Comic Creator

Turn a story prompt into a multi-page AI-generated comic book.

## When to use

The user asks to "make a comic about X", "draw a manga of Y", or wants a multi-page visual narrative.

## Workflow

1. Confirm the story prompt and any style preferences (manga, noir, cartoon, watercolor, etc.)
2. Confirm page count (default 4) and panels per page (default 4, 2x2 grid)
3. Confirm provider preference. The default auto-picks a configured real text/image provider (`minimax` → `openrouter` → `lmstudio` → `mock`); override with `--text-provider` / `--image-provider` if the user wants a different one. Music defaults to `mock` and can be selected with `--music-provider`.
4. Run `createComic(story, options)` from the skill entry
5. Report the output PDF path; offer to show a preview

## Inputs

- `story: string` — the story premise or full plot
- `options: ComicOptions` — art style, page count, provider, output path

## Outputs

- `ComicResult` with:
  - `outputPath`: path to the PDF (or CBZ directory)
  - `script`: the generated ComicScript
  - `pages`: array of `{page, imagePath}` for inspection

## Provider notes

The comic creator supports seven built-in providers for text and image
generation. Resolution order is `process.env` → `~/.openclaw/openclaw.json`
(`models.providers.<name>`) → built-in defaults. Visit `/api/providers` (or
the Settings page in the WebUI) to see what's configured in your environment.

- `mock` — deterministic, no API calls. Best for testing and dry runs.
- `minimax` — MiniMax AI Platform. Auto-detects the API shape:
  - If `baseUrl` contains `/anthropic/` (or `api: "anthropic-messages"` in
    `openclaw.json`), uses Anthropic Messages API at `{baseUrl}/messages` for text.
  - For image, always uses the native path `{baseUrl}/image_generation` with
    `response_format: "base64"` and `image-01` as the default model.
  - Env: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL` (default `https://api.minimax.io/v1`).
- `openrouter` — OpenRouter at `https://openrouter.ai/api/v1`. For text uses
  `/chat/completions`; for image uses `/images/generations` with the
  `openrouter/auto` (text) or `black-forest-labs/flux.1-schnell` (image) defaults.
  - Env: `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`.
- `lmstudio` — local LM Studio at `http://127.0.0.1:1234/v1` (override with
  `LMSTUDIO_BASE_URL`). For loopback URLs the provider skips the `Authorization`
  header entirely. To force a key, set `LMSTUDIO_API_KEY` in env.
- `xai` — xAI / Grok. OpenAI-compatible at `https://api.x.ai/v1`. Text uses
  `/chat/completions` with `grok-2-latest` (or `grok-2-1212` / `grok-beta` /
  `grok-2-vision-1212` / `grok-4.3` / `grok-4.20-0309-reasoning`). Image uses
  `/images/generations` with `grok-imagine-image` (or
  `grok-imagine-image-quality` for higher fidelity). Note: `grok-2-image`
  is NOT a valid model id and returns 404. Set `XAI_API_KEY` (or
  `GROK_API_KEY`), or sign in via the WebUI's xAI OAuth flow.
- `gemini` — Google Gemini. Text uses the OpenAI-compat shim at
  `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
  with `gemini-2.0-flash` / `gemini-2.5-pro` / `gemini-2.5-flash`. Image
  uses the NATIVE `generateContent` endpoint with
  `responseModalities: ["TEXT", "IMAGE"]` and `gemini-2.0-flash-exp` (or
  `imagen-3.0-generate-002` for native Imagen). Set `GEMINI_API_KEY` (or
  `GOOGLE_API_KEY`).
- `comfyui` — local ComfyUI with the OpenAI-compat server enabled
  (`python main.py --enable-openai-api --port 8188`). Points at
  `http://127.0.0.1:8188/v1` by default; no auth required on loopback. Use any
  loaded checkpoint as the `imageModel` (e.g.
  `sd_xl_base_1.0.safetensors`, `flux1-dev-fp8.safetensors`,
  `sdxl_lightning_4step.safetensors`).
- `<custom>` — any other OpenAI-compatible endpoint (LocalAI, Ollama with
  `OPENAI_COMPAT=true`, vLLM, your own proxy, etc.). Add through the
  WebUI Settings page → "Custom OpenAI-compatible endpoints".

**Default image gen size for MiniMax**: the API requires `width` and `height`
to be in `[512, 2048]`. Panel images are stored as-is (PNG or JPEG) and
served with the matching `Content-Type` by the panel-image route.

**Image model override**: the `imageProvider` model defaults to
provider-specific values (`image-01` for MiniMax, `grok-imagine-image` for xAI,
`gemini-2.0-flash-exp` for Gemini, `sdxl` for LM Studio, `flux.1-schnell` for
OpenRouter). Pass `--image-model=…` (CLI) or include `imageModel` in the
request body to override.

## Multi-page

Default is 4 pages × 4 panels (2x2 grid). Other supported layouts:
- `grid-2x2`: 4 panels in 2 rows of 2
- `grid-2x3`: 6 panels in 3 rows of 2
- `strip-3`: 3 panels in a single row
- `custom`: auto-arrange N panels into a roughly square grid

## Code layout

```
comic-creator/
├── SKILL.md              # this file
├── package.json
├── tsconfig.json
├── README.md
├── webui/                # static frontend (built by separate task)
│   └── index.html
├── state/                # persisted user state (gitignore)
│   ├── history.json
│   └── settings.json
└── src/
    ├── index.ts          # main entry, exports createComic + startWebUI
    ├── types.ts          # shared types contract — do not change
    ├── providers/        # text + image + music provider factories
    ├── pipeline/         # script gen + panel image gen
    ├── assembler/        # PDF/CBZ page assembly
    │   ├── index.ts
    │   ├── layouts.ts
    │   └── __test__.ts
    └── server/           # WebUI HTTP server + storage
        ├── index.ts      # Express app entry
        ├── routes.ts     # API route handlers
        ├── jobs.ts       # in-memory job manager
        ├── storage.ts    # JSON persistence (history + settings)
        ├── README.md     # full API contract — start here
        └── __test__.ts   # integration test (68 assertions)
```

## CLI usage

The skill ships a `comic-creator` bin entry. From the skill directory:

```bash
cd ~/.openclaw/workspace/skills/comic-creator
node bin/comic-creator.mjs --help
node bin/comic-creator.mjs "A robot discovers a garden"
node bin/comic-creator.mjs --style=manga --pages=2 --panels=2 \
  --image-provider=mock --output=/tmp/test.pdf \
  "A robot discovers a garden"
```

After `npm install -g .` (or `npm link` from the skill dir) the
`comic-creator` command is on `PATH` system-wide.

### Flags

| Flag | Default | Description |
| --- | --- | --- |
| `--style=<name>` | `manga` | Art style (manga, noir, cartoon, watercolor, …) |
| `--pages=<n>` | `4` | Number of pages |
| `--panels=<n>` | `4` | Panels per page |
| `--layout=<name>` | `auto` | `grid-2x2` \| `grid-2x3` \| `strip-3` \| `custom` (overrides `--panels`) |
| `--format=<pdf\|cbz>` | `pdf` | Output container |
| `--text-provider=<name>` | `mock` | Script-generation provider |
| `--image-provider=<name>` | `mock` | Panel-image provider |
| `--music-provider=<name>` | `mock` | Theme-song/audio provider |
| `--output-profile=<name>` | `comic-print` | `comic-print` \| `digital-portrait` \| `storyboard-widescreen` |
| `--output=<path>` | auto | Override the output path (default: `~/.openclaw/workspace/output/comics/<title>-<ts>.pdf`) |
| `--seed=<n>` | `0` | Deterministic seed (mock provider) |
| `--help` | — | Print usage and exit |
| `--version` | — | Print version and exit |

### I/O streams

- **stdout**: the final output path (one line). Safe to pipe
  (`| xargs open` or `| pbcopy`).
- **stderr**: progress messages for the three pipeline phases
  (`[1/3] generating script`, `[2/3] generating panel images`,
  `[3/3] assembling comic`) plus per-step summaries.
- **exit code**: `0` on success, `1` on pipeline failure, `2` on arg
  parse error (unknown flag, missing `<story>`, bad numeric value, …).

Each CLI run also writes a sibling `*-agent-guidance.md` file next to the
main export so Hermes/OpenClaw and other external agents can continue from
the same project, adaptation, and music context.
It also writes `*-song-sheet.md` and `*-theme.wav` through the selected music
provider so music follow-up agents have both a human-readable song plan and a
playable audio placeholder.
For show/movie handoff, it writes `*-storyboard-package.json` and
`*-animatic-timeline.json` beside the comic export.

The stable external-agent contract is documented in
[`docs/agents/external-agent-guide.md`](./docs/agents/external-agent-guide.md).

The bin shim (`bin/comic-creator.mjs`) re-invokes node with `tsx/esm`
preloaded, so the TypeScript source in `src/cli.ts` runs directly
with no build step.

## Integration

### Hermes

The skill is also registered as a Hermes skill at
`~/.hermes/skills/media/comic-creator/`. Hermes discovers it through
the standard `~/.hermes/skills/<category>/<skill-name>/SKILL.md` layout
and exposes it as `/comic-creator` slash command. The Hermes SKILL.md
has Hermes-specific frontmatter (`version`, `author`, `license`,
`metadata.hermes.tags`, `prerequisites`) and points back at this
OpenClaw skill for the actual implementation. A symlink at
`~/.hermes/skills/media/comic-creator/bin/comic-creator.mjs` reaches
the same `node` bin entry the OpenClaw skill ships.

### WebUI

The skill also exposes an HTTP WebUI on port 3008 — see the
[WebUI](#webui) section below. The CLI and the WebUI share the same
`createComic()` core; the CLI is for scripts and the WebUI is for
interactive use.

## Quick test (assembler only)

```bash
cd ~/.openclaw/workspace/skills/comic-creator
npm install --no-audit --no-fund
npx tsx src/assembler/__test__.ts
```

Should print `PASS` and produce a valid PDF at `/tmp/assembler-test.pdf`.

## WebUI

Start the WebUI HTTP server and open the browser:

```bash
cd ~/.openclaw/workspace/skills/comic-creator
npx tsx -e "import { startWebUI } from './src/index.ts'; startWebUI({ port: 3008 });"
```

Then open `http://localhost:3008` in your browser.

The server also runs as a standalone script:

```bash
npx tsx src/server/index.ts
# → comic-creator WebUI listening on http://localhost:3008
```

The port can be configured via the `COMIC_WEBUI_PORT` environment variable
(set to `0` for an ephemeral port — useful for tests).

### API

The full API contract lives in [`src/server/README.md`](./src/server/README.md).
Briefly: the server exposes a JSON API at `/api/*` and serves the static
frontend from the same origin. Key endpoints:

- `POST /api/comic` — kick off a comic from a story
- `GET  /api/comic/:jobId` — poll job status
- `GET  /api/comic/:jobId/pdf` — stream the generated PDF
- `GET  /api/comic/:jobId/images/:panelId` — stream a single panel PNG
- `GET  /api/history` — list recent comics (persisted to disk)
- `GET  /api/providers` — list available text + image + music providers
- `GET  /api/settings` / `PUT /api/settings` — user preferences (persisted)

### State

Two files in `<skill>/state/` (gitignored):

- `history.json` — last 50 comics (jobId, title, output path, full script)
- `settings.json` — user preferences (default provider, art style, etc.)

### Testing the server

```bash
cd ~/.openclaw/workspace/skills/comic-creator
TMPDIR=/tmp npx tsx src/server/__test__.ts
```

Should print `68 passed, 0 failed`. The test boots the server on a random
port, exercises every route, and verifies atomic file writes.

## MCP server

The comic-creator also exposes a [Model Context Protocol](https://modelcontextprotocol.io)
server so external agents (OpenClaw gateway, Hermes, Claude Desktop, etc.)
can invoke the pipeline via the standard tool-calling interface.

```bash
cd ~/.openclaw/workspace/skills/comic-creator
npm install
npm link          # or: npm install -g .
comic-creator-mcp
```

The `comic-creator-mcp` binary speaks JSON-RPC over stdio and registers
eleven tools: `create_comic`, `get_comic`, `get_comic_pdf`,
`get_comic_image`, `get_agent_guidance`, `get_song_sheet`, `get_theme_audio`,
`get_storyboard_package`, `get_animatic_timeline`, `list_providers`,
`get_history`, `get_settings`, `update_settings`.

Point your MCP host at the `comic-creator-mcp` binary. Example config
for an MCP host that reads `~/.config/<host>/mcp_servers.json`:

```json
{
  "mcpServers": {
    "comic-creator": {
      "command": "comic-creator-mcp"
    }
  }
}
```

### Testing the MCP server

```bash
cd ~/.openclaw/workspace/skills/comic-creator
TMPDIR=/tmp npx tsx src/mcp/__test__.ts
```

Should print `52 passed, 0 failed`. The test spawns the MCP server as a
subprocess, exercises every tool end-to-end (`create_comic` →
`get_comic` → `get_comic_pdf` / `get_comic_image`), and verifies the
PDF and PNG bytes round-trip cleanly.
