# comic-creator WebUI — API Contract

This is the binding contract for the comic-creator HTTP server. The frontend
task builds to this; the tests in `__test__.ts` verify it.

The server listens on `COMIC_WEBUI_PORT` (default `3008`). The frontend is
served from the same origin at `/` so the API can be reached at the relative
`/api/*` path.

## Quick start

```bash
cd ~/.openclaw/workspace/skills/comic-creator
npm install
npx tsx src/server/index.ts         # boots on 3008
# or programmatically:
npx tsx -e "import { startWebUI } from './src/index.ts'; startWebUI({ port: 3008 });"
```

## Stability

- All response shapes are stable. New optional fields may be added without a
  major version bump; new endpoints may be added at any time; existing
  endpoints and their required fields will not change shape within a major
  version.
- All error responses are `{ "error": "human-readable string" }` with an
  appropriate 4xx/5xx status code.

## Endpoints

| Method | Path                                    | Purpose                          |
|--------|-----------------------------------------|----------------------------------|
| GET    | `/api/health`                           | Liveness probe                   |
| GET    | `/api/providers`                        | Text + image providers + status  |
| GET    | `/api/settings`                         | Read user settings               |
| PUT    | `/api/settings`                         | Update user settings (partial)   |
| GET    | `/api/agent-playbook`                   | Stream the Hermes/OpenClaw playbook |
| POST   | `/api/comic`                            | Kick off a new comic generation  |
| GET    | `/api/comic/:jobId`                     | Poll job status                  |
| GET    | `/api/comic/:jobId/pdf`                 | Stream the generated PDF         |
| GET    | `/api/comic/:jobId/cbz`                 | Stream the generated CBZ         |
| GET    | `/api/comic/:jobId/cover`               | Stream the generated cover image |
| GET    | `/api/comic/:jobId/project`             | Stream the full project JSON     |
| GET    | `/api/comic/:jobId/agent-guidance`      | Stream the agent guidance markdown |
| GET    | `/api/comic/:jobId/agent-workflow-package` | Stream the Hermes/OpenClaw workflow JSON |
| GET    | `/api/comic/:jobId/screenplay`          | Stream the screenplay markdown   |
| GET    | `/api/comic/:jobId/director-brief`      | Stream the director brief markdown |
| GET    | `/api/comic/:jobId/storyboard-package`  | Stream the storyboard JSON       |
| GET    | `/api/comic/:jobId/music-cue-package`   | Stream the music cue JSON        |
| GET    | `/api/comic/:jobId/song-sheet`          | Stream the theme song markdown   |
| GET    | `/api/comic/:jobId/theme-audio`         | Stream the generated theme audio |
| GET    | `/api/comic/:jobId/series-package`      | Stream the episodic series JSON  |
| GET    | `/api/comic/:jobId/trailer-package`     | Stream the trailer / teaser JSON |
| GET    | `/api/comic/:jobId/video-package`       | Stream the MiniMax-ready video JSON |
| GET    | `/api/comic/:jobId/animatic-timeline`   | Stream the animatic timeline JSON |
| GET    | `/api/comic/:jobId/studio-bundle`       | Stream the unified studio bundle |
| GET    | `/api/comic/:jobId/images/:panelId`     | Stream a single panel PNG        |
| POST   | `/api/comic/:jobId/regenerate`          | Re-run with new options          |
| DELETE | `/api/comic/:jobId`                     | Cancel/remove an in-memory job   |
| GET    | `/api/history`                          | List recent jobs                 |
| DELETE | `/api/history/:jobId`                   | Remove a job from history        |

---

### `GET /api/health`

