// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import {
  createClock,
  DAYS_LIMIT,
  daysToUtcDate,
  SPEED_MAX,
  type Clock,
  type ClockState,
} from '@core/clock.ts';
import { formatDate, formatDateTimeAttr } from '@ui/formatDate.ts';
import { createI18n } from '@ui/i18n.ts';
import { createTimeControls } from '@ui/timeControls.ts';

const i18n = createI18n(pl, 'pl-PL');

const BUTTON_IDS = [
  'time-pause',
  'time-preset-day',
  'time-preset-ten-days',
  'time-preset-month',
  'time-preset-year',
  'time-reverse',
] as const;

function setup(options: Parameters<typeof createClock>[0] = {}) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const clock = createClock({ nowMs: () => 0, ...options });
  const controls = createTimeControls(parent, clock, i18n);

  return {
    parent,
    clock,
    controls,
    cleanup(): void {
      controls.dispose();
      parent.remove();
    },
  };
}

function button(parent: ParentNode, testId: string): HTMLButtonElement {
  const found = parent.querySelector(`[data-testid="${testId}"]`);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`missing button ${testId}`);
  }

  return found;
}

function speedText(parent: ParentNode): string {
  return parent.querySelector('#sim-speed')?.textContent ?? '';
}

function liveRegion(parent: ParentNode): HTMLElement {
  const found = parent.querySelector('[aria-live="polite"]');
  if (!(found instanceof HTMLElement)) {
    throw new Error('missing live region');
  }

  return found;
}

function stubClock(days: number): Clock {
  const state: ClockState = {
    days,
    speed: 1,
    reversed: false,
    paused: false,
    presetId: null,
  };

  return {
    subscribe(listener) {
      listener(state);
      return () => undefined;
    },
  } as Clock;
}

test('timeControls › structure', () => {
  const view = setup();

  const section = view.parent.querySelector('#time-controls');
  expect(section?.getAttribute('role')).toBe('group');
  expect(section?.getAttribute('aria-label')).toBe('Sterowanie czasem');

  const buttons = [...(section?.querySelectorAll('button') ?? [])];
  expect(buttons.map((item) => item.getAttribute('data-testid'))).toEqual([
    ...BUTTON_IDS,
  ]);
  expect(buttons.every((item) => item.getAttribute('type') === 'button')).toBe(
    true,
  );
  expect(view.parent.querySelector('#sim-date')).not.toBeNull();
  expect(
    button(view.parent, 'time-preset-day').getAttribute('aria-pressed'),
  ).toBe('true');

  view.cleanup();
});

test('timeControls › aria-label', () => {
  const view = setup();
  const pause = button(view.parent, 'time-pause');

  expect(pause.getAttribute('aria-label')).toBe('Pauza: zatrzymaj czas');
  expect(pause.textContent).toBe('Pauza');

  for (const testId of BUTTON_IDS) {
    const control = button(view.parent, testId);
    const label = control.getAttribute('aria-label') ?? '';
    const visible = (control.textContent ?? '').toLowerCase();
    expect(label.toLowerCase()).toContain(visible);
  }

  expect(
    button(view.parent, 'time-preset-day').getAttribute('aria-label'),
  ).toContain('1 dzień na sekundę');
  expect(
    button(view.parent, 'time-preset-ten-days').getAttribute('aria-label'),
  ).toContain('10 dni na sekundę');
  expect(
    button(view.parent, 'time-preset-month').getAttribute('aria-label'),
  ).toContain('1 miesiąc na sekundę');
  expect(
    button(view.parent, 'time-preset-year').getAttribute('aria-label'),
  ).toContain('1 rok na sekundę');

  pause.click();
  expect(pause.getAttribute('aria-label')).toBe('Start: wznów czas');
  expect(pause.textContent).toBe('Start');
  expect((pause.getAttribute('aria-label') ?? '').toLowerCase()).toContain(
    'start',
  );

  view.cleanup();
});

test('timeControls › clicks', () => {
  const view = setup();
  const year = button(view.parent, 'time-preset-year');
  const day = button(view.parent, 'time-preset-day');
  const pause = button(view.parent, 'time-pause');
  const reverse = button(view.parent, 'time-reverse');

  year.click();
  expect(view.clock.speed).toBe(365.25);
  expect(year.getAttribute('aria-pressed')).toBe('true');
  expect(day.getAttribute('aria-pressed')).toBe('false');

  pause.click();
  expect(view.clock.paused).toBe(true);
  expect(speedText(view.parent)).toBe('Pauza');
  expect(year.getAttribute('aria-pressed')).toBe('false');

  reverse.click();
  expect(view.clock.reversed).toBe(true);
  expect(view.clock.paused).toBe(true);
  expect(speedText(view.parent)).toBe('Pauza');

  pause.click();
  expect(view.clock.paused).toBe(false);
  expect(speedText(view.parent)).toBe('Prędkość: cofanie 1 rok/s');

  pause.click();
  year.click();
  expect(view.clock.paused).toBe(false);
  expect(view.clock.speed).toBe(365.25);

  view.cleanup();
});

