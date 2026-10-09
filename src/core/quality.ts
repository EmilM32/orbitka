// Quality levels (ADR-010 point 9, EMI-223). Pure logic: no three, no DOM.
// main.ts reads matchMedia, location.search and localStorage and passes them
// in; render and ui react to the level through `subscribe`.

export type QualityLevel = 'high' | 'medium' | 'low';

export const QUALITY_CONFIG = {
  warmupSeconds: 2,
  maxWarmupSeconds: 5,
  windowSeconds: 5,
  downMedianFps: 50,
  downP90FrameMs: 25,
  dropToLowMedianFps: 30,
  upMedianFps: 58,
  upP90FrameMs: 20,
  maxDowngradesPerSession: 2,
  storageKeyAuto: 'orbitka.quality.auto',
  storageKeyOverride: 'orbitka.quality.override',
} as const;

export type FrameSummary = {
  medianFps: number;
  p90FrameMs: number;
  frames: number;
};

const MAX_DT_SECONDS = 0.1;
const MS_PER_SECOND = 1000;
// Frame times of one window: 5 s at 400 FPS fits with room to spare.
const WINDOW_CAPACITY = 4096;
const LEVELS: readonly QualityLevel[] = ['high', 'medium', 'low'];

export function parseQualityLevel(value: string | null): QualityLevel | null {
  return value === 'high' || value === 'medium' || value === 'low'
    ? value
    : null;
}

function levelIndex(level: QualityLevel): number {
  return LEVELS.indexOf(level);
}

function oneLevelDown(level: QualityLevel): QualityLevel {
  return LEVELS[Math.min(LEVELS.length - 1, levelIndex(level) + 1)] ?? level;
}

function oneLevelUp(level: QualityLevel): QualityLevel {
  return LEVELS[Math.max(0, levelIndex(level) - 1)] ?? level;
}

/**
 * Median FPS and the 90th percentile of the frame time. The percentile is the
 * sample at index floor(0.9 · n) of the sorted times, so a tenth of slow
 * frames is enough to show up in it.
 */
export function summarizeFrameTimes(frameMs: readonly number[]): FrameSummary {
  if (frameMs.length === 0) {
    throw new RangeError(
      'summarizeFrameTimes: parameter "frameMs" must not be empty, got 0',
    );
  }

  for (let index = 0; index < frameMs.length; index += 1) {
    const value = frameMs[index];
    if (value === undefined || !Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `summarizeFrameTimes: parameter "frameMs" must hold finite values > 0, got ${value} at index ${index}`,
      );
    }
  }

  const sorted = Float64Array.from(frameMs).sort();
  const count = sorted.length;
  const middle = Math.floor(count / 2);
  const medianMs =
    count % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  const p90Index = Math.min(count - 1, Math.floor(0.9 * count));

  return {
    medianFps: MS_PER_SECOND / medianMs,
    p90FrameMs: sorted[p90Index] ?? medianMs,
    frames: count,
  };
}

/**
 * The level for the rest of the session. Never goes up: a median under 30 FPS
 * drops straight to `low`, a median under 50 FPS or a p90 over 25 ms drops one
 * level, and two drops end the changes.
 */
export function decideQualityLevel(
  current: QualityLevel,
  summary: FrameSummary,
  downgradesSoFar: number,
): QualityLevel {
  if (!Number.isInteger(downgradesSoFar) || downgradesSoFar < 0) {
    throw new RangeError(
      `decideQualityLevel: parameter "downgradesSoFar" must be an integer >= 0, got ${downgradesSoFar}`,
    );
  }

  if (downgradesSoFar >= QUALITY_CONFIG.maxDowngradesPerSession) {
    return current;
  }

  if (summary.medianFps < QUALITY_CONFIG.dropToLowMedianFps) {
    return 'low';
  }

  if (
    summary.medianFps < QUALITY_CONFIG.downMedianFps ||
    summary.p90FrameMs > QUALITY_CONFIG.downP90FrameMs
  ) {
    return oneLevelDown(current);
  }

  return current;
}

/** The level the next session starts on: one up after a clearly smooth run. */
export function nextSessionLevel(
  current: QualityLevel,
  summary: FrameSummary | null,
): QualityLevel {
  if (
    summary !== null &&
    summary.medianFps >= QUALITY_CONFIG.upMedianFps &&
    summary.p90FrameMs <= QUALITY_CONFIG.upP90FrameMs
  ) {
    return oneLevelUp(current);
  }

  return current;
}

export type QualitySource = 'param' | 'override' | 'auto' | 'default';

export type InitialQuality = {
  level: QualityLevel;
  source: QualitySource;
  locked: boolean;
};

/** `?quality=` (locked) > override (locked) > stored automatic > default. */
export function resolveInitialQuality(input: {
  search: string;
  override: string | null;
  storedAuto: string | null;
  pointerCoarse: boolean;
}): InitialQuality {
  const raw = input.search.startsWith('?')
    ? input.search.slice(1)
    : input.search;
  const fromParam = parseQualityLevel(new URLSearchParams(raw).get('quality'));
  if (fromParam !== null) {
    return { level: fromParam, source: 'param', locked: true };
  }

  const fromOverride = parseQualityLevel(input.override);
  if (fromOverride !== null) {
    return { level: fromOverride, source: 'override', locked: true };
  }

  const fromAuto = parseQualityLevel(input.storedAuto);
  if (fromAuto !== null) {
    return { level: fromAuto, source: 'auto', locked: false };
  }

  return {
    level: input.pointerCoarse ? 'medium' : 'high',
    source: 'default',
    locked: false,
  };
}

export type QualityStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;

