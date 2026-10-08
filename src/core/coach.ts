// "Trening pilota" (SPEC §5.10): three steps the student completes by using
// the controls, in any order. No DOM; the panel in src/ui shows the state.

export const COACH_ROTATE_DEG = 15;
export const COACH_ZOOM_RATIO = 0.15;
export const COACH_STEPS = ['rotate', 'zoom', 'select'] as const;
// "Gotowe!" stays this long between its 220 ms entrance and 420 ms exit.
export const COACH_TOAST_HOLD_MS = 3000;

export type CoachStep = (typeof COACH_STEPS)[number];

export type CameraUserInput =
  { kind: 'rotate'; deg: number } | { kind: 'zoom'; ratio: number };

export type CoachState = {
  readonly done: Readonly<Record<CoachStep, boolean>>;
  readonly current: CoachStep | null;
  readonly finished: boolean;
};

export type CoachTracker = {
  /** rotate: |Δazimuth| + |Δpolar| in degrees; zoom: |Δd| / d of one step. */
  onCameraInput(input: CameraUserInput): void;
  onSelected(): void;
  getState(): CoachState;
  subscribe(listener: (state: CoachState) => void): () => void;
};

function requireAmount(name: 'deg' | 'ratio', value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `coach.onCameraInput: parameter "input.${name}" must be a finite number >= 0, got ${String(value)}`,
    );
  }
}

function snapshot(done: Record<CoachStep, boolean>): CoachState {
  const current = COACH_STEPS.find((step) => !done[step]) ?? null;
  return Object.freeze({
    done: Object.freeze({ ...done }),
    current,
    finished: current === null,
  });
}

export function createCoachTracker(): CoachTracker {
  const done: Record<CoachStep, boolean> = {
    rotate: false,
    zoom: false,
    select: false,
  };
  const listeners: Array<(state: CoachState) => void> = [];
  let rotatedDeg = 0;
  let zoomRatio = 0;
  let state = snapshot(done);

  function complete(step: CoachStep): void {
    if (done[step]) {
      return;
    }
    done[step] = true;
    state = snapshot(done);
    for (const listener of listeners.slice()) {
      listener(state);
    }
  }

  return {
    onCameraInput(input) {
      if (state.finished) {
        return;
      }
      // Sums only: called for every drag sample, so nothing is allocated.
      if (input.kind === 'rotate') {
        requireAmount('deg', input.deg);
        rotatedDeg += input.deg;
        if (rotatedDeg >= COACH_ROTATE_DEG) {
          complete('rotate');
        }
        return;
      }
      requireAmount('ratio', input.ratio);
      zoomRatio += input.ratio;
      // A small epsilon: two steps of 0.075 must reach 0.15.
      if (zoomRatio >= COACH_ZOOM_RATIO - 1e-9) {
        complete('zoom');
      }
    },
    onSelected() {
      if (!state.finished) {
        complete('select');
      }
    },
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
  };
}
