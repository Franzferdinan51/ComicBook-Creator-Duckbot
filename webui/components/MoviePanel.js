/**
 * MoviePanel — a dedicated show/movie adaptation workspace.
 *
 * This is intentionally not a comic slideshow. It surfaces screenplay
 * scenes, storyboard prompts, animatic timing, and music cues as a
 * production board for turning the comic into a film/show pass.
 */

import { useEffect, useState } from 'https://esm.sh/preact@10/hooks';
import { html, showToast, navTo } from './_lib.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'trailer', label: 'Trailer' },
  { id: 'video', label: 'Video' },
  { id: 'story', label: 'Story' },
  { id: 'series', label: 'Series' },
  { id: 'script', label: 'Script' },
  { id: 'shots', label: 'Shots' },
  { id: 'previs', label: 'Previs' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'music', label: 'Music' },
  { id: 'agents', label: 'Agents' },
  { id: 'deliverables', label: 'Deliverables' },
];

const PROJECT_GOAL_LABELS = {
  comic: 'Comic',
  screen: 'Screen / Movie',
  music: 'Music',
  studio: 'Studio',
};

function localSlug(raw) {
  const slug = String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
  return slug || 'movie-board';
}

function download(url, filename, successMessage) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast(successMessage, 'success');
}

export function MoviePanel({ result, jobId, onOpenComic }) {
  const defaultTab = result?.project?.projectGoal === 'music'
    ? 'music'
    : result?.project?.projectGoal === 'screen'
      ? 'script'
      : result?.project?.projectGoal === 'studio'
        ? 'deliverables'
        : 'overview';
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab, jobId]);

  if (!result) {
    return html`
      <section class="panel movie-panel" aria-labelledby="movie-title">
        <header class="panel-title">
          <h2 id="movie-title">Movie / Show Board</h2>
        </header>
        <div class="empty-state">
          <h3>No adaptation board yet</h3>
          <p>Generate a comic or open one from history, then come back here to plan the film/show version.</p>
          <div class="action-row">
            <button class="btn" type="button" onClick=${() => navTo('home')}>Create a comic</button>
            <button class="btn btn-ghost" type="button" onClick=${() => navTo('history')}>Open history</button>
          </div>
        </div>
      </section>
    `;
  }

  const title = result.script?.title || 'Untitled project';
  const artStyle = result.script?.artStyle || '—';
  const projectGoal = result.project?.projectGoal || 'comic';
  const projectGoalLabel = PROJECT_GOAL_LABELS[projectGoal] || projectGoal;
  const outputProfile = result.project?.renderProfile?.outputProfile || 'comic-print';
  const sceneOutline = result.adaptationPackage?.sceneOutline || [];
  const screenplayScenes = result.adaptationPackage?.screenplayScenes || [];
  const storyboardPrompts = result.adaptationPackage?.storyboardPrompts || [];
  const cues = result.musicCuePackage?.cues || [];
  const sceneCueMap = result.musicCuePackage?.sceneCueMap || [];
  const chapterOutline = result.storyBible?.chapterOutline || [];
  const sceneBeats = result.storyBible?.sceneBeats || [];
  const songSections = result.musicCuePackage?.songDraft?.sections || [];
  const seriesPackage = result.seriesPackage;
  const trailerPackage = result.trailerPackage;
  const agentGuidance = result.agentGuidancePackage || {};
  const agentWorkflowSteps = agentGuidance.workflowSteps || [];
  const agentChecklist = agentGuidance.operatorChecklist || [];
  const agentInterfaces = agentGuidance.externalInterfaces || [];
  const agentDeliverables = agentGuidance.deliverables || [];
  const trailerBeats = [
    {
      label: 'Hook',
      text: result.storyBible?.premise || `${title} opens with a strong central premise.`,
    },
    {
      label: 'Engine',
      text: sceneOutline[0]?.summary || screenplayScenes[0]?.action || 'A first dramatic beat pulls the audience into the world.',
    },
    {
      label: 'Escalation',
      text: sceneOutline[Math.max(0, Math.floor(sceneOutline.length / 2))]?.summary || 'The middle of the story raises the stakes and broadens the world.',
    },
    {
      label: 'Finish',
      text: (sceneOutline.length > 0 ? sceneOutline[sceneOutline.length - 1]?.summary : null)
        || (sceneCueMap.length > 0 ? sceneCueMap[sceneCueMap.length - 1]?.purpose : null)
        || 'The ending lands with a clean emotional or visual payoff.',
    },
  ];
  const journeySteps = [
    { label: 'Comic pages', tab: 'overview' },
    { label: 'Pitch deck', tab: 'pitch' },
    { label: 'Trailer', tab: 'trailer' },
    { label: 'Video', tab: 'video' },
    { label: 'Story bible', tab: 'story' },
    { label: 'Series bible', tab: 'series' },
    { label: 'Screenplay', tab: 'script' },
    { label: 'Storyboard', tab: 'shots' },
    { label: 'Previs', tab: 'previs' },
    { label: 'Animatic', tab: 'timeline' },
    { label: 'Score', tab: 'music' },
    { label: 'Agents', tab: 'agents' },
    { label: 'Bundle', tab: 'deliverables' },
  ];

  const deliveryFiles = [
    {
      label: 'Project JSON',
      href: jobId ? `/api/comic/${jobId}/project` : null,
      filename: `${localSlug(title)}-project.json`,
      hint: 'Reusable project state and goal metadata.',
    },
    {
      label: 'Screenplay',
      href: jobId && result.screenplayPath ? `/api/comic/${jobId}/screenplay` : null,
      filename: `${localSlug(title)}-screenplay.md`,
      hint: 'Readable screenplay handoff for the show/movie version.',
    },
    {
      label: 'Director brief',
      href: jobId && result.directorBriefPath ? `/api/comic/${jobId}/director-brief` : null,
      filename: `${localSlug(title)}-director-brief.md`,
      hint: 'Human-readable production brief tying together story, visuals, trailer, and score.',
    },
    {
      label: 'Storyboard package',
      href: jobId ? `/api/comic/${jobId}/storyboard-package` : null,
      filename: `${localSlug(title)}-storyboard-package.json`,
      hint: 'Scene prompts for visual planning.',
    },
    {
      label: 'Trailer package',
      href: jobId ? `/api/comic/${jobId}/trailer-package` : null,
      filename: `${localSlug(title)}-trailer-package.json`,
      hint: 'Pitch beats and teaser structure for the screen version.',
    },
    {
      label: 'Video package',
      href: jobId && result.videoPackagePath ? `/api/comic/${jobId}/video-package` : null,
      filename: `${localSlug(title)}-video-package.json`,
      hint: 'MiniMax-ready video clip prompts and motion workflow for real show/movie output.',
    },
    {
      label: 'Series package',
      href: jobId && result.seriesPackagePath ? `/api/comic/${jobId}/series-package` : null,
      filename: `${localSlug(title)}-series-package.json`,
      hint: 'Episode arc, pilot beat sheet, and showrunner notes for the show version.',
    },
    {
      label: 'Animatic timeline',
      href: jobId ? `/api/comic/${jobId}/animatic-timeline` : null,
      filename: `${localSlug(title)}-animatic-timeline.json`,
      hint: 'Timing map for pacing and cuts.',
    },
    {
      label: 'Song sheet',
      href: jobId ? `/api/comic/${jobId}/song-sheet` : null,
      filename: `${localSlug(title)}-song-sheet.md`,
      hint: 'Lyrics and song structure.',
    },
    {
      label: 'Music package',
      href: jobId && result.musicCuePackagePath ? `/api/comic/${jobId}/music-cue-package` : null,
      filename: `${localSlug(title)}-music-cue-package.json`,
      hint: 'Score brief and cue map for the film/show pass.',
    },
    {
      label: 'Theme audio',
      href: jobId ? `/api/comic/${jobId}/theme-audio` : null,
      filename: `${localSlug(title)}-theme.${String(result.songAudioPath || '').toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav'}`,
      hint: 'Rendered music asset for the movie/show pass.',
    },
    {
      label: 'Agent guidance',
      href: jobId ? `/api/comic/${jobId}/agent-guidance` : null,
      filename: `${localSlug(title)}-agent-guidance.md`,
      hint: 'Repo-aware operator instructions.',
    },
    {
      label: 'Studio bundle',
      href: jobId ? `/api/comic/${jobId}/studio-bundle` : null,
      filename: `${localSlug(title)}-studio-bundle.json`,
      hint: 'Unified handoff for agents and collaborators.',
    },
    {
      label: 'Playbook',
      href: '/api/agent-playbook',
      filename: 'hermes-openclaw-playbook.md',
      hint: 'Hermes/OpenClaw operating guide.',
    },
  ];

  function handleDownloadStoryboardPackage() {
    if (!jobId || !result?.storyboardPackagePath) return;
    download(
      `/api/comic/${jobId}/storyboard-package`,
      `${localSlug(title)}-storyboard-package.json`,
      'Storyboard package downloaded.'
    );
  }

  function handleDownloadAnimaticTimeline() {
    if (!jobId || !result?.animaticTimelinePath) return;
    download(
      `/api/comic/${jobId}/animatic-timeline`,
      `${localSlug(title)}-animatic-timeline.json`,
      'Animatic timeline downloaded.'
    );
  }

  function handleDownloadScreenplay() {
    if (!jobId || !result?.screenplayPath) return;
    download(
      `/api/comic/${jobId}/screenplay`,
      `${localSlug(title)}-screenplay.md`,
      'Screenplay downloaded.'
    );
  }

  function handleDownloadDirectorBrief() {
    if (!jobId || !result?.directorBriefPath) return;
    download(
      `/api/comic/${jobId}/director-brief`,
      `${localSlug(title)}-director-brief.md`,
      'Director brief downloaded.'
    );
  }

  function handleDownloadSeriesPackage() {
    if (!jobId || !result?.seriesPackagePath) return;
    download(
      `/api/comic/${jobId}/series-package`,
      `${localSlug(title)}-series-package.json`,
      'Series package downloaded.'
    );
  }

  function handleDownloadVideoPackage() {
    if (!jobId || !result?.videoPackagePath) return;
    download(
      `/api/comic/${jobId}/video-package`,
      `${localSlug(title)}-video-package.json`,
      'Video package downloaded.'
    );
  }

  function handleDownloadSongSheet() {
    if (!jobId || !result?.songSheetPath) return;
    download(`/api/comic/${jobId}/song-sheet`, `${localSlug(title)}-song-sheet.md`, 'Song sheet downloaded.');
  }

  function handleDownloadThemeAudio() {
    if (!jobId || !result?.songAudioPath) return;
    const ext = String(result.songAudioPath).toLowerCase().endsWith('.mp3') ? 'mp3' : 'wav';
    download(`/api/comic/${jobId}/theme-audio`, `${localSlug(title)}-theme.${ext}`, 'Theme audio downloaded.');
  }

  function handleDownloadAgentGuidance() {
    if (!jobId || !result?.agentGuidancePath) return;
    download(`/api/comic/${jobId}/agent-guidance`, `${localSlug(title)}-agent-guidance.md`, 'Agent guidance downloaded.');
  }

  function handleDownloadStudioBundle() {
    if (!jobId || !result?.studioBundlePath) return;
    download(`/api/comic/${jobId}/studio-bundle`, `${localSlug(title)}-studio-bundle.json`, 'Studio bundle downloaded.');
  }

  function handleDownloadAgentPlaybook() {
    download('/api/agent-playbook', 'hermes-openclaw-playbook.md', 'Agent playbook downloaded.');
  }

  function sceneMeta(sceneId) {
    return sceneOutline.find((scene) => scene.sceneId === sceneId);
  }

  function cueForScene(sceneId) {
    return cues.find((cue) => cue.sceneId === sceneId);
  }

  return html`
    <section class="panel movie-panel" aria-labelledby="movie-title">
      <header class="panel-title">
        <h2 id="movie-title">Movie / Show Board</h2>
        ${onOpenComic ? html`
          <button class="btn-ghost close-btn" type="button" onClick=${onOpenComic} aria-label="Back to comic result">✕</button>
        ` : null}
      </header>

      <div class="movie-hero">
        <div>
          <p class="movie-kicker">This is the adaptation workspace, not a comic slideshow.</p>
          <h3>${title}</h3>
          <p class="movie-summary">
            ${projectGoalLabel} focus · ${artStyle} art style · ${outputProfile} render profile
          </p>
        </div>
        <div class="movie-stats">
          <span class="badge">Scenes ${screenplayScenes.length}</span>
          <span class="badge">Storyboard ${storyboardPrompts.length}</span>
          <span class="badge">Cues ${cues.length}</span>
          <span class="badge">Score ${songSections.length}</span>
        </div>
      </div>

      <div class="movie-journey" aria-label="Adaptation pipeline">
        ${journeySteps.map((step, index) => html`
          <div class=${'movie-step' + (activeTab === step.tab ? ' active' : '')} key=${step.label}>
            <span>${String(index + 1).padStart(2, '0')}</span>
            <strong>${step.label}</strong>
          </div>
        `)}
      </div>

      <div class="result-tabs movie-tabs" role="tablist" aria-label="Movie board tabs">
        ${TABS.map((tab) => html`
          <button
            key=${tab.id}
            type="button"
            role="tab"
            aria-selected=${activeTab === tab.id}
            class=${'result-tab' + (activeTab === tab.id ? ' active' : '')}
            onClick=${() => setActiveTab(tab.id)}
          >
            ${tab.label}
          </button>
        `)}
      </div>

      ${activeTab === 'overview' ? html`
        <div class="movie-grid">
          <section class="movie-card">
            <h3>What this turns into</h3>
            <p>
              The comic becomes a film/show production board with story beats, screenplay scenes,
              shot prompts, animatic timing, and music cues. This is the structure you need before
              you move into previs or a pitch.
            </p>
            <ul class="movie-bullets">
              <li>${sceneOutline.length} scene outline beats</li>
              <li>${seriesPackage?.episodeOutline?.length || 0} episode seeds</li>
              <li>${screenplayScenes.length} screenplay scenes</li>
              <li>${storyboardPrompts.length} storyboard prompts</li>
              <li>${sceneCueMap.length} music timing links</li>
            </ul>
          </section>
          <section class="movie-card">
            <h3>Fast actions</h3>
            <div class="action-row">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStudioBundle}>Download studio bundle</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>Download screenplay</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>Download director brief</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentGuidance}>Download agent guidance</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSeriesPackage}>Download series package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStoryboardPackage}>Download storyboard package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadVideoPackage}>Download video package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAnimaticTimeline}>Download animatic timeline</button>
            </div>
          </section>
        </div>
      ` : null}

      ${activeTab === 'pitch' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card movie-pitch-card">
            <h3>Pitch spine</h3>
            <p class="movie-pitch-line">${result.storyBible?.premise || `${title} is ready for a cinematic adaptation.`}</p>
            <p class="muted small">${result.storyBible?.synopsis || 'The pitch deck starts from the generated story bible and carries it into film/show form.'}</p>
          </section>
          <section class="movie-card movie-pitch-card">
            <h3>Audience and promise</h3>
            <div class="movie-pitch-tags">
              <span class="movie-chip">Goal ${projectGoalLabel}</span>
              <span class="movie-chip subtle">${artStyle}</span>
              <span class="movie-chip subtle">${outputProfile}</span>
            </div>
            <p class="muted small" style="margin-top: .65rem;">
              Use this board to shape a pitch, trailer, teaser, or show bible without flattening the comic into a slideshow.
            </p>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Trailer beats</h3>
            <div class="movie-trailer-beats">
              ${trailerBeats.map((beat, index) => html`
                <article class="movie-trailer-beat" key=${beat.label}>
                  <span class="movie-chip">${String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>${beat.label}</strong>
                    <p>${beat.text}</p>
                  </div>
                </article>
              `)}
            </div>
          </section>
          <section class="movie-card">
            <h3>Pitch deliverables</h3>
            <ul class="movie-list">
              <li>Use the story bible as the emotional backbone.</li>
              <li>Use the screenplay scenes as the scene order for a show/movie pass.</li>
              <li>Use storyboard prompts and animatic timing to plan pacing.</li>
              <li>Use the music package to shape teaser energy and theme music.</li>
            </ul>
          </section>
        </div>
      ` : null}

      ${activeTab === 'video' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card movie-pitch-card">
            <h3>Video generation package</h3>
            <p class="movie-pitch-line">${result.videoPackage?.overview || `${title} is ready for MiniMax video generation.`}</p>
            <p class="muted small">${result.videoPackage?.trailerDirection || 'Use the video package to turn storyboard shots into real motion, not a slideshow.'}</p>
            <div class="action-row">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadVideoPackage}>Download video package</button>
            </div>
          </section>
          <section class="movie-card">
            <h3>MiniMax commands</h3>
            <ul class="movie-list">
              <li><code>${result.videoPackage?.commands?.generate || 'mmx video generate --prompt "<clip prompt>" --async'}</code></li>
              <li><code>${result.videoPackage?.commands?.poll || 'mmx video task get --task-id <task-id>'}</code></li>
              <li><code>${result.videoPackage?.commands?.download || 'mmx video download --file-id <file-id> --out clip.mp4'}</code></li>
            </ul>
          </section>
        </div>
        <div class="movie-grid">
          ${(result.videoPackage?.clips || []).length > 0
            ? result.videoPackage.clips.map((clip) => html`
              <article class="movie-card movie-script-card" key=${clip.clipId}>
                <div class="scene-head">
                  <span class="movie-chip">${clip.clipId}</span>
                  <span class="movie-chip subtle">${clip.title}</span>
                </div>
                <p>${clip.prompt}</p>
                <div class="movie-script-meta">
                  <div>
                    <strong>Camera / motion</strong>
                    <p>${clip.cameraLanguage || 'Cinematic movement and readable blocking.'}</p>
                  </div>
                  <div>
                    <strong>Music tie-in</strong>
                    <p>${clip.musicCueTitle || 'No cue linked yet.'}</p>
                  </div>
                </div>
              </article>
            `)
            : html`<p class="muted small">No video clip package yet.</p>`}
        </div>
      ` : null}

      ${activeTab === 'trailer' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card movie-pitch-card">
            <h3>Trailer package</h3>
            <p class="movie-pitch-line">${trailerPackage?.logline || `${title} is ready for a screen teaser.`}</p>
            <p class="muted small">${trailerPackage?.hook || 'The trailer package turns the adaptation into a pitchable teaser sequence.'}</p>
          </section>
          <section class="movie-card">
            <h3>Duration</h3>
            <p><strong>${trailerPackage?.durationSeconds || 0} seconds</strong></p>
            <p class="muted small">The trailer package is short by design, so it can be handed to agents or editors as a teaser skeleton.</p>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Voice over</h3>
            <ul class="movie-list">
              ${(trailerPackage?.voiceOver || []).length > 0
                ? trailerPackage.voiceOver.map((line) => html`<li key=${line}>${line}</li>`)
                : html`<li>No voice over yet.</li>`}
            </ul>
          </section>
          <section class="movie-card">
            <h3>Cut list</h3>
            <div class="movie-previs-list">
              ${(trailerPackage?.cutList || []).length > 0
                ? trailerPackage.cutList.map((cut) => html`
                  <article class="movie-previs-card" key=${cut.shotId}>
                    <div class="scene-head">
                      <span class="movie-chip">${cut.shotId}</span>
                      <span class="movie-chip subtle">${cut.shotType}</span>
                    </div>
                    <p>${cut.purpose}</p>
                  </article>
                `)
                : html`<p class="muted small">No cut list yet.</p>`}
            </div>
          </section>
        </div>
      ` : null}

      ${activeTab === 'story' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Story spine</h3>
            <p>${result.storyBible?.premise || 'No premise captured yet.'}</p>
            <p class="muted small">${result.storyBible?.synopsis || 'No synopsis captured yet.'}</p>
          </section>
          <section class="movie-card">
            <h3>Format intent</h3>
            <p>Goal: <strong>${projectGoalLabel}</strong></p>
            <p>Render profile: <strong>${outputProfile}</strong></p>
            <p>Art direction: <strong>${artStyle}</strong></p>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Chapter outline</h3>
            <ol class="movie-list">
              ${chapterOutline.length > 0
                ? chapterOutline.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No chapter outline yet.</li>`}
            </ol>
          </section>
          <section class="movie-card">
            <h3>Scene beats</h3>
            <ol class="movie-list">
              ${sceneBeats.length > 0
                ? sceneBeats.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No scene beats yet.</li>`}
            </ol>
          </section>
        </div>
      ` : null}

      ${activeTab === 'series' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card movie-pitch-card">
            <h3>Series hook</h3>
            <p class="movie-pitch-line">${seriesPackage?.seriesLogline || `${title} is ready for an episodic adaptation.`}</p>
            <p class="muted small">${seriesPackage?.premise || result.storyBible?.premise || 'No episodic premise captured yet.'}</p>
          </section>
          <section class="movie-card">
            <h3>Format target</h3>
            <p><strong>${seriesPackage?.targetFormat || 'pilot'}</strong></p>
            <p class="muted small">This tab is for the show version: episode flow, season engine, and showrunner notes.</p>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Season arc</h3>
            <ol class="movie-list">
              ${(seriesPackage?.seasonArc || []).length > 0
                ? seriesPackage.seasonArc.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No season arc yet.</li>`}
            </ol>
          </section>
          <section class="movie-card">
            <h3>Pilot beat sheet</h3>
            <ol class="movie-list">
              ${(seriesPackage?.pilotBeatSheet || []).length > 0
                ? seriesPackage.pilotBeatSheet.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No pilot beat sheet yet.</li>`}
            </ol>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Episode seeds</h3>
            <div class="movie-previs-list">
              ${(seriesPackage?.episodeOutline || []).length > 0
                ? seriesPackage.episodeOutline.map((episode) => html`
                  <article class="movie-previs-card" key=${episode.episodeId}>
                    <div class="scene-head">
                      <span class="movie-chip">${episode.episodeId}</span>
                      <span class="movie-chip subtle">${episode.title}</span>
                    </div>
                    <p>${episode.summary}</p>
                    <p class="muted small">Cliffhanger: ${episode.cliffhanger}</p>
                  </article>
                `)
                : html`<p class="muted small">No episode outline yet.</p>`}
            </div>
          </section>
          <section class="movie-card">
            <h3>Showrunner notes</h3>
            <ul class="movie-list">
              ${(seriesPackage?.showrunnerNotes || []).length > 0
                ? seriesPackage.showrunnerNotes.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No showrunner notes yet.</li>`}
            </ul>
            <div class="action-row" style="margin-top: .9rem;">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSeriesPackage}>Download series package</button>
            </div>
          </section>
        </div>
      ` : null}

      ${activeTab === 'script' ? html`
        <div class="movie-grid">
          <section class="movie-card movie-pitch-card">
            <h3>Screenplay export</h3>
            <p class="movie-pitch-line">Use the screenplay handoff to move directly from comic structure into script-driven development.</p>
            <div class="action-row">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>Download screenplay</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>Download director brief</button>
            </div>
          </section>
          ${screenplayScenes.map((scene) => html`
            <article class="movie-card movie-script-card" key=${scene.sceneId}>
              <div class="scene-head">
                <span class="movie-chip">${scene.sceneId}</span>
                <span class="movie-chip subtle">${scene.slugline}</span>
              </div>
              <p class="movie-script-action">${scene.action}</p>
              <div class="movie-script-meta">
                <div>
                  <strong>Dialogue sample</strong>
                  <p>${scene.dialogueSample.join(' / ')}</p>
                </div>
                <div>
                  <strong>Camera / shots</strong>
                  <p>${scene.shotList.join(', ')}</p>
                </div>
              </div>
            </article>
          `)}
        </div>
      ` : null}

      ${activeTab === 'shots' ? html`
        <div class="movie-grid">
          ${storyboardPrompts.map((scene) => {
            const summary = sceneMeta(scene.sceneId);
            return html`
              <article class="movie-card" key=${scene.sceneId}>
                <div class="scene-head">
                  <span class="movie-chip">${scene.sceneId}</span>
                  <span class="movie-chip subtle">${scene.cameraLanguage}</span>
                </div>
                <p>${scene.prompt}</p>
                ${summary ? html`<p class="muted small">Visual goal: ${summary.visualGoal}</p>` : null}
              </article>
            `;
          })}
        </div>
      ` : null}

      ${activeTab === 'previs' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Previs scene map</h3>
            <div class="movie-previs-list">
              ${screenplayScenes.length > 0
                ? screenplayScenes.map((scene) => html`
                  <article class="movie-previs-card" key=${scene.sceneId}>
                    <div class="scene-head">
                      <span class="movie-chip">${scene.sceneId}</span>
                      <span class="movie-chip subtle">${scene.slugline}</span>
                    </div>
                    <p>${scene.action}</p>
                    <p class="muted small">Previs angle: ${scene.shotList.join(' · ')}</p>
                  </article>
                `)
                : html`<p class="muted small">No screenplay scenes yet.</p>`}
            </div>
          </section>
          <section class="movie-card">
            <h3>Timing notes</h3>
            <div class="movie-previs-list">
              ${sceneCueMap.length > 0
                ? sceneCueMap.map((entry) => {
                  const cue = cueForScene(entry.sceneId);
                  return html`
                    <article class="movie-previs-card" key=${entry.sceneId + entry.cueId}>
                      <div class="scene-head">
                        <span class="movie-chip">${entry.sceneId}</span>
                        <span class="movie-chip subtle">${entry.timing}</span>
                      </div>
                      <p>${entry.purpose}</p>
                      ${cue ? html`<p class="muted small">Music cue: ${cue.title}</p>` : null}
                    </article>
                  `;
                })
                : html`<p class="muted small">No cue timing yet.</p>`}
            </div>
            <div class="action-row" style="margin-top: .9rem;">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStoryboardPackage}>Download storyboard package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAnimaticTimeline}>Download animatic timeline</button>
            </div>
          </section>
        </div>
      ` : null}

      ${activeTab === 'timeline' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Animatic timeline</h3>
            <div class="movie-timeline">
              ${sceneCueMap.length > 0
                ? sceneCueMap.map((entry) => {
                  const cue = cueForScene(entry.sceneId);
                  return html`
                    <div class="movie-timeline-row" key=${entry.sceneId + entry.cueId}>
                      <span class="movie-chip">${entry.sceneId}</span>
                      <span class="movie-timeline-time">${entry.timing}</span>
                      <span>${entry.purpose}</span>
                      ${cue ? html`<span class="movie-chip subtle">${cue.title}</span>` : null}
                    </div>
                  `;
                })
                : html`<p class="muted small">No timing map yet.</p>`}
            </div>
          </section>
          <section class="movie-card">
            <h3>Timing + export</h3>
            <p>Use the timeline to pace cuts, dialogue, music hits, and animated transitions.</p>
            <div class="action-row">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStoryboardPackage}>Download storyboard package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAnimaticTimeline}>Download animatic timeline</button>
            </div>
          </section>
        </div>
      ` : null}

      ${activeTab === 'music' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Theme song</h3>
            <p><strong>${result.musicCuePackage?.songDraft?.title || 'Theme'}</strong></p>
            <p>${result.musicCuePackage?.songDraft?.genre || 'cinematic pop'} · ${result.musicCuePackage?.songDraft?.bpm || 0} BPM · ${result.musicCuePackage?.songDraft?.key || '—'}</p>
            <p>Sections: ${songSections.join(', ') || '—'}</p>
            <div class="movie-lyrics">
              <pre>${result.musicCuePackage?.songDraft?.lyrics || 'No lyrics drafted yet.'}</pre>
            </div>
          </section>
          <section class="movie-card">
            <h3>Cue map</h3>
            ${cues.length > 0
              ? cues.map((cue) => html`
                <div class="movie-cue" key=${cue.cueId}>
                  <strong>${cue.title}</strong>
                  <span>${cue.mood}</span>
                  <span>${cue.placement}</span>
                </div>
              `)
              : html`<p class="muted small">No cue map yet.</p>`}
          </section>
        </div>
        <div class="action-row">
          ${result.musicCuePackagePath ? html`
            <button class="btn btn-ghost btn-sm" type="button" onClick=${() => {
              if (!jobId || !result?.musicCuePackagePath) return;
              download(`/api/comic/${jobId}/music-cue-package`, `${localSlug(title)}-music-cue-package.json`, 'Music cue package downloaded.');
            }}>
              Download music package
            </button>
          ` : null}
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSongSheet}>Download song sheet</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadThemeAudio}>Download theme audio</button>
        </div>
      ` : null}

      ${activeTab === 'agents' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Hermes / OpenClaw workspace</h3>
            <p class="movie-pitch-line">${agentGuidance.systemPrompt || 'No agent guidance has been generated yet.'}</p>
            <div class="movie-pitch-tags">
              ${agentInterfaces.length > 0
                ? agentInterfaces.map((item) => html`<span class="movie-chip subtle" key=${item}>${item}</span>`)
                : html`<span class="movie-chip subtle">No interfaces yet</span>`}
            </div>
          </section>
          <section class="movie-card">
            <h3>Workflow steps</h3>
            <ol class="movie-list">
              ${agentWorkflowSteps.length > 0
                ? agentWorkflowSteps.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No workflow steps yet.</li>`}
            </ol>
          </section>
        </div>
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Operator checklist</h3>
            <ol class="movie-list">
              ${agentChecklist.length > 0
                ? agentChecklist.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No checklist yet.</li>`}
            </ol>
          </section>
          <section class="movie-card">
            <h3>Agent deliverables</h3>
            <ul class="movie-list">
              ${agentDeliverables.length > 0
                ? agentDeliverables.map((item) => html`<li key=${item}>${item}</li>`)
                : html`<li>No deliverables yet.</li>`}
            </ul>
          </section>
        </div>
        <div class="action-row">
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentGuidance}>Download agent guidance</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>Download screenplay</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>Download director brief</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentPlaybook}>Download playbook</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadSeriesPackage}>Download series package</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStudioBundle}>Download studio bundle</button>
        </div>
      ` : null}

      ${activeTab === 'deliverables' ? html`
        <div class="movie-grid movie-grid-two">
          <section class="movie-card">
            <h3>Downloads</h3>
            <div class="movie-deliverables">
              ${deliveryFiles.map((item) => html`
                <div class="movie-deliverable" key=${item.label}>
                  <div>
                    <strong>${item.label}</strong>
                    <p class="muted small">${item.hint}</p>
                  </div>
                  ${item.href ? html`
                    <a class="btn btn-ghost btn-sm" href=${item.href} download=${item.filename}>Download ${item.label.toLowerCase()}</a>
                  ` : html`
                    <span class="movie-deliverable-state">Missing</span>
                  `}
                </div>
              `)}
            </div>
          </section>
          <section class="movie-card">
            <h3>Actions</h3>
            <div class="action-row">
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStudioBundle}>Download studio bundle</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>Download screenplay</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>Download director brief</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadVideoPackage}>Download video package</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentGuidance}>Download agent guidance</button>
              <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentPlaybook}>Download playbook</button>
            </div>
            <p class="muted small" style="margin-top: .75rem;">
              The studio bundle is the best handoff for agents or collaborators who need the full movie/show package in one file.
            </p>
          </section>
        </div>
      ` : null}

      <section class="movie-card movie-footer-card">
        <h3>Agent handoff</h3>
        <p>The playbook and guidance files let Hermes/OpenClaw agents continue the show/movie pass without starting over.</p>
        <div class="action-row">
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentPlaybook}>Download playbook</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadAgentGuidance}>Download agent guidance</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadScreenplay}>Download screenplay</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadDirectorBrief}>Download director brief</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadVideoPackage}>Download video package</button>
          <button class="btn btn-ghost btn-sm" type="button" onClick=${handleDownloadStudioBundle}>Download studio bundle</button>
        </div>
      </section>
    </section>
  `;
}
