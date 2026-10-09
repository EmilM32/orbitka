import { VIEW_CONFIG } from './viewConfig.ts';

export const LABEL_SIDE_ABOVE = 0;
export const LABEL_SIDE_BELOW = 1;
/** Beside the body, with a leader line from the disc to the label. */
export const LABEL_SIDE_RIGHT = 2;
export const LABEL_SIDE_LEFT = 3;
/**
 * Sides from 2 on all have a leader line and come in right/left pairs: 2–3
 * level with the body, 4–5 above it, 6–7 below it, then 8–13 the same three
 * pairs twice as far out. Crowded bodies (the inner planets around the Sun
 * at the start) need the extra places to keep their names.
 */
export const LABEL_SIDE_COUNT = 14;

// Per leader pair: vertical direction (-1 up, 0 level, 1 down) and distance
// in units of labelLeaderOffsetPx.
const LEADER_DY = [0, -1, 1, 0, -1, 1] as const;
const LEADER_DISTANCE = [1, 1, 1, 2, 2, 2] as const;

function isRightSide(side: number): boolean {
  return (side - LABEL_SIDE_RIGHT) % 2 === 0;
}

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
  /**
   * Index of each body's parent, -1 without one. A body whose parent is not
   * the Sun is a moon: its label is a candidate only while its planet is
   * selected. Without this array no body counts as a moon.
   */
  parentIndex?: Int16Array;
  shown: Uint8Array;
  outX: Float64Array;
  outY: Float64Array;
  /**
   * `LABEL_SIDE_*`: 0 = above the body, 1 = below, 2 = right, 3 = left (2
   * and 3 with a leader line). Meaningful when `shown` is 1.
   */
  side: Uint8Array;
  width: number;
  height: number;
  /**
   * UI panels the labels stay off: left, top, right, bottom per panel, in
   * the same CSS px as the labels. `obstacleCount` panels are read.
   */
  obstacles?: Float64Array;
  obstacleCount?: number;
  /**
   * Hysteresis: a label shown in the last layout keeps its side while that
   * side stays clear, so it does not jump when another one is barely better.
   * A label beside its body (leader line) moves back above or below only
   * with `labelSideHysteresisPx` to spare and after `labelSideHoldLayouts`
   * runs on its side (counted in `sideHeld`, when given). Reads `shown` and
   * `side` from the last run, so the arrays must carry over between calls.
   */
  keepSides?: boolean;
  /** Runs each label has kept its side; written when `keepSides` is on. */
  sideHeld?: Uint16Array;
  /**
   * Body position at the last run, written when `keepSides` is on. A body
   * that moved more than `labelKeepMaxMovePx` since then does not keep its
   * side (camera flight, fast time).
   */
  lastX?: Float64Array;
  lastY?: Float64Array;
};

const candidate = new Float64Array(2);
const leader = new Float64Array(4);

/**
 * Priority: the selected body, the Sun, the moons of the selected body, the
 * other planets, then the other moons. Inside a group by `radiusKm`
 * descending; equal radii keep the earlier list index. `parentIds` runs
 * parallel to `ids` (null for no parent). Writes indices into `out`.
 */
export function computeLabelOrder(
  out: Uint16Array,
  ids: readonly string[],
  radiiKm: ArrayLike<number>,
  selectedId: string | null,
  parentIds: readonly (string | null)[],
): void {
  const count = ids.length;
  if (parentIds.length !== count) {
    throw new RangeError(
      `computeLabelOrder: parameter "parentIds" must have the same length as ids, got ${parentIds.length}`,
    );
  }
  for (let index = 0; index < count; index += 1) {
    out[index] = index;
  }

  const selectedAt = selectedId === null ? -1 : findId(ids, selectedId, count);
  const sunAt = findId(ids, 'sun', count);
  for (let index = 0; index < count; index += 1) {
    let best = index;
    for (let other = index + 1; other < count; other += 1) {
      if (
        comesBefore(
          out[other] ?? 0,
          out[best] ?? 0,
          ids,
          radiiKm,
          parentIds,
          selectedAt,
          sunAt,
        )
      ) {
        best = other;
      }
    }
    swap(out, index, best);
  }
}

