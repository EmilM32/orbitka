import { describe, expect, it, test, vi } from 'vitest';

import {
  QUALITY_CONFIG,
  createQualityStore,
  decideQualityLevel,
  loadStoredQuality,
  nextSessionLevel,
  parseQualityLevel,
  resolveInitialQuality,
  summarizeFrameTimes,
  type FrameSummary,
  type InitialQuality,
  type QualityLevel,
  type QualityStorage,
} from '@core/quality.ts';

const ORDER: readonly QualityLevel[] = ['high', 'medium', 'low'];

function summary(medianFps: number, p90FrameMs: number): FrameSummary {
  return { medianFps, p90FrameMs, frames: 300 };
}

describe('QUALITY_CONFIG', () => {
  test('golden values', () => {
    expect(QUALITY_CONFIG.warmupSeconds).toBe(2);
    expect(QUALITY_CONFIG.maxWarmupSeconds).toBe(5);
    expect(QUALITY_CONFIG.windowSeconds).toBe(5);
    expect(QUALITY_CONFIG.downMedianFps).toBe(50);
    expect(QUALITY_CONFIG.downP90FrameMs).toBe(25);
    expect(QUALITY_CONFIG.dropToLowMedianFps).toBe(30);
    expect(QUALITY_CONFIG.upMedianFps).toBe(58);
    expect(QUALITY_CONFIG.upP90FrameMs).toBe(20);
    expect(QUALITY_CONFIG.maxDowngradesPerSession).toBe(2);
    expect(QUALITY_CONFIG.storageKeyAuto).toBe('orbitka.quality.auto');
    expect(QUALITY_CONFIG.storageKeyOverride).toBe('orbitka.quality.override');
  });
});

describe('parseQualityLevel', () => {
  it.each([
    ['high', 'high'],
    ['medium', 'medium'],
    ['low', 'low'],
    ['med', null],
    ['', null],
    [null, null],
    ['HIGH', null],
  ])('parses %j as %j', (value, expected) => {
    expect(parseQualityLevel(value)).toBe(expected);
  });
});

