import { expect, test, vi } from 'vitest';

import {
  computeLabelOrder,
  layoutLabels,
  type LabelLayout,
} from '@core/labelLayout.ts';
import { VIEW_CONFIG } from '@core/viewConfig.ts';

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

const RADII_KM = [
  695700, 2439.7, 6051.8, 6371, 3389.5, 69911, 58232, 25362, 24622,
];

// Kepler t = 0, scale 8·AU^0.5, ecliptic (x, y, north z) → scene (x, north y, −y),
// camera polar 55°, azimuth 0°, distance hypot(75, 95), FOV 45°, 1280×720.
// Rounded to 0.1 px the same way as GOLDEN_SCREEN. Mercury, Earth, and Neptune
// from that projection match GOLDEN_SCREEN.
const JUPITER_SCREEN = { x: 736, y: 321.4, radiusPx: 8.7 };
const SATURN_SCREEN = { x: 748.5, y: 301.6, radiusPx: 7.7 };
const START_LABEL = { width: 50, height: 24 };

test('priority order', () => {
  const order = new Uint16Array(IDS.length);
  const radii = Float64Array.from(RADII_KM);

  computeLabelOrder(order, IDS, radii, 'mars');
  expect(names(order, IDS)).toEqual([
    'mars',
    'sun',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
    'earth',
    'venus',
    'mercury',
  ]);

  computeLabelOrder(order, IDS, radii, 'jupiter');
  expect(names(order, IDS)).toEqual([
    'jupiter',
    'sun',
    'saturn',
    'uranus',
    'neptune',
    'earth',
    'venus',
    'mars',
    'mercury',
  ]);

  computeLabelOrder(order, IDS, radii, 'sun');
  expect(names(order, IDS)[0]).toBe('sun');
  expect(names(order, IDS).filter((id) => id === 'sun')).toEqual(['sun']);

  const tiedIds = ['mercury', 'venus', 'earth'];
  const tiedRadii = Float64Array.from([5, 5, 9]);
  const tied = new Uint16Array(tiedIds.length);
  computeLabelOrder(tied, tiedIds, tiedRadii, null);
  expect(names(tied, tiedIds)).toEqual(['earth', 'mercury', 'venus']);
  computeLabelOrder(tied, tiedIds, tiedRadii, 'venus');
  expect(names(tied, tiedIds)).toEqual(['venus', 'earth', 'mercury']);
});

test('overlapping labels hide lower priority', () => {
  const gap = VIEW_CONFIG.labelGapPx;
  const hidden = placePair(115 + gap - 1);
  expect(hidden.shown[0]).toBe(1);
  expect(hidden.shown[1]).toBe(0);

  const shown = placePair(115 + gap);
  expect(shown.shown[0]).toBe(1);
  expect(shown.shown[1]).toBe(1);

  const selected = placePair(115 + gap - 1, 'mars');
  expect(selected.shown[1]).toBe(1);
  expect(selected.shown[0]).toBe(0);

  const stacked = createLayout(['sun', 'mercury', 'venus'], [1000, 10, 20]);
  for (let index = 0; index < stacked.count; index += 1) {
    stacked.x[index] = 200;
    stacked.y[index] = 200;
    stacked.radiusPx[index] = index === 0 ? 24 : 8;
    stacked.visible[index] = 1;
    stacked.labelWidth[index] = 40;
    stacked.labelHeight[index] = 20;
  }
  stacked.width = 400;
  stacked.height = 400;
  orderAndLayout(stacked, ['sun', 'mercury', 'venus'], null);
  expect(readShown(stacked, ['sun', 'mercury', 'venus'])).toEqual({
    sun: 1,
    mercury: 0,
    venus: 0,
  });

  orderAndLayout(stacked, ['sun', 'mercury', 'venus'], 'mercury');
  expect(readShown(stacked, ['sun', 'mercury', 'venus'])).toEqual({
    sun: 1,
    mercury: 1,
    venus: 0,
  });
});

test('shown labels never overlap', () => {
  const ids = IDS;
  const layout = createLayout(ids, RADII_KM);
  const random = mulberry32(186);
  for (let sample = 0; sample < 500; sample += 1) {
    fillRandom(layout, random, true);
    const selected = Math.floor(random() * ids.length);
    layout.selectedIndex = random() > 0.2 ? selected : -1;
    const selectedId =
      layout.selectedIndex >= 0 ? (ids[layout.selectedIndex] ?? null) : null;
    orderAndLayout(layout, ids, selectedId);
    expectNoLabelOverlap(layout);
    if (
      layout.selectedIndex >= 0 &&
      (layout.visible[layout.selectedIndex] ?? 0) === 1
    ) {
      expect(layout.shown[layout.selectedIndex]).toBe(1);
    }
  }
});

