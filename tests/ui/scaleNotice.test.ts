// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { createScaleNotice } from '@ui/scaleNotice.ts';

const i18n = createI18n(pl, 'pl-PL');

const PARAGRAPH_KEYS = [
  'scaleNotice.paragraph1',
  'scaleNotice.paragraph2',
  'scaleNotice.paragraph3',
  'scaleNotice.paragraph4',
  'scaleNotice.paragraph5',
] as const;

function setup() {
  const parent = document.createElement('div');
  document.body.append(parent);
  const notice = createScaleNotice(parent, i18n);
  const root = parent.querySelector<HTMLElement>('#scale-notice');
  const why = parent.querySelector<HTMLButtonElement>('#scale-why');
  const panel = parent.querySelector<HTMLElement>('#scale-explanation');
  const title = parent.querySelector<HTMLElement>('#scale-explanation-title');
  const close = parent.querySelector<HTMLButtonElement>('#scale-close');
  if (!root || !why || !panel || !title || !close) {
    throw new Error('scale notice is missing an expected element');
  }

  return { parent, notice, root, why, panel, title, close };
}

function pressEscape(target: HTMLElement): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
}

test('scaleNotice › znaczek', () => {
  const view = setup();

  expect(view.parent.querySelector('#scale-badge')?.textContent).toBe(
    i18n.t('scaleNotice.badge'),
  );
  expect(view.why.textContent).toBe('Dlaczego?');
  expect(view.why.getAttribute('aria-label')).toBe(
    i18n.t('scaleNotice.buttonLabel'),
  );
  expect(view.why.getAttribute('aria-controls')).toBe('scale-explanation');
  expect(view.root.firstElementChild?.id).toBe('scale-badge');
  expect(view.root.children[1]).toBe(view.why);
  expect(view.root.children[2]).toBe(view.panel);

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › domyślnie zwinięty', () => {
  const view = setup();

  expect(view.panel.hidden).toBe(true);
  expect(view.panel.hasAttribute('hidden')).toBe(true);
  expect(view.why.getAttribute('aria-expanded')).toBe('false');
  expect(view.panel.getAttribute('role')).toBe('region');
  expect(view.panel.getAttribute('aria-labelledby')).toBe(
    'scale-explanation-title',
  );

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › otwarcie', () => {
  const view = setup();

  view.why.click();

  expect(view.panel.hidden).toBe(false);
  expect(view.panel.hasAttribute('hidden')).toBe(false);
  expect(view.why.getAttribute('aria-expanded')).toBe('true');
  expect(document.activeElement).toBe(view.title);
  expect(
    [...view.panel.querySelectorAll('p')].map(
      (paragraph) => paragraph.textContent,
    ),
  ).toEqual(PARAGRAPH_KEYS.map((key) => i18n.t(key)));

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › kolejność fokusu', () => {
  const view = setup();
  view.why.click();

  expect(view.why.nextElementSibling).toBe(view.panel);
  expect(view.panel.firstElementChild).toBe(view.title);

  const afterTitle = [...view.panel.querySelectorAll<HTMLElement>('*')]
    .slice(1)
    .find((element) => element.tabIndex >= 0);
  expect(afterTitle).toBe(view.close);
  expect(afterTitle?.textContent).toBe('Zamknij');

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › zamknięcie', () => {
  const view = setup();

  view.why.click();
  view.title.focus();
  pressEscape(view.panel);
  expect(view.panel.hidden).toBe(true);
  expect(view.why.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(view.why);

  view.why.click();
  view.close.click();
  expect(view.panel.hidden).toBe(true);
  expect(document.activeElement).toBe(view.why);

  view.why.click();
  expect(document.activeElement).toBe(view.title);
  view.why.focus();
  view.why.click();
  expect(view.panel.hidden).toBe(true);
  expect(view.why.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(view.why);

  view.why.click();
  view.why.focus();
  pressEscape(view.why);
  expect(view.panel.hidden).toBe(true);
  expect(document.activeElement).toBe(view.why);

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › Escape ograniczony', () => {
  const view = setup();

  view.why.focus();
  pressEscape(view.root);
  expect(view.panel.hidden).toBe(true);
  expect(view.why.getAttribute('aria-expanded')).toBe('false');

  view.why.click();
  const outside = document.createElement('button');
  outside.textContent = 'Poza';
  document.body.append(outside);
  outside.focus();
  pressEscape(view.root);
  expect(view.panel.hidden).toBe(false);
  expect(view.why.getAttribute('aria-expanded')).toBe('true');

  outside.remove();
  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › podwójny klik', () => {
  const view = setup();

  view.why.click();
  expect(view.panel.hidden).toBe(false);
  expect(view.why.getAttribute('aria-expanded')).toBe('true');

  view.why.click();
  expect(view.panel.hidden).toBe(true);
  expect(view.panel.hasAttribute('hidden')).toBe(true);
  expect(view.why.getAttribute('aria-expanded')).toBe('false');

  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › pointerdown', () => {
  const view = setup();
  const heard = vi.fn();
  document.addEventListener('pointerdown', heard);

  expect(() => {
    view.root.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
  }).not.toThrow();
  expect(heard).not.toHaveBeenCalled();

  document.removeEventListener('pointerdown', heard);
  view.notice.dispose();
  view.parent.remove();
});

test('scaleNotice › dispose', () => {
  const view = setup();
  const remove = vi.spyOn(EventTarget.prototype, 'removeEventListener');
  view.why.click();
  expect(view.panel.hidden).toBe(false);

  view.notice.dispose();

  expect(document.querySelector('#scale-notice')).toBeNull();
  expect(document.activeElement).toBe(document.body);
  const types = remove.mock.calls.map((call) => call[0]);
  expect(types).toContain('click');
  expect(types).toContain('keydown');
  expect(types).toContain('pointerdown');
  expect(() => view.why.click()).not.toThrow();
  expect(document.querySelector('#scale-notice')).toBeNull();
  expect(() => view.notice.dispose()).not.toThrow();

  remove.mockRestore();
  view.parent.remove();
});

test('scaleNotice › bez innerHTML', () => {
  const source = readFileSync('src/ui/scaleNotice.ts', 'utf8');
  expect(source.includes('innerHTML')).toBe(false);

  const html = vi.spyOn(Element.prototype, 'innerHTML', 'set');
  html.mockClear();
  const view = setup();
  view.why.click();
  view.close.click();
  expect(html).not.toHaveBeenCalled();

  html.mockRestore();
  view.notice.dispose();
  view.parent.remove();
});
