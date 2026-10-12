import { expect, test, vi } from 'vitest';

import {
  createGoalEngine,
  validateGoalDef,
  type GoalDef,
  type GoalState,
} from '@core/goals.ts';

const ANY: GoalDef = {
  id: 'any',
  order: 'any',
  steps: [
    { id: 'turn', condition: { type: 'rotate', degrees: 15 } },
    { id: 'near', condition: { type: 'zoom', ratio: 0.15 } },
    { id: 'pick', condition: { type: 'select' } },
  ],
};

const STRICT: GoalDef = { ...ANY, id: 'strict', order: 'strict' };

const JUPITER: GoalDef = {
  id: 'jupiter',
  order: 'any',
  steps: [{ id: 'pick', condition: { type: 'select', bodyId: 'jupiter' } }],
};

function doneIds(state: GoalState): string[] {
  return Object.entries(state.done)
    .filter(([, value]) => value)
    .map(([id]) => id);
}

test('a new goal has nothing done and the first step current', () => {
  const state = createGoalEngine(ANY).getState();
  expect(doneIds(state)).toEqual([]);
  expect(state.current).toBe('turn');
  expect(state.finished).toBe(false);
});

test.each([
  ['rotate', [{ kind: 'rotate', deg: 14.9 }], []],
  ['rotate at the threshold', [{ kind: 'rotate', deg: 15 }], ['turn']],
  [
    'rotate in drag samples',
    [
      { kind: 'rotate', deg: 5 },
      { kind: 'rotate', deg: 5 },
      { kind: 'rotate', deg: 5 },
    ],
    ['turn'],
  ],
  ['zoom below', [{ kind: 'zoom', ratio: 0.1 }], []],
  [
    'two zoom steps of 0.075',
    [
      { kind: 'zoom', ratio: 0.075 },
      { kind: 'zoom', ratio: 0.075 },
    ],
    ['near'],
  ],
  ['any selection', [{ kind: 'select', id: 'mars' }], ['pick']],
  [
    'rotation does not count as zoom or the other way round',
    [
      { kind: 'rotate', deg: 5 },
      { kind: 'zoom', ratio: 0.05 },
    ],
    [],
  ],
] as const)('any order › %s', (_name, events, expected) => {
  const engine = createGoalEngine(ANY);
  for (const event of events) {
    engine.dispatch(event);
  }
  expect(doneIds(engine.getState())).toEqual([...expected]);
});

test('any order › the steps are done in any order and the goal finishes', () => {
  const engine = createGoalEngine(ANY);
  engine.dispatch({ kind: 'select', id: 'earth' });
  expect(engine.getState().current).toBe('turn');
  engine.dispatch({ kind: 'zoom', ratio: 0.2 });
  engine.dispatch({ kind: 'rotate', deg: 20 });
  const state = engine.getState();
  expect(state.finished).toBe(true);
  expect(state.current).toBeNull();
  expect(doneIds(state)).toEqual(['turn', 'near', 'pick']);
});

test('strict order › only the current step counts', () => {
  const engine = createGoalEngine(STRICT);
  // A selection and a zoom before the rotation count for nothing.
  engine.dispatch({ kind: 'select', id: 'earth' });
  engine.dispatch({ kind: 'zoom', ratio: 1 });
  expect(doneIds(engine.getState())).toEqual([]);
  engine.dispatch({ kind: 'rotate', deg: 15 });
  expect(engine.getState().current).toBe('near');
  // The earlier selection was not remembered.
  engine.dispatch({ kind: 'select', id: 'earth' });
  expect(doneIds(engine.getState())).toEqual(['turn']);
  engine.dispatch({ kind: 'zoom', ratio: 0.15 });
  expect(engine.getState().current).toBe('pick');
  engine.dispatch({ kind: 'select', id: 'earth' });
  expect(engine.getState().finished).toBe(true);
});

test('strict order › amounts before a step is current are not summed', () => {
  const engine = createGoalEngine(STRICT);
  engine.dispatch({ kind: 'zoom', ratio: 0.14 });
  engine.dispatch({ kind: 'rotate', deg: 15 });
  engine.dispatch({ kind: 'zoom', ratio: 0.02 });
  // 0.14 earlier does not add to 0.02.
  expect(engine.getState().current).toBe('near');
});

test('select a named body', () => {
  const engine = createGoalEngine(JUPITER);
  engine.dispatch({ kind: 'select', id: 'saturn' });
  expect(engine.getState().finished).toBe(false);
  engine.dispatch({ kind: 'select', id: 'jupiter' });
  expect(engine.getState().finished).toBe(true);
});

