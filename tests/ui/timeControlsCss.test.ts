import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/timeControls.css', 'utf8');

test('timeControlsCss › rules', () => {
  expect(css).toContain('min-width: 44px');
  expect(css).toContain('min-height: 44px');
  expect(css).toContain('touch-action: manipulation');
  expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid #ffd54a/u);
  expect(css).toContain('flex-wrap: wrap');
  expect(css).toContain('width: max-content');
  expect(css).toContain('max-width: calc(100vw - 16px)');

  const hidden = css.match(/\.visually-hidden\s*\{[^}]*\}/u);
  expect(hidden).not.toBeNull();
  expect(hidden?.[0]).not.toContain('display: none');
  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(http');
});

test('timeControlsCss › suwak', () => {
  const sliderRule = css.match(/#speed-slider\s*\{[^}]*\}/u);
  expect(sliderRule).not.toBeNull();
  expect(sliderRule?.[0]).toContain('min-height: 44px');
  expect(sliderRule?.[0]).toContain('touch-action: none');

  const panelRule = css.match(/#time-controls\s*\{[^}]*\}/u);
  expect(panelRule?.[0]).not.toContain('touch-action: none');

  const noneRules = [
    ...css.matchAll(/([^{]+)\{[^}]*touch-action:\s*none[^}]*\}/gu),
  ];
  expect(noneRules.length).toBeGreaterThan(0);
  for (const match of noneRules) {
    expect(match[1]).toContain('#speed-slider');
    expect(match[1]).not.toContain('#time-controls');
  }

  const thumbs = [...css.matchAll(/#speed-slider::-[^,{]*thumb\s*\{[^}]*\}/gu)];
  expect(thumbs.length).toBeGreaterThan(0);
  for (const match of thumbs) {
    const widths = [...match[0].matchAll(/(?:width|height):\s*(\d+)px/gu)];
    expect(widths.length).toBeGreaterThan(0);
    for (const size of widths) {
      expect(Number(size[1])).toBeGreaterThanOrEqual(28);
    }
  }
});