export type StoredQuality = {
  override: string | null;
  storedAuto: string | null;
};

function readKey(storage: QualityStorage, key: string): string | null {
  try {
    const value = storage.getItem(key);
    if (value === null) {
      return null;
    }
    if (parseQualityLevel(value) !== null) {
      return value;
    }
    // A broken value counts as none and is cleaned up.
    storage.removeItem(key);
    return null;
  } catch {
    return null;
  }
}

/** Reads both saved levels. Storage that throws (private mode) reads as none. */
export function loadStoredQuality(
  storage: QualityStorage | null,
): StoredQuality {
  if (storage === null) {
    return { override: null, storedAuto: null };
  }

  return {
    override: readKey(storage, QUALITY_CONFIG.storageKeyOverride),
    storedAuto: readKey(storage, QUALITY_CONFIG.storageKeyAuto),
  };
}

export type QualityStore = {
  get(): QualityLevel;
  getSource(): QualitySource;
  isLocked(): boolean;
  getLastSummary(): FrameSummary | null;
  sampleFrame(dtSeconds: number, visible: boolean): void;
  setOverride(level: QualityLevel | null): void;
  subscribe(listener: (level: QualityLevel) => void): () => void;
  /** Saves the level for the next session. Call on `pagehide`. */
  flush(): void;
};

export type QualityStoreOptions = {
  /** Wall clock in ms, for the warmup limit. */
  now?: () => number;
  /** The automatic level when no stored one exists: the pointer default. */
  fallbackLevel?: QualityLevel;
};

function safely(action: () => void): void {
  try {
    action();
  } catch {
    // Storage can throw (private mode, quota). The level then lives in memory.
  }
}

export function createQualityStore(
  initial: InitialQuality,
  storage: QualityStorage | null,
  options: QualityStoreOptions = {},
): QualityStore {
  const now = options.now ?? (() => performance.now());
  const listeners = new Set<(level: QualityLevel) => void>();
  const frames = new Float64Array(WINDOW_CAPACITY);
  const windowMs = QUALITY_CONFIG.windowSeconds * MS_PER_SECOND;
  const warmupMs = QUALITY_CONFIG.warmupSeconds * MS_PER_SECOND;
  const maxWarmupMs = QUALITY_CONFIG.maxWarmupSeconds * MS_PER_SECOND;

  let level = initial.level;
  let source = initial.source;
  let locked = initial.locked;
  // The level the automatic mode is on while an override is in force.
  let autoLevel: QualityLevel =
    initial.source === 'auto' || initial.source === 'default'
      ? initial.level
      : (parseQualityLevel(loadStoredQuality(storage).storedAuto) ??
        options.fallbackLevel ??
        'high');
  let downgrades = 0;
  let lastSummary: FrameSummary | null = null;
  let autoChanged = false;
  let warmupStartMs: number | null = null;
  let warmupElapsedMs = 0;
  let frameCount = 0;
  let windowElapsedMs = 0;

  function resetMeasurement(): void {
    warmupStartMs = null;
    warmupElapsedMs = 0;
    frameCount = 0;
    windowElapsedMs = 0;
  }

  function notify(): void {
    for (const listener of [...listeners]) {
      listener(level);
    }
  }

  function saveAuto(): void {
    if (storage === null || (lastSummary === null && !autoChanged)) {
      return;
    }
    const next = nextSessionLevel(autoLevel, lastSummary);
    safely(() => {
      storage.setItem(QUALITY_CONFIG.storageKeyAuto, next);
    });
  }

  function decide(): void {
    const summary = summarizeFrameTimes(
      Array.from(frames.subarray(0, frameCount)),
    );
    lastSummary = summary;
    frameCount = 0;
    windowElapsedMs = 0;
    if (locked) {
      return;
    }

    const next = decideQualityLevel(level, summary, downgrades);
    if (next === level) {
      return;
    }

    downgrades += 1;
    level = next;
    autoLevel = next;
    autoChanged = true;
    saveAuto();
    notify();
  }

  return {
    get: () => level,
    getSource: () => source,
    isLocked: () => locked,
    getLastSummary: () => lastSummary,
    sampleFrame(dtSeconds, visible) {
      if (!visible) {
        resetMeasurement();
        return;
      }

      if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
        throw new RangeError(
          `sampleFrame: parameter "dtSeconds" must be finite and > 0, got ${dtSeconds}`,
        );
      }

      const frameMs = Math.min(dtSeconds, MAX_DT_SECONDS) * MS_PER_SECOND;
      if (warmupElapsedMs < warmupMs) {
        const wallMs = now();
        warmupStartMs ??= wallMs;
        warmupElapsedMs += frameMs;
        if (wallMs - warmupStartMs >= maxWarmupMs) {
          warmupElapsedMs = warmupMs;
        }
        return;
      }

      frames[frameCount] = frameMs;
      frameCount += 1;
      windowElapsedMs += frameMs;
      if (windowElapsedMs >= windowMs || frameCount >= WINDOW_CAPACITY) {
        decide();
      }
    },
    setOverride(next) {
      if (initial.source === 'param') {
        return;
      }

      const previous = level;
      if (next === null) {
        safely(() => {
          storage?.removeItem(QUALITY_CONFIG.storageKeyOverride);
        });
        level = autoLevel;
        source = lastSummary === null && !autoChanged ? 'default' : 'auto';
        locked = false;
      } else {
        safely(() => {
          storage?.setItem(QUALITY_CONFIG.storageKeyOverride, next);
        });
        level = next;
        source = 'override';
        locked = true;
      }

      resetMeasurement();
      if (level !== previous) {
        notify();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    flush() {
      if (!locked) {
        saveAuto();
      }
    },
  };
}
