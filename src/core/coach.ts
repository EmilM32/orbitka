// "Trening pilota" (SPEC §5.10): three steps the student completes by using
// the controls, in any order. It is a goal of the goal engine (ADR-011); this
// file holds its definition and the small tracker the panel in src/ui reads.
// No DOM.

import {
  createGoalEngine,
  type GoalDef,
  type GoalEngine,
  type GoalState,
} from './goals.ts';

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
  /** The engine underneath, for the debug hook and the tests. */
  readonly engine: GoalEngine;
};

export const COACH_GOAL: GoalDef = {
  id: 'coach',
  order: 'any',
  steps: [
    { id: 'rotate', condition: { type: 'rotate', degrees: COACH_ROTATE_DEG } },
    { id: 'zoom', condition: { type: 'zoom', ratio: COACH_ZOOM_RATIO } },
    { id: 'select', condition: { type: 'select' } },
  ],
};

function requireAmount(name: 'deg' | 'ratio', value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `coach.onCameraInput: parameter "input.${name}" must be a finite number >= 0, got ${String(value)}`,
    );
  }
}

function toCoachState(state: GoalState): CoachState {
  const done = state.done;
  const current = COACH_STEPS.find((step) => done[step] !== true) ?? null;
  return Object.freeze({
    done: Object.freeze({
      rotate: done['rotate'] === true,
      zoom: done['zoom'] === true,
      select: done['select'] === true,
    }),
    current,
    finished: state.finished,
  });
}

export function createCoachTracker(): CoachTracker {
  const engine = createGoalEngine(COACH_GOAL);
  const listeners: Array<(state: CoachState) => void> = [];
  let state = toCoachState(engine.getState());

  engine.subscribe((next) => {
    state = toCoachState(next);
    for (const listener of listeners.slice()) {
      listener(state);
    }
  });

  return {
    engine,
    onCameraInput(input) {
      if (state.finished) {
        return;
      }
      if (input.kind === 'rotate') {
        requireAmount('deg', input.deg);
      } else {
        requireAmount('ratio', input.ratio);
      }
      engine.dispatch(input);
    },
    onSelected() {
      // The training counts any body.
      engine.dispatch({ kind: 'select', id: '' });
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
