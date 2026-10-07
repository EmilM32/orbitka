// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createSelection } from '@core/selection.ts';
import { createAnnouncer } from '@ui/announcer.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');
const IDS = ['sun', 'earth', 'mars', 'jupiter'];

const SOURCE = readFileSync('src/ui/announcer.ts', 'utf8');

function reset(): void {
  document.body.replaceChildren();
}

function mount(): {
  selection: ReturnType<typeof createSelection>;
  announcer: ReturnType<typeof createAnnouncer>;
} {
  const selection = createSelection(IDS);
  const announcer = createAnnouncer(document.body, selection, i18n);
  return { selection, announcer };
}

test('announces selection and system', () => {
  reset();
  const { selection, announcer } = mount();
  const region = announcer.element;
  expect(region.getAttribute('role')).toBe('status');
  expect(region.getAttribute('aria-live')).toBe('polite');
  expect(region.getAttribute('aria-atomic')).toBe('true');

  selection.select('mars');
  expect(region.textContent).toBe('Wybrano: Mars. Kamera przybliżona.');
  selection.showSystem();
  announcer.update(1);
  expect(region.textContent).toBe('Widok całego układu.');
  selection.showSystem();
  announcer.update(1);
  expect(region.textContent).toBe('Widok całego układu.');
});

test('updates text at most once per second', () => {
  reset();
  const { selection, announcer } = mount();
  const region = announcer.element;

  selection.select('mars');
  expect(region.textContent).toBe('Wybrano: Mars. Kamera przybliżona.');

  selection.select('earth');
  announcer.update(0.3);
  expect(region.textContent).toBe('Wybrano: Mars. Kamera przybliżona.');

  selection.select('jupiter');
  announcer.update(0.7);
  expect(region.textContent).toBe('Wybrano: Jowisz. Kamera przybliżona.');

  vi.useFakeTimers();
  selection.select('sun');
  vi.advanceTimersByTime(5000);
  expect(region.textContent).toBe('Wybrano: Jowisz. Kamera przybliżona.');
  vi.useRealTimers();

  announcer.update(1);
  expect(region.textContent).toBe('Wybrano: Słońce. Kamera przybliżona.');

  expect(SOURCE).not.toMatch(/setTimeout|setInterval/u);

  expect(() => announcer.update(Number.NaN)).toThrow(
    new RangeError(
      'update: parameter "dtSeconds" must be finite and >= 0, got NaN',
    ),
  );
  expect(() => announcer.update(-1)).toThrow(
    new RangeError(
      'update: parameter "dtSeconds" must be finite and >= 0, got -1',
    ),
  );

  const before = region.textContent;
  announcer.update(0.1);
  expect(region.textContent).toBe(before);
});

test('dispose cleans up', () => {
  reset();
  const { selection, announcer } = mount();
  announcer.dispose();
  expect(announcer.element.isConnected).toBe(false);
  expect(() => selection.select('mars')).not.toThrow();
  announcer.dispose();
  announcer.update(0.1);
});
