import './diameterGauge.css';

import {
  diameterGauge,
  roundKm,
  roundRatio,
  type RoundedRatio,
} from '@core/bodyFacts.ts';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

/** Enough of a body for the gauge; the card's BodyCardBody fits it. */
export type GaugeBody = {
  id: string;
  type: string;
  radiusKm: number;
  visual: { color: string };
};

// From this ratio the caption counts whole Earths across the body.
const FITS_FROM = 1.5;

function ratioText(ratio: RoundedRatio, i18n: AppI18n): string {
  return ratio.approximate
    ? i18n.formatNumber(ratio.value, 0)
    : i18n.formatNumber(ratio.value, 2);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) {
    created.textContent = text;
  }
  return created;
}

function barRow(
  name: string,
  fraction: number,
  modifier: 'body' | 'earth',
  color: string | null,
  tickPercent: number | null,
): HTMLElement {
  const row = element('div', `gauge-row gauge-row--${modifier}`);
  const label = element('span', 'gauge-name', name);
  const track = element('div', 'gauge-track');
  const bar = element('div', `gauge-bar gauge-bar--${modifier}`);
  bar.style.width = `${fraction * 100}%`;
  if (color !== null) {
    bar.style.backgroundColor = color;
  }
  if (tickPercent !== null) {
    // One tick per Earth diameter (SPEC §5.7).
    bar.classList.add('has-ticks');
    bar.style.setProperty('--gauge-tick', `${tickPercent}%`);
  }
  track.append(bar);
  row.append(label, track);
  return row;
}

/**
 * Diameter of a body next to Earth's on one shared scale (SPEC §5.7), with
 * `k = radiusKm / earthRadiusKm`. The Sun gets the ratio as text, no bars.
 */
export function createDiameterGauge(
  k: number,
  body: GaugeBody,
  i18n: AppI18n,
): HTMLElement {
  const ratio = roundRatio(k);
  const fractions = diameterGauge(k);
  const name = i18n.t(`bodies.${body.id}.name`);
  const nameGen = i18n.t(`bodies.${body.id}.nameGenitive`);
  const valueText = ratioText(ratio, i18n);
  const gauge = element('div', 'gauge');

  const head = element('p', 'gauge-value');
  head.textContent = ratio.approximate
    ? i18n.t('card.gauge.valueApprox', { value: valueText })
    : i18n.t('card.gauge.value', { value: valueText });
  gauge.append(head);

  const km = element(
    'p',
    'gauge-km',
    i18n.t('card.gauge.km', {
      km: i18n.formatNumber(roundKm(2 * body.radiusKm), 0),
    }),
  );

  if (body.type === 'star') {
    gauge.classList.add('gauge--text');
    gauge.append(km);
    return gauge;
  }

  gauge.setAttribute('role', 'img');
  gauge.setAttribute(
    'aria-label',
    k >= 1
      ? i18n.t('card.gauge.ariaMore', { name, value: valueText })
      : i18n.t('card.gauge.ariaLess', { name, value: valueText }),
  );

  const earthName = i18n.t('bodies.earth.name');
  const bodyRow = barRow(
    name,
    fractions.bodyFraction,
    'body',
    body.visual.color,
    k >= 1 ? 100 / k : null,
  );
  const earthRow = barRow(
    earthName,
    fractions.earthFraction,
    'earth',
    null,
    null,
  );
  const rows = element('div', 'gauge-rows');
  // The longer bar comes first.
  if (k >= 1) {
    rows.append(bodyRow, earthRow);
  } else {
    rows.append(earthRow, bodyRow);
  }
  gauge.append(rows);

  let caption: string | null = null;
  if (body.id === 'earth') {
    caption = i18n.t('card.gauge.earth');
  } else if (k >= FITS_FROM) {
    caption = i18n.plural('card.gauge.fits', Math.round(k), { nameGen });
  } else if (ratio.inverse !== null) {
    caption = i18n.t('card.gauge.wider', {
      value: i18n.formatNumber(ratio.inverse, 1),
      nameGen,
    });
  }
  if (caption !== null) {
    gauge.append(element('p', 'gauge-caption', caption));
  }
  gauge.append(km);
  return gauge;
}
