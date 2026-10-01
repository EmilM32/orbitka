// @vitest-environment jsdom

import { expect, test } from 'vitest';

import { createDebugSession } from '@ui/debugSession.ts';

test('main › bez flagi', () => {
  const parent = document.createElement('div');
  document.body.append(parent);

  expect(createDebugSession('', parent)).toBeNull();
  expect(document.querySelector('#debug-overlay')).toBeNull();
  parent.remove();
});

test('main › z flagą', () => {
  const parent = document.createElement('div');
  document.body.append(parent);
  const session = createDebugSession('?debug=1', parent);

  expect(session).not.toBeNull();
  expect(document.querySelector('#debug-overlay')).not.toBeNull();
  session?.dispose();
  expect(document.querySelector('#debug-overlay')).toBeNull();
  parent.remove();
});