describe('summarizeFrameTimes', () => {
  it('summarizes a steady 60 FPS run', () => {
    const result = summarizeFrameTimes(Array<number>(300).fill(16.67));

    expect(result.medianFps).toBeCloseTo(60, 1);
    expect(result.p90FrameMs).toBeCloseTo(16.67, 5);
    expect(result.frames).toBe(300);
  });

  it('shows a tenth of slow frames in the p90', () => {
    const times = [...Array<number>(270).fill(16.67), ...Array(30).fill(40)];

    const result = summarizeFrameTimes(times);

    expect(result.p90FrameMs).toBe(40);
    expect(result.medianFps).toBeCloseTo(60, 1);
  });

  it('averages the two middle frames of an even count', () => {
    expect(summarizeFrameTimes([10, 30]).medianFps).toBeCloseTo(50, 5);
  });

  it('does not reorder its input', () => {
    const times = [30, 10, 20];
    summarizeFrameTimes(times);

    expect(times).toEqual([30, 10, 20]);
  });

  it('rejects an empty list', () => {
    expect(() => summarizeFrameTimes([])).toThrow(
      new RangeError(
        'summarizeFrameTimes: parameter "frameMs" must not be empty, got 0',
      ),
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects %s with its index',
    (bad) => {
      expect(() => summarizeFrameTimes([16, bad])).toThrow(
        /"frameMs".* at index 1/,
      );
    },
  );
});

describe('decideQualityLevel', () => {
  it('drops one level at 40 FPS with a 30 ms p90', () => {
    expect(decideQualityLevel('high', summary(40, 30), 0)).toBe('medium');
    expect(decideQualityLevel('medium', summary(40, 30), 0)).toBe('low');
  });

  it('drops straight to low under 30 FPS', () => {
    expect(decideQualityLevel('high', summary(25, 40), 0)).toBe('low');
  });

  it('drops one level on a p90 over 25 ms alone', () => {
    expect(decideQualityLevel('high', summary(55, 26), 0)).toBe('medium');
  });

  it('keeps the level at 55 FPS and 22 ms', () => {
    expect(decideQualityLevel('high', summary(55, 22), 0)).toBe('high');
  });

  it('keeps the thresholds themselves', () => {
    expect(decideQualityLevel('high', summary(50, 25), 0)).toBe('high');
    expect(decideQualityLevel('high', summary(30, 20), 0)).toBe('medium');
  });

  it('stays on low after a bad run', () => {
    expect(decideQualityLevel('low', summary(10, 100), 0)).toBe('low');
  });

  it('makes no change after two drops', () => {
    expect(decideQualityLevel('high', summary(10, 100), 2)).toBe('high');
  });

  it.each([-1, 1.5, Number.NaN])('rejects downgradesSoFar %s', (bad) => {
    expect(() => decideQualityLevel('high', summary(60, 16), bad)).toThrow(
      /"downgradesSoFar"/,
    );
  });

  it('never upgrades within a session', () => {
    // mulberry32 with a fixed seed: the same 500 summaries on every run.
    let state = 20261009;
    const random = (): number => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
    };

    for (let index = 0; index < 500; index += 1) {
      const current = ORDER[Math.floor(random() * 3)] ?? 'high';
      const result = decideQualityLevel(
        current,
        summary(random() * 144, 1 + random() * 80),
        Math.floor(random() * 4),
      );

      expect(ORDER.indexOf(result)).toBeGreaterThanOrEqual(
        ORDER.indexOf(current),
      );
    }
  });
});

describe('nextSessionLevel', () => {
  it('goes one level up after 59 FPS and 18 ms', () => {
    expect(nextSessionLevel('medium', summary(59, 18))).toBe('high');
    expect(nextSessionLevel('low', summary(59, 18))).toBe('medium');
  });

  it('keeps high at high', () => {
    expect(nextSessionLevel('high', summary(60, 16))).toBe('high');
  });

  it('keeps the level below the thresholds', () => {
    expect(nextSessionLevel('medium', summary(57, 18))).toBe('medium');
    expect(nextSessionLevel('medium', summary(60, 21))).toBe('medium');
  });

  it('goes up at exactly 58 FPS and 20 ms', () => {
    expect(nextSessionLevel('medium', summary(58, 20))).toBe('high');
  });

  it('keeps the level without a measurement', () => {
    expect(nextSessionLevel('medium', null)).toBe('medium');
  });
});

describe('resolveInitialQuality', () => {
  const base = {
    search: '',
    override: null,
    storedAuto: null,
    pointerCoarse: false,
  };

  it.each([
    [
      'param wins over everything',
      {
        ...base,
        search: '?quality=low',
        override: 'high',
        storedAuto: 'medium',
      },
      { level: 'low', source: 'param', locked: true },
    ],
    [
      'override wins over the stored level',
      { ...base, override: 'medium', storedAuto: 'low' },
      { level: 'medium', source: 'override', locked: true },
    ],
    [
      'stored automatic level',
      { ...base, storedAuto: 'low', pointerCoarse: true },
      { level: 'low', source: 'auto', locked: false },
    ],
    [
      'default for a mouse',
      base,
      { level: 'high', source: 'default', locked: false },
    ],
    [
      'default for touch',
      { ...base, pointerCoarse: true },
      { level: 'medium', source: 'default', locked: false },
    ],
    [
      'a wrong param and wrong stored values are ignored',
      { ...base, search: '?quality=ultra', override: 'x', storedAuto: 'HIGH' },
      { level: 'high', source: 'default', locked: false },
    ],
  ])('%s', (_name, input, expected) => {
    expect(resolveInitialQuality(input)).toEqual(expected);
  });

  it('reads the param without a leading question mark', () => {
    expect(
      resolveInitialQuality({ ...base, search: 'quality=medium' }).level,
    ).toBe('medium');
  });
});

describe('loadStoredQuality', () => {
  function memory(initial: Record<string, string> = {}): QualityStorage & {
    data: Map<string, string>;
  } {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
  }

  it('reads valid values', () => {
    const storage = memory({
      'orbitka.quality.auto': 'low',
      'orbitka.quality.override': 'high',
    });

    expect(loadStoredQuality(storage)).toEqual({
      override: 'high',
      storedAuto: 'low',
    });
  });

  it('removes invalid values', () => {
    const storage = memory({
      'orbitka.quality.auto': 'ultra',
      'orbitka.quality.override': '',
    });

    expect(loadStoredQuality(storage)).toEqual({
      override: null,
      storedAuto: null,
    });
    expect(storage.data.size).toBe(0);
  });

  it('reads nothing without storage or when it throws', () => {
    const throwing: QualityStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {},
      removeItem: () => {},
    };

    expect(loadStoredQuality(null)).toEqual({
      override: null,
      storedAuto: null,
    });
    expect(loadStoredQuality(throwing)).toEqual({
      override: null,
      storedAuto: null,
    });
  });
});

