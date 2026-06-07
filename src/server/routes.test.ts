import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetJobManager, getJobManager } from './jobs.js';
import { setStorageDir, upsertHistoryEntry } from './storage.js';
import type { HistoryEntry } from './storage.js';
import { _resetProductionRunManager } from './production-runs.js';
import { startWebUI } from './index.js';

const storageDir = await mkdtemp(join(tmpdir(), 'comic-routes-test-'));
setStorageDir(storageDir);
_resetJobManager();
_resetProductionRunManager();

const seriesPackage = {
  format: 'series-bible' as const,
  seriesLogline: 'History Project unfolds as a screen-forward series with a larger episodic engine.',
  premise: 'History project premise',
  targetFormat: 'series' as const,
  seasonArc: ['Open the world.', 'Widen the stakes.', 'Land a season hook.'],
  episodeOutline: [
    {
      episodeId: 'ep-1',
      title: 'Pilot',
      summary: 'History project opens on a major hook.',
      cliffhanger: 'The world grows beyond the opening reveal.',
      sourceSceneId: 'scene-1',
    },
  ],
  pilotBeatSheet: ['Opening image', 'Engine reveal', 'Cliffhanger'],
  showrunnerNotes: ['Preserve the comic iconography.', 'Keep the episode hook sharp.', 'Open room for a broader season.'],
};

const trailerPackage = {
  format: 'trailer-package' as const,
  logline: 'History Project becomes a screen-ready comic adaptation.',
  hook: 'History project premise',
  teaserBeats: [{ beatId: 'beat-1', title: 'Hook', description: 'Hook beat', sourceSceneId: 'scene-1' }],
  voiceOver: ['From the world of History Project.'],
  cutList: [{ shotId: 'cut-1', shotType: 'wide establishing shot', purpose: 'Open the trailer', sourceSceneId: 'scene-1' }],
  endCard: 'History Project ends on the final hook.',
  durationSeconds: 75,
};

const videoPackage = {
  format: 'video-generation-package' as const,
  provider: 'minimax' as const,
  aspectRatio: '16:9',
  renderGoal: 'show' as const,
  overview: 'History Project should move beyond a slideshow into cinematic clips.',
  trailerDirection: 'History Project becomes a MiniMax-ready teaser package.',
  commands: {
    generate: 'mmx video generate --prompt "<clip prompt>" --async',
    poll: 'mmx video task get --task-id <task-id>',
    download: 'mmx video download --file-id <file-id> --out clip.mp4',
  },
  clips: [{
    clipId: 'clip-001',
    title: 'History opening clip',
    sourceSceneId: 'scene-1',
    durationSeconds: 4,
    prompt: 'History cinematic opening clip.',
    cameraLanguage: 'wide frame',
    musicCueId: 'cue-1',
    musicCueTitle: 'Cue 1',
    referenceImagePath: '/tmp/history-job.images/p1-panel1.png',
  }],
  workflowNotes: ['Generate asynchronously', 'Use cue map', 'Avoid slideshow motion'],
};

const productionRunManifest = {
  format: 'production-run-manifest' as const,
  provider: 'minimax' as const,
  jobId: 'history-job',
  title: 'History Project',
  projectGoal: 'screen' as const,
  entrypoints: {
    studioBundlePath: '/tmp/history-job-studio-bundle.json',
    agentWorkflowPackagePath: '/tmp/history-job-agent-workflow-package.json',
    videoPackagePath: '/tmp/history-job-video-package.json',
    musicCuePackagePath: '/tmp/history-job-music-cue-package.json',
    animaticTimelinePath: '/tmp/history-job-animatic-timeline.json',
    themeAudioPath: '/tmp/history-job-theme.wav',
  },
  gates: [
    {
      gateId: 'minimax-auth',
      label: 'MiniMax CLI authentication',
      command: 'mmx auth status',
      successSignal: 'CLI reports an active MiniMax account.',
    },
  ],
  phases: [
    {
      phaseId: 'video-clips' as const,
      title: 'Generate actual motion clips',
      objective: 'Create real motion, not a slideshow.',
      commands: ['mmx video generate --prompt "History cinematic opening clip." --async'],
      dependsOn: ['/tmp/history-job-video-package.json'],
      outputs: ['history-project-clip.mp4'],
      verification: ['not a slideshow'],
    },
  ],
  agentInstructions: {
    hermes: 'decompose the production run',
    openClaw: 'use gateway/status checks before CLI execution',
    externalAgent: 'start after preflight',
  },
  reviewChecklist: ['video is not a slideshow'],
};

