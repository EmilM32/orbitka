import { CAMERA_CONFIG } from './cameraConfig.ts';
import type { BodyScreenFrame } from './bodyScreenFrame.ts';

/**
 * Disc hits win (nearest camera depth). Otherwise the nearest center inside
 * `max(hit radius, radiusPx)` wins, with depth as the tie break.
 * `pointerType` other than `touch` uses the mouse radius.
 */
export function pickBody(
  frame: BodyScreenFrame,
  x: number,
  y: number,
  pointerType: string,
): string | null {
  if (frame.count === 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const hitPx =
    pointerType === 'touch'
      ? CAMERA_CONFIG.hitRadiusTouchPx
      : CAMERA_CONFIG.hitRadiusMousePx;
  let discIndex = -1;
  let discDepth = Number.POSITIVE_INFINITY;
  let nearIndex = -1;
  let nearDistance = Number.POSITIVE_INFINITY;
  let nearDepth = Number.POSITIVE_INFINITY;

  for (let index = 0; index < frame.count; index += 1) {
    if (frame.visible[index] === 0) {
      continue;
    }

    const dx = frame.x[index] - x;
    const dy = frame.y[index] - y;
    const distance = Math.hypot(dx, dy);
    const radius = frame.radiusPx[index] ?? 0;
    const depth = frame.depth[index] ?? Number.POSITIVE_INFINITY;
    if (distance <= radius && depth < discDepth) {
      discDepth = depth;
      discIndex = index;
    }

    const limit = radius > hitPx ? radius : hitPx;
    if (distance > limit) {
      continue;
    }
    if (
      distance < nearDistance ||
      (distance === nearDistance && depth < nearDepth)
    ) {
      nearDistance = distance;
      nearDepth = depth;
      nearIndex = index;
    }
  }

  if (discIndex >= 0) {
    return frame.ids[discIndex] ?? null;
  }
  if (nearIndex >= 0) {
    return frame.ids[nearIndex] ?? null;
  }
  return null;
}