test('invisible body hides label', () => {
  const layout = createLayout(['earth'], [6371]);
  layout.x[0] = 100;
  layout.y[0] = 100;
  layout.radiusPx[0] = 10;
  layout.visible[0] = 0;
  layout.labelWidth[0] = 40;
  layout.labelHeight[0] = 20;
  layout.width = 400;
  layout.height = 300;
  layout.selectedIndex = 0;
  orderAndLayout(layout, ['earth'], 'earth');
  expect(layout.shown[0]).toBe(0);
});

test('other body discs are obstacles', () => {
  const blocked = createLayout(['sun', 'mercury'], [1000, 10]);
  blocked.x[0] = 100;
  blocked.y[0] = 79;
  blocked.radiusPx[0] = 30;
  blocked.x[1] = 100;
  blocked.y[1] = 100;
  blocked.radiusPx[1] = 5;
  blocked.visible[0] = 1;
  blocked.visible[1] = 1;
  blocked.labelWidth[0] = 36;
  blocked.labelHeight[0] = 16;
  blocked.labelWidth[1] = 40;
  blocked.labelHeight[1] = 20;
  blocked.width = 400;
  blocked.height = 400;

  orderAndLayout(blocked, ['sun', 'mercury'], null);
  expect(blocked.shown[1]).toBe(0);
  expect(blocked.shown[0]).toBe(1);
  expect(coversDisc(blocked, 0, 1)).toBe(false);

  orderAndLayout(blocked, ['sun', 'mercury'], 'mercury');
  expect(blocked.shown[1]).toBe(1);
  expect(blocked.side[1]).toBe(0);

  const ids = ['sun', 'jupiter', 'saturn', 'earth', 'mars'];
  const layout = createLayout(ids, [695700, 69911, 58232, 6371, 3389.5]);
  const random = mulberry32(186186);
  for (let sample = 0; sample < 500; sample += 1) {
    fillRandom(layout, random, true);
    const selected = Math.floor(random() * ids.length);
    layout.selectedIndex = selected;
    orderAndLayout(layout, ids, ids[selected] ?? null);
    expectNoLabelOverlap(layout);
    if ((layout.visible[selected] ?? 0) === 1) {
      expect(layout.shown[selected]).toBe(1);
    }
    for (let index = 0; index < layout.count; index += 1) {
      if ((layout.shown[index] ?? 0) === 0 || index === selected) {
        continue;
      }
      for (let other = 0; other < layout.count; other += 1) {
        if (other === index || (layout.visible[other] ?? 0) === 0) {
          continue;
        }
        expect(coversDisc(layout, index, other)).toBe(false);
      }
    }
  }
});

test('Jupiter label does not cover Saturn center at 1280x720', () => {
  const aboveBottom =
    JUPITER_SCREEN.y - JUPITER_SCREEN.radiusPx - VIEW_CONFIG.labelOffsetPx;
  const aboveTop = aboveBottom - START_LABEL.height;
  const aboveLeft = JUPITER_SCREEN.x - START_LABEL.width / 2;
  const aboveRight = aboveLeft + START_LABEL.width;
  expect(SATURN_SCREEN.x).toBeGreaterThanOrEqual(aboveLeft);
  expect(SATURN_SCREEN.x).toBeLessThanOrEqual(aboveRight);
  expect(SATURN_SCREEN.y).toBeGreaterThanOrEqual(aboveTop);
  expect(SATURN_SCREEN.y).toBeLessThanOrEqual(aboveBottom);

  const ids = ['jupiter', 'saturn'];
  const layout = createLayout(ids, [69911, 58232]);
  layout.x[0] = JUPITER_SCREEN.x;
  layout.y[0] = JUPITER_SCREEN.y;
  layout.radiusPx[0] = JUPITER_SCREEN.radiusPx;
  layout.x[1] = SATURN_SCREEN.x;
  layout.y[1] = SATURN_SCREEN.y;
  layout.radiusPx[1] = SATURN_SCREEN.radiusPx;
  layout.visible[0] = 1;
  layout.visible[1] = 1;
  layout.labelWidth[0] = START_LABEL.width;
  layout.labelWidth[1] = START_LABEL.width;
  layout.labelHeight[0] = START_LABEL.height;
  layout.labelHeight[1] = START_LABEL.height;
  layout.width = 1280;
  layout.height = 720;
  orderAndLayout(layout, ids, null);

  expect(layout.shown[0]).toBe(1);
  expect(layout.side[0]).toBe(1);
  const left = layout.outX[0] ?? 0;
  const top = layout.outY[0] ?? 0;
  const right = left + START_LABEL.width;
  const bottom = top + START_LABEL.height;
  const coversCenter =
    SATURN_SCREEN.x >= left &&
    SATURN_SCREEN.x <= right &&
    SATURN_SCREEN.y >= top &&
    SATURN_SCREEN.y <= bottom;
  expect(coversCenter).toBe(false);
  expect(coversDisc(layout, 0, 1)).toBe(false);
});