function orderGroup(
  body: number,
  ids: readonly string[],
  parentIds: readonly (string | null)[],
  selectedAt: number,
  sunAt: number,
): number {
  if (body === selectedAt) {
    return 0;
  }
  if (body === sunAt) {
    return 1;
  }
  const parent = parentIds[body] ?? null;
  if (parent === null || parent === 'sun') {
    return 3;
  }
  return selectedAt >= 0 && parent === ids[selectedAt] ? 2 : 4;
}

/**
 * Tries above, below, right, left, then the further leader places. The
 * first candidate that clears accepted labels and every visible disc (its
 * own included, which matters once a label is clamped into the viewport)
 * by `labelGapPx` is shown. A leader candidate is also dropped when its
 * line crosses another visible disc. The selected body and the Sun never
 * lose their label: when every candidate collides they take the first place
 * clear of accepted labels, else above the body. Other labels are hidden
 * then. A moon is a candidate only while its planet is selected.
 */
export function layoutLabels(layout: LabelLayout): void {
  requirePositive('width', layout.width);
  requirePositive('height', layout.height);

  const count = layout.count;
  const gap = VIEW_CONFIG.labelGapPx;
  for (let step = 0; step < count; step += 1) {
    const index = layout.order[step] ?? 0;
    if ((layout.visible[index] ?? 0) === 0 || !isCandidate(layout, index)) {
      layout.shown[index] = 0;
      continue;
    }

    const chosen = chooseSide(layout, index, step, gap);
    if (chosen < 0) {
      layout.shown[index] = 0;
      if (layout.sideHeld !== undefined) {
        layout.sideHeld[index] = 0;
      }
      continue;
    }
    if (layout.keepSides === true && layout.sideHeld !== undefined) {
      const kept =
        (layout.shown[index] ?? 0) === 1 && layout.side[index] === chosen;
      const held = layout.sideHeld[index] ?? 0;
      layout.sideHeld[index] = kept ? Math.min(held + 1, 0xffff) : 0;
    }

    layout.shown[index] = 1;
    layout.side[index] = chosen;
    layout.outX[index] = candidate[0] ?? 0;
    layout.outY[index] = candidate[1] ?? 0;
  }

  if (layout.keepSides === true) {
    for (let index = 0; index < count; index += 1) {
      if (layout.lastX !== undefined) {
        layout.lastX[index] = layout.x[index] ?? 0;
      }
      if (layout.lastY !== undefined) {
        layout.lastY[index] = layout.y[index] ?? 0;
      }
    }
  }
}

function movedFar(layout: LabelLayout, index: number): boolean {
  if (layout.lastX === undefined || layout.lastY === undefined) {
    return false;
  }
  const dx = (layout.x[index] ?? 0) - (layout.lastX[index] ?? 0);
  const dy = (layout.y[index] ?? 0) - (layout.lastY[index] ?? 0);
  const limit = VIEW_CONFIG.labelKeepMaxMovePx;
  return dx * dx + dy * dy > limit * limit;
}

function isCandidate(layout: LabelLayout, index: number): boolean {
  const parent = layout.parentIndex?.[index] ?? -1;
  if (parent < 0 || parent === layout.sunIndex) {
    return true;
  }
  return parent === layout.selectedIndex;
}

/**
 * The leader line of a label: from the disc edge, on the line from the body
 * center to the nearest edge of the pill, to that edge (the left edge for
 * `side` 2, the right edge for 3, the bottom for 0, the top for 1). Writes
 * x1, y1, x2, y2 into `out`.
 */
export function leaderLine(
  out: Float64Array,
  side: number,
  x: number,
  y: number,
  radiusPx: number,
  labelX: number,
  labelY: number,
  labelWidth: number,
  labelHeight: number,
): void {
  if (!Number.isFinite(radiusPx) || radiusPx < 0) {
    throw new RangeError(
      `leaderLine: parameter "radiusPx" must be finite and >= 0, got ${radiusPx}`,
    );
  }
  requireFinite('x', x);
  requireFinite('y', y);
  requireFinite('labelX', labelX);
  requireFinite('labelY', labelY);
  requireFinite('labelWidth', labelWidth);
  requireFinite('labelHeight', labelHeight);

  let endX = labelX + labelWidth / 2;
  let endY = labelY + labelHeight / 2;
  if (side >= LABEL_SIDE_RIGHT) {
    endX = isRightSide(side) ? labelX : labelX + labelWidth;
  } else if (side === LABEL_SIDE_ABOVE) {
    endY = labelY + labelHeight;
  } else {
    endY = labelY;
  }
  const dx = endX - x;
  const dy = endY - y;
  const length = Math.hypot(dx, dy);
  const scale = length > 0 ? Math.min(radiusPx, length) / length : 0;
  out[0] = x + dx * scale;
  out[1] = y + dy * scale;
  out[2] = endX;
  out[3] = endY;
}

