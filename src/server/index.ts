/**
 * comic-creator server — main entry.
 *
 * Boots an Express app on `COMIC_WEBUI_PORT` (default 3008) and serves:
 *   - the static frontend at `/` from `<skill>/webui/`
 *   - the JSON API at `/api/*` from `./routes.js`
 *
 * CORS is permissive in dev (the frontend will be served from the same
 * origin, but `*` makes opening it in tools like `web-preview` easier).
 *
 * For tests: set `COMIC_WEBUI_PORT=0` and `app.address()` will tell you
 * which ephemeral port Express picked.
 */

import express, { type Express } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRouter } from './routes.js';

const DEFAULT_PORT = 3008;

export interface StartWebUIOptions {
  port?: number;
  /** Override the webui/ static dir (used by tests). */
  webuiDir?: string;
  /** Override the CORS origin (default "*"). */
  corsOrigin?: string | true;
}

export interface WebUIHandle {
  port: number;
  app: Express;
  close: () => Promise<void>;
}

/**
 * Start the WebUI HTTP server. Returns a handle with the bound port and
 * a close() function for graceful shutdown.
 */
export function startWebUI(options: StartWebUIOptions = {}): Promise<WebUIHandle> {
  return new Promise((resolve, reject) => {
    const app = express();

    // Body parsing
    app.use(express.json({ limit: '2mb' }));

    // CORS — permissive for local dev. In production a same-origin build
    // doesn't need this at all; the * is just for tooling convenience.
    app.use(
      cors({
        origin: options.corsOrigin ?? '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      })
    );

    // API routes
    app.use('/api', buildRouter());

    // Static frontend — resolved relative to this source file.
    const webuiDir =
      options.webuiDir ??
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'webui');
    if (existsSync(webuiDir)) {
      app.use(express.static(webuiDir));
      // SPA fallback — any non-/api path serves index.html.
      app.get(/^\/(?!api\/).*/, (_req, res) => {
        res.sendFile(join(webuiDir, 'index.html'));
      });
    } else {
      // Missing frontend assets — return a clear install/runtime hint.
      app.get('/', (_req, res) => {
        res
          .type('text/plain')
          .send(
            'comic-creator WebUI is running.\n' +
              'The webui/ directory could not be found. Reinstall from the repository root or run the server with the source checkout.\n' +
              'API is available at /api/health, /api/comic, /api/providers, etc.'
          );
      });
    }

    // Centralized error handler — keeps unhandled errors from leaking
    // as raw HTML stack traces.
    app.use(
      (err: Error & { statusCode?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('[server] unhandled error:', err);
        if (res.headersSent) return;
        // Map known error types to appropriate HTTP status codes.
        const status = err.statusCode
          ?? (err.type === 'entity.parse.failed' ? 400 : undefined)
          ?? (err.type === 'entity.too.large' ? 413 : undefined)
          ?? 500;
        res.status(status).json({ error: err.message || 'internal server error' });
      }
    );

    // Resolve the port — env wins, then options, then default.
    const port = parsePort(
      options.port ?? process.env.COMIC_WEBUI_PORT ?? String(DEFAULT_PORT)
    );

    const server = app.listen(port, () => {
      const addr = server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: boundPort,
        app,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
    server.on('error', reject);
  });
}

function parsePort(raw: number | string): number {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (!Number.isFinite(n) || n < 0 || n > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  return n;
}

// Run if invoked directly (e.g. `tsx src/server/index.ts`).
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1] ?? '');

if (isMain) {
  startWebUI()
    .then((handle) => {
      console.log(`comic-creator WebUI listening on http://localhost:${handle.port}`);
      console.log(`  - API:     http://localhost:${handle.port}/api/health`);
      console.log(`  - History: http://localhost:${handle.port}/api/history`);
    })
    .catch((err) => {
      console.error('Failed to start WebUI:', err);
      process.exit(1);
    });
}
