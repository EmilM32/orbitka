// @vitest-environment jsdom

import { afterEach, expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { createShortcutsDialog } from '@ui/shortcutsDialog.ts';

const i18n = createI18n(pl, 'pl-PL');

afterEach(() => {
  document.body.replaceChildren();
});

function setup() {
  const opener = document.createElement('button');
  opener.textContent = 'opener';
  const page = document.createElement('main');
  page.append(opener);
  document.body.append(page);
  const dialog = createShortcutsDialog(document.body, i18n);
  const element = document.getElementById('shortcuts-dialog');
  if (element === null) {
    throw new Error('missing dialog');
  }
  return { opener, page, dialog, element };
}

test('a hidden modal dialog with the list in Polish', () => {
  const { element, dialog } = setup();
  expect(element.hidden).toBe(true);
  expect(element.getAttribute('role')).toBe('dialog');
  expect(element.getAttribute('aria-modal')).toBe('true');
  expect(element.getAttribute('aria-labelledby')).toBe('shortcuts-title');
  expect(document.getElementById('shortcuts-title')?.textContent).toBe(
    'Skróty klawiszowe',
  );
  const keys = [...element.querySelectorAll('kbd')].map(
    (key) => key.textContent,
  );
  expect(keys).toEqual([
    'Spacja',
    '0',
    '1–8',
    'D',
    '?',
    'Strzałki',
    '+ i −',
    'Home lub Esc',
  ]);
  expect(dialog.isOpen()).toBe(false);
  dialog.dispose();
});

test('open makes the page inert and focuses "Rozumiem"; close undoes it', () => {
  const { opener, page, dialog, element } = setup();
  opener.focus();
  dialog.open();
  expect(dialog.isOpen()).toBe(true);
  expect(element.hidden).toBe(false);
  expect(page.hasAttribute('inert')).toBe(true);
  expect(document.activeElement?.textContent).toBe('Rozumiem');

  dialog.open();
  expect(document.querySelectorAll('[inert]')).toHaveLength(1);

  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(dialog.isOpen()).toBe(false);
  expect(element.hidden).toBe(true);
  expect(page.hasAttribute('inert')).toBe(false);
  expect(document.activeElement).toBe(opener);
  dialog.dispose();
});

test('the buttons and the scrim close it', () => {
  const { opener, dialog } = setup();
  for (const selector of [
    '[data-testid="shortcuts-confirm"]',
    '[data-testid="shortcuts-dismiss"]',
    '[data-testid="shortcuts-scrim"]',
  ]) {
    opener.focus();
    dialog.open();
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) {
      throw new Error(`missing ${selector}`);
    }
    target.click();
    expect(dialog.isOpen(), selector).toBe(false);
    expect(document.activeElement, selector).toBe(opener);
  }
  dialog.dispose();
});

test('Esc does not leave the dialog; other keys do not close it', () => {
  const { dialog, element } = setup();
  dialog.open();
  const escape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  let reached = false;
  document.body.addEventListener('keydown', () => {
    reached = true;
  });
  element.dispatchEvent(escape);
  expect(reached).toBe(false);
  expect(escape.defaultPrevented).toBe(true);

  dialog.open();
  element.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
  );
  expect(dialog.isOpen()).toBe(true);
  dialog.dispose();
});

test('focus does not return to an opener that is gone', () => {
  const { opener, dialog } = setup();
  opener.focus();
  dialog.open();
  opener.remove();
  expect(() => {
    document
      .querySelector<HTMLElement>('[data-testid="shortcuts-confirm"]')
      ?.click();
  }).not.toThrow();
  expect(dialog.isOpen()).toBe(false);
  dialog.dispose();
});

test('dispose removes the dialog and the inert marks', () => {
  const { page, dialog } = setup();
  dialog.open();
  dialog.dispose();
  dialog.dispose();
  expect(document.getElementById('shortcuts-dialog')).toBeNull();
  expect(page.hasAttribute('inert')).toBe(false);
  dialog.open();
  expect(dialog.isOpen()).toBe(false);
});
