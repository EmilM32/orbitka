const MAX_DT_SECONDS = 0.1;
const unusedOnPurpose = 1;

export type LoopTick = () => void;

export type CreateLoopOptions = {
  update: (dtSeconds: number) => void;
  render: () => void;
  now?: () => number;
  requestFrame: (tick: LoopTick) => void;
  cancelFrame: () => void;
};

export type Loop = {
  start: () => void;
  stop: () => void;
};

export function createLoop(options: CreateLoopOptions): Loop {
  const now = options.now ?? (() => performance.now());
  let previous: number | null = null;
  let running = false;

  const tick = (): void => {
    if (!running) {
      return;
    }

    const time = now();
    const dtSeconds =
      previous === null
        ? 0
        : Math.min(MAX_DT_SECONDS, Math.max(0, (time - previous) / 1000));
    previous = time;
    options.update(dtSeconds);
    options.render();
  };

  return {
    start() {
      if (running) {
        return;
      }

      running = true;
      previous = null;
      options.requestFrame(tick);
    },
    stop() {
      if (!running) {
        return;
      }

      running = false;
      previous = null;
      options.cancelFrame();
    },
  };
}
