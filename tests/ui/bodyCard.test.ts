// @vitest-environment jsdom

import { afterEach, describe, expect, it, test, vi } from 'vitest';

import { parseBodyContentCatalog } from '@content/bodyContent.ts';
import pl from '@content/locales/pl.json' with { type: 'json' };
import bodyContentRaw from '@content/pl/bodies.json' with { type: 'json' };
import { createSelection, type Selection } from '@core/selection.ts';
import { createViewInsets, type ViewInsetsStore } from '@core/viewInsets.ts';
import { bodies } from '@data/bodies.ts';
import {
  CARD_ENTER_DELAY_MS,
  createBodyCard,
  type BodyCard,
} from '@ui/bodyCard.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');
const GALILEAN = new Set(['io', 'europa', 'ganymede', 'callisto']);
const content = parseBodyContentCatalog(
  bodyContentRaw,
  bodies
    .filter((body) => !GALILEAN.has(body.id))
    .map((body) => body.contentKey),
);
const SELECTABLE = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

type Setup = {
  card: BodyCard;
  selection: Selection;
  insets: ViewInsetsStore;
  canvas: HTMLCanvasElement;
  setTablet(next: boolean): void;
};

const mounted: Setup[] = [];

function setup(
  options: { tablet?: boolean; reducedMotion?: boolean } = {},
): Setup {
  document.body.replaceChildren();
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  const view = document.createElement('div');
  document.body.append(canvas, view);
  const selection = createSelection(SELECTABLE);
  const insets = createViewInsets();
  let tablet = options.tablet ?? false;
  const card = createBodyCard(document.body, {
    bodies,
    content,
    selection,
    insets,
    i18n,
    isTablet: () => tablet,
    before: view,
    reducedMotion: { matches: options.reducedMotion ?? false },
    focusOnClose: canvas,
  });
  const result = {
    card,
    selection,
    insets,
    canvas,
    setTablet(next: boolean) {
      tablet = next;
      window.dispatchEvent(new Event('resize'));
    },
  };
  mounted.push(result);
  return result;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    entry.card.dispose();
    entry.selection.dispose();
  }
  vi.useRealTimers();
});

function text(card: BodyCard, selector: string): string {
  return card.element.querySelector(selector)?.textContent ?? '';
}

function factValues(card: BodyCard): Record<string, string> {
  const values: Record<string, string> = {};
  for (const row of card.element.querySelectorAll<HTMLElement>(
    '.body-card-fact',
  )) {
    values[row.querySelector('dt')?.textContent ?? ''] =
      row.querySelector('dd')?.textContent ?? '';
  }
  return values;
}

