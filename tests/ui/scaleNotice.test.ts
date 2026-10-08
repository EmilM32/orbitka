// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { createScaleNotice } from '@ui/scaleNotice.ts';

const i18n = createI18n(pl, 'pl-PL');
const SOURCES = {
  textures: {
    name: 'Solar System Scope',
    url: 'https://www.solarsystemscope.com/textures/',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
};

function setup() {
  document.body.replaceChildren();
  const header = document.createElement('header');
  const canvas = document.createElement('canvas');
  const panels = document.createElement('nav');
  document.body.append(header, panels, canvas);
  const notice = createScaleNotice(header, i18n, SOURCES);
  const root = document.querySelector<HTMLElement>('#scale-notice');
  const why = document.querySelector<HTMLButtonElement>('#scale-why');
  const dialog = document.querySelector<HTMLElement>('#scale-explanation');
  const scrim = document.querySelector<HTMLElement>('.scrim');
  const dismiss = document.querySelector<HTMLButtonElement>('#scale-dismiss');
  const confirm = document.querySelector<HTMLButtonElement>('#scale-close');
  if (!root || !why || !dialog || !scrim || !dismiss || !confirm) {
    throw new Error('scale notice is missing an expected element');
  }

  return {
    header,
    canvas,
    panels,
    notice,
    root,
    why,
    dialog,
    scrim,
    dismiss,
    confirm,
  };
}

function key(target: EventTarget, name: string, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: name,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

test('scaleNotice › badge', () => {
  const view = setup();

  expect(view.root.querySelector('#scale-badge')?.textContent).toBe(
    'Skala uproszczona',
  );
  expect(view.why.textContent).toBe('Dlaczego?');
  expect(view.why.getAttribute('aria-label')).toBe(
    i18n.t('scaleNotice.buttonLabel'),
  );
  expect(view.root.children).toHaveLength(2);
  expect(view.dialog.hidden).toBe(true);
  expect(view.scrim.hidden).toBe(true);

  view.notice.dispose();
});

test('scaleNotice › opens a modal dialog', () => {
  const view = setup();

  expect(view.why.getAttribute('aria-haspopup')).toBe('dialog');
  expect(view.why.hasAttribute('aria-expanded')).toBe(false);
  expect(view.why.hasAttribute('aria-controls')).toBe(false);

  view.why.click();
  expect(view.dialog.hidden).toBe(false);
  expect(view.scrim.hidden).toBe(false);
  expect(view.dialog.tagName).toBe('DIV');
  expect(view.dialog.classList.contains('o-glass')).toBe(true);
  expect(view.dialog.getAttribute('role')).toBe('dialog');
  expect(view.dialog.getAttribute('aria-modal')).toBe('true');
  expect(view.dialog.getAttribute('aria-labelledby')).toBe(
    'scale-explanation-title',
  );
  expect(document.querySelector('#scale-explanation-title')?.textContent).toBe(
    'Dlaczego skala jest uproszczona?',
  );

  const points = view.dialog.querySelectorAll('ol > li');
  expect(points).toHaveLength(4);
  expect(points[0]?.querySelector('strong')?.textContent).toBe(
    'Prawdziwa skala nie zmieściłaby się na ekranie.',
  );
  expect(points[1]?.textContent).toBe(
    'Odległości są ściśnięte. Neptun krąży ok. 30 razy dalej od Słońca niż Ziemia, a na ekranie tylko ok. 5,5 raza dalej.',
  );
  expect(view.dialog.querySelector('.scale-source')?.textContent).toBe(
    'Liczby z danych NASA.',
  );
  expect(view.confirm.textContent).toBe('Rozumiem');
  expect(view.confirm.classList.contains('o-btn--primary')).toBe(true);
  expect(view.dismiss.getAttribute('aria-label')).toBe('Zamknij');
  expect(view.dismiss.querySelector('svg.icon')).not.toBeNull();

  view.notice.dispose();
});

test('scaleNotice › sources section', () => {
  const view = setup();
  view.why.click();
  const toggle = document.querySelector<HTMLButtonElement>('#sources-toggle');
  const section = document.querySelector<HTMLElement>('#sources');
  if (!toggle || !section) {
    throw new Error('missing sources toggle or section');
  }

  expect(toggle.textContent).toBe('Źródła i licencje');
  expect(toggle.getAttribute('type')).toBe('button');
  expect(toggle.getAttribute('aria-controls')).toBe('sources');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(section.hidden).toBe(true);
  // Right under "Liczby z danych NASA.".
  expect(toggle.previousElementSibling?.textContent).toBe(
    'Liczby z danych NASA.',
  );

  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(section.hidden).toBe(false);
  const items = [...section.querySelectorAll('li')].map(
    (item) => item.textContent,
  );
  expect(items[0]).toBe('Dane o planetach: NASA i JPL');
  expect(items[1]).toContain(
    'Tekstury planet: Solar System Scope, licencja CC BY 4.0. Zmiany: zmniejszone i skompresowane do JPG.',
  );
  expect(items[2]).toBe('Fonty: Inter i Space Grotesk (SIL OFL 1.1)');
  expect(items[3]).toBe('Ikony: Lucide (ISC)');
  const links = [...section.querySelectorAll('a')];
  expect(links.map((link) => [link.textContent, link.href])).toEqual([
    ['Solar System Scope', 'https://www.solarsystemscope.com/textures/'],
    ['licencja CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'],
  ]);
  for (const link of links) {
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
  }
  const disclaimer = section.querySelector(
    '[data-i18n="attribution.textures.disclaimer"]',
  );
  expect(disclaimer?.textContent).toBe(
    i18n.t('attribution.textures.disclaimer'),
  );

  toggle.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(section.hidden).toBe(true);

  // Closing the dialog folds the section again.
  toggle.click();
  view.confirm.click();
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(section.hidden).toBe(true);

  view.notice.dispose();
});

test('scaleNotice › focus starts on confirm and returns to why', () => {
  const view = setup();
  view.why.focus();

  view.why.click();
  expect(document.activeElement).toBe(view.confirm);

  const event = key(view.confirm, 'Escape');
  expect(event.defaultPrevented).toBe(true);
  expect(view.dialog.hidden).toBe(true);
  expect(document.activeElement).toBe(view.why);

  view.notice.dispose();
});

test('scaleNotice › Tab stays in the dialog', () => {
  const view = setup();
  view.why.click();

  // Last (Rozumiem) → first (✕), and back with Shift+Tab.
  expect(key(view.confirm, 'Tab').defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(view.dismiss);
  expect(key(view.dismiss, 'Tab', true).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(view.confirm);

  view.notice.dispose();
});

test('scaleNotice › background is inert while open', () => {
  const view = setup();
  const alreadyInert = document.createElement('div');
  alreadyInert.setAttribute('inert', '');
  document.body.append(alreadyInert);

  view.why.click();
  for (const element of [view.header, view.panels, view.canvas]) {
    expect(element.hasAttribute('inert')).toBe(true);
  }
  expect(view.dialog.hasAttribute('inert')).toBe(false);
  expect(view.scrim.hasAttribute('inert')).toBe(false);

  view.confirm.click();
  for (const element of [view.header, view.panels, view.canvas]) {
    expect(element.hasAttribute('inert')).toBe(false);
  }
  // Inert for another reason: left as it was.
  expect(alreadyInert.hasAttribute('inert')).toBe(true);

  view.why.click();
  expect(view.canvas.hasAttribute('inert')).toBe(true);
  view.notice.dispose();
  for (const element of [view.header, view.panels, view.canvas]) {
    expect(element.hasAttribute('inert')).toBe(false);
  }
  expect(document.querySelector('#scale-explanation')).toBeNull();
  expect(document.querySelector('.scrim')).toBeNull();
});

test('scaleNotice › closes on confirm, close, Escape and scrim', () => {
  const view = setup();
  const heard = vi.fn();
  document.addEventListener('keydown', heard);

  const ways: Array<() => void> = [
    () => view.confirm.click(),
    () => view.dismiss.click(),
    () => key(view.confirm, 'Escape'),
    () => view.scrim.click(),
  ];
  for (const close of ways) {
    view.why.click();
    expect(view.dialog.hidden).toBe(false);
    close();
    expect(view.dialog.hidden).toBe(true);
    expect(view.scrim.hidden).toBe(true);
    expect(document.activeElement).toBe(view.why);
  }
  // Escape does not propagate past the dialog (the canvas would show the
  // whole system).
  expect(heard).not.toHaveBeenCalled();

  document.removeEventListener('keydown', heard);
  view.notice.dispose();
});

test('scaleNotice › double click opens one dialog', () => {
  const view = setup();

  view.why.click();
  view.why.click();
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(document.querySelectorAll('.scrim')).toHaveLength(1);
  expect(view.dialog.hidden).toBe(false);

  view.notice.dispose();
});

test('scaleNotice › pointerdown stays inside', () => {
  const view = setup();
  const heard = vi.fn();
  document.addEventListener('pointerdown', heard);

  for (const target of [view.root, view.dialog, view.scrim]) {
    target.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
  }
  expect(heard).not.toHaveBeenCalled();

  document.removeEventListener('pointerdown', heard);
  view.notice.dispose();
});

test('scaleNotice › dispose', () => {
  const view = setup();
  view.why.click();

  view.notice.dispose();

  expect(document.querySelector('#scale-notice')).toBeNull();
  expect(() => view.why.click()).not.toThrow();
  expect(view.canvas.hasAttribute('inert')).toBe(false);
  expect(() => view.notice.dispose()).not.toThrow();
});

test('scaleNotice › no innerHTML', () => {
  const source = readFileSync('src/ui/scaleNotice.ts', 'utf8');
  expect(source.includes('innerHTML')).toBe(false);
});
