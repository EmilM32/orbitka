import { expect, test, vi } from 'vitest';

import { buildViewLink, copyText } from '@app/viewLink.ts';

const LOCATION = { origin: 'https://orbitka.example', pathname: '/orbitka/' };

test('viewLink › a link carries the body, the date and the speed', () => {
  expect(
    buildViewLink(LOCATION, {
      bodyId: 'saturn',
      days: 11_000,
      paused: false,
      presetId: 'month',
      cutaway: false,
    }),
  ).toBe(
    'https://orbitka.example/orbitka/?body=saturn&date=2030-02-12&speed=month',
  );
});

test('viewLink › nothing to say gives the plain address', () => {
  expect(
    buildViewLink(LOCATION, {
      bodyId: null,
      days: Number.NaN,
      paused: false,
      presetId: null,
      cutaway: true,
    }),
  ).toBe('https://orbitka.example/orbitka/');
});

test('viewLink › paused is a link too', () => {
  expect(
    buildViewLink(LOCATION, {
      bodyId: 'earth',
      days: 0,
      paused: true,
      presetId: 'day',
      cutaway: false,
    }),
  ).toBe(
    'https://orbitka.example/orbitka/?body=earth&date=2000-01-01&paused=1',
  );
});

test('viewLink › an open cutaway is the last parameter', () => {
  expect(
    buildViewLink(LOCATION, {
      bodyId: 'earth',
      days: 0,
      paused: true,
      presetId: 'day',
      cutaway: true,
    }),
  ).toBe(
    'https://orbitka.example/orbitka/?body=earth&date=2000-01-01&paused=1&cutaway=1',
  );
});

test('viewLink › copyText writes and reports', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  await expect(copyText({ writeText }, 'x')).resolves.toBe(true);
  expect(writeText).toHaveBeenCalledWith('x');
});

test('viewLink › a refused or missing clipboard is false', async () => {
  await expect(
    copyText(
      { writeText: () => Promise.reject(new Error('NotAllowedError')) },
      'x',
    ),
  ).resolves.toBe(false);
  await expect(copyText(undefined, 'x')).resolves.toBe(false);
});