**Response 200**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "uptime": 12.345
}
```

---

### `GET /api/providers`

**Response 200**
```json
{
  "text": [
    { "name": "mock",      "available": true,  "model": "mock" },
    { "name": "openrouter","available": false, "error": "apiKey missing" },
    { "name": "lmstudio",  "available": true,  "model": "qwen3.6-27b" },
    { "name": "minimax",   "available": false, "error": "apiKey missing" }
  ],
  "image": [
    { "name": "mock",      "available": true,  "model": "mock" },
    { "name": "openrouter","available": false, "error": "apiKey missing" },
    { "name": "lmstudio",  "available": true,  "model": "sdxl" },
    { "name": "minimax",   "available": false, "error": "apiKey missing" }
  ]
}
```

`available: true` means the provider is configured and ready to use.
The `mock` provider is always available.

---

### `GET /api/settings`

**Response 200**
```json
{
  "defaultProvider": "mock",
  "defaultTextProvider": "mock",
  "defaultImageProvider": "mock",
  "defaultArtStyle": "manga",
  "defaultPageCount": 4,
  "defaultOutputFormat": "pdf",
  "defaultProjectGoal": "comic"
}
```

### `PUT /api/settings`

**Body** (any subset of the fields above):
```json
{ "defaultArtStyle": "noir", "defaultPageCount": 6, "defaultProjectGoal": "screen" }
```

**Response 200** — the full merged settings object.

**400** on invalid `defaultOutputFormat` (must be `"pdf"` or `"cbz"`) or
`defaultPageCount` (must be integer 1-50), or `defaultProjectGoal` (must be
`"comic"`, `"screen"`, `"music"`, or `"studio"`).

---

### `GET /api/agent-playbook`

Streams the repository-level Hermes/OpenClaw playbook markdown used by external
agents and operators.

**Success response headers**
- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="hermes-openclaw-playbook.md"`

**404** if the playbook file is unavailable in the checkout.

---

### `POST /api/comic`

**Body**
```json
{
  "story": "A robot learns to garden",
  "options": {
    "artStyle": "manga",
    "imageProvider": "mock",
    "textProvider": "mock",
    "pageCount": 4,
    "panelsPerPage": 4,
    "outputFormat": "pdf",
    "seed": 0
  }
}
```

`options` is `Partial<ComicOptions>` — every field is optional. See
`src/types.ts` for the full shape.

**Response 202**
```json
{ "jobId": "e60aab73-0600-4e3b-b016-623360bad0d1" }
```

**400** if `story` is empty/missing.

---

### `GET /api/comic/:jobId`

**Response 200** (pending)
```json
{
  "status": "pending",
  "createdAt": "2026-06-01T19:08:23.123Z",
  "updatedAt": "2026-06-01T19:08:23.123Z"
}
```

**Response 200** (done)
```json
{
  "status": "done",
  "createdAt": "2026-06-01T19:08:23.123Z",
  "updatedAt": "2026-06-01T19:08:24.456Z",
  "result": {
    "script": {
      "title": "...",
      "artStyle": "manga",
      "pages": [
        {
          "pageNumber": 1,
          "layout": "grid-2x2",
          "panels": [
            { "id": "p1-panel1", "description": "...", "dialogue": ["..."], "caption": "..." }
          ]
        }
      ]
    },
    "outputPath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904.pdf",
    "pages": [
      { "page": { ... }, "imagePath": "/.../p1-panel1.png", "layout": "grid-2x2" }
    ]
  }
}
```

**Response 200** (error)
```json
{
  "status": "error",
  "error": "openrouter: OPENROUTER_API_KEY not set",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**404** if the job is unknown (in-memory only — see Lifecycle).

---

### `GET /api/comic/:jobId/pdf`

**Response 200** — streams the PDF binary.
- `Content-Type: application/pdf`
- `Content-Length: <size>`
- `Content-Disposition: inline; filename="<jobId>.pdf"`

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the on-disk file is gone.

---

### `GET /api/comic/:jobId/cbz`

Streams the generated CBZ archive for comic-reader apps.

**Success response headers**
- `Content-Type: application/vnd.comicbook+zip`
- `Content-Disposition: attachment; filename="<title>.cbz"`

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the archive is unavailable.

---

### `GET /api/comic/:jobId/cover`

Streams the generated cover or title image. The History UI uses this endpoint
for cover thumbnails.

**Success response headers**
- `Content-Type: image/png` or `image/jpeg`
- `Cache-Control: public, max-age=86400`

**404** if the job is unknown or no cover was generated.

---

### `GET /api/comic/:jobId/project`

Streams the full project JSON. If the persisted project file is unavailable,
the server falls back to the in-memory project object for completed jobs.

**Success response headers**
- `Content-Type: application/json; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-project.json"`

**404** if the job is unknown. **409** if the job isn't `done` yet.

---

### `GET /api/comic/:jobId/agent-guidance`

Streams the generated Hermes/OpenClaw/external-agent markdown handoff.

**Success response headers**
- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-agent-guidance.md"`

