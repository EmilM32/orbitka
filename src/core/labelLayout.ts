import { VIEW_CONFIG } from './viewConfig.ts';

/** Reused inputs and outputs. Callers allocate the arrays once. */
export type LabelLayout = {
  count: number;
  /** Priority as indices into the parallel arrays. `computeLabelOrder` fills this. */
  order: Uint16Array;
  x: Float64Array;
  y: Float64Array;
  radiusPx: Float64Array;
  visible: Uint8Array;
  labelWidth: Float64Array;
  labelHeight: Float64Array;
  /** Index of the selected body, or -1 when nothing is selected. */
  selectedIndex: number;
  /** Index of the Sun, or -1 when it is not in the list. */
  sunIndex: number;
  shown: Uint8Array;
  outX: Float64Array;
  outY: Float64Array;
  /**
   * 0 = above the body, 1 = below, 2 = right, 3 = left. Meaningful when
   * `shown` is 1.
   */
  side: Uint8Array;
  width: number;
  height: number;
};

const candidate = new Float64Array(2);

/**
 * Priority: selected, then the Sun, then the rest by `radiusKm` descending.
 * Equal radii keep the earlier list index. Writes indices into `out`.
 */
export function computeLabelOrder(
  out: Uint16Array,
  ids: readonly string[],
  radiiKm: ArrayLike<number>,
  selectedId: string | null,
): void {
  const count = ids.length;
  for (let index = 0; index < count; index += 1) {
    out[index] = index;
  }

  let cursor = 0;
  if (selectedId !== null) {
    const selectedAt = findId(ids, selectedId, count);
    if (selectedAt >= 0) {
      swap(out, 0, findValue(out, selectedAt, count));
      cursor = 1;
    }
  }

  const sunAt = findId(ids, 'sun', count);
  if (sunAt >= 0) {
    const orderAt = findValue(out, sunAt, count);
    if (orderAt >= cursor) {
      swap(out, cursor, orderAt);
      cursor += 1;
    }
  }

  for (let index = cursor; index < count; index += 1) {
    let best = index;
    const bestBody = out[best] ?? 0;
    for (let other = index + 1; other < count; other += 1) {
      const otherBody = out[other] ?? 0;
      const currentBest = out[best] ?? bestBody;
      if (comesBefore(otherBody, currentBest, radiiKm)) {
        best = other;
      }
    }
    swap(out, index, best);
  }
}

/**
 * Picks above, then below. The first candidate that clears accepted labels
 * and every visible disc (its own included, which matters once a label is
 * clamped into the viewport) by `labelGapPx` is shown. Pinned labels (the
 * selected body and the Sun) also try right and left, and stay above the
 * body when every candidate collides. Other labels are hidden then.
 */
export function layoutLabels(layout: LabelLayout): void {
  requirePositive('width', layout.width);
  requirePositive('height', layout.height);

  const count = layout.count;
  const gap = VIEW_CONFIG.labelGapPx;
  for (let step = 0; step < count; step += 1) {
    const index = layout.order[step] ?? 0;
    if ((layout.visible[index] ?? 0) === 0) {
      layout.shown[index] = 0;
      continue;
    }

    const chosen = chooseSide(layout, index, step, gap);
    if (chosen < 0) {
      layout.shown[index] = 0;
      continue;
    }

    layout.shown[index] = 1;
    layout.side[index] = chosen;
    layout.outX[index] = candidate[0] ?? 0;
    layout.outY[index] = candidate[1] ?? 0;
  }
}

/**
 * Top-left of one candidate, clamped into the viewport with a margin of 0.
 * `side` 0 is above the body, 1 below, 2 right, 3 left. Writes x then y
 * into `out`.
 */
export function labelCandidateOrigin(
  out: Float64Array,
  side: number,
  x: number,
  y: number,
  radiusPx: number,
  labelWidth: number,
  labelHeight: number,
  viewWidth: number,
  viewHeight: number,
): void {
  const offset = VIEW_CONFIG.labelOffsetPx;
  let left = x - labelWidth / 2;
  let top = y - labelHeight / 2;
  if (side === 0) {
    top = y - radiusPx - offset - labelHeight;
  } else if (side === 1) {
    top = y + radiusPx + offset;
  } else if (side === 2) {
    left = x + radiusPx + offset;
  } else {
    left = x - radiusPx - offset - labelWidth;
  }
  if (left < 0) {
    left = 0;
  }
  if (top < 0) {
    top = 0;
  }
  const maxLeft = viewWidth - labelWidth;
  const maxTop = viewHeight - labelHeight;
  if (left > maxLeft) {
    left = maxLeft;
  }
  if (top > maxTop) {
    top = maxTop;
  }
  if (left < 0) {
    left = 0;
  }
  if (top < 0) {
    top = 0;
  }
  out[0] = left;
  out[1] = top;
}