test('a finished goal ignores events, even invalid ones', () => {
  const engine = createGoalEngine(JUPITER);
  engine.dispatch({ kind: 'select', id: 'jupiter' });
  const state = engine.getState();
  expect(() => {
    engine.dispatch({ kind: 'rotate', deg: Number.NaN });
  }).not.toThrow();
  expect(engine.getState()).toBe(state);
});

test('subscribers hear each completed step once; unsubscribe stops it', () => {
  const engine = createGoalEngine(ANY);
  const listener = vi.fn<(state: GoalState) => void>();
  const unsubscribe = engine.subscribe(listener);
  engine.dispatch({ kind: 'rotate', deg: 10 });
  expect(listener).not.toHaveBeenCalled();
  engine.dispatch({ kind: 'rotate', deg: 10 });
  engine.dispatch({ kind: 'rotate', deg: 10 });
  expect(listener).toHaveBeenCalledTimes(1);
  expect(doneIds(listener.mock.calls[0]?.[0] as GoalState)).toEqual(['turn']);
  unsubscribe();
  unsubscribe();
  engine.dispatch({ kind: 'select', id: 'mars' });
  expect(listener).toHaveBeenCalledTimes(1);
});

test('the state is frozen and only replaced when a step is done', () => {
  const engine = createGoalEngine(ANY);
  const first = engine.getState();
  expect(Object.isFrozen(first)).toBe(true);
  expect(Object.isFrozen(first.done)).toBe(true);
  engine.dispatch({ kind: 'rotate', deg: 5 });
  expect(engine.getState()).toBe(first);
  engine.dispatch({ kind: 'select', id: 'mars' });
  expect(engine.getState()).not.toBe(first);
});

test('reset starts over: nothing done, nothing summed', () => {
  const engine = createGoalEngine(ANY);
  const listener = vi.fn();
  engine.subscribe(listener);
  engine.dispatch({ kind: 'rotate', deg: 10 });
  engine.dispatch({ kind: 'select', id: 'mars' });
  listener.mockClear();
  engine.reset();
  expect(doneIds(engine.getState())).toEqual([]);
  expect(listener).toHaveBeenCalledTimes(1);
  // The 10° from before is gone.
  engine.dispatch({ kind: 'rotate', deg: 10 });
  expect(doneIds(engine.getState())).toEqual([]);
  engine.dispatch({ kind: 'rotate', deg: 5 });
  expect(doneIds(engine.getState())).toEqual(['turn']);
});

test.each([
  [{ kind: 'rotate', deg: -1 }],
  [{ kind: 'rotate', deg: Number.NaN }],
  [{ kind: 'rotate', deg: Number.POSITIVE_INFINITY }],
  [{ kind: 'zoom', ratio: -0.1 }],
  [{ kind: 'zoom', ratio: Number.NaN }],
] as const)('invalid amount %j throws RangeError', (event) => {
  expect(() => {
    createGoalEngine(ANY).dispatch(event);
  }).toThrow(RangeError);
});

test('validateGoalDef › bad definitions', () => {
  expect(() => {
    validateGoalDef({ id: 'x', order: 'any', steps: [] });
  }).toThrow('at least one step');
  expect(() => {
    validateGoalDef({
      id: 'x',
      order: 'any',
      steps: [
        { id: 'a', condition: { type: 'select' } },
        { id: 'a', condition: { type: 'select' } },
      ],
    });
  }).toThrow('unique');
  expect(() => {
    validateGoalDef({
      id: 'x',
      order: 'any',
      steps: [{ id: '', condition: { type: 'select' } }],
    });
  }).toThrow(RangeError);
  for (const condition of [
    { type: 'rotate', degrees: 0 },
    { type: 'rotate', degrees: Number.NaN },
    { type: 'zoom', ratio: -1 },
    { type: 'zoom', ratio: Number.POSITIVE_INFINITY },
    { type: 'select', bodyId: '' },
  ] as const) {
    expect(() => {
      createGoalEngine({
        id: 'x',
        order: 'any',
        steps: [{ id: 'a', condition }],
      });
    }, JSON.stringify(condition)).toThrow(RangeError);
  }
  expect(() => {
    validateGoalDef(ANY);
  }).not.toThrow();
});

test('the dispatch of a drag sample does not allocate state objects', () => {
  const engine = createGoalEngine(ANY);
  const state = engine.getState();
  for (let index = 0; index < 1000; index += 1) {
    engine.dispatch({ kind: 'rotate', deg: 0.001 });
  }
  expect(engine.getState()).toBe(state);
});