**404** if the job is unknown or no agent guidance exists for that comic.

---

### `GET /api/comic/:jobId/agent-workflow-package`

**Response 200** — streams the Hermes/OpenClaw workflow package JSON.
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="<jobId>-agent-workflow-package.json"`

This package is the structured execution handoff. It organizes story,
video, and music tracks, plus CLI, MCP, WebUI, and MiniMax command
blueprints for follow-up agents.

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the on-disk file is gone.

---

### `GET /api/comic/:jobId/screenplay`

Streams the generated screenplay markdown handoff.

**Success response headers**
- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-screenplay.md"`

**404** if the job is unknown or no screenplay exists for that comic.

---

### `GET /api/comic/:jobId/director-brief`

Streams the generated director brief markdown handoff.

**Success response headers**
- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-director-brief.md"`

**404** if the job is unknown or no director brief exists for that comic.

---

### `GET /api/comic/:jobId/storyboard-package`

Streams the generated storyboard JSON used for shot planning and previs.

**Success response headers**
- `Content-Type: application/json; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-storyboard-package.json"`

**404** if the job is unknown or no storyboard package exists for that comic.

---

### `GET /api/comic/:jobId/series-package`

Streams the generated episodic show-bible JSON.

**Success response headers**
- `Content-Type: application/json; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-series-package.json"`

**404** if the job is unknown or no series package exists for that comic.

---

### `GET /api/comic/:jobId/trailer-package`

**Response 200** — streams the trailer / teaser JSON.
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="<jobId>-trailer-package.json"`

The trailer package is the screen-adaptation pitch handoff. It packages the
logline, teaser beats, voice-over, and cut list used by the Movie / Show
workspace.

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the on-disk file is gone.

---

### `GET /api/comic/:jobId/video-package`

**Response 200** — streams the MiniMax-ready video generation JSON.
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="<jobId>-video-package.json"`

This package is the motion-generation handoff. It packages clip prompts,
camera language, cue alignment, and `mmx video` command scaffolding so the
project can move beyond a slideshow into generated clips.

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the on-disk file is gone.

---

### `GET /api/comic/:jobId/animatic-timeline`

Streams the generated animatic timeline JSON for lining up video clips and
theme/cue audio.

**Success response headers**
- `Content-Type: application/json; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-animatic-timeline.json"`

**404** if the job is unknown or no animatic timeline exists for that comic.

---

### `GET /api/comic/:jobId/studio-bundle`

Streams the unified studio bundle JSON. This is the preferred starting point
for external agents because it includes the project, script, adaptation package,
music package, agent workflow package, and artifact availability map.

**Success response headers**
- `Content-Type: application/json; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-studio-bundle.json"`

**404** if the job is unknown. **409** if the job isn't `done` yet.

---

### `GET /api/comic/:jobId/music-cue-package`

**Response 200** — streams the music cue / score brief JSON.
- `Content-Type: application/json`
- `Content-Disposition: attachment; filename="<jobId>-music-cue-package.json"`

This package is the score-planning handoff. It packages the cue map, song
draft, and generation prompt used by the Movie / Show workspace.

**404** if the job is unknown. **409** if the job isn't `done` yet.
**410** if the on-disk file is gone.

---

### `GET /api/comic/:jobId/song-sheet`

Streams the generated theme song markdown sheet.

