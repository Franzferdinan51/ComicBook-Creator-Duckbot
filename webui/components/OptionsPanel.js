/**
 * OptionsPanel — every ComicOptions field exposed in the UI.
 * Art style, page count, panels-per-page, layout, output format, providers, seed.
 *
 * Props:
 *   options:   Partial<ComicOptions>
 *   providers: { text: ProviderInfo[], image: ProviderInfo[] }
 *   onChange:  (next: Partial<ComicOptions>) => void
 *   disabled:  boolean — disables inputs during generation
 */

import { html } from './_lib.js';

const ART_STYLES = [
  'manga', 'noir', 'cartoon', 'watercolor', 'comic book',
  'anime', 'cyberpunk', 'fantasy', 'pixel art', 'storyboard',
];

const LAYOUTS = [
  { value: 'auto',      label: 'Auto (let the server decide)' },
  { value: 'grid-2x2',  label: 'Grid 2×2' },
  { value: 'grid-2x3',  label: 'Grid 2×3' },
  { value: 'strip-3',   label: 'Strip (3 rows)' },
  { value: 'custom',    label: 'Custom' },
];

const OUTPUT_PROFILES = [
  { value: 'comic-print', label: 'Comic Print' },
  { value: 'digital-portrait', label: 'Digital Portrait' },
  { value: 'storyboard-widescreen', label: 'Storyboard Widescreen' },
];

const PROJECT_GOALS = [
  { value: 'comic', label: 'Comic-first' },
  { value: 'screen', label: 'Screen / show' },
  { value: 'music', label: 'Music-first' },
  { value: 'studio', label: 'Studio balance' },
];

const PAGE_COUNT_MIN = 1;
const PAGE_COUNT_MAX = 12;
const PANELS_MIN = 1;
const PANELS_MAX = 6;

