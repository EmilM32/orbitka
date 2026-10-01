import { expect, test } from 'vitest';

import {
  createClock,
  DAYS_LIMIT,
  daysFromDate,
  daysToUtcDate,
  J2000_UTC_MS,
  MS_PER_DAY,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_PRESETS,
  type ClockState,
} from '@core/clock.ts';

test('constants › golden values', () => {
  expect(SPEED_PRESETS.map((preset) => preset.id)).toEqual([
    'pause',
    'day',
    'ten-days',
    'month',
    'year',
  ]);
  expect(SPEED_PRESETS.map((preset) => preset.label)).toEqual([
    'Pause',
    '1 day/s',
    '10 days/s',
    '1 month/s',
    '1 year/s',
  ]);
  expect(SPEED_PRESETS.map((preset) => preset.daysPerSecond)).toEqual([
    0, 1, 10, 30.4375, 365.25,
  ]);
  expect(SPEED_MIN).toBe(0.1);
  expect(SPEED_MAX).toBe(3652.5);
  expect(DAYS_LIMIT).toBe(3_652_500);
  expect(J2000_UTC_MS).toBe(Date.UTC(2000, 0, 1, 12, 0, 0));
  expect(MS_PER_DAY).toBe(86_400_000);
});

test('createClock › default state', () => {
  const clock = createClock();

  expect(clock.days).toBe(0);
  expect(clock.speed).toBe(1);
  expect(clock.paused).toBe(false);
  expect(clock.reversed).toBe(false);
  expect(clock.daysPerSecond).toBe(1);
});

test('tick › advance', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.tick(0.05);
  expect(clock.days).toBeCloseTo(0.05, 9);

  const year = createClock({ nowMs: () => 0 });
  year.applyPreset('year');
  year.tick(0.1);
  expect(year.days).toBeCloseTo(36.525, 9);
});

test('tick › clamp dt', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.applyPreset('ten-days');
  clock.tick(5);
  expect(clock.days).toBeCloseTo(1, 9);

  const held = clock.days;
  clock.tick(-1);
  clock.tick(Number.NaN);
  expect(clock.days).toBeCloseTo(held, 12);

  clock.tick(Number.POSITIVE_INFINITY);
  expect(clock.days).toBeCloseTo(held + 1, 9);
});

test('reversed › rewind', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.applyPreset('ten-days');
  clock.setReversed(true);
  clock.tick(0.1);

  expect(clock.days).toBeCloseTo(-1, 9);
  expect(clock.daysPerSecond).toBe(-10);
});

test('pause › resume', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.setSpeed(4);
  clock.setReversed(true);
  clock.applyPreset('pause');

  expect(clock.paused).toBe(true);
  expect(clock.speed).toBe(4);
  expect(clock.reversed).toBe(true);
  expect(clock.daysPerSecond).toBe(0);

  const days = clock.days;
  clock.tick(0.1);
  expect(clock.days).toBe(days);

  clock.resume();
  expect(clock.paused).toBe(false);
  expect(clock.speed).toBe(4);
  clock.tick(0.1);
  expect(clock.days).toBeCloseTo(days - 0.4, 9);

  clock.pause();
  clock.tick(1);
  expect(clock.days).toBeCloseTo(days - 0.4, 9);
  clock.togglePause();
  expect(clock.paused).toBe(false);
});

test('setSpeed › clamp', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.setReversed(true);
  clock.pause();

  clock.setSpeed(0);
  expect(clock.speed).toBe(SPEED_MIN);
  clock.setSpeed(1e9);
  expect(clock.speed).toBe(SPEED_MAX);
  clock.setSpeed(Number.POSITIVE_INFINITY);
  expect(clock.speed).toBe(SPEED_MAX);
  clock.setSpeed(-5);
  expect(clock.speed).toBe(5);
  expect(clock.reversed).toBe(true);
  expect(clock.paused).toBe(true);

  let calls = 0;
  clock.subscribe(() => {
    calls += 1;
  });
  const afterSubscribe = calls;
  clock.setSpeed(Number.NaN);
  expect(clock.speed).toBe(5);
  expect(clock.reversed).toBe(true);
  expect(clock.paused).toBe(true);
  expect(calls).toBe(afterSubscribe);
});

