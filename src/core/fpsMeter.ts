const CAPACITY = 512;

export type FpsMeter = {
  tick(nowMs: number): void;
  readonly fps: number;
};

export function createFpsMeter(windowSeconds = 2): FpsMeter {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError(
      `createFpsMeter: parametr „windowSeconds” musi być skończony i > 0, otrzymano ${windowSeconds}`,
    );
  }

  const times = new Float64Array(CAPACITY);
  const windowMs = windowSeconds * 1000;
  let count = 0;
  let head = 0;
  let fps = 0;

  return {
    tick(nowMs: number) {
      if (!Number.isFinite(nowMs)) {
        throw new RangeError(
          `createFpsMeter: parametr „nowMs” musi być skończony, otrzymano ${nowMs}`,
        );
      }

      if (count > 0) {
        const lastIndex = (head - 1 + CAPACITY) % CAPACITY;
        const last = times[lastIndex] ?? 0;
        if (nowMs < last) {
          throw new RangeError(
            `createFpsMeter: parametr „nowMs” nie może być wcześniejszy niż poprzedni, otrzymano ${nowMs}`,
          );
        }
      }

      times[head] = nowMs;
      head = (head + 1) % CAPACITY;
      if (count < CAPACITY) {
        count += 1;
      }

      while (count > 0) {
        const oldestIndex = (head - count + CAPACITY) % CAPACITY;
        const oldest = times[oldestIndex] ?? 0;
        if (nowMs - oldest <= windowMs) {
          break;
        }
        count -= 1;
      }

      fps = framesPerSecond(times, head, count);
    },
    get fps() {
      return fps;
    },
  };
}

function framesPerSecond(
  times: Float64Array,
  head: number,
  count: number,
): number {
  if (count < 2) {
    return 0;
  }

  const first = times[(head - count + CAPACITY) % CAPACITY] ?? 0;
  const last = times[(head - 1 + CAPACITY) % CAPACITY] ?? 0;
  const span = last - first;
  if (span < 1000) {
    return 0;
  }

  return (count - 1) / (span / 1000);
}
