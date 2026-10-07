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
import { sliderToSpeed, speedToSlider } from '@core/speedSlider.ts';
import { formatDate, formatDateTimeAttr } from '@ui/formatDate.ts';
import { formatSpeedSpoken } from '@ui/formatSpeed.ts';
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

function accuracyNotice(parent: ParentNode): HTMLElement {
  const found = parent.querySelector('[data-testid="time-accuracy"]');
  if (!(found instanceof HTMLElement)) {
    throw new Error('missing time accuracy');
  }

  return found;
}

test('timeControls › accuracy', () => {
  const view = setup();
  const notice = accuracyNotice(view.parent);
  const date = view.parent.querySelector('#sim-date');
  const live = liveRegion(view.parent);
  const scaleNotice = view.parent.querySelector('#scale-notice');

  expect(scaleNotice).toBeNull();
  expect(notice.hidden).toBe(true);
  expect(notice.textContent).toBe('');
  expect(date?.nextElementSibling).toBe(notice);

  view.clock.setDays(-73048.5);
  expect(notice.hidden).toBe(true);
  expect(notice.textContent).toBe('');
  expect(date?.textContent).toBe('01.01.1800');

  view.clock.setDays(-73049.5);
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe('Pozycje przybliżone');
  expect(date?.textContent).toBe('31.12.1799');
  expect(live.textContent).not.toContain('Pozycje przybliżone');

  notice.textContent = 'marker';
  view.clock.setDays(-73059.5);
  expect(notice.textContent).toBe('marker');
  expect(notice.hidden).toBe(false);
  expect(live.textContent).not.toContain('Pozycje przybliżone');

  view.clock.pause();
  expect(view.clock.paused).toBe(true);
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe('marker');

  view.clock.setDays(0);
  expect(notice.hidden).toBe(true);
  expect(notice.textContent).toBe('');
  expect(live.textContent).not.toContain('Pozycje przybliżone');

  view.clock.setDays(18627);
  expect(notice.hidden).toBe(true);
  expect(notice.textContent).toBe('');

  view.clock.setDays(18627.5);
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe('Pozycje przybliżone');
  expect(date?.textContent).toBe('01.01.2051');
  expect(live.textContent).not.toContain('Pozycje przybliżone');

  view.clock.pause();
  expect(notice.hidden).toBe(false);
  expect(notice.textContent).toBe('Pozycje przybliżone');

  view.cleanup();
});

const PRESET_STEPS = [
  ['time-preset-day', '219', 1],
  ['time-preset-ten-days', '438', 10],
  ['time-preset-month', '544', 30.4375],
  ['time-preset-year', '781', 365.25],
] as const;

const SLIDER_EVENTS = [
  'input',
  'keydown',
  'pointerdown',
  'pointerup',
  'pointercancel',
  'lostpointercapture',
  'change',
  'blur',
] as const;

function sliderOf(parent: ParentNode): HTMLInputElement {
  const found = parent.querySelector('[data-testid="time-slider"]');
  if (!(found instanceof HTMLInputElement)) {
    throw new Error('missing time slider');
  }

  return found;
}

function fireInput(slider: HTMLInputElement, value: string): void {
  slider.value = value;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

function pressedPresets(parent: ParentNode): string[] {
  return BUTTON_IDS.filter(
    (testId) =>
      testId.startsWith('time-preset-') &&
      button(parent, testId).getAttribute('aria-pressed') === 'true',
  );
}

test('timeControls › suwak: struktura', () => {
  const view = setup();
  const slider = sliderOf(view.parent);
  const label = view.parent.querySelector('label[for="speed-slider"]');

  expect(slider.id).toBe('speed-slider');
  expect(slider.min).toBe('0');
  expect(slider.max).toBe('1000');
  expect(slider.step).toBe('1');
  expect(label?.textContent).toBe('Prędkość czasu');
  expect(slider.value).toBe('219');
  expect(slider.getAttribute('aria-label')).toBeNull();

  view.cleanup();
});

test('timeControls › suwak: preset', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  for (const [testId, value] of PRESET_STEPS) {
    button(view.parent, testId).click();
    expect(slider.value).toBe(value);
  }

  view.cleanup();
});

