import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/bodyLabels.css', 'utf8');
const tokens = readFileSync('src/ui/tokens.css', 'utf8');

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
}

test('bodyLabelsCss › selected has an outline, no fill', () => {
  const selected = rule('.body-label.is-selected');
  expect(selected).toContain('box-shadow: inset 0 0 0 1.5px var(--c-accent)');
  expect(selected).toContain('font-size: 14px');
  expect(selected).not.toMatch(/background[^;]*--c-accent/u);
});

test('bodyLabelsCss › hover has no yellow', () => {
  const hovered = rule('.body-label.is-hovered');
  expect(hovered).toContain('--c-surface-hover');
  expect(hovered).not.toContain('--c-accent');
  expect(hovered).not.toContain('outline');
});

test('bodyLabelsCss › no 32 px minimum height', () => {
  expect(css).not.toMatch(/min-height:\s*32px/u);
  expect(css).not.toContain('min-height');
});

test('bodyLabelsCss › leader and pill tokens', () => {
  expect(tokens).toContain('--c-leader: rgba(220, 228, 255, 0.55);');
  expect(tokens).toContain('--c-label: rgba(14, 18, 33, 0.78);');
  expect(rule('#label-leaders')).toContain('stroke-width: 1');
});
