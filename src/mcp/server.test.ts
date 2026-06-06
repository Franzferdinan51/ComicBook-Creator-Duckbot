import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMcpServer } from './server.js';
import { isDirectEntrypoint } from './entrypoint.js';
import { audioExtensionForPath, audioMimeTypeForPath } from '../project/index.js';
import { setStorageDir } from '../server/storage.js';
import { _resetJobManager, getJobManager } from '../server/jobs.js';

const serverUrl = new URL('./server.ts', import.meta.url).href;
const serverPath = new URL('./server.ts', import.meta.url).pathname;

assert.equal(isDirectEntrypoint(serverUrl, serverPath), true);
assert.equal(isDirectEntrypoint(serverUrl, undefined), false);
assert.equal(isDirectEntrypoint(serverUrl, '/tmp/not-the-server.ts'), false);
assert.equal(audioExtensionForPath('/tmp/theme.mp3'), 'mp3');
assert.equal(audioMimeTypeForPath('/tmp/theme.mp3'), 'audio/mpeg');
assert.equal(audioExtensionForPath('/tmp/theme.wav'), 'wav');
assert.equal(audioMimeTypeForPath('/tmp/theme.wav'), 'audio/wav');

const registeredTools = Object.keys(buildMcpServer()._registeredTools);
assert.equal(registeredTools.includes('regenerate_comic'), true);
assert.equal(registeredTools.includes('get_studio_bundle'), true);
assert.equal(registeredTools.includes('get_music_cue_package'), true);
assert.equal(registeredTools.includes('get_series_package'), true);
assert.equal(registeredTools.includes('get_screenplay'), true);
assert.equal(registeredTools.includes('get_director_brief'), true);
assert.equal(registeredTools.includes('get_agent_workflow_package'), true);
assert.equal(registeredTools.includes('get_production_run_manifest'), true);
assert.equal(registeredTools.includes('get_trailer_package'), true);
assert.equal(registeredTools.includes('get_video_package'), true);
assert.equal(registeredTools.includes('get_preflight'), true);

