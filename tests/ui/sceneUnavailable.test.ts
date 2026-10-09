// @vitest-environment jsdom

import { expect, test, vi } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { createI18n } from '@ui/i18n.ts';
import { showSceneUnavailable } from '@ui/sceneUnavailable.ts';

const i18n = createI18n(pl, 'pl-PL');

test('sceneUnavailable › unsupported is an alert with Polish copy', () => {
  document.body.replaceChildren();
  const notice = showSceneUnavailable(document.body, i18n, 'unsupported');

  expect(notice.getAttribute('role')).toBe('alert');
  expect(notice.querySelector('h1')?.textContent).toBe(
    'Ta przeglądarka nie pokaże sceny 3D',
  );
  expect(notice.textContent).toContain('WebGL');
  expect(notice.querySelector('button')).toBeNull();
});

test('sceneUnavailable › lost offers a reload and replaces an older notice', () => {
  document.body.replaceChildren();
  showSceneUnavailable(document.body, i18n, 'unsupported');
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  const notice = showSceneUnavailable(document.body, i18n, 'lost');

  expect(document.querySelectorAll('#scene-unavailable')).toHaveLength(1);
  expect(notice.dataset.reason).toBe('lost');
  const button = notice.querySelector('button');
  expect(button?.textContent).toBe('Odśwież stronę');
  button?.click();
  expect(reload).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});
