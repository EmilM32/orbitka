export interface SpeedPreset {
  id: string;
  label: string;
  daysPerSecond: number;
}

export const SPEED_PRESETS: readonly SpeedPreset[] = [
  { id: 'pause', label: 'Pause', daysPerSecond: 0 },
  { id: 'day', label: '1 day/s', daysPerSecond: 1 },
  { id: 'ten-days', label: '10 days/s', daysPerSecond: 10 },
  { id: 'month', label: '1 month/s', daysPerSecond: 30.4375 },
  { id: 'year', label: '1 year/s', daysPerSecond: 365.25 },
];

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 3652.5;
export const DAYS_LIMIT = 3_652_500;
export const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
export const MS_PER_DAY = 86_400_000;

const PRESET_IDS = SPEED_PRESETS.map((preset) => preset.id).join(', ');
const PRESET_MATCH = 1e-9;

export type ClockState = {
  days: number;
  speed: number;
  reversed: boolean;
  paused: boolean;
  presetId: string | null;
};

export type ClockOptions = {
  startDays?: number;
  speed?: number;
  maxDtSeconds?: number;
  uiIntervalMs?: number;
  nowMs?: () => number;
};

export type Clock = {
  readonly days: number;
  readonly speed: number;
  readonly reversed: boolean;
  readonly paused: boolean;
  readonly daysPerSecond: number;
  tick(dtSeconds: number): void;
  setDays(days: number): void;
  setSpeed(daysPerSecond: number): void;
  setReversed(reversed: boolean): void;
  pause(): void;
  resume(): void;
  togglePause(): void;
  applyPreset(id: string): void;
  subscribe(listener: (state: ClockState) => void): () => void;
};

type Subscription = {
  listener: (state: ClockState) => void;
};

function optionError(
  name: string,
  requirement: string,
  value: number,
): RangeError {
  return new RangeError(
    `createClock: parameter "${name}" ${requirement}, got ${value}`,
  );
}

