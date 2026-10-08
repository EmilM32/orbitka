import './coachPanel.css';

import {
  COACH_STEPS,
  COACH_TOAST_HOLD_MS,
  type CoachState,
  type CoachStep,
  type CoachTracker,
} from '@core/coach.ts';
import { type MatchMedia } from '@core/reducedMotion.ts';
import { type ViewInsetsStore } from '@core/viewInsets.ts';

import { saveCoachDone, type CoachStorages } from './coachPreference.ts';
import { type Dictionary, type I18n } from './i18n.ts';
import { createIcon } from './icons.ts';

type AppI18n = I18n<Dictionary>;

export type CoachPanelOptions = {
  tracker: CoachTracker;
  i18n: AppI18n;
  storage: CoachStorages;
  /** The card writes them; the panel stays clear of the card and the sheet. */
  insets: ViewInsetsStore;
  isTablet(): boolean;
  /** Right edge of the bodies list (or its rail) in px, 0 without one. */
  leftEdge(): number;
  matchMedia: MatchMedia;
  reducedMotion: { readonly matches: boolean };
};

export type CoachPanel = {
  readonly element: HTMLElement;
  dispose(): void;
};

// SPEC §6: the panel fades in 220 ms, the toast leaves in 420 ms (150 ms
// without motion).
const PANEL_FADE_MS = 220;
const TOAST_EXIT_MS = 420;
const REDUCED_EXIT_MS = 150;
// Gap to the card, the sheet and the time panel.
const GAP_PX = 12;
const CARD_GAP_PX = 16;

const COARSE_QUERY = '(pointer: coarse)';

type StepView = {
  item: HTMLLIElement;
  text: HTMLElement;
  hint: HTMLElement;
  doneNote: HTMLElement;
};