const storageDir = await mkdtemp(join(tmpdir(), 'comic-mcp-test-'));
setStorageDir(storageDir);
_resetJobManager();
try {
  const mcpServer: any = buildMcpServer();
  const createSchemaProbe = mcpServer._registeredTools.create_comic.inputSchema.safeParse({
    story: 'Provider schema probe',
    options: {
      textProvider: 'xai',
      imageProvider: 'gemini',
      musicProvider: 'minimax',
    },
  });
  assert.equal(createSchemaProbe.success, true);
  const customSchemaProbe = mcpServer._registeredTools.create_comic.inputSchema.safeParse({
    story: 'Custom provider schema probe',
    options: {
      textProvider: 'studio-custom-1',
      imageProvider: 'studio.custom:vision',
    },
  });
  assert.equal(customSchemaProbe.success, true);
  const providersJson = await mcpServer._registeredTools.list_providers.handler({});
  const providers = JSON.parse(providersJson.content[0].text);
  assert.equal(providers.text.some((p: { name: string }) => p.name === 'xai'), true);
  assert.equal(providers.text.some((p: { name: string }) => p.name === 'gemini'), true);
  assert.equal(providers.image.some((p: { name: string }) => p.name === 'comfyui'), true);
  assert.equal(providers.music.some((p: { name: string }) => p.name === 'minimax'), true);
  const invalidProviderJson = await mcpServer._registeredTools.create_comic.handler({
    story: 'Invalid provider should fail before creating a job.',
    options: { textProvider: 'not-a-real-provider' },
  });
  assert.equal(invalidProviderJson.isError, true);
  assert.equal(invalidProviderJson.content[0].text.includes('not a registered text provider'), true);
  const preflightJson = await mcpServer._registeredTools.get_preflight.handler({});
  const preflight = JSON.parse(preflightJson.content[0].text);
  assert.equal(['pass', 'warn', 'fail'].includes(preflight.status), true);
  assert.equal(preflight.checks.some((check: { id: string }) => check.id === 'minimax-cli'), true);
  const settingsJson = await mcpServer._registeredTools.get_settings.handler({});
  const settings = JSON.parse(settingsJson.content[0].text);
  assert.equal(settings.defaultProjectGoal, 'comic');
  const updatedJson = await mcpServer._registeredTools.update_settings.handler({ defaultProjectGoal: 'music' });
  const updated = JSON.parse(updatedJson.content[0].text);
  assert.equal(updated.defaultProjectGoal, 'music');

  const job = getJobManager().createAndStart({
    story: 'A robot learns a new song for a screen adaptation.',
    options: {
      artStyle: 'manga',
      imageProvider: 'mock',
      textProvider: 'mock',
      musicProvider: 'mock',
      projectGoal: 'studio',
      pageCount: 1,
      panelsPerPage: 3,
      outputFormat: 'pdf',
      outputPath: join(storageDir, 'music-test.pdf'),
    },
  });
  let resolved: any;
  for (let i = 0; i < 50; i++) {
    resolved = await getJobManager().resolve(job.jobId);
    if (resolved?.status === 'done') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(resolved?.status, 'done');
  const musicJson = await mcpServer._registeredTools.get_music_cue_package.handler({ jobId: job.jobId });
  const musicCuePackage = JSON.parse(musicJson.content[0].resource.text);
  assert.equal(musicCuePackage.format, 'music-brief');
  assert.equal(musicCuePackage.songDraft.title.endsWith('Theme'), true);
  const seriesJson = await mcpServer._registeredTools.get_series_package.handler({ jobId: job.jobId });
  const seriesPackage = JSON.parse(seriesJson.content[0].resource.text);
  assert.equal(seriesPackage.format, 'series-bible');
  assert.equal(Array.isArray(seriesPackage.episodeOutline), true);
  const screenplayJson = await mcpServer._registeredTools.get_screenplay.handler({ jobId: job.jobId });
  assert.equal(screenplayJson.content[0].resource.mimeType, 'text/markdown');
  assert.equal(screenplayJson.content[0].resource.text.includes('## Screenplay Handoff'), true);
  const directorBriefJson = await mcpServer._registeredTools.get_director_brief.handler({ jobId: job.jobId });
  assert.equal(directorBriefJson.content[0].resource.mimeType, 'text/markdown');
  assert.equal(directorBriefJson.content[0].resource.text.includes('## Director Brief'), true);
  const workflowJson = await mcpServer._registeredTools.get_agent_workflow_package.handler({ jobId: job.jobId });
  const workflowPackage = JSON.parse(workflowJson.content[0].resource.text);
  assert.equal(workflowPackage.format, 'agent-workflow-package');
  assert.equal(Array.isArray(workflowPackage.tracks), true);
  const productionRunManifestJson = await mcpServer._registeredTools.get_production_run_manifest.handler({ jobId: job.jobId });
  const productionRunManifest = JSON.parse(productionRunManifestJson.content[0].resource.text);
  assert.equal(productionRunManifest.format, 'production-run-manifest');
  assert.equal(productionRunManifest.provider, 'minimax');
  assert.equal(productionRunManifest.phases.some((phase: { phaseId: string }) => phase.phaseId === 'video-clips'), true);
  const videoPackageJson = await mcpServer._registeredTools.get_video_package.handler({ jobId: job.jobId });
  const videoPackage = JSON.parse(videoPackageJson.content[0].resource.text);
  assert.equal(videoPackage.format, 'video-generation-package');
  assert.equal(videoPackage.provider, 'minimax');
  const regeneratedJson = await mcpServer._registeredTools.regenerate_comic.handler({
    jobId: job.jobId,
    options: {
      imageProvider: 'mock',
      textProvider: 'mock',
      musicProvider: 'mock',
      outputPath: join(storageDir, 'music-test-regenerated.pdf'),
    },
  });
  const regenerated = JSON.parse(regeneratedJson.content[0].text);
  assert.equal(typeof regenerated.jobId, 'string');
  assert.notEqual(regenerated.jobId, job.jobId);
  let regeneratedResolved: any;
  for (let i = 0; i < 50; i++) {
    regeneratedResolved = await getJobManager().resolve(regenerated.jobId);
    if (regeneratedResolved?.status === 'done') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(regeneratedResolved?.status, 'done');

  // -----------------------------------------------------------------
  // get_share_card, patch_history_meta, search_history — added in
  // 9ee575c. Run after we have a real history entry from the job
  // above.
  // -----------------------------------------------------------------

  // Share card returns the expected shape and artifact URLs.
  const shareJson = await mcpServer._registeredTools.get_share_card.handler({ jobId: job.jobId });
  assert.equal(shareJson.isError, undefined);
  const share = JSON.parse(shareJson.content[0].text);
  assert.equal(share.format, 'share-card');
  assert.equal(typeof share.title, 'string');
  assert.ok(share.pageCount > 0);
  assert.ok(share.panelCount > 0);
  assert.ok(share.preview.pdf.includes(`/api/comic/${job.jobId}/pdf`));
  assert.ok(share.artifacts.studioBundle.includes(`/api/comic/${job.jobId}/studio-bundle`));

  // Share card errors on unknown job.
  const shareMissingJson = await mcpServer._registeredTools.get_share_card.handler({ jobId: 'no-such-job' });
  assert.equal(shareMissingJson.isError, true);
  assert.equal(shareMissingJson.content[0].text.includes('not found'), true);

  // patch_history_meta star/unstar + tag cycle.
  const starJson = await mcpServer._registeredTools.patch_history_meta.handler({
    jobId: job.jobId,
    favorite: true,
    tags: ['mcp-test', 'mcp-test'], // dedupe should collapse to one
    projectGoal: 'music',
  });
  const starred = JSON.parse(starJson.content[0].text);
  assert.equal(starred.favorite, true);
  assert.deepEqual(starred.tags, ['mcp-test']);
  assert.equal(starred.projectGoal, 'music');

  // Empty patch is a 400-like error.
  const emptyPatchJson = await mcpServer._registeredTools.patch_history_meta.handler({ jobId: job.jobId });
  assert.equal(emptyPatchJson.isError, true);

  // Unknown jobId returns an error.
  const patchMissingJson = await mcpServer._registeredTools.patch_history_meta.handler({
    jobId: 'no-such-job',
    favorite: true,
  });
  assert.equal(patchMissingJson.isError, true);

  // search_history filters the live history by tag, favorite, and text.
  const searchJson = await mcpServer._registeredTools.search_history.handler({ tags: ['mcp-test'] });
  const searchResults = JSON.parse(searchJson.content[0].text) as Array<{ jobId: string; tags?: string[] }>;
  assert.ok(searchResults.some((e) => e.jobId === job.jobId));

  const searchFavJson = await mcpServer._registeredTools.search_history.handler({ favorite: true });
  const favResults = JSON.parse(searchFavJson.content[0].text) as Array<{ jobId: string; favorite?: boolean }>;
  assert.ok(favResults.some((e) => e.jobId === job.jobId && e.favorite === true));

  const searchEmptyJson = await mcpServer._registeredTools.search_history.handler({ q: 'no-such-term-xyzzy' });
  const emptyResults = JSON.parse(searchEmptyJson.content[0].text) as unknown[];
  assert.equal(emptyResults.length, 0);

  // run_production_manifest + get_production_run_report: dry-run end-to-end.
  // We point outputDir at /tmp so the runner has a writable place to
  // drop the report.
  const runJson = await mcpServer._registeredTools.run_production_manifest.handler({
    jobId: job.jobId,
    dryRun: true,
    outputDir: '/tmp/mcp-prod-run-test',
  });
  const started = JSON.parse(runJson.content[0].text) as { runId: string; status: string; dryRun: boolean };
  assert.equal(started.dryRun, true);
  assert.ok(started.runId);
  // Poll get_production_run_report until done (dry-run is fast).
  let runReport: { status: string; report: { dryRun: boolean; phases: Array<{ phaseId: string; status: string }> } | null } | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const r = await mcpServer._registeredTools.get_production_run_report.handler({ runId: started.runId });
    const j = JSON.parse(r.content[0].text) as typeof runReport;
    if (j && (j.status === 'done' || j.status === 'error')) { runReport = j; break; }
  }
  assert.ok(runReport, 'expected the production run to finish within 2s');
  assert.equal(runReport.status, 'done');
  assert.equal(runReport.report?.dryRun, true);
  assert.equal(runReport.report?.phases.length, 4);

  // 404 path: unknown runId
  const missingJson = await mcpServer._registeredTools.get_production_run_report.handler({ runId: 'no-such-run' });
  assert.equal(missingJson.isError, true);

  // 404 path: run against a job that doesn't exist
  const badJobJson = await mcpServer._registeredTools.run_production_manifest.handler({ jobId: 'no-such-job' });
  assert.equal(badJobJson.isError, true);

  // Reset state for any subsequent runs in the same dir.
  await mcpServer._registeredTools.patch_history_meta.handler({
    jobId: job.jobId,
    favorite: false,
    tags: [],
    projectGoal: 'studio',
  });
} finally {
  await rm(storageDir, { recursive: true, force: true });
}

const playbook = await readFile(new URL('../../docs/agents/hermes-openclaw-playbook.md', import.meta.url), 'utf8');
assert.equal(playbook.includes('Hermes + OpenClaw Playbook'), true);
assert.equal(playbook.includes('OpenClaw Use'), true);

console.log('PASS mcp');