export function createClock(options: ClockOptions = {}): Clock {
  const startDays = options.startDays ?? 0;
  const initialSpeed = options.speed ?? 1;
  const maxDtSeconds = options.maxDtSeconds ?? 0.1;
  const uiIntervalMs = options.uiIntervalMs ?? 100;
  const nowMs = options.nowMs ?? (() => performance.now());

  if (
    !Number.isFinite(startDays) ||
    startDays < -DAYS_LIMIT ||
    startDays > DAYS_LIMIT
  ) {
    throw optionError(
      'startDays',
      `must be finite and within ±${DAYS_LIMIT}`,
      startDays,
    );
  }

  if (
    !Number.isFinite(initialSpeed) ||
    initialSpeed < SPEED_MIN ||
    initialSpeed > SPEED_MAX
  ) {
    throw optionError(
      'speed',
      `must be finite and within [${SPEED_MIN}, ${SPEED_MAX}]`,
      initialSpeed,
    );
  }

  if (!Number.isFinite(maxDtSeconds) || maxDtSeconds <= 0) {
    throw optionError('maxDtSeconds', 'must be finite and > 0', maxDtSeconds);
  }

  if (!Number.isFinite(uiIntervalMs) || uiIntervalMs < 0) {
    throw optionError('uiIntervalMs', 'must be finite and >= 0', uiIntervalMs);
  }

  let days = startDays;
  let speed = initialSpeed;
  let reversed = false;
  let paused = false;
  let previousNowMs: number | null = null;
  let lastNotifyMs = Number.NEGATIVE_INFINITY;
  const listeners: Subscription[] = [];

  const signedRate = (): number => {
    if (paused) {
      return 0;
    }
    return reversed ? -speed : speed;
  };

  const presetId = (): string | null => {
    if (paused) {
      return 'pause';
    }

    for (const preset of SPEED_PRESETS) {
      if (preset.id === 'pause') {
        continue;
      }
      if (Math.abs(speed - preset.daysPerSecond) <= PRESET_MATCH) {
        return preset.id;
      }
    }

    return null;
  };

  const snapshot = (): ClockState => ({
    days,
    speed,
    reversed,
    paused,
    presetId: presetId(),
  });

  const remove = (entry: Subscription): void => {
    const index = listeners.indexOf(entry);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };

  const notify = (): void => {
    if (listeners.length === 0) {
      return;
    }

    const state = snapshot();
    const current = listeners.slice();
    for (const entry of current) {
      entry.listener(state);
    }
  };

  const readNow = (): number => {
    const now = nowMs();
    if (!Number.isFinite(now)) {
      throw new RangeError(
        `tick: parameter "nowMs" must be finite, got ${now}`,
      );
    }
    if (previousNowMs !== null && now < previousNowMs) {
      throw new RangeError(
        `tick: parameter "nowMs" must not be earlier than the previous value, got ${now}`,
      );
    }
    previousNowMs = now;
    return now;
  };

  const clampDt = (dtSeconds: number): number => {
    if (dtSeconds === Number.POSITIVE_INFINITY) {
      return maxDtSeconds;
    }
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
      return 0;
    }
    return Math.min(dtSeconds, maxDtSeconds);
  };

  return {
    get days() {
      return days;
    },
    get speed() {
      return speed;
    },
    get reversed() {
      return reversed;
    },
    get paused() {
      return paused;
    },
    get daysPerSecond() {
      return signedRate();
    },
    tick(dtSeconds: number) {
      const now = readNow();
      const dt = clampDt(dtSeconds);
      const rate = signedRate();
      let crossed = false;

      if (dt !== 0 && rate !== 0) {
        const next = days + dt * rate;
        if (next > DAYS_LIMIT) {
          days = DAYS_LIMIT;
          paused = true;
          crossed = true;
        } else if (next < -DAYS_LIMIT) {
          days = -DAYS_LIMIT;
          paused = true;
          crossed = true;
        } else {
          days = next;
        }
      }

      if (crossed || now - lastNotifyMs >= uiIntervalMs) {
        lastNotifyMs = now;
        notify();
      }
    },
    setDays(next: number) {
      if (!Number.isFinite(next) || next < -DAYS_LIMIT || next > DAYS_LIMIT) {
        throw new RangeError(
          `setDays: parameter "days" must be finite and within ±${DAYS_LIMIT}, got ${next}`,
        );
      }
      days = next;
      notify();
    },
    setSpeed(daysPerSecond: number) {
      if (Number.isNaN(daysPerSecond)) {
        return;
      }

      speed = Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.abs(daysPerSecond)));
      notify();
    },
    setReversed(value: boolean) {
      reversed = value;
      notify();
    },
    pause() {
      paused = true;
      notify();
    },
    resume() {
      paused = false;
      notify();
    },
    togglePause() {
      paused = !paused;
      notify();
    },
    applyPreset(id: string) {
      const preset = SPEED_PRESETS.find((item) => item.id === id);
      if (preset === undefined) {
        throw new RangeError(
          `applyPreset: parameter "id" must be one of: ${PRESET_IDS}, got ${id}`,
        );
      }

      if (preset.id === 'pause') {
        paused = true;
      } else {
        speed = preset.daysPerSecond;
        paused = false;
      }
      notify();
    },
    subscribe(listener: (state: ClockState) => void) {
      const entry: Subscription = { listener };
      // Registered before the first call, so a nested notification from inside
      // it reaches the new listener too.
      listeners.push(entry);
      try {
        listener(snapshot());
      } catch (error) {
        remove(entry);
        throw error;
      }
      let active = true;
      return () => {
        if (!active) {
          return;
        }
        active = false;
        remove(entry);
      };
    },
  };
}

export function daysToUtcDate(days: number): Date {
  if (!Number.isFinite(days) || days < -DAYS_LIMIT || days > DAYS_LIMIT) {
    throw new RangeError(
      `daysToUtcDate: parameter "days" must be finite and within ±${DAYS_LIMIT}, got ${days}`,
    );
  }

  return new Date(J2000_UTC_MS + days * MS_PER_DAY);
}

export function daysFromDate(date: Date): number {
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new RangeError(
      `daysFromDate: parameter "date" must be a valid date, got ${date.toString()}`,
    );
  }

  return (time - J2000_UTC_MS) / MS_PER_DAY;
}
