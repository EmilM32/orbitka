import type { Dictionary, I18n } from './i18n.ts';

// Astronomical year numbering: year 0 is 1 BCE. The calendar is the proleptic
// Gregorian calendar, the same rules JavaScript's Date uses.

const MISSING_DATE = '—';

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

// Year >= 0 is padded to 4 digits. A negative year keeps the minus on the
// year and pads the digits to 4. Years above 9999 stay full length.
function formatYear(year: number): string {
  const digits = pad(Math.abs(year), 4);
  return year < 0 ? `-${digits}` : digits;
}

function utcParts(date: Date): { day: string; month: string; year: number } {
  return {
    day: pad(date.getUTCDate(), 2),
    month: pad(date.getUTCMonth() + 1, 2),
    year: date.getUTCFullYear(),
  };
}

export function formatDate(date: Date): string {
  if (!isValidDate(date)) {
    return MISSING_DATE;
  }

  const parts = utcParts(date);
  return `${parts.day}.${parts.month}.${formatYear(parts.year)}`;
}

// HTML `datetime` requires a year from 1 through 9999.
export function formatDateTimeAttr(date: Date): string | null {
  if (!isValidDate(date)) {
    return null;
  }

  const parts = utcParts(date);
  if (parts.year < 1 || parts.year > 9999) {
    return null;
  }

  return `${formatYear(parts.year)}-${parts.month}-${parts.day}`;
}

// Intl gives the month name in the genitive (as in a full date) only together
// with the day, so the day and the month are formatted as a pair.
const DAY_MONTH = new Intl.DateTimeFormat('pl', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Day, month name and year, e.g. 14 October 2026 in Polish. Years before 1 CE use the astronomical number
 * minus one and the "p.n.e." suffix from the dictionary (year 0 is 1 BCE),
 * because `Intl` shows such years without an era.
 */
export function formatDateWords(date: Date, i18n: I18n<Dictionary>): string {
  if (!isValidDate(date)) {
    return MISSING_DATE;
  }

  const parts = utcParts(date);
  const reference = new Date(0);
  reference.setUTCFullYear(2000, date.getUTCMonth(), date.getUTCDate());
  const dayMonth = DAY_MONTH.format(reference);
  if (parts.year >= 1) {
    return `${dayMonth} ${parts.year}`;
  }

  const [day = '', ...month] = dayMonth.split(' ');
  return i18n.t('time.date.bce', {
    day,
    month: month.join(' '),
    year: 1 - parts.year,
  });
}
