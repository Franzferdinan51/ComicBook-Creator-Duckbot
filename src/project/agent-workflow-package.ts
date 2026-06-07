import type { AgentWorkflowPackage, ComicResult } from '../types.js';
import { buildMiniMaxVideoGenerateCommand } from './minimax-video-command.js';

export function buildAgentWorkflowPackage(jobId: string, result: ComicResult): AgentWorkflowPackage {
  const title = result.script.title;
  const firstVideoClip = result.videoPackage.clips[0];
  const themePrompt = result.musicCuePackage.themeSongPrompt;
  const firstCue = result.musicCuePackage.cues[0];

  return {
    format: 'agent-workflow-package',
    jobId,
    title,
    projectGoal: result.project.projectGoal,
    frameworks: result.agentGuidancePackage.frameworks,
    entrypoints: [
      {
        label: 'Studio bundle',
        path: result.studioBundlePath,
        purpose: 'Best single-file handoff for Hermes and OpenClaw continuation.',
      },
      {
        label: 'Project JSON',
        path: result.projectPath,
        purpose: 'Source of truth for the reusable comic/show/music project state.',
      },
      {
        label: 'Agent guidance',
        path: result.agentGuidancePath,
        purpose: 'Readable operator handoff with repo-specific workflow guidance.',
      },
    ],
    tracks: [
      {
        trackId: 'story',
        title: 'Story / Adaptation',
        objective: `Refine ${title} from comic pages into screenplay, series, and production-ready story assets.`,
        hermesTasks: [
          'Split screenplay, series, and director-brief revision into small reviewable passes.',
          'Track continuity across premise, scene beats, character naming, and the show/movie promise.',
          'Keep the studio bundle as the shared memory layer between adaptation passes.',
        ],
        openClawActions: [
          'Fetch the studio bundle and screenplay through CLI, MCP, or WebUI before editing downstream artifacts.',
          'Use result/history downloads instead of reconstructing artifacts manually.',
          'Update README/docs when any public adaptation surface changes.',
        ],
        artifacts: [
          { label: 'Screenplay', path: result.screenplayPath },
          { label: 'Director brief', path: result.directorBriefPath },
          { label: 'Series package', path: result.seriesPackagePath },
          { label: 'Storyboard package', path: result.storyboardPackagePath },
        ],
        verification: [
          'Confirm screenplay, director brief, and series package all reference the same premise and scene direction.',
          'Check that the storyboard package still matches the selected render profile and adaptation scenes.',
        ],
      },
      {
        trackId: 'video',
        title: 'Show / Movie Motion',
        objective: `Turn ${title} into motion-ready clips with MiniMax instead of a slideshow of comic panels.`,
        hermesTasks: [
          'Select the highest-leverage teaser or scene clips first and order them into the smallest useful motion pass.',
          'Preserve continuity between storyboard prompts, trailer beats, and MiniMax clip prompts.',
          'Track which clips are teaser-ready, trailer-ready, or scene-assembly-ready.',
        ],
        openClawActions: [
          'Retrieve the video package and panel reference images before starting generation.',
          'Run MiniMax video asynchronously, then poll/download through the documented mmx commands.',
          'Keep generated clip paths associated with the same studio bundle for follow-up agents.',
        ],
        artifacts: [
          { label: 'Video package', path: result.videoPackagePath },
          { label: 'Trailer package', path: result.trailerPackagePath },
          { label: 'Animatic timeline', path: result.animaticTimelinePath },
          { label: 'Theme audio', path: result.songAudioPath },
        ],
        verification: [
          'Verify clip prompts preserve motion, camera language, and the no-slideshow constraint.',
          'Confirm each clip still aligns to its storyboard scene and any mapped cue.',
        ],
      },
      {
        trackId: 'music',
        title: 'Soundtrack / Score',
        objective: `Use MiniMax music assets to support ${title} as a show/movie soundtrack, not just a standalone song.`,
        hermesTasks: [
          'Decide whether the next pass is theme refinement, cue refinement, or cover/variation generation.',
          'Track cue intent against adaptation scenes and video pacing.',
          'Preserve lyrical motifs and instrumentation choices across revisions.',
        ],
        openClawActions: [
          'Start from the music cue package and song sheet before re-running music generation.',
          'Use the theme prompt and cue map to generate or revise theme audio with MiniMax.',
          'Feed any score changes back into the studio bundle and workflow package for the next agent.',
        ],
        artifacts: [
          { label: 'Music cue package', path: result.musicCuePackagePath },
          { label: 'Song sheet', path: result.songSheetPath },
          { label: 'Theme audio', path: result.songAudioPath },
        ],
        verification: [
          'Check that cues still map to the intended scenes and timings.',
          'Confirm theme audio format and provider metadata still match the expected MiniMax or mock path.',
        ],
      },
    ],
    commandBlueprints: {
      cli: [
        'comic-creator --studio-bundle "<story>"',
        'comic-creator --screenplay "<story>"',
        'comic-creator --video-package "<story>"',
        'comic-creator --music-cue-package "<story>"',
      ],
      mcp: [
        'get_studio_bundle',
        'get_screenplay',
        'get_video_package',
        'get_music_cue_package',
      ],
      webui: [
        'Open the Movie / Show board and review Overview, Video, Music, Agents, and Deliverables.',
        'Use the Result panel or History card downloads to retrieve the latest studio bundle and workflow artifacts.',
      ],
      minimax: [
        firstVideoClip
          ? buildMiniMaxVideoGenerateCommand(firstVideoClip)
          : 'mmx video generate --prompt "<clip prompt>" --async',
        themePrompt
          ? `mmx music generate --prompt ${JSON.stringify(themePrompt)} --lyrics ${JSON.stringify(result.musicCuePackage.songDraft.lyrics)} --out theme.mp3`
          : 'mmx music generate --prompt "<theme prompt>" --lyrics "<lyrics>" --out theme.mp3',
        firstCue
          ? `mmx music generate --prompt ${JSON.stringify(`${firstCue.title}: ${firstCue.mood}`)} --instrumental --out cue.mp3`
          : 'mmx music generate --prompt "<cue prompt>" --instrumental --out cue.mp3',
      ],
    },
  };
}
