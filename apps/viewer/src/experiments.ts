import { MAX_ACTIONS, MAX_REPLAY_BYTES, parseReplay } from './timeline.js';
import type { Timeline } from './timeline.js';

export interface ExperimentEntry {
  readonly id: string;
  readonly objective: string;
  readonly steps: number;
  readonly seed?: number;
  readonly createdAt: string;
  readonly schedule?:
    'simultaneous-v1' | 'survival-v1' | 'learning-v1' | 'evolution-v1';
  readonly totalActions?: number;
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid experiment catalogue.');
  return value as Record<string, unknown>;
}

export function parseCatalogue(source: string): ExperimentEntry[] {
  if (new TextEncoder().encode(source).length > MAX_REPLAY_BYTES)
    throw new Error('Experiment catalogue is too large.');
  const value = object(JSON.parse(source) as unknown);
  if (value.version !== 1 || !Array.isArray(value.experiments))
    throw new Error('Unsupported experiment catalogue.');
  const ids = new Set<string>();
  return value.experiments.map((item: unknown) => {
    const { id, objective, steps, seed, createdAt, schedule, totalActions } =
      object(item);
    if (
      (schedule !== undefined &&
        schedule !== 'simultaneous-v1' &&
        schedule !== 'survival-v1' &&
        schedule !== 'learning-v1' &&
        schedule !== 'evolution-v1') ||
      (schedule !== undefined &&
        (typeof totalActions !== 'number' ||
          !Number.isInteger(totalActions) ||
          typeof steps !== 'number' ||
          totalActions < steps ||
          totalActions > steps * 32)) ||
      typeof id !== 'string' ||
      !/^ex[1-9]\d*$/.test(id) ||
      !Number.isSafeInteger(Number(id.slice(2))) ||
      ids.has(id) ||
      typeof objective !== 'string' ||
      objective.trim().length < 20 ||
      objective.length > 1000 ||
      typeof steps !== 'number' ||
      !Number.isInteger(steps) ||
      steps < 3 ||
      steps > MAX_ACTIONS ||
      (schedule === 'survival-v1' ||
      schedule === 'learning-v1' ||
      schedule === 'evolution-v1'
        ? seed !== undefined
        : typeof seed !== 'number' ||
          !Number.isInteger(seed) ||
          seed < 1 ||
          seed > 0xffffffff) ||
      typeof createdAt !== 'string' ||
      !Number.isFinite(Date.parse(createdAt))
    )
      throw new Error('Invalid or duplicate experiment entry.');
    ids.add(id);
    return {
      id,
      objective,
      steps,
      ...(typeof seed === 'number' ? { seed } : {}),
      createdAt,
      ...((schedule === 'simultaneous-v1' ||
        schedule === 'survival-v1' ||
        schedule === 'learning-v1' ||
        schedule === 'evolution-v1') &&
      typeof totalActions === 'number'
        ? { schedule, totalActions }
        : {}),
    };
  });
}

async function readAsset(path: string): Promise<string> {
  const response = await fetch(`./experiments/${path}`, { cache: 'no-store' });
  if (!response.ok)
    throw new Error(`Archive request failed (${String(response.status)}).`);
  return response.text();
}

function find<K extends keyof HTMLElementTagNameMap>(
  id: string,
  tag: K,
): HTMLElementTagNameMap[K] {
  const element = document.querySelector(`${tag}#${id}`);
  if (element === null) throw new Error(`Missing experiment control: ${id}`);
  return element as HTMLElementTagNameMap[K];
}

/** Selection commits only after validation. Sequence tokens discard obsolete requests. */
export class ExperimentBrowser {
  private readonly select = find('experiment-select', 'select');
  private readonly details = find('experiment-details', 'p');
  private readonly feedback = find('experiment-feedback', 'p');
  private readonly chart = find('experiment-chart', 'a');
  private entries: ExperimentEntry[] = [];
  private active: ExperimentEntry | undefined;
  private sequence = 0;

  constructor(
    private readonly load: (
      timeline: Timeline | undefined,
      id: string | undefined,
    ) => void,
    private readonly loading: (pending: boolean) => void,
  ) {
    this.select.addEventListener('change', () => {
      void this.open(this.select.value, true);
    });
    window.addEventListener('popstate', () => {
      void this.open(this.requestedId(), false);
    });
  }

