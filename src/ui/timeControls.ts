import './timeControls.css';

import {
  DAYS_LIMIT,
  daysToUtcDate,
  J2000_UTC_MS,
  MS_PER_DAY,
  SPEED_PRESETS,
  type Clock,
  type ClockState,
} from '@core/clock.ts';
import { dateDistance } from '@core/dateDistance.ts';
import {
  SLIDER_STEPS,
  sliderToSpeed,
  speedToSlider,
} from '@core/speedSlider.ts';
import { orbitalElementsAreApproximate } from '@data/elementValidity.ts';

import { formatDateTimeAttr, formatDateWords } from './formatDate.ts';
import { formatDistance } from './formatDistance.ts';
import { formatSpeedSpoken } from './formatSpeed.ts';
import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';
import { createTooltip } from './tooltip.ts';

type AppI18n = I18n<Dictionary>;

export type TimeControls = {
  /**
   * Until `setReady(true)` every control is aria-disabled (it stays in the
   * Tab order, a click does nothing) and the status says the scene is loading.
   */
  setReady(ready: boolean): void;
  dispose(): void;
};

// The first move outside 1800–2050 is announced once per session (module
// memory, not browser storage), however many panels come and go.
let approximateAnnounced = false;

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
  nowMs: () => number = Date.now,
): TimeControls {
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
  section.className = 'o-glass';
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', i18n.t('time.controls.label'));

  // The one yellow control of the panel (SPEC §5.8). The label is for screen
  // readers; the round button shows the icon only, as in the FINAL mockups.
  const pauseButton = document.createElement('button');
  pauseButton.setAttribute('type', 'button');
  pauseButton.setAttribute('data-testid', 'time-pause');
  pauseButton.className = 'o-btn o-btn--primary time-play';
  const pauseLabel = document.createElement('span');
  pauseLabel.className = 'visually-hidden';
  let pauseIcon: SVGSVGElement | null = null;

  // Date block: the "approximate" chip above the date, the status under it.
  const readout = document.createElement('div');
  readout.className = 'time-readout';

  const accuracy = document.createElement('button');
  accuracy.setAttribute('type', 'button');
  accuracy.setAttribute('id', 'time-accuracy');
  accuracy.setAttribute('data-testid', 'time-accuracy');
  accuracy.className = 'time-accuracy';
  const accuracyIcon = document.createElement('span');
  accuracyIcon.setAttribute('aria-hidden', 'true');
  accuracyIcon.textContent = '\u2248';
  const accuracyText = document.createElement('span');
  accuracyText.textContent = i18n.t('time.accuracy.approximate');
  accuracy.append(accuracyIcon, accuracyText);
  accuracy.hidden = true;
  const accuracyTip = createTooltip(
    accuracy,
    i18n.t('time.accuracy.tooltip'),
    'top',
  );

  // The "back to today" button is in the layout all the time (it fades, it does not appear), so
  // the panel keeps its width.
  const dateRow = document.createElement('div');
  dateRow.className = 'time-date-row';

  const todayButton = document.createElement('button');
  todayButton.setAttribute('type', 'button');
  todayButton.setAttribute('data-testid', 'time-today');
  todayButton.className = 'o-btn o-btn--ghost time-today';
  todayButton.textContent = i18n.t('time.today.text');
  todayButton.setAttribute('aria-label', i18n.t('time.today.ariaLabel'));
  todayButton.setAttribute('data-visible', 'false');

  const simDate = document.createElement('time');
  simDate.setAttribute('id', 'sim-date');
  simDate.setAttribute('data-testid', 'sim-date');
  simDate.setAttribute('aria-live', 'off');

  const simSpeed = document.createElement('p');
  simSpeed.setAttribute('id', 'sim-speed');
  dateRow.append(simDate, todayButton);
  readout.append(accuracy, dateRow, simSpeed);

  // 768–1023 px: the rest of the panel goes to a second row.
  const rowBreak = document.createElement('div');
  rowBreak.className = 'time-break';
  rowBreak.setAttribute('aria-hidden', 'true');

  const presetGroup = document.createElement('div');
  presetGroup.className = 'time-presets';
  presetGroup.setAttribute('role', 'radiogroup');
  presetGroup.setAttribute('aria-label', i18n.t('time.presets.groupLabel'));
  const presetButtons = new Map<SpeedPresetId, HTMLButtonElement>();
  const presetButtonList: HTMLButtonElement[] = [];
  for (const preset of PRESET_BUTTONS) {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', 'false');
    button.className = 'o-btn time-preset';
    button.setAttribute('data-testid', preset.testId);
    button.setAttribute('data-preset', preset.id);
    button.textContent = presetCopy[preset.id].visible;
    button.setAttribute('aria-label', presetCopy[preset.id].aria);
    presetButtons.set(preset.id, button);
    presetButtonList.push(button);
  }
  presetGroup.append(...presetButtonList);

  const reverseButton = document.createElement('button');
  reverseButton.setAttribute('type', 'button');
  reverseButton.setAttribute('data-testid', 'time-reverse');
  reverseButton.className = 'o-btn o-btn--outline o-toggle time-reverse';
  const reverseText = document.createElement('span');
  reverseText.textContent = i18n.t('time.reverse.text');
  reverseButton.append(createIcon('reverse'), reverseText);
  reverseButton.setAttribute('aria-label', i18n.t('time.reverse.ariaLabel'));

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
    readout,
    rowBreak,
    presetGroup,
    reverseButton,
    sliderLabel,
    slider,
    live,
  );
  parent.insertBefore(section, before ?? null);

  const controls: readonly HTMLElement[] = [
    pauseButton,
    ...presetButtonList,
    reverseButton,
    todayButton,
    slider,
  ];
  let ready = false;
  let disposed = false;

  const abort = new AbortController();
  pauseButton.addEventListener(
    'click',
    () => {
      if (ready) {
        clock.togglePause();
      }
    },
    { signal: abort.signal },
  );
  for (const preset of PRESET_BUTTONS) {
    presetButtons.get(preset.id)?.addEventListener(
      'click',
      () => {
        if (ready) {
          clock.applyPreset(preset.id);
        }
      },
      { signal: abort.signal },
    );
  }
  // Radiogroup pattern: the arrows move between the presets and apply them.
  presetGroup.addEventListener(
    'keydown',
    (event) => {
      const step =
        event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -1
            : 0;
      if (step === 0) {
        return;
      }
      event.preventDefault();
      if (!ready) {
        return;
      }
      const current = presetButtonList.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const count = presetButtonList.length;
      const nextIndex = (Math.max(0, current) + step + count) % count;
      const next = PRESET_BUTTONS[nextIndex];
      if (next === undefined) {
        return;
      }
      clock.applyPreset(next.id);
      presetButtons.get(next.id)?.focus();
    },
    { signal: abort.signal },
  );
  todayButton.addEventListener(
    'click',
    () => {
      if (!ready) {
        return;
      }
      clock.setDays(todayDays());
      live.textContent = i18n.t('time.today.announce');
      // The button fades out after this click; keep keyboard focus on the panel.
      if (document.activeElement === todayButton) {
        pauseButton.focus();
      }
    },
    { signal: abort.signal },
  );
  reverseButton.addEventListener(
    'click',
    () => {
      if (ready) {
        clock.setReversed(!clock.reversed);
      }
    },
    { signal: abort.signal },
  );

  let lastDateText = '';
  let lastDateTime: string | null = null;
  let lastApproximate: boolean | null = null;
  let lastAwayFromToday: boolean | null = null;
  let lastState: ClockState | null = null;
  let lastStatusText = '';
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
    if (!ready) {
      // Not loaded yet: the thumb goes back to the clock speed.
      slider.value = String(speedToSlider(clock.speed));
      return;
    }
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
    if (!ready) {
      return;
    }
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

  // The distance only changes with the calendar day of the simulation or of
  // the real clock, so it is computed once per pair of days.
  let distanceKey = '';
  let distanceText = '';

  function todayDays(): number {
    return (nowMs() - J2000_UTC_MS) / MS_PER_DAY;
  }

  function distanceFromToday(state: ClockState): string {
    if (!inRange(state.days)) {
      return i18n.t('time.date.missing');
    }

    const simDay = Math.floor(state.days);
    const today = Math.floor(todayDays());
    const key = `${simDay}:${today}`;
    if (key !== distanceKey) {
      const todayDate = new Date(nowMs());
      distanceText = formatDistance(
        dateDistance(todayDate, daysToUtcDate(state.days)),
        i18n,
      );
      distanceKey = key;
    }

    return distanceText;
  }

  function statusText(state: ClockState): string {
    if (!ready) {
      return i18n.t('time.status.loading');
    }

    // Pause and reverse stay readable on their own buttons (the play icon and
    // the pressed "Wstecz"), so the status keeps room for the distance.
    return distanceFromToday(state);
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
    if (pauseLabel.textContent !== pausedLabel || pauseIcon === null) {
      pauseLabel.textContent = pausedLabel;
      const icon = createIcon(state.paused ? 'play' : 'pause');
      pauseButton.replaceChildren(icon, pauseLabel);
      pauseIcon = icon;
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
            'aria-checked',
            presetId === id ? 'true' : 'false',
          );
        }
      }
      // Roving tabindex: the checked preset, else the first one.
      const tabStop = presetId ?? 'day';
      for (const id of SPEED_PRESET_IDS) {
        presetButtons
          .get(id)
          ?.setAttribute('tabindex', id === tabStop ? '0' : '-1');
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
      dateText = formatDateWords(date, i18n);
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

    // Changes only when the logical value does, so the chip does not blink.
    const approximate =
      inRange(state.days) && orbitalElementsAreApproximate(state.days);
    if (approximate !== lastApproximate) {
      accuracy.hidden = !approximate;
      if (!approximate) {
        accuracyTip.element.hidden = true;
      }
      lastApproximate = approximate;
    }

    lastStatusText = setText(simSpeed, statusText(state), lastStatusText);

    // A whole day away from today or more; a jump of less is not worth a button.
    const awayFromToday =
      inRange(state.days) && Math.abs(state.days - todayDays()) >= 1;
    if (awayFromToday !== lastAwayFromToday) {
      todayButton.setAttribute('data-visible', String(awayFromToday));
      lastAwayFromToday = awayFromToday;
    }

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
    slider.style.setProperty(
      '--fill',
      `${(Number(slider.value) / SLIDER_STEPS) * 100}%`,
    );

    const nextAnnouncement = announcement(state);
    if (announce && nextAnnouncement !== lastAnnouncement) {
      live.textContent = nextAnnouncement;
    }
    lastAnnouncement = nextAnnouncement;
    if (approximate && !approximateAnnounced && announce) {
      approximateAnnounced = true;
      live.textContent = i18n.t('time.accuracy.announce');
    }
    announce = true;
    lastState = state;
  }

  function applyReady(): void {
    for (const control of controls) {
      if (ready) {
        control.removeAttribute('aria-disabled');
      } else {
        control.setAttribute('aria-disabled', 'true');
      }
    }
  }

  applyReady();
  const unsubscribe = clock.subscribe(render);

  return {
    setReady(next: boolean) {
      if (disposed || next === ready) {
        return;
      }
      ready = next;
      applyReady();
      if (lastState !== null) {
        lastStatusText = setText(
          simSpeed,
          statusText(lastState),
          lastStatusText,
        );
      }
    },
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
      accuracyTip.dispose();
      section.remove();
    },
  };
}
