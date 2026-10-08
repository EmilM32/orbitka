// @vitest-environment jsdom

import { expect, test } from 'vitest';

import { createIcon, ICON_PATHS, type IconName } from '@ui/icons.ts';

const NAMES = Object.keys(ICON_PATHS) as IconName[];

test('every IconName renders an aria-hidden svg', () => {
  expect(NAMES).toHaveLength(14);
  for (const name of NAMES) {
    const svg = createIcon(name);
    expect(svg.tagName, name).toBe('svg');
    expect(svg.getAttribute('viewBox'), name).toBe('0 0 24 24');
    expect(svg.getAttribute('aria-hidden'), name).toBe('true');
    expect(svg.getAttribute('focusable'), name).toBe('false');
    expect(svg.getAttribute('stroke'), name).toBe('currentColor');
    expect(svg.getAttribute('class'), name).toBe('icon');
    expect(svg.querySelectorAll('path').length, name).toBeGreaterThanOrEqual(1);
  }
});

test('unknown icon throws RangeError', () => {
  expect(() => createIcon('pluto' as IconName)).toThrow(
    new RangeError(
      'createIcon: parameter "name" must be a known icon name, got pluto',
    ),
  );
});
