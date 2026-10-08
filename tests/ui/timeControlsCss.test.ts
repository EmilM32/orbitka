import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

const css = readFileSync('src/ui/timeControls.css', 'utf8');

function rules(source: string): Array<{ selector: string; body: string }> {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((match) => ({
    selector: (match[1] ?? '').trim(),
    body: match[2] ?? '',
  }));
}

test('timeControlsCss › rules', () => {
  expect(css).toContain('flex-wrap: wrap');
  expect(css).toContain('width: max-content');
  expect(css).toContain('max-width: calc(100vw - 2 * var(--edge))');
  expect(css).toContain('z-index: var(--z-dock)');
  // Fixed text blocks, so the panel keeps its width.
  expect(css).toMatch(/#sim-date\s*\{[^}]*min-width:\s*11ch/u);
  expect(css).toMatch(
    /#sim-date\s*\{[^}]*font-variant-numeric:\s*tabular-nums/u,
  );
  expect(css).toMatch(/#sim-date\s*\{[^}]*var\(--font-display\)/u);
  expect(css).toMatch(/#sim-speed\s*\{[^}]*min-width:\s*16ch/u);
  // Focus is the blue ring (on the slider thumb), never yellow.
  expect(css).not.toContain('#ffd54a');
  expect(css).toMatch(
    /#speed-slider:focus-visible::-webkit-slider-thumb\s*\{[^}]*outline:\s*var\(--focus-ring\)/u,
  );

  const hidden = css.match(/\.visually-hidden\s*\{[^}]*\}/u);
  expect(hidden).not.toBeNull();
  expect(hidden?.[0]).not.toContain('display: none');
  expect(css).not.toContain('@import');
  expect(css).not.toContain('url(http');
});

test('timeControlsCss › accent only on play button', () => {
  const accented = rules(css).filter((rule) =>
    rule.body.includes('--c-accent'),
  );
  expect(accented.length).toBeGreaterThan(0);
  for (const rule of accented) {
    expect(rule.selector).toContain('.time-play');
  }
  // The play button is .o-btn--primary (controls.css) and 52 px round.
  expect(css).toMatch(/\.time-play\s*\{[^}]*width:\s*3\.25rem/u);
  expect(css).toMatch(/\.time-play:active\s*\{[^}]*scale\(0\.96\)/u);
  // Active preset: white 16 % and a white outline.
  expect(css).toMatch(
    /\.time-preset\[aria-checked='true'\]\s*\{[^}]*background:\s*var\(--c-surface-active\)[^}]*border-color:\s*var\(--c-active-border\)/u,
  );
});

test('timeControlsCss › approximate chip', () => {
  const chip = css.match(/\.time-accuracy\s*\{[^}]*\}/u)?.[0] ?? '';
  expect(chip).toContain('border: 1.5px solid var(--c-warn)');
  expect(chip).toContain('animation: time-chip-in var(--dur) var(--ease-out)');
  expect(chip).not.toMatch(/background:\s*var\(--c-warn\)/u);
  // A fade, no pulse.
  expect(css).toMatch(
    /@keyframes time-chip-in\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}/u,
  );
});

test('timeControlsCss › slider', () => {
  const sliderRule = css.match(/#speed-slider\s*\{[^}]*\}/u);
  expect(sliderRule).not.toBeNull();
  expect(sliderRule?.[0]).toContain('height: var(--hit)');
  expect(sliderRule?.[0]).toContain('touch-action: none');
  expect(css).toMatch(/var\(--c-text-2\) var\(--fill\)/u);

  const panelRule = css.match(/#time-controls\s*\{[^}]*\}/u);
  expect(panelRule?.[0]).not.toContain('touch-action: none');

  // The thumb is white, 20 px.
  const thumbs = [
    ...css.matchAll(/#speed-slider::-[a-z-]*thumb\s*\{[^}]*\}/gu),
  ];
  expect(thumbs.length).toBe(2);
  for (const match of thumbs) {
    expect(match[0]).toContain('width: 1.25rem');
    expect(match[0]).toContain('background: #fff');
  }
});

test('timeControlsCss › two rows below 1024 px', () => {
  expect(css).toMatch(
    /@media \(max-width: 1023px\)\s*\{[\s\S]*\.time-break\s*\{[^}]*flex-basis:\s*100%/u,
  );
});
