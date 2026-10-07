import { expect, test } from 'vitest';

import { SPEED_MAX, SPEED_MIN } from '@core/clock.ts';
import {
  SLIDER_STEPS,
  sliderToSpeed,
  speedToSlider,
} from '@core/speedSlider.ts';

test('sliderToSpeed › clamp', () => {
  expect(sliderToSpeed(0)).toBe(0.1);
  expect(sliderToSpeed(-50)).toBe(0.1);
  expect(sliderToSpeed(Number.NEGATIVE_INFINITY)).toBe(0.1);
  expect(sliderToSpeed(1000)).toBe(3652.5);
  expect(sliderToSpeed(5000)).toBe(3652.5);
  expect(sliderToSpeed(Number.POSITIVE_INFINITY)).toBe(3652.5);
  expect(sliderToSpeed(Number.NaN)).toBe(0.1);
});

test('sliderToSpeed › złote wartości', () => {
  expect(sliderToSpeed(250)).toBeCloseTo(1.3824, 3);
  expect(sliderToSpeed(500)).toBeCloseTo(19.1115, 3);
  expect(sliderToSpeed(750)).toBeCloseTo(264.206, 2);
  expect(
    Math.abs(sliderToSpeed(999.9999999) - SPEED_MAX) / SPEED_MAX,
  ).toBeLessThan(1e-6);
});

test('speedToSlider › złote wartości', () => {
  expect(speedToSlider(0.1)).toBe(0);
  expect(speedToSlider(1)).toBe(219);
  expect(speedToSlider(10)).toBe(438);
  expect(speedToSlider(30.4375)).toBe(544);
  expect(speedToSlider(100)).toBe(658);
  expect(speedToSlider(365.25)).toBe(781);
  expect(speedToSlider(3652.5)).toBe(1000);
});

test('speedToSlider › clamp', () => {
  expect(speedToSlider(0.001)).toBe(0);
  expect(speedToSlider(0)).toBe(0);
  expect(speedToSlider(-5)).toBe(0);
  expect(speedToSlider(Number.NEGATIVE_INFINITY)).toBe(0);
  expect(speedToSlider(1e9)).toBe(1000);
  expect(speedToSlider(Number.POSITIVE_INFINITY)).toBe(1000);
});

test('sliderToSpeed › monotoniczność', () => {
  let previous = sliderToSpeed(0);
  for (let position = 1; position <= SLIDER_STEPS; position += 1) {
    const speed = sliderToSpeed(position);
    expect(speed).toBeGreaterThan(previous);
    previous = speed;
  }
});

test('speedToSlider › okrągłość', () => {
  for (let position = 0; position <= SLIDER_STEPS; position += 1) {
    expect(speedToSlider(sliderToSpeed(position))).toBe(position);
  }
});

test('speedSlider › RangeError', () => {
  expect(() => speedToSlider(Number.NaN)).toThrow(RangeError);
  expect(() => speedToSlider(Number.NaN)).toThrow('speed');
  expect(() => speedToSlider(Number.NaN)).toThrow(String(Number.NaN));

  const cases: readonly (readonly [number, number, string])[] = [
    [Number.NaN, 10, 'min'],
    [1, Number.NaN, 'max'],
    [Number.POSITIVE_INFINITY, 10, 'min'],
    [1, Number.POSITIVE_INFINITY, 'max'],
    [Number.NEGATIVE_INFINITY, 10, 'min'],
    [1, Number.NEGATIVE_INFINITY, 'max'],
    [0, 10, 'min'],
    [-1, 10, 'min'],
    [2, 2, 'max'],
    [5, 4, 'max'],
  ];

  for (const [min, max, name] of cases) {
    expect(() => sliderToSpeed(500, min, max)).toThrow(RangeError);
    expect(() => sliderToSpeed(500, min, max)).toThrow(name);
    expect(() => sliderToSpeed(500, min, max)).toThrow(
      String(name === 'min' ? min : max),
    );
    expect(() => speedToSlider(3, min, max)).toThrow(RangeError);
    expect(() => speedToSlider(3, min, max)).toThrow(name);
    expect(() => speedToSlider(3, min, max)).toThrow(
      String(name === 'min' ? min : max),
    );
  }
});

test('speedSlider › parametry własne', () => {
  expect(sliderToSpeed(0, 2, 8)).toBe(2);
  expect(sliderToSpeed(1000, 2, 8)).toBe(8);
  expect(sliderToSpeed(500, 2, 8)).toBeCloseTo(4, 9);
  expect(speedToSlider(4, 2, 8)).toBe(500);
  expect(SPEED_MIN).toBe(0.1);
  expect(SPEED_MAX).toBe(3652.5);
});
