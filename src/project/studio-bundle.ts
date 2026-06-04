import type { ComicResult } from '../types.js';

export interface StudioBundle {
  format: 'studio-bundle';
  jobId: string;
  title: string;
  project: ComicResult['project'];
  script: ComicResult['script'];
  storyBible: ComicResult['storyBible'];
  adaptationPackage: ComicResult['adaptationPackage'];
  seriesPackage: ComicResult['seriesPackage'];
  trailerPackage: ComicResult['trailerPackage'];
  musicCuePackage: ComicResult['musicCuePackage'];
  agentGuidancePackage: ComicResult['agentGuidancePackage'];
  musicProvider: string;
  artifactPaths: {
    outputPath: string;
    pdfPath: string | null;
    cbzPath: string | null;
    coverImagePath: string | null;
    projectPath: string | null;
    agentGuidancePath: string | null;
    screenplayPath: string | null;
    agentPlaybookPath: string | null;
    songSheetPath: string | null;
    songAudioPath: string | null;
    musicCuePackagePath: string | null;
    seriesPackagePath: string | null;
    storyboardPackagePath: string | null;
    trailerPackagePath: string | null;
    animaticTimelinePath: string | null;
    studioBundlePath: string | null;
  };
  availability: {
    pdf: boolean;
    cbz: boolean;
    coverImage: boolean;
    project: boolean;
    agentGuidance: boolean;
    screenplay: boolean;
    agentPlaybook: boolean;
    songSheet: boolean;
    songAudio: boolean;
    musicCuePackage: boolean;
    seriesPackage: boolean;
    storyboardPackage: boolean;
    trailerPackage: boolean;
    animaticTimeline: boolean;
    studioBundle: boolean;
  };
}

export function buildStudioBundle(jobId: string, result: ComicResult): StudioBundle {
  return {
    format: 'studio-bundle',
    jobId,
    title: result.script.title,
    project: result.project,
    script: result.script,
    storyBible: result.storyBible,
    adaptationPackage: result.adaptationPackage,
    seriesPackage: result.seriesPackage,
    trailerPackage: result.trailerPackage,
    musicCuePackage: result.musicCuePackage,
    agentGuidancePackage: result.agentGuidancePackage,
    musicProvider: result.musicProvider,
    artifactPaths: {
      outputPath: result.outputPath,
      pdfPath: result.pdfPath,
      cbzPath: result.cbzPath,
      coverImagePath: result.coverImagePath,
      projectPath: result.projectPath,
      agentGuidancePath: result.agentGuidancePath,
      screenplayPath: result.screenplayPath,
      agentPlaybookPath: result.agentPlaybookPath,
      songSheetPath: result.songSheetPath,
      songAudioPath: result.songAudioPath,
      musicCuePackagePath: result.musicCuePackagePath,
      seriesPackagePath: result.seriesPackagePath,
      storyboardPackagePath: result.storyboardPackagePath,
      trailerPackagePath: result.trailerPackagePath,
      animaticTimelinePath: result.animaticTimelinePath,
      studioBundlePath: result.studioBundlePath,
    },
    availability: {
      pdf: Boolean(result.pdfPath),
      cbz: Boolean(result.cbzPath),
      coverImage: Boolean(result.coverImagePath),
      project: Boolean(result.projectPath),
      agentGuidance: Boolean(result.agentGuidancePath),
      screenplay: Boolean(result.screenplayPath),
      agentPlaybook: Boolean(result.agentPlaybookPath),
      songSheet: Boolean(result.songSheetPath),
      songAudio: Boolean(result.songAudioPath),
      musicCuePackage: Boolean(result.musicCuePackagePath),
      seriesPackage: Boolean(result.seriesPackagePath),
      storyboardPackage: Boolean(result.storyboardPackagePath),
      trailerPackage: Boolean(result.trailerPackagePath),
      animaticTimeline: Boolean(result.animaticTimelinePath),
      studioBundle: Boolean(result.studioBundlePath),
    },
  };
}
