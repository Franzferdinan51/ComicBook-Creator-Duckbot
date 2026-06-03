/**
 * comic-creator — MCP server.
 *
 * Exposes the comic-creator pipeline as 7 MCP tools over stdio:
 *   - create_comic        — kick off a comic generation job
 *   - get_comic           — poll job status
 *   - get_comic_pdf       — fetch PDF as base64
 *   - get_comic_image     — fetch a single panel PNG as base64
 *   - get_agent_guidance  — fetch the Hermes/OpenClaw markdown handoff
 *   - list_providers      — discover available text + image + music providers
 *   - get_history         — recent comics (persisted on disk)
 *   - get_settings        / update_settings — user preferences
 *
 * Run: `comic-creator-mcp` (stdin/stdout JSON-RPC) — works with any MCP host.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isDirectEntrypoint } from './entrypoint.js';

import { getJobManager } from '../server/jobs.js';
import {
  loadHistory,
  loadSettings,
  saveSettings,
} from '../server/storage.js';
import {
  listTextProviders,
  listImageProviders,
  listMusicProviders,
  getProviderConfig,
  isProviderConfigured,
} from '../providers/index.js';
import type { ComicOptions } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResult(data: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

function errResult(message: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: message }],
  };
}

function describeProvider(name: string) {
  if (name === 'mock') return { name, available: true, model: 'mock' };
  const cfg = getProviderConfig(name);
  const errors: string[] = [];
  if (!cfg.baseUrl) errors.push('baseUrl missing');
  if (name !== 'lmstudio' && !cfg.apiKey) errors.push('apiKey missing');
  return {
    name,
    available: errors.length === 0 && isProviderConfigured(name),
    model: cfg.model,
    ...(errors.length > 0 ? { error: errors.join('; ') } : {}),
  };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Build (but do not connect) the McpServer instance. */
