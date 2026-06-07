import type { ComicResult, ProductionRunManifest } from '../types.js';
import { buildMiniMaxVideoGenerateCommand } from './minimax-video-command.js';

export function buildProductionRunManifest(jobId: string, result: ComicResult): ProductionRunManifest {
  const title = result.script.title;
  const firstClip = result.videoPackage.clips[0];
  const themePrompt = result.musicCuePackage.musicGenerationPrompt || result.musicCuePackage.themeSongPrompt;
  const themeLyrics = result.musicCuePackage.songDraft.lyrics;
  const titleSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'comic-project';

  return {
    format: 'production-run-manifest',
    provider: 'minimax',
    jobId,
    title,
    projectGoal: result.project.projectGoal,
    entrypoints: {
      studioBundlePath: result.studioBundlePath,
      agentWorkflowPackagePath: result.agentWorkflowPackagePath,
      videoPackagePath: result.videoPackagePath,
      musicCuePackagePath: result.musicCuePackagePath,
      animaticTimelinePath: result.animaticTimelinePath,
      themeAudioPath: result.songAudioPath,
    },
    gates: [
      {
        gateId: 'comic-preflight',
        label: 'Comic Studio preflight',
        command: 'comic-creator --preflight',
        successSignal: 'Report status is pass or only has accepted warnings.',
      },
      {
        gateId: 'minimax-auth',
        label: 'MiniMax CLI authentication',
        command: 'mmx auth status',
        successSignal: 'CLI reports an active MiniMax account or configured API key.',
      },
    ],
    phases: [
      {
        phaseId: 'preflight',
        title: 'Readiness and handoff intake',
        objective: 'Confirm local readiness, then load the studio bundle before generating paid media.',
        commands: [
          'comic-creator --preflight',
          result.studioBundlePath
            ? `cat ${quote(result.studioBundlePath)}`
            : 'comic-creator --studio-bundle "<story>"',
          result.agentWorkflowPackagePath
            ? `cat ${quote(result.agentWorkflowPackagePath)}`
            : 'comic-creator --agent-workflow-package "<story>"',
        ],
        dependsOn: [],
        outputs: [
          result.studioBundlePath || 'studio bundle JSON',
          result.agentWorkflowPackagePath || 'agent workflow package JSON',
        ],
        verification: [
          'Preflight report is pass or has only accepted provider warnings.',
          'Studio bundle, workflow package, and production manifest all refer to the same title and job.',
        ],
      },
      {
        phaseId: 'music-theme',
        title: 'Generate or refine the theme song',
        objective: 'Create soundtrack material that can drive trailer and clip pacing.',
        commands: [
          'mmx auth status',
          `mmx music generate --prompt ${JSON.stringify(themePrompt)} --lyrics ${JSON.stringify(themeLyrics)} --out ${titleSlug}-theme.mp3`,
          result.musicCuePackagePath
            ? `cat ${quote(result.musicCuePackagePath)}`
            : 'comic-creator --music-cue-package "<story>"',
        ],
        dependsOn: [
          result.musicCuePackagePath || 'music cue package',
        ],
        outputs: [
          `${titleSlug}-theme.mp3`,
          result.songAudioPath || 'theme audio reference',
        ],
        verification: [
          'Theme audio supports the cue map and does not fight the intended scene pacing.',
          'Lyrics, genre, BPM, and instrumentation still match the song sheet.',
        ],
      },
      {
        phaseId: 'video-clips',
        title: 'Generate actual motion clips',
        objective: 'Use MiniMax video for motion, parallax, camera movement, and scene continuity rather than a slideshow.',
        commands: [
          firstClip
            ? buildMiniMaxVideoGenerateCommand(firstClip)
            : 'mmx video generate --prompt "<clip prompt>" --async',
          'mmx video task get --task-id <task-id>',
          `mmx video download --file-id <file-id> --out ${titleSlug}-clip.mp4`,
        ],
        dependsOn: [
          result.videoPackagePath || 'video package',
          result.animaticTimelinePath || 'animatic timeline',
          result.songAudioPath || 'theme audio reference',
        ],
        outputs: [
          `${titleSlug}-clip.mp4`,
          'MiniMax task ids and downloaded clip file ids',
        ],
        verification: [
          'Each clip contains real motion, camera behavior, or environmental animation.',
          ...(firstClip?.referenceImagePath ? ['The generated run uses each panel image as the first frame when a clip reference image is available.'] : []),
          ...(firstClip?.subjectImagePath ? ['The generated run uses the selected subject reference image when recurring-character continuity matters.'] : []),
          'Reference image continuity is preserved without becoming a static panel slideshow.',
          'Clip timing can be mapped back to the animatic timeline and music cue package.',
        ],
      },
      {
        phaseId: 'review-package',
        title: 'Review and package the production pass',
        objective: 'Collect generated media, task ids, and review notes for the next Hermes/OpenClaw agent pass.',
        commands: [
          result.videoPackagePath ? `cat ${quote(result.videoPackagePath)}` : 'comic-creator --video-package "<story>"',
          result.animaticTimelinePath ? `cat ${quote(result.animaticTimelinePath)}` : 'comic-creator --json "<story>"',
          'openclaw agent --message "Review the production run manifest and summarize next fixes" --thinking high',
        ],
        dependsOn: [
          `${titleSlug}-theme.mp3`,
          `${titleSlug}-clip.mp4`,
        ],
        outputs: [
          'review notes',
          'accepted clip list',
          'next-run prompt fixes',
        ],
        verification: [
          'Generated clips, music, and review notes are saved beside the studio bundle.',
          'Known failures are recorded as concrete next-run prompt fixes, not hidden in chat history.',
        ],
      },
    ],
    agentInstructions: {
      hermes: 'Use Hermes to decompose the run into small resumable tasks, preserve memory of task ids, and update reusable skills when a production fix repeats.',
      openClaw: 'Use OpenClaw gateway/status habits for execution: run preflight, check mmx auth status, execute CLI commands, capture outputs, and route review notes back through the studio bundle.',
      externalAgent: 'Start from this manifest after preflight when the next job is real MiniMax music/video generation instead of story editing.',
    },
    reviewChecklist: [
      'The video pass is not a slideshow of comic panels; it contains motion, camera movement, or animated environment changes.',
      'Theme/song generation supports the same emotional arc as the music cue package.',
      'MiniMax task ids, downloaded file ids, and local output paths are recorded for resuming work.',
      'The studio bundle remains the source of truth for story, screen, music, and agent handoff state.',
      'Any failed prompt is rewritten as a concrete next-run command or package note.',
    ],
  };
}

function quote(path: string): string {
  return JSON.stringify(path);
}
