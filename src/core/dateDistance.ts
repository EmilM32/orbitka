// Calendar distance between two dates for the time panel (in 3 years and 2
// months). Pure: no DOM, no clock. Whole UTC days, rounded down, at most
// two units (EMI-237).

export type DistanceUnit = 'years' | 'months' | 'days';

export type DistancePart = { unit: DistanceUnit; count: number };

export type DateDistance = {
  /** Where `to` lies relative to `from`. */
  direction: 'today' | 'past' | 'future';
  /** Empty for `today`; otherwise one or two parts, largest unit first. */
  parts: readonly DistancePart[];
};

type Ymd = { year: number; month: number; day: number };

function ymd(date: Date): Ymd {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

function compare(a: Ymd, b: Ymd): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

// Last day of the month before `month` (0-based) in `year`. Date.UTC would
// read years 0–99 as 1900–1999, so the year is set separately.
function daysInPreviousMonth(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

/**
 * Distance of `to` from `from` in calendar years, months and days. The
 * smaller date is subtracted from the larger one, so the distance is the same
 * in both directions; only `direction` differs.
 */
export function dateDistance(from: Date, to: Date): DateDistance {
  const a = ymd(from);
  const b = ymd(to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new RangeError('dateDistance: both dates must be valid');
  }

  const order = compare(b, a);
  if (order === 0) {
    return { direction: 'today', parts: [] };
  }

  const [low, high] = order > 0 ? [a, b] : [b, a];
  let years = high.year - low.year;
  let months = high.month - low.month;
  let days = high.day - low.day;
  if (days < 0) {
    months -= 1;
    days += daysInPreviousMonth(high.year, high.month);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: DistancePart[] = [];
  if (years > 0) {
    parts.push({ unit: 'years', count: years });
    if (months > 0) {
      parts.push({ unit: 'months', count: months });
    }
  } else if (months > 0) {
    parts.push({ unit: 'months', count: months });
    if (days > 0) {
      parts.push({ unit: 'days', count: days });
    }
  } else {
    parts.push({ unit: 'days', count: days });
  }

  return { direction: order > 0 ? 'future' : 'past', parts };
}
