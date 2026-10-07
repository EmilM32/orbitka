import { expect, test } from 'vitest';

import { createSelection, type SelectionEvent } from '@core/selection.ts';

const IDS = [
  'sun',
  'mercury',
  'venus',
  'earth',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

function message(functionName: string, id: string): string {
  return `${functionName}: parameter "id" must be one of the selectable body ids, got "${id}"`;
}

test('rejects unknown ids', () => {
  expect(() => createSelection([])).toThrow(RangeError);
  expect(() => createSelection([])).toThrow(
    'createSelection: parameter "ids" must contain at least one id, got 0',
  );

  const selection = createSelection(IDS);
  const seen: SelectionEvent[] = [];
  selection.subscribe((event) => {
    seen.push(event);
  });
  selection.select('earth');

  expect(() => selection.select('pluto')).toThrow(RangeError);
  expect(() => selection.select('pluto')).toThrow(message('select', 'pluto'));
  expect(() => selection.select('')).toThrow(message('select', ''));
  expect(() => selection.setHovered('moon')).toThrow(RangeError);
  expect(() => selection.setHovered('moon')).toThrow(
    message('setHovered', 'moon'),
  );
  expect(() => selection.setHovered('pluto')).toThrow(
    message('setHovered', 'pluto'),
  );

  expect(selection.getSelectedId()).toBe('earth');
  expect(selection.getHoveredId()).toBeNull();
  expect(seen).toEqual([{ kind: 'selected', id: 'earth', previousId: null }]);
});

test('same id is a no-op', () => {
  const selection = createSelection(IDS);
  const seen: SelectionEvent[] = [];
  selection.subscribe((event) => {
    seen.push(event);
  });

  selection.select('earth');
  selection.select('earth');
  selection.setHovered('mars');
  selection.setHovered('mars');
  selection.setHovered(null);
  selection.setHovered(null);

  expect(seen).toEqual([
    { kind: 'selected', id: 'earth', previousId: null },
    { kind: 'hover', id: 'mars' },
    { kind: 'hover', id: null },
  ]);
  expect(selection.getSelectedId()).toBe('earth');
  expect(selection.getHoveredId()).toBeNull();
});

test('showSystem always emits', () => {
  const selection = createSelection(IDS);
  const seen: SelectionEvent[] = [];
  selection.subscribe((event) => {
    seen.push(event);
  });

  selection.setHovered('venus');
  selection.showSystem();
  expect(seen).toEqual([
    { kind: 'hover', id: 'venus' },
    { kind: 'system', previousId: null },
  ]);
  expect(selection.getSelectedId()).toBeNull();
  expect(selection.getHoveredId()).toBe('venus');

  selection.select('mars');
  selection.showSystem();
  selection.showSystem();

  expect(seen).toEqual([
    { kind: 'hover', id: 'venus' },
    { kind: 'system', previousId: null },
    { kind: 'selected', id: 'mars', previousId: null },
    { kind: 'system', previousId: 'mars' },
    { kind: 'system', previousId: null },
  ]);
  expect(selection.getSelectedId()).toBeNull();
  expect(selection.getHoveredId()).toBe('venus');
});

test('two quick focus calls keep order', () => {
  const selection = createSelection(IDS);
  const seen: SelectionEvent[] = [];
  selection.subscribe((event) => {
    seen.push(event);
  });

  selection.select('venus');
  selection.select('mars');

  expect(seen).toEqual([
    { kind: 'selected', id: 'venus', previousId: null },
    { kind: 'selected', id: 'mars', previousId: 'venus' },
  ]);
  expect(selection.getSelectedId()).toBe('mars');
});

test('listeners are called synchronously in subscription order', () => {
  const selection = createSelection(IDS);
  const order: string[] = [];
  let returned = false;

  selection.subscribe(() => {
    order.push('first');
    expect(returned).toBe(false);
  });
  selection.subscribe(() => {
    order.push('second');
    expect(returned).toBe(false);
  });
  selection.subscribe(() => {
    order.push('third');
    expect(returned).toBe(false);
  });

  selection.select('jupiter');
  returned = true;

  expect(order).toEqual(['first', 'second', 'third']);
  expect(selection.getSelectedId()).toBe('jupiter');
});

test('select from a listener is queued', () => {
  const selection = createSelection(IDS);
  const seen: { listener: string; id: string; current: string | null }[] = [];
  let depth = 0;
  let maxDepth = 0;

  const watch = (listener: string) => (event: SelectionEvent) => {
    depth += 1;
    maxDepth = Math.max(maxDepth, depth);
    if (event.kind === 'selected') {
      seen.push({
        listener,
        id: event.id,
        current: selection.getSelectedId(),
      });
      if (listener === 'first' && event.id === 'venus') {
        selection.select('mars');
      }
    }
    depth -= 1;
  };

  selection.subscribe(watch('first'));
  selection.subscribe(watch('second'));
  selection.select('venus');

  expect(maxDepth).toBe(1);
  expect(seen).toEqual([
    { listener: 'first', id: 'venus', current: 'venus' },
    { listener: 'second', id: 'venus', current: 'venus' },
    { listener: 'first', id: 'mars', current: 'mars' },
    { listener: 'second', id: 'mars', current: 'mars' },
  ]);

  const followed = createSelection(IDS);
  const kinds: string[] = [];
  followed.subscribe((event) => {
    if (event.kind === 'selected') {
      kinds.push(event.id);
      expect(followed.getSelectedId()).toBe(event.id);
      if (event.id === 'earth') {
        followed.select('earth');
        followed.showSystem();
      }
    } else if (event.kind === 'system') {
      kinds.push('system');
      expect(followed.getSelectedId()).toBeNull();
    }
  });
  followed.select('earth');
  expect(kinds).toEqual(['earth', 'system']);
  expect(followed.getSelectedId()).toBeNull();

  const lateSeen: string[] = [];
  const late = createSelection(IDS);
  late.subscribe((event) => {
    if (event.kind !== 'selected') {
      return;
    }
    lateSeen.push(event.id);
    if (event.id === 'venus') {
      late.subscribe((next) => {
        if (next.kind === 'selected') {
          lateSeen.push(`late:${next.id}`);
        }
      });
      late.select('mars');
    }
  });
  late.select('venus');
  expect(lateSeen).toEqual(['venus', 'mars', 'late:mars']);
});

test('unsubscribe and dispose', () => {
  const selection = createSelection(IDS);
  const seen: string[] = [];
  let unsubscribeFirst: () => void = () => undefined;

  unsubscribeFirst = selection.subscribe(() => {
    seen.push('first');
    unsubscribeFirst();
  });
  const unsubscribeSecond = selection.subscribe(() => {
    seen.push('second');
  });
  selection.subscribe(() => {
    seen.push('third');
  });

  selection.select('venus');
  expect(seen).toEqual(['first', 'second', 'third']);

  seen.length = 0;
  selection.select('mars');
  expect(seen).toEqual(['second', 'third']);

  unsubscribeSecond();
  seen.length = 0;
  selection.select('earth');
  expect(seen).toEqual(['third']);
  expect(selection.getSelectedId()).toBe('earth');

  const during = createSelection(IDS);
  const duringSeen: string[] = [];
  during.subscribe((event) => {
    if (event.kind === 'selected' && event.id === 'venus') {
      during.select('mars');
      during.dispose();
      during.dispose();
      during.select('jupiter');
      during.showSystem();
      during.setHovered('earth');
    }
    duringSeen.push(event.kind === 'selected' ? event.id : event.kind);
  });
  during.subscribe(() => {
    duringSeen.push('second');
  });

  expect(() => during.select('venus')).not.toThrow();
  expect(duringSeen).toEqual(['venus', 'second']);
  expect(during.getSelectedId()).toBe('venus');
  expect(during.getHoveredId()).toBeNull();

  const after = during.subscribe(() => {
    duringSeen.push('late');
  });
  after();
  during.dispose();
  expect(duringSeen).toEqual(['venus', 'second']);

  const broken = createSelection(IDS);
  let failed = false;
  const recovered: string[] = [];
  broken.subscribe(() => {
    if (!failed) {
      failed = true;
      throw new Error('listener failed');
    }
  });
  broken.subscribe((event) => {
    if (event.kind === 'selected') {
      recovered.push(event.id);
    }
  });
  expect(() => broken.select('venus')).toThrow('listener failed');
  expect(broken.getSelectedId()).toBe('venus');
  broken.select('mars');
  expect(broken.getSelectedId()).toBe('mars');
  expect(recovered).toEqual(['mars']);
});
