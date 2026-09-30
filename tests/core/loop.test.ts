import { expect, test } from 'vitest';

import { createLoop } from '@core/loop.ts';

function setup() {
  let now = 1_000;
  let tick: (() => void) | null = null;
  let cancelCount = 0;
  let requestCount = 0;
  const calls: Array<{ kind: 'update' | 'render'; dt: number }> = [];

  const loop = createLoop({
    now: () => now,
    update(dtSeconds) {
      calls.push({ kind: 'update', dt: dtSeconds });
    },
    render() {
      const dt = calls.at(-1)?.dt ?? Number.NaN;
      calls.push({ kind: 'render', dt });
    },
    requestFrame(next) {
      requestCount += 1;
      tick = next;
    },
    cancelFrame() {
      cancelCount += 1;
    },
  });

  return {
    loop,
    calls,
    setNow(value: number) {
      now = value;
    },
    frame() {
      if (!tick) {
        throw new Error('Pętla nie jest uruchomiona');
      }
      tick();
    },
    cancelCount: () => cancelCount,
    requestCount: () => requestCount,
  };
}

test('first frame reports dt 0 and updates before render', () => {
  const harness = setup();
  harness.loop.start();
  harness.frame();

  expect(harness.calls).toEqual([
    { kind: 'update', dt: 0 },
    { kind: 'render', dt: 0 },
  ]);
});

test('a 16 ms gap becomes 0.016 s', () => {
  const harness = setup();
  harness.loop.start();
  harness.frame();
  harness.calls.length = 0;
  harness.setNow(1_016);
  harness.frame();

  expect(harness.calls[0]?.dt).toBeCloseTo(0.016, 5);
  expect(harness.calls.map((call) => call.kind)).toEqual(['update', 'render']);
});

test('a 5 s gap clamps dt to 0.1 s', () => {
  const harness = setup();
  harness.loop.start();
  harness.frame();
  harness.setNow(6_000);
  harness.frame();

  expect(harness.calls.at(-2)).toEqual({ kind: 'update', dt: 0.1 });
});

test('a backwards clock reports dt 0', () => {
  const harness = setup();
  harness.loop.start();
  harness.frame();
  harness.setNow(500);
  harness.frame();

  expect(harness.calls.at(-2)).toEqual({ kind: 'update', dt: 0 });
});

test('stop drops frames and the next start does not count the pause', () => {
  const harness = setup();
  harness.loop.start();
  harness.frame();
  const framesBeforeStop = harness.calls.length;

  harness.loop.stop();
  harness.setNow(9_000);
  harness.frame();

  expect(harness.cancelCount()).toBe(1);
  expect(harness.calls).toHaveLength(framesBeforeStop);

  harness.loop.start();
  harness.frame();

  expect(harness.calls.at(-2)).toEqual({ kind: 'update', dt: 0 });
});

test('start and stop are idempotent', () => {
  const harness = setup();
  harness.loop.start();
  harness.loop.start();
  harness.loop.stop();
  harness.loop.stop();

  expect(harness.requestCount()).toBe(1);
  expect(harness.cancelCount()).toBe(1);
});
