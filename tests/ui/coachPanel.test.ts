// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { COACH_TOAST_HOLD_MS, createCoachTracker } from '@core/coach.ts';
import { type MatchMedia } from '@core/reducedMotion.ts';
import { createViewInsets } from '@core/viewInsets.ts';
import { createCoachPanel, type CoachPanel } from '@ui/coachPanel.ts';
import {
  COACH_STORAGE_KEY,
  type CoachStorage,
  type CoachStorages,
} from '@ui/coachPreference.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');

function media(coarse: boolean): MatchMedia {
  return (query) => ({
    matches: query === '(pointer: coarse)' ? coarse : false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
}

function storages(): CoachStorages & { local(): CoachStorage } {
  const data = new Map<string, string>();
  const local: CoachStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
  return { local: () => local, session: () => local, memory: { done: false } };
}

const panels: CoachPanel[] = [];

function setup(
  options: { coarse?: boolean; tablet?: boolean; reduced?: boolean } = {},
) {
  document.body.replaceChildren();
  const time = document.createElement('section');
  time.id = 'time-controls';
  document.body.append(time);
  const tracker = createCoachTracker();
  const storage = storages();
  const insets = createViewInsets();
  const panel = createCoachPanel(document.body, {
    tracker,
    i18n,
    storage,
    insets,
    isTablet: () => options.tablet ?? false,
    leftEdge: () => 228,
    matchMedia: media(options.coarse ?? false),
    reducedMotion: { matches: options.reduced ?? false },
  });
  panels.push(panel);
  return { tracker, storage, insets, panel };
}

afterEach(() => {
  for (const panel of panels.splice(0)) {
    panel.dispose();
  }
  vi.useRealTimers();
});

function region(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[role="region"]');
  if (found === null) {
    throw new Error('missing coach region');
  }
  return found;
}

function step(name: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-step="${name}"]`);
  if (found === null) {
    throw new Error(`missing step ${name}`);
  }
  return found;
}

test('panel, counter and step states', () => {
  const { tracker } = setup();
  const section = region();
  expect(section.getAttribute('aria-labelledby')).toBe('coach-title');
  expect(document.querySelector('#coach-title')?.textContent).toBe(
    'Trening pilota',
  );
  const counter = document.querySelector('.coach-counter');
  expect(counter?.getAttribute('aria-live')).toBe('polite');
  expect(counter?.textContent).toBe('0/3');
  expect(document.querySelectorAll('.coach-bars i')).toHaveLength(3);
  expect(step('rotate').getAttribute('aria-current')).toBe('step');
  expect(step('rotate').textContent).toBe('Obróć widokprzeciągnij myszą');
  expect(step('zoom').textContent).toBe('Przybliżkółko myszy lub +');
  expect(step('select').textContent).toBe(
    'Wybierz planetękliknij lub wybierz z listy',
  );

  tracker.onSelected();
  expect(counter?.textContent).toBe('1/3');
  expect(step('select').classList.contains('is-done')).toBe(true);
  expect(step('select').textContent).toContain('(zaliczone)');
  expect(step('rotate').getAttribute('aria-current')).toBe('step');
  expect(step('rotate').textContent).not.toContain('(zaliczone)');

  tracker.onCameraInput({ kind: 'rotate', deg: 15 });
  expect(counter?.textContent).toBe('2/3');
  expect(step('rotate').hasAttribute('aria-current')).toBe(false);
  expect(step('zoom').getAttribute('aria-current')).toBe('step');
  expect(document.querySelectorAll('.coach-bars i.is-done')).toHaveLength(2);
});

test('touch hints', () => {
  setup({ coarse: true });
  expect(step('rotate').textContent).toContain('przeciągnij palcem');
  expect(step('zoom').textContent).toContain('rozsuń dwa palce');
  expect(step('select').textContent).toContain('dotknij jej na niebie');
});

test('last in the Tab order and never takes focus', () => {
  const before = document.activeElement;
  setup();
  expect(document.body.lastElementChild?.id).toBe('coach');
  expect(document.activeElement).toBe(before);
  const skip = document.querySelector('[data-testid="coach-skip"]');
  expect(skip?.textContent).toBe('Pomiń');
  expect(skip?.classList.contains('o-btn--ghost')).toBe(true);
});

test('skip hides and saves', () => {
  const { storage } = setup();
  document
    .querySelector<HTMLButtonElement>('[data-testid="coach-skip"]')
    ?.click();
  expect(document.querySelector('#coach')).toBeNull();
  expect(storage.local().getItem(COACH_STORAGE_KEY)).toBe('1');
});

test('toast after finish', () => {
  vi.useFakeTimers();
  const { tracker, storage } = setup();
  tracker.onSelected();
  tracker.onCameraInput({ kind: 'rotate', deg: 15 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.1 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.1 });
  expect(storage.local().getItem(COACH_STORAGE_KEY)).toBe('1');

  const toast = document.querySelector('[role="status"]');
  expect(toast?.textContent).toBe('Gotowe! Trening ukończony. Miłego lotu.');
  expect(
    document.querySelector('#coach')?.classList.contains('has-toast'),
  ).toBe(true);
  vi.advanceTimersByTime(220);
  expect(document.querySelector('[role="region"]')).toBeNull();
  vi.advanceTimersByTime(COACH_TOAST_HOLD_MS - 220);
  expect(toast?.classList.contains('is-leaving')).toBe(true);
  expect(document.querySelector('#coach')).not.toBeNull();
  vi.advanceTimersByTime(420);
  expect(document.querySelector('#coach')).toBeNull();
});

test('toast leaves in 150 ms without motion', () => {
  vi.useFakeTimers();
  const { tracker } = setup({ reduced: true });
  tracker.onSelected();
  tracker.onCameraInput({ kind: 'rotate', deg: 15 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.15 });
  vi.advanceTimersByTime(COACH_TOAST_HOLD_MS + 149);
  expect(document.querySelector('#coach')).not.toBeNull();
  vi.advanceTimersByTime(1);
  expect(document.querySelector('#coach')).toBeNull();
});

test('position follows the card and the sheet', () => {
  const desktop = setup();
  const box = document.querySelector<HTMLElement>('#coach');
  // Between the list (228) and the window edge (jsdom: 1024 px).
  expect(box?.style.left).toBe(`${Math.round((228 + 1024) / 2)}px`);
  desktop.insets.set({ right: 352, bottom: 0 });
  expect(box?.style.left).toBe(`${Math.round((228 + 1024 - 352 + 16) / 2)}px`);

  const tablet = setup({ tablet: true });
  const sheetBox = document.querySelector<HTMLElement>('#coach');
  expect(sheetBox?.classList.contains('is-tablet')).toBe(true);
  expect(sheetBox?.style.bottom).toBe('');
  tablet.insets.set({ right: 0, bottom: 200 });
  expect(sheetBox?.style.bottom).toBe('212px');
});

test('dispose removes timers and listeners', () => {
  vi.useFakeTimers();
  const { tracker, panel, insets } = setup();
  tracker.onSelected();
  tracker.onCameraInput({ kind: 'rotate', deg: 15 });
  tracker.onCameraInput({ kind: 'zoom', ratio: 0.15 });
  panel.dispose();
  expect(document.querySelector('#coach')).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  expect(() => insets.set({ right: 10, bottom: 0 })).not.toThrow();
});
