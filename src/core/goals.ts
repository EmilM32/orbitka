// The goal engine (ADR-011): a goal is a list of steps, each with one
// condition, that the student completes by using the app. The "Trening pilota"
// is the first goal; missions (M5) are the next. Pure: no DOM, no three. The
// app turns what the user does into `GoalEvent`s; programmatic movement (a
// camera flight, the intro) never produces one, so it cannot complete a step.

/** What a step waits for. Data only, so a goal can live in JSON. */
export type GoalCondition =
  /** Camera rotation by the user: summed |Δazimuth| + |Δpolar|, in degrees. */
  | { type: 'rotate'; degrees: number }
  /** Camera zoom by the user: summed |Δd| / d of the zoom steps. */
  | { type: 'zoom'; ratio: number }
  /** A body is selected: any body, or the one named. */
  | { type: 'select'; bodyId?: string };

export type GoalStepDef = {
  id: string;
  condition: GoalCondition;
};

export type GoalDef = {
  id: string;
  /**
   * `any`: the steps may be done in any order. `strict`: only the first
   * step that is not done counts, so they are done in the listed order.
   */
  order: 'any' | 'strict';
  steps: readonly GoalStepDef[];
};

/** What happened, in the user's terms. */
export type GoalEvent =
  | { kind: 'rotate'; deg: number }
  | { kind: 'zoom'; ratio: number }
  | { kind: 'select'; id: string };

export type GoalState = {
  /** Step id → done. */
  readonly done: Readonly<Record<string, boolean>>;
  /** The first step that is not done; null once the goal is finished. */
  readonly current: string | null;
  readonly finished: boolean;
};

export type GoalEngine = {
  readonly def: GoalDef;
  /** Called for every drag sample: it only adds up numbers, no allocation. */
  dispatch(event: GoalEvent): void;
  getState(): GoalState;
  /** Starts the goal over: nothing done, nothing summed. */
  reset(): void;
  subscribe(listener: (state: GoalState) => void): () => void;
};

// Two zoom steps of 0.075 must reach 0.15.
const SUM_EPSILON = 1e-9;

function requireAmount(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `goalEngine.dispatch: parameter "event.${name}" must be a finite number >= 0, got ${String(value)}`,
    );
  }
}

/** Throws RangeError when `def` cannot be run. */
export function validateGoalDef(def: GoalDef): void {
  if (def.steps.length === 0) {
    throw new RangeError(
      `validateGoalDef: goal "${def.id}" must have at least one step, got 0`,
    );
  }
  const seen = new Set<string>();
  for (const step of def.steps) {
    if (step.id === '' || seen.has(step.id)) {
      throw new RangeError(
        `validateGoalDef: goal "${def.id}" step ids must be non-empty and unique, got "${step.id}"`,
      );
    }
    seen.add(step.id);
    const condition = step.condition;
    if (condition.type === 'rotate') {
      if (!(condition.degrees > 0) || !Number.isFinite(condition.degrees)) {
        throw new RangeError(
          `validateGoalDef: step "${step.id}" rotate.degrees must be finite and > 0, got ${String(condition.degrees)}`,
        );
      }
    } else if (condition.type === 'zoom') {
      if (!(condition.ratio > 0) || !Number.isFinite(condition.ratio)) {
        throw new RangeError(
          `validateGoalDef: step "${step.id}" zoom.ratio must be finite and > 0, got ${String(condition.ratio)}`,
        );
      }
    } else if (condition.bodyId === '') {
      throw new RangeError(
        `validateGoalDef: step "${step.id}" select.bodyId must not be empty`,
      );
    }
  }
}

function snapshot(
  def: GoalDef,
  done: Readonly<Record<string, boolean>>,
): GoalState {
  const current = def.steps.find((step) => !done[step.id])?.id ?? null;
  return Object.freeze({
    done: Object.freeze({ ...done }),
    current,
    finished: current === null,
  });
}

export function createGoalEngine(def: GoalDef): GoalEngine {
  validateGoalDef(def);
  const done: Record<string, boolean> = {};
  const sums: number[] = [];
  for (const step of def.steps) {
    done[step.id] = false;
    sums.push(0);
  }
  const listeners: Array<(state: GoalState) => void> = [];
  let state = snapshot(def, done);

  function complete(index: number): void {
    const step = def.steps[index];
    if (step === undefined || done[step.id]) {
      return;
    }
    done[step.id] = true;
    state = snapshot(def, done);
    for (const listener of listeners.slice()) {
      listener(state);
    }
  }

  // Which steps a user action counts for: all of them, or only the current one.
  function counts(index: number): boolean {
    const step = def.steps[index];
    if (step === undefined || done[step.id]) {
      return false;
    }
    return def.order === 'any' || def.steps[index]?.id === state.current;
  }

  return {
    def,
    dispatch(event) {
      if (state.finished) {
        return;
      }
      if (event.kind === 'rotate') {
        requireAmount('deg', event.deg);
      } else if (event.kind === 'zoom') {
        requireAmount('ratio', event.ratio);
      }
      for (let index = 0; index < def.steps.length; index += 1) {
        const condition = def.steps[index]?.condition;
        if (condition === undefined || !counts(index)) {
          continue;
        }
        if (event.kind === 'rotate' && condition.type === 'rotate') {
          sums[index] = (sums[index] ?? 0) + event.deg;
          if ((sums[index] ?? 0) >= condition.degrees - SUM_EPSILON) {
            complete(index);
          }
        } else if (event.kind === 'zoom' && condition.type === 'zoom') {
          sums[index] = (sums[index] ?? 0) + event.ratio;
          if ((sums[index] ?? 0) >= condition.ratio - SUM_EPSILON) {
            complete(index);
          }
        } else if (
          event.kind === 'select' &&
          condition.type === 'select' &&
          (condition.bodyId === undefined || condition.bodyId === event.id)
        ) {
          complete(index);
        }
      }
    },
    getState() {
      return state;
    },
    reset() {
      for (let index = 0; index < def.steps.length; index += 1) {
        const step = def.steps[index];
        if (step !== undefined) {
          done[step.id] = false;
        }
        sums[index] = 0;
      }
      state = snapshot(def, done);
      for (const listener of listeners.slice()) {
        listener(state);
      }
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
