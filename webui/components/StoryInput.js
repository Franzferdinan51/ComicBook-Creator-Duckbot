/**
 * StoryInput — the big textarea at the top of the create page.
 * Owns the user's story text and exposes a character counter + preset prompts.
 *
 * Props:
 *   value:    string  — the current story text (controlled)
 *   onChange: (next: string) => void
 *   disabled: boolean — disables input during generation
 */

import { html } from './_lib.js';

const MAX_LEN = 5000;
const MIN_LEN = 3;

const PRESETS = [
  'A robot discovers an abandoned garden and learns to grow tomatoes.',
  'Two rival mages must team up to stop a dragon threatening their village.',
  'A time-traveler gets stuck in a world where music never existed.',
  'A detective with no memory wakes up in a city ruled by cats.',
  'A retired superhero gets pulled back for one last mission.',
];

export function StoryInput({ value, onChange, disabled = false }) {
  const len = (value || '').length;
  const tooShort = len < MIN_LEN;
  const tooLong = len > MAX_LEN;

  return html`
    <section class="panel" aria-labelledby="story-title">
      <header class="panel-title">
        <h2 id="story-title">Story</h2>
        <span class="char-count ${tooShort ? 'warn' : ''} ${tooLong ? 'err' : ''}"
              aria-live="polite">
          ${len}/${MAX_LEN}
        </span>
      </header>

      <label class="sr-only" for="story-textarea">Your comic story</label>
      <textarea
        id="story-textarea"
        class="story-textarea"
        placeholder="Once upon a time in a faraway kingdom..."
        value=${value || ''}
        maxlength=${MAX_LEN}
        disabled=${disabled}
        aria-describedby="story-hint"
        onInput=${(e) => onChange(e.target.value)}
      ></textarea>

      <div id="story-hint" class="story-hint">
        ${tooShort
          ? `Story must be at least ${MIN_LEN} characters.`
          : 'Describe the comic you want. Aim for one or two sentences.'}
      </div>

      <div class="presets" role="group" aria-label="Story presets">
        <span class="presets-label">Try a preset:</span>
        ${PRESETS.map((p) => html`
          <button
            key=${p}
            type="button"
            class="preset-chip"
            disabled=${disabled}
            onClick=${() => onChange(p)}
            title=${p}
          >
            ${p.length > 36 ? p.slice(0, 36) + '…' : p}
          </button>
        `)}
      </div>
    </section>
  `;
}

export const STORY_MIN_LEN = MIN_LEN;
export const STORY_MAX_LEN = MAX_LEN;