test('jupiter card content', () => {
  const { card } = setup();
  card.show('jupiter');
  expect(card.element.hidden).toBe(false);
  expect(card.element.tagName).toBe('SECTION');
  expect(card.element.getAttribute('aria-labelledby')).toBe('card-title');
  expect(card.element.classList.contains('o-glass')).toBe(true);
  expect(text(card, 'h2#card-title')).toBe('Jowisz');
  expect(text(card, '.body-card-kind')).toBe('gazowy olbrzym');
  expect(
    card.element.querySelector<HTMLElement>('.body-card-dot')?.style
      .backgroundColor,
  ).toBe('rgb(210, 166, 121)');
  expect(text(card, '.gauge-value')).toBe('ok. 11 × Ziemia');
  expect(text(card, '.gauge-caption')).toBe(
    'Na średnicy Jowisza zmieści się ok. 11 Ziem.',
  );
  expect(factValues(card)).toEqual({
    'Rok trwa': '11,9 roku',
    'Obrót wokół osi': '9 h 56 min',
  });
  expect(text(card, '.body-card-fun-text')).toBe(content.jupiter?.funFact.text);
  const link = card.element.querySelector<HTMLAnchorElement>('a');
  expect(link?.href).toMatch(/^https:\/\//u);
  expect(link?.target).toBe('_blank');
  expect(link?.rel).toBe('noopener noreferrer');
  expect(link?.textContent).toBe(
    `Źródło: ${content.jupiter?.funFact.source.name ?? ''}`,
  );
  expect(
    card.element.querySelector('.body-card-close')?.getAttribute('aria-label'),
  ).toBe('Zamknij kartę');
  expect(card.element.textContent).not.toContain('Treść przykładowa');
  // Inserted before the view group: after the canvas in the Tab order.
  expect(card.element.previousElementSibling?.tagName).toBe('CANVAS');
});

describe('variants', () => {
  it.each([
    [
      'mercury',
      ['0,38 × Ziemia', 'Ziemia jest ok. 2,6 raza szersza od Merkurego.'],
      { 'Rok trwa': '88 dni' },
      true,
    ],
    [
      'earth',
      ['1 × Ziemia', 'Ziemia jest punktem odniesienia dla pozostałych planet.'],
      { 'Rok trwa': '1 rok', 'Obrót wokół osi': '23 h 56 min' },
      true,
    ],
    [
      'moon',
      ['0,27 × Ziemia', 'Ziemia jest ok. 3,7 raza szersza od Księżyca.'],
      {},
      true,
    ],
    ['sun', ['ok. 109 × Ziemia'], {}, false],
  ] as const)('%s', (id, gaugeTexts, facts, bars) => {
    const { card } = setup();
    card.show(id);
    for (const expected of gaugeTexts) {
      expect(card.element.textContent).toContain(expected);
    }
    const values = factValues(card);
    for (const [key, value] of Object.entries(facts)) {
      expect(values[key]).toBe(value);
    }
    if (id === 'sun' || id === 'moon') {
      expect(values['Rok trwa']).toBeUndefined();
      expect(card.element.textContent).not.toContain('Rok trwa');
    }
    expect(card.element.querySelector('[role="img"] .gauge-bar') !== null).toBe(
      bars,
    );
  });
});

test('content swaps without building a new skeleton', () => {
  const { card } = setup();
  card.show('jupiter');
  const title = card.element.querySelector('h2');
  const facts = card.element.querySelector('dl');
  card.show('mercury');
  expect(card.element.querySelector('h2')).toBe(title);
  expect(card.element.querySelector('dl')).toBe(facts);
  expect(card.element.querySelectorAll('.gauge')).toHaveLength(1);
  expect(text(card, 'h2')).toBe('Merkury');
  // Sun after Jupiter: the year row comes back for the next planet.
  card.show('sun');
  expect(factValues(card)['Rok trwa']).toBeUndefined();
  card.show('saturn');
  expect(factValues(card)['Rok trwa']).toBe('29,4 roku');
});

test('close paths show the system', () => {
  for (const trigger of ['close', 'system', 'Escape', 'Home'] as const) {
    const { card, selection, canvas } = setup({ reducedMotion: true });
    const showSystem = vi.spyOn(selection, 'showSystem');
    selection.select('jupiter');
    expect(card.element.hidden).toBe(false);
    const close =
      card.element.querySelector<HTMLButtonElement>('.body-card-close');
    const system =
      card.element.querySelector<HTMLButtonElement>('.body-card-system');
    if (close === null || system === null) {
      throw new Error('missing close buttons');
    }
    close.focus();
    if (trigger === 'close') {
      close.click();
    } else if (trigger === 'system') {
      system.click();
    } else {
      close.dispatchEvent(
        new KeyboardEvent('keydown', { key: trigger, bubbles: true }),
      );
    }
    expect(showSystem, trigger).toHaveBeenCalledTimes(1);
    expect(card.element.hidden, trigger).toBe(true);
    expect(document.activeElement, trigger).toBe(canvas);
  }
});

test('more toggles description', () => {
  const { card } = setup();
  card.show('jupiter');
  const more = card.element.querySelector<HTMLButtonElement>('.body-card-more');
  const description =
    card.element.querySelector<HTMLElement>('#card-description');
  if (more === null || description === null) {
    throw new Error('missing more or description');
  }
  expect(more.classList.contains('o-btn--primary')).toBe(true);
  expect(more.getAttribute('aria-controls')).toBe('card-description');
  expect(more.getAttribute('aria-expanded')).toBe('false');
  expect(description.hidden).toBe(true);
  expect(more.textContent).toBe('Więcej');
  more.click();
  expect(more.getAttribute('aria-expanded')).toBe('true');
  expect(description.hidden).toBe(false);
  expect(description.textContent).toBe(content.jupiter?.description);
  expect(more.textContent).toBe('Mniej');
  more.click();
  expect(description.hidden).toBe(true);
  // A new body starts with the description closed.
  more.click();
  card.show('mars');
  expect(description.hidden).toBe(true);
  expect(more.textContent).toBe('Więcej');
});

test('writes insets', () => {
  const desktop = setup();
  desktop.card.show('jupiter');
  expect(desktop.insets.get().right).toBeGreaterThan(0);
  expect(desktop.insets.get().bottom).toBe(0);
  desktop.card.hide();
  expect(desktop.insets.get()).toEqual({ right: 0, bottom: 0 });

  const tablet = setup({ tablet: true });
  tablet.card.show('saturn');
  expect(tablet.card.element.classList.contains('is-sheet')).toBe(true);
  expect(tablet.insets.get().right).toBe(0);
  expect(tablet.insets.get().bottom).toBeGreaterThan(0);
  // 1024 -> 1280 with the sheet open: back to the card on the right.
  tablet.setTablet(false);
  expect(tablet.card.element.classList.contains('is-sheet')).toBe(false);
  expect(tablet.insets.get().right).toBeGreaterThan(0);
  expect(tablet.insets.get().bottom).toBe(0);
  tablet.card.hide();
  expect(tablet.insets.get()).toEqual({ right: 0, bottom: 0 });
});

test('sheet handle toggles and drags', () => {
  const { card } = setup({ tablet: true });
  card.show('saturn');
  const handle =
    card.element.querySelector<HTMLButtonElement>('.body-card-handle');
  if (handle === null) {
    throw new Error('missing handle');
  }
  expect(handle.hidden).toBe(false);
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  expect(handle.getAttribute('aria-label')).toBe('Rozwiń kartę');
  handle.click();
  expect(handle.getAttribute('aria-expanded')).toBe('true');
  expect(handle.getAttribute('aria-label')).toBe('Zwiń kartę');
  expect(card.element.classList.contains('is-expanded')).toBe(true);

  const pointer = (type: string, clientY: number, timeStamp: number): Event => {
    const event = new MouseEvent(type, { clientY, bubbles: true });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    return event;
  };
  // 45 px down closes; the click after the drag is not a second tap.
  handle.dispatchEvent(pointer('pointerdown', 500, 0));
  handle.dispatchEvent(pointer('pointerup', 545, 400));
  handle.click();
  expect(handle.getAttribute('aria-expanded')).toBe('false');
  // A 10 px flick up at 0.6 px/ms opens.
  handle.dispatchEvent(pointer('pointerdown', 500, 0));
  handle.dispatchEvent(pointer('pointerup', 490, 16));
  handle.click();
  expect(handle.getAttribute('aria-expanded')).toBe('true');
  // A 39 px slow drag down keeps it open.
  handle.dispatchEvent(pointer('pointerdown', 500, 0));
  handle.dispatchEvent(pointer('pointerup', 539, 400));
  handle.click();
  expect(handle.getAttribute('aria-expanded')).toBe('true');
});

test('enters after 60 % of the flight, once', () => {
  vi.useFakeTimers();
  const { card, selection, insets } = setup();
  const set = vi.spyOn(insets, 'set');
  expect(CARD_ENTER_DELAY_MS).toBe(720);
  selection.select('jupiter');
  expect(card.element.hidden).toBe(true);
  vi.advanceTimersByTime(500);
  // Quick switching during the flight: the last body enters once.
  selection.select('saturn');
  vi.advanceTimersByTime(719);
  expect(card.element.hidden).toBe(true);
  vi.advanceTimersByTime(1);
  expect(card.element.hidden).toBe(false);
  expect(text(card, 'h2')).toBe('Saturn');
  expect(set).toHaveBeenCalledTimes(1);

  // An open card swaps its content at once.
  selection.select('mars');
  expect(text(card, 'h2')).toBe('Mars');
  selection.showSystem();
  expect(card.element.hidden).toBe(true);
  // A system view during the delay cancels the entrance.
  selection.select('venus');
  selection.showSystem();
  vi.advanceTimersByTime(1000);
  expect(card.element.hidden).toBe(true);
});

test('reduced motion shows the card without the delay', () => {
  const { card, selection } = setup({ reducedMotion: true });
  selection.select('neptune');
  expect(card.element.hidden).toBe(false);
  expect(text(card, 'h2')).toBe('Neptun');
});

test('unknown id throws', () => {
  const { card } = setup();
  expect(() => card.show('pluto')).toThrow(
    new RangeError(
      'bodyCard.show: parameter "id" must be a known body id, got pluto',
    ),
  );
  expect(card.element.hidden).toBe(true);
});

test('missing content entry throws', () => {
  document.body.replaceChildren();
  const selection = createSelection(SELECTABLE);
  const rest = Object.fromEntries(
    Object.entries(content).filter(([key]) => key !== 'jupiter'),
  );
  const card = createBodyCard(document.body, {
    bodies,
    content: rest,
    selection,
    insets: createViewInsets(),
    i18n,
    isTablet: () => false,
  });
  expect(() => card.show('jupiter')).toThrow(/"contentKey"/u);
  expect(card.element.hidden).toBe(true);
  card.dispose();
  selection.dispose();
});

test('dispose removes the card and its listeners', () => {
  document.body.replaceChildren();
  const selection = createSelection(SELECTABLE);
  const insets = createViewInsets();
  const remove = vi.spyOn(window, 'removeEventListener');
  const card = createBodyCard(document.body, {
    bodies,
    content,
    selection,
    insets,
    i18n,
    isTablet: () => false,
    reducedMotion: { matches: true },
  });
  card.show('mars');
  card.dispose();
  expect(document.querySelector('#body-card')).toBeNull();
  expect(insets.get()).toEqual({ right: 0, bottom: 0 });
  expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  selection.select('venus');
  expect(insets.get()).toEqual({ right: 0, bottom: 0 });
  remove.mockRestore();
  selection.dispose();
});