function clamp(n, lo, hi, fallback) {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

export function OptionsPanel({ options = {}, providers, onChange, disabled = false }) {
  const set = (patch) => onChange({ ...options, ...patch });

  const pageCount = clamp(
    options.pageCount ?? 4, PAGE_COUNT_MIN, PAGE_COUNT_MAX, 4
  );
  const panelsPerPage = clamp(
    options.panelsPerPage ?? 4, PANELS_MIN, PANELS_MAX, 4
  );

  const textProviders = providers?.text || [];
  const imageProviders = providers?.image || [];
  const inferredOutputProfile = options.outputProfile || (options.projectGoal === 'screen' ? 'storyboard-widescreen' : 'comic-print');
  const noProviders =
    textProviders.length === 0 && imageProviders.length === 0;

  if (noProviders) {
    return html`
      <section class="panel" aria-labelledby="options-title">
        <header class="panel-title">
          <h2 id="options-title">Options</h2>
        </header>
        <div class="empty-state">
          <p>Could not reach the server. Check that the comic-creator WebUI is running.</p>
        </div>
      </section>
    `;
  }

  return html`
    <section class="panel" aria-labelledby="options-title">
      <header class="panel-title">
        <h2 id="options-title">Options</h2>
      </header>

      <div class="field">
        <label for="art-style">Art style</label>
        <input
          id="art-style"
          type="text"
          value=${options.artStyle || ''}
          disabled=${disabled}
          placeholder="e.g. manga, noir, watercolor"
          onInput=${(e) => set({ artStyle: e.target.value })}
        />
        <div class="presets">
          ${ART_STYLES.map((s) => html`
            <button
              key=${s}
              type="button"
              class=${'preset-chip' + (options.artStyle === s ? ' active' : '')}
              disabled=${disabled}
              onClick=${() => set({ artStyle: s })}
            >${s}</button>
          `)}
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="page-count">Pages <span class="muted">(${PAGE_COUNT_MIN}-${PAGE_COUNT_MAX})</span></label>
          <input
            id="page-count"
            type="number"
            min=${PAGE_COUNT_MIN}
            max=${PAGE_COUNT_MAX}
            value=${pageCount}
            disabled=${disabled}
            onInput=${(e) => set({ pageCount: clamp(parseInt(e.target.value, 10), PAGE_COUNT_MIN, PAGE_COUNT_MAX, 4) })}
          />
        </div>

        <div class="field">
          <label for="panels-per-page">Panels / page <span class="muted">(${PANELS_MIN}-${PANELS_MAX})</span></label>
          <input
            id="panels-per-page"
            type="number"
            min=${PANELS_MIN}
            max=${PANELS_MAX}
            value=${panelsPerPage}
            disabled=${disabled}
            onInput=${(e) => set({ panelsPerPage: clamp(parseInt(e.target.value, 10), PANELS_MIN, PANELS_MAX, 4) })}
          />
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="layout">Page layout</label>
          <select
            id="layout"
            value=${options.layout || 'auto'}
            disabled=${disabled}
            onChange=${(e) => set({ layout: e.target.value })}
          >
            ${LAYOUTS.map((l) => html`
              <option key=${l.value} value=${l.value}>${l.label}</option>
            `)}
          </select>
        </div>

        <div class="field">
          <label for="project-goal">Project goal</label>
          <select
            id="project-goal"
            value=${options.projectGoal || 'comic'}
            disabled=${disabled}
            onChange=${(e) => set({ projectGoal: e.target.value })}
          >
            ${PROJECT_GOALS.map((goal) => html`
              <option key=${goal.value} value=${goal.value}>${goal.label}</option>
            `)}
          </select>
          <div class="muted small">Screen projects default to the storyboard widescreen profile unless you override the output profile below.</div>
        </div>

        <div class="field">
          <label for="output-profile">Output profile</label>
          <select
            id="output-profile"
            value=${inferredOutputProfile}
            disabled=${disabled}
            onChange=${(e) => set({ outputProfile: e.target.value })}
          >
            ${OUTPUT_PROFILES.map((profile) => html`
              <option key=${profile.value} value=${profile.value}>${profile.label}</option>
            `)}
          </select>
        </div>

        <div class="field">
          <label for="output-format">Output format</label>
          <select
            id="output-format"
            value=${options.outputFormat || 'pdf'}
            disabled=${disabled}
            onChange=${(e) => set({ outputFormat: e.target.value })}
          >
            <option value="pdf">PDF</option>
            <option value="cbz">CBZ (zipped)</option>
          </select>
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label for="text-provider">Text provider</label>
          <select
            id="text-provider"
            value=${options.textProvider || 'mock'}
            disabled=${disabled}
            onChange=${(e) => set({ textProvider: e.target.value, textModel: undefined })}
          >
            ${textProviders.map((p) => html`
              <option
                key=${p.name}
                value=${p.name}
                disabled=${!p.available}
                title=${p.error || (p.model ? `default model: ${p.model}` : '')}
              >
                ${p.name}${p.available ? ` · ${p.model || 'ok'}` : ' · unavailable'}
              </option>
            `)}
          </select>
        </div>

        <div class="field">
          <label for="image-provider">Image provider</label>
          <select
            id="image-provider"
            value=${options.imageProvider || 'mock'}
            disabled=${disabled}
            onChange=${(e) => set({ imageProvider: e.target.value, imageModel: undefined })}
          >
            ${imageProviders.map((p) => html`
              <option
                key=${p.name}
                value=${p.name}
                disabled=${!p.available}
                title=${p.error || (p.model ? `default model: ${p.model}` : '')}
              >
                ${p.name}${p.available ? ` · ${p.model || 'ok'}` : ' · unavailable'}
              </option>
            `)}
          </select>
        </div>
      </div>

      <${ModelPicker}
        kind="text"
        providerName=${options.textProvider || 'mock'}
        providers=${textProviders}
        value=${options.textModel}
        defaultModel=${textProviders.find((p) => p.name === (options.textProvider || 'mock'))?.model}
        disabled=${disabled}
        onChange=${(model) => set({ textModel: model })}
      />
      <${ModelPicker}
        kind="image"
        providerName=${options.imageProvider || 'mock'}
        providers=${imageProviders}
        value=${options.imageModel}
        defaultModel=${imageProviders.find((p) => p.name === (options.imageProvider || 'mock'))?.model}
        disabled=${disabled}
        onChange=${(model) => set({ imageModel: model })}
      />

      <${ImageAspectPicker}
        aspectRatio=${options.imageAspectRatio}
        promptOptimizer=${!!options.imagePromptOptimizer}
        aigcWatermark=${!!options.imageAigcWatermark}
        disabled=${disabled}
        onAspectChange=${(r) => set({ imageAspectRatio: r })}
        onPromptOptimizerChange=${(v) => set({ imagePromptOptimizer: v ? true : undefined })}
        onAigcWatermarkChange=${(v) => set({ imageAigcWatermark: v ? true : undefined })}
      />

      <div class="field">
        <label for="seed">Seed <span class="muted">(optional — for reproducible results)</span></label>
        <input
          id="seed"
          type="number"
          value=${options.seed ?? ''}
          disabled=${disabled}
          placeholder="e.g. 42"
          onInput=${(e) => {
            const raw = e.target.value;
            set({ seed: raw === '' ? undefined : parseInt(raw, 10) || 0 });
          }}
        />
      </div>

      ${(options.imageProvider === 'mock' || options.textProvider === 'mock' || (!options.imageProvider && !options.textProvider))
        ? html`<p class="note">Mock provider: results are placeholders, not real AI art.</p>`
        : null}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// ModelPicker — provider-aware model selector with curated suggestions
// for the built-in providers and a free-text fallback for custom ones.
// ---------------------------------------------------------------------------

/**
 * Known model suggestions for the built-in providers, surfaced as a
 * datalist the user can pick from (or type their own value). These are
 * the docs/benchmark defaults — not a complete list, and not necessarily
 * available without a paid account. The user's free-text input is always
 * accepted; this is purely a quick-pick affordance.
 */
const MODEL_SUGGESTIONS = {
  minimax: {
    text:  ['MiniMax-M3', 'minimax/minimax'],
    image: ['image-01'],
  },
  openrouter: {
    text: [
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3.5-haiku',
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large-latest',
      'openrouter/auto',
    ],
    image: [
      'black-forest-labs/flux.1-schnell',
      'black-forest-labs/flux.1-dev',
      'openai/dall-e-3',
      'stabilityai/stable-diffusion-xl',
      'bytedance/sd3.5',
    ],
  },
  lmstudio: {
    text: [
      'qwen3.6-35b-a3b',
      'qwen2.5-72b-instruct',
      'llama-3.3-70b-instruct',
      'mistral-nemo',
      'phi-3.5-mini-instruct',
    ],
    image: ['sdxl', 'sdxl-turbo', 'flux.1-schnell', 'sd-3.5-large'],
  },
  xai: {
    text: [
      'grok-4.3',
      'grok-4.20-0309-reasoning',
      'grok-4.20-non-reasoning',
      'grok-2-latest',
      'grok-2-1212',
      'grok-beta',
      'grok-2-vision-1212',
    ],
    image: [
      'grok-imagine-image',
      'grok-imagine-image-quality',
    ],
  },
  gemini: {
    text: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
    ],
    image: [
      'gemini-2.0-flash-exp',
      'imagen-3.0-generate-002',
    ],
  },
  comfyui: {
    text: [
      'comfyui-default',
    ],
    image: [
      'sd_xl_base_1.0.safetensors',
      'flux1-dev-fp8.safetensors',
      'sdxl_lightning_4step.safetensors',
      'realvisxl_v4.0.safetensors',
    ],
  },
  mock: {
    text:  ['mock'],
    image: ['mock'],
  },
};

function ModelPicker({
  kind,
  providerName,
  providers,
  value,
  defaultModel,
  disabled,
  onChange,
}) {
  const isRealProvider = providerName !== 'mock' && providerName !== '';
  const isConfigured = providers.find((p) => p.name === providerName)?.available;
  const builtIn = MODEL_SUGGESTIONS[providerName]?.[kind] || [];
  const datalistId = `model-suggestions-${kind}-${providerName}`;

  // The currently-displayed value: explicit user override > default model.
  const current = value || defaultModel || '';

  return html`
    <div class="field model-picker">
      <label for=${`model-${kind}`}>
        ${kind === 'text' ? 'Text' : 'Image'} model
        <span class="muted small">
          ${defaultModel
            ? html`— default: <code>${defaultModel}</code> (leave blank to use)`
            : isRealProvider
              ? html`— type a model id (provider default if blank)`
              : null}
        </span>
      </label>
      <div class="input-with-action">
        <input
          id=${`model-${kind}`}
          type="text"
          list=${datalistId}
          value=${current}
          disabled=${disabled || !isRealProvider}
          placeholder=${defaultModel || 'model id (e.g. dall-e-3, qwen3.6-35b)'}
          spellcheck="false"
          autocomplete="off"
          onInput=${(e) => onChange(e.target.value.trim() || undefined)}
        />
        ${value
          ? html`<button
              type="button"
              class="ghost"
              title="Clear model override (use provider default)"
              onClick=${() => onChange(undefined)}
            >×</button>`
          : null}
      </div>
      ${isRealProvider && builtIn.length > 0
        ? html`
          <datalist id=${datalistId}>
            ${builtIn.map((m) => html`<option key=${m} value=${m}></option>`)}
          </datalist>
          <div class="presets small">
            ${builtIn.map((m) => html`
              <button
                key=${m}
                type="button"
                class=${'preset-chip' + (current === m ? ' active' : '')}
                disabled=${disabled}
                title=${m}
                onClick=${() => onChange(m)}
              >${m}</button>
            `)}
          </div>
        `
        : null}
      ${!isConfigured
        ? html`<p class="note small">Provider "${providerName}" isn't configured. Set its credentials in the Settings page before running.</p>`
        : null}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// ImageAspectPicker — aspect-ratio chips for image generation, with a
// checkbox row for the MiniMax-specific prompt_optimizer and aigc_watermark
// flags. Equivalent to the MiniMax CLI's --aspect-ratio / --prompt-optimizer
// / --aigc-watermark flags.
// ---------------------------------------------------------------------------

const ASPECT_CHIPS = [
  { value: '1:1',  label: '1:1',  hint: '1024×1024' },
  { value: '4:3',  label: '4:3',  hint: '1024×768' },
  { value: '3:4',  label: '3:4',  hint: '768×1024' },
  { value: '16:9', label: '16:9', hint: '1280×720' },
  { value: '9:16', label: '9:16', hint: '720×1280' },
  { value: '21:9', label: '21:9', hint: '1680×720' },
  { value: '2:3',  label: '2:3',  hint: '720×1080' },
  { value: '3:2',  label: '3:2',  hint: '1080×720' },
  { value: '5:4',  label: '5:4',  hint: '1024×819' },
  { value: '4:5',  label: '4:5',  hint: '819×1024' },
];

function ImageAspectPicker({
  aspectRatio, promptOptimizer, aigcWatermark, disabled,
  onAspectChange, onPromptOptimizerChange, onAigcWatermarkChange,
}) {
  return html`
    <div class="field model-picker image-aspect-picker">
      <label>
        Image aspect ratio
        <span class="muted small">
          ${aspectRatio
            ? html`— <code>${aspectRatio}</code> (override per call)`
            : html`— default: <code>1:1</code> (1024×1024)`}
        </span>
      </label>
      <div class="presets small">
        <button
          type="button"
          class=${'preset-chip' + (!aspectRatio ? ' active' : '')}
          disabled=${disabled}
          onClick=${() => onAspectChange(undefined)}
          title="Use the provider's default (1:1 for MiniMax)"
        >default</button>
        ${ASPECT_CHIPS.map((c) => html`
          <button
            key=${c.value}
            type="button"
            class=${'preset-chip' + (aspectRatio === c.value ? ' active' : '')}
            disabled=${disabled}
            title=${c.hint}
            onClick=${() => onAspectChange(c.value)}
          >${c.label}</button>
        `)}
      </div>
      <div class="checkbox-row" style="margin-top: 0.4rem; display: flex; gap: 1.2rem; flex-wrap: wrap;">
        <label class="checkbox">
          <input
            type="checkbox"
            disabled=${disabled}
            checked=${!!promptOptimizer}
            onChange=${(e) => onPromptOptimizerChange(e.target.checked)}
          />
          <span>Optimize prompt</span>
          <span class="muted small">(let MiniMax rewrite it for better results)</span>
        </label>
        <label class="checkbox">
          <input
            type="checkbox"
            disabled=${disabled}
            checked=${!!aigcWatermark}
            onChange=${(e) => onAigcWatermarkChange(e.target.checked)}
          />
          <span>AIGC watermark</span>
          <span class="muted small">(embed AI-generated marker)</span>
        </label>
      </div>
    </div>
  `;
}
