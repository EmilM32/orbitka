// The view a link can carry (EMI-246, EMI-263): a body, a date, a speed, and
// whether the interior cutaway is open. A teacher copies the link from the
// settings menu and sends it to the class. Pure: the app reads
// `location.search`, passes the selectable ids and the interior ids, and
// applies the result.

import {
  DAYS_LIMIT,
  SPEED_PRESETS,
  daysFromDate,
  daysToUtcDate,
} from './clock.ts';

export type ViewParams = {
  /** A selectable body id, or null. */
  bodyId: string | null;
  /** Days since J2000 for the date, or null. */
  days: number | null;
  /** A speed preset id (never `pause`), or null. */
  presetId: string | null;
  paused: boolean;
  /** The interior cutaway is open for `bodyId`. */
  cutaway: boolean;
  /** Names of the parameters that were present but not usable. */
  ignored: readonly string[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

function query(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

// The calendar date at noon UTC, like the simulation epoch. A date that rolls
// over (2030-02-31) or lies outside the clock's range is not a date.
function parseDate(raw: string): number | null {
  const match = ISO_DATE.exec(raw);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Years from 1 CE, as `buildViewQuery` writes them.
  if (year < 1) {
    return null;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(12, 0, 0, 0);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  const days = daysFromDate(date);
  return Math.abs(days) <= DAYS_LIMIT ? days : null;
}

/**
 * Reads `body`, `date` (YYYY-MM-DD), `speed` (a preset id), `paused=1` and
 * `cutaway=1`. `cutaway` counts only when the body is selectable and listed
 * in `interiorIds`. Anything that does not fit is left out and listed in
 * `ignored`.
 */
export function parseViewParams(
  search: string,
  selectableIds: readonly string[],
  interiorIds: readonly string[] = [],
): ViewParams {
  const params = query(search);
  const ignored: string[] = [];

  let bodyId: string | null = null;
  const body = params.get('body');
  if (body !== null) {
    if (selectableIds.includes(body)) {
      bodyId = body;
    } else {
      ignored.push('body');
    }
  }

  let days: number | null = null;
  const date = params.get('date');
  if (date !== null) {
    days = parseDate(date);
    if (days === null) {
      ignored.push('date');
    }
  }

  let presetId: string | null = null;
  const speed = params.get('speed');
  if (speed !== null) {
    const preset = SPEED_PRESETS.find(
      (candidate) => candidate.id === speed && candidate.daysPerSecond > 0,
    );
    if (preset === undefined) {
      ignored.push('speed');
    } else {
      presetId = preset.id;
    }
  }

  const pausedValue = params.get('paused');
  const paused = pausedValue === '1';
  if (pausedValue !== null && !paused) {
    ignored.push('paused');
  }

  let cutaway = false;
  const cutawayValue = params.get('cutaway');
  if (cutawayValue !== null) {
    const knownInterior = bodyId !== null && interiorIds.includes(bodyId);
    if (cutawayValue === '1' && knownInterior) {
      cutaway = true;
    } else {
      ignored.push('cutaway');
    }
  }

  return { bodyId, days, presetId, paused, cutaway, ignored };
}

export type ViewState = {
  bodyId: string | null;
  days: number;
  paused: boolean;
  /** The active speed preset id, or null when the speed is custom. */
  presetId: string | null;
  /** Open the interior cutaway. Omitted from the link when there is no body. */
  cutaway: boolean;
};

// The date as YYYY-MM-DD, only for the years 1 through 9999 that the format
// (and `parseViewParams`) can carry.
function isoDate(days: number): string | null {
  if (!Number.isFinite(days) || Math.abs(days) > DAYS_LIMIT) {
    return null;
  }
  const date = daysToUtcDate(days);
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) {
    return null;
  }
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${month}-${day}`;
}

/** The query string (no `?`) for a link to `state`. */
export function buildViewQuery(state: ViewState): string {
  const params = new URLSearchParams();
  if (state.bodyId !== null) {
    params.set('body', state.bodyId);
  }
  const date = isoDate(state.days);
  if (date !== null) {
    params.set('date', date);
  }
  if (state.paused) {
    params.set('paused', '1');
  } else if (
    state.presetId !== null &&
    SPEED_PRESETS.some(
      (preset) => preset.id === state.presetId && preset.daysPerSecond > 0,
    )
  ) {
    params.set('speed', state.presetId);
  }
  if (state.cutaway && state.bodyId !== null) {
    params.set('cutaway', '1');
  }
  return params.toString();
}
