import { PerspectiveCamera, Vector3 } from 'three';
import { expect, test, vi } from 'vitest';

import { CAMERA_CONFIG } from '@core/cameraConfig.ts';
import {
  dampingFraction,
  startDistance,
  wrapAzimuth,
  type CameraPose,
} from '@core/cameraMath.ts';
import {
  createCameraController,
  type CameraController,
  type CameraControllerState,
  type ReducedMotionSource,
} from '@render/cameraController.ts';

const alloc = vi.hoisted(() => ({ vector3: 0, spherical: 0 }));

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');

  class CountingVector3 extends actual.Vector3 {
    constructor(...args: ConstructorParameters<typeof actual.Vector3>) {
      alloc.vector3 += 1;
      super(...args);
    }
  }

  class CountingSpherical extends actual.Spherical {
    constructor(...args: ConstructorParameters<typeof actual.Spherical>) {
      alloc.spherical += 1;
      super(...args);
    }
  }

  return {
    ...actual,
    Vector3: CountingVector3,
    Spherical: CountingSpherical,
  };
});

const DEG = Math.PI / 180;
const POLAR_MIN = (CAMERA_CONFIG.polarMinDeg * Math.PI) / 180;
const POLAR_MAX = (CAMERA_CONFIG.polarMaxDeg * Math.PI) / 180;

type FakeMotion = ReducedMotionSource & {
  setMatches(matches: boolean): void;
  subscribes: number;
  unsubscribes: number;
};