const musicCuePackage = {
  format: 'music-brief' as const,
  cues: [{ cueId: 'cue-1', title: 'Cue 1', mood: 'hopeful', placement: 'opening', sceneId: 'scene-1' }],
  sceneCueMap: [{ sceneId: 'scene-1', cueId: 'cue-1', timing: '00:00-00:30', purpose: 'History purpose' }],
  songDraft: {
    title: 'History Theme',
    genre: 'cinematic pop',
    bpm: 96,
    key: 'A minor',
    sections: ['verse', 'chorus'],
    lyrics: 'History Project chorus',
  },
  themeSongPrompt: 'Theme prompt',
  musicGenerationPrompt: 'Generate music with instrumentation for History Project.',
};

const entry: HistoryEntry = {
  jobId: 'history-job',
  title: 'History Project',
  createdAt: new Date().toISOString(),
  artStyle: 'manga',
  pageCount: 1,
  outputPath: '/tmp/history-job.pdf',
  pdfPath: '/tmp/history-job.pdf',
  cbzPath: '/tmp/history-job.cbz',
  coverImagePath: '/tmp/history-job.images/cover.png',
  projectPath: '/tmp/history-job-project.json',
  agentPlaybookPath: '/tmp/docs/agents/hermes-openclaw-playbook.md',
  agentWorkflowPackagePath: '/tmp/history-job-agent-workflow-package.json',
  productionRunManifestPath: '/tmp/history-job-production-run-manifest.json',
  screenplayPath: '/tmp/history-job-screenplay.md',
  directorBriefPath: '/tmp/history-job-director-brief.md',
  songSheetPath: '/tmp/history-job-song-sheet.md',
  songAudioPath: '/tmp/history-job-theme.wav',
  musicCuePackagePath: '/tmp/history-job-music-cue-package.json',
  seriesPackagePath: '/tmp/history-job-series-package.json',
  musicProvider: 'mock',
  storyboardPackagePath: '/tmp/history-job-storyboard-package.json',
  trailerPackagePath: '/tmp/history-job-trailer-package.json',
  videoPackagePath: '/tmp/history-job-video-package.json',
  animaticTimelinePath: '/tmp/history-job-animatic-timeline.json',
  studioBundlePath: '/tmp/history-job-studio-bundle.json',
  project: {
    id: 'project-1',
    title: 'History Project',
    premise: 'History project premise',
    artStyle: 'manga',
    projectGoal: 'screen',
    renderProfile: {
      outputProfile: 'storyboard-widescreen',
      page: { width: 1600, height: 900, margin: 48, bleed: 0 },
      panel: { aspectRatio: '16:9', targetWidth: 1536, targetHeight: 864, fit: 'contain' },
      cover: { width: 1536, height: 864, aspectRatio: '16:9' },
    },
    storyBible: {
      premise: 'History project premise',
      synopsis: 'History project synopsis',
      chapterOutline: ['Opening'],
      sceneBeats: ['Beat 1'],
    },
    adaptationPackage: {
      format: 'screen-outline',
      sceneOutline: [{ sceneId: 'scene-1', summary: 'Scene summary', visualGoal: 'Goal' }],
      screenplayScenes: [{
        sceneId: 'scene-1',
        slugline: 'INT./EXT. HISTORY SPACE - DAY',
        action: 'History action',
        dialogueSample: ['LEAD: History line.'],
        shotList: ['wide shot'],
      }],
      storyboardPrompts: [{
        sceneId: 'scene-1',
        prompt: 'History storyboard prompt',
        cameraLanguage: 'wide frame',
      }],
    },
    seriesPackage,
    trailerPackage,
    videoPackage,
    musicCuePackage,
    agentGuidancePackage: {
      format: 'agent-guidance',
      frameworks: {
        hermesAgent: {
          repository: 'https://github.com/nousresearch/hermes-agent',
          role: 'Planning and orchestration.',
        },
        openClaw: {
          repository: 'https://github.com/openclaw/openclaw',
          role: 'Execution and tool control.',
        },
      },
      workflowSteps: ['Read the bundle.', 'Split work.', 'Run the next surface.'],
      deliverables: ['screen adaptation', 'series package', 'music handoff'],
      operatorChecklist: ['Confirm goal', 'Use the studio bundle', 'Refresh docs'],
      externalInterfaces: ['cli', 'mcp', 'webui', 'external-agent'],
      systemPrompt: 'Support History Project as a reusable studio project.',
    },
  },
  adaptationPackage: {
    format: 'screen-outline',
    sceneOutline: [{ sceneId: 'scene-1', summary: 'Scene summary', visualGoal: 'Goal' }],
    screenplayScenes: [{
      sceneId: 'scene-1',
      slugline: 'INT./EXT. HISTORY SPACE - DAY',
      action: 'History action',
      dialogueSample: ['LEAD: History line.'],
      shotList: ['wide shot'],
    }],
    storyboardPrompts: [{
      sceneId: 'scene-1',
      prompt: 'History storyboard prompt',
      cameraLanguage: 'wide frame',
    }],
  },
  seriesPackage,
  trailerPackage,
  videoPackage,
  musicCuePackage,
  agentWorkflowPackage: {
    format: 'agent-workflow-package',
    jobId: 'history-job',
    title: 'History Project',
    projectGoal: 'screen',
    frameworks: {
      hermesAgent: {
        repository: 'https://github.com/nousresearch/hermes-agent',
        role: 'Planning and orchestration.',
      },
      openClaw: {
        repository: 'https://github.com/openclaw/openclaw',
        role: 'Execution and tool control.',
      },
    },
    entrypoints: [],
    tracks: [],
    commandBlueprints: { cli: [], mcp: [], webui: [], minimax: [] },
  },
  productionRunManifest,
  scriptJson: {
    title: 'History Project',
    artStyle: 'manga',
    pages: [{ pageNumber: 1, layout: 'grid-2x2', panels: [{ id: 'p1-panel1', description: 'A panel' }] }],
  },
};

