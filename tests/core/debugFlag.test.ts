import { expect, test } from 'vitest';

import { isDebugEnabled } from '@core/debugFlag.ts';

test('debugFlag › przypadki', () => {
  expect(isDebugEnabled('?debug=1')).toBe(true);
  expect(isDebugEnabled('?a=b&debug=1')).toBe(true);
  expect(isDebugEnabled('debug=1')).toBe(true);
  expect(isDebugEnabled('?debug=%31')).toBe(true);
  expect(isDebugEnabled('?debug=1&debug=0')).toBe(true);

  expect(isDebugEnabled('?debug=0')).toBe(false);
  expect(isDebugEnabled('?debug')).toBe(false);
  expect(isDebugEnabled('?debug=true')).toBe(false);
  expect(isDebugEnabled('?debug=0&debug=1')).toBe(false);
  expect(isDebugEnabled('?debug=')).toBe(false);
  expect(isDebugEnabled('')).toBe(false);
});