test('presetId › for presets', () => {
  let now = 0;
  const clock = createClock({ nowMs: () => now });
  const seen: ClockState[] = [];
  clock.subscribe((state) => {
    seen.push(state);
  });

  for (const preset of SPEED_PRESETS) {
    now += 1;
    clock.applyPreset(preset.id);
    expect(seen.at(-1)?.presetId).toBe(preset.id);
  }

  clock.setSpeed(123);
  expect(seen.at(-1)?.presetId).toBeNull();
  clock.setSpeed(1 + 1e-10);
  expect(seen.at(-1)?.presetId).toBe('day');
  clock.setSpeed(1 + 1e-8);
  expect(seen.at(-1)?.presetId).toBeNull();
});

test('applyPreset › RangeError', () => {
  const clock = createClock();
  expect(() => clock.applyPreset('x')).toThrow(RangeError);
  expect(() => clock.applyPreset('x')).toThrow(
    'applyPreset: parameter "id" must be one of: pause, day, ten-days, month, year, got x',
  );
});

test('subscribe › throttling', () => {
  let now = 0;
  const clock = createClock({ nowMs: () => now });
  let calls = 0;
  clock.subscribe(() => {
    calls += 1;
  });
  expect(calls).toBe(1);
  calls = 0;

  for (let index = 0; index < 60; index += 1) {
    now += 1000 / 60;
    clock.tick(1 / 60);
  }

  expect(calls).toBeGreaterThanOrEqual(10);
  expect(calls).toBeLessThanOrEqual(11);

  const before = calls;
  clock.setSpeed(2);
  expect(calls).toBe(before + 1);
});

test('subscribe › immediate and unsubscribe', () => {
  const clock = createClock({ nowMs: () => 0 });
  let calls = 0;
  const unsubscribe = clock.subscribe(() => {
    calls += 1;
  });

  expect(calls).toBe(1);
  clock.pause();
  expect(calls).toBe(2);
  unsubscribe();
  clock.resume();
  expect(calls).toBe(2);
  expect(() => unsubscribe()).not.toThrow();
});

test('subscribe › reentrancy and exception', () => {
  const clock = createClock({ nowMs: () => 0 });
  const order: string[] = [];
  let unsubscribeSecond: () => void = () => {};
  clock.subscribe(() => {
    order.push('a');
    unsubscribeSecond();
  });
  unsubscribeSecond = clock.subscribe(() => {
    order.push('b');
  });
  order.length = 0;
  clock.pause();
  expect(order).toEqual(['a', 'b']);
  clock.resume();
  expect(order).toEqual(['a', 'b', 'a']);

  const speeds: number[] = [];
  const nested = createClock({ nowMs: () => 0 });
  nested.subscribe((state) => {
    speeds.push(state.speed);
    if (state.speed === 1) {
      nested.setSpeed(4);
    }
  });
  expect(speeds).toEqual([1, 4]);
  expect(nested.speed).toBe(4);

  const failing = createClock({ nowMs: () => 0 });
  let armed = false;
  failing.subscribe(() => {
    if (armed) {
      throw new Error('listener');
    }
  });
  armed = true;
  expect(() => failing.pause()).toThrow('listener');

  const doubled = createClock({ nowMs: () => 0 });
  let doubledCalls = 0;
  const listener = () => {
    doubledCalls += 1;
  };
  doubled.subscribe(listener);
  doubled.subscribe(listener);
  doubledCalls = 0;
  doubled.pause();
  expect(doubledCalls).toBe(2);
});

test('DAYS_LIMIT › tick', () => {
  const forward = createClock({
    startDays: DAYS_LIMIT - 1,
    speed: SPEED_MAX,
    nowMs: () => 0,
  });
  let forwardCalls = 0;
  forward.subscribe(() => {
    forwardCalls += 1;
  });
  const before = forwardCalls;
  forward.tick(0.1);
  expect(forward.days).toBe(DAYS_LIMIT);
  expect(forward.paused).toBe(true);
  expect(forwardCalls).toBe(before + 1);

  const backward = createClock({
    startDays: -DAYS_LIMIT + 1,
    speed: SPEED_MAX,
    nowMs: () => 0,
  });
  backward.setReversed(true);
  backward.tick(0.1);
  expect(backward.days).toBe(-DAYS_LIMIT);
  expect(backward.paused).toBe(true);

  const atBound = createClock({ startDays: DAYS_LIMIT, nowMs: () => 0 });
  expect(atBound.paused).toBe(false);
  expect(atBound.days).toBe(DAYS_LIMIT);
  const below = createClock({ startDays: -DAYS_LIMIT, nowMs: () => 0 });
  expect(below.paused).toBe(false);
});