/**
 * Top-left of one candidate, clamped into the viewport with a margin of 0.
 * `side` 0 is above the body, 1 below, 2 right, 3 left, 4–13 the further
 * leader places (`LABEL_SIDE_COUNT`). Writes x then y into `out`.
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
  const leaderOffset = VIEW_CONFIG.labelLeaderOffsetPx;
  let left = x - labelWidth / 2;
  let top = y - labelHeight / 2;
  if (side === LABEL_SIDE_ABOVE) {
    top = y - radiusPx - offset - labelHeight;
  } else if (side === LABEL_SIDE_BELOW) {
    top = y + radiusPx + offset;
  } else {
    const pair = Math.floor((side - LABEL_SIDE_RIGHT) / 2);
    const distance = radiusPx + leaderOffset * (LEADER_DISTANCE[pair] ?? 1);
    left = isRightSide(side) ? x + distance : x - distance - labelWidth;
    top = y + (LEADER_DY[pair] ?? 0) * distance - labelHeight / 2;
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

  if (
    layout.keepSides === true &&
    (layout.shown[index] ?? 0) === 1 &&
    !movedFar(layout, index)
  ) {
    const previous = layout.side[index] ?? LABEL_SIDE_ABOVE;
    const held =
      layout.sideHeld === undefined
        ? VIEW_CONFIG.labelSideHoldLayouts
        : (layout.sideHeld[index] ?? 0);
    if (
      previous >= LABEL_SIDE_RIGHT &&
      held >= VIEW_CONFIG.labelSideHoldLayouts
    ) {
      const margin = gap + VIEW_CONFIG.labelSideHysteresisPx;
      for (let side = LABEL_SIDE_ABOVE; side < LABEL_SIDE_RIGHT; side += 1) {
        if (isClear(layout, index, step, side, gap, margin)) {
          return side;
        }
      }
    }
    if (isClear(layout, index, step, previous, gap, gap)) {
      return previous;
    }
  }

  for (let side = LABEL_SIDE_ABOVE; side < LABEL_SIDE_COUNT; side += 1) {
    if (isClear(layout, index, step, side, gap, gap)) {
      return side;
    }
  }

  if (!pinned) {
    return -1;
  }

  // The Sun and the selected body keep a label anyway: the first place clear
  // of accepted labels and panels, even over a small disc, then clear of
  // accepted labels only, else above the body.
  for (let side = LABEL_SIDE_ABOVE; side < LABEL_SIDE_COUNT; side += 1) {
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
      !hitsObstacle(layout, left, top, width, height, gap)
    ) {
      return side;
    }
  }
  for (let side = LABEL_SIDE_ABOVE; side < LABEL_SIDE_COUNT; side += 1) {
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
    if (
      !hitsAccepted(
        layout,
        step,
        candidate[0] ?? 0,
        candidate[1] ?? 0,
        width,
        height,
        gap,
      )
    ) {
      return side;
    }
  }

  labelCandidateOrigin(
    candidate,
    LABEL_SIDE_ABOVE,
    x,
    y,
    radiusPx,
    width,
    height,
    layout.width,
    layout.height,
  );
  return LABEL_SIDE_ABOVE;
}

/**
 * Writes the origin of `side` into `candidate` and reports whether it keeps
 * `gap` from visible discs and `spacing` from accepted labels and panels
 * (and, beside the body, whether its leader misses other discs).
 */
function isClear(
  layout: LabelLayout,
  index: number,
  step: number,
  side: number,
  gap: number,
  spacing: number,
): boolean {
  const width = layout.labelWidth[index] ?? 0;
  const height = layout.labelHeight[index] ?? 0;
  labelCandidateOrigin(
    candidate,
    side,
    layout.x[index] ?? 0,
    layout.y[index] ?? 0,
    layout.radiusPx[index] ?? 0,
    width,
    height,
    layout.width,
    layout.height,
  );
  const left = candidate[0] ?? 0;
  const top = candidate[1] ?? 0;
  return (
    !hitsAccepted(layout, step, left, top, width, height, spacing) &&
    !hitsVisibleDisc(layout, index, left, top, width, height, gap) &&
    !hitsObstacle(layout, left, top, width, height, spacing) &&
    (side < LABEL_SIDE_RIGHT ||
      !leaderHitsOtherDisc(layout, index, side, left, top, width, height))
  );
}

