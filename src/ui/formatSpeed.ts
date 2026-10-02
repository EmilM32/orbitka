import { type Dictionary, type I18n } from './i18n.ts';

// One Julian year. The boundary uses the speed before rounding, so 364.96
// stays in days and is then displayed as 365 days per second.
const YEAR_IN_DAYS = 365.25;

type AppI18n = I18n<Dictionary>;

function invalidSpeed(functionName: string, value: number): RangeError {
  return new RangeError(
    `${functionName}: parameter "speed" must be finite and > 0, got ${value}`,
  );
}

function assertSpeed(functionName: string, speed: number): void {
  if (!Number.isFinite(speed) || speed <= 0) {
    throw invalidSpeed(functionName, speed);
  }
}

function amount(speed: number, i18n: AppI18n): string {
  if (speed >= YEAR_IN_DAYS) {
    return i18n.plural('time.units.years', speed / YEAR_IN_DAYS);
  }

  return i18n.plural('time.units.days', speed);
}

export function formatSpeed(speed: number, i18n: AppI18n): string {
  assertSpeed('formatSpeed', speed);
  return i18n.t('time.speed.perSecond', { amount: amount(speed, i18n) });
}

export function formatSpeedSpoken(
  speed: number,
  reversed: boolean,
  paused: boolean,
  i18n: AppI18n,
): string {
  if (paused) {
    return i18n.t('time.status.paused');
  }

  assertSpeed('formatSpeedSpoken', speed);
  const spoken = i18n.t('time.speed.perSecondSpoken', {
    amount: amount(speed, i18n),
  });
  const key = reversed ? 'time.status.speedReversed' : 'time.status.speed';
  return i18n.t(key, { speed: spoken });
}
