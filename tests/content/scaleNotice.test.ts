import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { getBody } from '@data/bodies.ts';

const messages: Record<string, unknown> = pl;

// km in one astronomical unit (IAU 2012).
const AU_KM = 149_597_871;
// The basketball of point 1, in metres.
const BALL_M = 0.24;

test('scaleNotice › texts', () => {
  expect(messages['scaleNotice.why']).toBe('Dlaczego?');
  expect(messages['scaleNotice.badge']).toBe('Skala uproszczona');
  expect(messages['scaleNotice.buttonLabel']).toBe(
    'Pokaż wyjaśnienie, dlaczego skala jest uproszczona',
  );
  expect(messages['scaleNotice.title']).toBe(
    'Dlaczego skala jest uproszczona?',
  );
  expect(messages['scaleNotice.closeLabel']).toBe('Zamknij');
  expect(messages['scaleNotice.confirm']).toBe('Rozumiem');
  expect(messages['scaleNotice.source']).toBe('Liczby z danych NASA.');
  expect(messages['scaleNotice.point1.title']).toBe(
    'Prawdziwa skala nie zmieściłaby się na ekranie.',
  );
  expect(messages['scaleNotice.point1.body']).toBe(
    'Gdyby Ziemia była piłką do koszykówki (24 cm), Słońce miałoby ok. 26 m średnicy i stałoby ok. 2,8 km dalej.',
  );
  expect(messages['scaleNotice.point2.title']).toBe('Odległości są ściśnięte.');
  expect(messages['scaleNotice.point2.body']).toBe(
    'Neptun krąży ok. 30 razy dalej od Słońca niż Ziemia, a na ekranie tylko ok. 5,5 raza dalej.',
  );
  expect(messages['scaleNotice.point3.title']).toBe('Planety są powiększone.');
  expect(messages['scaleNotice.point3.body']).toBe(
    'Jowisz jest naprawdę ok. 11 razy szerszy od Ziemi, a w aplikacji tylko ok. 2,6 raza.',
  );
  expect(messages['scaleNotice.point4.title']).toBe(
    'Prawdziwe proporcje są na karcie.',
  );
  expect(messages['scaleNotice.point4.body']).toBe(
    'Miernik średnicy na karcie planety pokazuje jej rozmiar względem Ziemi bez upiększeń.',
  );
});

test('scaleNotice › no paragraph keys left', () => {
  const keys = Object.keys(messages).filter((key) =>
    key.startsWith('scaleNotice.'),
  );
  expect(keys.filter((key) => key.includes('paragraph'))).toEqual([]);
  for (const point of [1, 2, 3, 4]) {
    expect(keys).toContain(`scaleNotice.point${point}.title`);
    expect(keys).toContain(`scaleNotice.point${point}.body`);
  }
  expect(keys).not.toContain('scaleNotice.point5.title');
});

// The real-world numbers from bodies.json (NASA/JPL). The on-screen ratios
// (5,5 and 2,6) need the scale functions: tests/integration/scaleNotice.test.ts.
test('scaleNotice › numbers match the data', () => {
  const sunKm = getBody('sun').radiusKm;
  const earthKm = getBody('earth').radiusKm;
  const jupiterKm = getBody('jupiter').radiusKm;
  const neptune = getBody('neptune');
  const neptuneAu =
    neptune.type === 'planet' ? neptune.orbit?.semiMajorAxisAu : undefined;

  // The ball is the Earth's diameter, so its scale is 0.24 m / (2 × 6371 km).
  const sunDiameterM = (BALL_M * sunKm) / earthKm;
  expect(sunDiameterM).toBeCloseTo(26.2, 1);
  expect(Math.round(sunDiameterM)).toBe(26);

  const sunDistanceM = (BALL_M * AU_KM) / (2 * earthKm);
  expect(Math.round(sunDistanceM)).toBe(2818);
  expect((sunDistanceM / 1000).toFixed(1)).toBe('2.8');

  expect(jupiterKm / earthKm).toBeCloseTo(10.97, 2);
  expect(Math.round(jupiterKm / earthKm)).toBe(11);

  // The on-screen ratios computed in tests/integration/scaleNotice.test.ts.
  expect(messages['scaleNotice.point2.body']).toContain('ok. 5,5 raza');
  expect(messages['scaleNotice.point3.body']).toContain('ok. 2,6 raza');

  expect(neptuneAu).toBeCloseTo(30.07, 2);
  expect(Math.round(neptuneAu ?? 0)).toBe(30);
});