test('setDays › range', () => {
  const clock = createClock({ nowMs: () => 0 });
  clock.setDays(DAYS_LIMIT);
  expect(clock.days).toBe(DAYS_LIMIT);
  clock.setDays(-DAYS_LIMIT);
  expect(clock.days).toBe(-DAYS_LIMIT);

  expect(() => clock.setDays(DAYS_LIMIT + 1)).toThrow(RangeError);
  expect(() => clock.setDays(DAYS_LIMIT + 1)).toThrow('days');
  expect(() => clock.setDays(Number.NaN)).toThrow('NaN');
  expect(() => clock.setDays(Number.POSITIVE_INFINITY)).toThrow('Infinity');
});

test.each([
  ['startDays', { startDays: Number.NaN }],
  ['startDays', { startDays: Number.POSITIVE_INFINITY }],
  ['startDays', { startDays: DAYS_LIMIT + 1 }],
  ['startDays', { startDays: -DAYS_LIMIT - 1 }],
  ['speed', { speed: Number.NaN }],
  ['speed', { speed: 0 }],
  ['speed', { speed: SPEED_MAX + 1 }],
  ['maxDtSeconds', { maxDtSeconds: 0 }],
  ['maxDtSeconds', { maxDtSeconds: -1 }],
  ['maxDtSeconds', { maxDtSeconds: Number.NaN }],
  ['maxDtSeconds', { maxDtSeconds: Number.POSITIVE_INFINITY }],
  ['uiIntervalMs', { uiIntervalMs: -1 }],
  ['uiIntervalMs', { uiIntervalMs: Number.NaN }],
  ['uiIntervalMs', { uiIntervalMs: Number.POSITIVE_INFINITY }],
] as const)('createClock › RangeError for option %s', (name, options) => {
  const value = Object.values(options)[0];
  expect(() => createClock(options)).toThrow(RangeError);
  expect(() => createClock(options)).toThrow(name);
  expect(() => createClock(options)).toThrow(String(value));
});

test('tick › invalid nowMs', () => {
  let now = 1_000;
  const clock = createClock({ nowMs: () => now });
  clock.subscribe(() => {});
  clock.tick(0.01);

  now = Number.NaN;
  expect(() => clock.tick(0.01)).toThrow(RangeError);
  expect(() => clock.tick(0.01)).toThrow('nowMs');
  expect(() => clock.tick(0.01)).toThrow('NaN');

  now = Number.POSITIVE_INFINITY;
  expect(() => clock.tick(0.01)).toThrow('Infinity');

  now = 2_000;
  clock.tick(0.01);
  now = 1_500;
  expect(() => clock.tick(0.01)).toThrow(RangeError);
  expect(() => clock.tick(0.01)).toThrow('nowMs');
  expect(clock.days).toBeCloseTo(0.02, 9);
});

test('dates › conversion', () => {
  expect(daysToUtcDate(0).toISOString()).toBe('2000-01-01T12:00:00.000Z');
  expect(daysToUtcDate(366).toISOString()).toBe('2001-01-01T12:00:00.000Z');
  expect(
    Math.abs(daysFromDate(daysToUtcDate(1234.5)) - 1234.5),
  ).toBeLessThanOrEqual(1e-6);
});

test('dates › RangeError', () => {
  expect(() => daysToUtcDate(Number.NaN)).toThrow(RangeError);
  expect(() => daysToUtcDate(Number.NaN)).toThrow('days');
  expect(() => daysToUtcDate(Number.POSITIVE_INFINITY)).toThrow('Infinity');
  expect(() => daysToUtcDate(DAYS_LIMIT + 1)).toThrow('days');
  expect(() => daysFromDate(new Date(Number.NaN))).toThrow(RangeError);
  expect(() => daysFromDate(new Date(Number.NaN))).toThrow('date');
});

test('tick › no notification', () => {
  let now = 0;
  const clock = createClock({ nowMs: () => now });
  let calls = 0;
  clock.subscribe(() => {
    calls += 1;
  });
  expect(calls).toBe(1);
  now = 1;
  clock.tick(0.01);
  expect(calls).toBe(2);
  now = 2;
  clock.tick(0.01);
  expect(calls).toBe(2);
  expect(clock.days).toBeCloseTo(0.02, 9);
});