/** True when the rectangle comes closer than `gap` to a UI panel. */
export function hitsObstacle(
  layout: Pick<LabelLayout, 'obstacles' | 'obstacleCount'>,
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
): boolean {
  const obstacles = layout.obstacles;
  const count = layout.obstacleCount ?? 0;
  if (obstacles === undefined || count <= 0) {
    return false;
  }
  const right = left + width;
  const bottom = top + height;
  for (let index = 0; index < count; index += 1) {
    const base = index * 4;
    if (
      rectsHit(
        left,
        top,
        right,
        bottom,
        obstacles[base] ?? 0,
        obstacles[base + 1] ?? 0,
        obstacles[base + 2] ?? 0,
        obstacles[base + 3] ?? 0,
        gap,
      )
    ) {
      return true;
    }
  }
  return false;
}

function leaderHitsOtherDisc(
  layout: LabelLayout,
  index: number,
  side: number,
  left: number,
  top: number,
  width: number,
  height: number,
): boolean {
  leaderLine(
    leader,
    side,
    layout.x[index] ?? 0,
    layout.y[index] ?? 0,
    layout.radiusPx[index] ?? 0,
    left,
    top,
    width,
    height,
  );
  for (let other = 0; other < layout.count; other += 1) {
    if (
      other === index ||
      (layout.visible[other] ?? 0) === 0 ||
      liesOn(layout, index, other)
    ) {
      continue;
    }
    if (
      segmentHitsDisc(
        leader[0] ?? 0,
        leader[1] ?? 0,
        leader[2] ?? 0,
        leader[3] ?? 0,
        layout.x[other] ?? 0,
        layout.y[other] ?? 0,
        layout.radiusPx[other] ?? 0,
      )
    ) {
      return true;
    }
  }
  return false;
}

function segmentHitsDisc(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  let t =
    lengthSquared > 0
      ? ((centerX - x1) * dx + (centerY - y1) * dy) / lengthSquared
      : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nearestX = x1 + dx * t - centerX;
  const nearestY = y1 + dy * t - centerY;
  return nearestX * nearestX + nearestY * nearestY < radius * radius;
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

/**
 * A moon in front of its planet lies on the planet's disc, so its label has
 * to cross that disc: the parent disc is then no obstacle for the moon's
 * label or leader.
 */
function liesOn(layout: LabelLayout, index: number, other: number): boolean {
  if (
    other === index ||
    other === layout.sunIndex ||
    (layout.parentIndex?.[index] ?? -1) !== other
  ) {
    return false;
  }
  const dx = (layout.x[index] ?? 0) - (layout.x[other] ?? 0);
  const dy = (layout.y[index] ?? 0) - (layout.y[other] ?? 0);
  const radius = layout.radiusPx[other] ?? 0;
  return dx * dx + dy * dy < radius * radius;
}

function hitsVisibleDisc(
  layout: LabelLayout,
  index: number,
  left: number,
  top: number,
  width: number,
  height: number,
  gap: number,
): boolean {
  const count = layout.count;
  for (let other = 0; other < count; other += 1) {
    if ((layout.visible[other] ?? 0) === 0 || liesOn(layout, index, other)) {
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
  ids: readonly string[],
  radiiKm: ArrayLike<number>,
  parentIds: readonly (string | null)[],
  selectedAt: number,
  sunAt: number,
): boolean {
  const leftGroup = orderGroup(left, ids, parentIds, selectedAt, sunAt);
  const rightGroup = orderGroup(right, ids, parentIds, selectedAt, sunAt);
  if (leftGroup !== rightGroup) {
    return leftGroup < rightGroup;
  }
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

function swap(out: Uint16Array, left: number, right: number): void {
  if (left === right) {
    return;
  }
  const value = out[left] ?? 0;
  out[left] = out[right] ?? 0;
  out[right] = value;
}

function requireFinite(parameter: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `leaderLine: parameter "${parameter}" must be finite, got ${value}`,
    );
  }
}

function requirePositive(parameter: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `layoutLabels: parameter "${parameter}" must be finite and > 0, got ${value}`,
    );
  }
}