**Success response headers**
- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="<jobId>-song-sheet.md"`

**404** if the job is unknown or no song sheet exists for that comic.

---

### `GET /api/comic/:jobId/theme-audio`

Streams the generated theme audio. With the mock provider this is a small WAV;
provider-backed runs may use the matching audio MIME type for the file.

**Success response headers**
- `Content-Type: audio/wav` or another audio MIME type
- `Content-Disposition: attachment; filename="<jobId>-theme.<ext>"`

**404** if the job is unknown or no theme audio exists for that comic.

---

### `GET /api/comic/:jobId/images/:panelId`

**Response 200** — streams the panel PNG.
- `Content-Type: image/png`
- `Cache-Control: public, max-age=86400`

The `panelId` must match a panel in the job's `result.script.pages[*].panels[*].id`
(typically `p1-panel1`, `p2-panel3`, etc.). Path traversal attempts (`..`,
`/`, `\`) are rejected with **400**.

**404** if the panel is unknown. **400/404** for malformed `panelId`.

---

### `POST /api/comic/:jobId/regenerate`

Re-runs the same `story` with new options merged on top of the originals.

**Body**
```json
{ "options": { "artStyle": "noir", "pageCount": 6 } }
```

**Response 202**
```json
{ "jobId": "<new-jobId>" }
```

The new job has a **new** `jobId`. The old job's record remains in memory
until the process restarts (or is garbage-collected by an LRU policy in
a future version).

**404** if the source job is unknown.

---

### `DELETE /api/comic/:jobId`

Cancels an in-flight job and removes its in-memory record. Persisted history
entries remain available through `GET /api/history`.

**Response 200**
```json
{ "ok": true }
```

**404** if the job is unknown.

---

### `GET /api/history`

**Response 200** — array of `HistoryEntry` (newest first, capped at 20):

```json
[
  {
    "jobId": "e60aab73-...",
    "title": "...",
    "createdAt": "2026-06-01T19:08:23.123Z",
    "artStyle": "manga",
    "pageCount": 4,
    "outputPath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904.pdf",
    "agentPlaybookPath": "/Users/duckets/Desktop/ComicBook-Creator-Duckbot-main/docs/agents/hermes-openclaw-playbook.md",
    "agentWorkflowPackagePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-agent-workflow-package.json",
    "screenplayPath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-screenplay.md",
    "directorBriefPath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-director-brief.md",
    "musicCuePackagePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-music-cue-package.json",
    "seriesPackagePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-series-package.json",
    "trailerPackagePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-trailer-package.json",
    "videoPackagePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-video-package.json",
    "studioBundlePath": "/Users/duckets/.openclaw/workspace/output/comics/1717268904-studio-bundle.json",
    "scriptJson": { "title": "...", "artStyle": "manga", "pages": [ ... ] }
  }
]
```

`state/history.json` persists up to **50** entries; this endpoint returns
the most recent **20**.

### `DELETE /api/history/:jobId`

Removes the entry from `state/history.json`. Does **not** delete the on-disk
PDF or the in-memory job record.

**Response 204** on success. **404** if the jobId isn't in history.

---

## Lifecycle

- **In-memory jobs**: jobs are stored in a process-level Map. They survive
  across HTTP requests but are lost on process restart. The frontend should
  treat unknown `jobId`s in `/api/comic/:jobId` as "stale, please re-create
  from history".
- **Persisted history**: `state/history.json` is the durable record. The
  frontend should always source its job list from `GET /api/history`, then
  use `GET /api/comic/:jobId` to poll for live status (in case the in-memory
  state was lost on restart).
- **Persisted settings**: `state/settings.json` is the durable record.
  Reloaded on server boot.
- **Output files**: PDFs and panel images live in
  `~/.openclaw/workspace/output/comics/<timestamp>.pdf` and a sibling
  `images/` directory. These are not cleaned up automatically.

## Storage

```
<skill>/state/
├── history.json     # array of HistoryEntry, max 50
└── settings.json    # Settings object
```

Both files are written atomically (write to `.tmp`, then `rename`). The
storage directory can be overridden via `setStorageDir()` (test helper).

## Error model

All errors return JSON with shape `{ "error": "human-readable message" }`:
- **400** — bad input (missing field, invalid enum, etc.)
- **404** — job or resource not found
- **409** — job exists but isn't in a state that allows the requested action
- **410** — resource was deleted (output file gone)
- **500** — server-side crash; details in the response body

The centralized Express error handler catches anything that escapes a route
and returns 500 with the error message (no stack trace).

## CORS

CORS is enabled with `Access-Control-Allow-Origin: *` for the API. In a
production deployment the frontend is served from the same origin, so the
CORS headers are redundant but harmless.

## Configuration

| Env var               | Default                     | Purpose                              |
|-----------------------|-----------------------------|--------------------------------------|
| `COMIC_WEBUI_PORT`    | `3008`                      | HTTP port (use `0` for ephemeral)    |
| `OPENROUTER_API_KEY`  | —                           | OpenRouter API key (text + image)    |
| `LMSTUDIO_BASE_URL`   | `http://127.0.0.1:1234/v1`  | Local LM Studio endpoint             |
| `MINIMAX_API_KEY`     | —                           | MiniMax API key (text + image)       |

See `src/providers/config.ts` for the full provider config resolution.
