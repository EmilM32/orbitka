import './timeControls.css';

import {
  DAYS_LIMIT,
  daysToUtcDate,
  SPEED_PRESETS,
  type Clock,
  type ClockState,
} from '@core/clock.ts';
import {
  SLIDER_STEPS,
  sliderToSpeed,
  speedToSlider,
} from '@core/speedSlider.ts';
import { orbitalElementsAreApproximate } from '@data/elementValidity.ts';

import { formatDate, formatDateTimeAttr } from './formatDate.ts';
import { formatSpeed, formatSpeedSpoken } from './formatSpeed.ts';
import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

const SPEED_PRESET_IDS = ['day', 'ten-days', 'month', 'year'] as const;

type SpeedPresetId = (typeof SPEED_PRESET_IDS)[number];

const PRESET_BUTTONS: readonly { id: SpeedPresetId; testId: string }[] = [
  { id: 'day', testId: 'time-preset-day' },
  { id: 'ten-days', testId: 'time-preset-ten-days' },
  { id: 'month', testId: 'time-preset-month' },
  { id: 'year', testId: 'time-preset-year' },
];

type PresetCopy = {
  visible: string;
  spoken: string;
  aria: string;
};

function inRange(days: number): boolean {
  return Number.isFinite(days) && Math.abs(days) <= DAYS_LIMIT;
}

function activePreset(state: ClockState): SpeedPresetId | null {
  if (state.paused || state.presetId === null || state.presetId === 'pause') {
    return null;
  }

  for (const id of SPEED_PRESET_IDS) {
    if (id === state.presetId) {
      return id;
    }
  }

  return null;
}

function setText(element: HTMLElement, text: string, previous: string): string {
  if (text !== previous) {
    element.textContent = text;
  }

  return text;
}