  private requestedId(): string {
    return new URL(window.location.href).searchParams.get('experiment') ?? '';
  }

  private updateUrl(id: string, push: boolean): void {
    const url = new URL(window.location.href);
    if (id === '') url.searchParams.delete('experiment');
    else url.searchParams.set('experiment', id);
    if (url.href !== window.location.href) {
      if (push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
    }
  }

  private showActive(): void {
    this.select.value = this.active?.id ?? '';
    this.details.textContent =
      this.active?.objective ??
      'Choose a saved experiment to explore its full history.';
    this.chart.hidden = this.active === undefined;
    if (this.active !== undefined) {
      this.chart.href = `./experiments/${this.active.id}/overview.svg`;
      this.feedback.textContent = `${this.active.id} · ${String(this.active.steps + 1)} frames${this.active.schedule ? ` · ${String(this.active.totalActions)} actions` : ''} · ${this.active.schedule === 'evolution-v1' ? 'World evolution · 60 calls per actor maximum' : this.active.schedule === 'learning-v1' ? 'Survival-driven skills · 12 calls per actor maximum' : this.active.schedule === 'survival-v1' ? 'ChatGPT programs · 5 calls per actor maximum' : `Seed ${String(this.active.seed)}`} · Read-only archive`;
    } else {
      this.chart.removeAttribute('href');
      this.feedback.textContent =
        this.entries.length === 0
          ? 'No completed experiments available. The demo is ready to explore.'
          : `${String(this.entries.length)} saved experiment${this.entries.length === 1 ? '' : 's'} · Local session`;
    }
  }

  /** Called before replacing the world with a local demo, new world or valid import. */
  public localSession(): void {
    this.sequence += 1;
    this.active = undefined;
    this.loading(false);
    this.updateUrl('', true);
    this.showActive();
  }

  public async start(): Promise<void> {
    const sequence = this.sequence;
    if (this.requestedId() !== '') this.loading(true);
    try {
      this.entries = parseCatalogue(await readAsset('index.json'));
      for (const entry of this.entries) {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = `${entry.id} · ${String(entry.steps)} ${entry.schedule ? 'rounds' : 'steps'}`;
        this.select.append(option);
      }
      this.select.disabled = false;
      this.showActive();
      if (sequence === this.sequence && this.requestedId() !== '')
        await this.open(this.requestedId(), false);
    } catch {
      if (sequence === this.sequence) this.loading(false);
      this.feedback.textContent =
        'Experiment catalogue could not be loaded. Refresh to retry; your current history is unchanged.';
    }
  }

  private async open(id: string, push: boolean): Promise<void> {
    const sequence = ++this.sequence;
    if (id === '') {
      this.active = undefined;
      this.loading(false);
      this.load(undefined, undefined);
      this.updateUrl('', push);
      this.showActive();
      return;
    }
    this.loading(true);
    this.feedback.textContent = `Loading ${id}…`;
    try {
      const entry = this.entries.find((candidate) => candidate.id === id);
      if (entry === undefined)
        throw new Error('This experiment is not in the completed archive.');
      const timeline = parseReplay(await readAsset(`${entry.id}/replay.json`));
      if (
        timeline.frames.length !== entry.steps + 1 ||
        timeline.schedule !== entry.schedule ||
        (entry.schedule &&
          timeline.frames
            .slice(1)
            .reduce(
              (count, frame) =>
                count +
                (frame.evolution?.events.length ??
                  frame.learning?.events.length ??
                  frame.survival?.events.length ??
                  frame.events?.length ??
                  0),
              0,
            ) !== entry.totalActions)
      )
        throw new Error(
          'Replay length disagrees with the experiment catalogue.',
        );
      if (sequence !== this.sequence) return;
      this.active = entry;
      this.loading(false);
      this.load(timeline, id);
      this.updateUrl(id, push);
      this.showActive();
    } catch (error) {
      if (sequence !== this.sequence) return;
      this.loading(false);
      this.updateUrl(this.active?.id ?? '', false);
      this.showActive();
      this.feedback.textContent = `Could not load ${id}. Current history is unchanged. ${error instanceof Error ? error.message : 'Select the experiment to retry.'}`;
    }
  }
}
