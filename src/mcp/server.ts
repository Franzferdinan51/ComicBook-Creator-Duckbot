/**
 * comic-creator — MCP server.
 *
 * Exposes the comic-creator pipeline as MCP tools over stdio:
 *   - create_comic        — kick off a comic generation job
 *   - get_comic           — poll job status
 *   - regenerate_comic    — re-run an existing job with updated options
 *   - get_comic_pdf       — fetch PDF as base64
 *   - get_comic_image     — fetch a single panel PNG as base64
 *   - get_project         — fetch the full project JSON for external agents
 *   - get_agent_guidance  — fetch the Hermes/OpenClaw markdown handoff
 *   - get_agent_playbook  — fetch the repository-level Hermes/OpenClaw playbook
 *   - get_studio_bundle   — fetch the unified project/adaptation/music bundle
 *   - get_production_run_manifest — fetch the MiniMax/Hermes/OpenClaw run manifest
 *   - run_production_manifest     — actually invoke `mmx` against the manifest
 *   - get_production_run_report   — poll status of an in-flight production run
 *   - get_music_cue_package — fetch the music cue / score brief
 *   - get_trailer_package  — fetch the screen pitch / teaser package
 *   - get_comic_cover     — fetch the cover/title image as base64
 *   - list_providers      — discover available text + image + music providers
 *   - get_preflight       — production readiness diagnostics
 *   - get_history         — recent comics (persisted on disk)
 *   - search_history      — filter/search the on-disk comic history
 *   - patch_history_meta  — star/unstar, re-tag, or re-categorize a history entry
 *   - get_share_card      — public, secret-free share card for a history entry
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
  filterHistory,
  patchHistoryEntryMeta,
} from '../server/storage.js';
import {
  allTextProviderNames,
  allImageProviderNames,
  allMusicProviderNames,
  getProviderConfig,
  isProviderConfigured,
} from '../providers/index.js';
import {
  audioExtensionForPath,
  audioMimeTypeForPath,
  buildProductionRunManifest,
  buildStudioBundle,
  runPreflight,
} from '../project/index.js';
import { runProductionManifest } from '../project/production-runner.js';
import { getProductionRunManager } from '../server/production-runs.js';
import { randomUUID } from 'node:crypto';
import type { ComicOptions, ProductionRunReport } from '../types.js';

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

const providerNameSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9._:-]+$/, 'provider names may only include letters, numbers, dot, underscore, colon, or dash');

function validateMcpOptions(options: Partial<ComicOptions> = {}): { ok: true; options: Partial<ComicOptions> } | { ok: false; error: string } {
  const textNames = new Set(allTextProviderNames());
  const imageNames = new Set(allImageProviderNames());
  const musicNames = new Set(allMusicProviderNames());

  if (options.textProvider != null && !textNames.has(options.textProvider)) {
    return { ok: false, error: `textProvider "${options.textProvider}" is not a registered text provider. Available: ${[...textNames].join(', ')}` };
  }
  if (options.imageProvider != null && !imageNames.has(options.imageProvider)) {
    return { ok: false, error: `imageProvider "${options.imageProvider}" is not a registered image provider. Available: ${[...imageNames].join(', ')}` };
  }
  if (options.musicProvider != null && !musicNames.has(options.musicProvider)) {
    return { ok: false, error: `musicProvider "${options.musicProvider}" is not a registered music provider. Available: ${[...musicNames].join(', ')}` };
  }
  if (options.characterReferences != null) {
    if (!Array.isArray(options.characterReferences) || options.characterReferences.some((ref) => typeof ref !== 'string' || ref.trim().length === 0)) {
      return { ok: false, error: 'characterReferences must be an array of non-empty strings' };
    }
  }
  return { ok: true, options };
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
        'get_comic_pdf for the PDF, get_comic_image for a single panel PNG, ' +
        'and get_studio_bundle, get_music_cue_package, or get_trailer_package for reusable handoffs.',
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
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Image provider. Use list_providers for registered built-in and custom names. Default: "mock".'),
          textProvider: z
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Text provider. Use list_providers for registered built-in and custom names. Default: same as imageProvider.'),
          musicProvider: z
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Music provider for the generated theme audio. Use list_providers for registered names. Default: "mock".'),
          projectGoal: z
            .enum(['comic', 'screen', 'music', 'studio'])
            .optional()
            .describe('High-level project goal. Default: "comic".'),
          pageCount: z.number().int().min(1).max(50).optional().describe('Pages. Default: 4.'),
          panelsPerPage: z.number().int().min(1).max(12).optional().describe('Panels per page. Default: 4.'),
          outputProfile: z
            .enum(['comic-print', 'digital-portrait', 'storyboard-widescreen'])
            .optional()
            .describe('Render/output profile. Default: "comic-print".'),
          outputFormat: z.enum(['pdf', 'cbz']).optional().describe('Output container. Default: "pdf".'),
          imageModel: z.string().optional().describe('Override image model id for providers that support it.'),
          textModel: z.string().optional().describe('Override text model id for providers that support it.'),
          characterReferences: z.array(z.string().min(1)).max(8).optional().describe('Reference image URLs/paths used for recurring character consistency.'),
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
        const validation = validateMcpOptions((options ?? {}) as Partial<ComicOptions>);
        if (!validation.ok) return errResult(validation.error);
        const jobs = getJobManager();
        const record = jobs.createAndStart({
          story: story.trim(),
          options: validation.options as ComicOptions,
        });
        return jsonResult({ jobId: record.jobId });
      } catch (e) {
        return errResult(`create_comic failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // regenerate_comic
  // -------------------------------------------------------------------------
  server.tool(
    'regenerate_comic',
    'Re-run an existing live comic job with updated options. Returns a new jobId.',
    {
      jobId: z.string().min(1).describe('The live jobId to regenerate.'),
      options: z
        .object({
          artStyle: z.string().optional().describe('e.g. "manga", "noir", "watercolor".'),
          imageProvider: z
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Image provider override. Use list_providers for registered built-in and custom names.'),
          textProvider: z
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Text provider override. Use list_providers for registered built-in and custom names.'),
          musicProvider: z
            .string()
            .pipe(providerNameSchema)
            .optional()
            .describe('Music provider override. Use list_providers for registered names.'),
          projectGoal: z
            .enum(['comic', 'screen', 'music', 'studio'])
            .optional()
            .describe('High-level project goal override.'),
          pageCount: z.number().int().min(1).max(50).optional().describe('Pages.'),
          panelsPerPage: z.number().int().min(1).max(12).optional().describe('Panels per page.'),
          outputProfile: z
            .enum(['comic-print', 'digital-portrait', 'storyboard-widescreen'])
            .optional()
            .describe('Render/output profile override.'),
          outputFormat: z.enum(['pdf', 'cbz']).optional().describe('Output container override.'),
          imageModel: z.string().optional().describe('Override image model id.'),
          textModel: z.string().optional().describe('Override text model id.'),
          characterReferences: z.array(z.string().min(1)).max(8).optional().describe('Reference image URLs/paths used for recurring character consistency.'),
          outputPath: z.string().optional().describe('Override the output file path.'),
          generateCover: z.boolean().optional().describe('Whether to generate a cover image.'),
          seed: z.number().int().optional().describe('Deterministic seed.'),
        })
        .partial()
        .optional()
        .describe('Optional options to merge over the live job settings.'),
    },
    async ({ jobId, options }) => {
      try {
        const jobs = getJobManager();
        const record = jobs.get(jobId);
        if (!record) return errResult(`job ${jobId} not found or not live`);
        const validation = validateMcpOptions((options ?? {}) as Partial<ComicOptions>);
        if (!validation.ok) return errResult(validation.error);
        const next = jobs.createAndStart({
          story: record.story,
          options: { ...record.options, ...validation.options },
        });
        return jsonResult({ jobId: next.jobId });
      } catch (e) {
        return errResult(`regenerate_comic failed: ${(e as Error).message}`);
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
    'get_project',
    'Fetch the generated full project JSON for a completed comic.',
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
        const text = record.result.projectPath && existsSync(record.result.projectPath)
          ? await readFile(record.result.projectPath, 'utf8')
          : JSON.stringify(record.result.project, null, 2);
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.project.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_project failed: ${(e as Error).message}`);
      }
    }
  );

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
    'get_agent_workflow_package',
    'Fetch the generated Hermes/OpenClaw workflow package JSON for a completed comic.',
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
        const path = record.result.agentWorkflowPackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`agent workflow package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.agent-workflow-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_agent_workflow_package failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_production_run_manifest',
    'Fetch the generated MiniMax/Hermes/OpenClaw production run manifest JSON for a completed comic.',
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
        const path = record.result.productionRunManifestPath;
        const text = path && existsSync(path)
          ? await readFile(path, 'utf8')
          : record.result.productionRunManifest
            ? JSON.stringify(record.result.productionRunManifest, null, 2)
            : null;
        if (!text) {
          return errResult(`production run manifest not available for job ${jobId}`);
        }
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.production-run-manifest.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_production_run_manifest failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_screenplay',
    'Fetch the generated screenplay markdown for a completed comic.',
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
        const path = record.result.screenplayPath;
        if (!path || !existsSync(path)) {
          return errResult(`screenplay not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.screenplay.md`,
                mimeType: 'text/markdown',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_screenplay failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_director_brief',
    'Fetch the generated director brief markdown for a completed comic.',
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
        const path = record.result.directorBriefPath;
        if (!path || !existsSync(path)) {
          return errResult(`director brief not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.director-brief.md`,
                mimeType: 'text/markdown',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_director_brief failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_agent_playbook',
    'Fetch the repository-level Hermes/OpenClaw playbook for external agents.',
    {},
    async () => {
      try {
        const path = join(process.cwd(), 'docs', 'agents', 'hermes-openclaw-playbook.md');
        if (!existsSync(path)) {
          return errResult('agent playbook not available');
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: 'comic://playbook.hermes-openclaw.md',
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
        return errResult(`get_agent_playbook failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_studio_bundle
  // -------------------------------------------------------------------------
  server.tool(
    'get_studio_bundle',
    'Fetch a unified JSON bundle with project, adaptation, music, and artifact path data.',
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
        const bundlePath = record.result.studioBundlePath;
        if (bundlePath && existsSync(bundlePath)) {
          return jsonResult(JSON.parse(await readFile(bundlePath, 'utf8')));
        }
        return jsonResult(buildStudioBundle(jobId, record.result));
      } catch (e) {
        return errResult(`get_studio_bundle failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_music_cue_package',
    'Fetch the generated music cue package JSON for a completed comic.',
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
        const path = record.result.musicCuePackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`music cue package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.music-cue-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_music_cue_package failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_series_package',
    'Fetch the generated episodic series package JSON for a completed comic.',
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
        const path = record.result.seriesPackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`series package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.series-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_series_package failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_trailer_package',
    'Fetch the generated trailer / teaser package JSON for a completed comic.',
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
        const path = record.result.trailerPackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`trailer package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.trailer-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_trailer_package failed: ${(e as Error).message}`);
      }
    }
  );

  server.tool(
    'get_video_package',
    'Fetch the generated MiniMax-ready video package JSON for a completed comic.',
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
        const path = record.result.videoPackagePath;
        if (!path || !existsSync(path)) {
          return errResult(`video package not available for job ${jobId}`);
        }
        const text = await readFile(path, 'utf8');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.video-package.json`,
                mimeType: 'application/json',
                text,
              },
            },
            { type: 'text' as const, text },
          ],
        };
      } catch (e) {
        return errResult(`get_video_package failed: ${(e as Error).message}`);
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
    'Fetch the generated theme audio for a completed comic, returned as base64.',
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
        const audioExt = audioExtensionForPath(path);
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.theme.${audioExt}`,
                mimeType: audioMimeTypeForPath(path),
                blob: buf.toString('base64'),
              },
            },
            { type: 'text' as const, text: `Theme audio size: ${buf.length} bytes` },
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

  server.tool(
    'get_comic_cover',
    'Fetch the generated cover/title image for a completed job, returned as base64.',
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
        const path = record.result.coverImagePath;
        if (!path || !existsSync(path)) {
          return errResult(`cover image not available for job ${jobId}`);
        }
        const buf = await readFile(path);
        const isJpg = path.endsWith('.jpg') || path.endsWith('.jpeg');
        return {
          content: [
            {
              type: 'resource' as const,
              resource: {
                uri: `comic://${jobId}.cover.${isJpg ? 'jpg' : 'png'}`,
                mimeType: isJpg ? 'image/jpeg' : 'image/png',
                blob: buf.toString('base64'),
              },
            },
            { type: 'text' as const, text: `Cover image size: ${buf.length} bytes` },
          ],
        };
      } catch (e) {
        return errResult(`get_comic_cover failed: ${(e as Error).message}`);
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
          text: allTextProviderNames().map(describeProvider),
          image: allImageProviderNames().map(describeProvider),
          music: allMusicProviderNames().map(describeProvider),
        });
      } catch (e) {
        return errResult(`list_providers failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // get_preflight
  // -------------------------------------------------------------------------
  server.tool(
    'get_preflight',
    'Run production readiness diagnostics for providers, output paths, MiniMax CLI, and agent docs.',
    {},
    async () => {
      try {
        return jsonResult(await runPreflight());
      } catch (e) {
        return errResult(`get_preflight failed: ${(e as Error).message}`);
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
  // get_share_card
  // -------------------------------------------------------------------------
  server.tool(
    'get_share_card',
    'Read the public share-card for a comic: title, art style, project goal, page/panel counts, and the public URL paths for every artifact. Safe to share — no secrets, no panel images.',
    {
      jobId: z.string().min(1).describe('The jobId returned by create_comic.'),
    },
    async ({ jobId }) => {
      try {
        const record = await getJobManager().resolve(jobId);
        if (!record) return errResult(`job ${jobId} not found`);
        if (record.status !== 'done' || !record.result) {
          return errResult(`job ${jobId} not done (status: ${record.status})`);
        }
        const r = record.result;
        const panelCount = (r.script?.pages || []).reduce(
          (acc, p) => acc + (p.panels?.length || 0), 0
        );
        return jsonResult({
          format: 'share-card',
          jobId: r.project?.id || jobId,
          title: r.script?.title || 'Untitled',
          artStyle: r.script?.artStyle || '—',
          projectGoal: r.project?.projectGoal || 'comic',
          outputProfile: r.project?.renderProfile?.outputProfile || 'comic-print',
          pageCount: r.script?.pages?.length || 0,
          panelCount,
          preview: {
            cover: r.coverImagePath ? `/api/comic/${jobId}/cover` : null,
            pdf: r.pdfPath ? `/api/comic/${jobId}/pdf` : null,
            cbz: r.cbzPath ? `/api/comic/${jobId}/cbz` : null,
          },
          artifacts: {
            studioBundle: r.studioBundlePath ? `/api/comic/${jobId}/studio-bundle` : null,
            project: r.projectPath ? `/api/comic/${jobId}/project` : null,
            screenplay: r.screenplayPath ? `/api/comic/${jobId}/screenplay` : null,
            directorBrief: r.directorBriefPath ? `/api/comic/${jobId}/director-brief` : null,
            storyboardPackage: r.storyboardPackagePath ? `/api/comic/${jobId}/storyboard-package` : null,
            videoPackage: r.videoPackagePath ? `/api/comic/${jobId}/video-package` : null,
            trailerPackage: r.trailerPackagePath ? `/api/comic/${jobId}/trailer-package` : null,
            seriesPackage: r.seriesPackagePath ? `/api/comic/${jobId}/series-package` : null,
            musicCuePackage: r.musicCuePackagePath ? `/api/comic/${jobId}/music-cue-package` : null,
            songSheet: r.songSheetPath ? `/api/comic/${jobId}/song-sheet` : null,
            themeAudio: r.songAudioPath ? `/api/comic/${jobId}/theme-audio` : null,
            agentGuidance: r.agentGuidancePath ? `/api/comic/${jobId}/agent-guidance` : null,
            agentWorkflowPackage: r.agentWorkflowPackagePath
              ? `/api/comic/${jobId}/agent-workflow-package`
              : null,
            productionRunManifest: r.productionRunManifestPath
              ? `/api/comic/${jobId}/production-run-manifest`
              : null,
          },
          storyBible: {
            premise: r.storyBible?.premise || '',
            synopsis: r.storyBible?.synopsis || '',
            chapterCount: r.storyBible?.chapterOutline?.length || 0,
          },
        });
      } catch (e) {
        return errResult(`get_share_card failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // patch_history_meta
  // -------------------------------------------------------------------------
  server.tool(
    'patch_history_meta',
    'Star/unstar a comic, set free-form tags, or override the project goal on a history entry. Returns the updated entry.',
    {
      jobId: z.string().min(1).describe('The jobId of the history entry to patch.'),
      favorite: z.boolean().optional().describe('Set true to star, false to unstar.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Free-form tags. Lowercased, deduped, capped at 16.'),
      projectGoal: z.enum(['comic', 'screen', 'music', 'studio']).optional(),
    },
    async ({ jobId, favorite, tags, projectGoal }) => {
      const patch: { favorite?: boolean; tags?: string[]; projectGoal?: 'comic' | 'screen' | 'music' | 'studio' } = {};
      if (favorite !== undefined) patch.favorite = favorite;
      if (tags !== undefined) patch.tags = tags;
      if (projectGoal !== undefined) patch.projectGoal = projectGoal;
      if (Object.keys(patch).length === 0) {
        return errResult('patch_history_meta needs at least one of: favorite, tags, projectGoal');
      }
      try {
        const next = await patchHistoryEntryMeta(jobId, patch);
        if (!next) return errResult(`history entry ${jobId} not found`);
        return jsonResult(next);
      } catch (e) {
        return errResult(`patch_history_meta failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // search_history
  // -------------------------------------------------------------------------
  server.tool(
    'search_history',
    'Search and filter the on-disk comic history. Combines text search, project goal, art style, favorite, and tag filters in one call.',
    {
      q: z.string().optional().describe('Free-text search across title + tags (case-insensitive).'),
      projectGoal: z.enum(['comic', 'screen', 'music', 'studio']).optional(),
      artStyle: z.string().optional().describe('Substring match on the art style.'),
      favorite: z.boolean().optional().describe('Set true to return only starred comics.'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags (every supplied tag must match — AND).'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results to return (default 20).'),
    },
    async ({ q, projectGoal, artStyle, favorite, tags, limit }) => {
      try {
        const list = await loadHistory();
        const filtered = filterHistory(list, {
          q,
          projectGoal,
          artStyle,
          favorite,
          tags,
          limit: limit ?? 20,
        });
        return jsonResult(filtered);
      } catch (e) {
        return errResult(`search_history failed: ${(e as Error).message}`);
      }
    }
  );

  // -------------------------------------------------------------------------
  // run_production_manifest
  // -------------------------------------------------------------------------
  server.tool(
    'run_production_manifest',
    'Actually invoke `mmx` against the production run manifest for a finished comic. Returns a runId you can poll via `get_production_run_report`.',
    {
      jobId: z.string().min(1).describe('The jobId of the finished comic to run.'),
      dryRun: z.boolean().optional().describe('Plan the run but skip real mmx calls (default false).'),
      outputDir: z
        .string()
        .optional()
        .describe('Override the output directory. Defaults to the comic output directory.'),
      videoTimeoutSec: z.number().int().min(30).max(3600).optional(),
      resume: z
        .boolean()
        .optional()
        .describe('Resume from a prior in-flight or errored run. Re-uses any phase that is already done with outputs on disk. Preflight always re-runs.'),
    },
    async ({ jobId, dryRun, outputDir, videoTimeoutSec, resume }) => {
      const record = await getJobManager().resolve(jobId);
      if (!record) return errResult(`job ${jobId} not found`);
      if (record.status !== 'done' || !record.result) {
        return errResult(`job ${jobId} not done (status: ${record.status})`);
      }
      const r = record.result;
      if (!r.musicCuePackage || !r.videoPackage) {
        return errResult(
          `job ${jobId} has no music/video package (re-run with --project-goal=studio or screen)`
        );
      }
      const manifest = r.productionRunManifest ?? buildProductionRunManifest(jobId, r);
      const outDir =
        outputDir && outputDir.trim().length > 0
          ? outputDir.trim()
          : r.outputPath
            ? dirname(r.outputPath)
            : process.cwd();
      const runId = randomUUID();
      const manager = getProductionRunManager();
      manager.create({ runId, jobId, outputDir: outDir, dryRun: dryRun === true });
      setImmediate(() => {
        const onPhaseUpdate = (phase: ProductionRunReport['phases'][number]) => {
          manager.updatePhase(runId, phase);
        };
        runProductionManifest(manifest, r, {
          outputDir: outDir,
          dryRun: dryRun === true,
          resume: resume === true,
          onPhaseUpdate,
          ...(videoTimeoutSec ? { videoTimeoutSec } : {}),
        })
          .then((report) => manager.markDone(runId, report))
          .catch((err) =>
            manager.markError(runId, err instanceof Error ? err.message : String(err))
          );
      });
      return jsonResult({ runId, status: 'pending', dryRun: dryRun === true, resume: resume === true, outputDir: outDir });
    }
  );

  // -------------------------------------------------------------------------
  // get_production_run_report
  // -------------------------------------------------------------------------
  server.tool(
    'get_production_run_report',
    'Poll the status / phase progress / final report of a production run started by `run_production_manifest`.',
    {
      runId: z.string().min(1).describe('The runId returned by `run_production_manifest`.'),
    },
    async ({ runId }) => {
      const record = getProductionRunManager().get(runId);
      if (!record) return errResult(`production run ${runId} not found`);
      return jsonResult(record);
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
      defaultProjectGoal: z.enum(['comic', 'screen', 'music', 'studio']).optional(),
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