test('clamps into viewport', () => {
  const layout = createLayout(['earth', 'mars'], [6371, 3389.5]);
  layout.visible[0] = 1;
  layout.visible[1] = 1;
  layout.labelWidth[0] = 40;
  layout.labelHeight[0] = 20;
  layout.labelWidth[1] = 36;
  layout.labelHeight[1] = 18;
  layout.radiusPx[0] = 8;
  layout.radiusPx[1] = 6;
  layout.x[0] = -40;
  layout.y[0] = 30;
  layout.x[1] = 280;
  layout.y[1] = 190;
  layout.width = 300;
  layout.height = 200;
  orderAndLayout(layout, ['earth', 'mars'], null);

  for (let index = 0; index < layout.count; index += 1) {
    expect(layout.shown[index]).toBe(1);
    const left = layout.outX[index] ?? -1;
    const top = layout.outY[index] ?? -1;
    const right = left + (layout.labelWidth[index] ?? 0);
    const bottom = top + (layout.labelHeight[index] ?? 0);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(right).toBeLessThanOrEqual(layout.width);
    expect(bottom).toBeLessThanOrEqual(layout.height);
  }
});

test('invalid input', () => {
  const layout = createLayout(['earth'], [6371]);
  layout.width = 0;
  layout.height = 10;
  expect(() => layoutLabels(layout)).toThrow(RangeError);
  expect(() => layoutLabels(layout)).toThrow(
    'layoutLabels: parameter "width" must be finite and > 0, got 0',
  );

  layout.width = 10;
  layout.height = 0;
  expect(() => layoutLabels(layout)).toThrow(
    'layoutLabels: parameter "height" must be finite and > 0, got 0',
  );

  layout.width = Number.NaN;
  layout.height = 10;
  expect(() => layoutLabels(layout)).toThrow(
    'layoutLabels: parameter "width" must be finite and > 0, got NaN',
  );

  layout.width = -4;
  expect(() => layoutLabels(layout)).toThrow(
    'layoutLabels: parameter "width" must be finite and > 0, got -4',
  );
});

test('does not allocate', () => {
  const layout = createLayout(IDS, RADII_KM);
  fillRandom(layout, mulberry32(1), false);
  layout.selectedIndex = 4;
  orderAndLayout(layout, IDS, 'mars');

  const push = vi.spyOn(Array.prototype, 'push');
  const splice = vi.spyOn(Array.prototype, 'splice');
  const mapSet = vi.spyOn(Map.prototype, 'set');
  push.mockClear();
  splice.mockClear();
  mapSet.mockClear();

  try {
    for (let index = 0; index < 10000; index += 1) {
      layout.x[0] = 80 + (index % 40);
      layout.selectedIndex = index % 2 === 0 ? 4 : -1;
      computeLabelOrder(
        layout.order,
        IDS,
        layoutLabelRadii(layout),
        index % 2 === 0 ? 'mars' : null,
      );
      layoutLabels(layout);
    }
  } finally {
    const pushCalls = push.mock.calls.length;
    const spliceCalls = splice.mock.calls.length;
    const mapSetCalls = mapSet.mock.calls.length;
    push.mockRestore();
    splice.mockRestore();
    mapSet.mockRestore();
    expect(pushCalls).toBe(0);
    expect(spliceCalls).toBe(0);
    expect(mapSetCalls).toBe(0);
  }
});

function placePair(
  marsLeft: number,
  selectedId: string | null = null,
): LabelLayout {
  const layout = createLayout(['jupiter', 'mars'], [69911, 3389.5]);
  const width = 30;
  const height = 16;
  layout.width = 400;
  layout.height = 46;
  layout.visible[0] = 1;
  layout.visible[1] = 1;
  layout.radiusPx[0] = 4;
  layout.radiusPx[1] = 4;
  layout.labelWidth[0] = width;
  layout.labelWidth[1] = width;
  layout.labelHeight[0] = height;
  layout.labelHeight[1] = height;
  layout.x[0] = 100;
  layout.y[0] = 40;
  layout.x[1] = marsLeft + width / 2;
  layout.y[1] = 40;
  orderAndLayout(layout, ['jupiter', 'mars'], selectedId);
  return layout;
}

