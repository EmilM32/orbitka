import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };

const messages: Record<string, unknown> = pl;

const PARAGRAPHS = [
  'scaleNotice.paragraph1',
  'scaleNotice.paragraph2',
  'scaleNotice.paragraph3',
  'scaleNotice.paragraph4',
  'scaleNotice.paragraph5',
] as const;

test('scaleNotice › texts', () => {
  expect(messages['scaleNotice.why']).toBe('Dlaczego?');
  expect(messages['scaleNotice.badge']).toBe(
    'Skala uproszczona: odległości i rozmiary nie są w proporcji',
  );
  expect(messages['scaleNotice.buttonLabel']).toBe(
    'Pokaż wyjaśnienie, dlaczego skala jest uproszczona',
  );
  expect(messages['scaleNotice.title']).toBe(
    'Dlaczego skala jest uproszczona?',
  );
  expect(messages['scaleNotice.closeLabel']).toBe('Zamknij');
  expect(messages['scaleNotice.paragraph1']).toBe(
    'Gdyby Układ Słoneczny narysować w prawdziwej skali, planety byłyby mniejsze niż pojedynczy piksel, a Słońce zasłaniałoby orbity najbliższych planet.',
  );
  expect(messages['scaleNotice.paragraph2']).toBe(
    'Dlatego w Orbitce odległości od Słońca są „ściśnięte”: Neptun jest w rzeczywistości ok. 30 razy dalej od Słońca niż Ziemia, a na ekranie tylko około 5,5 razy dalej. Merkury jest w rzeczywistości ok. 2,6 razy bliżej Słońca niż Ziemia, a na ekranie około 1,6 razy bliżej.',
  );
  expect(messages['scaleNotice.paragraph3']).toBe(
    'Rozmiary planet też są zmienione: małe planety są powiększone, żeby było je widać, a różnice między planetami są mniejsze. Jowisz jest naprawdę ponad 10 razy szerszy od Ziemi, a tu tylko około 2,6 razy szerszy.',
  );
  expect(messages['scaleNotice.paragraph4']).toBe(
    'Księżyce krążą znacznie bliżej swoich planet niż w rzeczywistości, żeby nie zlewały się z planetą. Ich rozmiary też są dobrane tak, żeby księżyce nie wchodziły jeden w drugi.',
  );
  expect(messages['scaleNotice.paragraph5']).toBe(
    'Planety krążą po orbitach policzonych z danych NASA, ale w uproszczeniu (bez wzajemnego przyciągania planet), a czas płynie szybciej niż w rzeczywistości.',
  );

  const copy = Object.entries(messages)
    .filter(([key]) => key.startsWith('scaleNotice.'))
    .map(([, value]) => value)
    .join('\n');
  expect(copy).not.toContain('kompresja');
  expect(copy).not.toContain('pierwiastek');
  expect(copy).not.toContain('są widać');
});

test('scaleNotice › shape', () => {
  for (const key of PARAGRAPHS) {
    expect(messages[key]).toEqual(expect.any(String));
    expect(messages[key]).not.toBe('');
  }

  expect(messages['scaleNotice.paragraph6']).toBeUndefined();

  const label = String(messages['scaleNotice.buttonLabel']).toLowerCase();
  expect(label).toContain('wyjaśnienie');
  expect(label).toContain('dlaczego');
});
