import { createClock, daysFromDate } from '@core/clock.ts';
import { isStartPaused, parseStartDays } from '@core/startParams.ts';
import { bodies } from '@data/bodies.ts';
import { createBodyAnimator } from '@render/animateBodies.ts';
import { createMoonAnimator } from '@render/animateMoons.ts';
import { createRotationAnimator } from '@render/rotateBodies.ts';

import type { SceneRig } from './wireScene.ts';

/** The simulation clock and the animators that place bodies by its time. */
export function wireTime(sceneRig: SceneRig, search: string) {
  const { meshes } = sceneRig.bodyView;
  const clock = createClock({
    startDays: parseStartDays(search, daysFromDate(new Date())),
  });
  if (isStartPaused(search)) {
    clock.pause();
  }
  const animator = createBodyAnimator(bodies, meshes, sceneRig.orbitLines);
  const moonAnimator = createMoonAnimator(bodies, meshes);
  const rotationAnimator = createRotationAnimator(bodies, meshes);
  const placeBodies = (): void => {
    animator.update(clock.days);
    moonAnimator.update(clock.days, clock.daysPerSecond);
    rotationAnimator.update(clock.days, clock.daysPerSecond);
  };
  placeBodies();

  return {
    clock,
    /** Advances the clock, then moves and turns the bodies. */
    update(dtSeconds: number): void {
      clock.tick(dtSeconds);
      placeBodies();
    },
  };
}

export type TimeRig = ReturnType<typeof wireTime>;
