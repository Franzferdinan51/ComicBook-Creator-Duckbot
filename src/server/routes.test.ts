import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetJobManager, getJobManager } from './jobs.js';
import { setStorageDir, upsertHistoryEntry } from './storage.js';
import type { HistoryEntry } from './storage.js';
import { startWebUI } from './index.js';

const storageDir = await mkdtemp(join(tmpdir(), 'comic-routes-test-'));
setStorageDir(storageDir);
_resetJobManager();

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
    musicProvider: 'mock',
    artifactPaths: {
      outputPath: entry.outputPath,
      pdfPath: entry.pdfPath,
      cbzPath: entry.cbzPath,
      coverImagePath: entry.coverImagePath,
      projectPath: entry.projectPath,
      agentGuidancePath: '/tmp/history-job-agent-guidance.md',
      agentWorkflowPackagePath: entry.agentWorkflowPackagePath,
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
    assert.equal(bundle.artifactPaths.screenplayPath, entry.screenplayPath);
    assert.equal(bundle.artifactPaths.directorBriefPath, entry.directorBriefPath);
    assert.equal(bundle.artifactPaths.musicCuePackagePath, entry.musicCuePackagePath);
    assert.equal(bundle.artifactPaths.seriesPackagePath, entry.seriesPackagePath);
    assert.equal(bundle.artifactPaths.trailerPackagePath, entry.trailerPackagePath);
    assert.equal(bundle.artifactPaths.videoPackagePath, entry.videoPackagePath);
    assert.equal(bundle.availability.agentPlaybook, true);
    assert.equal(bundle.availability.agentWorkflowPackage, true);
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
          pageCount: 1,
          panelsPerPage: 3,
        },
      }),
    });
    assert.equal(createRes.status, 202);
    const { jobId } = await createRes.json() as { jobId: string };
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
  } finally {
    await handle.close();
  }

  console.log('PASS routes');
} finally {
  await rm(storageDir, { recursive: true, force: true });
  process.exit(0);
}