function createLayout(
  ids: readonly string[],
  radiiKm: ArrayLike<number>,
): LabelLayout {
  const count = ids.length;
  const layout: LabelLayout = {
    count,
    order: new Uint16Array(count),
    x: new Float64Array(count),
    y: new Float64Array(count),
    radiusPx: new Float64Array(count),
    visible: new Uint8Array(count),
    labelWidth: new Float64Array(count),
    labelHeight: new Float64Array(count),
    selectedIndex: -1,
    shown: new Uint8Array(count),
    outX: new Float64Array(count),
    outY: new Float64Array(count),
    side: new Uint8Array(count),
    width: 1280,
    height: 720,
  };
  const stored = new Float64Array(count);
  for (let index = 0; index < count; index += 1) {
    stored[index] = radiiKm[index] ?? 0;
  }
  radiiByLayout.set(layout, stored);
  return layout;
}

const radiiByLayout = new WeakMap<LabelLayout, Float64Array>();

function layoutLabelRadii(layout: LabelLayout): Float64Array {
  return radiiByLayout.get(layout) ?? new Float64Array();
}

function orderAndLayout(
  layout: LabelLayout,
  ids: readonly string[],
  selectedId: string | null,
): void {
  layout.selectedIndex = selectedId === null ? -1 : ids.indexOf(selectedId);
  computeLabelOrder(layout.order, ids, layoutLabelRadii(layout), selectedId);
  layoutLabels(layout);
}

function names(order: Uint16Array, ids: readonly string[]): string[] {
  const result: string[] = [];
  for (let index = 0; index < ids.length; index += 1) {
    result.push(ids[order[index] ?? 0] ?? '');
  }
  return result;
}

function readShown(
  layout: LabelLayout,
  ids: readonly string[],
): Record<string, number> {
  const result: Record<string, number> = {};
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (id !== undefined) {
      result[id] = layout.shown[index] ?? 0;
    }
  }
  return result;
}

function fillRandom(
  layout: LabelLayout,
  random: () => number,
  varyVisibility: boolean,
): void {
  for (let index = 0; index < layout.count; index += 1) {
    layout.x[index] = 40 + random() * (layout.width - 80);
    layout.y[index] = 40 + random() * (layout.height - 80);
    layout.radiusPx[index] = 2 + random() * 16;
    layout.visible[index] = !varyVisibility || random() > 0.2 ? 1 : 0;
    layout.labelWidth[index] = 24 + random() * 36;
    layout.labelHeight[index] = 14 + random() * 12;
    layout.shown[index] = 0;
  }
}

function expectNoLabelOverlap(layout: LabelLayout): void {
  const gap = VIEW_CONFIG.labelGapPx;
  for (let left = 0; left < layout.count; left += 1) {
    if ((layout.shown[left] ?? 0) === 0) {
      continue;
    }
    for (let right = left + 1; right < layout.count; right += 1) {
      if ((layout.shown[right] ?? 0) === 0) {
        continue;
      }
      expect(
        rectsHit(
          layout.outX[left] ?? 0,
          layout.outY[left] ?? 0,
          layout.labelWidth[left] ?? 0,
          layout.labelHeight[left] ?? 0,
          layout.outX[right] ?? 0,
          layout.outY[right] ?? 0,
          layout.labelWidth[right] ?? 0,
          layout.labelHeight[right] ?? 0,
          gap,
        ),
      ).toBe(false);
    }
  }
}

function coversDisc(
  layout: LabelLayout,
  labelIndex: number,
  discIndex: number,
): boolean {
  return discHits(
    layout.outX[labelIndex] ?? 0,
    layout.outY[labelIndex] ?? 0,
    layout.labelWidth[labelIndex] ?? 0,
    layout.labelHeight[labelIndex] ?? 0,
    layout.x[discIndex] ?? 0,
    layout.y[discIndex] ?? 0,
    layout.radiusPx[discIndex] ?? 0,
    VIEW_CONFIG.labelGapPx,
  );
}

function rectsHit(
  leftA: number,
  topA: number,
  widthA: number,
  heightA: number,
  leftB: number,
  topB: number,
  widthB: number,
  heightB: number,
  gap: number,
): boolean {
  const rightA = leftA + widthA;
  const bottomA = topA + heightA;
  const rightB = leftB + widthB;
  const bottomB = topB + heightB;
  if (rightA + gap <= leftB || rightB + gap <= leftA) {
    return false;
  }
  if (bottomA + gap <= topB || bottomB + gap <= topA) {
    return false;
  }
  return true;
}

function discHits(
  left: number,
  top: number,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  gap: number,
): boolean {
  const right = left + width;
  const bottom = top + height;
  const nearestX = centerX < left ? left : centerX > right ? right : centerX;
  const nearestY = centerY < top ? top : centerY > bottom ? bottom : centerY;
  const dx = centerX - nearestX;
  const dy = centerY - nearestY;
  const limit = radius + gap;
  return dx * dx + dy * dy < limit * limit;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