test('timeControls › suwak: input', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  fireInput(slider, '500');
  expect(view.clock.speed).toBeCloseTo(19.1115, 3);
  expect(pressedPresets(view.parent)).toEqual([]);

  fireInput(slider, '219');
  expect(view.clock.speed).toBe(1);
  expect(
    button(view.parent, 'time-preset-day').getAttribute('aria-pressed'),
  ).toBe('true');

  view.cleanup();
});

test('timeControls › suwak: bez pułapki', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  for (const [, value] of PRESET_STEPS) {
    const position = Number(value);
    for (const next of [position + 1, position - 1]) {
      fireInput(slider, String(next));
      expect(slider.value).toBe(String(next));
      expect(slider.value).not.toBe(value);
      expect(view.clock.speed).toBeCloseTo(sliderToSpeed(next), 9);
      expect(pressedPresets(view.parent)).toEqual([]);
    }
  }

  fireInput(slider, '220');
  expect(view.clock.speed).toBeCloseTo(1.0087, 3);
  expect(pressedPresets(view.parent)).toEqual([]);

  fireInput(slider, '439');
  expect(view.clock.speed).toBeCloseTo(10.069, 2);

  view.cleanup();
});

test('timeControls › suwak: pauza', () => {
  const view = setup();
  const slider = sliderOf(view.parent);
  const speedBefore = view.clock.speed;

  view.clock.pause();
  fireInput(slider, '500');
  expect(view.clock.speed).not.toBe(speedBefore);
  expect(view.clock.paused).toBe(true);
  expect(speedText(view.parent)).toBe('Pauza');

  fireInput(slider, '219');
  expect(view.clock.speed).toBe(1);
  expect(view.clock.paused).toBe(true);
  expect(speedText(view.parent)).toBe('Pauza');

  view.cleanup();
});

test('timeControls › suwak: kierunek', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  view.clock.setReversed(true);
  fireInput(slider, '500');
  expect(view.clock.reversed).toBe(true);

  view.cleanup();
});

test('timeControls › suwak: aria-valuetext', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  for (const [testId, , speed] of PRESET_STEPS) {
    button(view.parent, testId).click();
    expect(slider.getAttribute('aria-valuetext')).toBe(
      formatSpeedSpoken(speed, false, false, i18n),
    );
  }

  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: 1 rok na sekundę',
  );

  view.clock.pause();
  expect(slider.getAttribute('aria-valuetext')).toBe('Pauza');
  view.clock.resume();

  button(view.parent, 'time-preset-year').click();
  view.clock.setReversed(true);
  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: cofanie 1 rok na sekundę',
  );

  view.clock.setReversed(false);
  view.clock.setSpeed(123);
  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: 123 dni na sekundę',
  );
  view.clock.setSpeed(1.5);
  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: 1,5 dnia na sekundę',
  );
  view.clock.setSpeed(1899.3);
  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: 5,2 roku na sekundę',
  );

  view.cleanup();
});

test.each([
  'pointerup',
  'pointercancel',
  'lostpointercapture',
  'change',
  'blur',
] as const)('timeControls › suwak: przeciąganie %s', (type) => {
  const view = setup();
  const slider = sliderOf(view.parent);
  const capture = vi.fn();
  Object.defineProperty(slider, 'setPointerCapture', {
    configurable: true,
    value: capture,
  });

  slider.dispatchEvent(
    new PointerEvent('pointerdown', { pointerId: 4, bubbles: true }),
  );
  expect(capture).toHaveBeenCalledWith(4);

  const frozen = slider.value;
  view.clock.setSpeed(5);
  expect(slider.value).toBe(frozen);
  expect(speedText(view.parent)).toBe('Prędkość: 5 dni/s');
  expect(slider.getAttribute('aria-valuetext')).toBe(
    'Prędkość: 5 dni na sekundę',
  );

  slider.dispatchEvent(new Event(type, { bubbles: true }));
  view.clock.setSpeed(10);
  expect(slider.value).toBe(String(speedToSlider(10)));

  view.cleanup();
});

