import { expect, test } from 'vitest';

import { shouldPlayIntro } from '@app/wireIntro.ts';

test.each([
  ['a plain visit', '', false, false, true],
  ['already played this session', '', false, true, false],
  ['a link with a body', '?body=saturn', true, false, false],
  ['debug has no intro', '?debug=1', false, false, false],
  ['debug with intro=1 has one', '?debug=1&intro=1', false, false, true],
  ['intro=1 alone changes nothing', '?intro=1', false, false, true],
  ['intro=0 with debug', '?debug=1&intro=0', false, false, false],
  ['debug and intro, but played', '?debug=1&intro=1', false, true, false],
  ['debug and intro, with a body', '?debug=1&intro=1', true, false, false],
] as const)(
  'shouldPlayIntro › %s',
  (_name, search, hasBody, played, expected) => {
    expect(shouldPlayIntro(search, hasBody, played)).toBe(expected);
  },
);
