import { expect, test } from 'vitest';

import { createFpsMeter } from '@core/fpsMeter.ts';

function tickRange(stepMs: number, durationMs: number): number {
  const meter = createFpsMeter();
  for (let time = 0; time <= durationMs; time += stepMs) {
    meter.tick(time);
  }
  return meter.fps;
}

test('fpsMeter › 60 FPS', () => {
  const fps = tickRange(16.67, 3000);
  expect(fps).toBeGreaterThanOrEqual(59);
  expect(fps).toBeLessThanOrEqual(61);
});

test('fpsMeter › 30 FPS', () => {
  const fps = tickRange(33.3, 3000);
  expect(fps).toBeGreaterThanOrEqual(29);
  expect(fps).toBeLessThanOrEqual(31);
});

test('fpsMeter › za mało danych', () => {
  const meter = createFpsMeter();
  expect(meter.fps).toBe(0);

  meter.tick(0);
  expect(meter.fps).toBe(0);

  meter.tick(400);
  meter.tick(999);
  expect(meter.fps).toBe(0);
});

test('fpsMeter › przerwa', () => {
  const meter = createFpsMeter();
  for (let time = 0; time <= 3000; time += 16.67) {
    meter.tick(time);
  }

  const resume = 3000 + 5000;
  for (let time = resume; time <= resume + 3000; time += 33.3) {
    meter.tick(time);
  }

  expect(meter.fps).toBeGreaterThanOrEqual(29);
  expect(meter.fps).toBeLessThanOrEqual(31);
});

test('fpsMeter › przepełnienie', () => {
  const meter = createFpsMeter(2);
  const start = 10_000;
  const step = 2000 / 511;
  const stamps: number[] = [];

  for (let index = 0; index < 512; index += 1) {
    const time = start + index * step;
    stamps.push(time);
    meter.tick(time);
  }

  const span = (stamps[511] ?? 0) - (stamps[0] ?? 0);
  expect(meter.fps).toBeCloseTo(511 / (span / 1000), 6);
  expect(meter.fps).toBeGreaterThan(0);
  expect(Number.isFinite(meter.fps)).toBe(true);

  const extra = (stamps[511] ?? 0) + step;
  meter.tick(extra);
  const kept = stamps.slice(1).concat(extra);
  const keptSpan = (kept[511] ?? 0) - (kept[0] ?? 0);
  expect(meter.fps).toBeCloseTo(511 / (keptSpan / 1000), 6);
});

test('fpsMeter › RangeError windowSeconds', () => {
  for (const windowSeconds of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const call = () => createFpsMeter(windowSeconds);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(
      `createFpsMeter: parametr „windowSeconds” musi być skończony i > 0, otrzymano ${windowSeconds}`,
    );
  }
});

test('fpsMeter › RangeError nowMs', () => {
  const meter = createFpsMeter();

  for (const nowMs of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]) {
    const call = () => meter.tick(nowMs);
    expect(call).toThrow(RangeError);
    expect(call).toThrow(`„nowMs”`);
    expect(call).toThrow(String(nowMs));
  }

  meter.tick(10);
  meter.tick(10);
  expect(meter.fps).toBe(0);
  expect(() => meter.tick(9)).toThrow(RangeError);
  expect(() => meter.tick(9)).toThrow('„nowMs”');
});