test('timeControls › suwak: klawisze', () => {
  const view = setup();
  const slider = sliderOf(view.parent);

  function key(name: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
    });
    slider.dispatchEvent(event);
    return event;
  }

  slider.value = '250';
  expect(key('PageUp').defaultPrevented).toBe(true);
  expect(slider.value).toBe('350');

  expect(key('PageDown').defaultPrevented).toBe(true);
  expect(slider.value).toBe('250');

  slider.value = '950';
  key('PageUp');
  expect(slider.value).toBe('1000');
  expect(view.clock.speed).toBe(3652.5);

  key('Home');
  expect(slider.value).toBe('0');
  expect(view.clock.speed).toBe(0.1);

  key('End');
  expect(slider.value).toBe('1000');

  fireInput(slider, '301');
  expect(slider.value).toBe('301');
  expect(view.clock.speed).toBeCloseTo(sliderToSpeed(301), 9);
  fireInput(slider, '300');
  expect(slider.value).toBe('300');
  expect(view.clock.speed).toBeCloseTo(sliderToSpeed(300), 9);

  key('ArrowRight');
  const frozen = slider.value;
  view.clock.setSpeed(5);
  expect(slider.value).toBe(frozen);
  slider.dispatchEvent(new Event('blur'));
  view.clock.setSpeed(8);
  expect(slider.value).toBe(String(speedToSlider(8)));

  view.cleanup();
});

test('timeControls › suwak: bez timerów', () => {
  const source = readFileSync('src/ui/timeControls.ts', 'utf8');
  expect(source.includes('dispatchEvent')).toBe(false);
  expect(source.includes('setInterval')).toBe(false);
  expect(source.includes('requestAnimationFrame')).toBe(false);

  const interval = vi.spyOn(window, 'setInterval');
  const frame = vi.spyOn(window, 'requestAnimationFrame');
  interval.mockClear();
  frame.mockClear();

  const view = setup();
  const setSpeed = vi.spyOn(view.clock, 'setSpeed');
  button(view.parent, 'time-preset-year').click();
  expect(sliderOf(view.parent).value).toBe('781');
  expect(setSpeed).not.toHaveBeenCalled();
  expect(interval).not.toHaveBeenCalled();
  expect(frame).not.toHaveBeenCalled();

  interval.mockRestore();
  frame.mockRestore();
  view.cleanup();
});

test('timeControls › suwak: dispose', () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  const clock = createClock({ nowMs: () => 0 });
  const controls = createTimeControls(parent, clock, i18n);
  const slider = sliderOf(parent);
  const remove = vi.spyOn(slider, 'removeEventListener');

  controls.dispose();

  for (const type of SLIDER_EVENTS) {
    expect(remove).toHaveBeenCalledWith(type, expect.any(Function));
  }

  const speed = clock.speed;
  expect(() => {
    fireInput(slider, '500');
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
    );
  }).not.toThrow();
  expect(clock.speed).toBe(speed);
  expect(() => clock.setSpeed(4)).not.toThrow();
  expect(document.querySelector('#time-controls')).toBeNull();
  expect(document.querySelector('#sim-speed')).toBeNull();
  expect(() => controls.dispose()).not.toThrow();
  parent.remove();
});

test('timeControls › suwak: niepoprawna wartość', () => {
  const view = setup();
  const slider = sliderOf(view.parent);
  vi.spyOn(slider, 'value', 'get').mockReturnValue('NaN');

  slider.dispatchEvent(new Event('input', { bubbles: true }));
  expect(view.clock.speed).toBe(0.1);
  expect(view.clock.paused).toBe(false);

  view.cleanup();
});
