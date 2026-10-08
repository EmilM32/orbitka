import {
  DAY_IN_HOURS_BELOW,
  splitHours,
  YEAR_IN_DAYS_BELOW,
  type BodyFacts,
} from '@core/bodyFacts.ts';

import { type Dictionary, type I18n } from './i18n.ts';

type AppI18n = I18n<Dictionary>;

const HOURS_PER_DAY = 24;

/**
 * "88 dni" below one Earth year, otherwise years to 0.1 ("11,9 roku",
 * "1 rok"). Null when the body has no year (the Sun, the Moon).
 */
export function formatYear(
  facts: BodyFacts,
  periodDays: number | null,
  i18n: AppI18n,
): string | null {
  if (facts.yearEarthYears === null) {
    return null;
  }
  if (facts.yearEarthYears < YEAR_IN_DAYS_BELOW) {
    if (
      periodDays === null ||
      !Number.isFinite(periodDays) ||
      periodDays <= 0
    ) {
      throw new RangeError(
        `formatYear: parameter "periodDays" must be a finite number > 0, got ${String(periodDays)}`,
      );
    }
    return i18n.plural('time.units.days', Math.round(periodDays));
  }
  return i18n.plural('time.units.years', facts.yearEarthYears);
}

/** "9 h 56 min" below DAY_IN_HOURS_BELOW, otherwise Earth days to 0.1. */
export function formatDay(dayHours: number, i18n: AppI18n): string {
  if (dayHours < DAY_IN_HOURS_BELOW) {
    const { hours, minutes } = splitHours(dayHours);
    return i18n.t('card.facts.hoursMinutes', { hours, minutes });
  }
  return i18n.plural('card.facts.days', dayHours / HOURS_PER_DAY);
}
