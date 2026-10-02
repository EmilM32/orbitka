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