export function createCoachPanel(
  parent: HTMLElement,
  options: CoachPanelOptions,
): CoachPanel {
  const { tracker, i18n, insets } = options;

  // One positioned box: the panel first, then the "Gotowe!" toast in its place.
  const element = document.createElement('div');
  element.id = 'coach';
  element.setAttribute('data-testid', 'coach');

  const panel = document.createElement('section');
  panel.className = 'o-glass coach';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'coach-title');

  const head = document.createElement('div');
  head.className = 'coach-head';
  const title = document.createElement('h2');
  title.id = 'coach-title';
  title.textContent = i18n.t('coach.title');
  const counter = document.createElement('span');
  counter.className = 'coach-counter';
  counter.setAttribute('aria-live', 'polite');
  const bars = document.createElement('span');
  bars.className = 'coach-bars';
  bars.setAttribute('aria-hidden', 'true');
  const segments = COACH_STEPS.map(() => {
    const segment = document.createElement('i');
    bars.append(segment);
    return segment;
  });
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'o-btn o-btn--ghost coach-skip';
  skip.setAttribute('data-testid', 'coach-skip');
  skip.textContent = i18n.t('coach.skip');
  head.append(title, counter, bars, skip);

  const list = document.createElement('ol');
  list.className = 'coach-steps';
  const steps = new Map<CoachStep, StepView>();
  for (const step of COACH_STEPS) {
    const item = document.createElement('li');
    item.className = 'coach-step';
    item.setAttribute('data-step', step);
    const tick = document.createElement('span');
    tick.className = 'coach-tick';
    tick.append(createIcon('check'));
    const text = document.createElement('span');
    text.className = 'coach-step-text';
    const stepTitle = document.createElement('span');
    stepTitle.className = 'coach-step-title';
    stepTitle.textContent = i18n.t(`coach.step.${step}`);
    const doneNote = document.createElement('span');
    doneNote.className = 'visually-hidden';
    doneNote.textContent = ` ${i18n.t('coach.done')}`;
    const hint = document.createElement('span');
    hint.className = 'coach-step-hint';
    text.append(stepTitle, hint);
    item.append(tick, text);
    list.append(item);
    steps.set(step, { item, text, hint, doneNote });
  }
  panel.append(head, list);
  element.append(panel);
  // Last UI container: the skip button is the last stop of the Tab order
  // (SPEC §8).
  parent.append(element);

  const coarse = options.matchMedia(COARSE_QUERY);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let disposed = false;

  render(tracker.getState());
  writeHints();
  place();
  const unsubscribeTracker = tracker.subscribe(onState);
  const unsubscribeInsets = insets.subscribe(place);
  coarse.addEventListener('change', writeHints);
  window.addEventListener('resize', place);
  skip.addEventListener('click', onSkip);

  return { element, dispose };

  function onState(state: CoachState): void {
    if (disposed) {
      return;
    }
    render(state);
    if (state.finished) {
      finish();
    }
  }

  function render(state: CoachState): void {
    let doneCount = 0;
    COACH_STEPS.forEach((step, index) => {
      const view = steps.get(step);
      const done = state.done[step];
      if (done) {
        doneCount += 1;
      }
      segments[index]?.classList.toggle('is-done', done);
      if (view === undefined) {
        return;
      }
      view.item.classList.toggle('is-done', done);
      // Read after the title only once the step is done.
      if (done) {
        view.text.insertBefore(view.doneNote, view.hint);
      } else {
        view.doneNote.remove();
      }
      const current = state.current === step;
      view.item.classList.toggle('is-current', current);
      if (current) {
        view.item.setAttribute('aria-current', 'step');
      } else {
        view.item.removeAttribute('aria-current');
      }
    });
    counter.textContent = i18n.t('coach.counter', { done: doneCount });
  }

  function writeHints(): void {
    const input = coarse.matches ? 'touch' : 'mouse';
    for (const [step, view] of steps) {
      view.hint.textContent = i18n.t(`coach.hint.${input}.${step}`);
    }
  }

  // Desktop: below the top bar, centered between the list and the card (or
  // the window edge). Tablet: 12 px above the time panel or the sheet.
  function place(): void {
    if (disposed) {
      return;
    }
    const tablet = options.isTablet();
    element.classList.toggle('is-tablet', tablet);
    const covered = insets.get();
    if (tablet) {
      element.style.left = '';
      element.style.bottom =
        covered.bottom > 0 ? `${covered.bottom + GAP_PX}px` : '';
      return;
    }
    element.style.bottom = '';
    const left = Math.max(0, options.leftEdge());
    const right =
      covered.right > 0
        ? window.innerWidth - covered.right + CARD_GAP_PX
        : window.innerWidth;
    element.style.left = `${Math.round((left + right) / 2)}px`;
  }

  function onSkip(): void {
    if (disposed) {
      return;
    }
    saveCoachDone(options.storage);
    dispose();
  }

  function finish(): void {
    saveCoachDone(options.storage);
    panel.classList.add('is-leaving');
    later(() => {
      panel.remove();
    }, PANEL_FADE_MS);

    const toast = document.createElement('div');
    toast.className = 'o-glass coach-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('data-testid', 'coach-toast');
    const tick = document.createElement('span');
    tick.className = 'coach-tick';
    tick.append(createIcon('check'));
    const message = document.createElement('span');
    message.textContent = i18n.t('coach.toast');
    toast.append(tick, message);
    element.classList.add('has-toast');
    element.append(toast);

    const exitMs = options.reducedMotion.matches
      ? REDUCED_EXIT_MS
      : TOAST_EXIT_MS;
    later(() => {
      toast.classList.add('is-leaving');
      later(dispose, exitMs);
    }, COACH_TOAST_HOLD_MS);
  }

  function later(callback: () => void, delayMs: number): void {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delayMs);
    timers.add(timer);
  }

  function dispose(): void {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers.clear();
    unsubscribeTracker();
    unsubscribeInsets();
    coarse.removeEventListener('change', writeHints);
    window.removeEventListener('resize', place);
    skip.removeEventListener('click', onSkip);
    element.remove();
  }
}