test('timeControls › date and speed', () => {
  const view = setup();
  const date = view.parent.querySelector('#sim-date');

  view.clock.setDays(366);
  expect(date?.textContent).toBe('01.01.2001');
  expect(date?.getAttribute('datetime')).toBe('2001-01-01');

  view.clock.setSpeed(123);
  expect(speedText(view.parent)).toBe('Prędkość: 123 dni/s');
  for (const testId of BUTTON_IDS) {
    if (!testId.startsWith('time-preset-')) {
      continue;
    }
    expect(button(view.parent, testId).getAttribute('aria-pressed')).toBe(
      'false',
    );
  }

  view.clock.applyPreset('month');
  expect(speedText(view.parent)).toBe('Prędkość: 1 miesiąc/s');

  view.cleanup();
});

test('timeControls › date limit', () => {
  let now = 0;
  const view = setup({
    startDays: DAYS_LIMIT - 1,
    speed: SPEED_MAX,
    nowMs: () => now,
  });

  now = 1;
  expect(() => view.clock.tick(0.1)).not.toThrow();
  expect(view.clock.days).toBe(DAYS_LIMIT);
  expect(view.clock.paused).toBe(true);
  expect(speedText(view.parent)).toBe('Pauza');

  const date = view.parent.querySelector('#sim-date');
  const atLimit = daysToUtcDate(DAYS_LIMIT);
  expect(date?.textContent).toBe(formatDate(atLimit));
  expect(date?.getAttribute('datetime')).toBe(formatDateTimeAttr(atLimit));
  view.cleanup();

  for (const days of [Number.NaN, DAYS_LIMIT + 1]) {
    const parent = document.createElement('div');
    document.body.append(parent);
    expect(() =>
      createTimeControls(parent, stubClock(days), i18n),
    ).not.toThrow();
    const missing = parent.querySelector('#sim-date');
    expect(missing?.textContent).toBe('—');
    expect(missing?.hasAttribute('datetime')).toBe(false);
    parent.remove();
  }
});

test('timeControls › announcements', () => {
  let now = 0;
  const view = setup({ speed: SPEED_MAX, nowMs: () => now });
  const live = liveRegion(view.parent);
  const date = view.parent.querySelector('#sim-date');

  expect(live.textContent).toBe('');
  const beforeDate = date?.textContent;
  now = 1000;
  view.clock.tick(0.1);
  expect(date?.textContent).not.toBe(beforeDate);
  expect(live.textContent).toBe('');

  button(view.parent, 'time-preset-year').click();
  expect(live.textContent).toBe('Prędkość: 1 rok na sekundę');

  button(view.parent, 'time-reverse').click();
  expect(live.textContent).toBe('Prędkość: cofanie 1 rok na sekundę');

  live.textContent = 'marker';
  view.clock.applyPreset('year');
  expect(live.textContent).toBe('marker');

  button(view.parent, 'time-pause').click();
  expect(live.textContent).toBe('Pauza');

  view.cleanup();
});

test('timeControls › no timers', () => {
  const source = readFileSync('src/ui/timeControls.ts', 'utf8');
  expect(source.includes('innerHTML')).toBe(false);

  const interval = vi.spyOn(window, 'setInterval');
  const frame = vi.spyOn(window, 'requestAnimationFrame');
  const html = vi.spyOn(Element.prototype, 'innerHTML', 'set');
  interval.mockClear();
  frame.mockClear();
  html.mockClear();

  const view = setup();
  button(view.parent, 'time-pause').click();

  expect(interval).not.toHaveBeenCalled();
  expect(frame).not.toHaveBeenCalled();
  expect(html).not.toHaveBeenCalled();

  interval.mockRestore();
  frame.mockRestore();
  html.mockRestore();
  view.cleanup();
});

test('timeControls › dispose', () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  const clock = createClock({ nowMs: () => 0 });
  let listenerCalls = 0;
  const subscribe = clock.subscribe.bind(clock);
  clock.subscribe = (listener) =>
    subscribe((state) => {
      listenerCalls += 1;
      listener(state);
    });

  const controls = createTimeControls(parent, clock, i18n);
  const afterCreate = listenerCalls;
  expect(afterCreate).toBeGreaterThan(0);

  controls.dispose();
  expect(document.querySelector('#time-controls')).toBeNull();
  clock.setSpeed(5);
  expect(listenerCalls).toBe(afterCreate);
  expect(() => controls.dispose()).not.toThrow();
  parent.remove();
});