export function buildMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'comic-creator',
      version: process.env.npm_package_version ?? '0.1.0',
    },
    {
      capabilities: { tools: {} },
      instructions:
        'Comic creator MCP server. Use create_comic to start, get_comic to poll, ' +
        'get_comic_pdf for the PDF, get_comic_image for a single panel PNG.',
    }
  );

  // -------------------------------------------------------------------------
  // create_comic
  // -------------------------------------------------------------------------
  server.tool(
    'create_comic',
    'Kick off a comic generation job. Returns a jobId — poll with get_comic.',
    {
      story: z
        .string()
        .min(1, 'story must be a non-empty string')
        .describe('The story premise / plot to turn into a comic.'),
      options: z
        .object({
          artStyle: z.string().optional().describe('e.g. "manga", "noir", "watercolor". Default: "manga".'),
          imageProvider: z
            .enum(['mock', 'openrouter', 'lmstudio', 'minimax'])
            .optional()
            .describe('Image provider. Default: "mock".'),
          textProvider: z
            .enum(['mock', 'openrouter', 'lmstudio', 'minimax'])
            .optional()
            .describe('Text provider. Default: same as imageProvider.'),
          musicProvider: z
            .enum(['mock'])
            .optional()
            .describe('Music provider for the generated theme WAV. Default: "mock".'),
          pageCount: z.number().int().min(1).max(50).optional().describe('Pages. Default: 4.'),
          panelsPerPage: z.number().int().min(1).max(12).optional().describe('Panels per page. Default: 4.'),
          outputProfile: z
            .enum(['comic-print', 'digital-portrait', 'storyboard-widescreen'])
            .optional()
            .describe('Render/output profile. Default: "comic-print".'),
          outputFormat: z.enum(['pdf', 'cbz']).optional().describe('Output container. Default: "pdf".'),
          imageModel: z.string().optional().describe('Override image model id for providers that support it.'),
          textModel: z.string().optional().describe('Override text model id for providers that support it.'),
          outputPath: z.string().optional().describe('Override the output file path.'),
          generateCover: z.boolean().optional().describe('Whether to generate a cover image. Default: true.'),
          seed: z.number().int().optional().describe('Deterministic seed (mock provider). Default: 0.'),
        })
        .partial()
        .optional()
        .describe('Optional comic generation options.'),
    },
    async ({ story, options }) => {
      try {
        const jobs = getJobManager();
        const record = jobs.createAndStart({
          story: story.trim(),
          options: (options ?? {}) as ComicOptions,
        });
        return jsonResult({ jobId: record.jobId });
      } catch (e) {
        return errResult(`create_comic failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_comic
  // -------------------------------------------------------------------------
  server.tool(
    'get_comic',
    'Poll a comic job for status and (when done) its ComicResult.',
    {
      jobId: z.string().min(1).describe('The jobId returned by create_comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        const body: Record<string, unknown> = {
          status: record.status,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
        if (record.status === 'done' && record.result) body.result = record.result;
        if (record.status === 'error' && record.error) body.error = record.error;
        return jsonResult(body);
      } catch (e) {
        return errResult(`get_comic failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_comic_pdf
  // -------------------------------------------------------------------------
  server.tool(
    'get_agent_guidance',
    'Fetch the generated Hermes/OpenClaw agent guidance markdown for a completed comic.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.agentGuidancePath;
        if (!path || !existsSync(path)) {
          return errResult(`agent guidance not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.agent-guidance.md`,
                mimeType: 'text/markdown',
                text,
              },
            },
            {
              type: 'text' as const,
              text,
            },
          ],
        };
      } catch (e) {
        return errResult(`get_agent_guidance failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_song_sheet',
    'Fetch the generated song sheet markdown for a completed comic.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.songSheetPath;
        if (!path || !existsSync(path)) {
          return errResult(`song sheet not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.song-sheet.md`,
                mimeType: 'text/markdown',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_song_sheet failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_storyboard_package',
    'Fetch the generated storyboard package JSON for a completed comic.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.storyboardPackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`storyboard package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.storyboard-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_storyboard_package failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_animatic_timeline',
    'Fetch the generated animatic timeline JSON for a completed comic.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.animaticTimelinePath;
        if (!path || !existsSync(path)) {
          return errResult(`animatic timeline not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.animatic-timeline.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_animatic_timeline failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_theme_audio',
    'Fetch the generated mock theme WAV for a completed comic, returned as base64.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.songAudioPath;
        if (!path || !existsSync(path)) {
          return errResult(`theme audio not available for job ${jobId}`);
        }
        const buf = await readFile(path);
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.theme.wav`,
                mimeType: 'audio/wav',
                blob: buf.toString('base64'),
              },
            },
            { type: 'text' as const, text: `Theme WAV size: ${buf.length} bytes` },
          ],
        };
      } catch (e) {
        return errResult(`get_theme_audio failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_comic_pdf',
    'Fetch the generated PDF for a completed job, returned as base64.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const path = record.result.outputPath;
        if (!existsSync(path)) return errResult(`output file no longer on disk: ${path}`);
        const buf = await readFile(path);
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.pdf`,
                mimeType: 'application/pdf',
                blob: buf.toString('base64'),
              },
            },
            {
              type: 'text' as const,
              text: `PDF size: ${buf.length} bytes; base64 length: ${buf.toString('base64').length}`,
            },
          ],
        };
      } catch (e) {
        return errResult(`get_comic_pdf failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_comic_image
  // -------------------------------------------------------------------------
  server.tool(
    'get_comic_image',
    'Fetch a single panel PNG for a completed job, returned as base64.',
    {
      jobId: z.string().min(1).describe('The jobId of a completed comic.'),
      panelId: z.string().min(1).describe('Panel id, e.g. "p1-panel1".'),
    },
    async ({ jobId, panelId }) => {
      try {
        if (panelId.includes('..') || panelId.includes('/') || panelId.includes('\\')) {
          return errResult('invalid panelId');
        }
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        // Per-job images dir (sibling to the PDF), with legacy fallback.
        const stem = record.result.outputPath.replace(/\.[^./\\]+$/, '');
        const perJobDir = `${stem}.images`;
        const legacyDir = join(dirname(record.result.outputPath), 'images');
        const pngPerJob = join(perJobDir, `${panelId}.png`);
        const pngLegacy = join(legacyDir, `${panelId}.png`);
        const jpgPerJob = join(perJobDir, `${panelId}.jpg`);
        const jpgLegacy = join(legacyDir, `${panelId}.jpg`);
        const pngPath = existsSync(pngPerJob) ? pngPerJob : existsSync(pngLegacy) ? pngLegacy : null;
        const jpgPath = existsSync(jpgPerJob) ? jpgPerJob : existsSync(jpgLegacy) ? jpgLegacy : null;
        const imagePath = pngPath ?? jpgPath;
        if (!imagePath) return errResult(`panel image not found: ${panelId}`);
        const buf = await readFile(imagePath);
        const isJpg = imagePath.endsWith('.jpg');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}/images/${panelId}.${isJpg ? 'jpg' : 'png'}`,
                mimeType: isJpg ? 'image/jpeg' : 'image/png',
                blob: buf.toString('base64'),
              },
            },
            {
              type: 'text' as const,
              text: `Panel ${panelId}: ${buf.length} bytes`,
            },
          ],
        };
      } catch (e) {
        return errResult(`get_comic_image failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // list_providers
  // -------------------------------------------------------------------------
  server.tool(
    'list_providers',
    'List available text + image + music providers and whether each is configured.',
    {},
    async () => {
      try {
        return jsonResult({
          text: listTextProviders().map(describeProvider),
          image: listImageProviders().map(describeProvider),
          music: listMusicProviders().map(describeProvider),
        });
      } catch (e) {
        return errResult(`list_providers failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_history
  // -------------------------------------------------------------------------
  server.tool(
    'get_history',
    'List recent comic jobs persisted on disk (most recent first).',
    {},
    async () => {
      try {
        const list = await loadHistory();
        return jsonResult(list.slice(0, 20));
      } catch (e) {
        return errResult(`get_history failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_settings
  // -------------------------------------------------------------------------
  server.tool(
    'get_settings',
    'Read the user preferences (default provider, art style, page count, output format).',
    {},
    async () => {
      try {
        return jsonResult(await loadSettings());
      } catch (e) {
        return errResult(`get_settings failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // update_settings
  // -------------------------------------------------------------------------
  server.tool(
    'update_settings',
    'Patch one or more user preferences. Returns the merged settings.',
    {
      defaultProvider: z.string().optional(),
      defaultTextProvider: z.string().optional(),
      defaultImageProvider: z.string().optional(),
      defaultArtStyle: z.string().optional(),
      defaultPageCount: z.number().int().min(1).max(50).optional(),
      defaultOutputFormat: z.enum(['pdf', 'cbz']).optional(),
    },
    async (patch) => {
      try {
        const next = await saveSettings(patch);
        return jsonResult(next);
      } catch (e) {
        return errResult(`update_settings failed: ${(e as Error).message}`);
      }
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

/** Start the MCP server on stdio. Resolves once the transport closes. */
export async function startMcpServer(): Promise<void> {
  const server = buildMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The process is driven by stdio; the SDK keeps the loop alive.
  // We just need to keep the function alive — wait for the transport close.
  await new Promise<void>((resolve) => {
    transport.onclose = () => resolve();
  });
  await server.close();
}

// CLI entry — `node dist/mcp/server.js` or via bin/comic-creator-mcp.mjs.
const isMain =
  isDirectEntrypoint(import.meta.url, process.argv[1]);
if (isMain) {
  startMcpServer().catch((err) => {
    console.error('[comic-creator-mcp] fatal:', err);
    process.exit(1);
  });
}
