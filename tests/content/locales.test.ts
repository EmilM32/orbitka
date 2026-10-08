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
  expect(messages['time.reverse.text']).toBe('Wstecz');
  expect(messages['time.reverse.ariaLabel']).toBe(
    'Wstecz: przełącz kierunek czasu',
  );
  expect(messages['time.status.speed']).toBe('{speed}');
  expect(messages['time.status.speedReversed']).toBe('Wstecz · {speed}');
  expect(messages['time.status.loading']).toBe('Ładowanie sceny…');
  expect(messages['time.presets.groupLabel']).toBe('Prędkość czasu');
  expect(messages['time.accuracy.tooltip']).toBe(
    'Dane orbit, z których liczymy ruch planet, są dokładne dla lat 1800–2050. Poza tym zakresem pozycje są szacunkowe.',
  );
  expect(messages['time.accuracy.announce']).toBe(
    'Pozycje przybliżone. Dane orbit są dokładne dla lat 1800–2050.',
  );
  expect(messages['app.brand']).toBe('Orbitka');

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

test('locales › card texts', () => {
  const genitives: Record<string, string> = {
    sun: 'Słońca',
    mercury: 'Merkurego',
    venus: 'Wenus',
    earth: 'Ziemi',
    moon: 'Księżyca',
    mars: 'Marsa',
    jupiter: 'Jowisza',
    saturn: 'Saturna',
    uranus: 'Urana',
    neptune: 'Neptuna',
  };
  for (const [id, genitive] of Object.entries(genitives)) {
    expect(messages[`bodies.${id}.nameGenitive`]).toBe(genitive);
  }
  expect(messages['card.close.ariaLabel']).toBe('Zamknij kartę');
  expect(messages['card.facts.year']).toBe('Rok trwa');
  expect(messages['card.facts.rotation']).toBe('Obrót wokół osi');
  expect(messages['card.system']).toBe('Cały układ');
  expect(messages['card.more']).toBe('Więcej');
  expect(messages['card.less']).toBe('Mniej');
  expect(messages['card.sheet.expand']).toBe('Rozwiń kartę');
  expect(messages['card.sheet.collapse']).toBe('Zwiń kartę');
  expect(messages['card.facts.days']).toEqual({
    one: '{count} doba',
    few: '{count} doby',
    many: '{count} dób',
    other: '{count} doby',
  });
});

test('locales › coach texts', () => {
  expect(messages['coach.title']).toBe('Trening pilota');
  expect(messages['coach.counter']).toBe('{done}/3');
  expect(messages['coach.skip']).toBe('Pomiń');
  expect(messages['coach.done']).toBe('(zaliczone)');
  expect(messages['coach.step.rotate']).toBe('Obróć widok');
  expect(messages['coach.step.zoom']).toBe('Przybliż');
  expect(messages['coach.step.select']).toBe('Wybierz planetę');
  expect(messages['coach.hint.mouse.rotate']).toBe('przeciągnij myszą');
  expect(messages['coach.hint.mouse.zoom']).toBe('kółko myszy lub +');
  expect(messages['coach.hint.mouse.select']).toBe(
    'kliknij lub wybierz z listy',
  );
  expect(messages['coach.hint.touch.rotate']).toBe('przeciągnij palcem');
  expect(messages['coach.hint.touch.zoom']).toBe('rozsuń dwa palce');
  expect(messages['coach.hint.touch.select']).toBe('dotknij jej na niebie');
  expect(messages['coach.toast']).toBe(
    'Gotowe! Trening ukończony. Miłego lotu.',
  );
});

test('locales › bodies list texts', () => {
  expect(messages['bodies.group.star']).toBe('Gwiazda');
  expect(messages['bodies.group.rocky']).toBe('Planety skaliste');
  expect(messages['bodies.group.gas']).toBe('Gazowe olbrzymy');
  expect(messages['bodies.group.ice']).toBe('Lodowe olbrzymy');
  expect(messages['bodies.column.distance']).toBe('od Słońca');
  expect(messages['bodies.au.ariaLabel']).toBe('Co to jest j.a.?');
  expect(messages['bodies.au.tipStrong']).toBe('1 j.a.');
  expect(messages['bodies.au.tipRest']).toBe(
    '(jednostka astronomiczna) = odległość Ziemi od Słońca, ok. 150 mln km.',
  );
  expect(messages['bodies.au.value']).toBe('{value} j.a.');
  expect(messages['bodies.panel.collapse']).toBe('Zwiń listę do paska');
  expect(messages['bodies.drawer.open']).toBe('Planety');
});