describe('createQualityStore', () => {
  const FRAME_S = 0.02;

  function setup(
    initial: InitialQuality = {
      level: 'high',
      source: 'default',
      locked: false,
    },
    storage: QualityStorage | null = null,
  ) {
    let wallMs = 0;
    const store = createQualityStore(initial, storage, {
      now: () => wallMs,
      fallbackLevel: 'high',
    });
    const levels: QualityLevel[] = [];
    store.subscribe((level) => {
      levels.push(level);
    });
    // Frames of `dt` seconds for `seconds` of play time, wall clock in step.
    const run = (seconds: number, dt = FRAME_S, visible = true): void => {
      const frames = Math.round(seconds / dt);
      for (let index = 0; index < frames; index += 1) {
        wallMs += dt * 1000;
        store.sampleFrame(dt, visible);
      }
    };
    return { store, levels, run, advanceWall: (ms: number) => (wallMs += ms) };
  }

  function recordingStorage() {
    const data = new Map<string, string>();
    const storage: QualityStorage = {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
    return { data, storage };
  }

  test('warmup, window, hidden tab, locked, storage failure', () => {
    // No decision before the warmup and a full window: 2 s + 5 s.
    const slow = setup();
    slow.run(2);
    slow.run(4.9);
    expect(slow.store.get()).toBe('high');
    expect(slow.store.getLastSummary()).toBeNull();
    slow.run(0.2);
    expect(slow.store.getLastSummary()?.medianFps).toBeCloseTo(50, 0);

    // A hidden tab resets the warmup and the window.
    const hidden = setup();
    hidden.run(2);
    hidden.run(4);
    hidden.store.sampleFrame(0, false);
    hidden.run(2);
    hidden.run(4.9);
    expect(hidden.store.getLastSummary()).toBeNull();
    hidden.run(0.2);
    expect(hidden.store.getLastSummary()).not.toBeNull();

    // Locked: measures, never changes the level.
    const locked = setup({ level: 'high', source: 'param', locked: true });
    locked.run(2);
    locked.run(5.1, 0.1);
    expect(locked.store.get()).toBe('high');
    expect(locked.levels).toEqual([]);
    expect(locked.store.getLastSummary()?.medianFps).toBeCloseTo(10, 5);

    // A storage that throws never interrupts the store.
    const throwing: QualityStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const broken = setup(undefined, throwing);
    broken.run(2);
    expect(() => {
      broken.run(5.1, 0.1);
      broken.store.setOverride('low');
      broken.store.setOverride(null);
      broken.store.flush();
    }).not.toThrow();
  });

  it('drops one level at 40 FPS with a slow tail', () => {
    const { store, levels, run } = setup();
    run(2, 0.025);
    run(5.1, 0.025);

    expect(store.get()).toBe('medium');
    expect(levels).toEqual(['medium']);
  });

  it('drops straight to low at 25 FPS', () => {
    const { store, run } = setup();
    run(2, 0.04);
    run(5.1, 0.04);

    expect(store.get()).toBe('low');
  });

  it('keeps the level when frames are smooth', () => {
    const { store, run } = setup();
    run(2, 0.01667);
    run(10.1, 0.01667);

    expect(store.get()).toBe('high');
  });

  it('allows two drops per session and never goes up', () => {
    const { store, levels, run } = setup();
    run(2, 0.025);
    run(5.1, 0.025);
    run(5.1, 0.025);
    run(5.1, 0.025);
    expect(levels).toEqual(['medium', 'low']);

    run(15, 0.008);
    expect(store.get()).toBe('low');

    const capped = setup({ level: 'high', source: 'default', locked: false });
    capped.run(2, 0.025);
    capped.run(5.1, 0.025);
    capped.run(5.1, 0.025);
    // Two drops used up: a third bad window changes nothing.
    capped.run(5.1, 0.025);
    expect(capped.store.get()).toBe('low');
    expect(capped.levels).toHaveLength(2);
  });

  it('ends the warmup after 5 s of wall time', () => {
    const { store, run, advanceWall } = setup();
    // Slow frames clamp to 0.1 s but the wall clock runs 0.4 s per frame.
    store.sampleFrame(0.1, true);
    advanceWall(5000);
    store.sampleFrame(0.1, true);
    expect(store.getLastSummary()).toBeNull();
    run(5.2, 0.1);

    expect(store.getLastSummary()).not.toBeNull();
  });

  it('clamps dt over 0.1 s like the loop and rejects bad dt', () => {
    const { store } = setup();

    expect(() => {
      store.sampleFrame(5, true);
    }).not.toThrow();
    for (const bad of [0, -0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => {
        store.sampleFrame(bad, true);
      }).toThrow(/"dtSeconds"/);
    }
  });

  it('saves the next session level on pagehide', () => {
    const { data, storage } = recordingStorage();
    const { store, run } = setup(
      { level: 'medium', source: 'auto', locked: false },
      storage,
    );
    run(2, 0.01667);
    run(5.1, 0.01667);
    store.flush();

    expect(data.get('orbitka.quality.auto')).toBe('high');
  });

  it('keeps the level after a middling run', () => {
    const { data, storage } = recordingStorage();
    const { store, run } = setup(
      { level: 'medium', source: 'auto', locked: false },
      storage,
    );
    run(2, 0.0175);
    run(5.1, 0.0175);
    store.flush();

    expect(data.get('orbitka.quality.auto')).toBe('medium');
  });

  it('writes nothing before any measurement', () => {
    const { data, storage } = recordingStorage();
    const { store, run } = setup(undefined, storage);
    run(1);
    store.flush();

    expect(data.size).toBe(0);
  });

  it('saves the lower level right after an automatic drop', () => {
    const { data, storage } = recordingStorage();
    const { run } = setup(undefined, storage);
    run(2, 0.025);
    run(5.1, 0.025);

    expect(data.get('orbitka.quality.auto')).toBe('medium');
  });

  it('does not save an automatic level while locked', () => {
    const { data, storage } = recordingStorage();
    const { store, run } = setup(
      { level: 'low', source: 'param', locked: true },
      storage,
    );
    run(2, 0.01667);
    run(5.1, 0.01667);
    store.flush();

    expect(data.size).toBe(0);
  });

  it('setOverride saves, changes the level at once and locks', () => {
    const { data, storage } = recordingStorage();
    const { store, levels } = setup(undefined, storage);

    store.setOverride('low');

    expect(store.get()).toBe('low');
    expect(store.getSource()).toBe('override');
    expect(store.isLocked()).toBe(true);
    expect(levels).toEqual(['low']);
    expect(data.get('orbitka.quality.override')).toBe('low');
  });

  it('setOverride(null) removes the key and returns to the automatic level', () => {
    const { data, storage } = recordingStorage();
    const { store, levels, run } = setup(undefined, storage);
    run(2, 0.025);
    run(5.1, 0.025);
    expect(store.get()).toBe('medium');

    store.setOverride('high');
    store.setOverride(null);

    expect(store.get()).toBe('medium');
    expect(store.isLocked()).toBe(false);
    expect(store.getSource()).toBe('auto');
    expect(data.has('orbitka.quality.override')).toBe(false);
    expect(levels).toEqual(['medium', 'high', 'medium']);
  });

  it('returns to the stored level from an override start', () => {
    const { storage } = recordingStorage();
    storage.setItem('orbitka.quality.auto', 'low');
    const { store } = setup(
      { level: 'high', source: 'override', locked: true },
      storage,
    );

    store.setOverride(null);

    expect(store.get()).toBe('low');
  });

  it('ignores setOverride when the address sets the level', () => {
    const { data, storage } = recordingStorage();
    const { store, levels } = setup(
      { level: 'medium', source: 'param', locked: true },
      storage,
    );

    store.setOverride('low');
    store.setOverride(null);

    expect(store.get()).toBe('medium');
    expect(levels).toEqual([]);
    expect(data.size).toBe(0);
  });

  it('stops notifying after unsubscribe', () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.setOverride('low');

    expect(listener).not.toHaveBeenCalled();
  });
});
