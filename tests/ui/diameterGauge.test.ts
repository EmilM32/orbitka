// @vitest-environment jsdom

import { readFileSync } from 'node:fs';

import { expect, test } from 'vitest';

import pl from '@content/locales/pl.json' with { type: 'json' };
import { diameterGauge } from '@core/bodyFacts.ts';
import { getBody } from '@data/bodies.ts';
import { createDiameterGauge } from '@ui/diameterGauge.ts';
import { createI18n } from '@ui/i18n.ts';

const i18n = createI18n(pl, 'pl-PL');
const EARTH_KM = getBody('earth').radiusKm;
const CSS = readFileSync('src/ui/diameterGauge.css', 'utf8');
const TOKENS = readFileSync('src/ui/tokens.css', 'utf8');

function gauge(id: string): { element: HTMLElement; k: number } {
  const body = getBody(id);
  const k = body.radiusKm / EARTH_KM;
  return { element: createDiameterGauge(k, body, i18n), k };
}

function bar(element: HTMLElement, modifier: 'body' | 'earth'): HTMLElement {
  const found = element.querySelector<HTMLElement>(`.gauge-bar--${modifier}`);
  if (found === null) {
    throw new Error(`missing ${modifier} bar`);
  }
  return found;
}

function percent(value: number): string {
  return `${value * 100}%`;
}

test('Jupiter: approximate value, ticks and caption', () => {
  const { element, k } = gauge('jupiter');
  const fractions = diameterGauge(k);
  expect(element.getAttribute('role')).toBe('img');
  expect(element.getAttribute('aria-label')).toBe(
    'Średnica: Jowisz około 11 razy średnica Ziemi',
  );
  expect(element.querySelector('.gauge-value')?.textContent).toBe(
    'ok. 11 × Ziemia',
  );
  expect(bar(element, 'body').style.width).toBe(
    percent(fractions.bodyFraction),
  );
  expect(bar(element, 'earth').style.width).toBe(
    percent(fractions.earthFraction),
  );
  expect(bar(element, 'body').style.backgroundColor).toBe('rgb(210, 166, 121)');
  expect(bar(element, 'body').classList.contains('has-ticks')).toBe(true);
  expect(bar(element, 'body').style.getPropertyValue('--gauge-tick')).toBe(
    `${100 / k}%`,
  );
  expect(element.querySelector('.gauge-caption')?.textContent).toBe(
    'Na średnicy Jowisza zmieści się ok. 11 Ziem.',
  );
  expect(element.querySelector('.gauge-km')?.textContent).toBe(
    'Średnica: 139 800 km',
  );
  // The longer bar is drawn first.
  expect(
    element.querySelector('.gauge-row')?.classList.contains('gauge-row--body'),
  ).toBe(true);
});

test('Saturn and Uranus: plural forms of Earths', () => {
  const saturn = gauge('saturn').element;
  expect(saturn.querySelector('.gauge-value')?.textContent).toBe(
    '9,1 × Ziemia',
  );
  expect(saturn.getAttribute('aria-label')).toBe(
    'Średnica: Saturn około 9,1 razy średnica Ziemi',
  );
  expect(saturn.querySelector('.gauge-caption')?.textContent).toBe(
    'Na średnicy Saturna zmieści się ok. 9 Ziem.',
  );
  expect(
    gauge('uranus').element.querySelector('.gauge-caption')?.textContent,
  ).toBe('Na średnicy Urana zmieszczą się ok. 4 Ziemie.');
});

test('Mercury: the variant below 1', () => {
  const { element, k } = gauge('mercury');
  const fractions = diameterGauge(k);
  expect(element.getAttribute('aria-label')).toBe(
    'Średnica: Merkury to 0,38 średnicy Ziemi',
  );
  expect(element.querySelector('.gauge-value')?.textContent).toBe(
    '0,38 × Ziemia',
  );
  expect(bar(element, 'body').style.width).toBe(
    percent(fractions.bodyFraction),
  );
  expect(bar(element, 'earth').style.width).toBe('100%');
  expect(bar(element, 'body').classList.contains('has-ticks')).toBe(false);
  expect(element.querySelector('.gauge-caption')?.textContent).toBe(
    'Ziemia jest ok. 2,6 raza szersza od Merkurego.',
  );
  expect(
    element.querySelector('.gauge-row')?.classList.contains('gauge-row--earth'),
  ).toBe(true);
});

test('Earth, Moon and Sun', () => {
  const earth = gauge('earth').element;
  expect(earth.querySelector('.gauge-value')?.textContent).toBe('1 × Ziemia');
  expect(earth.querySelector('.gauge-caption')?.textContent).toBe(
    'Ziemia jest punktem odniesienia dla pozostałych planet.',
  );

  const moon = gauge('moon').element;
  expect(moon.querySelector('.gauge-value')?.textContent).toBe('0,27 × Ziemia');
  expect(moon.querySelector('.gauge-caption')?.textContent).toBe(
    'Ziemia jest ok. 3,7 raza szersza od Księżyca.',
  );

  const sun = gauge('sun').element;
  expect(sun.getAttribute('role')).toBeNull();
  expect(sun.querySelector('.gauge-bar')).toBeNull();
  expect(sun.querySelector('.gauge-value')?.textContent).toBe(
    'ok. 109 × Ziemia',
  );
  expect(sun.querySelector('.gauge-km')?.textContent).toMatch(
    /^Średnica: 1 391 400 km$/u,
  );
});

test('Earth bar color comes from the tokens', () => {
  expect(CSS).toMatch(
    /\.gauge-bar--earth\s*\{[^}]*background:\s*var\(--c-earth\);[^}]*var\(--c-earth-outline\)/u,
  );
  expect(TOKENS).toContain('--c-earth: #3a78c2;');
  expect(TOKENS).toContain('--c-earth-outline: #8fb8ea;');
  expect(CSS).toContain('background-size: var(--gauge-tick) 100%');
});
