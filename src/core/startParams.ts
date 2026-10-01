import { isDebugEnabled } from './debugFlag.ts';
import { DAYS_LIMIT } from './clock.ts';

function query(search: string): URLSearchParams {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(raw);
}

export function parseStartDays(search: string, fallbackDays: number): number {
  if (!Number.isFinite(fallbackDays) || Math.abs(fallbackDays) > DAYS_LIMIT) {
    throw new RangeError(
      `parseStartDays: parameter "fallbackDays" must be finite and within ±${DAYS_LIMIT}, got ${fallbackDays}`,
    );
  }

  if (!isDebugEnabled(search)) {
    return fallbackDays;
  }

  const raw = query(search).get('days');
  if (raw === null || raw.trim() === '') {
    return fallbackDays;
  }

  const days = Number(raw);
  if (!Number.isFinite(days) || Math.abs(days) > DAYS_LIMIT) {
    return fallbackDays;
  }

  return days;
}

export function isStartPaused(search: string): boolean {
  return isDebugEnabled(search) && query(search).get('paused') === '1';
}