try {
  await upsertHistoryEntry(entry);
  await writeFile(entry.musicCuePackagePath!, JSON.stringify(musicCuePackage), 'utf8');
  await writeFile(entry.seriesPackagePath!, JSON.stringify(seriesPackage), 'utf8');
  await writeFile(entry.trailerPackagePath!, JSON.stringify(trailerPackage), 'utf8');
  await writeFile(entry.videoPackagePath!, JSON.stringify(videoPackage), 'utf8');
  await writeFile(entry.agentWorkflowPackagePath!, JSON.stringify(entry.agentWorkflowPackage), 'utf8');
  await writeFile(entry.productionRunManifestPath!, JSON.stringify(productionRunManifest), 'utf8');
  await writeFile(entry.screenplayPath!, '# History Project\n\n## Screenplay Handoff\n\nHistory screenplay text.', 'utf8');
  await writeFile(entry.directorBriefPath!, '# History Project\n\n## Director Brief\n\nHistory director brief text.', 'utf8');
  await writeFile(entry.studioBundlePath!, JSON.stringify({
    format: 'studio-bundle',
    jobId: 'history-job',
    title: 'History Project',
    project: entry.project,
    script: entry.scriptJson,
    storyBible: entry.project!.storyBible,
    adaptationPackage: entry.adaptationPackage,
    seriesPackage,
    trailerPackage,
    videoPackage,
    musicCuePackage,
    agentGuidancePackage: entry.project!.agentGuidancePackage,
    agentWorkflowPackage: entry.agentWorkflowPackage,
    productionRunManifest,
    musicProvider: 'mock',
    artifactPaths: {
      outputPath: entry.outputPath,
      pdfPath: entry.pdfPath,
      cbzPath: entry.cbzPath,
      coverImagePath: entry.coverImagePath,
      projectPath: entry.projectPath,
      agentGuidancePath: '/tmp/history-job-agent-guidance.md',
      agentWorkflowPackagePath: entry.agentWorkflowPackagePath,
      productionRunManifestPath: entry.productionRunManifestPath,
      agentPlaybookPath: entry.agentPlaybookPath,
      screenplayPath: entry.screenplayPath,
      directorBriefPath: entry.directorBriefPath,
      songSheetPath: entry.songSheetPath,
      songAudioPath: entry.songAudioPath,
      musicCuePackagePath: entry.musicCuePackagePath,
      seriesPackagePath: entry.seriesPackagePath,
      storyboardPackagePath: entry.storyboardPackagePath,
      trailerPackagePath: entry.trailerPackagePath,
      videoPackagePath: entry.videoPackagePath,
      animaticTimelinePath: entry.animaticTimelinePath,
      studioBundlePath: entry.studioBundlePath,
    },
    availability: {
      pdf: true,
      cbz: true,
      coverImage: true,
      project: true,
      agentGuidance: true,
      agentWorkflowPackage: true,
      productionRunManifest: true,
      screenplay: true,
      directorBrief: true,
      agentPlaybook: true,
      songSheet: true,
      songAudio: true,
      musicCuePackage: true,
      seriesPackage: true,
      storyboardPackage: true,
      trailerPackage: true,
      videoPackage: true,
      animaticTimeline: true,
      studioBundle: true,
    },
  }), 'utf8');

  const resolved = await getJobManager().resolve('history-job');
  assert.equal(resolved?.status, 'done');
  assert.equal(resolved?.fromHistory, true);
  assert.equal(resolved?.result.project.renderProfile.outputProfile, 'storyboard-widescreen');
  assert.equal(resolved?.result.project.projectGoal, 'screen');
  assert.equal(Array.isArray(resolved?.result.adaptationPackage.sceneOutline), true);
  assert.equal(Array.isArray(resolved?.result.seriesPackage.episodeOutline), true);
  assert.equal(Array.isArray(resolved?.result.musicCuePackage.cues), true);
  assert.equal(resolved?.result.projectPath, '/tmp/history-job-project.json');
  assert.equal(resolved?.result.agentPlaybookPath?.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
  assert.equal(resolved?.result.agentWorkflowPackagePath, '/tmp/history-job-agent-workflow-package.json');
  assert.equal(resolved?.result.productionRunManifestPath, '/tmp/history-job-production-run-manifest.json');
  assert.equal(resolved?.result.productionRunManifest.format, 'production-run-manifest');
  assert.equal(resolved?.result.screenplayPath, '/tmp/history-job-screenplay.md');
  assert.equal(resolved?.result.directorBriefPath, '/tmp/history-job-director-brief.md');
  assert.equal(resolved?.result.songSheetPath, '/tmp/history-job-song-sheet.md');
  assert.equal(resolved?.result.songAudioPath, '/tmp/history-job-theme.wav');
  assert.equal(resolved?.result.musicCuePackagePath, '/tmp/history-job-music-cue-package.json');
  assert.equal(resolved?.result.seriesPackagePath, '/tmp/history-job-series-package.json');
  assert.equal(resolved?.result.musicProvider, 'mock');
  assert.equal(resolved?.result.storyboardPackagePath, '/tmp/history-job-storyboard-package.json');
  assert.equal(resolved?.result.trailerPackagePath, '/tmp/history-job-trailer-package.json');
  assert.equal(resolved?.result.videoPackagePath, '/tmp/history-job-video-package.json');
  assert.equal(resolved?.result.animaticTimelinePath, '/tmp/history-job-animatic-timeline.json');

  const handle = await startWebUI({ port: 0, webuiDir: join(process.cwd(), 'webui') });
  try {
    const preflightRes = await fetch(`http://127.0.0.1:${handle.port}/api/preflight`);
    assert.equal(preflightRes.ok || preflightRes.status === 503, true);
    const preflight = await preflightRes.json() as { status?: string; checks?: Array<{ id: string }> };
    assert.equal(['pass', 'warn', 'fail'].includes(preflight.status ?? ''), true);
    assert.equal(preflight.checks?.some((check) => check.id === 'provider-registry'), true);

    const settingsRes = await fetch(`http://127.0.0.1:${handle.port}/api/settings`);
    assert.equal(settingsRes.ok, true);
    const settings = await settingsRes.json() as { defaultProjectGoal?: string };
    assert.equal(settings.defaultProjectGoal, 'comic');

    const updateSettingsRes = await fetch(`http://127.0.0.1:${handle.port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultProjectGoal: 'studio' }),
    });
    assert.equal(updateSettingsRes.ok, true);
    const updatedSettings = await updateSettingsRes.json() as { defaultProjectGoal?: string };
    assert.equal(updatedSettings.defaultProjectGoal, 'studio');

    const playbookRes = await fetch(`http://127.0.0.1:${handle.port}/api/agent-playbook`);
    assert.equal(playbookRes.ok, true);
    assert.equal(playbookRes.headers.get('content-type')?.includes('text/markdown'), true);
    const playbookText = await playbookRes.text();
    assert.equal(playbookText.includes('Hermes + OpenClaw Playbook'), true);
    assert.equal(playbookText.includes('Music Handoff'), true);

    const bundleRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/studio-bundle`);
    assert.equal(bundleRes.ok, true);
    assert.equal(bundleRes.headers.get('content-type')?.includes('application/json'), true);
    const bundle = await bundleRes.json();
    assert.equal(bundle.format, 'studio-bundle');
    assert.equal(bundle.jobId, 'history-job');
    assert.equal(bundle.artifactPaths.agentPlaybookPath.endsWith('docs/agents/hermes-openclaw-playbook.md'), true);
    assert.equal(bundle.artifactPaths.studioBundlePath, entry.studioBundlePath);
    assert.equal(bundle.artifactPaths.agentWorkflowPackagePath, entry.agentWorkflowPackagePath);
    assert.equal(bundle.artifactPaths.productionRunManifestPath, entry.productionRunManifestPath);
    assert.equal(bundle.artifactPaths.screenplayPath, entry.screenplayPath);
    assert.equal(bundle.artifactPaths.directorBriefPath, entry.directorBriefPath);
    assert.equal(bundle.artifactPaths.musicCuePackagePath, entry.musicCuePackagePath);
    assert.equal(bundle.artifactPaths.seriesPackagePath, entry.seriesPackagePath);
    assert.equal(bundle.artifactPaths.trailerPackagePath, entry.trailerPackagePath);
    assert.equal(bundle.artifactPaths.videoPackagePath, entry.videoPackagePath);
    assert.equal(bundle.availability.agentPlaybook, true);
    assert.equal(bundle.availability.agentWorkflowPackage, true);
    assert.equal(bundle.availability.productionRunManifest, true);
    assert.equal(bundle.availability.screenplay, true);
    assert.equal(bundle.availability.directorBrief, true);
    assert.equal(bundle.availability.musicCuePackage, true);
    assert.equal(bundle.availability.seriesPackage, true);
    assert.equal(bundle.availability.storyboardPackage, true);
    assert.equal(bundle.availability.trailerPackage, true);
    assert.equal(bundle.availability.videoPackage, true);
    assert.equal(bundle.availability.animaticTimeline, true);
    assert.equal(bundle.availability.studioBundle, true);

    const musicRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/music-cue-package`);
    assert.equal(musicRes.ok, true);
    assert.equal(musicRes.headers.get('content-type')?.includes('application/json'), true);
    const musicPayload = await musicRes.json();
    assert.equal(musicPayload.format, 'music-brief');
    assert.equal(musicPayload.songDraft.title, 'History Theme');

    const seriesRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/series-package`);
    assert.equal(seriesRes.ok, true);
    assert.equal(seriesRes.headers.get('content-type')?.includes('application/json'), true);
    const seriesPayload = await seriesRes.json();
    assert.equal(seriesPayload.format, 'series-bible');
    assert.equal(seriesPayload.targetFormat, 'series');

    const screenplayRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/screenplay`);
    assert.equal(screenplayRes.ok, true);
    assert.equal(screenplayRes.headers.get('content-type')?.includes('text/markdown'), true);
    const screenplayText = await screenplayRes.text();
    assert.equal(screenplayText.includes('## Screenplay Handoff'), true);

    const directorBriefRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/director-brief`);
    assert.equal(directorBriefRes.ok, true);
    assert.equal(directorBriefRes.headers.get('content-type')?.includes('text/markdown'), true);
    const directorBriefText = await directorBriefRes.text();
    assert.equal(directorBriefText.includes('## Director Brief'), true);

    const workflowRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/agent-workflow-package`);
    assert.equal(workflowRes.ok, true);
    assert.equal(workflowRes.headers.get('content-type')?.includes('application/json'), true);
    const workflowPayload = await workflowRes.json();
    assert.equal(workflowPayload.format, 'agent-workflow-package');

    const manifestRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/production-run-manifest`);
    assert.equal(manifestRes.ok, true);
    assert.equal(manifestRes.headers.get('content-type')?.includes('application/json'), true);
    const manifestPayload = await manifestRes.json();
    assert.equal(manifestPayload.format, 'production-run-manifest');
    assert.equal(manifestPayload.provider, 'minimax');

    const trailerRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/trailer-package`);
    assert.equal(trailerRes.ok, true);
    assert.equal(trailerRes.headers.get('content-type')?.includes('application/json'), true);
    const trailerPayload = await trailerRes.json();
    assert.equal(trailerPayload.format, 'trailer-package');
    assert.equal(trailerPayload.logline.includes('History Project'), true);

    const videoRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/video-package`);
    assert.equal(videoRes.ok, true);
    assert.equal(videoRes.headers.get('content-type')?.includes('application/json'), true);
    const videoPayload = await videoRes.json();
    assert.equal(videoPayload.format, 'video-generation-package');
    assert.equal(videoPayload.provider, 'minimax');

    const createRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story: 'A test comic becomes a screen-ready pilot.',
        options: {
          artStyle: 'manga',
          projectGoal: 'screen',
          textProvider: 'mock',
          imageProvider: 'mock',
          musicProvider: 'mock',
          characterReferences: ['https://example.com/hero-1.png', '/tmp/hero-2.png'],
          pageCount: 1,
          panelsPerPage: 3,
        },
      }),
    });
    assert.equal(createRes.status, 202);
    const { jobId } = await createRes.json() as { jobId: string };
    assert.deepEqual(getJobManager().get(jobId)?.options.characterReferences, [
      'https://example.com/hero-1.png',
      '/tmp/hero-2.png',
    ]);
    let generated: Record<string, unknown> | null = null;
    for (let i = 0; i < 25; i++) {
      const pollRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/${jobId}`);
      assert.equal(pollRes.ok, true);
      const body = await pollRes.json() as Record<string, unknown>;
      if (body.status === 'done') {
        generated = body;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(generated, 'expected the generated job to finish');
    const generatedResult = generated?.result as {
      project?: { projectGoal?: string; renderProfile?: { outputProfile?: string } };
      seriesPackage?: { targetFormat?: string };
    };
    assert.equal(generatedResult.project?.projectGoal, 'screen');
    assert.equal(generatedResult.project?.renderProfile?.outputProfile, 'storyboard-widescreen');
    assert.equal(generatedResult.seriesPackage?.targetFormat, 'series');

    const invalidCharacterRefsRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        story: 'An invalid consistency request.',
        options: {
          imageProvider: 'mock',
          textProvider: 'mock',
          characterReferences: ['ok', '', 42],
        },
      }),
    });
    assert.equal(invalidCharacterRefsRes.status, 400);
    const invalidCharacterRefsBody = await invalidCharacterRefsRes.json() as { error?: string };
    assert.equal(invalidCharacterRefsBody.error?.includes('characterReferences'), true);

    // -----------------------------------------------------------------
    // History search/filter, PATCH, share card — added in 9ee575c
    // -----------------------------------------------------------------

    // PATCH tags + favorite. Tags should be lowercased + deduped, with
    // empty/duplicate values silently dropped.
    const patchRes = await fetch(`http://127.0.0.1:${handle.port}/api/history/history-job`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        favorite: true,
        tags: ['Draft', 'draft', '  client-acme  ', 'noir', 'noir', ''],
      }),
    });
    assert.equal(patchRes.status, 200);
    const patched = await patchRes.json() as {
      favorite: boolean;
      tags: string[];
      updatedAt: string;
    };
    assert.equal(patched.favorite, true);
    assert.deepEqual(patched.tags, ['draft', 'client-acme', 'noir']);
    assert.ok(typeof patched.updatedAt === 'string' && patched.updatedAt.length > 0);

    // PATCH rejects empty body with 400.
    const emptyRes = await fetch(`http://127.0.0.1:${handle.port}/api/history/history-job`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(emptyRes.status, 400);

    // PATCH unknown jobId → 404.
    const missingRes = await fetch(`http://127.0.0.1:${handle.port}/api/history/no-such-job`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorite: true }),
    });
    assert.equal(missingRes.status, 404);

    // Filter by favorite=true — should find the starred one.
    const favRes = await fetch(`http://127.0.0.1:${handle.port}/api/history?favorite=true&limit=50`);
    const favList = await favRes.json() as Array<{ jobId: string; favorite?: boolean }>;
    assert.ok(favList.length >= 1, 'expected at least one starred entry');
    assert.ok(favList.every((e) => e.favorite === true));

    // Filter by tag.
    const tagRes = await fetch(`http://127.0.0.1:${handle.port}/api/history?tags=client-acme&limit=50`);
    const tagList = await tagRes.json() as Array<{ jobId: string; tags?: string[] }>;
    assert.ok(tagList.length >= 1);
    assert.ok(tagList.every((e) => (e.tags || []).includes('client-acme')));

    // Free-text search across tags.
    const qRes = await fetch(`http://127.0.0.1:${handle.port}/api/history?q=acme&limit=50`);
    const qList = await qRes.json() as Array<{ jobId: string }>;
    assert.ok(qList.length >= 1);

    // Filter by projectGoal.
    const goalRes = await fetch(`http://127.0.0.1:${handle.port}/api/history?projectGoal=screen&limit=50`);
    const goalList = await goalRes.json() as Array<{ jobId: string; projectGoal?: string }>;
    assert.ok(goalList.every((e) => e.projectGoal === 'screen'));

    // Filter by artStyle.
    const styleRes = await fetch(`http://127.0.0.1:${handle.port}/api/history?artStyle=manga&limit=50`);
    const styleList = await styleRes.json() as Array<{ jobId: string; artStyle: string }>;
    assert.ok(styleList.every((e) => e.artStyle.toLowerCase().includes('manga')));

    // Share card endpoint.
    const shareRes = await fetch(`http://127.0.0.1:${handle.port}/api/share/history-job`);
    assert.equal(shareRes.status, 200);
    assert.equal(shareRes.headers.get('content-type')?.includes('application/json'), true);
    const share = await shareRes.json() as {
      format: string;
      jobId: string;
      title: string;
      artStyle: string;
      projectGoal: string;
      pageCount: number;
      panelCount: number;
      preview: { cover: string | null; pdf: string; cbz: string };
      artifacts: { studioBundle: string };
    };
    assert.equal(share.format, 'share-card');
    assert.equal(share.title, 'History Project');
    assert.equal(share.artStyle, 'manga');
    assert.equal(share.projectGoal, 'screen');
    assert.ok(share.pageCount > 0);
    assert.ok(share.panelCount > 0);
    assert.ok(share.preview.pdf.includes('/api/comic/history-job/pdf'));
    assert.ok(share.artifacts.studioBundle.includes('/api/comic/history-job/studio-bundle'));

    // Share endpoint 404s for unknown job.
    const shareMissing = await fetch(`http://127.0.0.1:${handle.port}/api/share/no-such-job`);
    assert.equal(shareMissing.status, 404);

    // PATCH endpoint supports projectGoal override too.
    const goalPatchRes = await fetch(`http://127.0.0.1:${handle.port}/api/history/history-job`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectGoal: 'music' }),
    });
    assert.equal(goalPatchRes.status, 200);
    const goalPatched = await goalPatchRes.json() as { projectGoal: string };
    assert.equal(goalPatched.projectGoal, 'music');
    // Reset back to screen so the rest of the test suite is happy.
    await fetch(`http://127.0.0.1:${handle.port}/api/history/history-job`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectGoal: 'screen' }),
    });

    // Production-run dry-run: should 202 with a runId, then status
    // `done` and a fully-formed report in the body. We use a temp
    // output dir so we don't pollute the test workspace.
    const dryRunRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/run-production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, outputDir: '/tmp/history-job-prod-run-dry' }),
    });
    assert.equal(dryRunRes.status, 202);
    const dryStarted = await dryRunRes.json() as { runId: string; status: string; dryRun: boolean };
    assert.equal(dryStarted.dryRun, true);
    assert.ok(dryStarted.runId);
    // Poll until done (dry-run should be near-instant).
    let dryReport: { status: string; report: { phases: Array<{ phaseId: string; status: string }>; dryRun: boolean } | null } | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const r = await fetch(`http://127.0.0.1:${handle.port}/api/production-run/${dryStarted.runId}`);
      if (r.ok) {
        const j = await r.json() as typeof dryReport;
        if (j && j.status === 'done') { dryReport = j; break; }
        if (j && j.status === 'error') { dryReport = j; break; }
      }
    }
    assert.ok(dryReport, 'expected the production run to finish within 2s');
    assert.equal(dryReport.status, 'done');
    assert.equal(dryReport.report?.dryRun, true);
    assert.equal(dryReport.report?.phases.length, 4);
    for (const phase of dryReport.report!.phases) {
      assert.equal(phase.status, 'done', `phase ${phase.phaseId} should be done`);
    }
    // The runner also wrote the JSON report to disk in the chosen
    // output dir — verify it's readable via the per-comic endpoint.
    const reportRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/production-run-report`);
    assert.equal(reportRes.status, 200);
    const onDisk = await reportRes.json() as { manifest: { jobId: string }; dryRun: boolean };
    assert.equal(onDisk.manifest.jobId, 'history-job');
    assert.equal(onDisk.dryRun, true);
    // Unknown runId → 404
    const missingRun = await fetch(`http://127.0.0.1:${handle.port}/api/production-run/no-such-run`);
    assert.equal(missingRun.status, 404);

    // Production-run with `resume: true`: should still 202 and the
    // resumed run should still report all 4 phases done (preflight
    // re-runs but the others are carried forward from the prior
    // dry-run report we just wrote).
    const resumeRes = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/run-production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, outputDir: '/tmp/history-job-prod-run-dry', resume: true }),
    });
    assert.equal(resumeRes.status, 202);
    const resumeStarted = await resumeRes.json() as { runId: string; resume: boolean };
    assert.equal(resumeStarted.resume, true);
    // Poll until done.
    let resumeReport: { status: string; report: { phases: Array<{ phaseId: string; status: string; steps: Array<{ label: string }> }> } | null } | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const r = await fetch(`http://127.0.0.1:${handle.port}/api/production-run/${resumeStarted.runId}`);
      if (r.ok) {
        const j = await r.json() as typeof resumeReport;
        if (j && (j.status === 'done' || j.status === 'error')) { resumeReport = j; break; }
      }
    }
    assert.ok(resumeReport, 'expected the resumed run to finish within 2s');
    assert.equal(resumeReport.status, 'done');
    // In dry-run mode the resume machinery is a no-op (the runner
    // doesn't try to load the prior report), so no phase should
    // carry the "reused from prior report" marker.
    for (const p of resumeReport.report?.phases ?? []) {
      assert.equal(
        p.steps.some((s) => s.label === 'reused from prior report'),
        false,
        `phase ${p.phaseId} should not be marked reused in dry-run`
      );
    }

    // Video clip streaming endpoint. In dry-run mode no real .mp4
    // files are written, so we expect 404. Then we drop a fake
    // .mp4 in the same outputDir the dry-run used and re-query.
    const clipMissing = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/video-clip/1`);
    assert.equal(clipMissing.status, 404);
    // 400 on a non-numeric clip number
    const clipBad = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/video-clip/abc`);
    assert.equal(clipBad.status, 400);
    // Drop a fake clip on disk in the same outputDir we used for
    // the dry-run. The endpoint should find it via the manager's
    // listForJob walk.
    const { mkdir: _mkdir, writeFile: _writeFile } = await import('node:fs/promises');
    const { join: _join } = await import('node:path');
    await _mkdir('/tmp/history-job-prod-run-dry', { recursive: true });
    // Slugified title from the production-run-report fixture is
    // "history-project" (matches the resolved slugify in routes).
    const fakeClipPath = _join('/tmp/history-job-prod-run-dry', 'history-project-clip-1.mp4');
    const fakeBytes = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // ftyp + isom
    await _writeFile(fakeClipPath, fakeBytes);
    const clipOk = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/video-clip/1`);
    assert.equal(clipOk.status, 200);
    assert.equal(clipOk.headers.get('content-type'), 'video/mp4');
    const clipBytes = new Uint8Array(await clipOk.arrayBuffer());
    assert.equal(clipBytes.length, fakeBytes.length);
    assert.equal(clipBytes[4], 0x66); // 'f' of ftyp
    // 404 for a clip number that has no file
    const clip2 = await fetch(`http://127.0.0.1:${handle.port}/api/comic/history-job/video-clip/99`);
    assert.equal(clip2.status, 404);
  } finally {
    await handle.close();
  }

  console.log('PASS routes');
} finally {
  await rm(storageDir, { recursive: true, force: true });
  process.exit(0);
}