function fakeMotion(matches = false): FakeMotion {
  let current = matches;
  const listeners: Array<() => void> = [];
  const motion: FakeMotion = {
    get matches() {
      return current;
    },
    setMatches(next: boolean) {
      current = next;
      for (let index = 0; index < listeners.length; index += 1) {
        listeners[index]?.();
      }
    },
    subscribe(listener: () => void) {
      motion.subscribes += 1;
      listeners.push(listener);
      return () => {
        motion.unsubscribes += 1;
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    },
    subscribes: 0,
    unsubscribes: 0,
  };
  return motion;
}

function setup(aspect = 16 / 9, matches = false) {
  const camera = new PerspectiveCamera(45, aspect, 0.1, 2000);
  const motion = fakeMotion(matches);
  const controller = createCameraController({
    camera,
    reducedMotion: motion,
  });
  return { camera, motion, controller };
}

function readPose(controller: CameraController): CameraPose {
  return controller.getPose({
    azimuth: 0,
    polar: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
}

function readState(controller: CameraController): CameraControllerState {
  return controller.getState({
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
}

function expectRangeError(run: () => void, message: string): void {
  expect(run).toThrow(RangeError);
  expect(run).toThrow(message);
}

test('cameraController › rotateBy and zoomBy apply immediately when not smooth', () => {
  const { camera, controller } = setup();
  const before = readPose(controller);
  controller.rotateBy(Math.PI / 2, 0, false);
  const rotated = readPose(controller);
  expect(rotated.azimuth).toBeCloseTo(before.azimuth + Math.PI / 2, 12);
  expect(rotated.polar).toBeCloseTo(before.polar, 12);

  const distance = Math.hypot(75, 95);
  const polar = 55 * DEG;
  expect(camera.position.x).toBeCloseTo(distance * Math.sin(polar), 6);
  expect(camera.position.y).toBeCloseTo(distance * Math.cos(polar), 6);
  expect(camera.position.z).toBeCloseTo(0, 6);
  const direction = new Vector3();
  camera.getWorldDirection(direction);
  const towardTarget = new Vector3(0, 0, 0).sub(camera.position).normalize();
  expect(direction.distanceTo(towardTarget)).toBeLessThanOrEqual(1e-8);

  controller.zoomBy(0.9, false);
  expect(readPose(controller).distance).toBeCloseTo(before.distance * 0.9, 8);
  expect(camera.position.length()).toBeCloseTo(before.distance * 0.9, 6);
});

test('cameraController › setPose applies pose without damping', () => {
  const { controller } = setup();
  controller.rotateBy(1, 0.2, true);
  const start = startDistance(16 / 9);
  controller.setPose({
    azimuth: 1e9,
    polar: 0,
    distance: start,
    targetX: 1,
    targetY: 2,
    targetZ: 3,
  });
  const pose = readPose(controller);
  expect(pose.azimuth).toBeCloseTo(wrapAzimuth(1e9), 8);
  expect(pose.azimuth).toBeGreaterThan(-Math.PI);
  expect(pose.azimuth).toBeLessThanOrEqual(Math.PI);
  expect(pose.polar).toBeCloseTo(POLAR_MIN, 12);
  expect(pose.distance).toBeCloseTo(start, 8);
  expect(pose.targetX).toBe(1);
  expect(pose.targetY).toBe(2);
  expect(pose.targetZ).toBe(3);

  const parked = readPose(controller);
  controller.update(1 / 60);
  const after = readPose(controller);
  expect(after.azimuth).toBeCloseTo(parked.azimuth, 12);
  expect(after.polar).toBeCloseTo(parked.polar, 12);
  expect(after.distance).toBeCloseTo(parked.distance, 12);

  controller.setPose({
    azimuth: 0,
    polar: Math.PI,
    distance: start,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  expect(readPose(controller).polar).toBeCloseTo(POLAR_MAX, 12);
});

test('cameraController › soft clamp outside limits', () => {
  const { controller } = setup();
  const start = startDistance(16 / 9);
  controller.zoomBy(1.3, false);
  expect(readPose(controller).distance).toBeCloseTo(start * 1.3, 8);
  controller.setLimitsForBody(1);

  controller.zoomBy(1.1, false);
  expect(readPose(controller).distance).toBeCloseTo(start * 1.3, 8);

  controller.zoomBy(0.9, false);
  const approached = start * 1.3 * 0.9;
  expect(readPose(controller).distance).toBeCloseTo(approached, 8);
  expect(readPose(controller).distance).toBeGreaterThan(start);

  controller.setPose({
    azimuth: 0,
    polar: 55 * DEG,
    distance: start * 1.5,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  expect(readPose(controller).distance).toBeCloseTo(approached, 8);

  controller.setPose({
    azimuth: 0,
    polar: 55 * DEG,
    distance: start * 1.1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  expect(readPose(controller).distance).toBeCloseTo(start * 1.1, 8);
  expect(readPose(controller).distance).not.toBeCloseTo(start, 6);
});

test('cameraController › invalid input throws RangeError', () => {
  const { controller } = setup();
  const pose = readPose(controller);

  expectRangeError(
    () => controller.rotateBy(Number.NaN, 0, false),
    'rotateBy: parameter "dAzimuth" must be finite, got NaN',
  );
  expectRangeError(
    () => controller.rotateBy(0, Number.POSITIVE_INFINITY, false),
    'rotateBy: parameter "dPolar" must be finite, got Infinity',
  );
  expectRangeError(
    () => controller.zoomBy(0, false),
    'zoomBy: parameter "factor" must be finite and > 0, got 0',
  );
  expectRangeError(
    () => controller.zoomBy(Number.NaN, false),
    'zoomBy: parameter "factor" must be finite and > 0, got NaN',
  );
  expectRangeError(
    () => controller.setTarget(Number.NaN, 0, 0),
    'setTarget: parameter "x" must be finite, got NaN',
  );
  expectRangeError(
    () => controller.setAspect(0),
    'setAspect: parameter "aspect" must be finite and > 0, got 0',
  );
  expectRangeError(
    () => controller.setLimitsForBody(-1),
    'setLimitsForBody: parameter "displayRadius" must be finite and > 0, got -1',
  );
  expectRangeError(
    () =>
      controller.setPose({
        ...pose,
        distance: Number.POSITIVE_INFINITY,
      }),
    'setPose: parameter "distance" must be finite, got Infinity',
  );
  expectRangeError(
    () => controller.update(-1),
    'update: parameter "dtSeconds" must be finite and >= 0, got -1',
  );
  expectRangeError(
    () => controller.update(Number.NaN),
    'update: parameter "dtSeconds" must be finite and >= 0, got NaN',
  );

  const after = readPose(controller);
  expect(after.distance).toBeCloseTo(pose.distance, 12);
  expect(after.azimuth).toBeCloseTo(pose.azimuth, 12);
});

test('cameraController › user input notifications', () => {
  const { controller } = setup();
  let calls = 0;
  const unsubscribe = controller.onUserInput(() => {
    calls += 1;
  });

  controller.rotateBy(0.1, 0, false);
  controller.zoomBy(0.9, true);
  expect(calls).toBe(2);
  controller.rotateBy(0.2, 0, true, false);
  controller.zoomBy(1.1, false, false);
  expect(calls).toBe(2);
  controller.notifyUserInput();
  expect(calls).toBe(3);
  controller.rotateBy(0, 0, true);
  controller.zoomBy(1, true);
  expect(calls).toBe(3);

  const pose = readPose(controller);
  controller.setPose(pose);
  controller.setTarget(1, 2, 3);
  controller.setAspect(1);
  controller.setLimitsForBody(1);
  controller.setLimitsForBody(null);
  controller.update(1 / 60);
  expect(calls).toBe(3);

  unsubscribe();
  controller.rotateBy(0.1, 0, false);
  controller.notifyUserInput();
  expect(calls).toBe(3);
});

test('cameraController › damping decays 0.08 per frame', () => {
  const fine = setup();
  const coarse = setup();
  const before = readPose(fine.controller).azimuth;
  fine.controller.rotateBy(1, 0, true);
  coarse.controller.rotateBy(1, 0, true);
  expect(readPose(fine.controller).azimuth).toBeCloseTo(before, 12);

  for (let frame = 0; frame < 36; frame += 1) {
    fine.controller.update(1 / 60);
  }
  for (let frame = 0; frame < 18; frame += 1) {
    coarse.controller.update(1 / 30);
  }

  const applied = readPose(fine.controller).azimuth - before;
  const remaining = 1 - applied;
  expect(remaining).toBeLessThanOrEqual(0.05);
  expect(remaining).toBeGreaterThan(0);
  expect(applied).toBeCloseTo(1 - 0.92 ** 36, 8);
  expect(readPose(coarse.controller).azimuth).toBeCloseTo(
    readPose(fine.controller).azimuth,
    8,
  );

  const parked = setup();
  parked.controller.rotateBy(0.5, 0, true);
  const held = readPose(parked.controller).azimuth;
  parked.controller.update(0);
  expect(readPose(parked.controller).azimuth).toBeCloseTo(held, 12);
  parked.controller.update(0.1);
  const stepped = readPose(parked.controller).azimuth - held;
  expect(stepped).toBeCloseTo(0.5 * dampingFraction(0.1), 8);
  expect(Number.isFinite(readPose(parked.controller).distance)).toBe(true);
});

test('cameraController › zoom limits', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    const { controller } = setup(aspect);
    const start = startDistance(aspect);
    const wideOpen = readState(controller);
    expect(wideOpen.distanceMin).toBeCloseTo(0.2 * start, 8);
    expect(wideOpen.distanceMax).toBeCloseTo(1.5 * start, 8);

    controller.zoomBy(0.01, false);
    expect(readPose(controller).distance).toBeCloseTo(0.2 * start, 6);
    controller.zoomBy(100, false);
    expect(readPose(controller).distance).toBeCloseTo(1.5 * start, 6);

    const radius = 2;
    controller.setLimitsForBody(radius);
    const body = readState(controller);
    expect(body.distanceMin).toBeCloseTo(2.5 * radius, 8);
    expect(body.distanceMax).toBeCloseTo(start, 8);
    controller.setLimitsForBody(null);
    expect(readState(controller).distanceMax).toBeCloseTo(1.5 * start, 8);
  }
});

test('cameraController › polar clamp', () => {
  const { controller } = setup();
  controller.rotateBy(0, 100, false);
  expect(readPose(controller).polar).toBeCloseTo(POLAR_MAX, 12);
  controller.rotateBy(0, -100, false);
  expect(readPose(controller).polar).toBeCloseTo(POLAR_MIN, 12);

  controller.setPose({
    azimuth: 0.4,
    polar: POLAR_MAX - 0.01,
    distance: startDistance(16 / 9),
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  controller.rotateBy(0.5, 2, true);
  for (let frame = 0; frame < 40; frame += 1) {
    controller.update(1 / 60);
  }
  const stuck = readPose(controller);
  expect(stuck.polar).toBeCloseTo(POLAR_MAX, 12);
  expect(stuck.azimuth).toBeGreaterThan(0.4);
  controller.update(1 / 60);
  expect(readPose(controller).polar).toBeCloseTo(POLAR_MAX, 12);
});

test('cameraController › reduced motion disables damping', () => {
  const immediate = setup(16 / 9, true);
  const before = readPose(immediate.controller).azimuth;
  immediate.controller.rotateBy(0.4, 0, true);
  expect(readPose(immediate.controller).azimuth).toBeCloseTo(before + 0.4, 12);
  immediate.controller.update(1 / 60);
  expect(readPose(immediate.controller).azimuth).toBeCloseTo(before + 0.4, 12);

  const switching = setup();
  const start = readPose(switching.controller).azimuth;
  switching.controller.rotateBy(1, 0, true);
  switching.controller.update(1 / 60);
  expect(readPose(switching.controller).azimuth).toBeLessThan(start + 1);
  switching.motion.setMatches(true);
  expect(readPose(switching.controller).azimuth).toBeCloseTo(start + 1, 8);
  switching.controller.update(1 / 60);
  expect(readPose(switching.controller).azimuth).toBeCloseTo(start + 1, 8);
});

test('cameraController › resize keeps pose', () => {
  const { camera, controller } = setup(16 / 9);
  controller.rotateBy(0.3, 0.05, false);
  const before = readPose(controller);
  controller.setAspect(9 / 16);
  const after = readPose(controller);
  const ratio = startDistance(9 / 16) / startDistance(16 / 9);
  expect(after.azimuth).toBeCloseTo(before.azimuth, 12);
  expect(after.polar).toBeCloseTo(before.polar, 12);
  expect(after.distance).toBeCloseTo(before.distance * ratio, 8);
  expect(camera.aspect).toBeCloseTo(9 / 16, 12);

  const again = readPose(controller).distance;
  controller.setAspect(9 / 16);
  expect(readPose(controller).distance).toBeCloseTo(again, 12);
});

test('cameraController › update does not allocate', () => {
  const { controller } = setup();
  controller.rotateBy(2, 0.2, true);
  controller.zoomBy(1.2, true);
  const pose = {
    azimuth: 0,
    polar: 0,
    distance: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  const state = {
    azimuthDeg: 0,
    polarDeg: 0,
    distance: 0,
    distanceMin: 0,
    distanceMax: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  };
  controller.update(1 / 60);
  controller.getPose(pose);
  controller.getState(state);
  const vector3 = alloc.vector3;
  const spherical = alloc.spherical;

  for (let frame = 0; frame < 1000; frame += 1) {
    controller.update(1 / 60);
    controller.getPose(pose);
    controller.getState(state);
  }

  expect(alloc.vector3).toBe(vector3);
  expect(alloc.spherical).toBe(spherical);
});

test('cameraController › dispose is idempotent', () => {
  const { camera, motion, controller } = setup();
  expect(motion.subscribes).toBe(1);
  controller.rotateBy(1, 0, true);
  const position = camera.position.clone();
  controller.dispose();
  expect(motion.unsubscribes).toBe(1);

  controller.rotateBy(Number.NaN, Number.NaN, true);
  controller.zoomBy(Number.NaN, true);
  controller.setAspect(Number.NaN);
  controller.setTarget(Number.NaN, 0, 0);
  controller.setLimitsForBody(Number.NaN);
  controller.setPose({
    azimuth: Number.NaN,
    polar: 0,
    distance: 1,
    targetX: 0,
    targetY: 0,
    targetZ: 0,
  });
  controller.update(Number.NaN);
  controller.notifyUserInput();
  controller.dispose();

  expect(motion.unsubscribes).toBe(1);
  expect(camera.position.distanceTo(position)).toBe(0);
  motion.setMatches(true);
  expect(camera.position.distanceTo(position)).toBe(0);
});

test('cameraController › onCameraInput reports rotate and zoom', () => {
  const { controller } = setup();
  const inputs: Array<{ kind: string; amount: number }> = [];
  const unsubscribe = controller.onCameraInput((input) => {
    inputs.push({
      kind: input.kind,
      amount: input.kind === 'rotate' ? input.deg : input.ratio,
    });
  });

  controller.rotateBy(5 * DEG, 0, false);
  controller.zoomBy(0.9, false);
  // The pointer input calls with notify = false; it still counts.
  controller.rotateBy(-2 * DEG, 3 * DEG, true, false);
  controller.zoomBy(1.1, true, false);
  expect(inputs.map((entry) => entry.kind)).toEqual([
    'rotate',
    'zoom',
    'rotate',
    'zoom',
  ]);
  expect(inputs[0]?.amount).toBeCloseTo(5, 9);
  expect(inputs[1]?.amount).toBeCloseTo(0.1, 9);
  expect(inputs[2]?.amount).toBeCloseTo(5, 9);
  expect(inputs[3]?.amount).toBeCloseTo(0.1, 9);

  // No change, flights (setPose) and frames emit nothing.
  controller.rotateBy(0, 0, false);
  controller.zoomBy(1, false);
  controller.setPose(readPose(controller));
  controller.update(1 / 60);
  controller.notifyUserInput();
  expect(inputs).toHaveLength(4);

  unsubscribe();
  controller.rotateBy(DEG, 0, false);
  expect(inputs).toHaveLength(4);

  const second = vi.fn();
  controller.onCameraInput(second);
  controller.dispose();
  controller.rotateBy(DEG, 0, false);
  expect(second).not.toHaveBeenCalled();
});