function chooseSide(
  layout: LabelLayout,
  index: number,
  step: number,
  gap: number,
): number {
  const width = layout.labelWidth[index] ?? 0;
  const height = layout.labelHeight[index] ?? 0;
  const x = layout.x[index] ?? 0;
  const y = layout.y[index] ?? 0;
  const radiusPx = layout.radiusPx[index] ?? 0;
  const pinned = index === layout.selectedIndex || index === layout.sunIndex;
  const lastSide = pinned ? 3 : 1;

  for (let side = 0; side <= lastSide; side += 1) {
    labelCandidateOrigin(
      candidate,
      side,
      x,
      y,
      radiusPx,
      width,
      height,
      layout.width,
      layout.height,
    );
    const left = candidate[0] ?? 0;
    const top = candidate[1] ?? 0;
    if (
      !hitsAccepted(layout, step, left, top, width, height, gap) &&
      !hitsVisibleDisc(layout, left, top, width, height, gap)
    ) {
      return side;
    }
  }

  if (!pinned) {
    return -1;
  }

  labelCandidateOrigin(
    candidate,
    0,
    x,
    y,
    radiusPx,
    width,
    height,
    layout.width,
    layout.height,
  );
  return 0;
}

function hitsAccepted(
  layout: LabelLayout,
  step: number,
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
): boolean {
  const right = left + width;
  const bottom = top + height;
  for (let earlier = 0; earlier < step; earlier += 1) {
    const other = layout.order[earlier] ?? 0;
    if ((layout.shown[other] ?? 0) === 0) {
      continue;
    }
    const otherLeft = layout.outX[other] ?? 0;
    const otherTop = layout.outY[other] ?? 0;
    const otherRight = otherLeft + (layout.labelWidth[other] ?? 0);
    const otherBottom = otherTop + (layout.labelHeight[other] ?? 0);
    if (
      rectsHit(
        left,
        top,
        right,
        bottom,
        otherLeft,
        otherTop,
        otherRight,
        otherBottom,
        gap,
      )
    ) {
      return true;
    }
  }
  return false;
}

function hitsVisibleDisc(
  layout: LabelLayout,
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
): boolean {
  const count = layout.count;
  for (let other = 0; other < count; other += 1) {
    if ((layout.visible[other] ?? 0) === 0) {
      continue;
    }
    if (
      rectHitsDisc(
        left,
        top,
        width,
        height,
        layout.x[other] ?? 0,
        layout.y[other] ?? 0,
        layout.radiusPx[other] ?? 0,
        gap,
      )
    ) {
      return true;
    }
  }
  return false;
}

function rectsHit(
  leftA: number,
  topA: number,
  rightA: number,
  bottomA: number,
  leftB: number,
  topB: number,
  rightB: number,
  bottomB: number,
  gap: number,
): boolean {
  if (rightA + gap <= leftB || rightB + gap <= leftA) {
    return false;
  }
  if (bottomA + gap <= topB || bottomB + gap <= topA) {
    return false;
  }
  return true;
}

/** True when the rectangle comes closer than `gap` to the disc. */
export function rectHitsDisc(
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

function comesBefore(
  left: number,
  right: number,
  radiiKm: ArrayLike<number>,
): boolean {
  const leftRadius = radiiKm[left] ?? 0;
  const rightRadius = radiiKm[right] ?? 0;
  if (leftRadius !== rightRadius) {
    return leftRadius > rightRadius;
  }
  return left < right;
}

function findId(ids: readonly string[], id: string, count: number): number {
  for (let index = 0; index < count; index += 1) {
    if (ids[index] === id) {
      return index;
    }
  }
  return -1;
}

function findValue(out: Uint16Array, value: number, count: number): number {
  for (let index = 0; index < count; index += 1) {
    if (out[index] === value) {
      return index;
    }
  }
  return 0;
}

function swap(out: Uint16Array, left: number, right: number): void {
  if (left === right) {
    return;
  }
  const value = out[left] ?? 0;
  out[left] = out[right] ?? 0;
  out[right] = value;
}

function requirePositive(parameter: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `layoutLabels: parameter "${parameter}" must be finite and > 0, got ${value}`,
    );
  }
}