export function createTimeControls(
  parent: HTMLElement,
  clock: Clock,
  i18n: AppI18n,
  before?: Node | null,
): { dispose(): void } {
  function copyFor(
    visibleKey:
      | 'time.presets.day'
      | 'time.presets.ten-days'
      | 'time.presets.month'
      | 'time.presets.year',
    spokenKey:
      | 'time.presets.day.spoken'
      | 'time.presets.ten-days.spoken'
      | 'time.presets.month.spoken'
      | 'time.presets.year.spoken',
  ): PresetCopy {
    const visible = i18n.t(visibleKey);
    const spoken = i18n.t(spokenKey);
    const sentence = i18n.t('time.presets.setSpeed', { speed: spoken });
    return { visible, spoken, aria: `${visible}. ${sentence}` };
  }

  const presetCopy = {
    day: copyFor('time.presets.day', 'time.presets.day.spoken'),
    'ten-days': copyFor(
      'time.presets.ten-days',
      'time.presets.ten-days.spoken',
    ),
    month: copyFor('time.presets.month', 'time.presets.month.spoken'),
    year: copyFor('time.presets.year', 'time.presets.year.spoken'),
  } satisfies Record<SpeedPresetId, PresetCopy>;

  const section = document.createElement('section');
  section.setAttribute('id', 'time-controls');
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', i18n.t('time.controls.label'));

  const pauseButton = document.createElement('button');
  pauseButton.setAttribute('type', 'button');
  pauseButton.setAttribute('data-testid', 'time-pause');

  const presetButtons = new Map<SpeedPresetId, HTMLButtonElement>();
  const presetButtonList: HTMLButtonElement[] = [];
  for (const preset of PRESET_BUTTONS) {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.setAttribute('data-testid', preset.testId);
    button.textContent = presetCopy[preset.id].visible;
    button.setAttribute('aria-label', presetCopy[preset.id].aria);
    presetButtons.set(preset.id, button);
    presetButtonList.push(button);
  }

  const reverseButton = document.createElement('button');
  reverseButton.setAttribute('type', 'button');
  reverseButton.setAttribute('data-testid', 'time-reverse');
  reverseButton.textContent = i18n.t('time.reverse.text');
  reverseButton.setAttribute('aria-label', i18n.t('time.reverse.ariaLabel'));

  const simDate = document.createElement('time');
  simDate.setAttribute('id', 'sim-date');
  simDate.setAttribute('data-testid', 'sim-date');

  const accuracy = document.createElement('p');
  accuracy.setAttribute('id', 'time-accuracy');
  accuracy.setAttribute('data-testid', 'time-accuracy');
  accuracy.hidden = true;

  const simSpeed = document.createElement('p');
  simSpeed.setAttribute('id', 'sim-speed');

  const sliderLabel = document.createElement('label');
  sliderLabel.setAttribute('for', 'speed-slider');
  sliderLabel.setAttribute('class', 'visually-hidden');
  sliderLabel.textContent = i18n.t('time.slider.label');

  const slider = document.createElement('input');
  slider.setAttribute('type', 'range');
  slider.setAttribute('id', 'speed-slider');
  slider.setAttribute('data-testid', 'time-slider');
  slider.setAttribute('min', '0');
  slider.setAttribute('max', String(SLIDER_STEPS));
  slider.setAttribute('step', '1');

  const live = document.createElement('div');
  live.setAttribute('class', 'visually-hidden');
  live.setAttribute('aria-live', 'polite');

  section.append(
    pauseButton,
    ...presetButtonList,
    reverseButton,
    simDate,
    accuracy,
    sliderLabel,
    slider,
    simSpeed,
    live,
  );
  parent.insertBefore(section, before ?? null);

  const abort = new AbortController();
  pauseButton.addEventListener('click', () => clock.togglePause(), {
    signal: abort.signal,
  });
  for (const preset of PRESET_BUTTONS) {
    presetButtons
      .get(preset.id)
      ?.addEventListener('click', () => clock.applyPreset(preset.id), {
        signal: abort.signal,
      });
  }
  reverseButton.addEventListener(
    'click',
    () => clock.setReversed(!clock.reversed),
    { signal: abort.signal },
  );

  let lastDateText = '';
  let lastDateTime: string | null = null;
  let lastApproximate: boolean | null = null;
  const approximateText = i18n.t('time.accuracy.approximate');
  let lastSpeedText = '';
  let lastPresetId: string | null | undefined;
  let lastAnnouncement = '';
  let announce = false;
  let isDragging = false;
  let lastValueText = '';

  function presetById(id: string): SpeedPresetId | null {
    for (const candidate of SPEED_PRESET_IDS) {
      if (candidate === id) {
        return candidate;
      }
    }

    return null;
  }

  function snappedPreset(position: number): {
    id: SpeedPresetId;
    daysPerSecond: number;
  } | null {
    for (const preset of SPEED_PRESETS) {
      const id = presetById(preset.id);
      if (id === null) {
        continue;
      }

      if (position === speedToSlider(preset.daysPerSecond)) {
        return { id, daysPerSecond: preset.daysPerSecond };
      }
    }

    return null;
  }

  function applySlider(position: number): void {
    if (!Number.isFinite(position)) {
      clock.setSpeed(sliderToSpeed(Number.NaN));
      return;
    }

    // An integer step does not reproduce a preset speed. Position 219 maps
    // back to about 0.99818 days/s, not 1, so a ±1% window would trap arrow
    // keys. Snap only when the position is exactly the preset step.
    const preset = snappedPreset(position);
    if (preset !== null) {
      if (clock.paused) {
        clock.setSpeed(preset.daysPerSecond);
      } else {
        clock.applyPreset(preset.id);
      }
      return;
    }

    clock.setSpeed(sliderToSpeed(position));
  }

  function onInput(): void {
    applySlider(Number(slider.value));
  }

  function onKeyDown(event: Event): void {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }

    isDragging = true;
    const current = Number(slider.value);
    let next: number | null = null;

    if (event.key === 'PageUp') {
      next = Math.min(SLIDER_STEPS, current + SLIDER_STEPS / 10);
    } else if (event.key === 'PageDown') {
      next = Math.max(0, current - SLIDER_STEPS / 10);
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = SLIDER_STEPS;
    }

    if (next === null) {
      return;
    }

    event.preventDefault();
    slider.value = String(next);
    applySlider(next);
  }

  function onPointerDown(event: Event): void {
    if (!(event instanceof PointerEvent)) {
      return;
    }

    isDragging = true;
    slider.setPointerCapture(event.pointerId);
  }

  function endDrag(): void {
    isDragging = false;
  }

  const sliderListeners: readonly [string, EventListener][] = [
    ['input', onInput],
    ['keydown', onKeyDown],
    ['pointerdown', onPointerDown],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['lostpointercapture', endDrag],
    ['change', endDrag],
    ['blur', endDrag],
  ];

  for (const [type, listener] of sliderListeners) {
    slider.addEventListener(type, listener);
  }

  function speedText(state: ClockState): string {
    if (state.paused) {
      return i18n.t('time.status.paused');
    }

    const preset = activePreset(state);
    const value =
      preset === null
        ? formatSpeed(state.speed, i18n)
        : presetCopy[preset].visible;
    const key = state.reversed
      ? 'time.status.speedReversed'
      : 'time.status.speed';
    return i18n.t(key, { speed: value });
  }

  function announcement(state: ClockState): string {
    if (state.paused) {
      return i18n.t('time.status.paused');
    }

    const preset = activePreset(state);
    if (preset !== null) {
      const key = state.reversed
        ? 'time.status.speedReversed'
        : 'time.status.speed';
      return i18n.t(key, { speed: presetCopy[preset].spoken });
    }

    return formatSpeedSpoken(state.speed, state.reversed, false, i18n);
  }

  function render(state: ClockState): void {
    const pausedLabel = state.paused
      ? i18n.t('time.resume.text')
      : i18n.t('time.pause.text');
    const pausedAria = state.paused
      ? i18n.t('time.resume.ariaLabel')
      : i18n.t('time.pause.ariaLabel');
    if (pauseButton.textContent !== pausedLabel) {
      pauseButton.textContent = pausedLabel;
    }
    if (pauseButton.getAttribute('aria-label') !== pausedAria) {
      pauseButton.setAttribute('aria-label', pausedAria);
    }

    const presetId = activePreset(state);
    if (presetId !== lastPresetId) {
      for (const id of SPEED_PRESET_IDS) {
        const button = presetButtons.get(id);
        if (button !== undefined) {
          button.setAttribute(
            'aria-pressed',
            presetId === id ? 'true' : 'false',
          );
        }
      }
      lastPresetId = presetId;
    }

    const reversed = state.reversed ? 'true' : 'false';
    if (reverseButton.getAttribute('aria-pressed') !== reversed) {
      reverseButton.setAttribute('aria-pressed', reversed);
    }

    let dateText = i18n.t('time.date.missing');
    let dateTime: string | null = null;
    if (inRange(state.days)) {
      const date = daysToUtcDate(state.days);
      dateText = formatDate(date);
      dateTime = formatDateTimeAttr(date);
    }
    lastDateText = setText(simDate, dateText, lastDateText);
    if (dateTime !== lastDateTime) {
      if (dateTime === null) {
        simDate.removeAttribute('datetime');
      } else {
        simDate.setAttribute('datetime', dateTime);
      }
      lastDateTime = dateTime;
    }

    const approximate =
      Number.isFinite(state.days) && orbitalElementsAreApproximate(state.days);
    if (approximate !== lastApproximate) {
      accuracy.hidden = !approximate;
      accuracy.textContent = approximate ? approximateText : '';
      lastApproximate = approximate;
    }

    lastSpeedText = setText(simSpeed, speedText(state), lastSpeedText);

    const valueText = formatSpeedSpoken(
      state.speed,
      state.reversed,
      state.paused,
      i18n,
    );
    if (valueText !== lastValueText) {
      slider.setAttribute('aria-valuetext', valueText);
      lastValueText = valueText;
    }

    if (!isDragging) {
      const nextValue = String(speedToSlider(state.speed));
      if (slider.value !== nextValue) {
        slider.value = nextValue;
      }
    }

    const nextAnnouncement = announcement(state);
    if (announce && nextAnnouncement !== lastAnnouncement) {
      live.textContent = nextAnnouncement;
    }
    lastAnnouncement = nextAnnouncement;
    announce = true;
  }

  const unsubscribe = clock.subscribe(render);
  let disposed = false;

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      for (const [type, listener] of sliderListeners) {
        slider.removeEventListener(type, listener);
      }
      abort.abort();
      unsubscribe();
      section.remove();
    },
  };
}
