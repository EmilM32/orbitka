import type { DateDistance, DistancePart } from '@core/dateDistance.ts';

import type { Dictionary, I18n } from './i18n.ts';

function formatPart(part: DistancePart, i18n: I18n<Dictionary>): string {
  switch (part.unit) {
    case 'years':
      return i18n.plural('time.units.years', part.count);
    case 'months':
      return i18n.plural('time.units.months', part.count);
    case 'days':
      return i18n.plural('time.units.days', part.count);
  }
}

/** Today, in N years and M months, or N months ago, as Polish text. */
export function formatDistance(
  distance: DateDistance,
  i18n: I18n<Dictionary>,
): string {
  const [first, second] = distance.parts;
  if (distance.direction === 'today' || first === undefined) {
    return i18n.t('time.distance.today');
  }

  const head = formatPart(first, i18n);
  const span =
    second === undefined
      ? head
      : i18n.t('time.distance.join', {
          first: head,
          second: formatPart(second, i18n),
        });
  return i18n.t(
    distance.direction === 'future'
      ? 'time.distance.future'
      : 'time.distance.past',
    { span },
  );
}
