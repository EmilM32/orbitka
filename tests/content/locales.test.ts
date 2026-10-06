import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { bodies } from '@data/bodies.ts';

const messages: Record<string, unknown> = pl;

const BODY_NAMES: Record<string, string> = {
  sun: 'Słońce',
  mercury: 'Merkury',
  venus: 'Wenus',
  earth: 'Ziemia',
  moon: 'Księżyc',
  mars: 'Mars',
  jupiter: 'Jowisz',
  io: 'Io',
  europa: 'Europa',
  ganymede: 'Ganimedes',
  callisto: 'Kallisto',
  saturn: 'Saturn',
  uranus: 'Uran',
  neptune: 'Neptun',
};

const PLURAL_FORMS = ['few', 'many', 'one', 'other'];

test('locales › body names', () => {
  expect(bodies.map((body) => body.id)).toEqual(Object.keys(BODY_NAMES));

  for (const body of bodies) {
    expect(messages[`bodies.${body.id}.name`]).toBe(BODY_NAMES[body.id]);
  }
});

test('locales › shape', () => {
  expect(messages['time.accuracy.approximate']).toBe('Pozycje przybliżone');

  for (const value of Object.values(messages)) {
    if (typeof value === 'string') {
      expect(value).not.toBe('');
      continue;
    }

    expect(value).toEqual(expect.any(Object));
    const forms = value as Record<string, unknown>;
    expect(Object.keys(forms).toSorted()).toEqual(PLURAL_FORMS);
    for (const form of PLURAL_FORMS) {
      expect(typeof forms[form]).toBe('string');
      expect(forms[form]).not.toBe('');
    }
  }
});
